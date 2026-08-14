import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import { flushSync } from "react-dom";
import type { CloudProjectBindingRecord } from "../cloud/cloudSync";
import type {
  CompanionClient,
  CompanionConnectionStatus
} from "../compiler/companionClient";
import {
  projectRepositoryToLegacyProject,
  type TyprProjectStorageState
} from "../project/projectState";
import {
  commitCompanionWorkspaceSync,
  deleteCloudProjectBinding,
  loadCloudProjectBinding,
  saveCloudProjectBinding
} from "../storage/indexedDbStorage";
import {
  COMPANION_WORKSPACE_PROVIDER_ID,
  CompanionWorkspaceConflictError,
  CompanionWorkspacePartialError,
  createCompanionWorkspaceProjectTree,
  createCompanionWorkspaceBinding,
  synchronizeCompanionWorkspace
} from "../workspace/companionWorkspaceSync";
import {
  applySyncTreeToProject,
  getSyncTreeSignatures
} from "../workspace/localFolderSync";
import type { AppSnapshot } from "./appState";
import type { LifecyclePersistence, PersistencePayload } from "./lifecyclePersistence";

export interface CompanionWorkspaceProjectState {
  status: "restoring" | "unavailable" | "unlinked" | "linked" | "syncing" | "synced" | "conflict" | "error" | "stale";
  workspaceId: string | null;
  lastSyncedAt: string | null;
  message: string;
  conflictPaths?: string[];
}

