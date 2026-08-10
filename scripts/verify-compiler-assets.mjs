#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCompilerAssetManifest } from "./lib/compiler-assets.mjs";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function verifyPublishedCompilerAssets({
  baseUrl,
  fetchImpl = fetch,
  lockText,
  manifest,
  waitSeconds = 0
}) {
  const releaseBase = new URL(`releases/${manifest.releaseId}/`, ensureTrailingSlash(baseUrl));
  const expectedOrigin = releaseBase.origin;
  const manifestUrl = new URL("manifest.json", releaseBase);
  const deadline = Date.now() + waitSeconds * 1000;
  let manifestResponse;
  while (true) {
    manifestResponse = await fetchImpl(manifestUrl, {
      cache: "no-store",
      headers: { "Accept-Encoding": "identity" },
      redirect: "follow"
    });
    if (manifestResponse.ok) break;
    if (Date.now() >= deadline) {
      throw new Error(`Published compiler manifest returned HTTP ${manifestResponse.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assertExpectedOrigin(manifestResponse, expectedOrigin);
  assertPublishedHeaders(manifestResponse, Buffer.byteLength(lockText), "application/json; charset=utf-8");
  if (await manifestResponse.text() !== lockText) {
    throw new Error("Published compiler manifest bytes do not match compiler-assets.lock.json.");
  }

  const prefixes = new Map();
  for (const file of manifest.files) {
    const assetUrl = new URL(file.path, releaseBase);
    const response = await fetchImpl(assetUrl, {
      cache: "no-store",
      headers: { "Accept-Encoding": "identity" },
      redirect: "follow"
    });
    if (!response.ok || !response.body) {
      throw new Error(`Published compiler asset ${file.path} returned HTTP ${response.status}.`);
    }
    assertExpectedOrigin(response, expectedOrigin);
    assertPublishedHeaders(response, file.size, file.contentType);
    const hash = createHash("sha256");
    let size = 0;
    let prefix = Buffer.alloc(0);
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      hash.update(bytes);
      if (prefix.length < 32) {
        prefix = Buffer.concat([prefix, bytes.subarray(0, 32 - prefix.length)]);
      }
    }
    prefixes.set(file.path, prefix);
    if (size !== file.size || hash.digest("hex") !== file.sha256) {
      throw new Error(`Published compiler asset ${file.path} failed size or SHA-256 verification.`);
    }
    console.log(`Verified ${file.path} (${file.size} bytes).`);
  }

  const rangeTarget = manifest.files.find((file) => file.size >= 32);
  if (rangeTarget) {
    const rangeResponse = await fetchImpl(new URL(rangeTarget.path, releaseBase), {
      cache: "no-store",
      headers: { "Accept-Encoding": "identity", Range: "bytes=0-31" },
      redirect: "follow"
    });
    if (rangeResponse.status !== 206 || Number(rangeResponse.headers.get("content-length")) !== 32) {
      throw new Error(`Published compiler asset ${rangeTarget.path} does not support exact byte ranges.`);
    }
    assertExpectedOrigin(rangeResponse, expectedOrigin);
    assertPublishedHeaders(rangeResponse, 32, rangeTarget.contentType);
    if (rangeResponse.headers.get("content-range") !== `bytes 0-31/${rangeTarget.size}`) {
      throw new Error(`Published compiler asset ${rangeTarget.path} returned an invalid Content-Range.`);
    }
    const rangeBytes = Buffer.from(await rangeResponse.arrayBuffer());
    if (!rangeBytes.equals(prefixes.get(rangeTarget.path))) {
      throw new Error(`Published compiler asset ${rangeTarget.path} returned incorrect range bytes.`);
    }
  }
}

function assertExpectedOrigin(response, expectedOrigin) {
  if (new URL(response.url).origin !== expectedOrigin) {
    throw new Error(`Compiler asset redirected outside the pinned public origin: ${response.url}`);
  }
}

function assertPublishedHeaders(response, size, contentType) {
  const contentEncoding = response.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    throw new Error(`Published compiler object used unexpected content encoding at ${response.url}.`);
  }
  if (Number(response.headers.get("content-length")) !== size) {
    throw new Error(`Published compiler object has an unexpected Content-Length at ${response.url}.`);
  }
  if (response.headers.get("content-type")?.toLowerCase() !== contentType.toLowerCase()) {
    throw new Error(`Published compiler object has an unexpected Content-Type at ${response.url}.`);
  }
  if (response.headers.get("cache-control")?.toLowerCase() !== CACHE_CONTROL) {
    throw new Error(`Published compiler object is not immutable at ${response.url}.`);
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function main() {
  const waitIndex = process.argv.indexOf("--wait-seconds");
  const waitSeconds = waitIndex >= 0 ? Number(process.argv[waitIndex + 1]) : 0;
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 300) {
    throw new Error("--wait-seconds must be an integer from 0 through 300.");
  }
  const lockText = await readFile(path.join(projectRoot, "compiler-assets.lock.json"), "utf8");
  const manifest = validateCompilerAssetManifest(JSON.parse(lockText));
  const baseUrl = process.env.TYPR_COMPILER_ASSET_PUBLIC_BASE_URL?.trim() || "https://assets.typr.ca/";
  const parsedBase = new URL(baseUrl);
  if (parsedBase.protocol !== "https:" || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash) {
    throw new Error("Compiler asset public base URL must be a credential-free HTTPS URL.");
  }
  await verifyPublishedCompilerAssets({ baseUrl: parsedBase.href, lockText, manifest, waitSeconds });
  console.log(`Public compiler release ${manifest.releaseId} is byte-for-byte verified.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
