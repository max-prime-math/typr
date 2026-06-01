import type { AppSnapshot } from "../app/appState";
import {
  joinRelativePaths,
  normalizeRelativePath,
  shouldIgnorePath,
  stripPathPrefix
} from "../git/pathFilters";

// Legacy compatibility only. Phase 3 remote sync uses src/git/remoteService.ts
// and GitHub Git Database object/ref APIs instead of this Contents API path.

export interface GitHubRemoteConfig {
  owner: string;
  repo: string;
  branch: string;
  directory: string;
  token: string;
}

export interface GitHubSyncDocument {
  name: string;
  content: string | Uint8Array;
}

export interface GitHubSyncTarget {
  projectName: string;
  documents: GitHubSyncDocument[];
  commitMessage: string;
}

export interface GitHubSyncResult {
  ok: boolean;
  message: string;
  documents?: GitHubSyncDocument[];
  projectName?: string;
}

export interface GitHubBranchSummary {
  name: string;
  sha: string;
  protected: boolean;
  current: boolean;
}

export interface GitHubCommitSummary {
  sha: string;
  message: string;
  authoredAt: string;
  authorName: string;
  branchNames: string[];
}

export interface GitHubProjectFileStatus {
  path: string;
  state: "in-sync" | "local-only" | "remote-only" | "diverged";
}

export interface GitHubProjectStatusResult {
  ok: boolean;
  message: string;
  branches: GitHubBranchSummary[];
  commits: GitHubCommitSummary[];
  files: GitHubProjectFileStatus[];
  remoteUrl: string;
}

export interface ScopedLocalGitHubDocument {
  id: string;
  name: string;
  relativePath: string;
  content: string | Uint8Array;
  updatedAt: string;
}

const LEGACY_PROJECT_METADATA_FILE_NAME = "typr-project.json";
const PROJECT_METADATA_FILE_NAME = ".typr-project.json";

interface PutFileOptions {
  branch: string;
  content: string | Uint8Array;
  message: string;
  path: string;
  sha: string | null;
}

export function createEmptyGitHubRemoteConfig(): GitHubRemoteConfig {
  return {
    owner: "",
    repo: "",
    branch: "main",
    directory: "",
    token: ""
  };
}

export function hasRequiredConfig(
  config: Partial<GitHubRemoteConfig> | null | undefined
): config is GitHubRemoteConfig {
  return Boolean(
    config?.owner?.trim() &&
      config.repo?.trim() &&
      config.branch?.trim() &&
      config.token?.trim()
  );
}

