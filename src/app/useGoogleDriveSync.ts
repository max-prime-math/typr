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
  DEFAULT_CLOUD_SYNC_POLICY,
  getCloudSyncPolicyMessage,
  isCloudIntervalSyncDue,
  normalizeCloudSyncPolicy,
  synchronizeCloudProject,
  type CloudProjectBindingRecord,
  type CloudSyncMode
} from "../cloud/cloudSync";
import {
  GoogleDriveApiError,
  GoogleDriveProjectRemote
} from "../cloud/googleDriveApi";
import {
  isGoogleDriveAccessTokenFresh,
  requestGoogleDriveAccessToken,
  type GoogleDriveAccessToken
} from "../cloud/googleDriveIdentity";
import {
  projectRepositoryToLegacyProject,
  type TyprProjectRepository,
  type TyprProjectStorageState
} from "../project/projectState";
import {
  deleteCloudProjectBinding,
  loadCloudProjectBinding,
  saveCloudProjectBinding
} from "../storage/indexedDbStorage";
import {
  applySyncTreeToProject,
  type LocalFolderSyncTree
} from "../workspace/localFolderSync";

const GOOGLE_DRIVE_PROVIDER_ID = "google-drive";
const CLOUD_BROWSER_CHANGE_DEBOUNCE_MS = 800;
const CLOUD_CONSTANT_POLL_INTERVAL_MS = 60_000;
const CLOUD_INTERVAL_CHECK_MS = 30_000;

export interface GoogleDriveProjectState {
  status:
    | "disconnected"
    | "authorization-needed"
    | "authorizing"
    | "syncing"
    | "synced"
    | "error"
    | "unconfigured";
  remoteRootName: string | null;
  lastSyncedAt: string | null;
  message: string;
  syncMode: CloudSyncMode;
  syncIntervalMinutes: number;
}

