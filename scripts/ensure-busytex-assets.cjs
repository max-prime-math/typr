#!/usr/bin/env node

const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const tar = require("tar");

const projectRoot = path.resolve(__dirname, "..");
const publicCoreDir = path.join(projectRoot, "public", "core");
const busyTexDir = path.join(publicCoreDir, "busytex");
const busyTexArchiveUrl =
  "https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.1.1/busytex-assets.tar.gz";
const busyTexArchiveSha256 = "0950d29a08c0f6000e54ca8279fe365f8013179f595638ed3edeef8c30ea0567";
const requiredFiles = [
  "busytex_pipeline.js",
  "busytex.js",
  "busytex.wasm",
  "texlive-basic.js",
  "texlive-recommended.js",
  "texlive-extra.js"
];

function getMissingAssetFiles() {
  return requiredFiles.filter((fileName) => {
    const filePath = path.join(busyTexDir, fileName);

    try {
      return !fs.statSync(filePath).isFile();
    } catch {
      return true;
    }
  });
}

async function downloadBusyTexAssets() {
  const archivePath = path.join(publicCoreDir, "busytex-assets-v1.1.1.tar.gz");
  fs.mkdirSync(publicCoreDir, { recursive: true });
  fs.rmSync(archivePath, { force: true });
  const response = await fetch(busyTexArchiveUrl, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`BusyTeX asset download failed with HTTP ${response.status}.`);
  }
  const hash = createHash("sha256");
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      hashingStream,
      fs.createWriteStream(archivePath, { flags: "wx" })
    );
    if (hash.digest("hex") !== busyTexArchiveSha256) {
      throw new Error("BusyTeX asset archive checksum did not match the pinned SHA-256.");
    }
    let unsafeEntry = null;
    await tar.t({
      file: archivePath,
      strict: true,
      onentry(entry) {
        const segments = entry.path.split("/").filter(Boolean);
        if ((entry.type !== "File" && entry.type !== "Directory") ||
            segments[0] !== "busytex" || segments.some((segment) => segment === "." || segment === "..") ||
            path.posix.isAbsolute(entry.path) || entry.path.includes("\\") || entry.path.includes("\0")) {
          unsafeEntry = entry.path;
        }
      }
    });
    if (unsafeEntry) throw new Error(`BusyTeX archive contains an unsafe entry: ${unsafeEntry}`);
    await tar.x({ file: archivePath, cwd: publicCoreDir, strict: true });
  } finally {
    fs.rmSync(archivePath, { force: true });
  }
}
function optimizeBusyTexPipelineMemory() {
  const pipelinePath = path.join(busyTexDir, "busytex_pipeline.js");
  const legacyValidationThrow = "            throw new Error(`Memory header size [${this.mem_header_size}] must be divisible by 4, and remaining memory must be zero`);";
  const originalValidation = [
    "if (!(this.mem_header_size % 4 == 0 && initialized_module.HEAP32.slice(this.mem_header_size / 4).every(x => x == 0)))",
    legacyValidationThrow
  ].join("\n");
  const optimizedValidation = [
    "if (this.mem_header_size % 4 != 0)",
    "    throw new Error(`Memory header size [${this.mem_header_size}] must be divisible by 4`);",
    "for (let index = this.mem_header_size; index < initialized_module.HEAPU8.length; index += 1) {",
    "    if (initialized_module.HEAPU8[index] != 0)",
    "        throw new Error(`Memory after header [${this.mem_header_size}] must be zero`);",
    "}"
  ].join("\n        ");
  const optimizedValidationMarker = "Memory after header [${this.mem_header_size}] must be zero";
  const optimizedValidationPattern = /if \(this\.mem_header_size % 4 != 0\)[\s\S]*?throw new Error\(`Memory after header \[\$\{this\.mem_header_size\}\] must be zero`\);\n\s*\}/;
  const originalSnapshot = "Uint8Array.from(Module.HEAPU8.slice(0, this.mem_header_size))";
  const optimizedSnapshot = "Module.HEAPU8.slice(0, this.mem_header_size)";
  const conditionalSnapshot = "skip_memory_restore ? null : Module.HEAPU8.slice(0, this.mem_header_size)";
  const originalCompileSignature =
    "async compile(files, main_tex_path, bibtex, makeindex = null, rerun = null, verbose, driver, data_packages_js = [], remote_endpoint = '')";
  const optimizedCompileSignature =
    "async compile(files, main_tex_path, bibtex, makeindex = null, rerun = null, verbose, driver, data_packages_js = [], remote_endpoint = '', skip_memory_restore = false)";
  const originalRestore = "Module.HEAPU8.fill(0);\n        Module.HEAPU8.set(mem_header);";
  const conditionalRestore = "if (mem_header) {\n            Module.HEAPU8.fill(0);\n            Module.HEAPU8.set(mem_header);\n        }";
  let source = fs.readFileSync(pipelinePath, "utf8");
  let changed = false;

  if (source.includes(originalValidation)) {
    source = source.replace(originalValidation, optimizedValidation);
    changed = true;
  } else if (source.includes(optimizedValidationMarker)) {
    if (source.includes(`\n${legacyValidationThrow}`)) {
      source = source.replace(`\n${legacyValidationThrow}`, "");
      changed = true;
    }
  } else {
    throw new Error("BusyTeX memory validation pattern changed; update the Typr optimization patch.");
  }

  const currentOptimizedValidation = source.match(optimizedValidationPattern)?.[0];
  if (!currentOptimizedValidation) {
    throw new Error("BusyTeX optimized validation block is unavailable after patching.");
  }
  if (currentOptimizedValidation !== optimizedValidation) {
    source = source.replace(optimizedValidationPattern, optimizedValidation);
    changed = true;
  }

  if (source.includes(originalSnapshot)) {
    source = source.replace(originalSnapshot, conditionalSnapshot);
    changed = true;
  } else if (source.includes(optimizedSnapshot) && !source.includes(conditionalSnapshot)) {
    source = source.replace(optimizedSnapshot, conditionalSnapshot);
    changed = true;
  } else if (!source.includes(conditionalSnapshot)) {
    throw new Error("BusyTeX memory snapshot pattern changed; update the Typr optimization patch.");
  }

  if (source.includes(originalCompileSignature)) {
    source = source.replace(originalCompileSignature, optimizedCompileSignature);
    changed = true;
  } else if (!source.includes(optimizedCompileSignature)) {
    throw new Error("BusyTeX compile signature changed; update the Typr optimization patch.");
  }

  if (source.includes(originalRestore)) {
    source = source.replace(originalRestore, conditionalRestore);
    changed = true;
  } else if (!source.includes(conditionalRestore)) {
    throw new Error("BusyTeX memory restore pattern changed; update the Typr optimization patch.");
  }

  if (changed) {
    fs.writeFileSync(pipelinePath, source);
    console.log("Applied Firefox-safe BusyTeX memory optimizations.");
  }
}

