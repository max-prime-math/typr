import { MemoryAccessModel } from "@myriaddreamin/typst.ts/dist/esm/fs/index.mjs";
import { openDB } from "idb";
import {
  formatTypstPackageReference,
  getTypstPackageUrl,
  type TypstPackageReference
} from "./typstPackages";
import { extractTypstPackageReferences } from "./typstPackages";

interface TypstPackageResolveSpec {
  namespace: string;
  name: string;
  version: string;
}

interface TypstPackageResolveContext {
  untar(data: Uint8Array, cb: (path: string, data: Uint8Array, mtime: number) => void): void;
}

interface TypstPackageRegistryHandle {
  am: {
    insertFile(path: string, data: Uint8Array, mtime: Date): void;
  };
  resolve(spec: TypstPackageResolveSpec, context: TypstPackageResolveContext): string | undefined;
}

export interface TypstPackageCacheEntry {
  reference: TypstPackageReference;
  sizeBytes: number;
}

export interface TypstPackageCacheSummary {
  packages: TypstPackageCacheEntry[];
  totalBytes: number;
}

export interface TypstPackageLoadStatus {
  reference: TypstPackageReference;
  state: "cached" | "downloading" | "failed";
  detail: string;
}

interface EnsureTypstPackageReferencesOptions {
  onStatus?: (status: TypstPackageLoadStatus) => void;
}

const DATABASE_NAME = "typr-typst-packages";
const DATABASE_VERSION = 1;
const STORE_NAME = "packages";

interface PackageLoadGeneration {
  cache: number;
  package: number;
}

interface PendingPackageLoad {
  generation: PackageLoadGeneration;
  promise: Promise<Uint8Array>;
}

const packageMemoryCache = new Map<string, Uint8Array>();
const pendingPackageLoads = new Map<string, PendingPackageLoad>();
const packageDependencyCache = new Map<string, TypstPackageReference[]>();
const packageGenerations = new Map<string, number>();
const packageAccessModel = new MemoryAccessModel();
const packageRegistryRoot = "/@memory/typst-packages";
const textDecoder = new TextDecoder();
let cacheGeneration = 0;
let cacheMutationTail = Promise.resolve();

async function getDatabase() {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    }
  });
}

async function readPackageFromCache(key: string): Promise<Uint8Array | null> {
  await cacheMutationTail;
  const database = await getDatabase();
  return (await database.get(STORE_NAME, key)) ?? null;
}

async function savePackageToCache(
  reference: TypstPackageReference,
  data: Uint8Array,
  generation: PackageLoadGeneration
): Promise<void> {
  await enqueueCacheMutation(async () => {
    assertPackageLoadCurrent(reference, generation);
    const database = await getDatabase();
    await database.put(STORE_NAME, data, reference.key);
  });
}

export async function getTypstPackageCacheSummary(): Promise<TypstPackageCacheSummary> {
  await cacheMutationTail;
  const database = await getDatabase();
  const keys = await database.getAllKeys(STORE_NAME);
  const packages: TypstPackageCacheEntry[] = [];
  let totalBytes = 0;

  for (const key of keys) {
    if (typeof key !== "string") {
      continue;
    }

    const data = await database.get(STORE_NAME, key);
    const reference = parseTypstPackageKey(key);

    if (!data || !reference) {
      continue;
    }

    const sizeBytes = data.byteLength;
    totalBytes += sizeBytes;
    packages.push({
      reference,
      sizeBytes
    });
  }

  packages.sort((left, right) => left.reference.key.localeCompare(right.reference.key));

  return {
    packages,
    totalBytes
  };
}

export async function removeTypstPackageFromCache(reference: TypstPackageReference): Promise<void> {
  invalidatePackageLoad(reference.key);
  packageMemoryCache.delete(reference.key);
  packageDependencyCache.delete(reference.key);
  await enqueueCacheMutation(async () => {
    const database = await getDatabase();
    await database.delete(STORE_NAME, reference.key);
  });
}

export async function clearTypstPackageCache(): Promise<void> {
  cacheGeneration += 1;
  packageGenerations.clear();
  pendingPackageLoads.clear();
  packageMemoryCache.clear();
  packageDependencyCache.clear();
  await enqueueCacheMutation(async () => {
    const database = await getDatabase();
    await database.clear(STORE_NAME);
  });
}

export async function ensureTypstPackageReferences(
  references: TypstPackageReference[],
  options: EnsureTypstPackageReferencesOptions = {}
): Promise<void> {
  const seen = new Set<string>();
  await Promise.all(
    references
      .filter((reference) => reference.namespace === "preview")
      .map((reference) => ensureTypstPackage(reference, seen, options))
  );
}