export function useGoogleDriveSync(options: {
  clientId: string;
  isHydrated: boolean;
  projectStorage: TyprProjectStorageState;
  setProjectStorage: Dispatch<SetStateAction<TyprProjectStorageState>>;
  setRawSnapshot: Dispatch<SetStateAction<AppSnapshot>>;
}) {
  const {
    clientId,
    isHydrated,
    projectStorage,
    setProjectStorage,
    setRawSnapshot
  } = options;
  const configured = Boolean(clientId.trim());
  const [states, setStates] = useState<Record<string, GoogleDriveProjectState>>(
    {}
  );
  const projectStorageRef = useRef(projectStorage);
  const accessTokenRef = useRef<GoogleDriveAccessToken | null>(null);
  const bindingsRef = useRef(
    new Map<string, CloudProjectBindingRecord>()
  );
  const runningProjectIdsRef = useRef(new Set<string>());
  const queuedProjectIdsRef = useRef(new Set<string>());
  const syncTimersRef = useRef(new Map<string, number>());
  const runProjectSyncRef = useRef<
    (projectId: string, interactive: boolean) => Promise<void>
  >(async () => undefined);
  projectStorageRef.current = projectStorage;

  const updateState = useCallback(
    (
      projectId: string,
      updater:
        | GoogleDriveProjectState
        | ((
            current: GoogleDriveProjectState
          ) => GoogleDriveProjectState)
    ) => {
      setStates((currentStates) => {
        const current =
          currentStates[projectId] ??
          createDisconnectedGoogleDriveState(configured);
        const next =
          typeof updater === "function" ? updater(current) : updater;
        return {
          ...currentStates,
          [projectId]: next
        };
      });
    },
    [configured]
  );

  const clearScheduledSync = useCallback((projectId: string) => {
    const timer = syncTimersRef.current.get(projectId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      syncTimersRef.current.delete(projectId);
    }
  }, []);

  const scheduleSync = useCallback(
    (projectId: string, delay = CLOUD_BROWSER_CHANGE_DEBOUNCE_MS) => {
      clearScheduledSync(projectId);
      const timer = window.setTimeout(() => {
        syncTimersRef.current.delete(projectId);
        void runProjectSyncRef.current(projectId, false);
      }, delay);
      syncTimersRef.current.set(projectId, timer);
    },
    [clearScheduledSync]
  );

  const getRemote = useCallback(
    async (interactive: boolean): Promise<GoogleDriveProjectRemote> => {
      if (!configured) {
        throw new Error(
          "Google Drive sync is not configured on this deployment."
        );
      }
      if (
        isGoogleDriveAccessTokenFresh(accessTokenRef.current)
      ) {
        return new GoogleDriveProjectRemote(
          accessTokenRef.current.accessToken
        );
      }
      if (!interactive) {
        throw new GoogleDriveAuthorizationRequiredError();
      }

      accessTokenRef.current = await requestGoogleDriveAccessToken(clientId);
      return new GoogleDriveProjectRemote(
        accessTokenRef.current.accessToken
      );
    },
    [clientId, configured]
  );

  const applySyncedProject = useCallback(
    (
      projectId: string,
      startedProjectTree: LocalFolderSyncTree,
      desiredTree: LocalFolderSyncTree
    ) => {
      setProjectStorage((currentStorage) => {
        let selectedProject: TyprProjectRepository | null = null;
        const projects = currentStorage.projects.map((currentProject) => {
          if (currentProject.id !== projectId) {
            return currentProject;
          }
          const nextProject = applySyncTreeToProject(
            currentProject,
            startedProjectTree,
            desiredTree
          );
          if (currentStorage.selectedProjectId === projectId) {
            selectedProject = nextProject;
          }
          return nextProject;
        });

        if (selectedProject) {
          const nextSelectedProject = selectedProject;
          setRawSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            project: projectRepositoryToLegacyProject(
              nextSelectedProject,
              currentSnapshot.project
            )
          }));
        }
        return { ...currentStorage, projects };
      });
    },
    [setProjectStorage, setRawSnapshot]
  );

  const runProjectSync = useCallback(
    async (projectId: string, interactive: boolean) => {
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
        status: interactive ? "authorizing" : "syncing",
        message: interactive
          ? "Connecting to Google Drive…"
          : `Syncing ${binding.remoteRootName}…`
      }));

      try {
        const remote = await getRemote(interactive);
        updateState(projectId, (current) => ({
          ...current,
          status: "syncing",
          message: `Syncing ${binding.remoteRootName}…`
        }));
        const startedProject = projectStorageRef.current.projects.find(
          (project) => project.id === projectId
        );
        if (!startedProject) {
          return;
        }

        const result = await synchronizeCloudProject({
          binding,
          project: startedProject,
          remote
        });
        if (bindingsRef.current.get(projectId) !== binding) {
          return;
        }

        applySyncedProject(
          projectId,
          result.startedProjectTree,
          result.desiredTree
        );
        bindingsRef.current.set(projectId, result.binding);
        await saveCloudProjectBinding(result.binding);
        const policy = getBindingPolicy(result.binding);
        updateState(projectId, {
          status: "synced",
          remoteRootName: result.binding.remoteRootName,
          lastSyncedAt: result.binding.lastSyncedAt,
          message: getCloudSyncPolicyMessage(policy),
          syncMode: policy.mode,
          syncIntervalMinutes: policy.intervalMinutes
        });
      } catch (error) {
        if (isGoogleAuthorizationError(error)) {
          accessTokenRef.current = null;
        }
        updateState(projectId, (current) => ({
          ...current,
          status: isGoogleAuthorizationError(error)
            ? "authorization-needed"
            : "error",
          message:
            error instanceof Error
              ? error.message
              : "Google Drive sync failed."
        }));
      } finally {
        runningProjectIdsRef.current.delete(projectId);
        if (queuedProjectIdsRef.current.delete(projectId)) {
          scheduleSync(projectId, 0);
        }
      }
    },
    [applySyncedProject, getRemote, scheduleSync, updateState]
  );
  runProjectSyncRef.current = runProjectSync;

  const connect = useCallback(
    async (projectId: string) => {
      if (bindingsRef.current.has(projectId)) {
        await runProjectSyncRef.current(projectId, true);
        return;
      }
      const project = projectStorageRef.current.projects.find(
        (entry) => entry.id === projectId
      );
      if (!project) {
        return;
      }
      if (!configured) {
        updateState(
          projectId,
          createDisconnectedGoogleDriveState(false)
        );
        return;
      }

      updateState(projectId, {
        ...createDisconnectedGoogleDriveState(true),
        status: "authorizing",
        message: "Connecting to Google Drive…"
      });
      try {
        const remote = await getRemote(true);
        const folder = await remote.findOrCreateProjectFolder({
          projectId,
          projectName: project.displayName
        });
        const now = new Date().toISOString();
        const binding: CloudProjectBindingRecord = {
          version: 1,
          projectId,
          providerId: GOOGLE_DRIVE_PROVIDER_ID,
          remoteRootId: folder.id,
          remoteRootName: folder.name,
          connectedAt: now,
          lastSyncedAt: null,
          syncMode: DEFAULT_CLOUD_SYNC_POLICY.mode,
          syncIntervalMinutes:
            DEFAULT_CLOUD_SYNC_POLICY.intervalMinutes,
          worktreeSignatures: {}
        };
        const result = await synchronizeCloudProject({
          binding,
          project,
          remote
        });
        applySyncedProject(
          projectId,
          result.startedProjectTree,
          result.desiredTree
        );
        bindingsRef.current.set(projectId, result.binding);
        await saveCloudProjectBinding(result.binding);
        const policy = getBindingPolicy(result.binding);
        updateState(projectId, {
          status: "synced",
          remoteRootName: folder.name,
          lastSyncedAt: result.binding.lastSyncedAt,
          message: getCloudSyncPolicyMessage(policy),
          syncMode: policy.mode,
          syncIntervalMinutes: policy.intervalMinutes
        });
      } catch (error) {
        if (isGoogleAuthorizationError(error)) {
          accessTokenRef.current = null;
        }
        updateState(projectId, {
          ...createDisconnectedGoogleDriveState(true),
          status: isGoogleAuthorizationError(error)
            ? "authorization-needed"
            : "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to connect Google Drive."
        });
      }
    },
    [applySyncedProject, configured, getRemote, updateState]
  );

  const disconnect = useCallback(
    async (projectId: string) => {
      const binding = bindingsRef.current.get(projectId);
      clearScheduledSync(projectId);
      bindingsRef.current.delete(projectId);
      queuedProjectIdsRef.current.delete(projectId);
      try {
        await deleteCloudProjectBinding(
          GOOGLE_DRIVE_PROVIDER_ID,
          projectId
        );
        updateState(
          projectId,
          createDisconnectedGoogleDriveState(configured)
        );
      } catch (error) {
        if (binding) {
          bindingsRef.current.set(projectId, binding);
        }
        updateState(projectId, (current) => ({
          ...current,
          status: "error",
          message:
            error instanceof Error
              ? `Unable to unlink: ${error.message}`
              : "Unable to unlink Google Drive."
        }));
      }
    },
    [clearScheduledSync, configured, updateState]
  );

  const setSyncPolicy = useCallback(
    async (
      projectId: string,
      nextPolicy: {
        mode: CloudSyncMode;
        intervalMinutes?: number;
      }
    ) => {
      const binding = bindingsRef.current.get(projectId);
      if (!binding) {
        return;
      }
      const currentPolicy = getBindingPolicy(binding);
      const policy = normalizeCloudSyncPolicy({
        mode: nextPolicy.mode,
        intervalMinutes:
          nextPolicy.intervalMinutes ?? currentPolicy.intervalMinutes
      });
      const nextBinding = {
        ...binding,
        syncMode: policy.mode,
        syncIntervalMinutes: policy.intervalMinutes
      };
      bindingsRef.current.set(projectId, nextBinding);
      updateState(projectId, (current) => ({
        ...current,
        syncMode: policy.mode,
        syncIntervalMinutes: policy.intervalMinutes,
        message:
          current.status === "synced"
            ? getCloudSyncPolicyMessage(policy)
            : current.message
      }));
      try {
        await saveCloudProjectBinding(nextBinding);
      } catch (error) {
        bindingsRef.current.set(projectId, binding);
        updateState(projectId, (current) => ({
          ...current,
          status: "error",
          syncMode: currentPolicy.mode,
          syncIntervalMinutes: currentPolicy.intervalMinutes,
          message:
            error instanceof Error
              ? `Unable to save sync settings: ${error.message}`
              : "Unable to save sync settings."
        }));
        return;
      }

      clearScheduledSync(projectId);
      if (policy.mode === "constant") {
        scheduleSync(projectId, 0);
      }
    },
    [clearScheduledSync, scheduleSync, updateState]
  );

  const syncOnCompile = useCallback(async (projectId: string) => {
    const binding = bindingsRef.current.get(projectId);
    if (binding && getBindingPolicy(binding).mode === "compile") {
      await runProjectSyncRef.current(projectId, true);
    }
  }, []);

  const projectIdsKey = useMemo(
    () =>
      projectStorage.projects
        .map((project) => project.id)
        .sort()
        .join("|"),
    [projectStorage.projects]
  );
  const browserWorktreeKey = useMemo(
    () =>
      projectStorage.projects
        .map(
          (project) =>
            `${project.id}:${project.filesystem.updatedAt}`
        )
        .sort()
        .join("|"),
    [projectStorage.projects]
  );

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    let cancelled = false;
    const projectIds = new Set(projectIdsKey.split("|").filter(Boolean));

    const restoreBindings = async () => {
      for (const projectId of [...bindingsRef.current.keys()]) {
        if (!projectIds.has(projectId)) {
          clearScheduledSync(projectId);
          bindingsRef.current.delete(projectId);
          void deleteCloudProjectBinding(
            GOOGLE_DRIVE_PROVIDER_ID,
            projectId
          );
        }
      }

      const bindings = await Promise.all(
        [...projectIds].map((projectId) =>
          loadCloudProjectBinding(
            GOOGLE_DRIVE_PROVIDER_ID,
            projectId
          )
        )
      );
      if (cancelled) {
        return;
      }
      for (const binding of bindings) {
        if (
          !binding ||
          binding.version !== 1 ||
          binding.providerId !== GOOGLE_DRIVE_PROVIDER_ID
        ) {
          continue;
        }
        if (bindingsRef.current.has(binding.projectId)) {
          continue;
        }
        const policy = getBindingPolicy(binding);
        const normalizedBinding = {
          ...binding,
          syncMode: policy.mode,
          syncIntervalMinutes: policy.intervalMinutes
        };
        bindingsRef.current.set(binding.projectId, normalizedBinding);
        updateState(binding.projectId, {
          status: configured
            ? "authorization-needed"
            : "unconfigured",
          remoteRootName: binding.remoteRootName,
          lastSyncedAt: binding.lastSyncedAt,
          message: configured
            ? "Reconnect to resume Google Drive sync."
            : "Google Drive sync is not configured on this deployment.",
          syncMode: policy.mode,
          syncIntervalMinutes: policy.intervalMinutes
        });
      }
    };

    void restoreBindings().catch((error) => {
      console.error(
        "Unable to restore Google Drive sync bindings.",
        error
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    clearScheduledSync,
    configured,
    isHydrated,
    projectIdsKey,
    updateState
  ]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    for (const [projectId, binding] of bindingsRef.current) {
      if (getBindingPolicy(binding).mode === "constant") {
        scheduleSync(projectId);
      }
    }
  }, [browserWorktreeKey, isHydrated, scheduleSync]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    const interval = window.setInterval(() => {
      for (const [projectId, binding] of bindingsRef.current) {
        if (getBindingPolicy(binding).mode === "constant") {
          void runProjectSyncRef.current(projectId, false);
        }
      }
    }, CLOUD_CONSTANT_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    const runDueIntervalSyncs = () => {
      const now = Date.now();
      for (const [projectId, binding] of bindingsRef.current) {
        if (
          isCloudIntervalSyncDue(
            getBindingPolicy(binding),
            binding.lastSyncedAt,
            now
          )
        ) {
          void runProjectSyncRef.current(projectId, false);
        }
      }
    };
    const interval = window.setInterval(
      runDueIntervalSyncs,
      CLOUD_INTERVAL_CHECK_MS
    );
    runDueIntervalSyncs();
    return () => window.clearInterval(interval);
  }, [isHydrated]);

  useEffect(
    () => () => {
      for (const timer of syncTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      syncTimersRef.current.clear();
    },
    []
  );

  return {
    configured,
    connect,
    disconnect,
    setSyncPolicy,
    states,
    syncNow: (projectId: string) =>
      runProjectSync(projectId, true),
    syncOnCompile
  };
}

function createDisconnectedGoogleDriveState(
  configured: boolean
): GoogleDriveProjectState {
  return {
    status: configured ? "disconnected" : "unconfigured",
    remoteRootName: null,
    lastSyncedAt: null,
    message: configured
      ? "Not connected"
      : "Google Drive sync is not configured on this deployment.",
    syncMode: DEFAULT_CLOUD_SYNC_POLICY.mode,
    syncIntervalMinutes: DEFAULT_CLOUD_SYNC_POLICY.intervalMinutes
  };
}

function getBindingPolicy(
  binding: CloudProjectBindingRecord
) {
  return normalizeCloudSyncPolicy({
    mode: binding.syncMode,
    intervalMinutes: binding.syncIntervalMinutes
  });
}

class GoogleDriveAuthorizationRequiredError extends Error {
  constructor() {
    super("Reconnect to resume Google Drive sync.");
    this.name = "GoogleDriveAuthorizationRequiredError";
  }
}

function isGoogleAuthorizationError(error: unknown): boolean {
  return (
    error instanceof GoogleDriveAuthorizationRequiredError ||
    (error instanceof GoogleDriveApiError &&
      error.status === 401)
  );
}
