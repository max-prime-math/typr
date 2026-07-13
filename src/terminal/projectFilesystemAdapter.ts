import {
  assertSafeProjectPath,
  deleteProjectPath,
  ensureProjectFolder,
  listProjectEntries,
  renameProjectPath,
  writeProjectFile,
  type ProjectFileContent,
  type TyprProjectRepository
} from "../project/projectState";
import {
  buildProjectWorkspaceEntriesFromProject,
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
  getProject: () => TyprProjectRepository | null;
  updateProject: (updater: (project: TyprProjectRepository) => TyprProjectRepository) => void;
}): IFileSystem {
  const fs = new InMemoryFs(buildInitialFiles(options.getProject()));
  return new ProjectFsAdapter(fs, options.updateProject);
}

function buildInitialFiles(project: TyprProjectRepository | null): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {};
  if (!project) {
    return files;
  }

  for (const entry of buildProjectWorkspaceEntriesFromProject(project)) {
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
    private readonly updateProject: (updater: (project: TyprProjectRepository) => TyprProjectRepository) => void
  ) {}

  readFile(path: string, options?: ReadFileOptions | BufferEncoding): Promise<string> {
    return this.inner.readFile(path, options);
  }

  readFileBuffer(path: string): Promise<Uint8Array> {
    return this.inner.readFileBuffer(path);
  }

  async writeFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding) {
    const relativePath = this.assertWritablePath(path);
    await this.inner.writeFile(path, content, options);
    this.syncProject((project) =>
      writeProjectFile(project, relativePath, normalizeFileContent(content) as ProjectFileContent)
    );
  }

  async appendFile(path: string, content: FileContent, options?: WriteFileOptions | BufferEncoding) {
    const relativePath = this.assertWritablePath(path);
    await this.inner.appendFile(path, content, options);
    const entry = getInMemoryEntry(this.inner, path);
    this.syncProject((project) =>
      writeProjectFile(project, relativePath, normalizeFileContent(entry?.content ?? content))
    );
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
    const relativePath = this.assertWritablePath(path);
    await this.inner.mkdir(path, options);
    this.syncProject((project) => ensureProjectFolder(project, relativePath));
  }

  readdir(path: string): Promise<string[]> {
    return this.inner.readdir(path);
  }

  readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    return this.inner.readdirWithFileTypes(path);
  }

  async rm(path: string, options?: RmOptions) {
    const relativePath = this.assertWritablePath(path);
    await this.inner.rm(path, options);
    this.syncProject((project) => deleteProjectPath(project, relativePath));
  }

  async cp(src: string, dest: string, options?: CpOptions) {
    const relativePath = this.assertWritablePath(dest);
    await this.inner.cp(src, dest, options);
    const entry = getInMemoryEntry(this.inner, dest);
    if (entry?.type === "directory") {
      this.syncWholeProject();
      return;
    }
    this.syncProject((project) =>
      writeProjectFile(project, relativePath, normalizeFileContent(entry?.content ?? ""))
    );
  }

  async mv(src: string, dest: string) {
    const sourcePath = this.assertWritablePath(src);
    const destinationPath = this.assertWritablePath(dest);
    await this.inner.mv(src, dest);
    this.syncProject((project) => renameProjectPath(project, sourcePath, destinationPath));
  }

  resolvePath(base: string, path: string): string {
    return this.inner.resolvePath(base, path);
  }

  getAllPaths(): string[] {
    return this.inner.getAllPaths();
  }

  chmod(path: string, mode: number): Promise<void> {
    void path;
    void mode;
    throw new Error("Browser Shell git backend does not support file mode changes.");
  }

  symlink(target: string, linkPath: string): Promise<void> {
    void target;
    void linkPath;
    throw new Error("Browser Shell git backend does not support symbolic links.");
  }

  link(existingPath: string, newPath: string): Promise<void> {
    void existingPath;
    void newPath;
    throw new Error("Browser Shell git backend does not support hard links.");
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

  private assertWritablePath(path: string): string {
    const relativePath = toRelativeProjectPath(path);
    if (relativePath === null) {
      throw new Error("Browser Shell can only access files inside /project.");
    }
    if (relativePath === "") {
      throw new Error("Browser Shell cannot modify the project root directly.");
    }
    const safePath = assertSafeProjectPath(relativePath);
    if (relativePath === "figures" || relativePath.startsWith(FIGURES_PREFIX)) {
      throw new Error("Figure assets are read-only in Browser Shell.");
    }
    return safePath;
  }

  private syncProject(updater: (project: TyprProjectRepository) => TyprProjectRepository) {
    this.updateProject(updater);
  }

  private syncWholeProject() {
    const entries = collectWorkspaceEntries(this.inner.getAllPaths(), this.inner);
    this.updateProject((project) => {
      let nextProject = project;
      const livePaths = new Set([...entries.folders, ...entries.files.map((entry) => entry.path)]);

      for (const entry of listProjectEntries(project)) {
        if (
          entry.source.kind === "diagram" ||
          entry.path === "figures" ||
          entry.path.startsWith(FIGURES_PREFIX)
        ) {
          continue;
        }
        if (!livePaths.has(entry.path)) {
          nextProject = deleteProjectPath(nextProject, entry.path);
        }
      }

      for (const folder of entries.folders) {
        nextProject = ensureProjectFolder(nextProject, folder);
      }
      for (const file of entries.files) {
        nextProject = writeProjectFile(nextProject, file.path, file.content);
      }

      return nextProject;
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

function getInMemoryEntry(
  fs: InMemoryFs,
  path: string
): { type: string; content?: string | Uint8Array } | undefined {
  const data = (fs as unknown as { data: Map<string, { type: string; content?: string | Uint8Array }> }).data;
  return data.get(path);
}

function normalizeFileContent(content: FileContent | string | Uint8Array): string | Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (typeof content === "string") {
    return content;
  }

  return new Uint8Array(content);
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
