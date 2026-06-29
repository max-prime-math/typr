import type { TyprProjectRepository } from "../project/projectState";
import {
  formatRepoError,
  type RepoBackend,
  type RepoCommitDetails,
  type RepoResult,
  type RepoStatus,
  type RepoTreeEntry
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
  current?: number;
  total?: number;
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

export interface RemoteGitAccount {
  login: string;
  type: "user" | "org";
}

export interface RemoteGitRepositorySummary {
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
}

export interface RemoteGitBranchSummary {
  name: string;
  sha: string;
}

export type RemoteGitDiscoveryResult<T> =
  | { ok: true; value: T; message: string }
  | { ok: false; message: string };

export interface RemoteGitConnectionInfo {
  user: RemoteGitAccount;
  owners: RemoteGitAccount[];
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

interface GitHubUserResponse {
  login?: string;
}

interface GitHubOrgResponse {
  login?: string;
}

interface GitHubRepoResponse {
  name?: string;
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  owner?: {
    login?: string;
  };
}

interface GitHubBranchResponse {
  name?: string;
  commit?: {
    sha?: string;
  };
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
        return {
          ok: false,
          message:
            `Remote branch ${config.branch} was not found. ` +
            "If the GitHub repository is empty, initialize it on GitHub first, for example with a README."
        };
      }

      await importCommitGraph(fetchImpl, options.repoBackend, project, config, token, remoteSha, {
        ...remoteOptions,
        includeBlobs: true
      });
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
    if (statusResult.value.mergeState) {
      return {
        ok: false,
        message:
          `git pull: a browser merge stop is already active for ${statusResult.value.mergeState.remoteName}/${statusResult.value.mergeState.remoteBranch}. ` +
          "Use git merge --abort to clear it. Browser Shell cannot continue merges yet."
      };
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
        const mergeState = await options.repoBackend.beginDivergedPull(project, {
          branch: config.branch,
          remoteName: config.remoteName,
          remoteBranch: config.branch,
          localSha,
          remoteSha
        });
        if (!mergeState.ok) {
          return repoErrorResult(mergeState);
        }
        return {
          ok: false,
          message:
            `git pull: stopped before merge because local ${localSha.slice(0, 7)} and ${config.remoteName}/${config.branch} ${remoteSha.slice(0, 7)} diverged. ` +
            `Preserved base, local, and remote versions for ${mergeState.value.files.length} changed path${mergeState.value.files.length === 1 ? "" : "s"} ` +
            `(${mergeState.value.conflictCount} conflict${mergeState.value.conflictCount === 1 ? "" : "s"}). ` +
            "Use git merge --abort to clear this state; Browser Shell cannot continue merges yet."
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
        await importCommitGraph(fetchImpl, options.repoBackend, project, config, token, remoteSha, {
          ...remoteOptions,
          includeBlobs: false
        });
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

      emit(remoteOptions, "push", "Preparing local commits.");
      const commits = await collectCommitsToPush(options.repoBackend, project, localSha, remoteSha);
      const pushPlans = await preparePushCommitPlans(options.repoBackend, project, commits);
      const totalUploadSteps = pushPlans.reduce(
        (total, plan) => total + plan.treeEntries.length + 2,
        0
      );
      let completedUploadSteps = 0;
      const remoteCommitShas = new Map<string, string>();
      if (remoteSha) {
        remoteCommitShas.set(remoteSha, remoteSha);
      }
      let remoteHeadSha = remoteSha;
      for (const [index, plan] of pushPlans.entries()) {
        const commit = plan.commit;
        emit(
          remoteOptions,
          "push",
          `Uploading commit ${index + 1} of ${pushPlans.length} (${commit.sha.slice(0, 7)}).`,
          completedUploadSteps,
          totalUploadSteps
        );
        remoteHeadSha = await pushCommit(
          fetchImpl,
          options.repoBackend,
          project,
          config,
          token,
          commit,
          plan.treeEntries,
          remoteCommitShas,
          remoteOptions.signal,
          () => {
            completedUploadSteps += 1;
            emit(
              remoteOptions,
              "push",
              `Uploaded ${completedUploadSteps} of ${totalUploadSteps} Git objects.`,
              completedUploadSteps,
              totalUploadSteps
            );
          }
        );
        remoteCommitShas.set(commit.sha, remoteHeadSha);
      }

      if (!remoteHeadSha) {
        return { ok: false, message: "git push: no local commits were selected for upload." };
      }
      emit(remoteOptions, "push", "Updating remote branch.", totalUploadSteps, totalUploadSteps);
      await updateRemoteBranch(fetchImpl, config, token, remoteHeadSha, Boolean(remoteSha), remoteOptions.signal);
      if (remoteHeadSha !== localSha) {
        await importCommitGraph(fetchImpl, options.repoBackend, project, config, token, remoteHeadSha, {
          ...remoteOptions,
          includeBlobs: true
        });
        const localRefResult = await options.repoBackend.setRef(project, `refs/heads/${config.branch}`, remoteHeadSha);
        if (!localRefResult.ok) {
          return repoErrorResult(localRefResult);
        }
      }
      const refResult = await options.repoBackend.setRef(project, remoteTrackingRef(config), remoteHeadSha);
      if (!refResult.ok) {
        return repoErrorResult(refResult);
      }
      const statusResult = await options.repoBackend.status(project);
      return {
        ok: true,
        message: `Pushed ${commits.length} commit${commits.length === 1 ? "" : "s"} to ${config.remoteName}/${config.branch}.`,
        status: statusResult.ok ? statusResult.value : undefined
      };
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
      const existing = await githubFetch(fetchImpl, config, token, "", remoteOptions.signal);
      if (existing.ok) {
        return {
          ok: true,
          message: `Using existing ${config.owner.trim()}/${config.repo.trim()}.`
        };
      }
      if (existing.status !== 404) {
        throw new Error(await formatGitHubError(existing));
      }

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

  async function inspectToken(
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {}
  ): Promise<RemoteGitDiscoveryResult<RemoteGitConnectionInfo>> {
    const token = (await getToken()).trim();
    if (!token) {
      return { ok: false, message: "Add a GitHub token before connecting." };
    }

    try {
      const user = await githubApiJson<GitHubUserResponse>(fetchImpl, token, "/user", remoteOptions.signal);
      if (!user.login) {
        return { ok: false, message: "GitHub token is valid, but the account login was unavailable." };
      }
      const orgs = await githubApiJson<GitHubOrgResponse[]>(
        fetchImpl,
        token,
        "/user/orgs?per_page=100",
        remoteOptions.signal
      );
      const owners = [
        { login: user.login, type: "user" as const },
        ...orgs
          .map((org) => org.login?.trim())
          .filter((login): login is string => Boolean(login))
          .map((login) => ({ login, type: "org" as const }))
      ];
      return {
        ok: true,
        value: {
          user: { login: user.login, type: "user" },
          owners
        },
        message: `Connected as ${user.login}.`
      };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function listRepositories(
    owner: string,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {}
  ): Promise<RemoteGitDiscoveryResult<RemoteGitRepositorySummary[]>> {
    const token = (await getToken()).trim();
    const normalizedOwner = owner.trim();
    if (!token) {
      return { ok: false, message: "Add a GitHub token before loading repositories." };
    }
    if (!normalizedOwner) {
      return { ok: false, message: "Choose or enter an owner before loading repositories." };
    }

    try {
      const repos = await githubApiJson<GitHubRepoResponse[]>(
        fetchImpl,
        token,
        "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
        remoteOptions.signal
      );
      const filteredRepos = repos
        .filter((repo) => repo.owner?.login?.toLowerCase() === normalizedOwner.toLowerCase())
        .map((repo) => ({
          name: repo.name ?? "",
          fullName: repo.full_name ?? `${repo.owner?.login ?? normalizedOwner}/${repo.name ?? ""}`,
          owner: repo.owner?.login ?? normalizedOwner,
          private: Boolean(repo.private),
          defaultBranch: repo.default_branch ?? "main"
        }))
        .filter((repo) => repo.name)
        .sort((left, right) => left.name.localeCompare(right.name));

      return {
        ok: true,
        value: filteredRepos,
        message: `Loaded ${filteredRepos.length} repositories for ${normalizedOwner}.`
      };
    } catch (error) {
      return { ok: false, message: redactGitSecrets(formatUnknownError(error), [token]) };
    }
  }

  async function listBranches(
    config: Pick<RemoteGitConfig, "owner" | "repo">,
    getToken: () => string | Promise<string>,
    remoteOptions: RemoteGitOptions = {}
  ): Promise<RemoteGitDiscoveryResult<RemoteGitBranchSummary[]>> {
    const token = (await getToken()).trim();
    const owner = config.owner.trim();
    const repo = config.repo.trim();
    if (!token) {
      return { ok: false, message: "Add a GitHub token before loading branches." };
    }
    if (!owner || !repo) {
      return { ok: false, message: "Choose or enter an owner and repo before loading branches." };
    }

    try {
      const branches = await githubApiJson<GitHubBranchResponse[]>(
        fetchImpl,
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
        remoteOptions.signal
      );
      const summaries = branches
        .map((branch) => ({
          name: branch.name ?? "",
          sha: branch.commit?.sha ?? ""
        }))
        .filter((branch) => branch.name)
        .sort((left, right) => left.name.localeCompare(right.name));
      return {
        ok: true,
        value: summaries,
        message: `Loaded ${summaries.length} branches for ${owner}/${repo}.`
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
    inspectToken,
    listRepositories,
    listBranches,
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
  options: RemoteGitOptions & { includeBlobs: boolean }
): Promise<void> {
  const existing = await repoBackend.hasObject(project, sha);
  if (existing.ok && existing.value) {
    if (options.includeBlobs) {
      await importCommitBlobs(fetchImpl, repoBackend, project, config, token, sha, options.signal);
    }
    return;
  }
  const commit = await githubJson<GitHubCommitResponse>(fetchImpl, config, token, `/git/commits/${sha}`, options.signal);
  for (const parent of commit.parents) {
    await importCommitGraph(fetchImpl, repoBackend, project, config, token, parent.sha, {
      ...options,
      includeBlobs: false
    });
  }
  await importTree(fetchImpl, repoBackend, project, config, token, commit.tree.sha, {
    includeBlobs: options.includeBlobs,
    onProgress: options.onProgress,
    signal: options.signal
  });
  const commitObject = await buildMatchingCommitObject(commit);
  const written = await repoBackend.writeObject(project, "commit", encodeUtf8(commitObject));
  if (!written.ok) {
    throw new Error(formatRepoError(written.error));
  }
  if (written.value !== commit.sha) {
    throw new Error(
      `Remote commit ${commit.sha.slice(0, 7)} cannot be reconstructed from GitHub's commit metadata in browser mode. This usually means the commit contains metadata that GitHub's Git Database API does not expose exactly, such as an unsupported signature, encoding header, or merge tag.`
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
  options: { includeBlobs: boolean; onProgress?: RemoteGitOptions["onProgress"]; signal?: AbortSignal }
): Promise<void> {
  const tree = await githubJson<GitHubTreeResponse>(
    fetchImpl,
    config,
    token,
    `/git/trees/${treeSha}?recursive=1`,
    options.signal
  );
  if (tree.truncated) {
    throw new Error("Remote tree is too large for the browser GitHub adapter response.");
  }
  const entries = [];
  const blobEntries = tree.tree.filter(
    (entry) => entry.type === "blob" && entry.sha && entry.path
  );
  let importedBlobCount = 0;
  for (const entry of tree.tree) {
    if (entry.type === "commit" && entry.path) {
      throw new Error(`Remote repository contains unsupported submodule entry: ${entry.path}`);
    }

    if (entry.type !== "blob" || !entry.sha || !entry.path) {
      continue;
    }
    if (options.includeBlobs) {
      await yieldToBrowser();
      emit(
        options,
        "fetch",
        `Downloading ${importedBlobCount + 1} of ${blobEntries.length} Git objects.`,
        importedBlobCount,
        blobEntries.length
      );
      const blob = await githubJson<GitHubBlobResponse>(
        fetchImpl,
        config,
        token,
        `/git/blobs/${entry.sha}`,
        options.signal
      );
      const bytes = await decodeBase64FromGitHub(blob.content, options.signal);
      const written = await repoBackend.writeObject(project, "blob", bytes);
      if (!written.ok) {
        throw new Error(formatRepoError(written.error));
      }
      if (written.value !== entry.sha) {
        throw new Error(`Blob ${entry.path} did not round-trip to the expected object id.`);
      }
      importedBlobCount += 1;
      emit(
        options,
        "fetch",
        `Downloaded ${importedBlobCount} of ${blobEntries.length} Git objects.`,
        importedBlobCount,
        blobEntries.length
      );
    }
    entries.push({
      path: entry.path,
      oid: entry.sha,
      mode: normalizeGitHubFileMode(entry.mode, entry.path),
      size: entry.size ?? 0
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

function normalizeGitHubFileMode(mode: string | undefined, path: string): RepoTreeEntry["mode"] {
  if (mode === "100644" || mode === "100755" || mode === "120000") {
    return mode;
  }

  if (!mode) {
    return "100644";
  }

  throw new Error(`Remote file ${path} uses unsupported git mode ${mode}.`);
}

async function importCommitBlobs(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  config: RemoteGitConfig,
  token: string,
  commitSha: string,
  signal?: AbortSignal
): Promise<void> {
  const treeEntries = await repoBackend.listCommitTree(project, commitSha);
  if (!treeEntries.ok) {
    throw new Error(formatRepoError(treeEntries.error));
  }

  for (const entry of treeEntries.value) {
    await yieldToBrowser();
    const existingBlob = await repoBackend.readObject(project, entry.oid);
    if (existingBlob.ok) {
      continue;
    }

    const blob = await githubJson<GitHubBlobResponse>(
      fetchImpl,
      config,
      token,
      `/git/blobs/${entry.oid}`,
      signal
    );
    const bytes = await decodeBase64FromGitHub(blob.content, signal);
    const written = await repoBackend.writeObject(project, "blob", bytes);
    if (!written.ok) {
      throw new Error(formatRepoError(written.error));
    }
    if (written.value !== entry.oid) {
      throw new Error(`Blob ${entry.path} did not round-trip to the expected object id.`);
    }
  }
}

async function pushCommit(
  fetchImpl: typeof fetch,
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  config: RemoteGitConfig,
  token: string,
  commit: RepoCommitDetails,
  treeEntries: RepoTreeEntry[],
  remoteCommitShas: Map<string, string>,
  signal?: AbortSignal,
  onUploadStep?: () => void | Promise<void>
): Promise<string> {
  const remoteTreeEntries = [];
  for (const entry of treeEntries) {
    await yieldToBrowser();
    const blob = await repoBackend.readObject(project, entry.oid);
    if (!blob.ok) {
      throw new Error(formatRepoError(blob.error));
    }
    const content = await encodeBase64ForUpload(blob.value.content, signal);
    const createdBlob = await githubJson<{ sha: string }>(fetchImpl, config, token, "/git/blobs", signal, {
      method: "POST",
      body: JSON.stringify({
        content,
        encoding: "base64"
      })
    });
    if (createdBlob.sha !== entry.oid) {
      throw new Error(`GitHub returned an unexpected blob id for ${entry.path}.`);
    }
    await onUploadStep?.();
    remoteTreeEntries.push({
      path: entry.path,
      mode: entry.mode,
      type: "blob",
      sha: entry.oid
    });
  }

  await yieldToBrowser();
  const createdTree = await githubJson<{ sha: string }>(fetchImpl, config, token, "/git/trees", signal, {
    method: "POST",
    body: JSON.stringify({ tree: remoteTreeEntries })
  });
  if (createdTree.sha !== commit.treeSha) {
    throw new Error(`GitHub returned an unexpected tree id for ${commit.sha.slice(0, 7)}.`);
  }
  await onUploadStep?.();

  await yieldToBrowser();
  const createdCommit = await githubJson<{ sha: string }>(fetchImpl, config, token, "/git/commits", signal, {
    method: "POST",
    body: JSON.stringify({
      message: commit.message,
      tree: commit.treeSha,
      parents: commit.parentShas.map((sha) => remoteCommitShas.get(sha) ?? sha),
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
  await onUploadStep?.();
  return createdCommit.sha;
}

async function preparePushCommitPlans(
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  commits: RepoCommitDetails[]
): Promise<Array<{ commit: RepoCommitDetails; treeEntries: RepoTreeEntry[] }>> {
  const plans = [];
  for (const commit of commits) {
    await yieldToBrowser();
    const treeEntries = await repoBackend.listCommitTree(project, commit.sha);
    if (!treeEntries.ok) {
      throw new Error(formatRepoError(treeEntries.error));
    }
    plans.push({ commit, treeEntries: treeEntries.value });
  }
  return plans;
}

async function collectCommitsToPush(
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  localSha: string,
  remoteSha: string | null
): Promise<RepoCommitDetails[]> {
  const excluded = await collectReachableCommitShas(repoBackend, project, remoteSha);
  const commits: RepoCommitDetails[] = [];
  const seen = new Set<string>();

  async function visit(sha: string | null): Promise<void> {
    if (!sha || seen.has(sha) || excluded.has(sha)) {
      return;
    }
    seen.add(sha);
    const commit = await repoBackend.readCommitDetails(project, sha);
    if (!commit.ok) {
      throw new Error(formatRepoError(commit.error));
    }
    for (const parentSha of commit.value.parentShas) {
      await visit(parentSha);
    }
    commits.push(commit.value);
    if (commits.length % 25 === 0) {
      await yieldToBrowser();
    }
  }

  await visit(localSha);
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
  const excluded = await collectReachableCommitShasResult(repoBackend, project, excludeSha);
  if (!excluded.ok) {
    return excluded;
  }
  const seen = new Set<string>();
  const stack = [startSha];
  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || seen.has(sha) || excluded.value.has(sha)) {
      continue;
    }
    seen.add(sha);
    const commit = await repoBackend.readCommitDetails(project, sha);
    if (!commit.ok) {
      return commit;
    }
    stack.push(...commit.value.parentShas);
  }
  return { ok: true, value: seen.size };
}

async function collectReachableCommitShas(
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  startSha: string | null
): Promise<Set<string>> {
  const result = await collectReachableCommitShasResult(repoBackend, project, startSha);
  if (!result.ok) {
    throw new Error(formatRepoError(result.error));
  }
  return result.value;
}

async function collectReachableCommitShasResult(
  repoBackend: RepoBackend,
  project: TyprProjectRepository,
  startSha: string | null
): Promise<RepoResult<Set<string>>> {
  const seen = new Set<string>();
  const stack = startSha ? [startSha] : [];
  while (stack.length > 0) {
    const sha = stack.pop();
    if (!sha || seen.has(sha)) {
      continue;
    }
    seen.add(sha);
    const commit = await repoBackend.readCommitDetails(project, sha);
    if (!commit.ok) {
      return commit;
    }
    stack.push(...commit.value.parentShas);
  }
  return { ok: true, value: seen };
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

async function buildMatchingCommitObject(commit: GitHubCommitResponse): Promise<string> {
  const signedCommit = buildSignedCommitObject(commit);
  if (signedCommit) {
    const signedSha = await gitObjectSha("commit", signedCommit);
    if (signedSha === commit.sha) {
      return signedCommit;
    }
  }

  for (const commitObject of buildUnsignedCommitObjectCandidates(commit)) {
    const sha = await gitObjectSha("commit", commitObject);
    if (sha === commit.sha) {
      return commitObject;
    }
  }

  return buildUnsignedCommitObject(commit);
}

function* buildUnsignedCommitObjectCandidates(commit: GitHubCommitResponse): Generator<string> {
  const seen = new Set<string>();
  for (const commitObject of buildUnsignedCommitObjectCandidateSequence(commit)) {
    if (!seen.has(commitObject)) {
      seen.add(commitObject);
      yield commitObject;
    }
  }
}

function* buildUnsignedCommitObjectCandidateSequence(commit: GitHubCommitResponse): Generator<string> {
  yield buildUnsignedCommitObject(commit);
  yield* buildSameTimezoneCommitObjects(commit);
  yield* buildTimezonePairCommitObjects(commit);
}

function buildUnsignedCommitObject(commit: GitHubCommitResponse): string {
  return buildUnsignedCommitObjectWithMessage(commit, ensureTrailingNewline(commit.message));
}

function buildUnsignedCommitObjectWithMessage(
  commit: GitHubCommitResponse,
  message: string
): string {
  const headers = [
    `tree ${commit.tree.sha}`,
    ...commit.parents.map((parent) => `parent ${parent.sha}`),
    `author ${formatSignature(commit.author)}`,
    `committer ${formatSignature(commit.committer ?? commit.author)}`,
    ""
  ];
  return `${headers.join("\n")}\n${message}`;
}

function buildUnsignedCommitObjectWithTimezones(
  commit: GitHubCommitResponse,
  authorTimezone: string,
  committerTimezone: string,
  message = ensureTrailingNewline(commit.message)
): string {
  const headers = [
    `tree ${commit.tree.sha}`,
    ...commit.parents.map((parent) => `parent ${parent.sha}`),
    `author ${formatSignature(commit.author, authorTimezone)}`,
    `committer ${formatSignature(commit.committer ?? commit.author, committerTimezone)}`,
    ""
  ];
  return `${headers.join("\n")}\n${message}`;
}

function* buildSameTimezoneCommitObjects(commit: GitHubCommitResponse): Generator<string> {
  for (const timezone of getGitTimezoneCandidates()) {
    for (const message of getCommitMessageCandidates(commit.message)) {
      yield buildUnsignedCommitObjectWithTimezones(commit, timezone, timezone, message);
    }
  }
}

function* buildTimezonePairCommitObjects(commit: GitHubCommitResponse): Generator<string> {
  const candidates = getGitTimezoneCandidates();
  for (const authorTimezone of candidates) {
    for (const committerTimezone of candidates) {
      for (const message of getCommitMessageCandidates(commit.message)) {
        yield buildUnsignedCommitObjectWithTimezones(commit, authorTimezone, committerTimezone, message);
      }
    }
  }
}

function getCommitMessageCandidates(message: string): string[] {
  const candidates = [ensureTrailingNewline(message), message];
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
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

function formatSignature(signature: GitHubSignature | null, timezoneOverride?: string): string {
  const date = parseGitDate(signature?.date ?? new Date().toISOString());
  return `${signature?.name ?? "Unknown"} <${signature?.email ?? "unknown@example.invalid"}> ${date.timestamp} ${timezoneOverride ?? date.timezone}`;
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

let gitTimezoneCandidates: string[] | null = null;

function getGitTimezoneCandidates(): string[] {
  if (gitTimezoneCandidates) {
    return gitTimezoneCandidates;
  }

  const timezones = ["+0000"];
  for (let minutes = -12 * 60; minutes <= 14 * 60; minutes += 15) {
    const sign = minutes < 0 ? "-" : "+";
    const absolute = Math.abs(minutes);
    const timezone = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
    if (!timezones.includes(timezone)) {
      timezones.push(timezone);
    }
  }

  gitTimezoneCandidates = timezones;
  return timezones;
}

async function gitObjectSha(type: "commit" | "tree" | "blob", content: string): Promise<string> {
  const body = encodeUtf8(content);
  const payload = concatBytes([encodeUtf8(`${type} ${body.byteLength}\0`), body]);
  return sha1Hex(payload);
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function emit(
  options: RemoteGitOptions,
  phase: RemoteGitProgress["phase"],
  message: string,
  current?: number,
  total?: number
): void {
  options.onProgress?.({ phase, message, current, total });
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

async function encodeBase64ForUpload(content: Uint8Array, signal?: AbortSignal): Promise<string> {
  const chunkSize = 49_152;
  const chunks = [];
  for (let offset = 0; offset < content.byteLength; offset += chunkSize) {
    if (signal?.aborted) {
      throw new Error("Remote git operation was aborted.");
    }
    const chunk = content.subarray(offset, Math.min(offset + chunkSize, content.byteLength));
    chunks.push(btoa(String.fromCharCode(...chunk)));
    if (offset + chunkSize < content.byteLength) {
      await yieldToBrowser();
    }
  }
  return chunks.join("");
}

async function decodeBase64FromGitHub(content: string, signal?: AbortSignal): Promise<Uint8Array> {
  const normalized = content.replace(/\n/g, "");
  const chunkSize = 65_536;
  const chunks = [];
  let totalLength = 0;

  for (let offset = 0; offset < normalized.length; offset += chunkSize) {
    if (signal?.aborted) {
      throw new Error("Remote git operation was aborted.");
    }
    const decoded = atob(normalized.slice(offset, Math.min(offset + chunkSize, normalized.length)));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    chunks.push(bytes);
    totalLength += bytes.byteLength;
    if (offset + chunkSize < normalized.length) {
      await yieldToBrowser();
    }
  }

  const result = new Uint8Array(totalLength);
  let resultOffset = 0;
  for (const chunk of chunks) {
    result.set(chunk, resultOffset);
    resultOffset += chunk.byteLength;
  }
  return result;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
