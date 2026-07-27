import { describe, expect, it, vi } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import {
  addProjectRepository,
  createEmptyProjectRepository,
  createProjectStorageFromSnapshot
} from "./projectState";
import {
  applyProjectDeletionTombstones,
  deleteProjectDurably,
  retryProjectDeletions,
  type ProjectDeletionTombstone
} from "./projectDeletion";

function createStorage() {
  const firstProjectStorage = createProjectStorageFromSnapshot(createDefaultSnapshot());
  const projectToDelete = createEmptyProjectRepository({ displayName: "Delete me" });

  return {
    projectToDelete,
    storage: addProjectRepository(firstProjectStorage, projectToDelete)
  };
}

function createTombstone(projectId: string): ProjectDeletionTombstone {
  return {
    projectId,
    createdAt: "2026-07-10T12:00:00.000Z"
  };
}

describe("durable project deletion", () => {
  it("writes a tombstone before deleting browser Git and OPFS data", async () => {
    const { projectToDelete, storage } = createStorage();
    const events: string[] = [];
    const tombstone = createTombstone(projectToDelete.id);
    const dependencies = {
      deleteBrowserGitFiles: vi.fn(async () => {
        events.push("delete-git");
      }),
      deleteCloudProjectBindings: vi.fn(async () => {
        events.push("delete-cloud-bindings");
      }),
      deleteLocalFolderBinding: vi.fn(async () => {
        events.push("delete-folder-binding");
      }),
      deleteTombstone: vi.fn(async () => {
        events.push("delete-tombstone");
      }),
      removeOpfsProject: vi.fn(async () => {
        events.push("delete-opfs");
      }),
      saveProjectStorage: vi.fn(async (nextStorage) => {
        events.push(`save-projects:${nextStorage.projects.length}`);
      }),
      saveTombstone: vi.fn(async () => {
        events.push("save-tombstone");
        return tombstone;
      })
    };

    const result = await deleteProjectDurably({
      dependencies,
      projectId: projectToDelete.id,
      storage
    });

    expect(events).toEqual([
      "save-tombstone",
      "delete-git",
      "delete-folder-binding",
      "delete-cloud-bindings",
      "delete-opfs",
      "save-projects:1",
      "delete-tombstone"
    ]);
    expect(result.storage.projects.some((project) => project.id === projectToDelete.id)).toBe(false);
    expect(result.pendingProjectIds).toEqual([]);
  });

  it("keeps reload recoverable while auxiliary cleanup is interrupted", async () => {
    const { projectToDelete, storage } = createStorage();
    const tombstone = createTombstone(projectToDelete.id);
    const durableTombstones: ProjectDeletionTombstone[] = [];
    let rejectOpfsCleanup: ((reason: Error) => void) | undefined;
    const opfsCleanup = new Promise<void>((_resolve, reject) => {
      rejectOpfsCleanup = reject;
    });
    const saveProjectStorage = vi.fn(async () => {});
    const deleteTombstone = vi.fn(async () => {});

    const deletion = deleteProjectDurably({
      dependencies: {
        deleteBrowserGitFiles: vi.fn(async () => {}),
        deleteCloudProjectBindings: vi.fn(async () => {}),
        deleteLocalFolderBinding: vi.fn(async () => {}),
        deleteTombstone,
        removeOpfsProject: vi.fn(() => opfsCleanup),
        saveProjectStorage,
        saveTombstone: vi.fn(async () => {
          durableTombstones.push(tombstone);
          return tombstone;
        })
      },
      projectId: projectToDelete.id,
      storage
    });

    await vi.waitFor(() => expect(durableTombstones).toEqual([tombstone]));

    const reloadedStorage = applyProjectDeletionTombstones(storage, durableTombstones);
    expect(reloadedStorage.projects.some((project) => project.id === projectToDelete.id)).toBe(false);

    rejectOpfsCleanup?.(new Error("tab interrupted OPFS cleanup"));
    const result = await deletion;

    expect(saveProjectStorage).toHaveBeenCalledWith(reloadedStorage);
    expect(deleteTombstone).not.toHaveBeenCalled();
    expect(result.pendingProjectIds).toEqual([projectToDelete.id]);
  });

  it("retries retained tombstones and clears them only after durable project storage", async () => {
    const { projectToDelete, storage } = createStorage();
    const tombstone = createTombstone(projectToDelete.id);
    const events: string[] = [];
    const deleteBrowserGitFiles = vi.fn(async () => {
      events.push("retry-git");
    });
    const removeOpfsProject = vi.fn(async () => {
      events.push("retry-opfs");
    });
    const deleteLocalFolderBinding = vi.fn(async () => {
      events.push("retry-folder-binding");
    });
    const deleteCloudProjectBindings = vi.fn(async () => {
      events.push("retry-cloud-bindings");
    });
    const deleteTombstone = vi.fn(async () => {
      events.push("clear-tombstone");
    });

    const result = await retryProjectDeletions({
      dependencies: {
        deleteBrowserGitFiles,
        deleteCloudProjectBindings,
        deleteLocalFolderBinding,
        deleteTombstone,
        removeOpfsProject,
        saveProjectStorage: vi.fn(async () => {
          events.push("save-projects");
        })
      },
      storage,
      tombstones: [tombstone]
    });

    expect(events).toEqual([
      "retry-git",
      "retry-folder-binding",
      "retry-cloud-bindings",
      "retry-opfs",
      "save-projects",
      "clear-tombstone"
    ]);
    expect(deleteBrowserGitFiles).toHaveBeenCalledWith(projectToDelete.id);
    expect(deleteLocalFolderBinding).toHaveBeenCalledWith(projectToDelete.id);
    expect(deleteCloudProjectBindings).toHaveBeenCalledWith(
      projectToDelete.id
    );
    expect(removeOpfsProject).toHaveBeenCalledWith(projectToDelete.id);
    expect(result.storage.projects.some((project) => project.id === projectToDelete.id)).toBe(false);
    expect(result.pendingProjectIds).toEqual([]);
  });
});
