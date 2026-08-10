import type { CloudProjectBindingRecord } from "../cloud/cloudSync";
import type { WorkspaceLimits } from "@max-prime-math/typr-companion-protocol";
import {
  CompanionClient,
  CompanionClientError
} from "../compiler/companionClient";
import type { TyprProjectRepository } from "../project/projectState";
import {
  createProjectSyncTree,
  getSyncTreeSignatures,
  resolveSyncTreesStrict,
  type LocalFolderSyncEntry,
  type LocalFolderSyncTree
} from "./localFolderSync";

export const COMPANION_WORKSPACE_PROVIDER_ID = "typr-companion" as const;

export class CompanionWorkspaceConflictError extends Error {
  constructor(
    readonly paths: string[],
    readonly partiallyAppliedPaths: string[] = [],
    readonly retryable = false,
    options?: ErrorOptions
  ) {
    super(paths.length > 0
      ? `Mapped workspace conflicts require review: ${paths.join(", ")}`
      : "The mapped workspace changed during synchronization; sync again.");
    this.name = "CompanionWorkspaceConflictError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export class CompanionWorkspacePartialError extends Error {
  constructor(message: string, readonly partiallyAppliedPaths: string[], options?: ErrorOptions) {
    super(message, options);
    this.name = "CompanionWorkspacePartialError";
  }
}

interface CompanionWorkspaceSnapshot {
  tree: LocalFolderSyncTree;
  etags: Map<string, string>;
  workspaceId: string;
}

export interface CompanionWorkspaceSyncResult {
  binding: CloudProjectBindingRecord;
  startedProjectTree: LocalFolderSyncTree;
  desiredTree: LocalFolderSyncTree;
}

interface SyncOptions {
  binding: CloudProjectBindingRecord;
  project: TyprProjectRepository;
  client: CompanionClient;
  workspaceId: string;
  limits: WorkspaceLimits;
  now?: Date;
}

export function createCompanionWorkspaceBinding(options: {
  projectId: string;
  baseUrl: string;
  workspaceId: string;
  workspaceName?: string;
  now?: Date;
}): CloudProjectBindingRecord {
  const connectedAt = (options.now ?? new Date()).toISOString();
  return {
    version: 2,
    projectId: options.projectId,
    providerId: COMPANION_WORKSPACE_PROVIDER_ID,
    remoteRootId: options.workspaceId,
    remoteRootName: options.workspaceName ?? "Mapped workspace",
    connectedAt,
    lastSyncedAt: null,
    syncMode: "manual",
    syncIntervalMinutes: 15,
    worktreeSignatures: {},
    providerData: {
      baseUrl: options.baseUrl,
      workspaceId: options.workspaceId
    }
  };
}

export function validateCompanionWorkspaceBinding(
  binding: CloudProjectBindingRecord,
  client: CompanionClient,
  workspaceId: string
): void {
  if (binding.providerId !== COMPANION_WORKSPACE_PROVIDER_ID ||
      binding.providerData?.baseUrl !== client.baseUrl ||
      binding.providerData?.workspaceId !== workspaceId ||
      binding.remoteRootId !== workspaceId || binding.syncMode !== "manual") {
    throw new Error("Mapped workspace binding does not match the current Companion URL and workspace identity.");
  }
}

export async function synchronizeCompanionWorkspace(options: SyncOptions): Promise<CompanionWorkspaceSyncResult> {
  const appliedPaths: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await synchronizeCompanionWorkspaceAttempt(options);
    } catch (error) {
      if (error instanceof CompanionWorkspaceConflictError) {
        appliedPaths.push(...error.partiallyAppliedPaths);
        if (attempt === 0 && error.retryable) continue;
        throw new CompanionWorkspaceConflictError(error.paths, uniquePaths(appliedPaths), false, { cause: error });
      }
      if (error instanceof CompanionClientError && error.status === 404 && attempt === 0) continue;
      if (error instanceof CompanionWorkspacePartialError) {
        throw new CompanionWorkspacePartialError(error.message, uniquePaths([...appliedPaths, ...error.partiallyAppliedPaths]), { cause: error });
      }
      throw error;
    }
  }
  throw new Error("Mapped workspace synchronization exhausted its retry budget.");
}

