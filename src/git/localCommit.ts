export interface GitCommittedDocument {
  content: string | Uint8Array;
  updatedAt: string;
}

export interface GitLocalCommit {
  id: string;
  message: string;
  createdAt: string;
  paths: string[];
  pushedAt: string | null;
}

export interface GitScopedDocument {
  id: string;
  relativePath: string;
  content: string | Uint8Array;
  updatedAt: string;
}

export type GitWorkingTreeStatus =
  | "staged"
  | "modified"
  | "untracked"
  | "deleted"
  | "committed";

export interface GitWorkingTreeEntry {
  path: string;
  status: GitWorkingTreeStatus;
  staged: boolean;
}

export function normalizeCommittedDocuments(
  documents: Record<string, GitCommittedDocument> | null | undefined
): Record<string, GitCommittedDocument> {
  if (!documents || typeof documents !== "object") {
    return {};
  }

  const normalized: Record<string, GitCommittedDocument> = {};
  for (const [path, document] of Object.entries(documents)) {
    if (!document) {
      continue;
    }
    normalized[path] = {
      content: document.content ?? "",
      updatedAt: document.updatedAt ?? new Date().toISOString()
    };
  }
  return normalized;
}

export function normalizeLocalCommits(
  commits: GitLocalCommit[] | null | undefined
): GitLocalCommit[] {
  if (!Array.isArray(commits)) {
    return [];
  }

  return commits
    .map((commit) => ({
      id: commit.id?.trim() || `git-commit-${crypto.randomUUID()}`,
      message: commit.message?.trim() || "Commit",
      createdAt: commit.createdAt ?? new Date().toISOString(),
      paths: Array.isArray(commit.paths)
        ? commit.paths.map((path) => path.trim()).filter(Boolean)
        : [],
      pushedAt: commit.pushedAt ?? null
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function normalizeStagedPaths(paths: string[] | null | undefined): string[] {
  if (!Array.isArray(paths)) {
    return [];
  }

  return paths
    .map((path) => path.trim())
    .filter(Boolean)
    .filter((path, index, list) => list.indexOf(path) === index)
    .sort((left, right) => left.localeCompare(right));
}

export function listWorkingTreeEntries(options: {
  committedDocuments: Record<string, GitCommittedDocument>;
  scopedDocuments: GitScopedDocument[];
  stagedPaths: string[];
}): GitWorkingTreeEntry[] {
  const committedDocuments = normalizeCommittedDocuments(options.committedDocuments);
  const currentByPath = new Map(options.scopedDocuments.map((document) => [document.relativePath, document]));
  const stagedPathSet = new Set(normalizeStagedPaths(options.stagedPaths));
  const paths = new Set([...Object.keys(committedDocuments), ...currentByPath.keys()]);

  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => {
      const committedDocument = committedDocuments[path];
      const currentDocument = currentByPath.get(path);
      const changed = !compareCommittedDocumentToScopedDocument(committedDocument, currentDocument);
      let status: GitWorkingTreeStatus = "committed";

      if (!committedDocument && currentDocument) {
        status = "untracked";
      } else if (committedDocument && !currentDocument) {
        status = "deleted";
      } else if (changed) {
        status = "modified";
      }

      if (stagedPathSet.has(path) && status !== "committed") {
        status = "staged";
      }

      return {
        path,
        status,
        staged: stagedPathSet.has(path)
      };
    });
}

export function listChangedPaths(entries: GitWorkingTreeEntry[]): string[] {
  return entries
    .filter((entry) => entry.status !== "committed")
    .map((entry) => entry.path);
}

export function hasUncommittedChanges(entries: GitWorkingTreeEntry[]): boolean {
  return entries.some((entry) => entry.status !== "committed");
}

export function applyLocalCommit(options: {
  committedDocuments: Record<string, GitCommittedDocument>;
  scopedDocuments: GitScopedDocument[];
  stagedPaths: string[];
  message: string;
}): {
  committedDocuments: Record<string, GitCommittedDocument>;
  commit: GitLocalCommit;
} {
  const committedDocuments = {
    ...normalizeCommittedDocuments(options.committedDocuments)
  };
  const currentByPath = new Map(options.scopedDocuments.map((document) => [document.relativePath, document]));
  const stagedPaths = normalizeStagedPaths(options.stagedPaths);
  const createdAt = new Date().toISOString();

  for (const path of stagedPaths) {
    const currentDocument = currentByPath.get(path);
    if (!currentDocument) {
      delete committedDocuments[path];
      continue;
    }

    committedDocuments[path] = {
      content: currentDocument.content,
      updatedAt: currentDocument.updatedAt
    };
  }

  return {
    committedDocuments,
    commit: {
      id: `git-commit-${crypto.randomUUID()}`,
      message: options.message.trim() || "Commit",
      createdAt,
      paths: stagedPaths,
      pushedAt: null
    }
  };
}

export function convertCommittedDocumentsToSyncDocuments(
  documents: Record<string, GitCommittedDocument>
): Array<{ name: string; content: string | Uint8Array; updatedAt: string }> {
  return Object.entries(normalizeCommittedDocuments(documents))
    .map(([name, document]) => ({
      name,
      content: document.content,
      updatedAt: document.updatedAt
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildCommittedDocumentsFromRemote(
  documents: Array<{ name: string; content: string | Uint8Array }>
): Record<string, GitCommittedDocument> {
  const updatedAt = new Date().toISOString();
  return Object.fromEntries(
    documents.map((document) => [
      document.name,
      {
        content: document.content,
        updatedAt
      }
    ])
  );
}

export function markLocalCommitsPushed(commits: GitLocalCommit[]): GitLocalCommit[] {
  const pushedAt = new Date().toISOString();
  return normalizeLocalCommits(commits).map((commit) => ({
    ...commit,
    pushedAt: commit.pushedAt ?? pushedAt
  }));
}

function compareCommittedDocumentToScopedDocument(
  committedDocument: GitCommittedDocument | undefined,
  scopedDocument: GitScopedDocument | undefined
): boolean {
  if (!committedDocument && !scopedDocument) {
    return true;
  }

  if (!committedDocument || !scopedDocument) {
    return false;
  }

  return compareContent(committedDocument.content, scopedDocument.content);
}

function compareContent(left: string | Uint8Array, right: string | Uint8Array): boolean {
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
