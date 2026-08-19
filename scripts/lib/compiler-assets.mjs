import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const TYPR_COMPILER_ASSET_REVISION = 2;
export const BUSYTEX_ASSET_FILES = [
  "busytex.js", "busytex.wasm", "busytex_pipeline.js", "busytex_worker.js",
  "texlive-basic.data", "texlive-basic.js", "texlive-basic.js.providespackage.txt", "texlive-basic.profile", "texlive-basic.txt",
  "texlive-extra.data", "texlive-extra.js", "texlive-extra.js.providespackage.txt", "texlive-extra.profile", "texlive-extra.txt",
  "texlive-recommended.data", "texlive-recommended.js", "texlive-recommended.js.providespackage.txt", "texlive-recommended.txt",
  "versions.txt"
];

export function validateCompilerVersion(version) {
  if (typeof version !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version)) {
    throw new Error("Compiler package version is missing or unsafe.");
  }
  return version;
}

export function createCompilerAssetReleaseId({ busyTexVersion, typstVersion, contentDigest }) {
  validateCompilerVersion(busyTexVersion);
  validateCompilerVersion(typstVersion);
  if (typeof contentDigest !== "string" || !/^[a-f0-9]{64}$/.test(contentDigest)) {
    throw new Error("Compiler asset content digest is invalid.");
  }
  return `busytex-${busyTexVersion}-typr.${TYPR_COMPILER_ASSET_REVISION}-typst-${typstVersion}-sha256-${contentDigest.slice(0, 24)}`;
}

export async function resolveCompilerAssetVersions(projectRoot) {
  const [busyTexPackage, typstPackage] = await Promise.all([
    readPackage(path.join(projectRoot, "node_modules", "texlyre-busytex", "package.json")),
    readPackage(path.join(projectRoot, "node_modules", "@myriaddreamin", "typst-ts-web-compiler", "package.json"))
  ]);
  const busyTexVersion = validateCompilerVersion(busyTexPackage.version);
  const typstVersion = validateCompilerVersion(typstPackage.version);
  return { busyTexVersion, typstVersion };
}

export async function collectCompilerAssets(projectRoot) {
  const versions = await resolveCompilerAssetVersions(projectRoot);
  const busyTexRoot = path.join(projectRoot, "public", "core", "busytex");
  const files = [];
  const actualBusyTexFiles = (await listRegularFiles(busyTexRoot))
    .map((sourcePath) => path.relative(busyTexRoot, sourcePath).split(path.sep).join("/"));
  if (JSON.stringify(actualBusyTexFiles) !== JSON.stringify(BUSYTEX_ASSET_FILES)) {
    throw new Error("BusyTeX assets differ from the explicit release allowlist.");
  }
  for (const relativePath of BUSYTEX_ASSET_FILES) {
    files.push(await describeCompilerAsset(path.join(busyTexRoot, relativePath), `core/busytex/${relativePath}`));
  }
  files.push(await describeCompilerAsset(
    path.join(projectRoot, "node_modules", "@myriaddreamin", "typst-ts-web-compiler", "pkg", "typst_ts_web_compiler_bg.wasm"),
    "typst/typst_ts_web_compiler_bg.wasm"
  ));
  files.sort((left, right) => compareAssetPaths(left.path, right.path));
  assertUniqueCompilerAssetPaths(files.map((file) => file.path));
  return {
    ...versions,
    typrAssetRevision: TYPR_COMPILER_ASSET_REVISION,
    files
  };
}

export function createCompilerAssetManifest(collection) {
  const components = {
    busytex: {
      package: "texlyre-busytex",
      version: validateCompilerVersion(collection.busyTexVersion),
      assetTag: `assets-v${validateCompilerVersion(collection.busyTexVersion)}`,
      typrPatchRevision: TYPR_COMPILER_ASSET_REVISION
    },
    typstCompiler: {
      package: "@myriaddreamin/typst-ts-web-compiler",
      version: validateCompilerVersion(collection.typstVersion)
    }
  };
  const files = collection.files.map(({ path: assetPath, size, sha256, contentType }) => ({
    path: assetPath,
    size,
    sha256,
    contentType
  }));
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const contentDigest = computeCompilerAssetContentDigest({ components, files, totalSize });
  return {
    schemaVersion: 2,
    releaseId: createCompilerAssetReleaseId({
      busyTexVersion: components.busytex.version,
      typstVersion: components.typstCompiler.version,
      contentDigest
    }),
    contentDigest,
    components,
    totalSize,
    files
  };
}

