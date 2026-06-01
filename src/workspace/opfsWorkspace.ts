import type { AppSnapshot } from "../app/appState";
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

  for (const entry of buildProjectWorkspaceEntriesFromProject(project)) {
    if (entry.kind === "folder") {
      await ensureDirectory(workspaceRoot, entry.path);
      continue;
    }

    await writeWorkspaceFile(workspaceRoot, entry);
  }
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

async function getWorkspaceRootHandle(
  projectId: string,
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  const workspaceRoot = await opfsRoot.getDirectoryHandle(WORKSPACE_ROOT_DIRECTORY, { create });
  const projectsRoot = await workspaceRoot.getDirectoryHandle("projects", { create });
  const projectRoot = await projectsRoot.getDirectoryHandle(projectId, { create });
  return projectRoot.getDirectoryHandle("worktree", { create });
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
  const writer = await fileHandle.createWritable();

  if (typeof entry.content === "string") {
    await writer.write(entry.content);
  } else if (entry.content instanceof Uint8Array) {
    const buffer = entry.content.buffer.slice(
      entry.content.byteOffset,
      entry.content.byteOffset + entry.content.byteLength
    ) as ArrayBuffer;
    await writer.write(buffer);
  } else {
    await writer.write("");
  }

  await writer.close();
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
