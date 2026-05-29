import { MemoryAccessModel } from "@myriaddreamin/typst.ts/dist/esm/fs/index.mjs";
import { openDB } from "idb";
import {
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

const DATABASE_NAME = "wrytr-typst-packages";
const DATABASE_VERSION = 1;
const STORE_NAME = "packages";

const packageMemoryCache = new Map<string, Uint8Array>();
const pendingPackageLoads = new Map<string, Promise<Uint8Array>>();
const packageDependencyCache = new Map<string, TypstPackageReference[]>();
const packageAccessModel = new MemoryAccessModel();
const packageRegistryRoot = "/@memory/typst-packages";
const textDecoder = new TextDecoder();

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
  const database = await getDatabase();
  return (await database.get(STORE_NAME, key)) ?? null;
}

async function savePackageToCache(key: string, data: Uint8Array): Promise<void> {
  const database = await getDatabase();
  await database.put(STORE_NAME, data, key);
}

export async function ensureTypstPackageReferences(
  references: TypstPackageReference[]
): Promise<void> {
  const seen = new Set<string>();
  await Promise.all(
    references
      .filter((reference) => reference.namespace === "preview")
      .map((reference) => ensureTypstPackage(reference, seen))
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
  seen: Set<string>
): Promise<Uint8Array> {
  const key = reference.key;

  if (seen.has(key)) {
    const existing = packageMemoryCache.get(key);
    if (existing) {
      return existing;
    }
  }

  seen.add(key);
  const cached = packageMemoryCache.get(key);

  if (cached) {
    await ensurePackageDependencies(reference, cached, seen);
    return cached;
  }

  const inFlight = pendingPackageLoads.get(key);

  if (inFlight) {
    return inFlight;
  }

  const loadPromise = (async () => {
    const diskCached = await readPackageFromCache(key);

    if (diskCached) {
      packageMemoryCache.set(key, diskCached);
      await ensurePackageDependencies(reference, diskCached, seen);
      return diskCached;
    }

    const response = await fetch(getTypstPackageUrl(reference));

    if (!response.ok) {
      throw new Error(`Failed to download Typst package ${key}: ${response.status} ${response.statusText}`);
    }

    const data = new Uint8Array(await response.arrayBuffer());
    packageMemoryCache.set(key, data);
    await savePackageToCache(key, data);
    await ensurePackageDependencies(reference, data, seen);
    return data;
  })();

  pendingPackageLoads.set(key, loadPromise);

  try {
    return await loadPromise;
  } finally {
    pendingPackageLoads.delete(key);
  }
}

async function ensurePackageDependencies(
  reference: TypstPackageReference,
  data: Uint8Array,
  seen: Set<string>
): Promise<void> {
  const dependencies = await getPackageDependencies(reference, data);

  await Promise.all(
    dependencies.map((dependency) => ensureTypstPackage(dependency, seen))
  );
}

async function getPackageDependencies(
  reference: TypstPackageReference,
  data: Uint8Array
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
  packageDependencyCache.set(reference.key, resolvedDependencies);
  return resolvedDependencies;
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
