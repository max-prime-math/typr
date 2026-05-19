export interface GitHubRemoteConfig {
  owner: string;
  repo: string;
  branch: string;
  directory: string;
  token: string;
}

export interface GitHubSyncDocument {
  name: string;
  content: string;
}

export interface GitHubSyncTarget {
  projectName: string;
  documents: GitHubSyncDocument[];
  commitMessage: string;
}

export interface GitHubSyncResult {
  ok: boolean;
  message: string;
}

interface PutFileOptions {
  branch: string;
  content: string;
  message: string;
  path: string;
  sha: string | null;
}

export function createEmptyGitHubRemoteConfig(): GitHubRemoteConfig {
  return {
    owner: "",
    repo: "",
    branch: "main",
    directory: "docs",
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
      config.directory?.trim() &&
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
      message: "Fill in the GitHub owner, repo, branch, directory, and token first."
    };
  }

  if (target.documents.length === 0) {
    return {
      ok: false,
      message: "There are no documents to push."
    };
  }

  const normalizedDirectory = normalizeDirectory(config.directory);
  const commitMessage = target.commitMessage.trim() || "Sync project from typr";
  const files = [
    ...target.documents.map((document) => ({
      path: `${normalizedDirectory}/${sanitizeDocumentName(document.name)}`,
      content: document.content
    })),
    {
      path: `${normalizedDirectory}/typr-project.json`,
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
    for (const file of files) {
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
  _config: GitHubRemoteConfig,
  _target: Pick<GitHubSyncTarget, "projectName">
): Promise<GitHubSyncResult> {
  // TODO: Implement pull via the GitHub REST Contents API, then layer conflict
  // detection and merge behavior on top before building a full auth flow.
  return {
    ok: false,
    message: "GitHub sync is not implemented yet."
  };
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

function encodeBase64(content: string): string {
  const bytes = new TextEncoder().encode(content);
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

function sanitizeDocumentName(name: string): string {
  return (
    name
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "main.typ"
  );
}
