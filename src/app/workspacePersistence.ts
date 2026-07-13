import type { SetStateAction } from "react";
import type { AppSnapshot } from "./appState";
import {
  projectRepositoryToLegacyProject,
  syncProjectStorageFromSnapshot,
  updateSelectedProjectRepository,
  type TyprProjectRepository,
  type TyprProjectStorageState
} from "../project/projectState";

export interface WorkspacePersistenceState {
  snapshot: AppSnapshot;
  projectStorage: TyprProjectStorageState;
}

export function applyWorkspaceSnapshotUpdate(
  current: WorkspacePersistenceState,
  action: SetStateAction<AppSnapshot>
): WorkspacePersistenceState {
  const nextSnapshot =
    typeof action === "function"
      ? (action as (snapshot: AppSnapshot) => AppSnapshot)(current.snapshot)
      : action;

  return {
    snapshot: nextSnapshot,
    projectStorage: syncProjectStorageFromSnapshot(
      nextSnapshot,
      current.projectStorage,
      current.snapshot
    )
  };
}

export function applySelectedProjectUpdate(
  current: WorkspacePersistenceState,
  updater: (project: TyprProjectRepository) => TyprProjectRepository
): WorkspacePersistenceState {
  let nextProject: TyprProjectRepository | null = null;
  const projectStorage = updateSelectedProjectRepository(current.projectStorage, (project) => {
    nextProject = updater(project);
    return nextProject;
  });

  return {
    projectStorage,
    snapshot: nextProject
      ? {
          ...current.snapshot,
          project: projectRepositoryToLegacyProject(nextProject, current.snapshot.project)
        }
      : current.snapshot
  };
}
