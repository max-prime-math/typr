import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type { AppSnapshot } from "./appState";
import {
  projectRepositoryToLegacyProject,
  type TyprProjectStorageState
} from "../project/projectState";
import {
  deleteLocalFolderBinding,
  loadLocalFolderBinding,
  saveLocalFolderBinding,
  type LocalFolderBindingRecord
} from "../storage/indexedDbStorage";
import {
  applySyncTreeToBrowserGit,
  applySyncTreeToProject,
  createBrowserGitSyncTree,
  createProjectSyncTree,
  getLocalFolderDirectoryFingerprint,
  getLocalFolderSnapshotFingerprint,
  isLocalFolderSyncSupported,
  readLocalFolderDirectory,
  resolveSyncTrees,
  updateProjectGitMetadataFromTree,
  writeLocalFolderDirectory
} from "../workspace/localFolderSync";

const LOCAL_FOLDER_POLL_INTERVAL_MS = 1500;
const LOCAL_FOLDER_BROWSER_CHANGE_DEBOUNCE_MS = 180;
const LOCAL_FOLDER_OBSERVER_DEBOUNCE_MS = 60;

type LocalFolderPermissionState = PermissionState | "unsupported";

interface LocalFileSystemObserver {
  observe(
    handle: FileSystemDirectoryHandle,
    options?: { recursive?: boolean }
  ): Promise<void>;
  disconnect(): void;
}

type LocalFileSystemObserverConstructor = new (
  callback: () => void
) => LocalFileSystemObserver;

type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?(descriptor: {
    mode: "readwrite";
  }): Promise<PermissionState>;
  requestPermission?(descriptor: {
    mode: "readwrite";
  }): Promise<PermissionState>;
};

export interface LocalFolderProjectState {
  status:
    | "disconnected"
    | "permission-needed"
    | "syncing"
    | "synced"
    | "error"
    | "unsupported";
  directoryName: string | null;
  lastSyncedAt: string | null;
  message: string;
}

