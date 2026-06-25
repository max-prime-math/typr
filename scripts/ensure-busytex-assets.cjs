#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { downloadAssets } = require("texlyre-busytex/scripts/download-assets.cjs");

const projectRoot = path.resolve(__dirname, "..");
const publicCoreDir = path.join(projectRoot, "public", "core");
const busyTexDir = path.join(publicCoreDir, "busytex");
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

async function main() {
  let missingFiles = getMissingAssetFiles();

  if (missingFiles.length === 0) {
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
  await downloadAssets(publicCoreDir);

  missingFiles = getMissingAssetFiles();

  if (missingFiles.length > 0) {
    console.error("BusyTeX asset download finished, but required files are still missing.");
    console.error(`Missing: ${missingFiles.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Failed to prepare BusyTeX assets.");
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
