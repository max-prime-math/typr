import {
  loadGitCredentials,
  saveGitCredentials
} from "../storage/indexedDbStorage";

export type GitCredentialMap = Record<string, string>;

const TOKEN_PATTERN = /github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+|[A-Za-z0-9_]{24,}/g;

export async function loadGitCredentialMap(): Promise<GitCredentialMap> {
  return (await loadGitCredentials()) ?? {};
}

export async function saveGitCredentialMap(credentials: GitCredentialMap): Promise<void> {
  const cleaned: GitCredentialMap = {};
  for (const [key, value] of Object.entries(credentials)) {
    const token = value.trim();
    if (token) {
      cleaned[key] = token;
    }
  }
  await saveGitCredentials(cleaned);
}

export function redactGitSecrets(value: string, knownSecrets: string[] = []): string {
  let redacted = value;
  for (const secret of knownSecrets) {
    const token = secret.trim();
    if (token) {
      redacted = redacted.split(token).join("[redacted]");
    }
  }
  return redacted.replace(TOKEN_PATTERN, "[redacted]");
}