export function useCompanionWorkspaceSync(options: {
  client: CompanionClient;
  connection: CompanionConnectionStatus;
  isHydrated: boolean;
  projectStorage: TyprProjectStorageState;
  lifecyclePersistenceRef: RefObject<LifecyclePersistence<AppSnapshot, TyprProjectStorageState> | null>;
  persistencePayloadRef: RefObject<PersistencePayload<AppSnapshot, TyprProjectStorageState>>;
  setProjectStorage: Dispatch<SetStateAction<TyprProjectStorageState>>;
  setRawSnapshot: Dispatch<SetStateAction<AppSnapshot>>;
}) {
  const {
    client, connection, isHydrated, lifecyclePersistenceRef, persistencePayloadRef,
    projectStorage, setProjectStorage, setRawSnapshot
  } = options;
  const [states, setStates] = useState<Record<string, CompanionWorkspaceProjectState>>({});
  const projectStorageRef = useRef(projectStorage);
  const bindingsRef = useRef(new Map<string, CloudProjectBindingRecord>());
  const runningRef = useRef(new Set<string>());
  const restoredProjectIdsRef = useRef(new Set<string>());
  const restoreGenerationsRef = useRef(new Map<string, number>());
  projectStorageRef.current = projectStorage;
  const projectIds = projectStorage.projects.map((project) => project.id).join("\0");

  const capability = connection.state === "available" &&
    connection.status?.capabilities.filesystem.projectStorage === true
    ? connection.status.capabilities.filesystem
    : null;
  const workspaceAvailable = Boolean(capability);
  const workspaceId = capability?.workspaceId ?? null;

  const stateForBinding = useCallback((binding: CloudProjectBindingRecord): CompanionWorkspaceProjectState => {
    if (!workspaceAvailable) {
      return {
        status: "unavailable",
        workspaceId: binding.remoteRootId,
        lastSyncedAt: binding.lastSyncedAt,
        message: "The current Typr Server does not expose a mapped workspace. Browser storage is unchanged."
      };
    }
    if (binding.providerData?.baseUrl !== client.baseUrl || binding.remoteRootId !== workspaceId) {
      return {
        status: "stale",
        workspaceId: binding.remoteRootId,
        lastSyncedAt: binding.lastSyncedAt,
        message: "This link belongs to a different Typr Server URL or workspace. Unlink it before reconnecting."
      };
    }
    return {
      status: binding.lastSyncedAt ? "synced" : "linked",
      workspaceId: binding.remoteRootId,
      lastSyncedAt: binding.lastSyncedAt,
      message: binding.lastSyncedAt ? "Manual sync ready." : "Linked; initial sync has not completed."
    };
  }, [client.baseUrl, workspaceAvailable, workspaceId]);

  useEffect(() => {
    if (!isHydrated) return;
    let active = true;
    const projectIdsToRestore = projectStorageRef.current.projects.map((project) => project.id);
    const currentProjectIds = new Set(projectIdsToRestore);
    for (const projectId of [...restoredProjectIdsRef.current]) {
      if (!currentProjectIds.has(projectId)) restoredProjectIdsRef.current.delete(projectId);
    }
    for (const projectId of [...bindingsRef.current.keys()]) {
      if (!currentProjectIds.has(projectId)) bindingsRef.current.delete(projectId);
    }
    setStates((current) => Object.fromEntries(projectIdsToRestore.map((projectId) => [projectId,
      restoredProjectIdsRef.current.has(projectId)
        ? bindingsRef.current.has(projectId)
          ? stateForBinding(bindingsRef.current.get(projectId)!)
          : createUnlinkedState(workspaceAvailable)
        : createRestoringState()
    ])));
    for (const projectId of projectIdsToRestore) {
      if (restoredProjectIdsRef.current.has(projectId)) continue;
      const generation = (restoreGenerationsRef.current.get(projectId) ?? 0) + 1;
      restoreGenerationsRef.current.set(projectId, generation);
      void loadCloudProjectBinding(COMPANION_WORKSPACE_PROVIDER_ID, projectId).then((binding) => {
        if (!active || restoreGenerationsRef.current.get(projectId) !== generation) return;
        if (binding) bindingsRef.current.set(projectId, binding);
        else bindingsRef.current.delete(projectId);
        restoredProjectIdsRef.current.add(projectId);
        setStates((current) => ({
          ...current,
          [projectId]: binding ? stateForBinding(binding) : createUnlinkedState(workspaceAvailable)
        }));
      }).catch((error: unknown) => {
        if (!active || restoreGenerationsRef.current.get(projectId) !== generation) return;
        setStates((current) => ({ ...current, [projectId]: {
          status: "error",
          workspaceId: null,
          lastSyncedAt: null,
          message: error instanceof Error ? error.message : "Mapped workspace link restoration failed. Reload to retry."
        } }));
      });
    }
    return () => { active = false; };
  }, [isHydrated, projectIds, stateForBinding, workspaceAvailable]);

  const syncNow = useCallback(async (projectId: string): Promise<void> => {
    const binding = bindingsRef.current.get(projectId);
    if (!binding || !capability || runningRef.current.has(projectId)) return;
    const project = projectStorageRef.current.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    runningRef.current.add(projectId);
    setStates((current) => ({
      ...current,
      [projectId]: {
        status: "syncing",
        workspaceId: binding.remoteRootId,
        lastSyncedAt: binding.lastSyncedAt,
        message: "Synchronizing browser files with the mapped workspace…"
      }
    }));
    try {
      const result = await synchronizeCompanionWorkspace({
        binding,
        project,
        client,
        workspaceId: capability.workspaceId,
        limits: capability.limits
      });
      if (bindingsRef.current.get(projectId) !== binding) return;
      let payload: PersistencePayload<AppSnapshot, TyprProjectStorageState> | null = null;
      let localChangesRemain = false;
      flushSync(() => {
        setProjectStorage((currentStorage) => {
          const currentProject = currentStorage.projects.find((candidate) => candidate.id === projectId);
          if (!currentProject) return currentStorage;
          const nextProject = applySyncTreeToProject(
            currentProject,
            result.startedProjectTree,
            result.desiredTree
          );
          localChangesRemain = !sameSignatures(
            getSyncTreeSignatures(createCompanionWorkspaceProjectTree(nextProject)),
            getSyncTreeSignatures(result.desiredTree)
          );
          const nextStorage = {
            ...currentStorage,
            projects: currentStorage.projects.map((candidate) => candidate.id === projectId ? nextProject : candidate)
          };
          const currentSnapshot = persistencePayloadRef.current.snapshot;
          const nextSnapshot = currentStorage.selectedProjectId === projectId
            ? {
                ...currentSnapshot,
                project: projectRepositoryToLegacyProject(nextProject, currentSnapshot.project)
              }
            : currentSnapshot;
          payload = { projectStorage: nextStorage, snapshot: nextSnapshot };
          persistencePayloadRef.current = payload;
          projectStorageRef.current = nextStorage;
          if (nextSnapshot !== currentSnapshot) setRawSnapshot(nextSnapshot);
          return nextStorage;
        });
      });
      if (!payload) throw new Error("The browser project disappeared during mapped workspace synchronization.");
      const persistence = lifecyclePersistenceRef.current;
      if (!persistence) throw new Error("Browser persistence is not ready for mapped workspace synchronization.");
      const committedPayload = payload as PersistencePayload<AppSnapshot, TyprProjectStorageState>;
      await persistence.persistAtomic(committedPayload, () => commitCompanionWorkspaceSync({
        ...committedPayload,
        binding: result.binding
      }));
      bindingsRef.current.set(projectId, result.binding);
      setStates((current) => ({
        ...current,
        [projectId]: {
          status: "synced",
          workspaceId: result.binding.remoteRootId,
          lastSyncedAt: result.binding.lastSyncedAt,
          message: localChangesRemain
            ? "Workspace synced; newer browser edits remain local. Sync again when ready."
            : "Manual sync complete. Browser storage remains the primary local copy."
        }
      }));
    } catch (error) {
      const conflict = error instanceof CompanionWorkspaceConflictError ? error : null;
      const partial = error instanceof CompanionWorkspacePartialError ? error : null;
      setStates((current) => ({
        ...current,
        [projectId]: {
          status: conflict ? "conflict" : "error",
          workspaceId: binding.remoteRootId,
          lastSyncedAt: binding.lastSyncedAt,
          message: conflict
            ? `${conflict.message}${conflict.partiallyAppliedPaths.length > 0 ? " Some earlier file operations completed safely; sync again after reviewing." : ""}`
            : `${error instanceof Error ? error.message : "Mapped workspace sync failed."}${partial?.partiallyAppliedPaths.length ? " Some mapped-workspace file operations completed; sync again to reconcile them." : ""}`,
          ...(conflict ? { conflictPaths: conflict.paths } : {})
        }
      }));
    } finally {
      runningRef.current.delete(projectId);
    }
  }, [capability, client, lifecyclePersistenceRef, persistencePayloadRef, setProjectStorage, setRawSnapshot]);

  const link = useCallback(async (projectId: string): Promise<void> => {
    if (!capability || !restoredProjectIdsRef.current.has(projectId)) return;
    const confirmed = window.confirm(
      "Link this project to the mapped Typr Server workspace? The first sync is additive: files from both sides are kept, and mapped-workspace content wins same-path collisions. Browser storage remains the primary local copy."
    );
    if (!confirmed) return;
    const binding = createCompanionWorkspaceBinding({
      projectId,
      baseUrl: client.baseUrl,
      workspaceId: capability.workspaceId
    });
    try {
      await saveCloudProjectBinding(binding);
      bindingsRef.current.set(projectId, binding);
      setStates((current) => ({ ...current, [projectId]: stateForBinding(binding) }));
      await syncNow(projectId);
    } catch (error) {
      setStates((current) => ({ ...current, [projectId]: {
        status: "error", workspaceId: null, lastSyncedAt: null,
        message: error instanceof Error ? error.message : "Mapped workspace link could not be saved."
      } }));
    }
  }, [capability, client.baseUrl, stateForBinding, syncNow]);

  const unlink = useCallback(async (projectId: string): Promise<void> => {
    if (!restoredProjectIdsRef.current.has(projectId)) return;
    const binding = bindingsRef.current.get(projectId);
    try {
      await deleteCloudProjectBinding(COMPANION_WORKSPACE_PROVIDER_ID, projectId);
      bindingsRef.current.delete(projectId);
      setStates((current) => ({ ...current, [projectId]: createUnlinkedState(Boolean(capability)) }));
    } catch (error) {
      setStates((current) => ({ ...current, [projectId]: {
        status: "error",
        workspaceId: binding?.remoteRootId ?? null,
        lastSyncedAt: binding?.lastSyncedAt ?? null,
        message: error instanceof Error ? error.message : "Mapped workspace link could not be removed."
      } }));
    }
  }, [capability]);

  return { capability, link, states, syncNow, unlink };
}

function createRestoringState(): CompanionWorkspaceProjectState {
  return {
    status: "restoring",
    workspaceId: null,
    lastSyncedAt: null,
    message: "Restoring mapped workspace link…"
  };
}

function sameSignatures(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function createUnlinkedState(available: boolean): CompanionWorkspaceProjectState {
  return {
    status: available ? "unlinked" : "unavailable",
    workspaceId: null,
    lastSyncedAt: null,
    message: available
      ? "No mapped workspace linked. Browser storage remains the default."
      : "Mapped workspace is unavailable. Browser storage remains the default."
  };
}
