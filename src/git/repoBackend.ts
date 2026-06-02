import { unzlib, unzlibSync, zlib, zlibSync } from "fflate";
import {
  deleteProjectPath,
  ensureProjectFolder,
  isReservedGitPath,
  listProjectEntries,
  listProjectFiles,
  normalizeProjectPath,
  readProjectFileBytes,
  writeProjectFile,
  type ProjectFileContent,
  type ProjectFilesystemEntry,
  type TyprProjectRepository
} from "../project/projectState";
import {
  deleteProjectGitFile,
  listProjectGitFiles,
  readProjectGitFile,
  writeProjectGitFile
} from "../storage/indexedDbStorage";

const DEFAULT_BRANCH = "main";
const MERGE_STATE_FILE = "MERGE_STATE.json";
const DEFAULT_AUTHOR: RepoAuthor = {
  name: "Typr Local",
  email: "typr-local@example.invalid"
};
const TEXT_EXTENSIONS = new Set(["typ", "tex", "txt", "md", "json", "yaml", "yml", "csv"]);

const ENGINE_NOTE = [
  "Typr browser git backend",
  "",
  "This repository is stored in browser-managed IndexedDB under the owning Typr project.",
  "The working tree is the project filesystem and .git is a hidden reserved namespace.",
  "The backend writes Git-compatible HEAD, refs, a binary index, and compressed loose objects.",
  "Remote transport and merge conflict application are intentionally outside this local phase.",
  "File modes are normalized to 100644; symlinks and executable bits are not supported."
].join("\n");

export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepoError };

export interface RepoError {
  code:
    | "not-found"
    | "not-initialized"
    | "invalid-path"
    | "invalid-ref"
    | "unsafe-worktree"
    | "nothing-to-commit"
    | "invalid-author"
    | "invalid-message"
    | "merge-conflict"
    | "unsupported"
    | "corrupt-repository"
    | "storage-error";
  message: string;
  recoverable: boolean;
}

export interface RepoAuthor {
  name: string;
  email: string;
}

export interface RepoStatusEntry {
  path: string;
  staged: "added" | "modified" | "deleted" | null;
  worktree: "modified" | "deleted" | "untracked" | null;
}

export interface RepoStatus {
  branch: string;
  headSha: string | null;
  entries: RepoStatusEntry[];
  mergeState: RepoMergeState | null;
}

export interface RepoMergeFile {
  path: string;
  state: "conflict" | "local-only" | "remote-only" | "same-result";
  baseOid: string | null;
  localOid: string | null;
  remoteOid: string | null;
}

export interface RepoMergeState {
  kind: "diverged-pull";
  branch: string;
  remoteName: string;
  remoteBranch: string;
  baseSha: string | null;
  localSha: string;
  remoteSha: string;
  startedAt: string;
  files: RepoMergeFile[];
  conflictCount: number;
}

export interface RepoMergeResolution {
  path: string;
  content?: ProjectFileContent | null;
  oid?: string | null;
}

export interface RepoBranch {
  name: string;
  sha: string | null;
  current: boolean;
}

export interface RepoCommit {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentShas: string[];
}

export interface RepoCommitDetails extends RepoCommit {
  treeSha: string;
  committerName: string;
  committerEmail: string;
  committedAt: string;
  authorTimezone: string;
  committerTimezone: string;
}

export interface RepoTreeEntry {
  path: string;
  oid: string;
  mode: "100644" | "100755";
  size: number;
}

export interface RepoObject {
  type: "blob" | "tree" | "commit";
  content: Uint8Array;
}

export interface RepoStorageStats {
  fileCount: number;
  storedBytes: number;
  objectCount: number;
  objectBytes: number;
  objectCounts: Record<RepoObject["type"] | "unknown", number>;
  objectBytesByType: Record<RepoObject["type"] | "unknown", number>;
}

export interface RepoPruneResult {
  deletedObjectCount: number;
  deletedBytes: number;
  retainedObjectCount: number;
}

export interface RepoTrackedFile {
  path: string;
  content: ProjectFileContent;
}

export interface GitFileStorage {
  readFile(projectId: string, path: string): Promise<Uint8Array | null>;
  writeFile(projectId: string, path: string, content: Uint8Array): Promise<void>;
  deleteFile(projectId: string, path: string): Promise<void>;
  listFiles(projectId: string, prefix?: string): Promise<string[]>;
}

export interface RepoBackend {
  initRepository(project: TyprProjectRepository): Promise<RepoResult<TyprProjectRepository>>;
  openRepository(project: TyprProjectRepository): Promise<RepoResult<RepoStatus>>;
  getCurrentBranch(project: TyprProjectRepository): Promise<RepoResult<string>>;
  status(project: TyprProjectRepository): Promise<RepoResult<RepoStatus>>;
  getMergeState(project: TyprProjectRepository): Promise<RepoResult<RepoMergeState | null>>;
  beginDivergedPull(
    project: TyprProjectRepository,
    options: {
      branch: string;
      remoteName: string;
      remoteBranch: string;
      localSha: string;
      remoteSha: string;
    }
  ): Promise<RepoResult<RepoMergeState>>;
  abortMerge(project: TyprProjectRepository): Promise<RepoResult<RepoStatus>>;
  continueMerge(
    project: TyprProjectRepository,
    options: { message: string; resolutions: RepoMergeResolution[]; author?: Partial<RepoAuthor> }
  ): Promise<RepoResult<{ project: TyprProjectRepository; commit: RepoCommit; status: RepoStatus }>>;
  stagePaths(project: TyprProjectRepository, paths: string[]): Promise<RepoResult<RepoStatus>>;
  resetIndex(project: TyprProjectRepository, paths?: string[]): Promise<RepoResult<RepoStatus>>;
  commit(
    project: TyprProjectRepository,
    options: { message: string; author?: Partial<RepoAuthor> }
  ): Promise<RepoResult<RepoCommit>>;
  listBranches(project: TyprProjectRepository): Promise<RepoResult<RepoBranch[]>>;
  createBranch(project: TyprProjectRepository, name: string): Promise<RepoResult<RepoBranch>>;
  switchBranch(
    project: TyprProjectRepository,
    name: string
  ): Promise<RepoResult<{ project: TyprProjectRepository; branch: RepoBranch }>>;
  log(project: TyprProjectRepository, limit?: number): Promise<RepoResult<RepoCommit[]>>;
  readTrackedFiles(project: TyprProjectRepository): Promise<RepoResult<RepoTrackedFile[]>>;
  getRef(project: TyprProjectRepository, refPath: string): Promise<RepoResult<string | null>>;
  setRef(project: TyprProjectRepository, refPath: string, sha: string | null): Promise<RepoResult<void>>;
  listRefs(project: TyprProjectRepository, prefix?: string): Promise<RepoResult<Record<string, string>>>;
  hasObject(project: TyprProjectRepository, sha: string): Promise<RepoResult<boolean>>;
  readObject(project: TyprProjectRepository, sha: string): Promise<RepoResult<RepoObject>>;
  writeObject(
    project: TyprProjectRepository,
    type: RepoObject["type"],
    content: Uint8Array
  ): Promise<RepoResult<string>>;
  getStorageStats(project: TyprProjectRepository): Promise<RepoResult<RepoStorageStats>>;
  pruneObjects(project: TyprProjectRepository): Promise<RepoResult<RepoPruneResult>>;
  readCommitDetails(project: TyprProjectRepository, sha: string): Promise<RepoResult<RepoCommitDetails>>;
  listCommitTree(project: TyprProjectRepository, commitSha: string): Promise<RepoResult<RepoTreeEntry[]>>;
  writeTree(project: TyprProjectRepository, entries: RepoTreeEntry[]): Promise<RepoResult<string>>;
  fastForwardBranch(
    project: TyprProjectRepository,
    branch: string,
    sha: string
  ): Promise<RepoResult<{ project: TyprProjectRepository; status: RepoStatus }>>;
  isAncestor(project: TyprProjectRepository, ancestorSha: string, descendantSha: string): Promise<RepoResult<boolean>>;
}

