import type { AppSnapshot } from "../app/appState";
import { areBytesEqual } from "../utils/bytes";
import {
  createProjectStorageFromSnapshot,
  getSelectedProjectRepository,
  normalizeProjectPath,
  type TyprProjectRepository
} from "../project/projectState";
import {
  buildProjectWorkspaceEntriesFromProject,
  buildWorkspaceTree,
  normalizeWorkspacePath,
  type WorkspaceFlatEntry,
  type WorkspaceTreeNode
} from "./workspaceTree";

const WORKSPACE_ROOT_DIRECTORY = "workspace-v1";

export function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

export async function syncSnapshotToOpfs(snapshot: AppSnapshot): Promise<void> {
  const project = getSelectedProjectRepository(createProjectStorageFromSnapshot(snapshot));
  if (project) {
    await syncProjectToOpfs(project);
  }
}

export async function syncProjectToOpfs(project: TyprProjectRepository): Promise<void> {
  if (!isOpfsAvailable()) {
    return;
  }

  const workspaceRoot = await getWorkspaceRootHandle(project.id, true);
  const entries = buildProjectWorkspaceEntriesFromProject(project);
  const desiredFilePaths = new Set<string>();
  const desiredDirectoryPaths = new Set<string>();

  for (const entry of entries) {
    const path = normalizeProjectPath(entry.path);
    const segments = path.split("/");

    for (let index = 1; index < segments.length; index += 1) {
      desiredDirectoryPaths.add(segments.slice(0, index).join("/"));
    }

    if (entry.kind === "folder") {
      desiredDirectoryPaths.add(path);
    } else {
      desiredFilePaths.add(path);
    }
  }

  // Consistency is write-before-prune: each changed file is committed by close(),
  // and any write failure aborts that file and skips the entire prune phase. A
  // retry may observe earlier committed updates plus stale entries, but never a
  // tree pruned before all current project content has been made durable.
  for (const path of [...desiredDirectoryPaths].sort()) {
    await ensureDirectory(workspaceRoot, path);
  }

  for (const entry of entries) {
    if (entry.kind === "file") {
      await writeWorkspaceFile(workspaceRoot, entry);
    }
  }

  await pruneWorkspaceEntries(
    workspaceRoot,
    desiredFilePaths,
    desiredDirectoryPaths
  );
}

export async function loadWorkspaceTreeFromOpfs(projectId: string): Promise<WorkspaceTreeNode[]> {
  if (!isOpfsAvailable()) {
    return [];
  }

  const workspaceRoot = await getWorkspaceRootHandle(projectId, true);
  const entries = await collectWorkspaceEntries(workspaceRoot);
  return buildWorkspaceTree(entries);
}

export async function readWorkspaceFileFromOpfs(
  projectId: string,
  path: string
): Promise<Uint8Array | null> {
  if (!isOpfsAvailable()) {
    return null;
  }

  const workspaceRoot = await getWorkspaceRootHandle(projectId, false);
  const fileHandle = await getFileHandleByPath(workspaceRoot, path);

  if (!fileHandle) {
    return null;
  }

  const file = await fileHandle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function removeProjectFromOpfs(projectId: string): Promise<void> {
  if (!isOpfsAvailable()) {
    return;
  }

  try {
    const projectsRoot = await getProjectsRootHandle(false);
    await projectsRoot.removeEntry(projectId, { recursive: true });
  } catch (error) {
    if (isFileSystemNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

function isFileSystemNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotFoundError"
  );
}

async function getWorkspaceRootHandle(
  projectId: string,
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  const projectsRoot = await getProjectsRootHandle(create);
  const projectRoot = await projectsRoot.getDirectoryHandle(projectId, { create });
  return projectRoot.getDirectoryHandle("worktree", { create });
}

async function getProjectsRootHandle(create: boolean): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  const workspaceRoot = await opfsRoot.getDirectoryHandle(WORKSPACE_ROOT_DIRECTORY, { create });
  return workspaceRoot.getDirectoryHandle("projects", { create });
}

async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemDirectoryHandle> {
  const segments = normalizeWorkspacePath(path).split("/").filter(Boolean);
  let current = root;

  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }

  return current;
}

