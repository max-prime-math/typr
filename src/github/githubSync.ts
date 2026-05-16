export interface GitHubRemoteConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
}

export interface GitHubSyncTarget {
  documentPath: string;
  commitMessage: string;
}

export interface GitHubSyncResult {
  ok: boolean;
  message: string;
}

export async function pushProjectToGitHub(
  _config: GitHubRemoteConfig,
  _target: GitHubSyncTarget
): Promise<GitHubSyncResult> {
  // TODO: First implementation can use the GitHub REST Contents API with a
  // personal access token stored locally by the user. That keeps the MVP simple
  // before adding OAuth or device login.
  return {
    ok: false,
    message: "GitHub sync is not implemented yet."
  };
}

export async function pullProjectFromGitHub(
  _config: GitHubRemoteConfig,
  _target: Pick<GitHubSyncTarget, "documentPath">
): Promise<GitHubSyncResult> {
  // TODO: Implement pull via the GitHub REST Contents API, then layer conflict
  // detection and merge behavior on top before building a full auth flow.
  return {
    ok: false,
    message: "GitHub sync is not implemented yet."
  };
}