export function createRepoBackend(storage: GitFileStorage = createIndexedDbGitFileStorage()): RepoBackend {
  return {
    initRepository: (project) => asResult(() => initRepository(storage, project)),
    openRepository: (project) => asResult(() => openRepository(storage, project)),
    getCurrentBranch: (project) => asResult(() => getCurrentBranch(storage, project)),
    status: (project) => asResult(() => getStatus(storage, project)),
    getMergeState: (project) => asResult(() => getMergeState(storage, project)),
    beginDivergedPull: (project, mergeOptions) =>
      asResult(() => beginDivergedPull(storage, project, mergeOptions)),
    abortMerge: (project) => asResult(() => abortMerge(storage, project)),
    continueMerge: (project, options) => asResult(() => continueMerge(storage, project, options)),
    stagePaths: (project, paths) => asResult(() => stagePaths(storage, project, paths)),
    resetIndex: (project, paths) => asResult(() => resetIndex(storage, project, paths)),
    commit: (project, options) => asResult(() => commit(storage, project, options)),
    listBranches: (project) => asResult(() => listBranches(storage, project)),
    createBranch: (project, name) => asResult(() => createBranch(storage, project, name)),
    switchBranch: (project, name) => asResult(() => switchBranch(storage, project, name)),
    log: (project, limit) => asResult(() => getLog(storage, project, limit)),
    readTrackedFiles: (project) => asResult(() => readTrackedFiles(storage, project)),
    getRef: (project, refPath) => asResult(() => getRef(storage, project, refPath)),
    setRef: (project, refPath, sha) => asResult(() => setRef(storage, project, refPath, sha)),
    listRefs: (project, prefix) => asResult(() => listRefs(storage, project, prefix)),
    hasObject: (project, sha) => asResult(() => hasObject(storage, project, sha)),
    readObject: (project, sha) => asResult(() => readAnyObject(storage, project.id, validateSha(sha))),
    writeObject: (project, type, content) =>
      asResult(async () => {
        await assertRepositoryExists(storage, project.id);
        return writeObject(storage, project.id, type, content);
      }),
    getStorageStats: (project) => asResult(() => getStorageStats(storage, project)),
    pruneObjects: (project) => asResult(() => pruneObjects(storage, project)),
    readCommitDetails: (project, sha) => asResult(() => readCommitDetails(storage, project, sha)),
    listCommitTree: (project, commitSha) => asResult(() => listCommitTree(storage, project, commitSha)),
    writeTree: (project, entries) => asResult(() => writeTree(storage, project, entries)),
    fastForwardBranch: (project, branch, sha) =>
      asResult(() => fastForwardBranch(storage, project, branch, sha)),
    isAncestor: (project, ancestorSha, descendantSha) =>
      asResult(() => isAncestor(storage, project, ancestorSha, descendantSha))
  };
}

export function createMemoryGitFileStorage(): GitFileStorage {
  const files = new Map<string, Uint8Array>();
  const key = (projectId: string, path: string) => `${projectId}/${normalizeGitStoragePath(path)}`;

  return {
    async readFile(projectId, path) {
      return files.get(key(projectId, path)) ?? null;
    },
    async writeFile(projectId, path, content) {
      files.set(key(projectId, path), new Uint8Array(content));
    },
    async deleteFile(projectId, path) {
      files.delete(key(projectId, path));
    },
    async listFiles(projectId, prefix = "") {
      const keyPrefix = key(projectId, prefix);
      const projectPrefix = key(projectId, "");
      return [...files.keys()]
        .filter((fileKey) => fileKey.startsWith(keyPrefix))
        .map((fileKey) => fileKey.slice(projectPrefix.length))
        .sort((left, right) => left.localeCompare(right));
    }
  };
}

export function createIndexedDbGitFileStorage(): GitFileStorage {
  return {
    readFile: readProjectGitFile,
    writeFile: writeProjectGitFile,
    deleteFile: deleteProjectGitFile,
    listFiles: listProjectGitFiles
  };
}

export function formatRepoError(error: RepoError): string {
  return error.message;
}