export function serializeCompilerAssetManifest(manifest) {
  validateCompilerAssetManifest(manifest);
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateCompilerAssetManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
      manifest.schemaVersion !== 2 ||
      typeof manifest.releaseId !== "string" || !/^[a-zA-Z0-9._-]+$/.test(manifest.releaseId) ||
      typeof manifest.contentDigest !== "string" || !/^[a-f0-9]{64}$/.test(manifest.contentDigest) ||
      !manifest.components || typeof manifest.components !== "object" ||
      !manifest.components.busytex || !manifest.components.typstCompiler ||
      manifest.components.busytex.package !== "texlyre-busytex" ||
      manifest.components.typstCompiler.package !== "@myriaddreamin/typst-ts-web-compiler" ||
      manifest.components.busytex.typrPatchRevision !== TYPR_COMPILER_ASSET_REVISION ||
      manifest.components.busytex.assetTag !== `assets-v${manifest.components.busytex.version}` ||
      !Number.isSafeInteger(manifest.totalSize) || manifest.totalSize < 0 ||
      !Array.isArray(manifest.files)) {
    throw new Error("Compiler asset manifest has an invalid shape.");
  }
  const paths = [];
  for (const file of manifest.files) {
    if (!file || typeof file !== "object" || Array.isArray(file) ||
        !isSafeCompilerAssetPath(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 ||
        typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) ||
        typeof file.contentType !== "string" || !file.contentType) {
      throw new Error("Compiler asset manifest contains invalid file metadata.");
    }
    paths.push(file.path);
  }
  assertUniqueCompilerAssetPaths(paths);
  const sortedPaths = [...paths].sort(compareAssetPaths);
  if (JSON.stringify(paths) !== JSON.stringify(sortedPaths)) {
    throw new Error("Compiler asset manifest paths are not sorted.");
  }
  validateCompilerVersion(manifest.components.busytex.version);
  validateCompilerVersion(manifest.components.typstCompiler.version);
  const totalSize = manifest.files.reduce((sum, file) => sum + file.size, 0);
  const contentDigest = computeCompilerAssetContentDigest({
    components: manifest.components,
    files: manifest.files,
    totalSize
  });
  const releaseId = createCompilerAssetReleaseId({
    busyTexVersion: manifest.components.busytex.version,
    typstVersion: manifest.components.typstCompiler.version,
    contentDigest
  });
  if (manifest.totalSize !== totalSize || manifest.contentDigest !== contentDigest || manifest.releaseId !== releaseId) {
    throw new Error("Compiler asset manifest digest, size, or release ID is invalid.");
  }
  return manifest;
}

export function computeCompilerAssetContentDigest({ components, files, totalSize }) {
  const hash = createHash("sha256");
  hash.update("typr-compiler-assets-schema-v2\0");
  hash.update(`${components.busytex.package}\0${components.busytex.version}\0${components.busytex.assetTag}\0${components.busytex.typrPatchRevision}\n`);
  hash.update(`${components.typstCompiler.package}\0${components.typstCompiler.version}\n`);
  hash.update(`${totalSize}\n`);
  for (const file of files) hash.update(`${file.path}\0${file.size}\0${file.sha256}\0${file.contentType}\n`);
  return hash.digest("hex");
}

export function isSafeCompilerAssetPath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") &&
    !value.includes("\\") && !value.includes("\0") &&
    value.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

export function contentTypeForCompilerAsset(fileName) {
  switch (path.extname(fileName).toLowerCase()) {
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

async function readPackage(packagePath) {
  return JSON.parse(await readFile(packagePath, "utf8"));
}

async function listRegularFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareAssetPaths(left.name, right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Compiler assets must not contain symlinks: ${entryPath}`);
    if (entry.isDirectory()) files.push(...await listRegularFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
    else throw new Error(`Compiler assets must be regular files: ${entryPath}`);
  }
  return files;
}

async function describeCompilerAsset(sourcePath, assetPath) {
  if (!isSafeCompilerAssetPath(assetPath)) throw new Error(`Unsafe compiler asset path: ${assetPath}`);
  const fileStats = await lstat(sourcePath);
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw new Error(`Compiler asset must be a regular file: ${sourcePath}`);
  }
  return {
    sourcePath,
    path: assetPath,
    size: fileStats.size,
    sha256: await hashFile(sourcePath),
    contentType: contentTypeForCompilerAsset(sourcePath)
  };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function assertUniqueCompilerAssetPaths(paths) {
  if (new Set(paths).size !== paths.length) {
    throw new Error("Compiler asset manifest contains duplicate paths.");
  }
}

function compareAssetPaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