async function getFileHandleByPath(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemFileHandle | null> {
  let segments: string[];

  try {
    segments = normalizeProjectPath(path).split("/").filter(Boolean);
  } catch {
    return null;
  }

  if (segments.length === 0) {
    return null;
  }

  let current: FileSystemDirectoryHandle = root;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isLeaf = index === segments.length - 1;

    if (isLeaf) {
      try {
        return await current.getFileHandle(segment, { create: false });
      } catch {
        return null;
      }
    }

    try {
      current = await current.getDirectoryHandle(segment, { create: false });
    } catch {
      return null;
    }
  }

  return null;
}

async function writeWorkspaceFile(
  root: FileSystemDirectoryHandle,
  entry: WorkspaceFlatEntry
): Promise<void> {
  const segments = normalizeProjectPath(entry.path).split("/");
  const fileName = segments.pop();

  if (!fileName) {
    return;
  }

  const parent = segments.length > 0 ? await ensureDirectory(root, segments.join("/")) : root;
  const fileHandle = await parent.getFileHandle(fileName, { create: true });
  const writableFileHandle = fileHandle as FileSystemFileHandle & {
    createWritable?: FileSystemFileHandle["createWritable"];
  };

  if (typeof writableFileHandle.createWritable !== "function") {
    throw new Error(`OPFS file is not writable: ${entry.path}`);
  }

  const desiredBytes = workspaceEntryContentToBytes(entry.content);
  const currentFile = await fileHandle.getFile();
  const currentBytes = new Uint8Array(await currentFile.arrayBuffer());

  if (areBytesEqual(currentBytes, desiredBytes)) {
    return;
  }

  const writer = await writableFileHandle.createWritable();

  try {
    const buffer = desiredBytes.buffer.slice(
      desiredBytes.byteOffset,
      desiredBytes.byteOffset + desiredBytes.byteLength
    ) as ArrayBuffer;
    await writer.write(buffer);
    await writer.close();
  } catch (error) {
    try {
      await writer.abort(error);
    } catch {
      // Preserve the original write failure; abort is best-effort after close errors.
    }
    throw error;
  }
}

function workspaceEntryContentToBytes(
  content: WorkspaceFlatEntry["content"]
): Uint8Array {
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }

  return content instanceof Uint8Array ? content : new Uint8Array();
}


async function pruneWorkspaceEntries(
  directory: FileSystemDirectoryHandle,
  desiredFilePaths: ReadonlySet<string>,
  desiredDirectoryPaths: ReadonlySet<string>,
  pathPrefix = ""
): Promise<void> {
  const currentEntries: Array<[string, FileSystemHandle]> = [];

  for await (const entry of iterateDirectoryEntries(directory)) {
    currentEntries.push(entry);
  }

  for (const [name, handle] of currentEntries) {
    const path = pathPrefix ? `${pathPrefix}/${name}` : name;

    if (handle.kind === "directory") {
      if (!desiredDirectoryPaths.has(path)) {
        await directory.removeEntry(name, { recursive: true });
        continue;
      }

      await pruneWorkspaceEntries(
        handle as FileSystemDirectoryHandle,
        desiredFilePaths,
        desiredDirectoryPaths,
        path
      );
      continue;
    }

    if (!desiredFilePaths.has(path)) {
      await directory.removeEntry(name);
    }
  }
}

async function collectWorkspaceEntries(
  directory: FileSystemDirectoryHandle,
  pathPrefix = ""
): Promise<WorkspaceFlatEntry[]> {
  const entries: WorkspaceFlatEntry[] = [];

  for await (const [name, handle] of iterateDirectoryEntries(directory)) {
    const nextPath = pathPrefix ? `${pathPrefix}/${name}` : name;

    if (handle.kind === "directory") {
      entries.push({
        path: nextPath,
        kind: "folder",
        source: {
          kind: "folder",
          id: `virtual:${nextPath}`
        }
      });
      entries.push(...(await collectWorkspaceEntries(handle as FileSystemDirectoryHandle, nextPath)));
      continue;
    }

    entries.push({
      path: nextPath,
      kind: "file",
      source: {
        kind: "document",
        id: `virtual:${nextPath}`
      }
    });
  }

  return entries;
}

function iterateDirectoryEntries(
  directory: FileSystemDirectoryHandle
): AsyncIterable<[string, FileSystemHandle]> {
  return (
    directory as FileSystemDirectoryHandle & {
      entries: () => AsyncIterable<[string, FileSystemHandle]>;
    }
  ).entries();
}