async function initRepository(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<TyprProjectRepository> {
  const existingHead = await readTextFile(storage, project.id, "HEAD");
  if (existingHead !== null) {
    await recoverRepositoryFiles(storage, project.id);
    return markProjectReady(project, await getCurrentBranchName(storage, project.id));
  }

  await recoverRepositoryFiles(storage, project.id);
  await writeTextFile(storage, project.id, "HEAD", `ref: refs/heads/${DEFAULT_BRANCH}\n`);
  await writeTextFile(storage, project.id, "config", [
    "[core]",
    "\trepositoryformatversion = 0",
    "\tfilemode = false",
    "\tbare = false",
    "\tlogallrefupdates = true",
    "[user]",
    `\tname = ${DEFAULT_AUTHOR.name}`,
    `\temail = ${DEFAULT_AUTHOR.email}`,
    ""
  ].join("\n"));
  await writeTextFile(storage, project.id, "ENGINE.md", ENGINE_NOTE);
  await writeIndex(storage, project.id, []);

  return markProjectReady(project, DEFAULT_BRANCH);
}

async function openRepository(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<RepoStatus> {
  await assertRepositoryExists(storage, project.id);
  return getStatus(storage, project);
}

async function recoverRepositoryFiles(storage: GitFileStorage, projectId: string): Promise<void> {
  const head = await readTextFile(storage, projectId, "HEAD");
  const index = await storage.readFile(projectId, "index");
  if (head === null) {
    await writeTextFile(storage, projectId, "HEAD", `ref: refs/heads/${DEFAULT_BRANCH}\n`);
  }
  if (index === null) {
    await writeIndex(storage, projectId, []);
  } else {
    try {
      parseIndex(index);
    } catch {
      await writeIndex(storage, projectId, []);
    }
  }
  if ((await readTextFile(storage, projectId, "ENGINE.md")) === null) {
    await writeTextFile(storage, projectId, "ENGINE.md", ENGINE_NOTE);
  }
}

async function getCurrentBranch(storage: GitFileStorage, project: TyprProjectRepository): Promise<string> {
  await assertRepositoryExists(storage, project.id);
  return getCurrentBranchName(storage, project.id);
}

async function getMergeState(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<RepoMergeState | null> {
  await assertRepositoryExists(storage, project.id);
  return readMergeState(storage, project.id);
}

async function beginDivergedPull(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  options: {
    branch: string;
    remoteName: string;
    remoteBranch: string;
    localSha: string;
    remoteSha: string;
  }
): Promise<RepoMergeState> {
  await assertRepositoryExists(storage, project.id);
  const existingState = await readMergeState(storage, project.id);
  if (existingState) {
    return existingState;
  }

  const branch = validateBranchName(options.branch);
  const remoteName = validateRemoteName(options.remoteName);
  const remoteBranch = validateBranchName(options.remoteBranch);
  const localSha = validateSha(options.localSha);
  const remoteSha = validateSha(options.remoteSha);
  await readObject(storage, project.id, localSha, "commit");
  await readObject(storage, project.id, remoteSha, "commit");
  const baseSha = await findMergeBase(storage, project.id, localSha, remoteSha);
  const files = await buildMergeFiles(storage, project.id, baseSha, localSha, remoteSha);
  const mergeState: RepoMergeState = {
    kind: "diverged-pull",
    branch,
    remoteName,
    remoteBranch,
    baseSha,
    localSha,
    remoteSha,
    startedAt: new Date().toISOString(),
    files,
    conflictCount: files.filter((file) => file.state === "conflict").length
  };
  await writeTextFile(storage, project.id, MERGE_STATE_FILE, JSON.stringify(mergeState, null, 2));
  return mergeState;
}

async function abortMerge(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<RepoStatus> {
  await assertRepositoryExists(storage, project.id);
  await storage.deleteFile(project.id, MERGE_STATE_FILE);
  return getStatus(storage, project);
}

async function continueMerge(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  options: { message: string; resolutions: RepoMergeResolution[]; author?: Partial<RepoAuthor> }
): Promise<{ project: TyprProjectRepository; commit: RepoCommit; status: RepoStatus }> {
  await assertRepositoryExists(storage, project.id);
  const mergeState = await readMergeState(storage, project.id);
  if (!mergeState) {
    throw repoFailure("not-found", "git merge --continue: no browser merge stop is active.", true);
  }

  const branch = await getCurrentBranchName(storage, project.id);
  if (branch !== mergeState.branch) {
    throw repoFailure(
      "merge-conflict",
      `git merge --continue: merge is for ${mergeState.branch}, but ${branch} is checked out.`,
      true
    );
  }
  const headSha = await getHeadSha(storage, project.id);
  if (headSha !== mergeState.localSha) {
    throw repoFailure(
      "merge-conflict",
      "git merge --continue: local HEAD changed after the merge stop. Abort and pull again.",
      true
    );
  }

  const message = validateCommitMessage(options.message);
  const author = validateAuthor(options.author);
  const resolutionByPath = new Map(
    options.resolutions.map((resolution) => [assertRepositoryPath(resolution.path), resolution])
  );
  const unresolvedConflict = mergeState.files.find(
    (file) => file.state === "conflict" && !resolutionByPath.has(file.path)
  );
  if (unresolvedConflict) {
    throw repoFailure(
      "merge-conflict",
      `git merge --continue: ${unresolvedConflict.path} still needs an explicit resolution.`,
      true
    );
  }

  const nextFiles = await readCommitTreeFiles(storage, project.id, mergeState.localSha);
  const remoteFiles = await readCommitTreeFiles(storage, project.id, mergeState.remoteSha);

  for (const file of mergeState.files) {
    if (file.state === "local-only") {
      continue;
    }

    if (file.state === "remote-only" || file.state === "same-result") {
      const remoteEntry = remoteFiles.get(file.path);
      if (remoteEntry) {
        nextFiles.set(file.path, remoteEntry);
      } else {
        nextFiles.delete(file.path);
      }
      continue;
    }

    const resolution = resolutionByPath.get(file.path);
    if (!resolution) {
      continue;
    }
    const resolvedEntry = await buildResolvedIndexEntry(storage, project.id, file.path, resolution);
    if (resolvedEntry) {
      nextFiles.set(file.path, resolvedEntry);
    } else {
      nextFiles.delete(file.path);
    }
  }

  const index = [...nextFiles.values()].sort(comparePathEntries);
  await writeIndex(storage, project.id, index);
  const treeSha = await writeTreeFromIndex(storage, project.id, index);
  const commit = await writeCommitObject(storage, project.id, {
    treeSha,
    parentShas: [mergeState.localSha, mergeState.remoteSha],
    message,
    author
  });
  await writeTextFile(storage, project.id, `refs/heads/${branch}`, `${commit.sha}\n`);
  await storage.deleteFile(project.id, MERGE_STATE_FILE);
  const nextProject = await applyTrackedFilesToProject(storage, project, nextFiles);
  const readyProject = markProjectReady(nextProject, branch);
  return {
    project: readyProject,
    commit,
    status: await getStatus(storage, readyProject)
  };
}

async function getStatus(storage: GitFileStorage, project: TyprProjectRepository): Promise<RepoStatus> {
  await assertRepositoryExists(storage, project.id);
  const branch = await getCurrentBranchName(storage, project.id);
  const headSha = await getHeadSha(storage, project.id);
  const headFiles = headSha ? await readCommitTreeFiles(storage, project.id, headSha) : new Map<string, IndexEntry>();
  const index = await readIndex(storage, project.id);
  const workingFiles = await buildWorkingFileMap(storage, project);
  const paths = new Set([...headFiles.keys(), ...index.map((entry) => entry.path), ...workingFiles.keys()]);
  const entries: RepoStatusEntry[] = [];

  for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
    const headEntry = headFiles.get(path) ?? null;
    const indexEntry = index.find((entry) => entry.path === path) ?? null;
    const workEntry = workingFiles.get(path) ?? null;
    const staged = compareIndexEntries(indexEntry, headEntry) ? null : classifyChange(indexEntry, headEntry);
    const worktree = compareIndexEntries(workEntry, indexEntry) ? null : classifyWorktreeChange(workEntry, indexEntry);

    if (staged || worktree) {
      entries.push({ path, staged, worktree });
    }
  }

  return { branch, headSha, entries, mergeState: await readMergeState(storage, project.id) };
}

async function stagePaths(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  paths: string[]
): Promise<RepoStatus> {
  await assertRepositoryExists(storage, project.id);
  await assertNoMergeInProgress(storage, project.id, "git add");
  const requestedPaths = normalizeRequestedPaths(paths);
  const status = await getStatus(storage, project);
  const changedPaths =
    requestedPaths.includes(".") || requestedPaths.length === 0
      ? status.entries.map((entry) => entry.path)
      : expandRequestedPaths(project, requestedPaths, true).filter((path) =>
          status.entries.some((entry) => entry.path === path)
        );
  const index = await readIndex(storage, project.id);
  const indexByPath = new Map(index.map((entry) => [entry.path, entry]));

  for (const path of changedPaths) {
    assertRepositoryPath(path);
    const bytes = readProjectFileBytes(project, path);
    if (bytes === null) {
      indexByPath.delete(path);
      continue;
    }
    const oid = await writeObject(storage, project.id, "blob", bytes);
    indexByPath.set(path, {
      path,
      oid,
      mode: "100644",
      size: bytes.byteLength
    });
  }

  await writeIndex(storage, project.id, [...indexByPath.values()].sort(comparePathEntries));
  return getStatus(storage, project);
}

async function resetIndex(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  paths: string[] = []
): Promise<RepoStatus> {
  await assertRepositoryExists(storage, project.id);
  await assertNoMergeInProgress(storage, project.id, "git reset");
  const requestedPaths = normalizeRequestedPaths(paths);
  const headSha = await getHeadSha(storage, project.id);
  const headFiles = headSha ? await readCommitTreeFiles(storage, project.id, headSha) : new Map<string, IndexEntry>();
  const index = await readIndex(storage, project.id);

  if (requestedPaths.length === 0 || requestedPaths.includes(".")) {
    await writeIndex(storage, project.id, [...headFiles.values()].sort(comparePathEntries));
    return getStatus(storage, project);
  }

  const indexByPath = new Map(index.map((entry) => [entry.path, entry]));
  for (const path of expandRequestedPaths(project, requestedPaths, true)) {
    const headEntry = headFiles.get(path);
    if (headEntry) {
      indexByPath.set(path, headEntry);
    } else {
      indexByPath.delete(path);
    }
  }

  await writeIndex(storage, project.id, [...indexByPath.values()].sort(comparePathEntries));
  return getStatus(storage, project);
}

async function commit(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  options: { message: string; author?: Partial<RepoAuthor> }
): Promise<RepoCommit> {
  await assertRepositoryExists(storage, project.id);
  await assertNoMergeInProgress(storage, project.id, "git commit");
  const message = validateCommitMessage(options.message);
  const author = validateAuthor(options.author);
  const status = await getStatus(storage, project);
  if (!status.entries.some((entry) => entry.staged !== null)) {
    throw repoFailure("nothing-to-commit", "git commit: nothing staged.", true);
  }

  const index = await readIndex(storage, project.id);
  const treeSha = await writeTreeFromIndex(storage, project.id, index);
  const parentSha = await getHeadSha(storage, project.id);
  const commit = await writeCommitObject(storage, project.id, {
    treeSha,
    parentShas: parentSha ? [parentSha] : [],
    message,
    author
  });
  const branch = await getCurrentBranchName(storage, project.id);
  await writeTextFile(storage, project.id, `refs/heads/${branch}`, `${commit.sha}\n`);

  return commit;
}

async function listBranches(storage: GitFileStorage, project: TyprProjectRepository): Promise<RepoBranch[]> {
  await assertRepositoryExists(storage, project.id);
  const current = await getCurrentBranchName(storage, project.id);
  const files = await storage.listFiles(project.id, "refs/heads/");
  const branches: RepoBranch[] = [];

  for (const file of files) {
    const name = file.slice("refs/heads/".length);
    if (!name) {
      continue;
    }
    branches.push({
      name,
      sha: (await readTextFile(storage, project.id, file))?.trim() || null,
      current: name === current
    });
  }

  if (!branches.some((branch) => branch.name === current)) {
    branches.push({
      name: current,
      sha: await getHeadSha(storage, project.id),
      current: true
    });
  }

  return branches.sort((left, right) => left.name.localeCompare(right.name));
}

async function createBranch(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  name: string
): Promise<RepoBranch> {
  await assertRepositoryExists(storage, project.id);
  await assertNoMergeInProgress(storage, project.id, "git branch");
  const branchName = validateBranchName(name);
  const existing = await readTextFile(storage, project.id, `refs/heads/${branchName}`);
  if (existing !== null) {
    throw repoFailure("invalid-ref", `git branch: branch '${branchName}' already exists.`, true);
  }
  const sha = await getHeadSha(storage, project.id);
  await writeTextFile(storage, project.id, `refs/heads/${branchName}`, sha ? `${sha}\n` : "");
  return { name: branchName, sha, current: false };
}

async function switchBranch(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  name: string
): Promise<{ project: TyprProjectRepository; branch: RepoBranch }> {
  await assertRepositoryExists(storage, project.id);
  await assertNoMergeInProgress(storage, project.id, "git switch");
  const branchName = validateBranchName(name);
  const branchSha = (await readTextFile(storage, project.id, `refs/heads/${branchName}`))?.trim() ?? null;
  if (branchSha === null) {
    throw repoFailure("not-found", `git switch: branch '${branchName}' does not exist.`, true);
  }

  const status = await getStatus(storage, project);
  if (status.entries.length > 0) {
    throw repoFailure(
      "unsafe-worktree",
      "git switch: commit or reset local changes before switching branches.",
      true
    );
  }

  await writeTextFile(storage, project.id, "HEAD", `ref: refs/heads/${branchName}\n`);
  const files = branchSha ? await readCommitTreeFiles(storage, project.id, branchSha) : new Map<string, IndexEntry>();
  await writeIndex(storage, project.id, [...files.values()].sort(comparePathEntries));
  const nextProject = await applyTrackedFilesToProject(storage, project, files);

  return {
    project: markProjectReady(nextProject, branchName),
    branch: { name: branchName, sha: branchSha || null, current: true }
  };
}

async function getLog(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  limit = 20
): Promise<RepoCommit[]> {
  await assertRepositoryExists(storage, project.id);
  const commits: RepoCommit[] = [];
  let sha = await getHeadSha(storage, project.id);

  while (sha && commits.length < limit) {
    const parsed = await readCommit(storage, project.id, sha);
    commits.push(parsed);
    sha = parsed.parentShas[0] ?? null;
  }

  return commits;
}

async function readTrackedFiles(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<RepoTrackedFile[]> {
  await assertRepositoryExists(storage, project.id);
  const headSha = await getHeadSha(storage, project.id);
  if (!headSha) {
    return [];
  }
  const files = await readCommitTreeFiles(storage, project.id, headSha);
  const tracked: RepoTrackedFile[] = [];

  for (const entry of [...files.values()].sort(comparePathEntries)) {
    const bytes = await readObject(storage, project.id, entry.oid, "blob");
    tracked.push({
      path: entry.path,
      content: decodeProjectContent(entry.path, bytes)
    });
  }

  return tracked;
}

async function getRef(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  refPath: string
): Promise<string | null> {
  await assertRepositoryExists(storage, project.id);
  const normalizedRef = validateRefPath(refPath);
  return (await readTextFile(storage, project.id, normalizedRef))?.trim() || null;
}

async function setRef(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  refPath: string,
  sha: string | null
): Promise<void> {
  await assertRepositoryExists(storage, project.id);
  const normalizedRef = validateRefPath(refPath);
  if (sha === null) {
    await storage.deleteFile(project.id, normalizedRef);
    return;
  }
  await writeTextFile(storage, project.id, normalizedRef, `${validateSha(sha)}\n`);
}

async function listRefs(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  prefix = "refs/"
): Promise<Record<string, string>> {
  await assertRepositoryExists(storage, project.id);
  const normalizedPrefix = validateRefPrefix(prefix);
  const files = await storage.listFiles(project.id, normalizedPrefix);
  const refs: Record<string, string> = {};
  for (const file of files) {
    const value = (await readTextFile(storage, project.id, file))?.trim();
    if (value) {
      refs[file] = value;
    }
  }
  return refs;
}

async function getStorageStats(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<RepoStorageStats> {
  await assertRepositoryExists(storage, project.id);
  const files = await storage.listFiles(project.id);
  const stats: RepoStorageStats = {
    fileCount: 0,
    storedBytes: 0,
    objectCount: 0,
    objectBytes: 0,
    objectCounts: {
      blob: 0,
      tree: 0,
      commit: 0,
      unknown: 0
    },
    objectBytesByType: {
      blob: 0,
      tree: 0,
      commit: 0,
      unknown: 0
    }
  };

  for (const file of files) {
    const bytes = await storage.readFile(project.id, file);
    if (!bytes) {
      continue;
    }
    stats.fileCount += 1;
    stats.storedBytes += bytes.byteLength;

    if (!isObjectStoragePath(file)) {
      continue;
    }

    const objectType = readStoredObjectType(bytes);
    stats.objectCount += 1;
    stats.objectBytes += bytes.byteLength;
    stats.objectCounts[objectType] += 1;
    stats.objectBytesByType[objectType] += bytes.byteLength;
  }

  return stats;
}

async function pruneObjects(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<RepoPruneResult> {
  await assertRepositoryExists(storage, project.id);
  const reachableObjects = await collectReachableObjectShas(storage, project);
  const objectFiles = (await storage.listFiles(project.id, "objects/")).filter(isObjectStoragePath);
  let deletedObjectCount = 0;
  let deletedBytes = 0;
  let retainedObjectCount = 0;

  for (const file of objectFiles) {
    const sha = objectPathToSha(file);
    if (!sha || reachableObjects.has(sha)) {
      retainedObjectCount += 1;
      continue;
    }

    const bytes = await storage.readFile(project.id, file);
    deletedBytes += bytes?.byteLength ?? 0;
    await storage.deleteFile(project.id, file);
    deletedObjectCount += 1;
  }

  return {
    deletedObjectCount,
    deletedBytes,
    retainedObjectCount
  };
}

async function hasObject(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  sha: string
): Promise<boolean> {
  await assertRepositoryExists(storage, project.id);
  const objectSha = validateSha(sha);
  return (await storage.readFile(project.id, `objects/${objectSha.slice(0, 2)}/${objectSha.slice(2)}`)) !== null;
}

async function readCommitDetails(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  sha: string
): Promise<RepoCommitDetails> {
  await assertRepositoryExists(storage, project.id);
  return readCommit(storage, project.id, validateSha(sha));
}

async function listCommitTree(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  commitSha: string
): Promise<RepoTreeEntry[]> {
  await assertRepositoryExists(storage, project.id);
  const files = await readCommitTreeFiles(storage, project.id, validateSha(commitSha));
  return [...files.values()].sort(comparePathEntries);
}

async function writeTree(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  entries: RepoTreeEntry[]
): Promise<string> {
  await assertRepositoryExists(storage, project.id);
  for (const entry of entries) {
    assertRepositoryPath(entry.path);
    validateSha(entry.oid);
  }
  return writeTreeFromIndex(storage, project.id, entries);
}

async function fastForwardBranch(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  branch: string,
  sha: string
): Promise<{ project: TyprProjectRepository; status: RepoStatus }> {
  await assertRepositoryExists(storage, project.id);
  await assertNoMergeInProgress(storage, project.id, "git pull");
  const branchName = validateBranchName(branch);
  const targetSha = validateSha(sha);
  await readObject(storage, project.id, targetSha, "commit");
  const status = await getStatus(storage, project);
  if (status.entries.length > 0) {
    throw repoFailure("unsafe-worktree", "git pull: commit or reset local changes before pulling.", true);
  }
  await writeTextFile(storage, project.id, `refs/heads/${branchName}`, `${targetSha}\n`);
  await writeTextFile(storage, project.id, "HEAD", `ref: refs/heads/${branchName}\n`);
  const files = await readCommitTreeFiles(storage, project.id, targetSha);
  await writeIndex(storage, project.id, [...files.values()].sort(comparePathEntries));
  const nextProject = await applyTrackedFilesToProject(storage, project, files);
  const readyProject = markProjectReady(nextProject, branchName);
  return { project: readyProject, status: await getStatus(storage, readyProject) };
}

async function isAncestor(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  ancestorSha: string,
  descendantSha: string
): Promise<boolean> {
  await assertRepositoryExists(storage, project.id);
  const ancestor = validateSha(ancestorSha);
  const stack = [validateSha(descendantSha)];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || seen.has(sha)) {
      continue;
    }
    if (sha === ancestor) {
      return true;
    }
    seen.add(sha);
    const commit = await readCommit(storage, project.id, sha);
    stack.push(...commit.parentShas);
  }
  return false;
}

async function findMergeBase(
  storage: GitFileStorage,
  projectId: string,
  leftSha: string,
  rightSha: string
): Promise<string | null> {
  const leftAncestors = await collectAncestorShas(storage, projectId, leftSha);
  const stack = [rightSha];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const sha = stack.shift();
    if (!sha || seen.has(sha)) {
      continue;
    }
    if (leftAncestors.has(sha)) {
      return sha;
    }
    seen.add(sha);
    const commit = await readCommit(storage, projectId, sha);
    stack.push(...commit.parentShas);
  }

  return null;
}

async function collectAncestorShas(
  storage: GitFileStorage,
  projectId: string,
  startSha: string
): Promise<Set<string>> {
  const ancestors = new Set<string>();
  const stack = [startSha];

  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || ancestors.has(sha)) {
      continue;
    }
    ancestors.add(sha);
    const commit = await readCommit(storage, projectId, sha);
    stack.push(...commit.parentShas);
  }

  return ancestors;
}

async function buildMergeFiles(
  storage: GitFileStorage,
  projectId: string,
  baseSha: string | null,
  localSha: string,
  remoteSha: string
): Promise<RepoMergeFile[]> {
  const baseFiles = baseSha
    ? await readCommitTreeFiles(storage, projectId, baseSha)
    : new Map<string, IndexEntry>();
  const localFiles = await readCommitTreeFiles(storage, projectId, localSha);
  const remoteFiles = await readCommitTreeFiles(storage, projectId, remoteSha);
  const paths = new Set([...baseFiles.keys(), ...localFiles.keys(), ...remoteFiles.keys()]);
  const files: RepoMergeFile[] = [];

  for (const path of [...paths].sort((left, right) => left.localeCompare(right))) {
    const baseOid = baseFiles.get(path)?.oid ?? null;
    const localOid = localFiles.get(path)?.oid ?? null;
    const remoteOid = remoteFiles.get(path)?.oid ?? null;
    const localChanged = localOid !== baseOid;
    const remoteChanged = remoteOid !== baseOid;

    if (!localChanged && !remoteChanged) {
      continue;
    }

    if (localChanged && remoteChanged) {
      files.push({
        path,
        state: localOid === remoteOid ? "same-result" : "conflict",
        baseOid,
        localOid,
        remoteOid
      });
      continue;
    }

    files.push({
      path,
      state: localChanged ? "local-only" : "remote-only",
      baseOid,
      localOid,
      remoteOid
    });
  }

  return files;
}

async function buildWorkingFileMap(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<Map<string, IndexEntry>> {
  const result = new Map<string, IndexEntry>();
  for (const file of listProjectFiles(project)) {
    assertRepositoryPath(file.path);
    const bytes = typeof file.content === "string" ? encodeUtf8(file.content) : file.content;
    const oid = await writeObject(storage, project.id, "blob", bytes);
    result.set(file.path, {
      path: file.path,
      oid,
      mode: "100644",
      size: bytes.byteLength
    });
  }
  return result;
}

async function applyTrackedFilesToProject(
  storage: GitFileStorage,
  project: TyprProjectRepository,
  files: Map<string, IndexEntry>
): Promise<TyprProjectRepository> {
  let nextProject = project;
  const nextPaths = new Set(files.keys());
  const previousEntries = new Map(listProjectEntries(project).map((entry) => [entry.path, entry]));

  for (const entry of listProjectEntries(project)) {
    if (!nextPaths.has(entry.path)) {
      nextProject = deleteProjectPath(nextProject, entry.path);
    }
  }

  for (const path of nextPaths) {
    const parentPaths = getParentPaths(path);
    for (const parentPath of parentPaths) {
      nextProject = ensureProjectFolder(
        nextProject,
        parentPath,
        previousEntries.get(parentPath)?.source
      );
    }
    const entry = files.get(path);
    if (!entry) {
      continue;
    }
    const bytes = await readObject(storage, project.id, entry.oid, "blob");
    nextProject = writeProjectFile(
      nextProject,
      path,
      decodeProjectContent(path, bytes, previousEntries.get(path)),
      previousEntries.get(path)?.source
    );
  }

  return nextProject;
}

async function writeTreeFromIndex(
  storage: GitFileStorage,
  projectId: string,
  entries: IndexEntry[]
): Promise<string> {
  return writeTreeNode(storage, projectId, buildTreeNode(entries));
}

async function buildResolvedIndexEntry(
  storage: GitFileStorage,
  projectId: string,
  path: string,
  resolution: RepoMergeResolution
): Promise<IndexEntry | null> {
  assertRepositoryPath(path);

  if ("content" in resolution) {
    if (resolution.content === null || resolution.content === undefined) {
      return null;
    }
    const bytes = typeof resolution.content === "string"
      ? encodeUtf8(resolution.content)
      : resolution.content;
    const oid = await writeObject(storage, projectId, "blob", bytes);
    return {
      path,
      oid,
      mode: "100644",
      size: bytes.byteLength
    };
  }

  if ("oid" in resolution) {
    if (!resolution.oid) {
      return null;
    }
    const oid = validateSha(resolution.oid);
    const bytes = await readObject(storage, projectId, oid, "blob");
    return {
      path,
      oid,
      mode: "100644",
      size: bytes.byteLength
    };
  }

  throw repoFailure("merge-conflict", `git merge --continue: ${path} has no resolution.`, true);
}

async function writeCommitObject(
  storage: GitFileStorage,
  projectId: string,
  options: {
    treeSha: string;
    parentShas: string[];
    message: string;
    author: RepoAuthor;
  }
): Promise<RepoCommit> {
  const now = Math.floor(Date.now() / 1000);
  const timezone = formatTimezoneOffset(new Date());
  const parentLines = options.parentShas.map((parentSha) => `parent ${validateSha(parentSha)}`);
  const header = [
    `tree ${validateSha(options.treeSha)}`,
    ...parentLines,
    `author ${options.author.name} <${options.author.email}> ${now} ${timezone}`,
    `committer ${options.author.name} <${options.author.email}> ${now} ${timezone}`,
    ""
  ];
  const sha = await writeObject(
    storage,
    projectId,
    "commit",
    encodeUtf8(`${header.join("\n")}\n${options.message}\n`)
  );

  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: options.message,
    authorName: options.author.name,
    authorEmail: options.author.email,
    authoredAt: new Date(now * 1000).toISOString(),
    parentShas: options.parentShas
  };
}

async function writeTreeNode(
  storage: GitFileStorage,
  projectId: string,
  node: TreeNode
): Promise<string> {
  const chunks: Uint8Array[] = [];
  const children = [...node.children.entries()].sort(([left], [right]) => left.localeCompare(right));

  for (const [name, child] of children) {
    if (child.kind === "file") {
      chunks.push(encodeUtf8(`${child.entry.mode} ${name}\0`), hexToBytes(child.entry.oid));
      continue;
    }
    const treeSha = await writeTreeNode(storage, projectId, child.node);
    chunks.push(encodeUtf8(`40000 ${name}\0`), hexToBytes(treeSha));
  }

  return writeObject(storage, projectId, "tree", concatBytes(chunks));
}

function buildTreeNode(entries: IndexEntry[]): TreeNode {
  const root: TreeNode = { children: new Map() };
  for (const entry of entries.sort(comparePathEntries)) {
    const segments = entry.path.split("/");
    const fileName = segments.pop();
    if (!fileName) {
      continue;
    }
    let node = root;
    for (const segment of segments) {
      const existing = node.children.get(segment);
      if (existing?.kind === "tree") {
        node = existing.node;
        continue;
      }
      const child: TreeNode = { children: new Map() };
      node.children.set(segment, { kind: "tree", node: child });
      node = child;
    }
    node.children.set(fileName, { kind: "file", entry });
  }
  return root;
}

async function readCommitTreeFiles(
  storage: GitFileStorage,
  projectId: string,
  commitSha: string
): Promise<Map<string, IndexEntry>> {
  const commit = parseCommitText(decodeUtf8(await readObject(storage, projectId, commitSha, "commit")), commitSha);
  const treeSha = commit.treeSha;
  const result = new Map<string, IndexEntry>();
  await collectTreeFiles(storage, projectId, treeSha, "", result);
  return result;
}

async function collectTreeFiles(
  storage: GitFileStorage,
  projectId: string,
  treeSha: string,
  prefix: string,
  result: Map<string, IndexEntry>
): Promise<void> {
  const tree = await readObject(storage, projectId, treeSha, "tree");
  let offset = 0;
  while (offset < tree.length) {
    const modeEnd = indexOfByte(tree, 0x20, offset);
    const nameEnd = indexOfByte(tree, 0x00, modeEnd + 1);
    const mode = decodeUtf8(tree.slice(offset, modeEnd));
    const name = decodeUtf8(tree.slice(modeEnd + 1, nameEnd));
    const oid = bytesToHex(tree.slice(nameEnd + 1, nameEnd + 21));
    const path = prefix ? `${prefix}/${name}` : name;
    offset = nameEnd + 21;

    if (mode === "40000") {
      await collectTreeFiles(storage, projectId, oid, path, result);
    } else {
      const bytes = await storage.readFile(projectId, objectShaToObjectPath(oid));
      result.set(path, {
        path,
        oid,
        mode: "100644",
        size: bytes ? unzlibObjectContentSize(bytes) : 0
      });
    }
  }
}

async function readCommit(
  storage: GitFileStorage,
  projectId: string,
  sha: string
): Promise<RepoCommitDetails> {
  return parseCommitText(decodeUtf8(await readObject(storage, projectId, sha, "commit")), sha);
}

function parseCommitText(text: string, sha: string): RepoCommitDetails {
  const [rawHeaders, ...messageParts] = text.split("\n\n");
  const headers = rawHeaders.split("\n");
  const treeSha = headers.find((line) => line.startsWith("tree "))?.slice(5).trim() ?? "";
  const parentShas = headers.filter((line) => line.startsWith("parent ")).map((line) => line.slice(7).trim());
  const authorLine = headers.find((line) => line.startsWith("author ")) ?? "";
  const committerLine = headers.find((line) => line.startsWith("committer ")) ?? "";
  const authorMatch = /^author (.*) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(authorLine);
  const committerMatch = /^committer (.*) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(committerLine);
  const message = messageParts.join("\n\n").trim();

  if (!treeSha) {
    throw repoFailure("corrupt-repository", `Commit ${sha.slice(0, 7)} is missing a tree.`, true);
  }

  return {
    sha,
    shortSha: sha.slice(0, 7),
    treeSha,
    message,
    authorName: authorMatch?.[1] ?? "Unknown",
    authorEmail: authorMatch?.[2] ?? "",
    authoredAt: authorMatch ? new Date(Number(authorMatch[3]) * 1000).toISOString() : "",
    parentShas,
    committerName: committerMatch?.[1] ?? authorMatch?.[1] ?? "Unknown",
    committerEmail: committerMatch?.[2] ?? authorMatch?.[2] ?? "",
    committedAt: committerMatch ? new Date(Number(committerMatch[3]) * 1000).toISOString() : "",
    authorTimezone: authorMatch?.[4] ?? "+0000",
    committerTimezone: committerMatch?.[4] ?? authorMatch?.[4] ?? "+0000"
  };
}

async function writeObject(
  storage: GitFileStorage,
  projectId: string,
  type: "blob" | "tree" | "commit",
  content: Uint8Array
): Promise<string> {
  const payload = concatBytes([encodeUtf8(`${type} ${content.byteLength}\0`), content]);
  const sha = await sha1Hex(payload);
  const path = `objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
  if ((await storage.readFile(projectId, path)) === null) {
    await storage.writeFile(projectId, path, await zlibAsync(payload));
  }
  return sha;
}

async function readObject(
  storage: GitFileStorage,
  projectId: string,
  sha: string,
  expectedType: "blob" | "tree" | "commit"
): Promise<Uint8Array> {
  const compressed = await storage.readFile(projectId, `objects/${sha.slice(0, 2)}/${sha.slice(2)}`);
  if (!compressed) {
    throw repoFailure("corrupt-repository", `Missing git object ${sha}.`, true);
  }

  const payload = await unzlibAsync(compressed);
  const headerEnd = indexOfByte(payload, 0x00, 0);
  const header = decodeUtf8(payload.slice(0, headerEnd));
  const [type, sizeText] = header.split(" ");
  if (type !== expectedType) {
    throw repoFailure("corrupt-repository", `Expected ${expectedType} object ${sha}, found ${type}.`, true);
  }
  const content = payload.slice(headerEnd + 1);
  if (content.byteLength !== Number(sizeText)) {
    throw repoFailure("corrupt-repository", `Git object ${sha} has an invalid size.`, true);
  }
  return content;
}

async function readAnyObject(
  storage: GitFileStorage,
  projectId: string,
  sha: string
): Promise<RepoObject> {
  const compressed = await storage.readFile(projectId, `objects/${sha.slice(0, 2)}/${sha.slice(2)}`);
  if (!compressed) {
    throw repoFailure("corrupt-repository", `Missing git object ${sha}.`, true);
  }

  const payload = await unzlibAsync(compressed);
  const headerEnd = indexOfByte(payload, 0x00, 0);
  const header = decodeUtf8(payload.slice(0, headerEnd));
  const [type, sizeText] = header.split(" ");
  if (type !== "blob" && type !== "tree" && type !== "commit") {
    throw repoFailure("unsupported", `Git object ${sha} has unsupported type ${type}.`, true);
  }
  const content = payload.slice(headerEnd + 1);
  if (content.byteLength !== Number(sizeText)) {
    throw repoFailure("corrupt-repository", `Git object ${sha} has an invalid size.`, true);
  }
  return { type, content };
}

async function collectReachableObjectShas(
  storage: GitFileStorage,
  project: TyprProjectRepository
): Promise<Set<string>> {
  const reachable = new Set<string>();
  const commitRoots = new Set<string>();
  const headSha = await getHeadSha(storage, project.id);
  if (headSha) {
    commitRoots.add(headSha);
  }

  for (const sha of Object.values(await listRefs(storage, project))) {
    commitRoots.add(sha);
  }

  const mergeState = await readMergeState(storage, project.id);
  if (mergeState) {
    if (mergeState.baseSha) {
      commitRoots.add(mergeState.baseSha);
    }
    commitRoots.add(mergeState.localSha);
    commitRoots.add(mergeState.remoteSha);
    for (const file of mergeState.files) {
      if (file.baseOid) {
        reachable.add(file.baseOid);
      }
      if (file.localOid) {
        reachable.add(file.localOid);
      }
      if (file.remoteOid) {
        reachable.add(file.remoteOid);
      }
    }
  }

  for (const entry of await readIndex(storage, project.id)) {
    reachable.add(entry.oid);
  }

  for (const sha of commitRoots) {
    await collectReachableCommitObjects(storage, project.id, sha, reachable);
  }

  return reachable;
}

async function collectReachableCommitObjects(
  storage: GitFileStorage,
  projectId: string,
  commitSha: string,
  reachable: Set<string>
): Promise<void> {
  const stack = [validateSha(commitSha)];
  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || reachable.has(sha)) {
      continue;
    }
    const commit = await readCommit(storage, projectId, sha);
    reachable.add(sha);
    await collectReachableTreeObjects(storage, projectId, commit.treeSha, reachable);
    stack.push(...commit.parentShas);
  }
}

async function collectReachableTreeObjects(
  storage: GitFileStorage,
  projectId: string,
  treeSha: string,
  reachable: Set<string>
): Promise<void> {
  const normalizedTreeSha = validateSha(treeSha);
  if (reachable.has(normalizedTreeSha)) {
    return;
  }

  const tree = await readObject(storage, projectId, normalizedTreeSha, "tree");
  reachable.add(normalizedTreeSha);
  let offset = 0;
  while (offset < tree.length) {
    const modeEnd = indexOfByte(tree, 0x20, offset);
    const nameEnd = indexOfByte(tree, 0x00, modeEnd + 1);
    const mode = decodeUtf8(tree.slice(offset, modeEnd));
    const oid = bytesToHex(tree.slice(nameEnd + 1, nameEnd + 21));
    offset = nameEnd + 21;

    if (mode === "40000") {
      await collectReachableTreeObjects(storage, projectId, oid, reachable);
    } else if (await hasStoredObject(storage, projectId, oid)) {
      reachable.add(oid);
    }
  }
}

async function hasStoredObject(
  storage: GitFileStorage,
  projectId: string,
  sha: string
): Promise<boolean> {
  const objectSha = validateSha(sha);
  return (await storage.readFile(projectId, objectShaToObjectPath(objectSha))) !== null;
}

function readStoredObjectType(bytes: Uint8Array): RepoObject["type"] | "unknown" {
  try {
    const payload = unzlibSync(bytes);
    const headerEnd = indexOfByte(payload, 0x00, 0);
    const header = decodeUtf8(payload.slice(0, headerEnd));
    const [type] = header.split(" ");
    return type === "blob" || type === "tree" || type === "commit" ? type : "unknown";
  } catch {
    return "unknown";
  }
}

function unzlibObjectContentSize(bytes: Uint8Array): number {
  try {
    const payload = unzlibSync(bytes);
    const headerEnd = indexOfByte(payload, 0x00, 0);
    return payload.byteLength - headerEnd - 1;
  } catch {
    return 0;
  }
}

function isObjectStoragePath(path: string): boolean {
  return /^objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/.test(path);
}

function objectPathToSha(path: string): string | null {
  if (!isObjectStoragePath(path)) {
    return null;
  }
  return `${path.slice("objects/".length, "objects/".length + 2)}${path.slice("objects/xx/".length)}`;
}

function objectShaToObjectPath(sha: string): string {
  return `objects/${sha.slice(0, 2)}/${sha.slice(2)}`;
}

async function readIndex(storage: GitFileStorage, projectId: string): Promise<IndexEntry[]> {
  const bytes = await storage.readFile(projectId, "index");
  return bytes ? parseIndex(bytes) : [];
}

async function writeIndex(
  storage: GitFileStorage,
  projectId: string,
  entries: IndexEntry[]
): Promise<void> {
  const bodyChunks: Uint8Array[] = [encodeUtf8("DIRC"), uint32be(2), uint32be(entries.length)];
  for (const entry of entries.sort(comparePathEntries)) {
    const pathBytes = encodeUtf8(entry.path);
    const fixed = new Uint8Array(62);
    const view = new DataView(fixed.buffer);
    view.setUint32(24, parseInt(entry.mode, 8));
    view.setUint32(36, entry.size);
    fixed.set(hexToBytes(entry.oid), 40);
    view.setUint16(60, Math.min(pathBytes.byteLength, 0xfff));
    const withoutPadding = concatBytes([fixed, pathBytes, new Uint8Array([0])]);
    const paddingLength = (8 - (withoutPadding.byteLength % 8)) % 8;
    bodyChunks.push(withoutPadding, new Uint8Array(paddingLength));
  }
  const body = concatBytes(bodyChunks);
  const checksum = hexToBytes(await sha1Hex(body));
  await storage.writeFile(projectId, "index", concatBytes([body, checksum]));
}

function parseIndex(bytes: Uint8Array): IndexEntry[] {
  if (decodeUtf8(bytes.slice(0, 4)) !== "DIRC") {
    throw repoFailure("corrupt-repository", "The git index is not a DIRC index.", true);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4);
  if (version !== 2) {
    throw repoFailure("unsupported", `Git index version ${version} is not supported.`, true);
  }
  const count = view.getUint32(8);
  const entries: IndexEntry[] = [];
  let offset = 12;
  for (let index = 0; index < count; index += 1) {
    const mode = view.getUint32(offset + 24).toString(8);
    const size = view.getUint32(offset + 36);
    const oid = bytesToHex(bytes.slice(offset + 40, offset + 60));
    const flags = view.getUint16(offset + 60);
    const pathLength = flags & 0xfff;
    const pathStart = offset + 62;
    const path = decodeUtf8(bytes.slice(pathStart, pathStart + pathLength));
    const entryLength = 62 + pathLength + 1;
    offset += entryLength + ((8 - (entryLength % 8)) % 8);
    entries.push({ path, oid, mode: mode === "100755" ? "100755" : "100644", size });
  }
  return entries.sort(comparePathEntries);
}

async function getHeadSha(storage: GitFileStorage, projectId: string): Promise<string | null> {
  const branch = await getCurrentBranchName(storage, projectId);
  return (await readTextFile(storage, projectId, `refs/heads/${branch}`))?.trim() || null;
}

async function getCurrentBranchName(storage: GitFileStorage, projectId: string): Promise<string> {
  const head = await readTextFile(storage, projectId, "HEAD");
  if (!head) {
    throw repoFailure("not-initialized", "This project does not have an initialized local git repository.", true);
  }
  const match = /^ref: refs\/heads\/(.+)\s*$/.exec(head);
  if (!match) {
    throw repoFailure("unsupported", "Detached HEAD is not supported by the Typr browser git backend.", true);
  }
  return match[1];
}

async function assertRepositoryExists(storage: GitFileStorage, projectId: string): Promise<void> {
  if ((await readTextFile(storage, projectId, "HEAD")) === null) {
    throw repoFailure("not-initialized", "This project does not have an initialized local git repository.", true);
  }
}

async function assertNoMergeInProgress(
  storage: GitFileStorage,
  projectId: string,
  command: string
): Promise<void> {
  const mergeState = await readMergeState(storage, projectId);
  if (!mergeState) {
    return;
  }
  throw repoFailure(
    "merge-conflict",
    `${command}: a browser merge stop is active for ${mergeState.remoteName}/${mergeState.remoteBranch}. Resolve conflicts and use 'git merge --continue -m <message>', or use 'git merge --abort' to clear it.`,
    true
  );
}

async function readMergeState(
  storage: GitFileStorage,
  projectId: string
): Promise<RepoMergeState | null> {
  const text = await readTextFile(storage, projectId, MERGE_STATE_FILE);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as Partial<RepoMergeState>;
    if (
      parsed.kind !== "diverged-pull" ||
      !parsed.branch ||
      !parsed.remoteName ||
      !parsed.remoteBranch ||
      !parsed.localSha ||
      !parsed.remoteSha ||
      !Array.isArray(parsed.files)
    ) {
      throw new Error("invalid merge state");
    }
    return {
      kind: "diverged-pull",
      branch: validateBranchName(parsed.branch),
      remoteName: validateRemoteName(parsed.remoteName),
      remoteBranch: validateBranchName(parsed.remoteBranch),
      baseSha: parsed.baseSha ? validateSha(parsed.baseSha) : null,
      localSha: validateSha(parsed.localSha),
      remoteSha: validateSha(parsed.remoteSha),
      startedAt: parsed.startedAt ?? new Date().toISOString(),
      files: parsed.files
        .map((file) => normalizeMergeFile(file))
        .sort((left, right) => left.path.localeCompare(right.path)),
      conflictCount: Number.isFinite(parsed.conflictCount)
        ? Number(parsed.conflictCount)
        : parsed.files.filter((file) => file.state === "conflict").length
    };
  } catch {
    throw repoFailure(
      "corrupt-repository",
      "The saved browser merge state is invalid. Use git merge --abort to clear it.",
      true
    );
  }
}

function normalizeMergeFile(file: Partial<RepoMergeFile>): RepoMergeFile {
  const state =
    file.state === "conflict" ||
    file.state === "local-only" ||
    file.state === "remote-only" ||
    file.state === "same-result"
      ? file.state
      : "conflict";
  return {
    path: assertRepositoryPath(file.path ?? ""),
    state,
    baseOid: file.baseOid ? validateSha(file.baseOid) : null,
    localOid: file.localOid ? validateSha(file.localOid) : null,
    remoteOid: file.remoteOid ? validateSha(file.remoteOid) : null
  };
}

function markProjectReady(project: TyprProjectRepository, branch: string): TyprProjectRepository {
  if (
    project.git.backend === "browser-git" &&
    project.git.status === "ready" &&
    project.git.headRef === `refs/heads/${branch}` &&
    project.git.initializedAt
  ) {
    return project;
  }

  const now = new Date().toISOString();
  return {
    ...project,
    git: {
      ...project.git,
      backend: "browser-git",
      status: "ready",
      headRef: `refs/heads/${branch}`,
      defaultBranch: project.git.defaultBranch ?? DEFAULT_BRANCH,
      initializedAt: project.git.initializedAt ?? now,
      recoveryMessage: null
    },
    updatedAt: now
  };
}

function normalizeRequestedPaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter(Boolean).map((path) => (path === "." ? "." : assertRepositoryPath(path)));
}

function expandRequestedPaths(
  project: TyprProjectRepository,
  paths: string[],
  includeMissing = false
): string[] {
  const files = listProjectFiles(project).map((file) => file.path);
  const expanded = new Set<string>();
  for (const requested of paths) {
    if (requested === ".") {
      files.forEach((path) => expanded.add(path));
      continue;
    }
    const matchingFiles = files.filter((path) => path === requested || path.startsWith(`${requested}/`));
    matchingFiles.forEach((path) => expanded.add(path));
    if (includeMissing && matchingFiles.length === 0) {
      expanded.add(requested);
    }
  }
  return [...expanded].sort((left, right) => left.localeCompare(right));
}

function assertRepositoryPath(path: string): string {
  let normalizedPath = "";
  try {
    normalizedPath = normalizeProjectPath(path);
  } catch (error) {
    throw repoFailure(
      "invalid-path",
      error instanceof Error ? error.message : "Invalid repository path.",
      true
    );
  }
  if (!normalizedPath || isReservedGitPath(normalizedPath)) {
    throw repoFailure("invalid-path", "Direct access to .git internals is reserved for Typr git storage.", true);
  }
  return normalizedPath;
}

function normalizeGitStoragePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function classifyChange(
  nextEntry: IndexEntry | null,
  previousEntry: IndexEntry | null
): "added" | "modified" | "deleted" {
  if (nextEntry && !previousEntry) {
    return "added";
  }
  if (!nextEntry && previousEntry) {
    return "deleted";
  }
  return "modified";
}

function classifyWorktreeChange(
  nextEntry: IndexEntry | null,
  previousEntry: IndexEntry | null
): "modified" | "deleted" | "untracked" {
  if (nextEntry && !previousEntry) {
    return "untracked";
  }
  if (!nextEntry && previousEntry) {
    return "deleted";
  }
  return "modified";
}

function compareIndexEntries(left: IndexEntry | null, right: IndexEntry | null): boolean {
  if (!left && !right) {
    return true;
  }
  return Boolean(left && right && left.oid === right.oid && left.mode === right.mode);
}

function comparePathEntries(left: { path: string }, right: { path: string }): number {
  return left.path.localeCompare(right.path);
}

function validateCommitMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    throw repoFailure("invalid-message", "git commit: use -m with a non-empty commit message.", true);
  }
  return trimmed;
}

function validateAuthor(author: Partial<RepoAuthor> | undefined): RepoAuthor {
  const nextAuthor = {
    name: author?.name?.trim() || DEFAULT_AUTHOR.name,
    email: author?.email?.trim() || DEFAULT_AUTHOR.email
  };
  if (!nextAuthor.name || /[<>\n]/.test(nextAuthor.name) || !/^[^@\s<>]+@[^@\s<>]+$/.test(nextAuthor.email)) {
    throw repoFailure("invalid-author", "Local commits need a valid author name and email.", true);
  }
  return nextAuthor;
}

function validateBranchName(name: string): string {
  const branchName = name.trim();
  if (
    !branchName ||
    branchName.startsWith("/") ||
    branchName.endsWith("/") ||
    branchName.includes("..") ||
    branchName.includes("//") ||
    branchName.endsWith(".lock") ||
    /[\s~^:?*[\\\]\0]/.test(branchName) ||
    branchName.split("/").some((segment) => segment.startsWith(".") || segment.endsWith("."))
  ) {
    throw repoFailure("invalid-ref", `Unsafe branch name '${name}'.`, true);
  }
  return branchName;
}

function validateRemoteName(name: string): string {
  const remoteName = name.trim();
  if (
    !remoteName ||
    remoteName.startsWith("/") ||
    remoteName.endsWith("/") ||
    remoteName.includes("..") ||
    remoteName.includes("//") ||
    /[\s~^:?*[\\\]\0]/.test(remoteName) ||
    remoteName.split("/").some((segment) => segment.startsWith(".") || segment.endsWith("."))
  ) {
    throw repoFailure("invalid-ref", `Unsafe remote name '${name}'.`, true);
  }
  return remoteName;
}

function validateSha(sha: string): string {
  const value = sha.trim();
  if (!/^[a-f0-9]{40}$/i.test(value)) {
    throw repoFailure("invalid-ref", `Invalid git object id '${sha}'.`, true);
  }
  return value.toLowerCase();
}

function validateRefPath(refPath: string): string {
  const value = normalizeGitStoragePath(refPath);
  if (!value.startsWith("refs/") || value.includes("..") || value.endsWith(".lock")) {
    throw repoFailure("invalid-ref", `Unsafe ref '${refPath}'.`, true);
  }
  return value;
}

function validateRefPrefix(prefix: string): string {
  const value = normalizeGitStoragePath(prefix || "refs/");
  if (!value.startsWith("refs")) {
    throw repoFailure("invalid-ref", `Unsafe ref prefix '${prefix}'.`, true);
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function decodeProjectContent(
  path: string,
  bytes: Uint8Array,
  previousEntry?: ProjectFilesystemEntry
): ProjectFileContent {
  if (previousEntry?.kind === "file" && typeof previousEntry.content === "string") {
    return decodeUtf8(bytes);
  }
  const extension = path.includes(".") ? path.split(".").at(-1)?.toLowerCase() : null;
  if (extension && TEXT_EXTENSIONS.has(extension)) {
    return decodeUtf8(bytes);
  }
  return bytes;
}

function getParentPaths(path: string): string[] {
  const segments = path.split("/");
  segments.pop();
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function repoFailure(code: RepoError["code"], message: string, recoverable: boolean): RepoError {
  return { code, message, recoverable };
}

async function asResult<T>(operation: () => Promise<T>): Promise<RepoResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    if (isRepoError(error)) {
      return { ok: false, error };
    }
    return {
      ok: false,
      error: {
        code: "storage-error",
        message: error instanceof Error ? error.message : "Git storage operation failed.",
        recoverable: true
      }
    };
  }
}

function isRepoError(error: unknown): error is RepoError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      "recoverable" in error
  );
}

async function readTextFile(
  storage: GitFileStorage,
  projectId: string,
  path: string
): Promise<string | null> {
  const bytes = await storage.readFile(projectId, path);
  return bytes ? decodeUtf8(bytes) : null;
}

function writeTextFile(
  storage: GitFileStorage,
  projectId: string,
  path: string,
  text: string
): Promise<void> {
  return storage.writeFile(projectId, path, encodeUtf8(text));
}

function zlibAsync(content: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zlib(content, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

function unzlibAsync(content: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    unzlib(content, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-1", buffer);
  return bytesToHex(new Uint8Array(digest));
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function uint32be(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function indexOfByte(bytes: Uint8Array, byte: number, from: number): number {
  const index = bytes.indexOf(byte, from);
  if (index < 0) {
    throw repoFailure("corrupt-repository", "Git object data is truncated.", true);
  }
  return index;
}

function formatTimezoneOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute / 60).toString().padStart(2, "0");
  const minutes = (absolute % 60).toString().padStart(2, "0");
  return `${sign}${hours}${minutes}`;
}

interface IndexEntry {
  path: string;
  oid: string;
  mode: "100644" | "100755";
  size: number;
}

interface TreeNode {
  children: Map<string, { kind: "file"; entry: IndexEntry } | { kind: "tree"; node: TreeNode }>;
}
