#!/usr/bin/env node

import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLOUDFLARE_PAGES_FILE_LIMIT = 25 * 1024 * 1024;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const externalBaseUrl = process.env.VITE_TYPR_COMPILER_ASSET_BASE_URL?.trim();
  const externalAssetsRequested =
    process.env.TYPR_EXTERNAL_COMPILER_ASSETS === "1" || Boolean(externalBaseUrl);

  if (!externalAssetsRequested) {
    return;
  }

  if (!externalBaseUrl) {
    throw new Error(
      "VITE_TYPR_COMPILER_ASSET_BASE_URL is required for an external compiler asset build."
    );
  }

  await rm(path.join(distDir, "core", "busytex"), { recursive: true, force: true });

  const emittedFiles = await listFiles(distDir);
  const emittedTypstWasm = emittedFiles.filter((filePath) =>
    /^typst_ts_web_compiler_bg-.*\.wasm$/.test(path.basename(filePath))
  );

  await Promise.all(emittedTypstWasm.map((filePath) => rm(filePath)));

  const deployFiles = await listFiles(distDir);
  const oversizedFiles = [];

  for (const filePath of deployFiles) {
    const fileStats = await stat(filePath);

    if (fileStats.size > CLOUDFLARE_PAGES_FILE_LIMIT) {
      oversizedFiles.push(
        `${path.relative(distDir, filePath)} (${(fileStats.size / 1024 / 1024).toFixed(1)} MiB)`
      );
    }
  }

  if (oversizedFiles.length > 0) {
    throw new Error(
      `Cloudflare Pages build contains files over 25 MiB:\n${oversizedFiles.join("\n")}`
    );
  }

  console.log(
    `External compiler asset build is ready (${externalBaseUrl}); all deploy files are at most 25 MiB.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
