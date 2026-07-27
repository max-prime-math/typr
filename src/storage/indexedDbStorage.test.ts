import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const indexedDbHarness = vi.hoisted(() => {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();
  const getStore = (storeName: string) => {
    let store = stores.get(storeName);
    if (!store) {
      store = new Map();
      stores.set(storeName, store);
    }
    return store;
  };
  const database = {
    delete: vi.fn(async (storeName: string, key: IDBValidKey) => {
      getStore(storeName).delete(key);
    }),
    get: vi.fn(async (storeName: string, key: IDBValidKey) => getStore(storeName).get(key)),
    getAllKeys: vi.fn(async (storeName: string) => [...getStore(storeName).keys()]),
    put: vi.fn(async (storeName: string, value: unknown, key: IDBValidKey) => {
      getStore(storeName).set(key, value);
    })
  };

  return {
    database,
    openDB: vi.fn(async () => database),
    stores
  };
});

vi.mock("idb", () => ({
  openDB: indexedDbHarness.openDB
}));

import {
  deleteCloudProjectBinding,
  deleteCloudProjectBindings,
  deleteLocalFolderBinding,
  deleteProjectDeletionTombstone,
  deleteProjectGitFiles,
  listProjectGitFiles,
  loadCloudProjectBinding,
  loadLocalFolderBinding,
  loadProjectDeletionTombstones,
  readProjectGitFile,
  saveCloudProjectBinding,
  saveProjectDeletionTombstone,
  saveLocalFolderBinding,
  writeProjectGitFile
} from "./indexedDbStorage";

describe("IndexedDB project deletion storage", () => {
  beforeEach(() => {
    indexedDbHarness.stores.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists, lists, and clears independent project deletion tombstones", async () => {
    const first = await saveProjectDeletionTombstone("project-a");
    const second = await saveProjectDeletionTombstone("project-b");

    expect(first).toEqual({
      projectId: "project-a",
      createdAt: "2026-07-10T12:00:00.000Z"
    });
    expect(await loadProjectDeletionTombstones()).toEqual([first, second]);

    await deleteProjectDeletionTombstone("project-a");

    expect(await loadProjectDeletionTombstones()).toEqual([second]);
  });

  it("deletes only the targeted project's browser Git files", async () => {
    await writeProjectGitFile("project-a", ".git/HEAD", new Uint8Array([1]));
    await writeProjectGitFile("project-a", ".git/config", new Uint8Array([2]));
    await writeProjectGitFile("project-b", ".git/HEAD", new Uint8Array([3]));

    await deleteProjectGitFiles("project-a");

    expect(await listProjectGitFiles("project-a")).toEqual([]);
    expect(await listProjectGitFiles("project-b")).toEqual([".git/HEAD"]);
    expect(await readProjectGitFile("project-b", ".git/HEAD")).toEqual(new Uint8Array([3]));
  });

  it("persists local folder handles independently for each project", async () => {
    const directoryHandle = {
      kind: "directory",
      name: "writing"
    } as FileSystemDirectoryHandle;
    await saveLocalFolderBinding({
      version: 1,
      projectId: "project-a",
      directoryHandle,
      directoryName: "writing",
      connectedAt: "2026-07-10T12:00:00.000Z",
      lastSyncedAt: null,
      directoryFingerprint: null,
      syncMode: "interval",
      syncIntervalMinutes: 10,
      worktreeSignatures: {},
      gitSignatures: {}
    });

    const storedBinding = await loadLocalFolderBinding("project-a");
    expect(storedBinding?.directoryHandle).toBe(directoryHandle);
    expect(storedBinding?.syncMode).toBe("interval");
    expect(storedBinding?.syncIntervalMinutes).toBe(10);
    expect(await loadLocalFolderBinding("project-b")).toBeNull();

    await deleteLocalFolderBinding("project-a");
    expect(await loadLocalFolderBinding("project-a")).toBeNull();
  });

  it("persists cloud bindings independently by provider and project", async () => {
    await saveCloudProjectBinding({
      version: 1,
      projectId: "project-a",
      providerId: "google-drive",
      remoteRootId: "drive-folder-1",
      remoteRootName: "Writing",
      connectedAt: "2026-07-10T12:00:00.000Z",
      lastSyncedAt: null,
      syncMode: "manual",
      syncIntervalMinutes: 15,
      worktreeSignatures: {}
    });

    expect(
      await loadCloudProjectBinding("google-drive", "project-a")
    ).toMatchObject({
      remoteRootId: "drive-folder-1",
      remoteRootName: "Writing"
    });
    expect(
      await loadCloudProjectBinding("dropbox", "project-a")
    ).toBeNull();
    expect(
      await loadCloudProjectBinding("google-drive", "project-b")
    ).toBeNull();

    await deleteCloudProjectBinding("google-drive", "project-a");
    expect(
      await loadCloudProjectBinding("google-drive", "project-a")
    ).toBeNull();
  });

  it("clears every cloud provider binding for one deleted project", async () => {
    const createBinding = (
      providerId: "google-drive" | "dropbox",
      projectId: string
    ) => ({
      version: 1 as const,
      projectId,
      providerId,
      remoteRootId: `${providerId}-${projectId}`,
      remoteRootName: "Writing",
      connectedAt: "2026-07-10T12:00:00.000Z",
      lastSyncedAt: null,
      syncMode: "manual" as const,
      syncIntervalMinutes: 15,
      worktreeSignatures: {}
    });
    await saveCloudProjectBinding(
      createBinding("google-drive", "project-a")
    );
    await saveCloudProjectBinding(
      createBinding("dropbox", "project-a")
    );
    await saveCloudProjectBinding(
      createBinding("google-drive", "project-b")
    );

    await deleteCloudProjectBindings("project-a");

    expect(
      await loadCloudProjectBinding("google-drive", "project-a")
    ).toBeNull();
    expect(
      await loadCloudProjectBinding("dropbox", "project-a")
    ).toBeNull();
    expect(
      await loadCloudProjectBinding("google-drive", "project-b")
    ).not.toBeNull();
  });
});
