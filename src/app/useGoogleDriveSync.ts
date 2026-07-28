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
  isCloudIntervalSyncDue,
  normalizeCloudSyncPolicy,
  synchronizeCloudProject,
  type CloudProjectBindingRecord,
  type CloudSyncMode
} from "../cloud/cloudSync";
import {
  createGoogleDriveBinding,
  isGoogleDriveBindingV2,
  isLegacyGoogleDriveBinding,
  readGoogleDriveBindingMetadata,
  type GoogleDriveBindingV2
} from "../cloud/googleDriveBinding";
import {
  createGoogleDriveProjectState,
  reduceGoogleDriveConnectionState,
  type GoogleDriveConnectionEvent,
  type GoogleDriveProjectState
} from "../cloud/googleDriveConnectionState";
import {
  GoogleDriveApiError,
  GoogleDriveProjectRemote
} from "../cloud/googleDriveApi";
import {
  beginGoogleDriveRedirectAuthorization,
  clearGoogleDriveAuthorizationResult,
  clearGoogleDrivePendingAuthorization,
  isGoogleDriveAccessTokenFresh,
  readGoogleDriveAuthorizationResult,
  type GoogleDriveAccessToken,
  type GoogleDriveAuthorizationIntent
} from "../cloud/googleDriveIdentity";
import { showGoogleDriveFolderPicker } from "../cloud/googleDrivePicker";
import {
  createEmptyProjectRepository,
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

export type { GoogleDriveProjectState };

export interface GoogleDriveNotice {
  message: string;
  projectId: string | null;
  title: string;
  tone: "error" | "info" | "success";
}

export function useGoogleDriveSync(options: {
  clientId: string;
  cloudProjectNumber: string;
  isHydrated: boolean;
  pickerApiKey: string;
  projectStorage: TyprProjectStorageState;
  setProjectStorage: Dispatch<SetStateAction<TyprProjectStorageState>>;
  setRawSnapshot: Dispatch<SetStateAction<AppSnapshot>>;
}) {
  const {
    clientId,
    cloudProjectNumber,
    isHydrated,
    pickerApiKey,
    projectStorage,
    setProjectStorage,
    setRawSnapshot
  } = options;
  const configured = Boolean(
    clientId.trim() &&
      pickerApiKey.trim() &&
      /^\d+$/.test(cloudProjectNumber.trim())
  );
  const [states, setStates] = useState<Record<string, GoogleDriveProjectState>>(
    {}
  );
  const [notice, setNotice] = useState<GoogleDriveNotice | null>(null);
  const projectStorageRef = useRef(projectStorage);
  const accessTokenRef = useRef<GoogleDriveAccessToken | null>(null);
  const redirectResumeStartedRef = useRef(false);
  const bindingsRef = useRef(new Map<string, GoogleDriveBindingV2>());
  const pendingImportRef = useRef<TyprProjectRepository | null>(null);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);
  const runningProjectIdsRef = useRef(new Set<string>());
  const queuedProjectIdsRef = useRef(new Set<string>());
  const syncTimersRef = useRef(new Map<string, number>());
  const runProjectSyncRef = useRef<
    (
      projectId: string,
      interactive: boolean,
      announce?: boolean
    ) => Promise<void>
  >(async () => undefined);
  projectStorageRef.current = projectStorage;

  const dispatchState = useCallback(
    (projectId: string, event: GoogleDriveConnectionEvent) => {
      setStates((currentStates) => ({
        ...currentStates,
        [projectId]: reduceGoogleDriveConnectionState(
          currentStates[projectId] ??
            createGoogleDriveProjectState(configured),
          event
        )
      }));
    },
    [configured]
  );

  const showNotice = useCallback(
    (
      projectId: string | null,
      tone: GoogleDriveNotice["tone"],
      title: string,
      message: string
    ) => {
      setNotice({ message, projectId, title, tone });
    },
    []
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

  const getRemote = useCallback((): GoogleDriveProjectRemote => {
    if (!configured) {
      throw new Error(getGoogleDriveConfigurationMessage(options));
    }
    if (isGoogleDriveAccessTokenFresh(accessTokenRef.current)) {
      return new GoogleDriveProjectRemote(
        accessTokenRef.current.accessToken
      );
    }
    throw new GoogleDriveAuthorizationRequiredError();
  }, [
    clientId,
    cloudProjectNumber,
    configured,
    pickerApiKey
  ]);

  const startAuthorization = useCallback(
    (projectId: string, intent: GoogleDriveAuthorizationIntent) => {
      if (!configured) {
        const message = getGoogleDriveConfigurationMessage(options);
        dispatchState(projectId, { type: "failed", message });
        showNotice(projectId, "error", "Google Drive unavailable", message);
        return;
      }
      dispatchState(projectId, { type: "authorization-started" });
      showNotice(
        projectId,
        "info",
        "Connecting Google Drive",
        "Typr is opening Google authorization. After returning, continue by choosing a Drive destination."
      );
      void beginGoogleDriveRedirectAuthorization(
        clientId,
        projectId,
        intent
      ).catch((error) => {
        clearGoogleDrivePendingAuthorization();
        const message = getErrorMessage(
          error,
          "Unable to start Google authorization."
        );
        dispatchState(projectId, { type: "failed", message });
        showNotice(
          projectId,
          "error",
          "Google authorization failed",
          message
        );
      });
    },
    [
      clientId,
      configured,
      dispatchState,
      options,
      showNotice
    ]
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
    async (
      projectId: string,
      interactive: boolean,
      announce = interactive
    ) => {
      const binding = bindingsRef.current.get(projectId);
      if (!binding) {
        return;
      }
      const metadata = readGoogleDriveBindingMetadata(binding);
      if (!metadata) {
        dispatchState(projectId, {
          type: "failed",
          message:
            "This Google Drive binding is incomplete. Unlink it and choose a destination again."
        });
        return;
      }
      if (!isGoogleDriveAccessTokenFresh(accessTokenRef.current)) {
        if (interactive) {
          startAuthorization(projectId, "reconnect");
        } else {
          dispatchState(projectId, { type: "authorization-needed" });
        }
        return;
      }
      if (runningProjectIdsRef.current.has(projectId)) {
        queuedProjectIdsRef.current.add(projectId);
        return;
      }

      runningProjectIdsRef.current.add(projectId);
      dispatchState(projectId, { type: "sync-started", metadata });
      try {
        const remote = getRemote();
        await remote.verifyManagedProjectFolder({
          folderId: metadata.projectFolderId,
          parentId: metadata.selectedParentId,
          projectId
        });
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
        const nextBinding = result.binding as GoogleDriveBindingV2;
        bindingsRef.current.set(projectId, nextBinding);
        await saveCloudProjectBinding(nextBinding);
        const policy = getBindingPolicy(nextBinding);
        dispatchState(projectId, {
          type: "synced",
          lastSyncedAt: nextBinding.lastSyncedAt ?? new Date().toISOString(),
          metadata,
          syncMode: policy.mode,
          syncIntervalMinutes: policy.intervalMinutes
        });
        if (announce) {
          showNotice(
            projectId,
            "success",
            "Google Drive sync complete",
            `${metadata.projectFolderName} is synchronized inside ${metadata.selectedParentName}.`
          );
        }
      } catch (error) {
        if (isGoogleAuthorizationError(error)) {
          accessTokenRef.current = null;
          dispatchState(projectId, {
            type: "authorization-needed",
            message: "Google authorization expired. Reconnect to resume sync."
          });
        } else {
          dispatchState(projectId, {
            type: "failed",
            message: getErrorMessage(error, "Google Drive sync failed.")
          });
        }
        if (announce) {
          showNotice(
            projectId,
            "error",
            "Google Drive sync failed",
            getErrorMessage(error, "Google Drive sync failed.")
          );
        }
      } finally {
        runningProjectIdsRef.current.delete(projectId);
        if (queuedProjectIdsRef.current.delete(projectId)) {
          scheduleSync(projectId, 0);
        }
      }
    },
    [
      applySyncedProject,
      dispatchState,
      getRemote,
      scheduleSync,
      showNotice,
      startAuthorization
    ]
  );
  runProjectSyncRef.current = runProjectSync;

  const chooseLocation = useCallback(
    async (projectId: string) => {
      const project = projectStorageRef.current.projects.find(
        (entry) => entry.id === projectId
      );
      if (!project) {
        return;
      }
      let existingBinding = bindingsRef.current.get(projectId);
      let legacyBinding: CloudProjectBindingRecord | null = null;
      if (!existingBinding) {
        const storedBinding = await loadCloudProjectBinding(
          GOOGLE_DRIVE_PROVIDER_ID,
          projectId
        );
        if (isGoogleDriveBindingV2(storedBinding)) {
          existingBinding = storedBinding;
          bindingsRef.current.set(projectId, storedBinding);
        } else if (isLegacyGoogleDriveBinding(storedBinding)) {
          legacyBinding = storedBinding;
        }
      }
      if (!isGoogleDriveAccessTokenFresh(accessTokenRef.current)) {
        startAuthorization(
          projectId,
          existingBinding ? "change-location" : "connect"
        );
        return;
      }

      if (legacyBinding) {
        const legacyPolicy = getBindingPolicy(legacyBinding);
        dispatchState(projectId, {
          type: "legacy-binding-restored",
          folderName: legacyBinding.remoteRootName,
          lastSyncedAt: legacyBinding.lastSyncedAt,
          syncIntervalMinutes: legacyPolicy.intervalMinutes,
          syncMode: legacyPolicy.mode
        });
      }
      dispatchState(projectId, { type: "choosing-location" });
      try {
        const pickerResult = await showGoogleDriveFolderPicker({
          accessToken: accessTokenRef.current.accessToken,
          appId: cloudProjectNumber,
          developerKey: pickerApiKey
        });
        if (pickerResult.kind === "cancelled") {
          dispatchState(projectId, {
            type: "location-cancelled",
            hasBinding: Boolean(existingBinding),
            legacyFolderName: legacyBinding?.remoteRootName
          });
          showNotice(
            projectId,
            "info",
            "Drive location unchanged",
            existingBinding
              ? "The existing managed project folder remains connected."
              : legacyBinding
                ? `No new folder was created. The old “${legacyBinding.remoteRootName}” test folder remains in Drive.`
              : "No Google Drive folder was created."
          );
          return;
        }

        const remote = getRemote();
        const parent = await remote.getFolderMetadata(
          pickerResult.folder.id
        );
        dispatchState(projectId, {
          type: "creating-project-folder",
          parentName: parent.name
        });
        const folder = await remote.findOrCreateManagedProjectFolder({
          parentId: parent.id,
          projectId,
          projectName: project.displayName
        });
        const policy = existingBinding
          ? getBindingPolicy(existingBinding)
          : legacyBinding
            ? getBindingPolicy(legacyBinding)
            : DEFAULT_CLOUD_SYNC_POLICY;
        const binding = createGoogleDriveBinding({
          connectedAt: new Date().toISOString(),
          folder,
          parent,
          policy,
          projectId
        });
        const metadata = readGoogleDriveBindingMetadata(binding);
        if (!metadata) {
          throw new Error(
            "Typr could not create a complete Google Drive binding."
          );
        }
        dispatchState(projectId, { type: "sync-started", metadata });
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
        const nextBinding = result.binding as GoogleDriveBindingV2;
        bindingsRef.current.set(projectId, nextBinding);
        await saveCloudProjectBinding(nextBinding);
        dispatchState(projectId, {
          type: "synced",
          lastSyncedAt: nextBinding.lastSyncedAt ?? new Date().toISOString(),
          metadata,
          syncMode: policy.mode,
          syncIntervalMinutes: policy.intervalMinutes
        });
        showNotice(
          projectId,
          "success",
          "Google Drive connected",
          `${folder.name} is now synchronized inside ${parent.name}.`
        );
      } catch (error) {
        const fallbackMessage = getErrorMessage(
          error,
          "Unable to create the Google Drive project folder."
        );
        const message = legacyBinding
          ? `${fallbackMessage} The old “${legacyBinding.remoteRootName}” test folder remains in Drive until you remove it manually.`
          : fallbackMessage;
        if (existingBinding) {
          const existingMetadata =
            readGoogleDriveBindingMetadata(existingBinding);
          if (existingMetadata) {
            const policy = getBindingPolicy(existingBinding);
            dispatchState(projectId, {
              type: "binding-restored",
              configured,
              lastSyncedAt: existingBinding.lastSyncedAt,
              metadata: existingMetadata,
              syncMode: policy.mode,
              syncIntervalMinutes: policy.intervalMinutes
            });
          }
        }
        if (isGoogleAuthorizationError(error)) {
          accessTokenRef.current = null;
          dispatchState(projectId, { type: "authorization-needed" });
        } else {
          dispatchState(projectId, {
            type: "failed",
            message
          });
        }
        showNotice(
          projectId,
          "error",
          "Google Drive connection failed",
          message
        );
      } finally {
        clearGoogleDriveAuthorizationResult();
      }
    },
    [
      applySyncedProject,
      cloudProjectNumber,
      configured,
      dispatchState,
      getRemote,
      pickerApiKey,
      showNotice,
      startAuthorization
    ]
  );

  const importProject = useCallback(
    async (projectName = "Drive project") => {
      const pendingProject =
        pendingImportRef.current ??
        createEmptyProjectRepository({
          displayName: projectName,
          defaultFileName: null
        });
      pendingImportRef.current = pendingProject;

      if (!isGoogleDriveAccessTokenFresh(accessTokenRef.current)) {
        startAuthorization(pendingProject.id, "import");
        return;
      }

      dispatchState(pendingProject.id, { type: "choosing-location" });
      try {
        const pickerResult = await showGoogleDriveFolderPicker({
          accessToken: accessTokenRef.current.accessToken,
          appId: cloudProjectNumber,
          developerKey: pickerApiKey
        });
        if (pickerResult.kind === "cancelled") {
          pendingImportRef.current = null;
          return;
        }

        const tree = await getRemote().readTree(pickerResult.folder.id);
        const importedProject = applySyncTreeToProject(pendingProject, new Map(), tree);
        setProjectStorage((currentStorage) => ({
          ...currentStorage,
          selectedProjectId: importedProject.id,
          projects: [...currentStorage.projects, importedProject]
        }));
        setRawSnapshot((currentSnapshot) => ({
          ...currentSnapshot,
          project: projectRepositoryToLegacyProject(importedProject, currentSnapshot.project)
        }));
        pendingImportRef.current = null;
        setImportedProjectId(importedProject.id);
        showNotice(
          importedProject.id,
          "success",
          "Google Drive project imported",
          `Opened “${importedProject.displayName}” from Google Drive.`
        );
      } catch (error) {
        pendingImportRef.current = null;
        const message = getErrorMessage(error, "Unable to import the Google Drive folder.");
        showNotice(pendingProject.id, "error", "Google Drive import failed", message);
      } finally {
        clearGoogleDriveAuthorizationResult();
      }
    },
    [
      cloudProjectNumber,
      dispatchState,
      getRemote,
      pickerApiKey,
      setProjectStorage,
      setRawSnapshot,
      showNotice,
      startAuthorization
    ]
  );

  const connect = useCallback(
    async (projectId: string) => {
      if (bindingsRef.current.has(projectId)) {
        await runProjectSyncRef.current(projectId, true);
        return;
      }
      if (isGoogleDriveAccessTokenFresh(accessTokenRef.current)) {
        await chooseLocation(projectId);
        return;
      }
      startAuthorization(projectId, "connect");
    },
    [chooseLocation, startAuthorization]
  );

  const changeLocation = useCallback(
    async (projectId: string) => {
      if (isGoogleDriveAccessTokenFresh(accessTokenRef.current)) {
        await chooseLocation(projectId);
        return;
      }
      startAuthorization(projectId, "change-location");
    },
    [chooseLocation, startAuthorization]
  );

  useEffect(() => {
    if (!isHydrated || redirectResumeStartedRef.current) {
      return;
    }
    const result = readGoogleDriveAuthorizationResult();
    if (!result) {
      return;
    }
    redirectResumeStartedRef.current = true;

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has("google-drive-return")) {
      currentUrl.searchParams.delete("google-drive-return");
      window.history.replaceState(
        window.history.state,
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
      );
    }

    if (!result.projectId) {
      clearGoogleDriveAuthorizationResult();
      showNotice(
        null,
        "error",
        "Google authorization failed",
        result.error ??
          "Google authorization returned without a Typr project."
      );
      return;
    }
    const projectId = result.projectId;
    if (
      result.error ||
      !result.token ||
      !isGoogleDriveAccessTokenFresh(result.token)
    ) {
      clearGoogleDriveAuthorizationResult();
      const message =
        result.error ??
        "Google authorization expired before Typr could continue.";
      dispatchState(projectId, { type: "failed", message });
      showNotice(
        projectId,
        "error",
        "Google authorization failed",
        message
      );
      return;
    }

    accessTokenRef.current = result.token;
    dispatchState(projectId, { type: "authorization-returned" });
    showNotice(
      projectId,
      "success",
      "Google authorization complete",
      result.intent === "reconnect"
        ? "Typr is resuming synchronization with the existing managed folder."
        : "Choose a parent destination in Google Drive to finish connecting."
    );

    if (result.intent === "import") {
      const pendingProject = pendingImportRef.current;
      if (pendingProject?.id === projectId) {
        void importProject(pendingProject.displayName);
      }
      return;
    }

    if (result.intent !== "reconnect") {
      return;
    }

    const resumeExistingBinding = async () => {
      const binding = await loadCloudProjectBinding(
        GOOGLE_DRIVE_PROVIDER_ID,
        projectId
      );
      if (!isGoogleDriveBindingV2(binding)) {
        throw new Error(
          "The previous Google Drive binding needs a new destination. Choose a Drive location to continue."
        );
      }
      bindingsRef.current.set(projectId, binding);
      await runProjectSyncRef.current(projectId, false, true);
    };
    void resumeExistingBinding()
      .catch((error) => {
        const message = getErrorMessage(
          error,
          "Unable to resume Google Drive synchronization."
        );
        dispatchState(projectId, { type: "failed", message });
        showNotice(
          projectId,
          "error",
          "Google Drive reconnect failed",
          message
        );
      })
      .finally(() => {
        clearGoogleDriveAuthorizationResult();
      });
  }, [dispatchState, importProject, isHydrated, showNotice]);

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
        dispatchState(projectId, { type: "unlinked", configured });
        showNotice(
          projectId,
          "info",
          "Google Drive unlinked",
          "The Drive folder and all of its contents were left unchanged."
        );
      } catch (error) {
        if (binding) {
          bindingsRef.current.set(projectId, binding);
        }
        const message = getErrorMessage(
          error,
          "Unable to unlink Google Drive."
        );
        dispatchState(projectId, { type: "failed", message });
        showNotice(
          projectId,
          "error",
          "Unable to unlink Google Drive",
          message
        );
      }
    },
    [
      clearScheduledSync,
      configured,
      dispatchState,
      showNotice
    ]
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
      const nextBinding: GoogleDriveBindingV2 = {
        ...binding,
        syncMode: policy.mode,
        syncIntervalMinutes: policy.intervalMinutes
      };
      bindingsRef.current.set(projectId, nextBinding);
      dispatchState(projectId, {
        type: "policy-updated",
        syncMode: policy.mode,
        syncIntervalMinutes: policy.intervalMinutes
      });
      try {
        await saveCloudProjectBinding(nextBinding);
      } catch (error) {
        bindingsRef.current.set(projectId, binding);
        dispatchState(projectId, {
          type: "policy-updated",
          syncMode: currentPolicy.mode,
          syncIntervalMinutes: currentPolicy.intervalMinutes
        });
        const message = getErrorMessage(
          error,
          "Unable to save sync settings."
        );
        dispatchState(projectId, { type: "failed", message });
        return;
      }

      clearScheduledSync(projectId);
      if (policy.mode === "constant") {
        scheduleSync(projectId, 0);
      }
    },
    [
      clearScheduledSync,
      dispatchState,
      scheduleSync
    ]
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
    const redirectProjectId =
      readGoogleDriveAuthorizationResult()?.projectId ?? null;

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
        if (!binding || binding.providerId !== GOOGLE_DRIVE_PROVIDER_ID) {
          continue;
        }
        const policy = getBindingPolicy(binding);
        if (isGoogleDriveBindingV2(binding)) {
          bindingsRef.current.set(binding.projectId, binding);
          if (binding.projectId === redirectProjectId) {
            continue;
          }
          const metadata = readGoogleDriveBindingMetadata(binding);
          if (!metadata) {
            continue;
          }
          dispatchState(binding.projectId, {
            type: "binding-restored",
            configured,
            lastSyncedAt: binding.lastSyncedAt,
            metadata,
            syncMode: policy.mode,
            syncIntervalMinutes: policy.intervalMinutes
          });
        } else if (isLegacyGoogleDriveBinding(binding)) {
          if (binding.projectId === redirectProjectId) {
            continue;
          }
          dispatchState(binding.projectId, {
            type: "legacy-binding-restored",
            folderName: binding.remoteRootName,
            lastSyncedAt: binding.lastSyncedAt,
            syncMode: policy.mode,
            syncIntervalMinutes: policy.intervalMinutes
          });
        }
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
    dispatchState,
    isHydrated,
    projectIdsKey
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
    changeLocation,
    chooseLocation,
    configured,
    configurationMessage: getGoogleDriveConfigurationMessage(options),
    connect,
    disconnect,
    dismissNotice: () => setNotice(null),
    importProject,
    importedProjectId,
    isAuthorized: isGoogleDriveAccessTokenFresh(accessTokenRef.current),
    notice,
    setSyncPolicy,
    states,
    syncNow: (projectId: string) =>
      runProjectSync(projectId, true),
    syncOnCompile
  };
}

function getBindingPolicy(binding: {
  syncIntervalMinutes: number;
  syncMode: CloudSyncMode;
}) {
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
    (error instanceof GoogleDriveApiError && error.status === 401)
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getGoogleDriveConfigurationMessage(options: {
  clientId: string;
  cloudProjectNumber: string;
  pickerApiKey: string;
}): string {
  if (!options.clientId.trim()) {
    return "Google Drive OAuth client ID is not configured on this deployment.";
  }
  if (!options.pickerApiKey.trim()) {
    return "Google Picker API key is not configured on this deployment.";
  }
  if (!/^\d+$/.test(options.cloudProjectNumber.trim())) {
    return "Google Cloud project number for Picker is not configured on this deployment.";
  }
  return "Google Drive Picker is configured.";
}
