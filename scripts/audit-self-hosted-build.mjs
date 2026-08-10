#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const lock = JSON.parse(await readFile(path.join(projectRoot, "compiler-assets.lock.json"), "utf8"));
const forbidden = [
  "google-drive-oauth-callback",
  ".google-drive-",
  "Google Drive",
  "typr.google-drive.oauth-pending.v2",
  "typr.google-drive.oauth-result.v2",
  "accounts.google.com",
  "apis.google.com/js/api.js",
  "www.googleapis.com/drive",
  "www.googleapis.com/upload/drive",
  "drive.google.com/drive/folders",
  "texlive2026.texlyre.org"
];

if (await exists(path.join(distRoot, "google-drive-oauth-callback.html"))) {
  throw new Error("Self-hosted output contains the Google Drive OAuth callback.");
}
if (await exists(path.join(distRoot, "core", "busytex"))) {
  throw new Error("Self-hosted app output contains a duplicate BusyTeX payload.");
}

const files = await listFiles(distRoot);
for (const filePath of files) {
  if (/typst_ts_web_compiler_bg-.*\.wasm$/u.test(path.basename(filePath))) {
    throw new Error("Self-hosted app output contains a duplicate Typst compiler WASM.");
  }
  if (!/\.(?:css|html|js|json|webmanifest)$/u.test(filePath)) continue;
  const content = await readFile(filePath, "utf8");
  for (const marker of forbidden) {
    if (content.includes(marker)) {
      throw new Error(`Self-hosted output contains forbidden marker ${marker} in ${path.relative(distRoot, filePath)}.`);
    }
  }
}

const appText = (await Promise.all(files
  .filter((filePath) => /\.(?:html|js)$/u.test(filePath))
  .map((filePath) => readFile(filePath, "utf8")))).join("\n");
const expectedPrefix = `/compiler-assets/${lock.releaseId}`;
if (!appText.includes(expectedPrefix)) {
  throw new Error(`Self-hosted output does not reference ${expectedPrefix}.`);
}

console.log(`Self-hosted build audit passed for ${lock.releaseId}.`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
