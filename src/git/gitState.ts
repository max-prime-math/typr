import type { SyncSnapshot } from "../github/conflict";
import {
  normalizeCommittedDocuments,
  normalizeLocalCommits,
  normalizeStagedPaths,
  type GitCommittedDocument,
  type GitLocalCommit
} from "./localCommit";
import type { TerminalBackendId } from "../terminal/types";

export const GIT_STATE_VERSION = 2;

export interface GitManagedProject {
  id: string;
  name: string;
  projectId: string;
  backendId: TerminalBackendId;
  owner: string;
  repo: string;
  branch: string;
  remoteName: string;
  workspacePath: string;
  repositoryPath: string;
  token: string;
  ignorePatterns: string[];
  commitMessageTemplate: string;
  draftCommitMessage: string;
  stagedPaths: string[];
  committedDocuments: Record<string, GitCommittedDocument>;
  localCommits: GitLocalCommit[];
  lastPulledAt: string | null;
  lastPushedAt: string | null;
}

export interface GitWorkspaceState {
  version: number;
  selectedProjectId: string | null;
  projects: GitManagedProject[];
  syncSnapshots: Record<string, SyncSnapshot>;
}

export function createEmptyGitManagedProject(options: {
  projectId: string;
  projectName: string;
  repositoryPath?: string;
}): GitManagedProject {
  return {
    id: `git-project-${crypto.randomUUID()}`,
    name: options.projectName,
    projectId: options.projectId,
    backendId: "browser",
    owner: "",
    repo: "",
    branch: "main",
    remoteName: "origin",
    workspacePath: "",
    repositoryPath: options.repositoryPath ?? "",
    token: "",
    ignorePatterns: [],
    commitMessageTemplate: `Sync ${options.projectName} from typr`,
    draftCommitMessage: "",
    stagedPaths: [],
    committedDocuments: {},
    localCommits: [],
    lastPulledAt: null,
    lastPushedAt: null
  };
}

export function createInitialGitWorkspaceState(options: {
  projectId: string;
  projectName: string;
  repositoryPath?: string;
}): GitWorkspaceState {
  const project = createEmptyGitManagedProject(options);

  return {
    version: GIT_STATE_VERSION,
    selectedProjectId: project.id,
    projects: [project],
    syncSnapshots: {}
  };
}

export function normalizeGitWorkspaceState(
  state: GitWorkspaceState | null | undefined,
  options: { projectId: string; projectName: string; repositoryPath?: string }
): GitWorkspaceState {
  if (!state || !Array.isArray(state.projects) || state.projects.length === 0) {
    return createInitialGitWorkspaceState(options);
  }

  const projects = state.projects.map((project) =>
    normalizeManagedProject(project, options.projectId, options.projectName)
  );
  const selectedProjectId = projects.some((project) => project.id === state.selectedProjectId)
    ? state.selectedProjectId
    : projects[0]?.id ?? null;

  return {
    version: GIT_STATE_VERSION,
    selectedProjectId,
    projects,
    syncSnapshots:
      state.syncSnapshots && typeof state.syncSnapshots === "object" ? state.syncSnapshots : {}
  };
}

export function normalizeManagedProject(
  project: Partial<GitManagedProject>,
  fallbackProjectId: string,
  fallbackProjectName: string
): GitManagedProject {
  return {
    id: project.id?.trim() || `git-project-${crypto.randomUUID()}`,
    name: project.name?.trim() || fallbackProjectName,
    projectId: project.projectId?.trim() || fallbackProjectId,
    backendId: normalizeBackendId(project.backendId),
    owner: project.owner?.trim() || "",
    repo: project.repo?.trim() || "",
    branch: project.branch?.trim() || "main",
    remoteName: project.remoteName?.trim() || "origin",
    workspacePath: normalizeProjectPath(project.workspacePath),
    repositoryPath: normalizeProjectPath(project.repositoryPath),
    token: project.token?.trim() || "",
    ignorePatterns: normalizeIgnorePatterns(project.ignorePatterns),
    commitMessageTemplate:
      project.commitMessageTemplate?.trim() || `Sync ${fallbackProjectName} from typr`,
    draftCommitMessage: project.draftCommitMessage?.trim() || "",
    stagedPaths: normalizeStagedPaths(project.stagedPaths),
    committedDocuments: normalizeCommittedDocuments(project.committedDocuments),
    localCommits: normalizeLocalCommits(project.localCommits),
    lastPulledAt: project.lastPulledAt ?? null,
    lastPushedAt: project.lastPushedAt ?? null
  };
}

export function normalizeProjectPath(path: string | null | undefined): string {
  return (path ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function normalizeIgnorePatterns(patterns: string[] | null | undefined): string[] {
  if (!Array.isArray(patterns)) {
    return [];
  }

  return patterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .filter((pattern, index, list) => list.indexOf(pattern) === index);
}

export function parseIgnorePatternsInput(value: string): string[] {
  return normalizeIgnorePatterns(
    value
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function stringifyIgnorePatterns(patterns: string[]): string {
  return normalizeIgnorePatterns(patterns).join("\n");
}

function normalizeBackendId(backendId: TerminalBackendId | undefined): TerminalBackendId {
  if (backendId === "local-agent" || backendId === "cloud-container") {
    return backendId;
  }

  return "browser";
}
