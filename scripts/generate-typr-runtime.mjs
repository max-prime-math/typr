#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { validateCompilerAssetManifest } from "./lib/compiler-assets.mjs";
import { assertSafeGeneratedOutputPath } from "./lib/safe-generated-output.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputIndex = process.argv.indexOf("--output");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error("--output is required.");
const outputRoot = await assertSafeGeneratedOutputPath(
  path.resolve(process.argv[outputIndex + 1]),
  "Typr runtime output directory"
);
const lockText = await readFile(path.join(projectRoot, "compiler-assets.lock.json"), "utf8");
const manifest = validateCompilerAssetManifest(JSON.parse(lockText));

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await Promise.all([
  writeFile(path.join(outputRoot, "compiler-assets-manifest.json"), lockText),
  writeFile(path.join(outputRoot, "compiler-assets.sha256"), [
    ...manifest.files.map((file) => `${file.sha256}  ${file.path}`),
    ""
  ].join("\n")),
  writeFile(path.join(outputRoot, "compiler-assets.paths"), [
    ...["manifest.json", ...manifest.files.map((file) => file.path)].sort(),
    ""
  ].join("\n")),
  writeFile(path.join(outputRoot, "compiler-assets.sizes"), [
    ...manifest.files.map((file) => `${file.size}  ${file.path}`),
    ""
  ].join("\n")),
  writeFile(path.join(outputRoot, "compiler-local.conf"), createLocalLocations(manifest)),
  writeFile(path.join(outputRoot, "compiler-r2.conf"), createR2Locations(manifest))
]);
console.log(`Generated fixed runtime routes for ${manifest.releaseId}.`);

function createLocalLocations(lock) {
  return [manifestLocation(lock, "local"), ...lock.files.map((file) => assetLocation(lock, file, "local")), ""].join("\n");
}

function createR2Locations(lock) {
  return [manifestLocation(lock, "r2"), ...lock.files.map((file) => assetLocation(lock, file, "r2")), ""].join("\n");
}

function manifestLocation(lock, mode) {
  return locationBlock(lock.releaseId, "manifest.json", "application/json; charset=utf-8", mode);
}

function assetLocation(lock, file, mode) {
  return locationBlock(lock.releaseId, file.path, file.contentType, mode);
}

function locationBlock(releaseId, assetPath, contentType, mode) {
  const urlPath = `/compiler-assets/${releaseId}/${assetPath}`;
  const backend = mode === "local"
    ? `alias /compiler-assets/${assetPath};\n    default_type "${contentType}";`
    : [
        "set $typr_r2_host assets.typr.ca;",
        `proxy_pass https://$typr_r2_host/releases/${releaseId}/${assetPath}?;`,
        "proxy_ssl_server_name on;",
        "proxy_ssl_name assets.typr.ca;",
        "proxy_ssl_verify on;",
        "proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;",
        "proxy_ssl_verify_depth 2;",
        "proxy_set_header Host assets.typr.ca;",
        "proxy_pass_request_headers off;",
        "proxy_pass_request_body off;",
        "proxy_set_header Content-Length \"\";",
        "proxy_set_header Range $http_range;",
        "proxy_set_header If-Range $http_if_range;",
        "proxy_connect_timeout 5s;",
        "proxy_send_timeout 5s;",
        "proxy_read_timeout 15s;",
        "proxy_buffering off;",
        "proxy_request_buffering off;",
        "proxy_hide_header Set-Cookie;",
        "proxy_hide_header Cache-Control;"
      ].join("\n    ");
  return `  location = ${urlPath} {\n    ${backend}\n    include /etc/nginx/snippets/typr-security.conf;\n    add_header Cache-Control $typr_immutable_cache_control always;\n  }`;
}
