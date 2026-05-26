import type { AppSnapshot } from "../app/appState";
import {
  buildProjectWorkspaceEntries,
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
  if (!isOpfsAvailable()) {
    return;
  }

  const workspaceRoot = await getWorkspaceRootHandle(true);
  await clearDirectory(workspaceRoot);

  for (const entry of buildProjectWorkspaceEntries(snapshot)) {
    if (entry.kind === "folder") {
      await ensureDirectory(workspaceRoot, entry.path);
      continue;
    }

    await writeWorkspaceFile(workspaceRoot, entry);
  }
}

export async function loadWorkspaceTreeFromOpfs(): Promise<WorkspaceTreeNode[]> {
  if (!isOpfsAvailable()) {
    return [];
  }

  const workspaceRoot = await getWorkspaceRootHandle(true);
  const entries = await collectWorkspaceEntries(workspaceRoot);
  return buildWorkspaceTree(entries);
}

async function getWorkspaceRootHandle(create: boolean): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(WORKSPACE_ROOT_DIRECTORY, { create });
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

async function clearDirectory(directory: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = [];

  for await (const [name] of iterateDirectoryEntries(directory)) {
    names.push(name);
  }

  for (const name of names) {
    await directory.removeEntry(name, { recursive: true });
  }
}

async function writeWorkspaceFile(
  root: FileSystemDirectoryHandle,
  entry: WorkspaceFlatEntry
): Promise<void> {
  const segments = normalizeWorkspacePath(entry.path).split("/");
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