export async function pushProjectToGitHub(
  config: GitHubRemoteConfig,
  target: GitHubSyncTarget
): Promise<GitHubSyncResult> {
  if (!hasRequiredConfig(config)) {
    return {
      ok: false,
      message: "Fill in the GitHub owner, repo, branch, and token first."
    };
  }

  if (target.documents.length === 0) {
    return {
      ok: false,
      message: "There are no documents to push."
    };
  }

  const normalizedDirectory = resolveSyncDirectory(config.directory, target.projectName);
  const commitMessage = target.commitMessage.trim() || "Sync project from typr";
  const files = [
    ...target.documents.map((document) => ({
      path: `${normalizedDirectory}/${sanitizeDocumentName(document.name)}`,
      content: document.content
    })),
    {
      path: `${normalizedDirectory}/${PROJECT_METADATA_FILE_NAME}`,
      content: JSON.stringify(
        {
          name: target.projectName,
          updatedAt: new Date().toISOString(),
          documents: target.documents.map((document) => document.name)
        },
        null,
        2
      )
    }
  ];

  try {
    for (const file of dedupeFilesByPath(files)) {
      const existingSha = await fetchContentSha(config, file.path);
      await putFileContent(config, {
        branch: config.branch.trim(),
        content: file.content,
        message: commitMessage,
        path: file.path,
        sha: existingSha
      });
    }

    return {
      ok: true,
      message: `Pushed ${files.length} file${files.length === 1 ? "" : "s"} to ${config.owner}/${config.repo}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "GitHub sync failed."
    };
  }
}

export async function pullProjectFromGitHub(
  config: GitHubRemoteConfig,
  _target: Pick<GitHubSyncTarget, "projectName">
): Promise<GitHubSyncResult> {
  if (!hasRequiredConfig(config)) {
    return {
      ok: false,
      message: "Fill in owner, repo, branch, and token first."
    };
  }

  const normalizedDirectory = resolveSyncDirectory(config.directory, _target.projectName);
  const branch = config.branch.trim();

  try {
    const remoteFiles = await listDirectoryContents(config, normalizedDirectory, branch);
    const projectFiles = remoteFiles.filter(
      (file) => file.type === "file" && !isProjectMetadataPath(file.path)
    );

    if (projectFiles.length === 0) {
      return {
        ok: false,
        message: `No synced files found in ${config.owner}/${config.repo}/${normalizedDirectory}.`
      };
    }

    const documents: GitHubSyncDocument[] = [];
    for (const file of projectFiles) {
      const content = await fetchFileContent(config, file.path, branch);
      if (content !== null) {
        documents.push({
          name: file.name,
          content
        });
      }
    }

    let projectName = _target.projectName;
    const projectFile = remoteFiles.find(
      (file) => file.type === "file" && isProjectMetadataPath(file.path)
    );
    if (projectFile) {
      const projectContent = await fetchFileContent(config, projectFile.path, branch);
      if (typeof projectContent === "string" && projectContent) {
        try {
          const parsed = JSON.parse(projectContent) as { name?: string };
          if (parsed.name) {
            projectName = parsed.name;
          }
        } catch {
          // Ignore parse errors, use fallback name
        }
      }
    }

    return {
      ok: true,
      message: `Pulled ${documents.length} document${documents.length === 1 ? "" : "s"} from ${config.owner}/${config.repo}.`,
      documents,
      projectName
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "GitHub pull failed."
    };
  }
}

async function fetchContentSha(
  config: GitHubRemoteConfig,
  path: string
): Promise<string | null> {
  const response = await fetch(buildContentsUrl(config, path, config.branch.trim()), {
    headers: createGitHubHeaders(config.token)
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, "Unable to read GitHub file state."));
  }

  const payload = (await response.json()) as { sha?: string };
  return payload.sha ?? null;
}

async function putFileContent(
  config: GitHubRemoteConfig,
  options: PutFileOptions
): Promise<void> {
  const response = await fetch(buildContentsUrl(config, options.path), {
    method: "PUT",
    headers: {
      ...createGitHubHeaders(config.token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: options.message,
      content: encodeBase64(options.content),
      branch: options.branch,
      sha: options.sha ?? undefined
    })
  });

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, `Unable to write ${options.path}.`));
  }
}

function buildContentsUrl(
  config: Pick<GitHubRemoteConfig, "owner" | "repo">,
  path: string,
  branch?: string
): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = `https://api.github.com/repos/${encodeURIComponent(
    config.owner.trim()
  )}/${encodeURIComponent(config.repo.trim())}/contents/${encodedPath}`;

  if (!branch) {
    return base;
  }

  return `${base}?ref=${encodeURIComponent(branch)}`;
}

function createGitHubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`
  };
}

async function formatGitHubError(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) {
      return payload.message;
    }
  } catch {
    // Ignore JSON parse failures and use the fallback below.
  }

  return `${fallbackMessage} (${response.status})`;
}

function encodeBase64(content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function normalizeDirectory(directory: string): string {
  return directory
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

export function getDefaultGitHubDirectory(projectName: string): string {
  return (
    projectName
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "project"
  );
}

function resolveSyncDirectory(directory: string, projectName: string): string {
  const normalizedDirectory = normalizeDirectory(directory);
  return normalizedDirectory || normalizeDirectory(getDefaultGitHubDirectory(projectName));
}

function sanitizeDocumentName(name: string): string {
  return (
    name
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "main.typ"
  );
}

function dedupeFilesByPath(files: Array<{ path: string; content: string | Uint8Array }>) {
  const byPath = new Map<string, { path: string; content: string | Uint8Array }>();
  for (const file of files) {
    byPath.set(file.path, file);
  }
  return [...byPath.values()];
}

function isProjectMetadataPath(path: string): boolean {
  const fileName = path.split("/").pop() ?? path;
  return (
    fileName === PROJECT_METADATA_FILE_NAME ||
    fileName === LEGACY_PROJECT_METADATA_FILE_NAME
  );
}

interface DirectoryEntry {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
}

async function listDirectoryContents(
  config: GitHubRemoteConfig,
  path: string,
  branch: string
): Promise<DirectoryEntry[]> {
  const response = await fetch(buildContentsUrl(config, path, branch), {
    headers: createGitHubHeaders(config.token)
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, "Unable to list directory contents."));
  }

  const items = (await response.json()) as Array<{
    name: string;
    path: string;
    sha: string;
    type: string;
  }>;

  return items
    .filter((item) => item.type === "file" || item.type === "dir")
    .map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      type: item.type === "dir" ? "dir" : "file"
    }));
}

