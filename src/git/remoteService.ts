import type { TyprProjectRepository } from "../project/projectState";
import {
  formatRepoError,
  type RepoBackend,
  type RepoCommitDetails,
  type RepoResult,
  type RepoStatus
} from "./repoBackend";
import { redactGitSecrets } from "./credentials";

export interface RemoteGitConfig {
  owner: string;
  repo: string;
  branch: string;
  remoteName: string;
}

export interface RemoteGitProgress {
  phase: "config" | "fetch" | "pull" | "push";
  message: string;
}

export interface RemoteGitOptions {
  signal?: AbortSignal;
  onProgress?: (progress: RemoteGitProgress) => void;
}

export interface RemoteGitResult {
  ok: boolean;
  message: string;
  project?: TyprProjectRepository;
  status?: RepoStatus;
}

export interface CreateRemoteRepositoryOptions {
  private: boolean;
  description?: string;
}

export interface UpstreamTracking {
  branch: string;
  remoteName: string;
  remoteRef: string;
  localSha: string | null;
  remoteSha: string | null;
  ahead: number;
  behind: number;
}

interface GitHubCommitResponse {
  sha: string;
  message: string;
  tree: { sha: string };
  parents: Array<{ sha: string }>;
  author: GitHubSignature | null;
  committer: GitHubSignature | null;
  verification?: {
    signature?: string | null;
    payload?: string | null;
  } | null;
}

interface GitHubSignature {
  name?: string;
  email?: string;
  date?: string;
}

interface GitHubTreeResponse {
  sha: string;
  truncated?: boolean;
  tree: Array<{
    path?: string;
    mode?: string;
    type?: "blob" | "tree" | "commit";
    sha?: string;
    size?: number;
  }>;
}

interface GitHubBlobResponse {
  sha: string;
  content: string;
  encoding: string;
}

export const REMOTE_TRANSPORT_STRATEGY = [
  "Typr uses the GitHub Git Database REST API for browser remotes.",
  "Browser smart-HTTP git to github.com is not used because GitHub does not expose it with browser CORS semantics.",
  "Tokens are sent only to https://api.github.com as Authorization headers and are never embedded in remote URLs or repo config.",
  "The adapter reads and writes Git blobs, trees, commits, and refs; it does not use the GitHub Contents API file sync path.",
  "GitHub empty repositories must be initialized on GitHub before Browser mode can push because GitHub's Git Database API cannot create the first reference in an empty repository."
].join("\n");