function enableBusyTexSyncTexDiscovery() {
  const pipelinePath = path.join(busyTexDir, "busytex_pipeline.js");
  const readBytesDeclaration =
    "        this.read_all_bytes = (FS, pdf_path) => FS.analyzePath(pdf_path).exists ? FS.readFile(pdf_path, { encoding: 'binary' }) : new Uint8Array();";
  const discoveryHelpers = [
    readBytesDeclaration,
    "        this.find_matching_files = (FS, PATH, root, predicate) => {",
    "            const results = [];",
    "            const walk = dir => {",
    "                if (!FS.analyzePath(dir).exists) return;",
    "                for (const name of FS.readdir(dir)) {",
    "                    if (name === '.' || name === '..') continue;",
    "                    const full = PATH.join(dir, name);",
    "                    const stat = FS.stat(full);",
    "                    if (FS.isDir(stat.mode)) {",
    "                        walk(full);",
    "                    } else if (predicate(full, name)) {",
    "                        results.push({ path: full.slice(root.length + 1), size: this.read_all_bytes(FS, full).length });",
    "                    }",
    "                }",
    "            };",
    "            walk(root);",
    "            return results;",
    "        };",
    "        this.find_first_bytes = (FS, PATH, root, predicate) => {",
    "            const walk = dir => {",
    "                if (!FS.analyzePath(dir).exists) return null;",
    "                for (const name of FS.readdir(dir)) {",
    "                    if (name === '.' || name === '..') continue;",
    "                    const full = PATH.join(dir, name);",
    "                    const stat = FS.stat(full);",
    "                    if (FS.isDir(stat.mode)) {",
    "                        const nested = walk(full);",
    "                        if (nested) return nested;",
    "                    } else if (predicate(full, name)) {",
    "                        const bytes = this.read_all_bytes(FS, full);",
    "                        if (bytes && bytes.length > 0) return bytes;",
    "                    }",
    "                }",
    "                return null;",
    "            };",
    "            return walk(root) || new Uint8Array();",
    "        };"
  ].join("\n");
  const originalOutputPaths = [
    "        const [xdv_path, pdf_path, log_path, aux_path, blg_path, bbl_path, idx_path, ind_path, ilg_path] =",
    "            ['.xdv', '.pdf', '.log', '.aux', '.blg', '.bbl', '.idx', '.ind', '.ilg'].map(ext => tex_path.replace('.tex', ext));"
  ].join("\n");
  const discoveredOutputPaths = [
    "        const output_base_path = tex_path.replace(/\\.(tex|ltx|latex)$/i, '');",
    "        const [xdv_path, pdf_path, log_path, aux_path, blg_path, bbl_path, idx_path, ind_path, ilg_path] =",
    "            ['.xdv', '.pdf', '.log', '.aux', '.blg', '.bbl', '.idx', '.ind', '.ilg'].map(ext => output_base_path + ext);"
  ].join("\n");
  const originalSyncTex =
    "        const synctex = exit_code == 0 ? this.read_all_bytes(FS, tex_path.replace('.tex', '.synctex.gz')) : null;";
  const discoveredSyncTex = [
    "        const synctex_path = output_base_path + '.synctex.gz';",
    "        const synctex_files = exit_code == 0 ? this.find_matching_files(FS, PATH, this.project_dir, (_full, name) => name.toLowerCase().includes('synctex')) : [];",
    "        const synctex = exit_code == 0 ? (",
    "            this.read_all_bytes(FS, synctex_path).length > 0",
    "                ? this.read_all_bytes(FS, synctex_path)",
    "                : this.find_first_bytes(FS, PATH, this.project_dir, (_full, name) => name.endsWith('.synctex.gz'))",
    "        ) : null;"
  ].join("\n");
  const originalReturn =
    "        return { pdf: pdf, synctex: synctex, log: logcat, exit_code: exit_code, logs: logs };";
  const discoveredReturn =
    "        return { pdf: pdf, synctex: synctex, synctex_files: synctex_files, log: logcat, exit_code: exit_code, logs: logs };";
  let source = fs.readFileSync(pipelinePath, "utf8");
  let changed = false;

  if (!source.includes(discoveryHelpers)) {
    if (!source.includes(readBytesDeclaration)) {
      throw new Error("BusyTeX file-reading helper pattern changed; update the Typr SyncTeX patch.");
    }
    source = source.replace(readBytesDeclaration, discoveryHelpers);
    changed = true;
  }
  if (!source.includes(discoveredOutputPaths)) {
    if (!source.includes(originalOutputPaths)) {
      throw new Error("BusyTeX output-path pattern changed; update the Typr SyncTeX patch.");
    }
    source = source.replace(originalOutputPaths, discoveredOutputPaths);
    changed = true;
  }
  if (!source.includes(discoveredSyncTex)) {
    if (!source.includes(originalSyncTex)) {
      throw new Error("BusyTeX SyncTeX result pattern changed; update the Typr SyncTeX patch.");
    }
    source = source.replace(originalSyncTex, discoveredSyncTex);
    changed = true;
  }
  if (!source.includes(discoveredReturn)) {
    if (!source.includes(originalReturn)) {
      throw new Error("BusyTeX result pattern changed; update the Typr SyncTeX patch.");
    }
    source = source.replace(originalReturn, discoveredReturn);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(pipelinePath, source);
    console.log("Applied BusyTeX SyncTeX discovery support.");
  }
}