export function useLocalFolderSync(options: {
  gitRefreshToken: number;
  isHydrated: boolean;
  projectStorage: TyprProjectStorageState;
  setGitRefreshToken: Dispatch<SetStateAction<number>>;
  setProjectStorage: Dispatch<SetStateAction<TyprProjectStorageState>>;
  setRawSnapshot: Dispatch<SetStateAction<AppSnapshot>>;
}) {
  const {
    gitRefreshToken,
    isHydrated,
    projectStorage,
    setGitRefreshToken,
    setProjectStorage,
    setRawSnapshot
  } = options;
  const supported = isLocalFolderSyncSupported();
  const [states, setStates] = useState<Record<string, LocalFolderProjectState>>(
    {}
  );
  const projectStorageRef = useRef(projectStorage);
  const bindingsRef = useRef(new Map<string, LocalFolderBindingRecord>());
  const observersRef = useRef(new Map<string, LocalFileSystemObserver>());
  const runningProjectIdsRef = useRef(new Set<string>());
  const pollingProjectIdsRef = useRef(new Set<string>());
  const queuedProjectIdsRef = useRef(new Set<string>());
  const syncTimersRef = useRef(new Map<string, number>());
  const runProjectSyncRef = useRef<(projectId: string) => Promise<void>>(
    async () => undefined
  );
  projectStorageRef.current = projectStorage;

  const updateState = useCallback(
    (
      projectId: string,
      updater:
        | LocalFolderProjectState
        | ((current: LocalFolderProjectState) => LocalFolderProjectState)
    ) => {
      setStates((currentStates) => {
        const current =
          currentStates[projectId] ?? createDisconnectedLocalFolderState(supported);
        const next =
          typeof updater === "function" ? updater(current) : updater;
        return {
          ...currentStates,
          [projectId]: next
        };
      });
    },
    [supported]
  );

  const clearScheduledSync = useCallback((projectId: string) => {
    const timer = syncTimersRef.current.get(projectId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      syncTimersRef.current.delete(projectId);
    }
  }, []);

  const scheduleSync = useCallback(
    (projectId: string, delay = LOCAL_FOLDER_BROWSER_CHANGE_DEBOUNCE_MS) => {
      clearScheduledSync(projectId);
      const timer = window.setTimeout(() => {
        syncTimersRef.current.delete(projectId);
        void runProjectSyncRef.current(projectId);
      }, delay);
      syncTimersRef.current.set(projectId, timer);
    },
    [clearScheduledSync]
  );

  const stopObserver = useCallback((projectId: string) => {
    observersRef.current.get(projectId)?.disconnect();
    observersRef.current.delete(projectId);
  }, []);

  const startObserver = useCallback(
    async (binding: LocalFolderBindingRecord) => {
      stopObserver(binding.projectId);
      const Observer = (
        globalThis as typeof globalThis & {
          FileSystemObserver?: LocalFileSystemObserverConstructor;
        }
      ).FileSystemObserver;
      if (!Observer) {
        return;
      }

      const observer = new Observer(() => {
        scheduleSync(
          binding.projectId,
          LOCAL_FOLDER_OBSERVER_DEBOUNCE_MS
        );
      });

      try {
        await observer.observe(binding.directoryHandle, { recursive: true });
        observersRef.current.set(binding.projectId, observer);
      } catch {
        observer.disconnect();
      }
    },
    [scheduleSync, stopObserver]
  );

  const runProjectSync = useCallback(
    async (projectId: string) => {
      const binding = bindingsRef.current.get(projectId);
      if (!binding) {
        return;
      }

      if (runningProjectIdsRef.current.has(projectId)) {
        queuedProjectIdsRef.current.add(projectId);
        return;
      }

      runningProjectIdsRef.current.add(projectId);
      updateState(projectId, (current) => ({
        ...current,
        status: "syncing",
        message: `Syncing ${binding.directoryName}…`
      }));

      try {
        const permission = await getLocalFolderPermission(
          binding.directoryHandle,
          false
        );
        if (permission !== "granted") {
          stopObserver(projectId);
          updateState(projectId, {
            status: "permission-needed",
            directoryName: binding.directoryName,
            lastSyncedAt: binding.lastSyncedAt,
            message: "Folder access must be restored."
          });
          return;
        }

        const startedProject = projectStorageRef.current.projects.find(
          (project) => project.id === projectId
        );
        if (!startedProject) {
          return;
        }

        const [localSnapshot, browserGitTree] = await Promise.all([
          readLocalFolderDirectory(binding.directoryHandle),
          createBrowserGitSyncTree(projectId)
        ]);
        const browserWorktree = createProjectSyncTree(startedProject);
        const worktreeResolution = resolveSyncTrees({
          baseline: binding.worktreeSignatures,
          browser: browserWorktree,
          local: localSnapshot.worktree
        });
        const gitResolution = resolveSyncTrees({
          baseline: binding.gitSignatures,
          browser: browserGitTree,
          local: localSnapshot.git
        });

        if (bindingsRef.current.get(projectId) !== binding) {
          return;
        }

        await writeLocalFolderDirectory(
          binding.directoryHandle,
          localSnapshot,
          worktreeResolution.desired,
          gitResolution.desired
        );
        if (bindingsRef.current.get(projectId) !== binding) {
          return;
        }
        const browserGitChanged = await applySyncTreeToBrowserGit(
          projectId,
          browserGitTree,
          gitResolution.desired
        );
        if (bindingsRef.current.get(projectId) !== binding) {
          return;
        }

        setProjectStorage((currentStorage) => {
          let selectedProjectChanged = false;
          let selectedProject = null as
            | TyprProjectStorageState["projects"][number]
            | null;
          const projects = currentStorage.projects.map((project) => {
            if (project.id !== projectId) {
              return project;
            }

            const syncedProject = updateProjectGitMetadataFromTree(
              applySyncTreeToProject(
                project,
                browserWorktree,
                worktreeResolution.desired
              ),
              gitResolution.desired
            );
            if (syncedProject !== project) {
              selectedProjectChanged =
                currentStorage.selectedProjectId === projectId;
              selectedProject = syncedProject;
            }
            return syncedProject;
          });

          if (selectedProjectChanged && selectedProject) {
            const nextSelectedProject = selectedProject;
            setRawSnapshot((currentSnapshot) => ({
              ...currentSnapshot,
              project: projectRepositoryToLegacyProject(
                nextSelectedProject,
                currentSnapshot.project
              )
            }));
          }

          return projects.some(
            (project, index) => project !== currentStorage.projects[index]
          )
            ? { ...currentStorage, projects }
            : currentStorage;
        });

        const lastSyncedAt = new Date().toISOString();
        const nextBinding: LocalFolderBindingRecord = {
          ...binding,
          lastSyncedAt,
          directoryFingerprint:
            getLocalFolderSnapshotFingerprint(localSnapshot),
          worktreeSignatures: worktreeResolution.signatures,
          gitSignatures: gitResolution.signatures
        };
        if (bindingsRef.current.get(projectId) !== binding) {
          return;
        }
        bindingsRef.current.set(projectId, nextBinding);
        await saveLocalFolderBinding(nextBinding);

        if (browserGitChanged) {
          setGitRefreshToken((token) => token + 1);
        }

        updateState(projectId, {
          status: "synced",
          directoryName: binding.directoryName,
          lastSyncedAt,
          message: "Watching for changes"
        });
      } catch (error) {
        const permissionError = isPermissionError(error);
        if (permissionError) {
          stopObserver(projectId);
        }
        updateState(projectId, (current) => ({
          ...current,
          status: permissionError ? "permission-needed" : "error",
          message: permissionError
            ? "Folder access must be restored."
            : error instanceof Error
              ? error.message
              : "Local folder sync failed."
        }));
      } finally {
        runningProjectIdsRef.current.delete(projectId);
        if (queuedProjectIdsRef.current.delete(projectId)) {
          scheduleSync(projectId, 0);
        }
      }
    },
    [
      scheduleSync,
      setGitRefreshToken,
      setProjectStorage,
      setRawSnapshot,
      stopObserver,
      updateState
    ]
  );
  runProjectSyncRef.current = runProjectSync;

  const pollLocalFolder = useCallback(
    async (projectId: string) => {
      const binding = bindingsRef.current.get(projectId);
      if (
        !binding ||
        runningProjectIdsRef.current.has(projectId) ||
        pollingProjectIdsRef.current.has(projectId)
      ) {
        return;
      }

      pollingProjectIdsRef.current.add(projectId);
      try {
        const permission = await getLocalFolderPermission(
          binding.directoryHandle,
          false
        );
        if (permission !== "granted") {
          updateState(projectId, {
            status: "permission-needed",
            directoryName: binding.directoryName,
            lastSyncedAt: binding.lastSyncedAt,
            message: "Reconnect to resume automatic sync."
          });
          return;
        }

        const fingerprint = await getLocalFolderDirectoryFingerprint(
          binding.directoryHandle
        );
        if (
          bindingsRef.current.get(projectId) === binding &&
          fingerprint !== (binding.directoryFingerprint ?? null)
        ) {
          scheduleSync(projectId, 0);
        }
      } catch (error) {
        updateState(projectId, (current) => ({
          ...current,
          status: isPermissionError(error) ? "permission-needed" : "error",
          message: isPermissionError(error)
            ? "Reconnect to resume automatic sync."
            : error instanceof Error
              ? error.message
              : "Unable to check the local folder."
        }));
      } finally {
        pollingProjectIdsRef.current.delete(projectId);
      }
    },
    [scheduleSync, updateState]
  );

  const connect = useCallback(
    async (projectId: string) => {
      if (!supported) {
        updateState(projectId, createDisconnectedLocalFolderState(false));
        return;
      }

      try {
        const picker = (
          window as unknown as Window & {
            showDirectoryPicker: (options?: {
              id?: string;
              mode?: "read" | "readwrite";
            }) => Promise<FileSystemDirectoryHandle>;
          }
        ).showDirectoryPicker;
        const directoryHandle = await picker({
          id: `typr-project-${projectId}`,
          mode: "readwrite"
        });
        const duplicate = await findBindingForSameDirectory(
          directoryHandle,
          bindingsRef.current,
          projectId
        );
        if (duplicate) {
          updateState(projectId, {
            status: "error",
            directoryName: null,
            lastSyncedAt: null,
            message: `Already linked to “${duplicate.directoryName}”.`
          });
          return;
        }

        const now = new Date().toISOString();
        const binding: LocalFolderBindingRecord = {
          version: 1,
          projectId,
          directoryHandle,
          directoryName: directoryHandle.name,
          connectedAt: now,
          lastSyncedAt: null,
          directoryFingerprint: null,
          worktreeSignatures: {},
          gitSignatures: {}
        };
        bindingsRef.current.set(projectId, binding);
        await saveLocalFolderBinding(binding);
        updateState(projectId, {
          status: "syncing",
          directoryName: directoryHandle.name,
          lastSyncedAt: null,
          message: "Preparing initial sync…"
        });
        await startObserver(binding);
        await runProjectSyncRef.current(projectId);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        stopObserver(projectId);
        bindingsRef.current.delete(projectId);
        updateState(projectId, {
          status: isPermissionError(error) ? "permission-needed" : "error",
          directoryName: null,
          lastSyncedAt: null,
          message:
            error instanceof Error
              ? error.message
              : "Unable to connect the local folder."
        });
      }
    },
    [startObserver, stopObserver, supported, updateState]
  );

  const reconnect = useCallback(
    async (projectId: string) => {
      const binding = bindingsRef.current.get(projectId);
      if (!binding) {
        await connect(projectId);
        return;
      }

      try {
        const permission = await getLocalFolderPermission(
          binding.directoryHandle,
          true
        );
        if (permission !== "granted") {
          updateState(projectId, {
            status: "permission-needed",
            directoryName: binding.directoryName,
            lastSyncedAt: binding.lastSyncedAt,
            message: "Folder access was not granted."
          });
          return;
        }
        await startObserver(binding);
        await runProjectSyncRef.current(projectId);
      } catch (error) {
        updateState(projectId, (current) => ({
          ...current,
          status: isPermissionError(error) ? "permission-needed" : "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to restore folder access."
        }));
      }
    },
    [connect, startObserver, updateState]
  );

  const disconnect = useCallback(
    async (projectId: string) => {
      const binding = bindingsRef.current.get(projectId);
      clearScheduledSync(projectId);
      stopObserver(projectId);
      bindingsRef.current.delete(projectId);
      queuedProjectIdsRef.current.delete(projectId);
      try {
        await deleteLocalFolderBinding(projectId);
        updateState(projectId, createDisconnectedLocalFolderState(supported));
      } catch (error) {
        updateState(projectId, {
          status: "error",
          directoryName: binding?.directoryName ?? null,
          lastSyncedAt: binding?.lastSyncedAt ?? null,
          message:
            error instanceof Error
              ? `Unable to unlink: ${error.message}`
              : "Unable to unlink the local folder."
        });
      }
    },
    [clearScheduledSync, stopObserver, supported, updateState]
  );

  const projectIdsKey = useMemo(
    () => projectStorage.projects.map((project) => project.id).sort().join("|"),
    [projectStorage.projects]
  );
  const browserWorktreeKey = useMemo(
    () =>
      projectStorage.projects
        .map(
          (project) =>
            `${project.id}:${project.filesystem.updatedAt}:${project.git.status}:${project.git.headRef ?? ""}`
        )
        .sort()
        .join("|"),
    [projectStorage.projects]
  );

  useEffect(() => {
    if (!isHydrated || !supported) {
      return;
    }

    let cancelled = false;
    const projectIds = new Set(projectIdsKey.split("|").filter(Boolean));

    const restoreBindings = async () => {
      for (const existingProjectId of [...bindingsRef.current.keys()]) {
        if (!projectIds.has(existingProjectId)) {
          clearScheduledSync(existingProjectId);
          stopObserver(existingProjectId);
          bindingsRef.current.delete(existingProjectId);
          void deleteLocalFolderBinding(existingProjectId);
        }
      }

      const bindings = await Promise.all(
        [...projectIds].map((projectId) => loadLocalFolderBinding(projectId))
      );
      if (cancelled) {
        return;
      }

      for (const binding of bindings) {
        if (!binding || binding.version !== 1) {
          continue;
        }
        bindingsRef.current.set(binding.projectId, binding);
        let permission: LocalFolderPermissionState;
        try {
          permission = await getLocalFolderPermission(
            binding.directoryHandle,
            false
          );
        } catch (error) {
          updateState(binding.projectId, {
            status: isPermissionError(error) ? "permission-needed" : "error",
            directoryName: binding.directoryName,
            lastSyncedAt: binding.lastSyncedAt,
            message: isPermissionError(error)
              ? "Reconnect to resume automatic sync."
              : "The saved folder connection could not be restored."
          });
          continue;
        }
        if (cancelled) {
          return;
        }

        if (permission === "granted") {
          updateState(binding.projectId, {
            status: "synced",
            directoryName: binding.directoryName,
            lastSyncedAt: binding.lastSyncedAt,
            message: "Watching for changes"
          });
          await startObserver(binding);
          scheduleSync(binding.projectId, 0);
        } else {
          updateState(binding.projectId, {
            status: "permission-needed",
            directoryName: binding.directoryName,
            lastSyncedAt: binding.lastSyncedAt,
            message: "Reconnect to resume automatic sync."
          });
        }
      }
    };

    void restoreBindings().catch((error) => {
      console.error("Unable to restore local folder sync bindings.", error);
    });
    return () => {
      cancelled = true;
    };
  }, [
    clearScheduledSync,
    isHydrated,
    projectIdsKey,
    scheduleSync,
    startObserver,
    stopObserver,
    supported,
    updateState
  ]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    for (const projectId of bindingsRef.current.keys()) {
      scheduleSync(projectId);
    }
  }, [browserWorktreeKey, isHydrated, scheduleSync]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    for (const projectId of bindingsRef.current.keys()) {
      scheduleSync(projectId);
    }
  }, [gitRefreshToken, isHydrated, scheduleSync]);

  useEffect(() => {
    if (!isHydrated || !supported) {
      return;
    }
    const interval = window.setInterval(() => {
      for (const projectId of bindingsRef.current.keys()) {
        if (!observersRef.current.has(projectId)) {
          void pollLocalFolder(projectId);
        }
      }
    }, LOCAL_FOLDER_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isHydrated, pollLocalFolder, supported]);

  useEffect(
    () => () => {
      for (const timer of syncTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      for (const observer of observersRef.current.values()) {
        observer.disconnect();
      }
      syncTimersRef.current.clear();
      observersRef.current.clear();
    },
    []
  );

  return {
    connect,
    disconnect,
    reconnect,
    states,
    supported,
    syncNow: runProjectSync
  };
}

function createDisconnectedLocalFolderState(
  supported: boolean
): LocalFolderProjectState {
  return supported
    ? {
        status: "disconnected",
        directoryName: null,
        lastSyncedAt: null,
        message: "Not linked"
      }
    : {
        status: "unsupported",
        directoryName: null,
        lastSyncedAt: null,
        message: "Available in Chromium browsers"
      };
}

async function getLocalFolderPermission(
  directoryHandle: FileSystemDirectoryHandle,
  request: boolean
): Promise<LocalFolderPermissionState> {
  const handle = directoryHandle as PermissionCapableDirectoryHandle;
  const permissionMethod = request
    ? handle.requestPermission
    : handle.queryPermission;
  if (!permissionMethod) {
    return "granted";
  }
  return permissionMethod.call(handle, { mode: "readwrite" });
}

async function findBindingForSameDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  bindings: ReadonlyMap<string, LocalFolderBindingRecord>,
  excludedProjectId: string
): Promise<LocalFolderBindingRecord | null> {
  const handle = directoryHandle as PermissionCapableDirectoryHandle;
  if (!handle.isSameEntry) {
    return null;
  }

  for (const binding of bindings.values()) {
    if (binding.projectId === excludedProjectId) {
      continue;
    }
    if (await handle.isSameEntry(binding.directoryHandle)) {
      return binding;
    }
  }
  return null;
}

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
