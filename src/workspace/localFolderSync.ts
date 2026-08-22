import {
  deleteProjectPath,
  ensureProjectFolder,
  listProjectEntries,
  normalizeProjectPath,
  writeProjectFile,
  type ProjectFileContent,
  type TyprProjectRepository
} from "../project/projectState";
import {
  deleteProjectGitFile,
  listProjectGitFiles,
  readProjectGitFile,
  writeProjectGitFile
} from "../storage/indexedDbStorage";
import {
  createFullContentSignature,
  hashTextContent
} from "../utils/contentHash";
import { isTextWorkspaceFile } from "./workspaceTree";

export interface LocalFolderSyncEntry {
  kind: "file" | "folder";
  path: string;
  bytes?: Uint8Array;
  modifiedAt: number;
}

export type LocalFolderSyncTree = Map<string, LocalFolderSyncEntry>;

export const LOCAL_FOLDER_GIT_FILE_BYTE_LIMIT = 32 * 1024 * 1024;

const syncByteSignatureCache = new WeakMap<Uint8Array, string>();

export function shouldSyncLocalFolderGitFile(byteLength: number): boolean {
  return byteLength <= LOCAL_FOLDER_GIT_FILE_BYTE_LIMIT;
}

export interface ResolvedSyncTrees {
  desired: LocalFolderSyncTree;
  signatures: Record<string, string>;
}

export type StrictSyncResolution =
  | ({ ok: true } & ResolvedSyncTrees)
  | { ok: false; conflicts: string[] };

export interface LocalFolderDirectorySnapshot {
  worktree: LocalFolderSyncTree;
  git: LocalFolderSyncTree;
}

export function isLocalFolderSyncSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (
      window as Window & {
        showDirectoryPicker?: unknown;
      }
    ).showDirectoryPicker === "function"
  );
}

