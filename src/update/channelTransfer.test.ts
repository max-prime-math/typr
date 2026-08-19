import { beforeEach, describe, expect, it, vi } from "vitest";

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
    close: vi.fn(),
    objectStoreNames: {
      contains: (storeName: string) => stores.has(storeName)
    },
    createObjectStore: vi.fn((storeName: string) => getStore(storeName)),
    transaction: vi.fn((storeName: string) => {
      const store = getStore(storeName);
      return {
        done: Promise.resolve(),
        store: {
          delete: vi.fn(async (key: IDBValidKey) => {
            store.delete(key);
          }),
          get: vi.fn(async (key: IDBValidKey) => store.get(key)),
          getAllKeys: vi.fn(async () => [...store.keys()]),
          put: vi.fn(async (value: unknown, key: IDBValidKey) => {
            store.set(key, value);
          })
        }
      };
    })
  };

  return {
    database,
    openDB: vi.fn(async () => database),
    stores,
    getStore
  };
});

vi.mock("idb", () => ({
  openDB: indexedDbHarness.openDB
}));

import {
  applyChannelTransferPayload,
  createChannelTransferPayload,
  type ChannelTransferPayload
} from "./channelTransfer";

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

describe("channel workspace transfer", () => {
  beforeEach(() => {
    indexedDbHarness.stores.clear();
    indexedDbHarness.getStore("app");
    indexedDbHarness.getStore("git-files");
    vi.clearAllMocks();
  });

  it("exports workspace data and settings without credentials or origin-bound handles", async () => {
    indexedDbHarness.getStore("app").set("snapshot", { version: 9 });
    indexedDbHarness.getStore("app").set("project-storage", { projects: ["project-a"] });
    indexedDbHarness.getStore("app").set("git-credentials", { github: "secret" });
    indexedDbHarness.getStore("app").set("github-config", { token: "legacy-secret" });
    indexedDbHarness.getStore("app").set("local-folder-binding:project-a", { handle: "origin-bound" });
    indexedDbHarness.getStore("git-files").set("project-a/.git/HEAD", new Uint8Array([1, 2]));
    const storage = createStorage({
      "typr.panel-layout": "split",
      "typr.auto-theme-selection": "dark",
      "typr.google-drive.oauth-result.v2": "oauth-secret",
      "typr.typst-preview-cache.v1": "generated-preview",
      unrelated: "leave-me"
    });

    const payload = await createChannelTransferPayload(storage);

    expect(payload.appRecords.map((record) => record.key)).toEqual([
      "snapshot",
      "project-storage"
    ]);
    expect(payload.gitFileRecords).toEqual([{
      key: "project-a/.git/HEAD",
      value: new Uint8Array([1, 2])
    }]);
    expect(payload.localStorageRecords).toEqual([
      ["typr.panel-layout", "split"],
      ["typr.auto-theme-selection", "dark"]
    ]);
  });

  it("replaces transferred data while preserving destination credentials", async () => {
    indexedDbHarness.getStore("app").set("snapshot", { project: "old" });
    indexedDbHarness.getStore("app").set("stale-transferable", true);
    indexedDbHarness.getStore("app").set("git-credentials", { github: "destination-secret" });
    indexedDbHarness.getStore("app").set("local-folder-binding:project-b", { handle: "destination" });
    indexedDbHarness.getStore("git-files").set("old/.git/HEAD", new Uint8Array([0]));
    const storage = createStorage({
      "typr.panel-layout": "old-layout",
      "typr.google-drive.oauth-result.v2": "destination-oauth"
    });
    const payload: ChannelTransferPayload = {
      version: 1,
      appRecords: [
        { key: "snapshot", value: { project: "new" } },
        { key: "git-credentials", value: { github: "injected-secret" } }
      ],
      gitFileRecords: [{ key: "new/.git/HEAD", value: new Uint8Array([1]) }],
      localStorageRecords: [
        ["typr.panel-layout", "new-layout"],
        ["typr.google-drive.oauth-result.v2", "injected-oauth"]
      ]
    };

    await applyChannelTransferPayload(payload, storage);

    expect([...indexedDbHarness.getStore("app")]).toEqual([
      ["git-credentials", { github: "destination-secret" }],
      ["local-folder-binding:project-b", { handle: "destination" }],
      ["snapshot", { project: "new" }]
    ]);
    expect([...indexedDbHarness.getStore("git-files")]).toEqual([
      ["new/.git/HEAD", new Uint8Array([1])]
    ]);
    expect(storage.getItem("typr.panel-layout")).toBe("new-layout");
    expect(storage.getItem("typr.google-drive.oauth-result.v2")).toBe("destination-oauth");
  });
});
