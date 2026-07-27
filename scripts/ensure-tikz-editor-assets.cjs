#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { unzipSync } = require("fflate");

const VERSION = "0.5.2";
const ARCHIVE_URL =
  `https://codeload.github.com/TeXlyre/tikz-editor-embed-mirror/zip/refs/tags/v${VERSION}`;
const ARCHIVE_SHA256 = "e98ca2311ccf9cd01b6f3990998ea745c33a03d678fa697e7cf6a071261b7821";
const ARCHIVE_ROOT = `tikz-editor-embed-mirror-${VERSION}`;
const projectRoot = path.resolve(__dirname, "..");
const targetDir = path.join(projectRoot, "public", "core", "tikz-editor");
const markerPath = path.join(targetDir, "typr-embed.json");

const UPSTREAM_LICENSE = `MIT License

Copyright (c) 2026 Dominik Peters

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function assetsAreReady() {
  if (!fs.existsSync(path.join(targetDir, "index.html")) || !fs.existsSync(markerPath)) {
    return false;
  }

  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    return marker.version === VERSION && marker.archiveSha256 === ARCHIVE_SHA256;
  } catch {
    return false;
  }
}

async function downloadArchive() {
  const response = await fetch(ARCHIVE_URL);
  if (!response.ok) {
    throw new Error(`TikZ editor download failed with HTTP ${response.status}.`);
  }

  const archive = new Uint8Array(await response.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(archive).digest("hex");

  if (checksum !== ARCHIVE_SHA256) {
    throw new Error(
      `TikZ editor archive checksum mismatch (expected ${ARCHIVE_SHA256}, received ${checksum}).`
    );
  }

  return archive;
}

function extractEditor(archive) {
  const entries = unzipSync(archive);
  const editorPrefix = `${ARCHIVE_ROOT}/tikz-editor/`;
  let extractedFiles = 0;

  fs.mkdirSync(targetDir, { recursive: true });

  for (const [archivePath, bytes] of Object.entries(entries)) {
    if (!archivePath.startsWith(editorPrefix) || archivePath.endsWith("/")) {
      continue;
    }

    const relativePath = archivePath.slice(editorPrefix.length);
    const outputPath = path.resolve(targetDir, relativePath);
    if (!outputPath.startsWith(`${path.resolve(targetDir)}${path.sep}`)) {
      throw new Error(`Unsafe path in TikZ editor archive: ${archivePath}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, bytes);
    extractedFiles += 1;
  }

  const mirrorLicense = entries[`${ARCHIVE_ROOT}/LICENSE`];
  if (!mirrorLicense || extractedFiles === 0) {
    throw new Error("TikZ editor archive did not contain the expected embed build.");
  }

  fs.writeFileSync(path.join(targetDir, "LICENSE.embed-mirror.txt"), mirrorLicense);
  fs.writeFileSync(path.join(targetDir, "LICENSE.tikz-editor.txt"), UPSTREAM_LICENSE);
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        name: "DominikPeters/tikz-editor",
        version: VERSION,
        embedMirror: "TeXlyre/tikz-editor-embed-mirror",
        archiveSha256: ARCHIVE_SHA256
      },
      null,
      2
    )}\n`
  );
}

async function main() {
  if (assetsAreReady()) {
    console.log(`TikZ editor assets v${VERSION} are ready.`);
    return;
  }

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error(
      "TikZ editor assets are incomplete. Remove public/core/tikz-editor, then run npm run tikz-editor:assets again."
    );
  }

  console.log(`Downloading TikZ editor embed v${VERSION}...`);
  extractEditor(await downloadArchive());

  if (!assetsAreReady()) {
    throw new Error("TikZ editor extraction finished without the required files.");
  }

  console.log(`TikZ editor assets v${VERSION} are ready.`);
}

main().catch((error) => {
  console.error("Failed to prepare TikZ editor assets.");
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
