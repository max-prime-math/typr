#!/usr/bin/env node

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectCompilerAssets,
  createCompilerAssetManifest,
  serializeCompilerAssetManifest
} from "./lib/compiler-assets.mjs";
import { assertSafeGeneratedOutputPath } from "./lib/safe-generated-output.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = path.join(projectRoot, "compiler-assets.lock.json");
const stageArgumentIndex = process.argv.indexOf("--stage");
const requestedStageRoot = stageArgumentIndex >= 0 && process.argv[stageArgumentIndex + 1]
  ? path.resolve(process.argv[stageArgumentIndex + 1])
  : null;
const updateLock = process.argv.includes("--update-lock");

async function main() {
  const stageRoot = requestedStageRoot
    ? await assertSafeGeneratedOutputPath(requestedStageRoot, "compiler asset stage directory")
    : null;
  const collection = await collectCompilerAssets(projectRoot);
  const manifest = createCompilerAssetManifest(collection);
  const serialized = serializeCompilerAssetManifest(manifest);
  if (updateLock) {
    await writeFile(lockPath, serialized);
    console.log(`Updated compiler-assets.lock.json for ${manifest.releaseId}.`);
  } else {
    const expected = await readFile(lockPath, "utf8");
    if (expected !== serialized) {
      throw new Error("Installed compiler assets do not match compiler-assets.lock.json. Run --update-lock only for an intentional asset release.");
    }
  }
  if (stageRoot) {
    await rm(stageRoot, { recursive: true, force: true });
    await mkdir(stageRoot, { recursive: true });
    for (const file of collection.files) {
      const destination = path.join(stageRoot, ...file.path.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(file.sourcePath, destination);
    }
    await writeFile(path.join(stageRoot, "manifest.json"), serialized);
  }
  const totalBytes = collection.files.reduce((sum, file) => sum + file.size, 0);
  console.log(`${stageRoot ? "Prepared" : "Verified"} ${collection.files.length} compiler assets (${(totalBytes / 1024 / 1024).toFixed(1)} MiB) as ${manifest.releaseId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
