import type { AppSnapshot, FileFolder, TypstDocumentFile } from "../app/appState";
import {
  buildProjectWorkspaceEntries,
  normalizeWorkspacePath
} from "../workspace/workspaceTree";
import { InMemoryFs } from "just-bash";
import type {
  BufferEncoding,
  CpOptions,
  FileContent,
  FsStat,
  IFileSystem,
  MkdirOptions,
  RmOptions
} from "just-bash";

interface ReadFileOptions {
  encoding?: BufferEncoding | null;
}

interface WriteFileOptions {
  encoding?: BufferEncoding;
}

interface DirentEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

const PROJECT_ROOT = "/project";
const FIGURES_PREFIX = "figures/";

export function createProjectFsAdapter(options: {
  getSnapshot: () => AppSnapshot;
  updateSnapshot: (updater: (snapshot: AppSnapshot) => AppSnapshot) => void;
}): IFileSystem {
  const fs = new InMemoryFs(buildInitialFiles(options.getSnapshot()));
  return new ProjectFsAdapter(fs, options.getSnapshot, options.updateSnapshot);
}

function buildInitialFiles(snapshot: AppSnapshot): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {};
  for (const entry of buildProjectWorkspaceEntries(snapshot)) {
    const absolutePath = toAbsoluteProjectPath(entry.path);
    if (entry.kind === "folder") {
      continue;
    }
    files[absolutePath] = entry.content ?? "";
  }
  return files;
}

class ProjectFsAdapter implements IFileSystem {
  constructor(
    private readonly inner: InMemoryFs,
    private readonly getSnapshot: () => AppSnapshot,
    private readonly updateSnapshot: (updater: (snapshot: AppSnapshot) => AppSnapshot) => void
  ) {}

  readFile(path: string, options?: ReadFileOptions | BufferEncoding): Promise<string> {
    return this.inner.readFile(path, options);
  }

  readFileBuffer(path: string): Promise<Uint8Array> {
    return this.inner.readFileBuffer(path);
  }

  async writeFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding) {
    this.assertWritablePath(path);
    await this.inner.writeFile(path, content, options);
    this.syncSnapshot();
  }

  async appendFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding) {
    this.assertWritablePath(path);
    await this.inner.appendFile(path, content, options);
    this.syncSnapshot();
  }

  exists(path: string): Promise<boolean> {
    return this.inner.exists(path);
  }

  stat(path: string): Promise<FsStat> {
    return this.inner.stat(path);
  }

  lstat(path: string): Promise<FsStat> {
    return this.inner.lstat(path);
  }

  async mkdir(path: string, options?: MkdirOptions) {
    this.assertWritablePath(path);
    await this.inner.mkdir(path, options);
    this.syncSnapshot();
  }

  readdir(path: string): Promise<string[]> {
    return this.inner.readdir(path);
  }

  readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    return this.inner.readdirWithFileTypes(path);
  }

  async rm(path: string, options?: RmOptions) {
    this.assertWritablePath(path);
    await this.inner.rm(path, options);
    this.syncSnapshot();
  }

  async cp(src: string, dest: string, options?: CpOptions) {
    this.assertWritablePath(dest);
    await this.inner.cp(src, dest, options);
    this.syncSnapshot();
  }

  async mv(src: string, dest: string) {
    this.assertWritablePath(src);
    this.assertWritablePath(dest);
    await this.inner.mv(src, dest);
    this.syncSnapshot();
  }

  resolvePath(base: string, path: string): string {
    return this.inner.resolvePath(base, path);
  }

  getAllPaths(): string[] {
    return this.inner.getAllPaths();
  }

  chmod(path: string, mode: number): Promise<void> {
    return this.inner.chmod(path, mode);
  }

  symlink(target: string, linkPath: string): Promise<void> {
    this.assertWritablePath(linkPath);
    return this.inner.symlink(target, linkPath);
  }

  link(existingPath: string, newPath: string): Promise<void> {
    this.assertWritablePath(newPath);
    return this.inner.link(existingPath, newPath);
  }

  readlink(path: string): Promise<string> {
    return this.inner.readlink(path);
  }

  realpath(path: string): Promise<string> {
    return this.inner.realpath(path);
  }

  utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    return this.inner.utimes(path, atime, mtime);
  }

  private assertWritablePath(path: string) {
    const relativePath = toRelativeProjectPath(path);
    if (relativePath === null) {
      throw new Error("Browser Shell can only access files inside /project.");
    }
    if (relativePath === "figures" || relativePath.startsWith(FIGURES_PREFIX)) {
      throw new Error("Figure assets are read-only in Browser Shell.");
    }
  }

  private syncSnapshot() {
    const entries = collectWorkspaceEntries(this.inner.getAllPaths(), this.inner);
    this.updateSnapshot((snapshot) => {
      const now = new Date().toISOString();
      const previousByPath = new Map(snapshot.project.documents.map((document) => [document.name, document]));
      const previousFolders = new Map(snapshot.project.folders.map((folder) => [folder.name, folder]));

      const documents: TypstDocumentFile[] = entries.files.map((entry) => {
        const previous = previousByPath.get(entry.path);
        return {
          id: previous?.id ?? crypto.randomUUID(),
          name: entry.path,
          content: entry.content,
          updatedAt: previous?.updatedAt ?? now
        };
      });

      const folders: FileFolder[] = entries.folders.map((path) => {
        const previous = previousFolders.get(path);
        return {
          id: previous?.id ?? crypto.randomUUID(),
          name: path,
          updatedAt: previous?.updatedAt ?? now
        };
      });

      const activeDocumentExists = documents.some(
        (document) => document.id === snapshot.project.activeDocumentId
      );

      return {
        ...snapshot,
        project: {
          ...snapshot.project,
          documents,
          folders,
          activeDocumentId: activeDocumentExists
            ? snapshot.project.activeDocumentId
            : (documents[0]?.id ?? snapshot.project.activeDocumentId),
          updatedAt: now
        }
      };
    });
  }
}

function collectWorkspaceEntries(allPaths: string[], fs: InMemoryFs) {
  const folders = new Set<string>();
  const files: Array<{ path: string; content: string | Uint8Array }> = [];
  const data = (fs as unknown as { data: Map<string, { type: string; content?: string | Uint8Array }> }).data;

  for (const absolutePath of allPaths) {
    const relativePath = toRelativeProjectPath(absolutePath);
    if (!relativePath || relativePath === "figures" || relativePath.startsWith(FIGURES_PREFIX)) {
      continue;
    }
    const entry = data.get(absolutePath);
    const segments = relativePath.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      folders.add(segments.slice(0, index).join("/"));
    }
    if (entry?.type === "directory") {
      folders.add(relativePath);
      continue;
    }
    if (entry?.type === "file") {
      files.push({
        path: relativePath,
        content: entry.content ?? ""
      });
    }
  }

  return {
    folders: [...folders].sort(),
    files: files.sort((left, right) => left.path.localeCompare(right.path))
  };
}

function toAbsoluteProjectPath(path: string): string {
  const normalizedPath = normalizeWorkspacePath(path);
  return normalizedPath ? `${PROJECT_ROOT}/${normalizedPath}` : PROJECT_ROOT;
}

function toRelativeProjectPath(path: string): string | null {
  const normalizedPath = normalizeWorkspacePath(path.replace(/^\/+/, ""));
  if (normalizedPath === "project") {
    return "";
  }
  if (normalizedPath.startsWith("project/")) {
    return normalizedPath.slice("project/".length);
  }
  return null;
}