async function fetchFileContent(
  config: GitHubRemoteConfig,
  path: string,
  branch: string
): Promise<string | Uint8Array | null> {
  const response = await fetch(buildContentsUrl(config, path, branch), {
    headers: createGitHubHeaders(config.token)
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, `Unable to read ${path}.`));
  }

  const payload = (await response.json()) as {
    content?: string;
    encoding?: string;
    sha?: string;
    download_url?: string;
  };

  if (!payload.content) {
    if (payload.download_url) {
      const downloadResponse = await fetch(payload.download_url, {
        headers: createGitHubHeaders(config.token)
      });
      if (!downloadResponse.ok) {
        throw new Error(`Unable to download ${path}.`);
      }
      return isBinaryGitHubPath(path)
        ? new Uint8Array(await downloadResponse.arrayBuffer())
        : downloadResponse.text();
    }
    return "";
  }

  const encoding = payload.encoding ?? "base64";
  if (encoding === "base64") {
    const decoded = atob(payload.content.replace(/\n/g, ""));
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return isBinaryGitHubPath(path) ? bytes : new TextDecoder().decode(bytes);
  }

  return payload.content;
}

function isBinaryGitHubPath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|pdf|svg)$/i.test(path);
}

export function buildGitHubSyncDocumentsFromSnapshot(options: {
  snapshot: AppSnapshot;
  workspacePath: string;
  ignorePatterns: string[];
}): Array<GitHubSyncDocument & { updatedAt: string }> {
  return listScopedLocalGitHubDocuments(options.snapshot, options.workspacePath, options.ignorePatterns).map(
    (document) => ({
      name: document.relativePath,
      content: document.content,
      updatedAt: document.updatedAt
    })
  );
}

export function listScopedLocalGitHubDocuments(
  snapshot: AppSnapshot,
  workspacePath: string,
  ignorePatterns: string[]
): ScopedLocalGitHubDocument[] {
  const normalizedWorkspacePath = normalizeRelativePath(workspacePath);

  return snapshot.project.documents
    .map((document) => {
      const relativePath = stripPathPrefix(document.name, normalizedWorkspacePath);
      if (relativePath === null || !relativePath) {
        return null;
      }
      if (isProjectMetadataPath(relativePath)) {
        return null;
      }
      if (shouldIgnorePath(relativePath, ignorePatterns)) {
        return null;
      }
      return {
        id: document.id,
        name: document.name,
        relativePath,
        content: document.content,
        updatedAt: document.updatedAt
      };
    })
    .filter((document): document is ScopedLocalGitHubDocument => document !== null);
}

export function mapPulledDocumentsToWorkspace(
  documents: GitHubSyncDocument[],
  workspacePath: string
): GitHubSyncDocument[] {
  return documents.map((document) => ({
    ...document,
    name: joinRelativePaths(workspacePath, document.name)
  }));
}