export function createTypstPackageRegistry(): TypstPackageRegistryHandle {
  const registry: TypstPackageRegistryHandle = {
    am: packageAccessModel,
    resolve(spec: TypstPackageResolveSpec, context: TypstPackageResolveContext): string | undefined {
      if (spec.namespace !== "preview") {
        return undefined;
      }

      const key = `${spec.namespace}/${spec.name}:${spec.version}`;
      const data = packageMemoryCache.get(key);

      if (!data) {
        return undefined;
      }

      const packageRoot = `${packageRegistryRoot}/${spec.namespace}/${spec.name}/${spec.version}`;
      context.untar(data, (path, fileData, mtime) => {
        registry.am.insertFile(`${packageRoot}/${path}`, fileData, new Date(mtime));
      });

      return packageRoot;
    }
  };

  return registry;
}

async function ensureTypstPackage(
  reference: TypstPackageReference,
  seen: Set<string>,
  options: EnsureTypstPackageReferencesOptions
): Promise<Uint8Array> {
  const key = reference.key;

  if (seen.has(key)) {
    const existing = packageMemoryCache.get(key);
    if (existing) {
      emitPackageLoadStatus(reference, "cached", options);
      return existing;
    }
  }

  seen.add(key);
  const generation = getPackageLoadGeneration(key);
  const cached = packageMemoryCache.get(key);

  if (cached) {
    emitPackageLoadStatus(reference, "cached", options);
    await ensurePackageDependencies(reference, cached, seen, options, generation);
    return cached;
  }

  const inFlight = pendingPackageLoads.get(key);

  if (inFlight && isPackageLoadCurrent(key, inFlight.generation)) {
    emitPackageLoadStatus(reference, "downloading", options);
    try {
      return await inFlight.promise;
    } catch (error) {
      emitPackageLoadStatus(reference, "failed", options, formatUnknownPackageError(reference, error));
      throw error;
    }
  }

  const loadPromise = (async () => {
    const diskCached = await readPackageFromCache(key);
    assertPackageLoadCurrent(reference, generation);

    if (diskCached) {
      packageMemoryCache.set(key, diskCached);
      emitPackageLoadStatus(reference, "cached", options);
      await ensurePackageDependencies(reference, diskCached, seen, options, generation);
      return diskCached;
    }

    emitPackageLoadStatus(reference, "downloading", options);

    const response = await fetch(getTypstPackageUrl(reference));
    assertPackageLoadCurrent(reference, generation);

    if (!response.ok) {
      throw new Error(`Failed to download Typst package ${key}: ${response.status} ${response.statusText}`);
    }

    const data = new Uint8Array(await response.arrayBuffer());
    assertPackageLoadCurrent(reference, generation);
    packageMemoryCache.set(key, data);
    await savePackageToCache(reference, data, generation);
    assertPackageLoadCurrent(reference, generation);
    await ensurePackageDependencies(reference, data, seen, options, generation);
    emitPackageLoadStatus(reference, "cached", options, `Downloaded package ${formatTypstPackageReference(reference)}`);
    return data;
  })();

  const pendingLoad: PendingPackageLoad = {
    generation,
    promise: loadPromise
  };
  pendingPackageLoads.set(key, pendingLoad);

  try {
    return await loadPromise;
  } catch (error) {
    emitPackageLoadStatus(reference, "failed", options, formatUnknownPackageError(reference, error));
    throw error;
  } finally {
    if (pendingPackageLoads.get(key) === pendingLoad) {
      pendingPackageLoads.delete(key);
    }
  }
}

async function ensurePackageDependencies(
  reference: TypstPackageReference,
  data: Uint8Array,
  seen: Set<string>,
  options: EnsureTypstPackageReferencesOptions,
  generation: PackageLoadGeneration
): Promise<void> {
  assertPackageLoadCurrent(reference, generation);
  const dependencies = await getPackageDependencies(reference, data, generation);
  assertPackageLoadCurrent(reference, generation);

  await Promise.all(
    dependencies.map((dependency) => ensureTypstPackage(dependency, seen, options))
  );
  assertPackageLoadCurrent(reference, generation);
}

function emitPackageLoadStatus(
  reference: TypstPackageReference,
  state: TypstPackageLoadStatus["state"],
  options: EnsureTypstPackageReferencesOptions,
  detail = defaultPackageStatusDetail(reference, state)
): void {
  options.onStatus?.({
    reference,
    state,
    detail
  });
}