function optimizeBusyTexDataPackageMemory() {
  const packageFileNames = ["texlive-basic.js", "texlive-recommended.js", "texlive-extra.js"];
  const isNodeDeclaration =
    "    var isNode = globalThis.process && globalThis.process.versions && globalThis.process.versions.node && globalThis.process.type != 'renderer';";
  const lowMemoryDeclaration =
    "    var isLowMemoryBrowser = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile|Tablet|Firefox|FxiOS/i.test(navigator.userAgent);";
  const responseMarker = "        if (!response.ok) {";
  const directBufferBlock = [
    "        if (isLowMemoryBrowser) {",
    "          return response.arrayBuffer();",
    "        }",
    "",
    responseMarker
  ].join("\n");
  const preloadResultsMarker =
    "      if (!Module['preloadResults']) Module['preloadResults'] = {};";
  const skipCacheBlock = [
    preloadResultsMarker,
    "",
    "      if (isLowMemoryBrowser) {",
    "        processPackageData(await fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE));",
    "        return;",
    "      }"
  ].join("\n");
  let changedFiles = 0;

  for (const fileName of packageFileNames) {
    const packagePath = path.join(busyTexDir, fileName);
    let packageSource = fs.readFileSync(packagePath, "utf8");
    let changed = false;

    if (!packageSource.includes(lowMemoryDeclaration)) {
      if (!packageSource.includes(isNodeDeclaration)) {
        throw new Error(`BusyTeX data loader environment pattern changed in ${fileName}.`);
      }
      packageSource = packageSource.replace(
        isNodeDeclaration,
        `${isNodeDeclaration}\n${lowMemoryDeclaration}`
      );
      changed = true;
    }

    if (!packageSource.includes(directBufferBlock)) {
      if (!packageSource.includes(responseMarker)) {
        throw new Error(`BusyTeX data response pattern changed in ${fileName}.`);
      }
      packageSource = packageSource.replace(responseMarker, directBufferBlock);
      changed = true;
    }

    if (!packageSource.includes(skipCacheBlock)) {
      if (!packageSource.includes(preloadResultsMarker)) {
        throw new Error(`BusyTeX data cache pattern changed in ${fileName}.`);
      }
      packageSource = packageSource.replace(preloadResultsMarker, skipCacheBlock);
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(packagePath, packageSource);
      changedFiles += 1;
    }
  }

  if (changedFiles > 0) {
    console.log("Applied low-memory BusyTeX data loader optimizations.");
  }
}


