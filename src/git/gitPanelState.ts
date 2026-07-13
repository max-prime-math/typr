import { shouldIgnorePath } from "./pathFilters";
import {
  normalizeGitWorkspaceState,
  type GitManagedProject,
  type GitWorkspaceState
} from "./gitState";
import type { RepoMergeState, RepoStatus } from "./repoBackend";

export interface GitFileStatus {
  path: string;
  state: "in-sync" | "local-only" | "remote-only" | "diverged";
}

export type MergeResolutionDraft =
  | { kind: "oid"; oid: string | null; label: string }
  | { kind: "content"; content: string };

export interface GitMergePanelState {
  mergeKey: string;
  selectedPath: string | null;
  resolutionDrafts: Record<string, MergeResolutionDraft>;
  commitMessage: string;
}

export interface GitRemoteOperationState {
  isRunning: boolean;
  message: string;
  progress: { current: number; total: number } | null;
}

export function getManagedGitProjects(
  workspace: GitWorkspaceState,
  typrProjectId: string | null | undefined
): GitManagedProject[] {
  return typrProjectId
    ? workspace.projects.filter((project) => project.projectId === typrProjectId)
    : [];
}

export function getSelectedManagedGitProject(
  workspace: GitWorkspaceState,
  typrProjectId: string | null | undefined
): GitManagedProject | null {
  if (!typrProjectId) {
    return null;
  }

  const projects = getManagedGitProjects(workspace, typrProjectId);
  const scopedSelection =
    workspace.selectedProjectIdsByTyprProjectId[typrProjectId] ?? workspace.selectedProjectId;
  return (
    projects.find((project) => project.id === scopedSelection) ?? projects[0] ?? null
  );
}

export function selectManagedGitProject(
  workspace: GitWorkspaceState,
  typrProjectId: string,
  managedProjectId: string
): GitWorkspaceState {
  if (
    !workspace.projects.some(
      (project) => project.id === managedProjectId && project.projectId === typrProjectId
    )
  ) {
    return workspace;
  }

  return {
    ...workspace,
    selectedProjectId: managedProjectId,
    selectedProjectIdsByTyprProjectId: {
      ...workspace.selectedProjectIdsByTyprProjectId,
      [typrProjectId]: managedProjectId
    }
  };
}

export function addManagedGitProject(
  workspace: GitWorkspaceState,
  project: GitManagedProject
): GitWorkspaceState {
  const existingProject = workspace.projects.find((candidate) => candidate.id === project.id);
  const projects = existingProject
    ? workspace.projects.map((candidate) => (candidate.id === project.id ? project : candidate))
    : [...workspace.projects, project];

  return selectManagedGitProject({ ...workspace, projects }, project.projectId, project.id);
}

export function updateManagedGitProject(
  workspace: GitWorkspaceState,
  projectId: string,
  updater: (project: GitManagedProject) => GitManagedProject
): GitWorkspaceState {
  return {
    ...workspace,
    projects: workspace.projects.map((project) =>
      project.id === projectId ? updater(project) : project
    )
  };
}

export function removeManagedGitProject(
  workspace: GitWorkspaceState,
  managedProjectId: string,
  fallback: { projectId: string; projectName: string }
): GitWorkspaceState {
  const removedProject = workspace.projects.find((project) => project.id === managedProjectId);
  if (!removedProject) {
    return workspace;
  }

  const projects = workspace.projects.filter((project) => project.id !== managedProjectId);
  const nextScopedSelection =
    projects.find((project) => project.projectId === removedProject.projectId)?.id ?? null;

  return normalizeGitWorkspaceState(
    {
      ...workspace,
      selectedProjectId: nextScopedSelection,
      selectedProjectIdsByTyprProjectId: {
        ...workspace.selectedProjectIdsByTyprProjectId,
        [removedProject.projectId]: nextScopedSelection
      },
      projects
    },
    fallback
  );
}

export function getGitWorkingTreeEntries(
  status: RepoStatus | null,
  ignorePatterns: string[]
): RepoStatus["entries"] {
  return (status?.entries ?? []).filter(
    (entry) => !shouldIgnorePath(entry.path, ignorePatterns)
  );
}

export function getGitFileStatuses(
  status: RepoStatus | null,
  ignorePatterns: string[]
): GitFileStatus[] {
  return getGitWorkingTreeEntries(status, ignorePatterns).map((entry) => ({
    path: entry.path,
    state: entry.staged || entry.worktree ? "diverged" : "in-sync"
  }));
}

export function getGitMergeKey(mergeState: RepoMergeState | null | undefined): string {
  return mergeState
    ? `${mergeState.localSha}:${mergeState.remoteSha}:${mergeState.startedAt}`
    : "";
}

export function createGitMergePanelState(
  mergeState: RepoMergeState | null | undefined
): GitMergePanelState {
  if (!mergeState) {
    return {
      mergeKey: "",
      selectedPath: null,
      resolutionDrafts: {},
      commitMessage: ""
    };
  }

  const firstFile =
    mergeState.files.find((file) => file.state === "conflict") ?? mergeState.files[0] ?? null;
  return {
    mergeKey: getGitMergeKey(mergeState),
    selectedPath: firstFile?.path ?? null,
    resolutionDrafts: {},
    commitMessage: `Merge ${mergeState.remoteName}/${mergeState.remoteBranch} into ${mergeState.branch}`
  };
}

export function resolveGitMergePath(
  state: GitMergePanelState,
  path: string,
  draft: MergeResolutionDraft
): GitMergePanelState {
  return {
    ...state,
    resolutionDrafts: {
      ...state.resolutionDrafts,
      [path]: draft
    }
  };
}

export function createInitialGitRemoteOperationState(): GitRemoteOperationState {
  return { isRunning: false, message: "", progress: null };
}

export function beginGitRemoteOperation(
  state: GitRemoteOperationState,
  message: string
): { accepted: boolean; state: GitRemoteOperationState } {
  if (state.isRunning) {
    return { accepted: false, state };
  }

  return {
    accepted: true,
    state: { isRunning: true, message, progress: null }
  };
}

export function finishGitRemoteOperation(
  _state: GitRemoteOperationState
): GitRemoteOperationState {
  return createInitialGitRemoteOperationState();
}