async function synchronizeCompanionWorkspaceAttempt(options: SyncOptions): Promise<CompanionWorkspaceSyncResult> {
  validateCompanionWorkspaceBinding(options.binding, options.client, options.workspaceId);
  const startedProjectTree = createCompanionWorkspaceProjectTree(options.project);
  enforceTreeLimits(startedProjectTree, options.limits, "Browser project");
  const remote = await readWorkspaceSnapshot(options.client, options.workspaceId, options.limits);
  const resolution = resolveSyncTreesStrict({
    baseline: options.binding.worktreeSignatures,
    browser: startedProjectTree,
    local: remote.tree
  });
  if (!resolution.ok) throw new CompanionWorkspaceConflictError(resolution.conflicts);

  const desired = resolution.desired;
  enforceTreeLimits(desired, options.limits, "Synchronized workspace");
  const desiredSignatures = resolution.signatures;
  const remoteSignatures = getSyncTreeSignatures(remote.tree);
  const expectedEtags = new Map(remote.etags);
  const appliedPaths: string[] = [];
  const remoteFiles = [...remote.tree.values()].filter(isFileEntry);
  const desiredFiles = [...desired.values()].filter(isFileEntry);

  const deletions = remoteFiles
    .filter((entry) => desired.get(entry.path)?.kind !== "file")
    .sort((left, right) => pathDepth(right.path) - pathDepth(left.path));
  const upserts = desiredFiles
    .filter((entry) => remoteSignatures[entry.path] !== desiredSignatures[entry.path])
    .sort((left, right) => pathDepth(left.path) - pathDepth(right.path));

  try {
    for (const entry of deletions) {
      await options.client.deleteWorkspaceFile(entry.path, requiredEtag(remote.etags, entry.path));
      expectedEtags.delete(entry.path);
      appliedPaths.push(entry.path);
    }
    for (const entry of upserts) {
      const currentEtag = remote.etags.get(entry.path);
      const metadata = currentEtag
        ? await options.client.updateWorkspaceFile(entry.path, entry.bytes ?? new Uint8Array(), currentEtag)
        : await options.client.createWorkspaceFile(entry.path, entry.bytes ?? new Uint8Array());
      expectedEtags.set(entry.path, metadata.etag);
      appliedPaths.push(entry.path);
    }
    const verification = await options.client.listWorkspaceFiles();
    enforceListingLimits(verification.files, options.limits);
    if (verification.workspaceId !== options.workspaceId) {
      throw new Error("Companion workspace identity changed during synchronization.");
    }
    const actualEtags = new Map(verification.files.map((file) => [file.path, file.etag]));
    const changedPaths = [...new Set([...actualEtags.keys(), ...expectedEtags.keys()])]
      .filter((path) => actualEtags.get(path) !== expectedEtags.get(path))
      .sort();
    if (changedPaths.length > 0) {
      throw new CompanionWorkspaceConflictError(changedPaths, appliedPaths, true);
    }
  } catch (error) {
    if (error instanceof CompanionClientError && error.kind === "conflict") {
      throw new CompanionWorkspaceConflictError(
        [appliedPaths.length < deletions.length ? deletions[appliedPaths.length]?.path ?? "workspace" : upserts[appliedPaths.length - deletions.length]?.path ?? "workspace"],
        appliedPaths,
        true,
        { cause: error }
      );
    }
    if (error instanceof CompanionWorkspaceConflictError) throw error;
    if (appliedPaths.length > 0) {
      throw new CompanionWorkspacePartialError(
        error instanceof Error ? error.message : "Mapped workspace synchronization failed after applying files.",
        appliedPaths,
        { cause: error }
      );
    }
    throw error;
  }
  return {
    startedProjectTree,
    desiredTree: desired,
    binding: {
      ...options.binding,
      lastSyncedAt: (options.now ?? new Date()).toISOString(),
      syncMode: "manual",
      worktreeSignatures: desiredSignatures
    }
  };
}

async function readWorkspaceSnapshot(
  client: CompanionClient,
  expectedWorkspaceId: string,
  limits: WorkspaceLimits
): Promise<CompanionWorkspaceSnapshot> {
  const listing = await client.listWorkspaceFiles();
  if (listing.workspaceId !== expectedWorkspaceId) {
    throw new Error("Companion workspace identity changed; unlink it before connecting another workspace.");
  }
  enforceListingLimits(listing.files, limits);
  const files = await mapWithConcurrency(listing.files, 8, (metadata) => client.readWorkspaceFile(metadata.path, limits.maxFileBytes));
  const tree: LocalFolderSyncTree = new Map();
  const etags = new Map<string, string>();
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const listed = listing.files[index];
    if (file.path !== listed.path || file.etag !== listed.etag || file.size !== listed.size) {
      throw new CompanionWorkspaceConflictError([listed.path], [], true);
    }
    tree.set(file.path, {
      kind: "file",
      path: file.path,
      bytes: base64Bytes(file.content),
      modifiedAt: file.modifiedAt
    });
    etags.set(file.path, file.etag);
  }
  addParentFolders(tree);
  return { tree, etags, workspaceId: listing.workspaceId };
}

function addParentFolders(tree: LocalFolderSyncTree): void {
  for (const path of [...tree.keys()]) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const parent = segments.slice(0, index).join("/");
      if (!tree.has(parent)) tree.set(parent, { kind: "folder", path: parent, modifiedAt: 0 });
    }
  }
}

export function createCompanionWorkspaceProjectTree(project: TyprProjectRepository): LocalFolderSyncTree {
  const tree = createProjectSyncTree(project);
  for (const [path, entry] of tree) {
    if (entry.kind === "folder" && ![...tree.values()].some((candidate) =>
      candidate.kind === "file" && candidate.path.startsWith(`${path}/`))) {
      tree.delete(path);
    }
  }
  return tree;
}

function enforceListingLimits(
  files: readonly { size: number }[],
  limits: WorkspaceLimits
): void {
  if (files.length > limits.maxEntries) throw new Error("Mapped workspace exceeds its advertised entry limit.");
  let total = 0;
  for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limits.maxFileBytes) {
      throw new Error("Mapped workspace contains a file above its advertised limit.");
    }
    total += file.size;
    if (!Number.isSafeInteger(total) || total > limits.maxWorkspaceBytes) {
      throw new Error("Mapped workspace exceeds its advertised byte limit.");
    }
  }
}

function enforceTreeLimits(tree: LocalFolderSyncTree, limits: WorkspaceLimits, label: string): void {
  const files = [...tree.values()].filter(isFileEntry);
  enforceListingLimits(files.map((entry) => ({ size: entry.bytes?.byteLength ?? 0 })), limits);
  if (files.length > limits.maxEntries) throw new Error(`${label} exceeds the advertised entry limit.`);
}

function isFileEntry(entry: LocalFolderSyncEntry): entry is LocalFolderSyncEntry & { kind: "file" } {
  return entry.kind === "file";
}

function requiredEtag(etags: Map<string, string>, path: string): string {
  const etag = etags.get(path);
  if (!etag) throw new Error(`Mapped workspace file is missing its ETag: ${path}`);
  return etag;
}

function base64Bytes(content: string): Uint8Array {
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pathDepth(path: string): number {
  return path.split("/").length;
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort();
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}
