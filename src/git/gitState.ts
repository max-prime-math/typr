import type { TerminalBackendId } from "../terminal/types";

export const GIT_STATE_VERSION = 2;

export interface GitManagedProject {
  id: string;
  name: string;
  projectId: string;
  backendId: TerminalBackendId;
  owner: string;
  repo: string;
  connected: boolean;
  branch: string;
  remoteName: string;
  workspacePath: string;
  repositoryPath: string;
  ignorePatterns: string[];
  commitMessageTemplate: string;
  draftCommitMessage: string;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
}

export interface GitWorkspaceState {
  version: number;
  selectedProjectId: string | null;
  selectedProjectIdsByTyprProjectId: Record<string, string | null>;
  projects: GitManagedProject[];
}

export function createEmptyGitManagedProject(options: {
  projectId: string;
  projectName: string;
}): GitManagedProject {
  return {
    id: `git-project-${crypto.randomUUID()}`,
    name: options.projectName,
    projectId: options.projectId,
    backendId: "browser",
    owner: "",
    repo: "",
    connected: false,
    branch: "main",
    remoteName: "origin",
    workspacePath: "",
    repositoryPath: "",
    ignorePatterns: [],
    commitMessageTemplate: `Sync ${options.projectName} from Typr`,
    draftCommitMessage: "",
    lastPulledAt: null,
    lastPushedAt: null
  };
}

export function createInitialGitWorkspaceState(options: {
  projectId: string;
  projectName: string;
}): GitWorkspaceState {
  const project = createEmptyGitManagedProject(options);

  return {
    version: GIT_STATE_VERSION,
    selectedProjectId: project.id,
    selectedProjectIdsByTyprProjectId: {
      [options.projectId]: project.id
    },
    projects: [project]
  };
}

export function normalizeGitWorkspaceState(
  state: GitWorkspaceState | null | undefined,
  options: { projectId: string; projectName: string }
): GitWorkspaceState {
  if (!state || !Array.isArray(state.projects) || state.projects.length === 0) {
    return createInitialGitWorkspaceState(options);
  }

  const projects = state.projects.map((project) =>
    normalizeManagedProject(project, options.projectId, options.projectName)
  );
  const projectsForCurrentTyprProject = projects.filter(
    (project) => project.projectId === options.projectId
  );
  const storedSelectionMap =
    "selectedProjectIdsByTyprProjectId" in state &&
    state.selectedProjectIdsByTyprProjectId &&
    typeof state.selectedProjectIdsByTyprProjectId === "object"
      ? state.selectedProjectIdsByTyprProjectId
      : {};
  const selectedProjectIdsByTyprProjectId = {
    ...storedSelectionMap
  };
  const fallbackSelectedProjectId = projects.some((project) => project.id === state.selectedProjectId)
    ? state.selectedProjectId
    : null;
  const selectedForCurrentProject =
    projectsForCurrentTyprProject.find(
      (project) => project.id === selectedProjectIdsByTyprProjectId[options.projectId]
    )?.id ??
    projectsForCurrentTyprProject.find((project) => project.id === fallbackSelectedProjectId)?.id ??
    projectsForCurrentTyprProject[0]?.id ??
    null;
  selectedProjectIdsByTyprProjectId[options.projectId] = selectedForCurrentProject;

  return {
    version: GIT_STATE_VERSION,
    selectedProjectId: selectedForCurrentProject,
    selectedProjectIdsByTyprProjectId,
    projects
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
    connected:
      typeof project.connected === "boolean"
        ? project.connected
        : Boolean(project.owner?.trim() && project.repo?.trim()),
    branch: project.branch?.trim() || "main",
    remoteName: project.remoteName?.trim() || "origin",
    workspacePath: normalizeProjectPath(project.workspacePath),
    repositoryPath: normalizeProjectPath(project.repositoryPath),
    ignorePatterns: normalizeIgnorePatterns(project.ignorePatterns),
    commitMessageTemplate:
      project.commitMessageTemplate?.trim() || `Sync ${fallbackProjectName} from Typr`,
    draftCommitMessage: project.draftCommitMessage?.trim() || "",
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