export async function listGitHubBranches(
  config: GitHubRemoteConfig
): Promise<GitHubBranchSummary[]> {
  if (!hasRequiredConfig(config)) {
    return [];
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(
      config.repo.trim()
    )}/branches?per_page=100`,
    {
      headers: createGitHubHeaders(config.token)
    }
  );

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, "Unable to load GitHub branches."));
  }

  const payload = (await response.json()) as Array<{
    name?: string;
    protected?: boolean;
    commit?: { sha?: string };
  }>;

  const currentBranch = config.branch.trim();

  return payload.map((branch) => ({
    name: branch.name ?? "",
    sha: branch.commit?.sha ?? "",
    protected: Boolean(branch.protected),
    current: branch.name === currentBranch
  }));
}

export async function fetchGitHubCommitLog(
  config: GitHubRemoteConfig,
  directory: string
): Promise<GitHubCommitSummary[]> {
  if (!hasRequiredConfig(config)) {
    return [];
  }

  const pathQuery = normalizeDirectory(directory);
  const search = new URLSearchParams({
    sha: config.branch.trim(),
    per_page: "20"
  });
  if (pathQuery) {
    search.set("path", pathQuery);
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(
      config.repo.trim()
    )}/commits?${search.toString()}`,
    {
      headers: createGitHubHeaders(config.token)
    }
  );

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, "Unable to load GitHub commit log."));
  }

  const payload = (await response.json()) as Array<{
    sha?: string;
    commit?: {
      message?: string;
      author?: {
        name?: string;
        date?: string;
      };
    };
  }>;

  return payload.map((commit) => ({
    sha: commit.sha ?? "",
    message: commit.commit?.message?.trim() || "Commit",
    authoredAt: commit.commit?.author?.date ?? "",
    authorName: commit.commit?.author?.name ?? "Unknown",
    branchNames: []
  }));
}

export async function fetchGitHubProjectStatus(options: {
  config: GitHubRemoteConfig;
  projectName: string;
  localDocuments: Array<GitHubSyncDocument & { updatedAt: string }>;
}): Promise<GitHubProjectStatusResult> {
  if (!hasRequiredConfig(options.config)) {
    return {
      ok: false,
      message: "Fill in the GitHub owner, repo, branch, and token first.",
      branches: [],
      commits: [],
      files: [],
      remoteUrl: ""
    };
  }

  const directory = resolveSyncDirectory(options.config.directory, options.projectName);

  try {
    const [branches, commits, pullResult] = await Promise.all([
      listGitHubBranches(options.config),
      fetchGitHubCommitLog(options.config, directory),
      pullProjectFromGitHub(options.config, { projectName: options.projectName })
    ]);
    const remoteDocuments = pullResult.documents ?? [];
    const files = buildProjectFileStatuses(options.localDocuments, remoteDocuments);
    const branchBySha = new Map(
      branches.filter((branch) => branch.sha).map((branch) => [branch.sha, branch])
    );

    return {
      ok: true,
      message: pullResult.ok ? pullResult.message : "Loaded GitHub project status.",
      branches,
      commits: commits.map((commit) => ({
        ...commit,
        branchNames: branchBySha.has(commit.sha) ? [branchBySha.get(commit.sha)?.name ?? ""] : []
      })),
      files,
      remoteUrl: `https://github.com/${options.config.owner.trim()}/${options.config.repo.trim()}`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to load GitHub project status.",
      branches: [],
      commits: [],
      files: [],
      remoteUrl: `https://github.com/${options.config.owner.trim()}/${options.config.repo.trim()}`
    };
  }
}

function buildProjectFileStatuses(
  localDocuments: Array<GitHubSyncDocument & { updatedAt: string }>,
  remoteDocuments: GitHubSyncDocument[]
): GitHubProjectFileStatus[] {
  const localMap = new Map(localDocuments.map((document) => [document.name, document]));
  const remoteMap = new Map(remoteDocuments.map((document) => [document.name, document]));
  const paths = new Set([...localMap.keys(), ...remoteMap.keys()]);

  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => {
      const localDocument = localMap.get(path);
      const remoteDocument = remoteMap.get(path);

      if (localDocument && !remoteDocument) {
        return { path, state: "local-only" as const };
      }

      if (!localDocument && remoteDocument) {
        return { path, state: "remote-only" as const };
      }

      if (
        localDocument &&
        remoteDocument &&
        compareSyncContent(localDocument.content, remoteDocument.content)
      ) {
        return { path, state: "in-sync" as const };
      }

      return { path, state: "diverged" as const };
    });
}

function compareSyncContent(left: string | Uint8Array, right: string | Uint8Array): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return left === right;
  }

  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }
    return true;
  }

  return false;
}
