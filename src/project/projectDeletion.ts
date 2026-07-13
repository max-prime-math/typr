import {
  removeProjectRepository,
  type TyprProjectRepository,
  type TyprProjectStorageState
} from "./projectState";

export interface ProjectDeletionTombstone {
  projectId: string;
  createdAt: string;
}

type ProjectDeletionOperation =
  | "browser-git"
  | "opfs"
  | "project-storage"
  | "tombstone";

export interface ProjectDeletionError {
  projectId: string;
  operation: ProjectDeletionOperation;
  cause: unknown;
}

interface ProjectDeletionCleanupDependencies {
  deleteBrowserGitFiles(projectId: string): Promise<void>;
  deleteTombstone(projectId: string): Promise<void>;
  removeOpfsProject(projectId: string): Promise<void>;
  saveProjectStorage(storage: TyprProjectStorageState): Promise<void>;
}

interface ProjectDeletionDependencies extends ProjectDeletionCleanupDependencies {
  saveTombstone(projectId: string): Promise<ProjectDeletionTombstone>;
}

export interface ProjectDeletionResult {
  storage: TyprProjectStorageState;
  pendingProjectIds: string[];
  errors: ProjectDeletionError[];
}

interface DeleteProjectDurablyOptions {
  dependencies: ProjectDeletionDependencies;
  fallbackProject?: TyprProjectRepository;
  projectId: string;
  storage: TyprProjectStorageState;
}

interface RetryProjectDeletionsOptions {
  dependencies: ProjectDeletionCleanupDependencies;
  fallbackProject?: TyprProjectRepository;
  storage: TyprProjectStorageState;
  tombstones: ProjectDeletionTombstone[];
}

export function applyProjectDeletionTombstones(
  storage: TyprProjectStorageState,
  tombstones: ProjectDeletionTombstone[],
  fallbackProject?: TyprProjectRepository
): TyprProjectStorageState {
  let nextStorage = storage;

  for (const projectId of getUniqueProjectIds(tombstones)) {
    nextStorage = removeProjectRepository(nextStorage, projectId);
  }

  if (nextStorage.projects.length === 0 && fallbackProject) {
    return {
      ...nextStorage,
      selectedProjectId: fallbackProject.id,
      projects: [fallbackProject]
    };
  }

  return nextStorage;
}

export async function deleteProjectDurably({
  dependencies,
  fallbackProject,
  projectId,
  storage
}: DeleteProjectDurablyOptions): Promise<ProjectDeletionResult> {
  const tombstone = await dependencies.saveTombstone(projectId);

  return retryProjectDeletions({
    dependencies,
    fallbackProject,
    storage,
    tombstones: [tombstone]
  });
}

export async function retryProjectDeletions({
  dependencies,
  fallbackProject,
  storage,
  tombstones
}: RetryProjectDeletionsOptions): Promise<ProjectDeletionResult> {
  const uniqueTombstones = getUniqueTombstones(tombstones);
  if (uniqueTombstones.length === 0) {
    return {
      storage,
      pendingProjectIds: [],
      errors: []
    };
  }

  const nextStorage = applyProjectDeletionTombstones(
    storage,
    uniqueTombstones,
    fallbackProject
  );
  const errors: ProjectDeletionError[] = [];
  const cleanupFailedProjectIds = new Set<string>();

  for (const tombstone of uniqueTombstones) {
    try {
      await dependencies.deleteBrowserGitFiles(tombstone.projectId);
    } catch (cause) {
      cleanupFailedProjectIds.add(tombstone.projectId);
      errors.push({
        projectId: tombstone.projectId,
        operation: "browser-git",
        cause
      });
    }

    try {
      await dependencies.removeOpfsProject(tombstone.projectId);
    } catch (cause) {
      cleanupFailedProjectIds.add(tombstone.projectId);
      errors.push({
        projectId: tombstone.projectId,
        operation: "opfs",
        cause
      });
    }
  }

  let didSaveProjectStorage = false;
  try {
    await dependencies.saveProjectStorage(nextStorage);
    didSaveProjectStorage = true;
  } catch (cause) {
    for (const tombstone of uniqueTombstones) {
      errors.push({
        projectId: tombstone.projectId,
        operation: "project-storage",
        cause
      });
    }
  }

  const pendingProjectIds = new Set(
    didSaveProjectStorage
      ? cleanupFailedProjectIds
      : uniqueTombstones.map((tombstone) => tombstone.projectId)
  );

  if (didSaveProjectStorage) {
    for (const tombstone of uniqueTombstones) {
      if (cleanupFailedProjectIds.has(tombstone.projectId)) {
        continue;
      }

      try {
        await dependencies.deleteTombstone(tombstone.projectId);
      } catch (cause) {
        pendingProjectIds.add(tombstone.projectId);
        errors.push({
          projectId: tombstone.projectId,
          operation: "tombstone",
          cause
        });
      }
    }
  }

  return {
    storage: nextStorage,
    pendingProjectIds: [...pendingProjectIds],
    errors
  };
}

function getUniqueProjectIds(tombstones: ProjectDeletionTombstone[]): string[] {
  return getUniqueTombstones(tombstones).map((tombstone) => tombstone.projectId);
}

function getUniqueTombstones(
  tombstones: ProjectDeletionTombstone[]
): ProjectDeletionTombstone[] {
  const uniqueTombstones = new Map<string, ProjectDeletionTombstone>();

  for (const tombstone of tombstones) {
    const projectId = tombstone.projectId.trim();
    if (projectId && !uniqueTombstones.has(projectId)) {
      uniqueTombstones.set(projectId, {
        ...tombstone,
        projectId
      });
    }
  }

  return [...uniqueTombstones.values()];
}
