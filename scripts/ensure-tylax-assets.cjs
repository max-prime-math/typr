#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const VERSION = "0.3.7";
const projectRoot = path.resolve(__dirname, "..");
const targetDir = path.join(projectRoot, "public", "core", "tylax");
const markerPath = path.join(targetDir, "typr-tylax.json");
const assets = [
  {
    fileName: "tylax.js",
    url: "https://convert.silkyai.cn/assets/tylax-B07YS4a1.js",
    sha256: "db89250b8efad16411260cdb914e8f71cfde9637757bbd9153699044dd66dcd5"
  },
  {
    fileName: "tylax_bg-COP4W6hL.wasm",
    url: "https://convert.silkyai.cn/assets/tylax_bg-COP4W6hL.wasm",
    sha256: "5980160c13be8700c97178b3d04804b951ddd0b43c090f4de1dfa33f353ba2ec"
  },
  {
    fileName: "LICENSE.tylax.txt",
    url: "https://raw.githubusercontent.com/scipenai/tylax/v0.3.7/LICENSE",
    sha256: "146af9a2ad4ef664ca3122983c21f9ae80090e51e1a65afac8e4a8e635084a8f"
  }
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assetsAreReady() {
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    if (marker.version !== VERSION) {
      return false;
    }

    return assets.every((asset) => {
      const bytes = fs.readFileSync(path.join(targetDir, asset.fileName));
      return sha256(bytes) === asset.sha256;
    });
  } catch {
    return false;
  }
}

async function downloadAsset(asset) {
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Tylax asset download failed with HTTP ${response.status}: ${asset.url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const checksum = sha256(bytes);
  if (checksum !== asset.sha256) {
    throw new Error(
      `Tylax asset checksum mismatch for ${asset.fileName} ` +
      `(expected ${asset.sha256}, received ${checksum}).`
    );
  }

  return { asset, bytes };
}

async function main() {
  if (assetsAreReady()) {
    console.log(`Tylax browser assets v${VERSION} are ready.`);
    return;
  }

  console.log(`Downloading pinned Tylax browser assets v${VERSION}...`);
  const downloads = await Promise.all(assets.map(downloadAsset));
  fs.mkdirSync(targetDir, { recursive: true });

  for (const { asset, bytes } of downloads) {
    fs.writeFileSync(path.join(targetDir, asset.fileName), bytes);
  }

  fs.writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        name: "scipenai/tylax",
        version: VERSION,
        sourceTag: `v${VERSION}`,
        browserDistribution: "https://convert.silkyai.cn/",
        assets: Object.fromEntries(
          assets.map((asset) => [asset.fileName, asset.sha256])
        )
      },
      null,
      2
    )}\n`
  );

  if (!assetsAreReady()) {
    throw new Error("Tylax asset preparation finished without the required verified files.");
  }

  console.log(`Tylax browser assets v${VERSION} are ready.`);
}

main().catch((error) => {
  console.error("Failed to prepare Tylax browser assets.");
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
