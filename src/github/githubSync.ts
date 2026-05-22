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
  documents?: GitHubSyncDocument[];
  projectName?: string;
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
  config: GitHubRemoteConfig,
  _target: Pick<GitHubSyncTarget, "projectName">
): Promise<GitHubSyncResult> {
  if (!hasRequiredConfig(config)) {
    return {
      ok: false,
      message: "Fill in owner, repo, branch, directory, and token first."
    };
  }

  const normalizedDirectory = normalizeDirectory(config.directory);
  const branch = config.branch.trim();

  try {
    const remoteFiles = await listDirectoryContents(config, normalizedDirectory, branch);
    const typstFiles = remoteFiles.filter((file) => file.name.endsWith(".typ") && file.type === "file");

    if (typstFiles.length === 0) {
      return {
        ok: false,
        message: `No .typ files found in ${config.owner}/${config.repo}/${normalizedDirectory}.`
      };
    }

    const documents: GitHubSyncDocument[] = [];
    for (const file of typstFiles) {
      const content = await fetchFileContent(config, file.path, branch);
      if (content !== null) {
        documents.push({
          name: file.name.replace(/\.typ$/, ""),
          content
        });
      }
    }

    let projectName = _target.projectName;
    const projectFile = remoteFiles.find((f) => f.name === "typr-project.json" && f.type === "file");
    if (projectFile) {
      const projectContent = await fetchFileContent(config, projectFile.path, branch);
      if (projectContent) {
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
): Promise<string | null> {
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
      return downloadResponse.text();
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
    return new TextDecoder().decode(bytes);
  }

  return payload.content;
}
