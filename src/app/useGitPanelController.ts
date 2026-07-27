import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import {
  addManagedGitProject,
  beginGitRemoteOperation,
  createGitMergePanelState,
  createInitialGitRemoteOperationState,
  finishGitRemoteOperation,
  getGitFileStatuses,
  getGitWorkingTreeEntries,
  getManagedGitProjects,
  getSelectedManagedGitProject,
  removeManagedGitProject,
  updateManagedGitProject,
  type GitFileStatus,
  type MergeResolutionDraft
} from "../git/gitPanelState";
import {
  createEmptyGitManagedProject,
  type GitManagedProject,
  type GitWorkspaceState
} from "../git/gitState";
import { redactGitSecrets } from "../git/credentials";
import {
  createRepoBackend,
  formatRepoError,
  type RepoBranch,
  type RepoCommit,
  type RepoMergeResolution,
  type RepoStatus
} from "../git/repoBackend";
import {
  createRemoteGitService,
  type RemoteGitAccount,
  type RemoteGitBranchSummary,
  type RemoteGitConfig,
  type RemoteGitProgress,
  type RemoteGitResult,
  type RemoteGitRepositorySummary,
  type UpstreamTracking
} from "../git/remoteService";
import type { TyprProjectRepository } from "../project/projectState";

const SYNC_PROGRESS_UPDATE_INTERVAL_MS = 250;

function hasRepoChanges(status: RepoStatus | null): boolean {
  return Boolean(status?.entries.some((entry) => entry.staged !== null || entry.worktree !== null));
}

function hasActiveMergeStop(status: RepoStatus | null): boolean {
  return Boolean(status?.mergeState);
}

function isRemoteDivergenceMessage(message: string): boolean {
  return /remote contains work|pull first|diverged|non-fast-forward/i.test(message);
}

function getFirstChangedMergeLineNumber(
  baseText: string,
  localText: string,
  remoteText: string
): number {
  const baseLines = baseText.split("\n");
  const localLines = localText.split("\n");
  const remoteLines = remoteText.split("\n");
  const lineCount = Math.max(baseLines.length, localLines.length, remoteLines.length);
  for (let index = 0; index < lineCount; index += 1) {
    if (baseLines[index] !== localLines[index] || baseLines[index] !== remoteLines[index]) {
      return index + 1;
    }
  }
  return 1;
}

function scrollMergeBodyToLine(body: HTMLDivElement, lineNumber: number): void {
  const line = body.querySelector<HTMLElement>(`[data-merge-line="${lineNumber}"]`);
  if (line) {
    body.scrollTop = Math.max(0, line.offsetTop - body.offsetTop);
  }
}

export type GitMergePaneMode = "sidebar" | "source" | "preview";
export type MergeVersionRole = "base" | "local" | "remote";
export type GitHubRepoMode = "select" | "create" | "manual";

export interface GitHubDiscoveryState {
  status: "idle" | "loading" | "connected" | "error";
  message: string;
  accountLogin: string | null;
  owners: RemoteGitAccount[];
  repos: RemoteGitRepositorySummary[];
  branches: RemoteGitBranchSummary[];
  repoMode: GitHubRepoMode;
  isLoadingRepos: boolean;
  isLoadingBranches: boolean;
}

export interface GitHubCloneState {
  isOpen: boolean;
  mode: "clone" | "create";
  status: "idle" | "loading" | "connected" | "error";
  token: string;
  owner: string;
  repo: string;
  branch: string;
  projectName: string;
  repositoryUrl: string;
  message: string;
  accountLogin: string | null;
  owners: RemoteGitAccount[];
  repos: RemoteGitRepositorySummary[];
  branches: RemoteGitBranchSummary[];
  isLoadingRepos: boolean;
  isLoadingBranches: boolean;
  progress: { current: number; total: number } | null;
}

export interface MergeVersionPreview {
  oid: string | null;
  label: string;
  text: string;
}

export interface MergeFilePreview {
  path: string;
  base: MergeVersionPreview;
  local: MergeVersionPreview;
  remote: MergeVersionPreview;
}

interface SyncFeedback {
  tone: "neutral" | "success" | "error";
  text: string;
}

interface SyncStatusSnapshot extends SyncFeedback {
  progress: { current: number; total: number } | null;
}

export function createInitialGitHubDiscoveryState(): GitHubDiscoveryState {
  return {
    status: "idle",
    message: "",
    accountLogin: null,
    owners: [],
    repos: [],
    branches: [],
    repoMode: "select",
    isLoadingRepos: false,
    isLoadingBranches: false
  };
}

export function createInitialGitHubCloneState(): GitHubCloneState {
  return {
    isOpen: false,
    mode: "clone",
    status: "idle",
    token: "",
    owner: "",
    repo: "",
    branch: "main",
    projectName: "",
    repositoryUrl: "",
    message: "",
    accountLogin: null,
    owners: [],
    repos: [],
    branches: [],
    isLoadingRepos: false,
    isLoadingBranches: false,
    progress: null
  };
}