export function getSyncTreeSignatures(
  tree: LocalFolderSyncTree
): Record<string, string> {
  return Object.fromEntries(
    [...tree.entries()]
      .map(([path, entry]) => [path, getSyncEntrySignature(entry)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export function resolveSyncTrees(options: {
  baseline: Readonly<Record<string, string>>;
  browser: LocalFolderSyncTree;
  local: LocalFolderSyncTree;
}): ResolvedSyncTrees {
  const result = resolveSyncTreesInternal(options, false);
  if (!result.ok) throw new Error("Non-strict synchronization unexpectedly reported conflicts.");
  return result;
}

export function resolveSyncTreesStrict(options: {
  baseline: Readonly<Record<string, string>>;
  browser: LocalFolderSyncTree;
  local: LocalFolderSyncTree;
}): StrictSyncResolution {
  return resolveSyncTreesInternal(options, true);
}

function resolveSyncTreesInternal(
  options: {
    baseline: Readonly<Record<string, string>>;
    browser: LocalFolderSyncTree;
    local: LocalFolderSyncTree;
  },
  strict: boolean
): StrictSyncResolution {
  const desired = new Map<string, LocalFolderSyncEntry>();
  const conflicts: string[] = [];
  const paths = new Set([
    ...Object.keys(options.baseline),
    ...options.browser.keys(),
    ...options.local.keys()
  ]);

  for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
    const baselineSignature = options.baseline[path];
    const browserEntry = options.browser.get(path);
    const localEntry = options.local.get(path);
    const browserSignature = browserEntry
      ? getSyncEntrySignature(browserEntry)
      : undefined;
    const localSignature = localEntry ? getSyncEntrySignature(localEntry) : undefined;

    if (browserSignature === localSignature) {
      if (browserEntry) {
        desired.set(path, cloneSyncEntry(browserEntry));
      }
      continue;
    }

    const browserChanged = browserSignature !== baselineSignature;
    const localChanged = localSignature !== baselineSignature;
    let selected: LocalFolderSyncEntry | undefined;

    if (browserChanged && !localChanged) {
      selected = browserEntry;
    } else if (localChanged && !browserChanged) {
      selected = localEntry;
    } else if (baselineSignature === undefined) {
      // The first connection is additive. Folder content wins same-path
      // conflicts, while browser-only paths are exported into the folder.
      selected = localEntry ?? browserEntry;
    } else if (!browserEntry || !localEntry) {
      // A deletion racing a content edit must not discard the edit.
      selected = browserEntry ?? localEntry;
    } else if (strict) {
      conflicts.push(path);
    } else {
      selected =
        localEntry.modifiedAt >= browserEntry.modifiedAt ? localEntry : browserEntry;
    }

    if (selected) {
      desired.set(path, cloneSyncEntry(selected));
    }
  }

  addImplicitParentFolders(desired);
  if (strict) conflicts.push(...findStructuralConflicts(desired));
  if (conflicts.length > 0) return { ok: false, conflicts: [...new Set(conflicts)].sort() };
  return {
    ok: true,
    desired,
    signatures: getSyncTreeSignatures(desired)
  };
}

function findStructuralConflicts(tree: LocalFolderSyncTree): string[] {
  const paths = [...tree.keys()];
  return paths.filter((path) =>
    tree.get(path)?.kind === "file" && paths.some((candidate) => candidate.startsWith(`${path}/`))
  );
}

export function createProjectSyncTree(
  project: TyprProjectRepository
): LocalFolderSyncTree {
  const tree: LocalFolderSyncTree = new Map();

  for (const entry of listProjectEntries(project)) {
    tree.set(entry.path, {
      kind: entry.kind,
      path: entry.path,
      bytes:
        entry.kind === "file"
          ? typeof entry.content === "string"
            ? new TextEncoder().encode(entry.content)
            : entry.content
          : undefined,
      modifiedAt: Date.parse(entry.updatedAt) || Date.parse(project.updatedAt) || 0
    });
  }

  addImplicitParentFolders(tree);
  return tree;
}

export function applySyncTreeToProject(
  currentProject: TyprProjectRepository,
  startedTree: LocalFolderSyncTree,
  desiredTree: LocalFolderSyncTree
): TyprProjectRepository {
  let project = currentProject;
  const currentTree = createProjectSyncTree(currentProject);
  const blockedStructuralPaths = new Set<string>();
  const paths = new Set([
    ...currentTree.keys(),
    ...startedTree.keys(),
    ...desiredTree.keys()
  ]);

  for (const path of [...paths].sort(byDescendingPathDepth)) {
    const currentEntry = currentTree.get(path);
    const startedEntry = startedTree.get(path);
    const desiredEntry = desiredTree.get(path);
    const currentSignature = currentEntry
      ? getSyncEntrySignature(currentEntry)
      : undefined;
    const startedSignature = startedEntry
      ? getSyncEntrySignature(startedEntry)
      : undefined;
    const desiredSignature = desiredEntry
      ? getSyncEntrySignature(desiredEntry)
      : undefined;

    // Keep an editor change that landed while filesystem I/O was in flight.
    if (
      currentSignature !== startedSignature &&
      currentSignature !== desiredSignature
    ) {
      continue;
    }

    if (currentEntry && !desiredEntry) {
      if (
        currentEntry.kind === "folder" &&
        hasConcurrentDescendant(path, currentTree, startedTree, desiredTree)
      ) {
        blockedStructuralPaths.add(path);
        continue;
      }
      project = deleteProjectPath(project, path);
      deleteTreePath(currentTree, path);
    } else if (
      currentEntry &&
      desiredEntry &&
      currentEntry.kind !== desiredEntry.kind
    ) {
      if (
        currentEntry.kind === "folder" &&
        hasConcurrentDescendant(path, currentTree, startedTree, desiredTree)
      ) {
        blockedStructuralPaths.add(path);
        continue;
      }
      project = deleteProjectPath(project, path);
      deleteTreePath(currentTree, path);
    }
  }

  for (const [path, desiredEntry] of [...desiredTree.entries()].sort(
    byAscendingPathDepthEntry
  )) {
    if (blockedStructuralPaths.has(path)) {
      continue;
    }
    const currentEntry = currentTree.get(path);
    const startedEntry = startedTree.get(path);
    const currentSignature = currentEntry
      ? getSyncEntrySignature(currentEntry)
      : undefined;
    const startedSignature = startedEntry
      ? getSyncEntrySignature(startedEntry)
      : undefined;
    const desiredSignature = getSyncEntrySignature(desiredEntry);

    if (
      currentSignature !== startedSignature &&
      currentSignature !== desiredSignature
    ) {
      continue;
    }

    if (currentSignature === desiredSignature) {
      continue;
    }

    if (desiredEntry.kind === "folder") {
      project = ensureProjectFolder(project, path);
    } else {
      project = writeProjectFile(
        project,
        path,
        decodeProjectFileContent(path, desiredEntry.bytes ?? new Uint8Array())
      );
    }
    currentTree.set(path, cloneSyncEntry(desiredEntry));
  }

  const nextFiles = listProjectEntries(project)
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.path);
  const activeFilePath =
    project.selection.activeFilePath &&
    nextFiles.includes(project.selection.activeFilePath)
      ? project.selection.activeFilePath
      : nextFiles[0] ?? null;
  const openFilePaths = project.selection.openFilePaths.filter((path) =>
    nextFiles.includes(path)
  );
  const nextOpenFilePaths =
    activeFilePath && !openFilePaths.includes(activeFilePath)
      ? [...openFilePaths, activeFilePath]
      : openFilePaths;

  if (
    activeFilePath === project.selection.activeFilePath &&
    areStringListsEqual(nextOpenFilePaths, project.selection.openFilePaths)
  ) {
    return project;
  }

  return {
    ...project,
    selection: {
      activeFilePath,
      openFilePaths: nextOpenFilePaths
    }
  };
}

export async function readLocalFolderDirectory(
  root: FileSystemDirectoryHandle
): Promise<LocalFolderDirectorySnapshot> {
  const worktree: LocalFolderSyncTree = new Map();
  const git: LocalFolderSyncTree = new Map();

  for await (const [name, handle] of iterateDirectoryEntries(root)) {
    if (name === ".git") {
      if (handle.kind === "directory") {
        await collectDirectoryTree(handle as FileSystemDirectoryHandle, git, "", {
          maxFileBytes: LOCAL_FOLDER_GIT_FILE_BYTE_LIMIT
        });
      }
      continue;
    }

    await collectHandle(
      handle,
      name,
      worktree
    );
  }

  addImplicitParentFolders(worktree);
  addImplicitParentFolders(git);
  return { worktree, git };
}

export async function getLocalFolderDirectoryFingerprint(
  root: FileSystemDirectoryHandle
): Promise<string> {
  const parts: string[] = [];

  for await (const [name, handle] of iterateDirectoryEntries(root)) {
    if (name === ".git") {
      if (handle.kind === "directory") {
        await collectDirectoryFingerprint(
          handle as FileSystemDirectoryHandle,
          parts,
          "git",
          ""
        );
      }
      continue;
    }
    await collectHandleFingerprint(handle, name, parts, "worktree");
  }

  return hashTextContent(parts.sort().join("\n"));
}

export function getLocalFolderSnapshotFingerprint(
  snapshot: LocalFolderDirectorySnapshot
): string {
  const parts = [
    ...getTreeFingerprintParts(snapshot.worktree, "worktree"),
    ...getTreeFingerprintParts(snapshot.git, "git")
  ];
  return hashTextContent(parts.sort().join("\n"));
}

export async function writeLocalFolderDirectory(
  root: FileSystemDirectoryHandle,
  current: LocalFolderDirectorySnapshot,
  desiredWorktree: LocalFolderSyncTree,
  desiredGit: LocalFolderSyncTree
): Promise<void> {
  await writeTreeToDirectory(root, current.worktree, desiredWorktree);

  if (desiredGit.size > 0 || current.git.size > 0) {
    const gitRoot = await root.getDirectoryHandle(".git", { create: true });
    await writeTreeToDirectory(gitRoot, current.git, desiredGit);
  }
}

export async function createBrowserGitSyncTree(
  projectId: string
): Promise<LocalFolderSyncTree> {
  const tree: LocalFolderSyncTree = new Map();
  const paths = await listProjectGitFiles(projectId);

  for (const storedPath of paths) {
    const path = normalizeGitStoragePath(storedPath);
    if (!path) {
      continue;
    }

    const bytes = await readProjectGitFile(projectId, storedPath);
    if (!bytes) {
      continue;
    }

    tree.set(path, {
      kind: "file",
      path,
      bytes,
      modifiedAt: 0
    });
  }

  addImplicitParentFolders(tree);
  return tree;
}

export async function applySyncTreeToBrowserGit(
  projectId: string,
  startedTree: LocalFolderSyncTree,
  desiredTree: LocalFolderSyncTree
): Promise<boolean> {
  const currentTree = await createBrowserGitSyncTree(projectId);
  let changed = false;

  for (const [path, currentEntry] of currentTree) {
    if (currentEntry.kind !== "file") {
      continue;
    }

    const startedEntry = startedTree.get(path);
    const desiredEntry = desiredTree.get(path);
    const currentSignature = getSyncEntrySignature(currentEntry);
    const startedSignature = startedEntry
      ? getSyncEntrySignature(startedEntry)
      : undefined;
    const desiredSignature = desiredEntry
      ? getSyncEntrySignature(desiredEntry)
      : undefined;

    if (
      currentSignature !== startedSignature &&
      currentSignature !== desiredSignature
    ) {
      continue;
    }

    if (!desiredEntry || desiredEntry.kind !== "file") {
      await deleteProjectGitFile(projectId, path);
      changed = true;
    }
  }

  for (const [path, desiredEntry] of desiredTree) {
    if (desiredEntry.kind !== "file") {
      continue;
    }

    const currentEntry = currentTree.get(path);
    const startedEntry = startedTree.get(path);
    const currentSignature = currentEntry
      ? getSyncEntrySignature(currentEntry)
      : undefined;
    const startedSignature = startedEntry
      ? getSyncEntrySignature(startedEntry)
      : undefined;
    const desiredSignature = getSyncEntrySignature(desiredEntry);

    if (
      currentSignature !== startedSignature &&
      currentSignature !== desiredSignature
    ) {
      continue;
    }

    if (currentSignature !== desiredSignature) {
      await writeProjectGitFile(
        projectId,
        path,
        desiredEntry.bytes ?? new Uint8Array()
      );
      changed = true;
    }
  }

  return changed;
}

export function updateProjectGitMetadataFromTree(
  project: TyprProjectRepository,
  gitTree: LocalFolderSyncTree
): TyprProjectRepository {
  const headEntry = gitTree.get("HEAD");
  if (!headEntry || headEntry.kind !== "file" || !headEntry.bytes) {
    return project;
  }

  const head = new TextDecoder().decode(headEntry.bytes).trim();
  const refMatch = /^ref:\s*(refs\/heads\/.+)$/.exec(head);
  const headRef = refMatch?.[1] ?? null;
  const branch = headRef?.slice("refs/heads/".length) ?? null;
  const defaultBranch = project.git.defaultBranch ?? branch;

  if (
    project.git.status === "ready" &&
    project.git.headRef === headRef &&
    project.git.defaultBranch === defaultBranch &&
    project.git.recoveryMessage == null
  ) {
    return project;
  }

  return {
    ...project,
    git: {
      ...project.git,
      status: "ready",
      headRef,
      defaultBranch,
      initializedAt: project.git.initializedAt ?? new Date().toISOString(),
      recoveryMessage: null
    }
  };
}

function getSyncEntrySignature(entry: LocalFolderSyncEntry): string {
  if (entry.kind === "folder") {
    return "folder";
  }

  const bytes = entry.bytes ?? new Uint8Array();
  const cached = syncByteSignatureCache.get(bytes);
  if (cached) {
    return cached;
  }

  const signature = createFullContentSignature(bytes);
  syncByteSignatureCache.set(bytes, signature);
  return signature;
}

function cloneSyncEntry(entry: LocalFolderSyncEntry): LocalFolderSyncEntry {
  return {
    ...entry,
    // Sync entries are treated as immutable. Sharing their byte view avoids
    // multiplying large folder assets (and .git packs) during reconciliation.
    bytes: entry.bytes
  };
}

function addImplicitParentFolders(tree: LocalFolderSyncTree): void {
  const paths = [...tree.keys()];

  for (const path of paths) {
    const segments = path.split("/");

    for (let index = 1; index < segments.length; index += 1) {
      const parentPath = segments.slice(0, index).join("/");
      if (!tree.has(parentPath)) {
        tree.set(parentPath, {
          kind: "folder",
          path: parentPath,
          modifiedAt: 0
        });
      }
    }
  }
}

function deleteTreePath(tree: LocalFolderSyncTree, path: string): void {
  for (const entryPath of tree.keys()) {
    if (entryPath === path || entryPath.startsWith(`${path}/`)) {
      tree.delete(entryPath);
    }
  }
}

function hasConcurrentDescendant(
  path: string,
  currentTree: LocalFolderSyncTree,
  startedTree: LocalFolderSyncTree,
  desiredTree: LocalFolderSyncTree
): boolean {
  const prefix = `${path}/`;

  for (const [entryPath, currentEntry] of currentTree) {
    if (!entryPath.startsWith(prefix)) {
      continue;
    }
    const startedEntry = startedTree.get(entryPath);
    const desiredEntry = desiredTree.get(entryPath);
    const currentSignature = getSyncEntrySignature(currentEntry);
    const startedSignature = startedEntry
      ? getSyncEntrySignature(startedEntry)
      : undefined;
    const desiredSignature = desiredEntry
      ? getSyncEntrySignature(desiredEntry)
      : undefined;

    if (
      currentSignature !== startedSignature &&
      currentSignature !== desiredSignature
    ) {
      return true;
    }
  }

  return false;
}

async function collectDirectoryTree(
  directory: FileSystemDirectoryHandle,
  tree: LocalFolderSyncTree,
  pathPrefix = "",
  options: { maxFileBytes?: number } = {}
): Promise<void> {
  for await (const [name, handle] of iterateDirectoryEntries(directory)) {
    const path = pathPrefix ? `${pathPrefix}/${name}` : name;
    await collectHandle(handle, path, tree, options);
  }
}

async function collectHandle(
  handle: FileSystemHandle,
  rawPath: string,
  tree: LocalFolderSyncTree,
  options: { maxFileBytes?: number } = {}
): Promise<void> {
  const path = normalizeExternalPath(rawPath);
  if (!path) {
    return;
  }

  if (handle.kind === "directory") {
    tree.set(path, {
      kind: "folder",
      path,
      modifiedAt: 0
    });
    await collectDirectoryTree(handle as FileSystemDirectoryHandle, tree, path, options);
    return;
  }

  const file = await (handle as FileSystemFileHandle).getFile();
  if (options.maxFileBytes !== undefined && file.size > options.maxFileBytes) {
    return;
  }
  tree.set(path, {
    kind: "file",
    path,
    bytes: new Uint8Array(await file.arrayBuffer()),
    modifiedAt: file.lastModified
  });
}

async function collectDirectoryFingerprint(
  directory: FileSystemDirectoryHandle,
  parts: string[],
  namespace: "worktree" | "git",
  pathPrefix: string
): Promise<void> {
  for await (const [name, handle] of iterateDirectoryEntries(directory)) {
    const path = pathPrefix ? `${pathPrefix}/${name}` : name;
    await collectHandleFingerprint(handle, path, parts, namespace);
  }
}

async function collectHandleFingerprint(
  handle: FileSystemHandle,
  rawPath: string,
  parts: string[],
  namespace: "worktree" | "git"
): Promise<void> {
  const path = normalizeExternalPath(rawPath);
  if (!path) {
    return;
  }
  if (handle.kind === "directory") {
    parts.push(`${namespace}:folder:${path}`);
    await collectDirectoryFingerprint(
      handle as FileSystemDirectoryHandle,
      parts,
      namespace,
      path
    );
    return;
  }

  const file = await (handle as FileSystemFileHandle).getFile();
  if (namespace === "git" && !shouldSyncLocalFolderGitFile(file.size)) {
    return;
  }
  parts.push(
    `${namespace}:file:${path}:${file.size}:${file.lastModified}`
  );
}

async function writeTreeToDirectory(
  root: FileSystemDirectoryHandle,
  current: LocalFolderSyncTree,
  desired: LocalFolderSyncTree
): Promise<void> {
  for (const path of [...current.keys()].sort(byDescendingPathDepth)) {
    if (desired.has(path)) {
      continue;
    }
    await removeDirectoryEntry(root, path, current.get(path)?.kind === "folder");
  }

  for (const [path, entry] of [...desired.entries()].sort(
    byAscendingPathDepthEntry
  )) {
    const currentEntry = current.get(path);
    if (currentEntry && currentEntry.kind !== entry.kind) {
      await removeDirectoryEntry(root, path, currentEntry.kind === "folder");
    }

    if (entry.kind === "folder") {
      await ensureDirectory(root, path);
      continue;
    }

    if (
      currentEntry?.kind === "file" &&
      getSyncEntrySignature(currentEntry) === getSyncEntrySignature(entry)
    ) {
      continue;
    }

    await writeDirectoryFile(root, path, entry.bytes ?? new Uint8Array());
  }
}

async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of path.split("/").filter(Boolean)) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

async function writeDirectoryFile(
  root: FileSystemDirectoryHandle,
  path: string,
  bytes: Uint8Array
): Promise<void> {
  const segments = path.split("/");
  const fileName = segments.pop();
  if (!fileName) {
    return;
  }

  const parent =
    segments.length > 0 ? await ensureDirectory(root, segments.join("/")) : root;
  const handle = await parent.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  try {
    await writable.write(buffer);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort(error);
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

async function removeDirectoryEntry(
  root: FileSystemDirectoryHandle,
  path: string,
  recursive: boolean
): Promise<void> {
  const segments = path.split("/");
  const name = segments.pop();
  if (!name) {
    return;
  }

  let parent = root;
  try {
    for (const segment of segments) {
      parent = await parent.getDirectoryHandle(segment, { create: false });
    }
    await parent.removeEntry(name, { recursive });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

function decodeProjectFileContent(
  path: string,
  bytes: Uint8Array
): ProjectFileContent {
  return isTextWorkspaceFile(path) ? new TextDecoder().decode(bytes) : bytes;
}

function normalizeExternalPath(path: string): string | null {
  try {
    const normalized = normalizeProjectPath(path);
    return normalized === path ? normalized : null;
  } catch {
    return null;
  }
}

function normalizeGitStoragePath(path: string): string {
  return path.replace(/^\.git\/+/, "").replace(/^\/+/, "");
}

function getTreeFingerprintParts(
  tree: LocalFolderSyncTree,
  namespace: "worktree" | "git"
): string[] {
  return [...tree.values()].map((entry) =>
    entry.kind === "folder"
      ? `${namespace}:folder:${entry.path}`
      : `${namespace}:file:${entry.path}:${entry.bytes?.byteLength ?? 0}:${entry.modifiedAt}`
  );
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

function byDescendingPathDepth(left: string, right: string): number {
  return (
    right.split("/").length - left.split("/").length ||
    right.localeCompare(left)
  );
}

function byAscendingPathDepthEntry(
  [left]: [string, LocalFolderSyncEntry],
  [right]: [string, LocalFolderSyncEntry]
): number {
  return (
    left.split("/").length - right.split("/").length ||
    left.localeCompare(right)
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotFoundError"
  );
}

function areStringListsEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