async function main() {
  if (
    process.env.TYPR_EXTERNAL_COMPILER_ASSETS === "1" ||
    process.env.VITE_TYPR_COMPILER_ASSET_BASE_URL?.trim()
  ) {
    console.log("External compiler assets enabled; skipping local BusyTeX preparation.");
    return;
  }

  let missingFiles = getMissingAssetFiles();

  if (missingFiles.length === 0) {
    optimizeBusyTexPipelineMemory();
    enableBusyTexSyncTexDiscovery();
    optimizeBusyTexDataPackageMemory();
    console.log("BusyTeX assets are ready.");
    return;
  }

  if (fs.existsSync(busyTexDir) && fs.readdirSync(busyTexDir).length > 0) {
    console.error("BusyTeX assets are incomplete in public/core/busytex.");
    console.error(`Missing: ${missingFiles.join(", ")}`);
    console.error("Remove public/core/busytex, then run npm run busytex:assets again.");
    process.exit(1);
  }

  console.log("BusyTeX assets are missing; downloading them now.");
  await downloadBusyTexAssets();

  missingFiles = getMissingAssetFiles();

  if (missingFiles.length > 0) {
    console.error("BusyTeX asset download finished, but required files are still missing.");
    console.error(`Missing: ${missingFiles.join(", ")}`);
    process.exit(1);
  }

  optimizeBusyTexPipelineMemory();
  enableBusyTexSyncTexDiscovery();
  optimizeBusyTexDataPackageMemory();
}

main().catch((error) => {
  console.error("Failed to prepare BusyTeX assets.");
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