export function useGitPanelController({
  isGitPanelActive,
  isHydrated,
  selectedProjectRepository,
  fallbackProjectId,
  fallbackProjectName,
  setProjectRepository,
  setSyncFeedback,
  setSyncStatusSnapshot
}: {
  isGitPanelActive: boolean;
  isHydrated: boolean;
  selectedProjectRepository: TyprProjectRepository | null;
  fallbackProjectId: string;
  fallbackProjectName: string;
  setProjectRepository: (
    updater: (project: TyprProjectRepository) => TyprProjectRepository
  ) => void;
  setSyncFeedback: (feedback: SyncFeedback) => void;
  setSyncStatusSnapshot: (status: SyncStatusSnapshot) => void;
}) {
  const gitStatusRequestRef = useRef(0);
  const mergeVersionBodyRefs = useRef<Record<MergeVersionRole, HTMLDivElement | null>>({
    base: null,
    local: null,
    remote: null
  });
  const isSyncingMergeScrollRef = useRef(false);
  const pendingSyncProgressRef = useRef<RemoteGitProgress | null>(null);
  const syncProgressFlushTimerRef = useRef<number | null>(null);
  const lastSyncProgressFlushAtRef = useRef(0);
  const remoteOperationRef = useRef(createInitialGitRemoteOperationState());
  const [gitMergePaneMode, setGitMergePaneMode] = useState<GitMergePaneMode>("sidebar");
  const [gitWorkspace, setGitWorkspace] = useState<GitWorkspaceState>({
    version: 1,
    selectedProjectId: null,
    selectedProjectIdsByTyprProjectId: {},
    projects: []
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [gitCredentials, setGitCredentials] = useState<Record<string, string>>({});
  const [gitHubDiscovery, setGitHubDiscovery] = useState<GitHubDiscoveryState>(
    createInitialGitHubDiscoveryState
  );
  const [gitHubClone, setGitHubClone] = useState<GitHubCloneState>(
    createInitialGitHubCloneState
  );
  const [upstreamTracking, setUpstreamTracking] = useState<UpstreamTracking | null>(null);
  const [createGitHubRepoPrivate, setCreateGitHubRepoPrivate] = useState(true);
  const [isGitStatusLoading, setIsGitStatusLoading] = useState(false);
  const repoBackend = useMemo(() => createRepoBackend(), []);
  const remoteGitService = useMemo(() => createRemoteGitService({ repoBackend }), [repoBackend]);
  const [localRepoStatus, setLocalRepoStatus] = useState<RepoStatus | null>(null);
  const [localRepoCommits, setLocalRepoCommits] = useState<RepoCommit[]>([]);
  const [localRepoBranches, setLocalRepoBranches] = useState<RepoBranch[]>([]);
  const [filesGitConflictNotice, setFilesGitConflictNotice] = useState<string | null>(null);
  const [selectedMergePath, setSelectedMergePath] = useState<string | null>(null);
  const [mergeFilePreview, setMergeFilePreview] = useState<MergeFilePreview | null>(null);
  const [isMergeFilePreviewLoading, setIsMergeFilePreviewLoading] = useState(false);
  const [mergeResolutionDrafts, setMergeResolutionDrafts] = useState<
    Record<string, MergeResolutionDraft>
  >({});
  const [mergeCommitMessage, setMergeCommitMessage] = useState("");
  const [gitRefreshToken, setGitRefreshToken] = useState(0);

  const typrProjectId = selectedProjectRepository?.id ?? null;
  const gitProjectsForSelectedTyprProject = useMemo(
    () => getManagedGitProjects(gitWorkspace, typrProjectId),
    [gitWorkspace, typrProjectId]
  );
  const selectedGitProject = useMemo(
    () => getSelectedManagedGitProject(gitWorkspace, typrProjectId),
    [gitWorkspace, typrProjectId]
  );
  const remoteConfig = useMemo<RemoteGitConfig>(
    () =>
      selectedGitProject
        ? {
            owner: selectedGitProject.owner,
            repo: selectedGitProject.repo,
            branch: selectedGitProject.branch,
            remoteName: selectedGitProject.remoteName
          }
        : { owner: "", repo: "", branch: "main", remoteName: "origin" },
    [selectedGitProject]
  );
  const selectedGitToken = selectedGitProject
    ? (gitCredentials[selectedGitProject.id] ?? "")
    : "";
  const selectedGitProjectIsGitHubConnected = Boolean(
    selectedGitProject?.connected && selectedGitProject.owner.trim() && selectedGitProject.repo.trim()
  );
  const selectedProjectGitConnectionLabel = selectedGitProjectIsGitHubConnected
    ? "Connected"
    : "Not connected";
  const gitWorkingTreeEntries = useMemo(
    () =>
      selectedGitProject
        ? getGitWorkingTreeEntries(localRepoStatus, selectedGitProject.ignorePatterns)
        : [],
    [localRepoStatus, selectedGitProject]
  );
  const localGitCommits = useMemo(
    () => (selectedGitProject ? localRepoCommits : []),
    [localRepoCommits, selectedGitProject]
  );
  const gitBranches = useMemo(
    () => (selectedGitProject ? localRepoBranches : []),
    [localRepoBranches, selectedGitProject]
  );
  const gitCommitHistory = useMemo(
    () => (selectedGitProject ? localRepoCommits : []),
    [localRepoCommits, selectedGitProject]
  );
  const gitFileStatuses = useMemo<GitFileStatus[]>(
    () =>
      selectedGitProject
        ? getGitFileStatuses(localRepoStatus, selectedGitProject.ignorePatterns)
        : [],
    [localRepoStatus, selectedGitProject]
  );
  const activeMergeState = localRepoStatus?.mergeState ?? null;
  const activeMergeKey = activeMergeState
    ? `${activeMergeState.localSha}:${activeMergeState.remoteSha}:${activeMergeState.startedAt}`
    : "";
  const conflictMergeFiles = useMemo(
    () => activeMergeState?.files.filter((file) => file.state === "conflict") ?? [],
    [activeMergeState]
  );
  const unresolvedMergeConflictCount = conflictMergeFiles.filter(
    (file) => !mergeResolutionDrafts[file.path]
  ).length;
  const selectedMergeDraft = selectedMergePath ? mergeResolutionDrafts[selectedMergePath] : null;
  const mergeResolutionEditorValue = useMemo(() => {
    if (!selectedMergeDraft || !mergeFilePreview) return "";
    if (selectedMergeDraft.kind === "content") return selectedMergeDraft.content;
    const matchingVersion = [
      mergeFilePreview.base,
      mergeFilePreview.local,
      mergeFilePreview.remote
    ].find((version) => version.oid === selectedMergeDraft.oid);
    return matchingVersion?.oid ? matchingVersion.text : "";
  }, [mergeFilePreview, selectedMergeDraft]);

  const updateGitManagedProject = useCallback(
    (projectId: string, updater: (project: GitManagedProject) => GitManagedProject) => {
      setGitWorkspace((workspace) => updateManagedGitProject(workspace, projectId, updater));
    },
    []
  );
  const updateSelectedGitProject = useCallback(
    (updater: (project: GitManagedProject) => GitManagedProject) => {
      if (!selectedGitProject) return;
      updateGitManagedProject(selectedGitProject.id, updater);
    },
    [selectedGitProject, updateGitManagedProject]
  );
  const refreshLocalRepoState = useCallback(
    async (project: TyprProjectRepository | null = selectedProjectRepository) => {
      const requestId = gitStatusRequestRef.current + 1;
      gitStatusRequestRef.current = requestId;
      if (!project) {
        setLocalRepoStatus(null);
        setLocalRepoCommits([]);
        setLocalRepoBranches([]);
        setUpstreamTracking(null);
        return;
      }

      setIsGitStatusLoading(true);
      const initResult = await repoBackend.initRepository(project);
      if (gitStatusRequestRef.current !== requestId) return;
      if (!initResult.ok) {
        setIsGitStatusLoading(false);
        setSyncFeedback({ tone: "error", text: formatRepoError(initResult.error) });
        return;
      }

      if (initResult.value !== project) {
        setProjectRepository((currentProject) =>
          currentProject.id === initResult.value.id ? initResult.value : currentProject
        );
      }
      const initializedProject = initResult.value;
      const [statusResult, branchesResult, commitsResult] = await Promise.all([
        repoBackend.status(initializedProject),
        repoBackend.listBranches(initializedProject),
        repoBackend.log(initializedProject, 30)
      ]);
      if (gitStatusRequestRef.current !== requestId) return;
      setIsGitStatusLoading(false);
      if (!statusResult.ok) {
        setSyncFeedback({ tone: "error", text: formatRepoError(statusResult.error) });
        return;
      }

      setLocalRepoStatus(statusResult.value);
      setLocalRepoBranches(branchesResult.ok ? branchesResult.value : []);
      setLocalRepoCommits(commitsResult.ok ? commitsResult.value : []);
      if (!selectedGitProject) {
        setUpstreamTracking(null);
        return;
      }
      const upstream = await remoteGitService.inspectUpstream(initializedProject, {
        owner: selectedGitProject.owner,
        repo: selectedGitProject.repo,
        branch: statusResult.value.branch,
        remoteName: selectedGitProject.remoteName
      });
      if (gitStatusRequestRef.current === requestId) {
        setUpstreamTracking(upstream.ok ? upstream.value : null);
      }
    },
    [
      remoteGitService,
      repoBackend,
      selectedGitProject,
      selectedProjectRepository,
      setProjectRepository,
      setSyncFeedback
    ]
  );
  const stageGitPaths = useCallback(
    async (paths: string[]) => {
      if (!selectedProjectRepository) return;
      const result = await repoBackend.stagePaths(selectedProjectRepository, paths);
      if (!result.ok) {
        setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
        return;
      }
      setLocalRepoStatus(result.value);
      setGitRefreshToken((token) => token + 1);
    },
    [repoBackend, selectedProjectRepository, setSyncFeedback]
  );
  const unstageGitPath = useCallback(
    async (path: string) => {
      if (!selectedProjectRepository) return;
      const result = await repoBackend.resetIndex(selectedProjectRepository, [path]);
      if (!result.ok) {
        setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
        return;
      }
      setLocalRepoStatus(result.value);
      setGitRefreshToken((token) => token + 1);
    },
    [repoBackend, selectedProjectRepository, setSyncFeedback]
  );
  const stageAllGitChanges = useCallback(() => {
    const changedPaths = gitWorkingTreeEntries.map((entry) => entry.path);
    if (changedPaths.length === 0) {
      setSyncFeedback({ tone: "neutral", text: "No local changes to stage." });
      return;
    }

    void stageGitPaths(changedPaths);
    setSyncFeedback({
      tone: "success",
      text: `Staged ${changedPaths.length} path${changedPaths.length === 1 ? "" : "s"}.`
    });
  }, [gitWorkingTreeEntries, setSyncFeedback, stageGitPaths]);
  const commitGitChanges = useCallback(async () => {
    if (!selectedGitProject || !selectedProjectRepository) {
      setSyncFeedback({
        tone: "error",
        text: "Create or select a managed git project first."
      });
      return;
    }
    if (!localRepoStatus?.entries.some((entry) => entry.staged !== null)) {
      setSyncFeedback({ tone: "error", text: "Stage one or more files before committing." });
      return;
    }

    const message = selectedGitProject.draftCommitMessage.trim();
    if (!message) {
      setSyncFeedback({ tone: "error", text: "Enter a commit message first." });
      return;
    }

    const result = await repoBackend.commit(selectedProjectRepository, { message });
    if (!result.ok) {
      setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
      return;
    }

    updateGitManagedProject(selectedGitProject.id, (project) => ({
      ...project,
      draftCommitMessage: "",
      commitMessageTemplate: message
    }));
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Committed ${result.value.shortSha}: ${result.value.message}`
    });
  }, [
    localRepoStatus,
    repoBackend,
    selectedGitProject,
    selectedProjectRepository,
    setSyncFeedback,
    updateGitManagedProject
  ]);
  const addGitProject = useCallback(() => {
    if (!selectedProjectRepository) return null;
    const managedProject = createEmptyGitManagedProject({
      projectId: selectedProjectRepository.id,
      projectName: selectedProjectRepository.displayName
    });
    setGitWorkspace((workspace) => addManagedGitProject(workspace, managedProject));
    return managedProject.id;
  }, [selectedProjectRepository]);
  const ensureGitProject = useCallback(
    (project: TyprProjectRepository, projectName = project.displayName) => {
      const existingProjects = getManagedGitProjects(gitWorkspace, project.id);
      const scopedSelection = gitWorkspace.selectedProjectIdsByTyprProjectId[project.id];
      const existingProject =
        existingProjects.find((candidate) => candidate.id === scopedSelection) ?? existingProjects[0];
      if (existingProject) {
        setGitWorkspace((workspace) => addManagedGitProject(workspace, existingProject));
        return existingProject.id;
      }
      const managedProject = createEmptyGitManagedProject({ projectId: project.id, projectName });
      setGitWorkspace((workspace) => addManagedGitProject(workspace, managedProject));
      return managedProject.id;
    },
    [gitWorkspace]
  );
  const removeSelectedGitProject = useCallback(() => {
    if (!selectedGitProject) return;
    setGitWorkspace((workspace) =>
      removeManagedGitProject(workspace, selectedGitProject.id, {
        projectId: selectedProjectRepository?.id ?? fallbackProjectId,
        projectName: selectedProjectRepository?.displayName ?? fallbackProjectName
      })
    );
  }, [
    fallbackProjectId,
    fallbackProjectName,
    selectedGitProject,
    selectedProjectRepository
  ]);

  const abortGitMerge = useCallback(async () => {
    if (!selectedProjectRepository) return;
    const result = await repoBackend.abortMerge(selectedProjectRepository);
    if (!result.ok) {
      setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
      return;
    }

    setLocalRepoStatus(result.value);
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "neutral",
      text: "Cleared the browser merge stop. Local files and commits were left unchanged."
    });
  }, [repoBackend, selectedProjectRepository, setSyncFeedback]);
  const useMergeVersion = useCallback((path: string, label: string, oid: string | null) => {
    setMergeResolutionDrafts((drafts) => ({
      ...drafts,
      [path]: { kind: "oid", oid, label }
    }));
  }, []);
  const editMergeResolution = useCallback((path: string, content: string) => {
    setMergeResolutionDrafts((drafts) => ({
      ...drafts,
      [path]: { kind: "content", content }
    }));
  }, []);
  const continueGitMerge = useCallback(async () => {
    if (!selectedProjectRepository || !activeMergeState) return;

    const unresolvedFile = conflictMergeFiles.find((file) => !mergeResolutionDrafts[file.path]);
    if (unresolvedFile) {
      setSyncFeedback({
        tone: "error",
        text: `Resolve ${unresolvedFile.path} before continuing the merge.`
      });
      setSelectedMergePath(unresolvedFile.path);
      return;
    }

    const resolutions: RepoMergeResolution[] = conflictMergeFiles.map((file) => {
      const draft = mergeResolutionDrafts[file.path];
      return draft.kind === "content"
        ? { path: file.path, content: draft.content }
        : { path: file.path, oid: draft.oid };
    });
    const result = await repoBackend.continueMerge(selectedProjectRepository, {
      message:
        mergeCommitMessage.trim() ||
        `Merge ${activeMergeState.remoteName}/${activeMergeState.remoteBranch} into ${activeMergeState.branch}`,
      resolutions
    });
    if (!result.ok) {
      setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
      return;
    }

    setProjectRepository((project) =>
      project.id === result.value.project.id ? result.value.project : project
    );
    setLocalRepoStatus(result.value.status);
    setMergeResolutionDrafts({});
    setMergeFilePreview(null);
    setSelectedMergePath(null);
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Created merge commit ${result.value.commit.shortSha}. You can push again now.`
    });
  }, [
    activeMergeState,
    conflictMergeFiles,
    mergeCommitMessage,
    mergeResolutionDrafts,
    repoBackend,
    selectedProjectRepository,
    setProjectRepository,
    setSyncFeedback
  ]);
  useEffect(() => {
    const nextState = createGitMergePanelState(activeMergeState);
    setSelectedMergePath(nextState.selectedPath);
    setMergeFilePreview(null);
    setMergeResolutionDrafts(nextState.resolutionDrafts);
    setMergeCommitMessage(nextState.commitMessage);
  }, [activeMergeKey]);

  useEffect(() => {
    if (!activeMergeState || !selectedProjectRepository || !selectedMergePath) {
      setMergeFilePreview(null);
      setIsMergeFilePreviewLoading(false);
      return;
    }
    const file = activeMergeState.files.find((entry) => entry.path === selectedMergePath);
    if (!file) {
      setMergeFilePreview(null);
      return;
    }
    let cancelled = false;
    const readVersion = async (oid: string | null, label: string): Promise<MergeVersionPreview> => {
      if (!oid) return { oid: null, label, text: "(deleted)" };
      const object = await repoBackend.readObject(selectedProjectRepository, oid);
      if (!object.ok) return { oid, label, text: formatRepoError(object.error) };
      if (object.value.type !== "blob") {
        return { oid, label, text: `Unsupported ${object.value.type} object.` };
      }
      return { oid, label, text: new TextDecoder().decode(object.value.content) };
    };
    setIsMergeFilePreviewLoading(true);
    void Promise.all([
      readVersion(file.baseOid, "Base"),
      readVersion(file.localOid, "Local"),
      readVersion(file.remoteOid, "Remote")
    ]).then(([base, local, remote]) => {
      if (cancelled) return;
      setMergeFilePreview({ path: file.path, base, local, remote });
      setIsMergeFilePreviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeMergeState, repoBackend, selectedMergePath, selectedProjectRepository]);

  useEffect(() => {
    if (!isGitPanelActive || !isHydrated || !selectedProjectRepository) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (!cancelled) void refreshLocalRepoState(selectedProjectRepository);
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    gitRefreshToken,
    isGitPanelActive,
    isHydrated,
    refreshLocalRepoState,
    selectedProjectRepository?.filesystem.updatedAt,
    selectedProjectRepository?.git.headRef,
    selectedProjectRepository?.id
  ]);

  useEffect(() => {
    gitStatusRequestRef.current += 1;
    setIsGitStatusLoading(false);
    setLocalRepoStatus(null);
    setLocalRepoCommits([]);
    setLocalRepoBranches([]);
    setUpstreamTracking(null);
  }, [selectedProjectRepository?.id]);

  const applyRemoteGitProgress = useCallback(
    (progress: RemoteGitProgress) => {
      if (
        typeof progress.current === "number" &&
        typeof progress.total === "number" &&
        progress.total > 0
      ) {
        const normalizedProgress = {
          current: Math.max(0, Math.min(progress.current, progress.total)),
          total: progress.total
        };
        remoteOperationRef.current = {
          ...remoteOperationRef.current,
          message: progress.message,
          progress: normalizedProgress
        };
        setSyncStatusSnapshot({ tone: "neutral", text: progress.message, progress: normalizedProgress });
        return;
      }
      remoteOperationRef.current = {
        ...remoteOperationRef.current,
        message: progress.message,
        progress: null
      };
      setSyncStatusSnapshot({ tone: "neutral", text: progress.message, progress: null });
    },
    [setSyncStatusSnapshot]
  );
  const flushRemoteGitProgress = useCallback(() => {
    const progress = pendingSyncProgressRef.current;
    if (!progress) return;
    pendingSyncProgressRef.current = null;
    if (syncProgressFlushTimerRef.current !== null) {
      window.clearTimeout(syncProgressFlushTimerRef.current);
      syncProgressFlushTimerRef.current = null;
    }
    lastSyncProgressFlushAtRef.current = Date.now();
    applyRemoteGitProgress(progress);
  }, [applyRemoteGitProgress]);
  const handleRemoteGitProgress = useCallback(
    (progress: RemoteGitProgress) => {
      if (
        typeof progress.current === "number" &&
        typeof progress.total === "number" &&
        progress.total > 0
      ) {
        pendingSyncProgressRef.current = progress;
        const elapsed = Date.now() - lastSyncProgressFlushAtRef.current;
        const complete = progress.current >= progress.total;
        if (complete || elapsed >= SYNC_PROGRESS_UPDATE_INTERVAL_MS) {
          flushRemoteGitProgress();
          return;
        }
        if (syncProgressFlushTimerRef.current === null) {
          syncProgressFlushTimerRef.current = window.setTimeout(
            flushRemoteGitProgress,
            SYNC_PROGRESS_UPDATE_INTERVAL_MS - elapsed
          );
        }
        return;
      }
      pendingSyncProgressRef.current = progress;
      flushRemoteGitProgress();
    },
    [flushRemoteGitProgress]
  );
  const beginRemoteOperation = useCallback(
    (message: string) => {
      const transition = beginGitRemoteOperation(remoteOperationRef.current, message);
      if (!transition.accepted) {
        setSyncFeedback({ tone: "neutral", text: "A Git remote operation is already running." });
        return false;
      }
      remoteOperationRef.current = transition.state;
      pendingSyncProgressRef.current = null;
      if (syncProgressFlushTimerRef.current !== null) {
        window.clearTimeout(syncProgressFlushTimerRef.current);
        syncProgressFlushTimerRef.current = null;
      }
      lastSyncProgressFlushAtRef.current = 0;
      setIsSyncing(true);
      setSyncFeedback({ tone: "neutral", text: message });
      return true;
    },
    [setSyncFeedback]
  );
  const finishRemoteOperationCoordination = useCallback(() => {
    remoteOperationRef.current = finishGitRemoteOperation(remoteOperationRef.current);
    pendingSyncProgressRef.current = null;
    if (syncProgressFlushTimerRef.current !== null) {
      window.clearTimeout(syncProgressFlushTimerRef.current);
      syncProgressFlushTimerRef.current = null;
    }
    setIsSyncing(false);
  }, []);

  const finishRemoteAction = useCallback(
    async (
      result: RemoteGitResult,
      updateProject: "pull" | "push" | "fetch" | "sync"
    ) => {
      finishRemoteOperationCoordination();
      const message = redactGitSecrets(result.message, [selectedGitToken]);
      setSyncFeedback({ tone: result.ok ? "success" : "error", text: message });
      if (result.project) {
        setProjectRepository((project) =>
          project.id === result.project?.id ? result.project : project
        );
      }
      if (result.status) setLocalRepoStatus(result.status);
      if (result.ok && selectedGitProject) {
        updateGitManagedProject(selectedGitProject.id, (project) => ({
          ...project,
          lastPulledAt:
            updateProject === "pull" || updateProject === "sync" || updateProject === "fetch"
              ? new Date().toISOString()
              : project.lastPulledAt,
          lastPushedAt:
            updateProject === "push" || updateProject === "sync"
              ? new Date().toISOString()
              : project.lastPushedAt
        }));
      }
      setGitRefreshToken((token) => token + 1);
      return result.ok
        ? { ok: true as const, message }
        : { ok: false as const, message };
    },
    [
      finishRemoteOperationCoordination,
      selectedGitProject,
      selectedGitToken,
      setProjectRepository,
      setSyncFeedback,
      updateGitManagedProject
    ]
  );
  const fetchRemote = useCallback(
    async (repository: TyprProjectRepository) => {
      if (!beginRemoteOperation(`Fetching ${remoteConfig.remoteName}/${remoteConfig.branch}...`)) {
        return { ok: false as const, message: "A Git remote operation is already running." };
      }
      const result = await remoteGitService.fetch(
        repository,
        remoteConfig,
        () => selectedGitToken,
        { onProgress: handleRemoteGitProgress }
      );
      return finishRemoteAction(result, "fetch");
    },
    [
      beginRemoteOperation,
      finishRemoteAction,
      handleRemoteGitProgress,
      remoteConfig,
      remoteGitService,
      selectedGitToken
    ]
  );
  const pushRemote = useCallback(
    async (repository: TyprProjectRepository) => {
      if (!beginRemoteOperation(`Pushing ${remoteConfig.branch} to ${remoteConfig.remoteName}...`)) {
        return { ok: false as const, message: "A Git remote operation is already running." };
      }
      const result = await remoteGitService.push(
        repository,
        remoteConfig,
        () => selectedGitToken,
        { onProgress: handleRemoteGitProgress }
      );
      return finishRemoteAction(result, "push");
    },
    [
      beginRemoteOperation,
      finishRemoteAction,
      handleRemoteGitProgress,
      remoteConfig,
      remoteGitService,
      selectedGitToken
    ]
  );
  const pullRemote = useCallback(
    async (repository: TyprProjectRepository) => {
      if (hasActiveMergeStop(localRepoStatus)) {
        const message =
          "A browser merge stop is active. Resolve it with Continue merge, or use git merge --abort before pulling again.";
        setSyncFeedback({ tone: "error", text: message });
        return { ok: false as const, message };
      }
      if (hasRepoChanges(localRepoStatus)) {
        const message = "Commit or reset local changes before pulling.";
        setSyncFeedback({ tone: "error", text: message });
        return { ok: false as const, message };
      }
      if (!beginRemoteOperation(`Pulling ${remoteConfig.remoteName}/${remoteConfig.branch}...`)) {
        return { ok: false as const, message: "A Git remote operation is already running." };
      }
      const result = await remoteGitService.pull(
        repository,
        remoteConfig,
        () => selectedGitToken,
        { onProgress: handleRemoteGitProgress }
      );
      return finishRemoteAction(result, "pull");
    },
    [
      beginRemoteOperation,
      finishRemoteAction,
      handleRemoteGitProgress,
      localRepoStatus,
      remoteConfig,
      remoteGitService,
      selectedGitToken,
      setSyncFeedback
    ]
  );
  const quickSaveToGit = useCallback(
    async (repository: TyprProjectRepository, project: GitManagedProject) => {
      setFilesGitConflictNotice(null);
      const conflictMessage = "Git conflicts need to be resolved before saving to Git.";
      if (hasActiveMergeStop(localRepoStatus)) {
        setFilesGitConflictNotice(conflictMessage);
        setSyncFeedback({ tone: "error", text: conflictMessage });
        return { ok: false as const, message: conflictMessage };
      }
      if (!beginRemoteOperation(`Saving ${repository.displayName} to Git...`)) {
        return { ok: false as const, message: "A Git remote operation is already running." };
      }

      try {
        setSyncFeedback({ tone: "neutral", text: "Staging all local changes..." });
        const stageResult = await repoBackend.stagePaths(repository, ["."]);
        if (!stageResult.ok) {
          return finishRemoteAction(
            { ok: false, message: formatRepoError(stageResult.error) },
            "push"
          );
        }
        setLocalRepoStatus(stageResult.value);

        if (stageResult.value.entries.some((entry) => entry.staged !== null)) {
          const message =
            project.commitMessageTemplate.trim() ||
            `Sync ${repository.displayName} from Typr`;
          setSyncFeedback({ tone: "neutral", text: "Committing local changes..." });
          const commitResult = await repoBackend.commit(repository, { message });
          if (!commitResult.ok) {
            return finishRemoteAction(
              { ok: false, message: formatRepoError(commitResult.error) },
              "push"
            );
          }
          const statusResult = await repoBackend.status(repository);
          if (statusResult.ok) setLocalRepoStatus(statusResult.value);
          setGitRefreshToken((token) => token + 1);
        } else {
          setSyncFeedback({
            tone: "neutral",
            text: "No local changes to commit. Checking remote..."
          });
        }

        setSyncFeedback({
          tone: "neutral",
          text: `Pushing ${remoteConfig.branch} to ${remoteConfig.remoteName}...`
        });
        const pushResult = await remoteGitService.push(
          repository,
          remoteConfig,
          () => selectedGitToken,
          { onProgress: handleRemoteGitProgress }
        );
        if (!pushResult.ok && isRemoteDivergenceMessage(pushResult.message)) {
          setSyncFeedback({
            tone: "neutral",
            text: "Remote changes found. Checking conflicts..."
          });
          const pullResult = await remoteGitService.pull(
            repository,
            remoteConfig,
            () => selectedGitToken,
            { onProgress: handleRemoteGitProgress }
          );
          if (!pullResult.status) {
            const statusResult = await repoBackend.status(repository);
            if (statusResult.ok) setLocalRepoStatus(statusResult.value);
          }
          if (!pullResult.ok && isRemoteDivergenceMessage(pullResult.message)) {
            await finishRemoteAction(pullResult, "pull");
            setFilesGitConflictNotice(conflictMessage);
            setSyncFeedback({ tone: "error", text: conflictMessage });
            return { ok: false as const, message: conflictMessage };
          }
          return finishRemoteAction(pullResult, "pull");
        }
        return finishRemoteAction(pushResult, "push");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Quick Git sync failed.";
        return finishRemoteAction({ ok: false, message }, "push");
      }
    },
    [
      beginRemoteOperation,
      finishRemoteAction,
      handleRemoteGitProgress,
      localRepoStatus,
      remoteConfig,
      remoteGitService,
      repoBackend,
      selectedGitToken,
      setSyncFeedback
    ]
  );
  const syncRemote = useCallback(
    async (repository: TyprProjectRepository) => {
      const pullResult = await pullRemote(repository);
      if (!pullResult.ok && !/Already up to date/i.test(pullResult.message)) return pullResult;
      const pushResult = await pushRemote(repository);
      return pushResult.ok ? { ok: true as const, message: "Sync complete." } : pushResult;
    },
    [pullRemote, pushRemote]
  );

  useEffect(
    () => () => {
      if (syncProgressFlushTimerRef.current !== null) {
        window.clearTimeout(syncProgressFlushTimerRef.current);
      }
    },
    []
  );

  const handleMergeVersionBodyScroll = useCallback((role: MergeVersionRole) => {
    const sourceBody = mergeVersionBodyRefs.current[role];
    if (!sourceBody || isSyncingMergeScrollRef.current) return;

    const lines = Array.from(sourceBody.querySelectorAll<HTMLElement>("[data-merge-line]"));
    const scrollTop = sourceBody.scrollTop;
    const currentLine =
      lines.find((line) => line.offsetTop - sourceBody.offsetTop >= scrollTop) ??
      lines[lines.length - 1];
    const lineNumber = Number(currentLine?.dataset.mergeLine ?? 1);

    isSyncingMergeScrollRef.current = true;
    (Object.keys(mergeVersionBodyRefs.current) as MergeVersionRole[]).forEach((targetRole) => {
      if (targetRole !== role) {
        const targetBody = mergeVersionBodyRefs.current[targetRole];
        if (targetBody) scrollMergeBodyToLine(targetBody, lineNumber);
      }
    });
    window.requestAnimationFrame(() => {
      isSyncingMergeScrollRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!mergeFilePreview) return;
    const firstChangedLine = getFirstChangedMergeLineNumber(
      mergeFilePreview.base.text,
      mergeFilePreview.local.text,
      mergeFilePreview.remote.text
    );
    window.requestAnimationFrame(() => {
      isSyncingMergeScrollRef.current = true;
      (Object.keys(mergeVersionBodyRefs.current) as MergeVersionRole[]).forEach((role) => {
        const body = mergeVersionBodyRefs.current[role];
        if (body) scrollMergeBodyToLine(body, firstChangedLine);
      });
      window.requestAnimationFrame(() => {
        isSyncingMergeScrollRef.current = false;
      });
    });
  }, [gitMergePaneMode, mergeFilePreview, selectedMergePath]);

  return {
    abortGitMerge,
    activeMergeState,
    addGitProject,
    beginRemoteOperation,
    conflictMergeFiles,
    commitGitChanges,
    continueGitMerge,
    createGitHubRepoPrivate,
    ensureGitProject,
    editMergeResolution,
    fetchRemote,
    filesGitConflictNotice,
    finishRemoteOperationCoordination,
    gitBranches,
    gitCommitHistory,
    gitCredentials,
    gitFileStatuses,
    gitHubClone,
    gitHubDiscovery,
    gitMergePaneMode,
    gitProjectsForSelectedTyprProject,
    gitRefreshToken,
    gitWorkspace,
    gitWorkingTreeEntries,
    handleMergeVersionBodyScroll,
    handleRemoteGitProgress,
    isGitStatusLoading,
    isMergeFilePreviewLoading,
    isSyncing,
    localGitCommits,
    localRepoBranches,
    localRepoCommits,
    localRepoStatus,
    mergeCommitMessage,
    mergeFilePreview,
    mergeResolutionDrafts,
    mergeResolutionEditorValue,
    mergeVersionBodyRefs,
    remoteConfig,
    remoteGitService,
    pullRemote,
    pushRemote,
    quickSaveToGit,
    refreshLocalRepoState,
    removeSelectedGitProject,
    repoBackend,
    selectedGitProject,
    selectedGitProjectIsGitHubConnected,
    selectedGitToken,
    selectedMergeDraft,
    selectedMergePath,
    selectedProjectGitConnectionLabel,
    setCreateGitHubRepoPrivate,
    setFilesGitConflictNotice,
    setGitCredentials,
    setGitHubClone,
    setGitHubDiscovery,
    setGitMergePaneMode,
    setGitRefreshToken,
    setGitWorkspace,
    setIsSyncing,
    setLocalRepoBranches,
    setLocalRepoCommits,
    setLocalRepoStatus,
    setMergeCommitMessage,
    setSelectedMergePath,
    setUpstreamTracking,
    stageAllGitChanges,
    stageGitPaths,
    unstageGitPath,
    syncRemote,
    unresolvedMergeConflictCount,
    useMergeVersion,
    updateGitManagedProject,
    updateSelectedGitProject,
    upstreamTracking
  } satisfies Record<string, unknown>;
}

export type GitPanelController = ReturnType<typeof useGitPanelController>;
export type GitPanelStateSetter<T> = Dispatch<SetStateAction<T>>;
