import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypstPackageReference } from "./typstPackages";

const indexedDbHarness = vi.hoisted(() => {
  const packages = new Map<IDBValidKey, unknown>();
  const database = {
    clear: vi.fn(async () => {
      packages.clear();
    }),
    delete: vi.fn(async (_storeName: string, key: IDBValidKey) => {
      packages.delete(key);
    }),
    get: vi.fn(async (_storeName: string, key: IDBValidKey) => packages.get(key)),
    getAllKeys: vi.fn(async () => [...packages.keys()]),
    put: vi.fn(async (_storeName: string, value: unknown, key: IDBValidKey) => {
      packages.set(key, value);
    })
  };

  return {
    database,
    openDB: vi.fn(async () => database),
    packages
  };
});

vi.mock("idb", () => ({
  openDB: indexedDbHarness.openDB
}));

import {
  clearTypstPackageCache,
  ensureTypstPackageReferences,
  getTypstPackageCacheSummary,
  removeTypstPackageFromCache
} from "./typstPackageRegistry";

const packageReference: TypstPackageReference = {
  namespace: "preview",
  name: "example",
  version: "1.0.0",
  key: "preview/example:1.0.0"
};

// A valid gzip stream containing an empty tar archive.
const emptyPackageArchive = new Uint8Array([
  0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
  0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

describe("Typst package cache invalidation", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    indexedDbHarness.packages.clear();
    await clearTypstPackageCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not let an earlier in-flight download undo a cache clear", async () => {
    const response = createDeferred<Response>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal("fetch", fetchMock);

    const firstCaller = ensureTypstPackageReferences([packageReference]);
    const concurrentCaller = ensureTypstPackageReferences([packageReference]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await clearTypstPackageCache();
    response.resolve(createPackageResponse());

    const [firstResult, concurrentResult] = await Promise.allSettled([
      firstCaller,
      concurrentCaller
    ]);
    expectInvalidated(firstResult);
    expectInvalidated(concurrentResult);
    await expect(getTypstPackageCacheSummary()).resolves.toEqual({ packages: [], totalBytes: 0 });
    expect(indexedDbHarness.database.put).not.toHaveBeenCalled();
  });

  it("does not let an earlier in-flight download restore a removed package", async () => {
    const staleResponse = createDeferred<Response>();
    const replacementResponse = createDeferred<Response>();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => staleResponse.promise)
      .mockImplementationOnce(() => replacementResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    const staleCaller = ensureTypstPackageReferences([packageReference]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await removeTypstPackageFromCache(packageReference);
    const replacementCaller = ensureTypstPackageReferences([packageReference]);

    staleResponse.resolve(createPackageResponse());
    replacementResponse.resolve(createPackageResponse());
    const [staleResult, replacementResult] = await Promise.allSettled([
      staleCaller,
      replacementCaller
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectInvalidated(staleResult);
    expect(replacementResult).toEqual({ status: "fulfilled", value: undefined });
    await expect(getTypstPackageCacheSummary()).resolves.toEqual({
      packages: [{ reference: packageReference, sizeBytes: emptyPackageArchive.byteLength }],
      totalBytes: emptyPackageArchive.byteLength
    });
    expect(indexedDbHarness.database.put).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent successful downloads and persists the package", async () => {
    const response = createDeferred<Response>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal("fetch", fetchMock);

    const firstCaller = ensureTypstPackageReferences([packageReference]);
    const concurrentCaller = ensureTypstPackageReferences([packageReference]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    response.resolve(createPackageResponse());

    await expect(Promise.all([firstCaller, concurrentCaller])).resolves.toEqual([
      undefined,
      undefined
    ]);
    await expect(getTypstPackageCacheSummary()).resolves.toEqual({
      packages: [{ reference: packageReference, sizeBytes: emptyPackageArchive.byteLength }],
      totalBytes: emptyPackageArchive.byteLength
    });
    expect(indexedDbHarness.database.put).toHaveBeenCalledTimes(1);
  });
});

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createPackageResponse(): Response {
  return new Response(emptyPackageArchive, {
    status: 200,
    statusText: "OK"
  });
}

function expectInvalidated(result: PromiseSettledResult<void>): void {
  expect(result.status).toBe("rejected");
  if (result.status === "rejected") {
    expect(result.reason).toBeInstanceOf(Error);
    expect((result.reason as Error).message).toMatch(/invalidated/i);
  }
}