export function createRemoteGitService(options: {
  repoBackend: RepoBackend;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function fetchRemote(
    project: TyprProjectRepository,
    config: RemoteGitConfig,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {}
  ): Promise<RemoteGitResult> {
    const token = (await getToken()).trim();
    const validation = validateRemoteConfig(config, token);
    if (!validation.ok) {
      return validation;
    }

    try {
      await ensureRemoteRepository(fetchImpl, config, token, remoteOptions.signal);
      emit(remoteOptions, "fetch", "Reading remote branch.");
      const remoteSha = await getRemoteBranchSha(fetchImpl, config, token, remoteOptions.signal);
      if (!remoteSha) {
        return { ok: false, message: `Remote branch ${config.branch} was not found.` };
      }

      await importCommitGraph(fetchImpl, options.repoBackend, project, config, token, remoteSha, remoteOptions);
      const refResult = await options.repoBackend.setRef(project, remoteTrackingRef(config), remoteSha);
      if (!refResult.ok) {
        return repoErrorResult(refResult);
      }

      return {
        ok: true,
        message: `Fetched ${config.remoteName}/${config.branch} at ${remoteSha.slice(0, 7)}.`
      };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function pullRemote(
    project: TyprProjectRepository,
    config: RemoteGitConfig,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {}
  ): Promise<RemoteGitResult> {
    const statusResult = await options.repoBackend.status(project);
    if (!statusResult.ok) {
      return repoErrorResult(statusResult);
    }
    if (statusResult.value.entries.length > 0) {
      return {
        ok: false,
        message: "git pull: commit or reset local changes before pulling."
      };
    }

    const fetchResult = await fetchRemote(project, config, getToken, {
      ...remoteOptions,
      onProgress: (progress) => {
        remoteOptions.onProgress?.({ ...progress, phase: "pull" });
      }
    });
    if (!fetchResult.ok) {
      return fetchResult;
    }

    const remoteRefResult = await options.repoBackend.getRef(project, remoteTrackingRef(config));
    if (!remoteRefResult.ok) {
      return repoErrorResult(remoteRefResult);
    }
    const remoteSha = remoteRefResult.value;
    if (!remoteSha) {
      return { ok: false, message: `No fetched ref exists for ${config.remoteName}/${config.branch}.` };
    }

    const localRef = `refs/heads/${config.branch}`;
    const localShaResult = await options.repoBackend.getRef(project, localRef);
    if (!localShaResult.ok) {
      return repoErrorResult(localShaResult);
    }
    const localSha = localShaResult.value;
    if (localSha === remoteSha) {
      return { ok: true, message: "Already up to date.", status: statusResult.value };
    }
    if (localSha) {
      const fastForward = await options.repoBackend.isAncestor(project, localSha, remoteSha);
      if (!fastForward.ok) {
        return repoErrorResult(fastForward);
      }
      if (!fastForward.value) {
        const localAhead = await options.repoBackend.isAncestor(project, remoteSha, localSha);
        if (!localAhead.ok) {
          return repoErrorResult(localAhead);
        }
        if (localAhead.value) {
          return { ok: true, message: "Already up to date.", status: statusResult.value };
        }
        return {
          ok: false,
          message: "git pull: remote and local history diverged. Merge/rebase is not implemented in Browser Shell."
        };
      }
    }

    emit(remoteOptions, "pull", "Fast-forwarding local branch.");
    const checkout = await options.repoBackend.fastForwardBranch(project, config.branch, remoteSha);
    if (!checkout.ok) {
      return repoErrorResult(checkout);
    }
    return {
      ok: true,
      message: `Fast-forwarded ${config.branch} to ${remoteSha.slice(0, 7)}.`,
      project: checkout.value.project,
      status: checkout.value.status
    };
  }

  async function pushRemote(
    project: TyprProjectRepository,
    config: RemoteGitConfig,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {}
  ): Promise<RemoteGitResult> {
    const token = (await getToken()).trim();
    const validation = validateRemoteConfig(config, token);
    if (!validation.ok) {
      return validation;
    }

    try {
      await ensureRemoteRepository(fetchImpl, config, token, remoteOptions.signal);
      const localShaResult = await options.repoBackend.getRef(project, `refs/heads/${config.branch}`);
      if (!localShaResult.ok) {
        return repoErrorResult(localShaResult);
      }
      const localSha = localShaResult.value;
      if (!localSha) {
        return { ok: false, message: "git push: current branch has no commits." };
      }

      emit(remoteOptions, "push", "Reading remote branch.");
      const remoteSha = await getRemoteBranchSha(fetchImpl, config, token, remoteOptions.signal);
      if (remoteSha) {
        await importCommitGraph(fetchImpl, options.repoBackend, project, config, token, remoteSha, remoteOptions);
        const fastForward = await options.repoBackend.isAncestor(project, remoteSha, localSha);
        if (!fastForward.ok) {
          return repoErrorResult(fastForward);
        }
        if (!fastForward.value && remoteSha !== localSha) {
          return {
            ok: false,
            message: "git push: remote contains work that is not in the local branch. Pull first."
          };
        }
      }

      if (remoteSha === localSha) {
        const refResult = await options.repoBackend.setRef(project, remoteTrackingRef(config), localSha);
        if (!refResult.ok) {
          return repoErrorResult(refResult);
        }
        return { ok: true, message: "Everything up to date." };
      }

      const commits = await collectCommitsToPush(options.repoBackend, project, localSha, remoteSha);
      for (const commit of commits.reverse()) {
        emit(remoteOptions, "push", `Uploading commit ${commit.sha.slice(0, 7)}.`);
        await pushCommit(fetchImpl, options.repoBackend, project, config, token, commit, remoteOptions.signal);
      }

      await updateRemoteBranch(fetchImpl, config, token, localSha, Boolean(remoteSha), remoteOptions.signal);
      const refResult = await options.repoBackend.setRef(project, remoteTrackingRef(config), localSha);
      if (!refResult.ok) {
        return repoErrorResult(refResult);
      }
      return { ok: true, message: `Pushed ${commits.length} commit${commits.length === 1 ? "" : "s"} to ${config.remoteName}/${config.branch}.` };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function inspectUpstream(
    project: TyprProjectRepository,
    config: RemoteGitConfig
  ): Promise<RepoResult<UpstreamTracking>> {
    const localRef = await options.repoBackend.getRef(project, `refs/heads/${config.branch}`);
    if (!localRef.ok) {
      return localRef;
    }
    const remoteRef = await options.repoBackend.getRef(project, remoteTrackingRef(config));
    if (!remoteRef.ok) {
      return remoteRef;
    }
    const ahead = await countReachableExcluding(options.repoBackend, project, localRef.value, remoteRef.value);
    if (!ahead.ok) {
      return ahead;
    }
    const behind = await countReachableExcluding(options.repoBackend, project, remoteRef.value, localRef.value);
    if (!behind.ok) {
      return behind;
    }
    return {
      ok: true,
      value: {
        branch: config.branch,
        remoteName: config.remoteName,
        remoteRef: remoteTrackingRef(config),
        localSha: localRef.value,
        remoteSha: remoteRef.value,
        ahead: ahead.value,
        behind: behind.value
      }
    };
  }

  async function createRemoteRepository(
    config: RemoteGitConfig,
    getToken: () => string | Promise<string>,
    createOptions: CreateRemoteRepositoryOptions,
    remoteOptions: RemoteGitOptions = {}
  ): Promise<RemoteGitResult> {
    const token = (await getToken()).trim();
    const validation = validateRemoteConfig(config, token);
    if (!validation.ok) {
      return validation;
    }

    try {
      emit(remoteOptions, "config", "Creating GitHub repository.");
      const user = await githubApiJson<{ login?: string }>(fetchImpl, token, "/user", remoteOptions.signal);
      const owner = config.owner.trim();
      const endpoint = user.login?.toLowerCase() === owner.toLowerCase()
        ? "/user/repos"
        : `/orgs/${encodeURIComponent(owner)}/repos`;
      await githubApiJson(fetchImpl, token, endpoint, remoteOptions.signal, {
        method: "POST",
        body: JSON.stringify({
          name: config.repo.trim(),
          private: createOptions.private,
          description: createOptions.description?.trim() || undefined,
          auto_init: true
        })
      });
      return {
        ok: true,
        message: `Created ${owner}/${config.repo.trim()} with an initial commit.`
      };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  return {
    createRepository: createRemoteRepository,
    fetch: fetchRemote,
    pull: pullRemote,
    push: pushRemote,
    inspectUpstream,
    getRemoteUrl: (config: RemoteGitConfig) =>
      `https://github.com/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}.git`
  };
}

async function importCommitGraph(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  config: RemoteGitConfig,
  token: string,
  sha: string,
  options: RemoteGitOptions
): Promise<void> {
  const existing = await repoBackend.hasObject(project, sha);
  if (existing.ok && existing.value) {
    return;
  }
  const commit = await githubJson<GitHubCommitResponse>(fetchImpl, config, token, `/git/commits/${sha}`, options.signal);
  for (const parent of commit.parents) {
    await importCommitGraph(fetchImpl, repoBackend, project, config, token, parent.sha, options);
  }
  await importTree(fetchImpl, repoBackend, project, config, token, commit.tree.sha, options.signal);
  const written = await repoBackend.writeObject(project, "commit", encodeUtf8(buildCommitObject(commit)));
  if (!written.ok) {
    throw new Error(formatRepoError(written.error));
  }
  if (written.value !== commit.sha) {
    throw new Error(
      `Remote commit ${commit.sha.slice(0, 7)} cannot be reconstructed from GitHub's commit metadata in browser mode.`
    );
  }
}

async function importTree(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  config: RemoteGitConfig,
  token: string,
  treeSha: string,
  signal?: AbortSignal
): Promise<void> {
  const tree = await githubJson<GitHubTreeResponse>(
    fetchImpl,
    config,
    token,
    `/git/trees/${treeSha}?recursive=1`,
    signal
  );
  if (tree.truncated) {
    throw new Error("Remote tree is too large for the browser GitHub adapter response.");
  }
  const entries = [];
  for (const entry of tree.tree) {
    if (entry.type !== "blob" || !entry.sha || !entry.path) {
      continue;
    }
    const blob = await githubJson<GitHubBlobResponse>(fetchImpl, config, token, `/git/blobs/${entry.sha}`, signal);
    const bytes = decodeBase64(blob.content);
    const written = await repoBackend.writeObject(project, "blob", bytes);
    if (!written.ok) {
      throw new Error(formatRepoError(written.error));
    }
    if (written.value !== entry.sha) {
      throw new Error(`Blob ${entry.path} did not round-trip to the expected object id.`);
    }
    entries.push({
      path: entry.path,
      oid: entry.sha,
      mode: entry.mode === "100755" ? "100755" as const : "100644" as const,
      size: entry.size ?? bytes.byteLength
    });
  }
  const writtenTree = await repoBackend.writeTree(project, entries);
  if (!writtenTree.ok) {
    throw new Error(formatRepoError(writtenTree.error));
  }
  if (writtenTree.value !== treeSha) {
    throw new Error(`Remote tree ${treeSha.slice(0, 7)} could not be reconstructed locally.`);
  }
}

async function pushCommit(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  config: RemoteGitConfig,
  token: string,
  commit: RepoCommitDetails,
  signal?: AbortSignal
): Promise<void> {
  const treeEntries = await repoBackend.listCommitTree(project, commit.sha);
  if (!treeEntries.ok) {
    throw new Error(formatRepoError(treeEntries.error));
  }
  const remoteTreeEntries = [];
  for (const entry of treeEntries.value) {
    const blob = await repoBackend.readObject(project, entry.oid);
    if (!blob.ok) {
      throw new Error(formatRepoError(blob.error));
    }
    const createdBlob = await githubJson<{ sha: string }>(fetchImpl, config, token, "/git/blobs", signal, {
      method: "POST",
      body: JSON.stringify({
        content: encodeBase64(blob.value.content),
        encoding: "base64"
      })
    });
    if (createdBlob.sha !== entry.oid) {
      throw new Error(`GitHub returned an unexpected blob id for ${entry.path}.`);
    }
    remoteTreeEntries.push({
      path: entry.path,
      mode: entry.mode,
      type: "blob",
      sha: entry.oid
    });
  }

  const createdTree = await githubJson<{ sha: string }>(fetchImpl, config, token, "/git/trees", signal, {
    method: "POST",
    body: JSON.stringify({ tree: remoteTreeEntries })
  });
  if (createdTree.sha !== commit.treeSha) {
    throw new Error(`GitHub returned an unexpected tree id for ${commit.sha.slice(0, 7)}.`);
  }

  const createdCommit = await githubJson<{ sha: string }>(fetchImpl, config, token, "/git/commits", signal, {
    method: "POST",
    body: JSON.stringify({
      message: commit.message,
      tree: commit.treeSha,
      parents: commit.parentShas,
      author: {
        name: commit.authorName,
        email: commit.authorEmail,
        date: formatGitHubDate(commit.authoredAt, commit.authorTimezone)
      },
      committer: {
        name: commit.committerName,
        email: commit.committerEmail,
        date: formatGitHubDate(commit.committedAt, commit.committerTimezone)
      }
    })
  });
  if (createdCommit.sha !== commit.sha) {
    throw new Error(`GitHub returned ${createdCommit.sha.slice(0, 7)} for local commit ${commit.sha.slice(0, 7)}.`);
  }
}

async function collectCommitsToPush(
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  localSha: string,
  remoteSha: string | null
): Promise<RepoCommitDetails[]> {
  const commits: RepoCommitDetails[] = [];
  let sha: string | null = localSha;
  while (sha && sha !== remoteSha) {
    const commit = await repoBackend.readCommitDetails(project, sha);
    if (!commit.ok) {
      throw new Error(formatRepoError(commit.error));
    }
    commits.push(commit.value);
    sha = commit.value.parentShas[0] ?? null;
  }
  return commits;
}

async function countReachableExcluding(
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  startSha: string | null,
  excludeSha: string | null
): Promise<RepoResult<number>> {
  if (!startSha || startSha === excludeSha) {
    return { ok: true, value: 0 };
  }
  let count = 0;
  let sha: string | null = startSha;
  while (sha && sha !== excludeSha) {
    const commit = await repoBackend.readCommitDetails(project, sha);
    if (!commit.ok) {
      return commit;
    }
    count += 1;
    sha = commit.value.parentShas[0] ?? null;
  }
  return { ok: true, value: count };
}

async function getRemoteBranchSha(
  fetchImpl: typeof fetch,
  config: RemoteGitConfig,
  token: string,
  signal?: AbortSignal
): Promise<string | null> {
  const response = await githubFetch(fetchImpl, config, token, `/git/ref/heads/${encodeURIComponent(config.branch.trim())}`, signal);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const message = await formatGitHubError(response);
    if (/empty/i.test(message)) {
      throw new Error(
        "GitHub reports this repository is empty. Initialize it on GitHub first, for example with a README, because Browser mode cannot create the first branch through GitHub's Git Database API."
      );
    }
    throw new Error(message);
  }
  const payload = (await response.json()) as { object?: { sha?: string } };
  return payload.object?.sha ?? null;
}

async function ensureRemoteRepository(
  fetchImpl: typeof fetch,
  config: RemoteGitConfig,
  token: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await githubFetch(fetchImpl, config, token, "", signal);
  if (response.status === 404) {
    throw new Error(
      `Repository ${config.owner.trim()}/${config.repo.trim()} was not found, or this token does not have access. Create it on GitHub first and grant the token repository access.`
    );
  }
  if (!response.ok) {
    throw new Error(await formatGitHubError(response));
  }
}

async function updateRemoteBranch(
  fetchImpl: typeof fetch,
  config: RemoteGitConfig,
  token: string,
  sha: string,
  exists: boolean,
  signal?: AbortSignal
): Promise<void> {
  if (exists) {
    await githubJson(fetchImpl, config, token, `/git/refs/heads/${encodeURIComponent(config.branch.trim())}`, signal, {
      method: "PATCH",
      body: JSON.stringify({ sha, force: false })
    });
    return;
  }
  await githubJson(fetchImpl, config, token, "/git/refs", signal, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${config.branch.trim()}`, sha })
  });
}

async function githubJson<T>(
  fetchImpl: typeof fetch,
  config: RemoteGitConfig,
  token: string,
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {}
): Promise<T> {
  const response = await githubFetch(fetchImpl, config, token, path, signal, init);
  if (!response.ok) {
    throw new Error(await formatGitHubError(response));
  }
  return (await response.json()) as T;
}

async function githubApiJson<T>(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    ...init,
    signal,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  if (!response.ok) {
    throw new Error(await formatGitHubError(response));
  }
  return (await response.json()) as T;
}

function githubFetch(
  fetchImpl: typeof fetch,
  config: RemoteGitConfig,
  token: string,
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {}
): Promise<Response> {
  return fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}${path}`,
    {
      ...init,
      signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    }
  );
}

async function formatGitHubError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) {
      return payload.message;
    }
  } catch {
    // Use fallback below.
  }
  return `GitHub remote operation failed (${response.status}).`;
}

function buildCommitObject(commit: GitHubCommitResponse): string {
  const signedCommit = buildSignedCommitObject(commit);
  if (signedCommit) {
    return signedCommit;
  }

  const headers = [
    `tree ${commit.tree.sha}`,
    ...commit.parents.map((parent) => `parent ${parent.sha}`),
    `author ${formatSignature(commit.author)}`,
    `committer ${formatSignature(commit.committer ?? commit.author)}`,
    ""
  ];
  return `${headers.join("\n")}\n${ensureTrailingNewline(commit.message)}`;
}

function buildSignedCommitObject(commit: GitHubCommitResponse): string | null {
  const payload = commit.verification?.payload;
  const signature = commit.verification?.signature;
  if (!payload || !signature) {
    return null;
  }

  const separatorIndex = payload.indexOf("\n\n");
  if (separatorIndex < 0) {
    return null;
  }

  const headers = payload.slice(0, separatorIndex);
  const message = payload.slice(separatorIndex + 2);
  const signatureHeader = signature
    .split("\n")
    .map((line, index) => (index === 0 ? `gpgsig ${line}` : ` ${line}`))
    .join("\n");

  return `${headers}\n${signatureHeader}\n\n${message}`;
}

function formatSignature(signature: GitHubSignature | null): string {
  const date = parseGitDate(signature?.date ?? new Date().toISOString());
  return `${signature?.name ?? "Unknown"} <${signature?.email ?? "unknown@example.invalid"}> ${date.timestamp} ${date.timezone}`;
}

function parseGitDate(dateText: string): { timestamp: number; timezone: string } {
  const date = new Date(dateText);
  const timestamp = Math.floor(date.getTime() / 1000);
  const offsetMatch = /([+-]\d{2}):?(\d{2})$/.exec(dateText);
  if (offsetMatch) {
    return { timestamp, timezone: `${offsetMatch[1]}${offsetMatch[2]}` };
  }
  return { timestamp, timezone: "+0000" };
}

function formatGitHubDate(isoDate: string, timezone: string): string {
  const date = new Date(isoDate);
  const offsetMinutes = parseTimezoneOffset(timezone);
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const min = String(local.getUTCMinutes()).padStart(2, "0");
  const ss = String(local.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${timezone.slice(0, 3)}:${timezone.slice(3)}`;
}

function parseTimezoneOffset(timezone: string): number {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(timezone);
  if (!match) {
    return 0;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

function validateRemoteConfig(config: RemoteGitConfig, token: string): RemoteGitResult {
  if (!config.owner.trim() || !config.repo.trim() || !config.branch.trim() || !config.remoteName.trim()) {
    return { ok: false, message: "Fill in owner, repo, branch, and remote name first." };
  }
  if (!token) {
    return { ok: false, message: "Add a GitHub token before using remotes." };
  }
  return { ok: true, message: "" };
}

function remoteTrackingRef(config: RemoteGitConfig): string {
  return `refs/remotes/${config.remoteName.trim()}/${config.branch.trim()}`;
}

function emit(options: RemoteGitOptions, phase: RemoteGitProgress["phase"], message: string): void {
  options.onProgress?.({ phase, message });
}

function repoErrorResult<T>(result: RepoResult<T>): RemoteGitResult {
  return result.ok ? { ok: true, message: "" } : { ok: false, message: formatRepoError(result.error) };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : "Remote git operation failed.";
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function encodeBase64(content: Uint8Array): string {
  let binary = "";
  for (const byte of content) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(content: string): Uint8Array {
  const decoded = atob(content.replace(/\n/g, ""));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}
