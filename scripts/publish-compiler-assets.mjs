#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import {
  collectCompilerAssets,
  createCompilerAssetManifest,
  serializeCompilerAssetManifest
} from "./lib/compiler-assets.mjs";

const BUCKET_NAME = "typr-assets";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function isMissingObject(error) {
  return (
    error?.name === "NotFound" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

async function publishObject(client, object) {
  try {
    const existing = await client.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: object.key })
    );
    const existingHash = existing.Metadata?.sha256;

    if (existing.ContentLength === object.size && existingHash === object.sha256 &&
        existing.ContentType === object.contentType && existing.CacheControl === CACHE_CONTROL) {
      console.log(`Unchanged ${object.key}`);
      return "unchanged";
    }

    throw new Error(
      `Refusing to overwrite immutable object ${object.key}; publish a new versioned release instead.`
    );
  } catch (error) {
    if (!isMissingObject(error)) {
      throw error;
    }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: object.key,
      Body: object.body ?? createReadStream(object.filePath),
      ContentLength: object.size,
      ContentType: object.contentType,
      CacheControl: CACHE_CONTROL,
      Metadata: { sha256: object.sha256 }
    })
  );
  console.log(`Uploaded ${object.key} (${(object.size / 1024 / 1024).toFixed(1)} MiB)`);
  return "uploaded";
}

async function main() {
  const collection = await collectCompilerAssets(projectRoot);
  const manifest = createCompilerAssetManifest(collection);
  const releaseId = manifest.releaseId;
  const releasePrefix = `releases/${releaseId}`;
  const expectedManifest = await readFile(path.join(projectRoot, "compiler-assets.lock.json"), "utf8");
  const serializedManifest = serializeCompilerAssetManifest(manifest);
  if (expectedManifest !== serializedManifest) {
    throw new Error("Installed compiler assets do not match compiler-assets.lock.json.");
  }
  const objects = collection.files.map((file) => ({
    filePath: file.sourcePath,
    key: `${releasePrefix}/${file.path}`,
    size: file.size,
    sha256: file.sha256,
    contentType: file.contentType
  }));
  const manifestBody = Buffer.from(serializedManifest);
  objects.push({
    key: `${releasePrefix}/manifest.json`,
    body: manifestBody,
    size: manifestBody.length,
    sha256: createHash("sha256").update(manifestBody).digest("hex"),
    contentType: "application/json; charset=utf-8"
  });

  const totalBytes = objects.reduce((sum, object) => sum + object.size, 0);
  console.log(
    `${dryRun ? "Validated" : "Publishing"} ${objects.length} objects (${(
      totalBytes /
      1024 /
      1024
    ).toFixed(1)} MiB) as ${releaseId}.`
  );

  if (dryRun) {
    return;
  }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.R2_ENDPOINT?.trim();

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT are required."
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey }
  });
  let uploaded = 0;
  let unchanged = 0;

  for (const object of objects) {
    const result = await publishObject(client, object);
    uploaded += result === "uploaded" ? 1 : 0;
    unchanged += result === "unchanged" ? 1 : 0;
  }

  console.log(
    `Compiler release ${releaseId} is ready in ${BUCKET_NAME}: ${uploaded} uploaded, ${unchanged} unchanged.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
