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
  deleteProjectDeletionTombstone,
  deleteProjectGitFiles,
  listProjectGitFiles,
  loadProjectDeletionTombstones,
  readProjectGitFile,
  saveProjectDeletionTombstone,
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
});
