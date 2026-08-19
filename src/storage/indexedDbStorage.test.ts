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
  let failTransactionPut: number | null = null;
  const database = {
    delete: vi.fn(async (storeName: string, key: IDBValidKey) => {
      getStore(storeName).delete(key);
    }),
    get: vi.fn(async (storeName: string, key: IDBValidKey) => getStore(storeName).get(key)),
    getAllKeys: vi.fn(async (storeName: string) => [...getStore(storeName).keys()]),
    put: vi.fn(async (storeName: string, value: unknown, key: IDBValidKey) => {
      getStore(storeName).set(key, value);
    }),
    transaction: vi.fn((storeName: string) => {
      const staged: Array<{ key: IDBValidKey; value: unknown }> = [];
      let putCount = 0;
      let failed = false;
      const store = {
        put: vi.fn((value: unknown, key: IDBValidKey) => {
          putCount += 1;
          if (failTransactionPut === putCount) {
            failed = true;
            return Promise.reject(new Error("injected transaction failure"));
          }
          staged.push({ key, value });
          return Promise.resolve(key);
        })
      };
      return {
        store,
        done: Promise.resolve().then(() => {
          if (failed) throw new Error("injected transaction abort");
          for (const entry of staged) getStore(storeName).set(entry.key, entry.value);
        })
      };
    })
  };

  return {
    database,
    openDB: vi.fn(async () => database),
    stores,
    setFailTransactionPut(value: number | null) {
      failTransactionPut = value;
    }
  };
});

vi.mock("idb", () => ({
  openDB: indexedDbHarness.openDB
}));

import {
  commitCompanionWorkspaceSync,
  deleteCloudProjectBinding,
  deleteCloudProjectBindings,
  deleteLocalFolderBinding,
  deleteProjectDeletionTombstone,
  deleteProjectGitFiles,
  listProjectGitFiles,
  loadCloudProjectBinding,
  loadCompanionApiKeySetting,
  loadCompanionBaseUrlSetting,
  loadProjectStorage,
  loadSnapshot,
  loadLocalFolderBinding,
  loadProjectDeletionTombstones,
  readProjectGitFile,
  saveCloudProjectBinding,
  saveCompanionApiKeySetting,
  saveCompanionBaseUrlSetting,
  saveProjectDeletionTombstone,
  saveLocalFolderBinding,
  writeProjectGitFile
} from "./indexedDbStorage";
import { createDefaultSnapshot } from "../app/appState";
import { createProjectStorageFromSnapshot } from "../project/projectState";

describe("IndexedDB project deletion storage", () => {
  beforeEach(() => {
    indexedDbHarness.stores.clear();
    indexedDbHarness.setFailTransactionPut(null);
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists the Companion URL independently of the workspace snapshot", async () => {
    expect(await loadCompanionBaseUrlSetting()).toBeNull();

    await saveCompanionBaseUrlSetting("https://companion.example.test/typr");

    expect(await loadCompanionBaseUrlSetting()).toBe(
      "https://companion.example.test/typr"
    );
    expect(await loadSnapshot()).toBeNull();
  });

  it("stores the Companion API key independently and deletes it when cleared", async () => {
    const apiKey = `typr_${"a".repeat(43)}`;
    expect(await loadCompanionApiKeySetting()).toBeNull();

    await saveCompanionApiKeySetting(` ${apiKey} `);
    expect(await loadCompanionApiKeySetting()).toBe(apiKey);

    await saveCompanionApiKeySetting("  ");
    expect(await loadCompanionApiKeySetting()).toBeNull();
    expect(await loadSnapshot()).toBeNull();
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

    await saveCloudProjectBinding({
      version: 2,
      projectId: "project-a",
      providerId: "typr-companion",
      remoteRootId: "mapped",
      remoteRootName: "Mapped workspace",
      connectedAt: "2026-08-09T12:00:00.000Z",
      lastSyncedAt: null,
      syncMode: "manual",
      syncIntervalMinutes: 15,
      worktreeSignatures: {},
      providerData: { baseUrl: "http://localhost:8484", workspaceId: "mapped" }
    });
    expect(await loadCloudProjectBinding("typr-companion", "project-a")).toMatchObject({
      remoteRootId: "mapped",
      providerData: { workspaceId: "mapped" }
    });
    await deleteCloudProjectBinding("typr-companion", "project-a");
  });

  it("atomically commits the synchronized project, snapshot, metadata, and Typr Server binding", async () => {
    const snapshot = createDefaultSnapshot();
    const storage = createProjectStorageFromSnapshot(snapshot);
    const binding = {
      version: 2 as const,
      projectId: storage.projects[0].id,
      providerId: "typr-companion" as const,
      remoteRootId: "mapped",
      remoteRootName: "Mapped workspace",
      connectedAt: "2026-08-10T00:00:00.000Z",
      lastSyncedAt: "2026-08-10T00:01:00.000Z",
      syncMode: "manual" as const,
      syncIntervalMinutes: 15,
      worktreeSignatures: {},
      providerData: { baseUrl: "http://localhost:8484", workspaceId: "mapped" }
    };

    await commitCompanionWorkspaceSync({ binding, projectStorage: storage, snapshot });
    expect(await loadProjectStorage()).toBe(storage);
    expect(await loadSnapshot()).toBe(snapshot);
    expect(await loadCloudProjectBinding("typr-companion", binding.projectId)).toBe(binding);

    const previousSnapshot = snapshot;
    const previousStorage = storage;
    const nextSnapshot = { ...snapshot, project: { ...snapshot.project, name: "New name" } };
    const nextStorage = { ...storage, selectedProjectId: storage.selectedProjectId };
    const nextBinding = { ...binding, lastSyncedAt: "2026-08-10T00:02:00.000Z" };
    indexedDbHarness.setFailTransactionPut(4);

    await expect(commitCompanionWorkspaceSync({
      binding: nextBinding,
      projectStorage: nextStorage,
      snapshot: nextSnapshot
    })).rejects.toThrow("injected transaction failure");
    expect(await loadProjectStorage()).toBe(previousStorage);
    expect(await loadSnapshot()).toBe(previousSnapshot);
    expect(await loadCloudProjectBinding("typr-companion", binding.projectId)).toBe(binding);
  });

  it("clears every cloud provider binding for one deleted project", async () => {
    const createBinding = (
      providerId: "google-drive" | "dropbox" | "typr-companion",
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
      createBinding("typr-companion", "project-a")
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
      await loadCloudProjectBinding("typr-companion", "project-a")
    ).toBeNull();
    expect(
      await loadCloudProjectBinding("google-drive", "project-b")
    ).not.toBeNull();
  });
});