function defaultPackageStatusDetail(
  reference: TypstPackageReference,
  state: TypstPackageLoadStatus["state"]
): string {
  const formattedReference = formatTypstPackageReference(reference);

  if (state === "cached") {
    return `Using cached package ${formattedReference}`;
  }

  if (state === "downloading") {
    return `Downloading package ${formattedReference}`;
  }

  return `Failed to download package ${formattedReference}`;
}

function formatUnknownPackageError(reference: TypstPackageReference, error: unknown): string {
  const formattedReference = formatTypstPackageReference(reference);
  const message = error instanceof Error ? error.message : "Unknown package download error.";
  return `${formattedReference}: ${message}`;
}

async function getPackageDependencies(
  reference: TypstPackageReference,
  data: Uint8Array,
  generation: PackageLoadGeneration
): Promise<TypstPackageReference[]> {
  const cached = packageDependencyCache.get(reference.key);

  if (cached) {
    return cached;
  }

  const archive = await decompressGzip(data);
  const dependencies = new Map<string, TypstPackageReference>();

  for (const entry of parseTarEntries(archive)) {
    if (!entry.path.endsWith(".typ")) {
      continue;
    }

    const source = textDecoder.decode(entry.data);
    for (const dependency of extractTypstPackageReferences(source)) {
      if (dependency.namespace !== "preview") {
        continue;
      }

      dependencies.set(dependency.key, dependency);
    }
  }

  const resolvedDependencies = [...dependencies.values()];
  assertPackageLoadCurrent(reference, generation);
  packageDependencyCache.set(reference.key, resolvedDependencies);
  return resolvedDependencies;
}

function getPackageLoadGeneration(key: string): PackageLoadGeneration {
  return {
    cache: cacheGeneration,
    package: packageGenerations.get(key) ?? 0
  };
}

function isPackageLoadCurrent(key: string, generation: PackageLoadGeneration): boolean {
  return (
    generation.cache === cacheGeneration &&
    generation.package === (packageGenerations.get(key) ?? 0)
  );
}

function assertPackageLoadCurrent(
  reference: TypstPackageReference,
  generation: PackageLoadGeneration
): void {
  if (!isPackageLoadCurrent(reference.key, generation)) {
    throw new Error(`Typst package ${formatTypstPackageReference(reference)} load was invalidated.`);
  }
}

function invalidatePackageLoad(key: string): void {
  packageGenerations.set(key, (packageGenerations.get(key) ?? 0) + 1);
  pendingPackageLoads.delete(key);
}

function enqueueCacheMutation(mutation: () => Promise<void>): Promise<void> {
  const result = cacheMutationTail.then(mutation);
  cacheMutationTail = result.catch(() => undefined);
  return result;
}

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  const decompressionStream = new DecompressionStream("gzip") as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(data));
      controller.close();
    }
  }).pipeThrough(decompressionStream);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseTarEntries(data: Uint8Array): Array<{ path: string; data: Uint8Array }> {
  const entries: Array<{ path: string; data: Uint8Array }> = [];
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    const name = readTarString(header, 0, 100);

    if (name.length === 0) {
      break;
    }

    const prefix = readTarString(header, 345, 155);
    const size = readTarOctal(header, 124, 12);
    const typeFlag = header[156];
    const path = prefix ? `${prefix}/${name}` : name;
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;

    if ((typeFlag === 0 || typeFlag === 48) && contentEnd <= data.length) {
      entries.push({
        path,
        data: data.slice(contentStart, contentEnd)
      });
    }

    offset = contentStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function readTarString(data: Uint8Array, offset: number, length: number): string {
  const slice = data.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return textDecoder.decode(end === -1 ? slice : slice.subarray(0, end)).trim();
}

function readTarOctal(data: Uint8Array, offset: number, length: number): number {
  const value = readTarString(data, offset, length).replace(/\0/g, "").trim();

  if (!value) {
    return 0;
  }

  return Number.parseInt(value, 8);
}

function parseTypstPackageKey(key: string): TypstPackageReference | null {
  const slashIndex = key.indexOf("/");
  const colonIndex = key.lastIndexOf(":");

  if (slashIndex <= 0 || colonIndex <= slashIndex + 1 || colonIndex >= key.length - 1) {
    return null;
  }

  return {
    namespace: key.slice(0, slashIndex),
    name: key.slice(slashIndex + 1, colonIndex),
    version: key.slice(colonIndex + 1),
    key
  };
}
