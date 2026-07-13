import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import { createDefaultSnapshot, type AppSnapshot } from "./appState";
import { createLifecyclePersistence, type LifecyclePersistence } from "./lifecyclePersistence";
import {
  createProjectStorageFromSnapshot,
  getSelectedProjectRepository,
  projectRepositoryToLegacyProject,
  syncProjectStorageFromSnapshot,
  updateSelectedProjectRepository,
  type TyprProjectRepository,
  type TyprProjectStorageState
} from "../project/projectState";
import { saveProjectStorage, saveSnapshot } from "../storage/indexedDbStorage";

const SAVE_DEBOUNCE_MS = 250;

export function useWorkspacePersistence({
  hasHydrationError,
  isHydrated,
  isMountedRef,
  setStorageStatus
}: {
  hasHydrationError: boolean;
  isHydrated: boolean;
  isMountedRef: RefObject<boolean>;
  setStorageStatus: Dispatch<SetStateAction<"idle" | "saving" | "saved" | "error">>;
}) {
  const defaultSnapshotRef = useRef<AppSnapshot | null>(null);
  if (defaultSnapshotRef.current === null) {
    defaultSnapshotRef.current = createDefaultSnapshot();
  }

  const [snapshot, setRawSnapshot] = useState<AppSnapshot>(defaultSnapshotRef.current);
  const [projectStorage, setProjectStorage] = useState<TyprProjectStorageState>(() =>
    createProjectStorageFromSnapshot(defaultSnapshotRef.current as AppSnapshot)
  );
  const lifecyclePersistenceRef = useRef<
    LifecyclePersistence<AppSnapshot, TyprProjectStorageState> | null
  >(null);
  const persistencePayloadRef = useRef({ snapshot, projectStorage });
  persistencePayloadRef.current = { snapshot, projectStorage };
  const selectedProjectRepository = getSelectedProjectRepository(projectStorage);
  const selectedProjectRepositoryRef = useRef<TyprProjectRepository | null>(
    selectedProjectRepository
  );

  useEffect(() => {
    selectedProjectRepositoryRef.current = selectedProjectRepository;
  }, [selectedProjectRepository]);

  const setSnapshot = useCallback<Dispatch<SetStateAction<AppSnapshot>>>((snapshotAction) => {
    setRawSnapshot((currentSnapshot) => {
      const nextSnapshot =
        typeof snapshotAction === "function"
          ? (snapshotAction as (snapshot: AppSnapshot) => AppSnapshot)(currentSnapshot)
          : snapshotAction;

      setProjectStorage((currentStorage) =>
        syncProjectStorageFromSnapshot(nextSnapshot, currentStorage, currentSnapshot)
      );
      return nextSnapshot;
    });
  }, []);

  const setProjectRepository = useCallback(
    (updater: (project: TyprProjectRepository) => TyprProjectRepository) => {
      setProjectStorage((currentStorage) => {
        let nextProject: TyprProjectRepository | null = null;
        const nextStorage = updateSelectedProjectRepository(currentStorage, (project) => {
          nextProject = updater(project);
          return nextProject;
        });

        const updatedProject = nextProject;
        if (updatedProject) {
          setRawSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            project: projectRepositoryToLegacyProject(updatedProject, currentSnapshot.project)
          }));
        }
        return nextStorage;
      });
    },
    []
  );

  useEffect(() => {
    if (!isHydrated || hasHydrationError || typeof window === "undefined") {
      return;
    }

    const persistence = createLifecyclePersistence({
      debounceMs: SAVE_DEBOUNCE_MS,
      documentTarget: document,
      getCurrentPayload: () => persistencePayloadRef.current,
      onStatusChange: (status) => {
        if (isMountedRef.current) setStorageStatus(status);
      },
      saveProjectStorage,
      saveSnapshot,
      windowTarget: window
    });
    lifecyclePersistenceRef.current = persistence;

    return () => {
      persistence.dispose();
      if (lifecyclePersistenceRef.current === persistence) {
        lifecyclePersistenceRef.current = null;
      }
    };
  }, [hasHydrationError, isHydrated, isMountedRef, setStorageStatus]);

  useEffect(() => {
    if (!isHydrated || hasHydrationError) return;
    lifecyclePersistenceRef.current?.update({ snapshot, projectStorage });
  }, [hasHydrationError, isHydrated, projectStorage, snapshot]);

  return {
    lifecyclePersistenceRef,
    persistencePayloadRef,
    projectStorage,
    selectedProjectRepository,
    selectedProjectRepositoryRef,
    setProjectRepository,
    setProjectStorage,
    setRawSnapshot,
    setSnapshot,
    snapshot
  };
}
