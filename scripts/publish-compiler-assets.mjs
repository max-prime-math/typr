#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const BUCKET_NAME = "typr-assets";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const TYPR_ASSET_REVISION = 1;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function contentTypeFor(fileName) {
  switch (path.extname(fileName)) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    default:
      return "application/octet-stream";
  }
}

function normalizeVersion(version) {
  return version.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function readPackageVersion(packagePath) {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  if (typeof packageJson.version !== "string" || !packageJson.version) {
    throw new Error(`Package version is missing from ${packagePath}.`);
  }

  return normalizeVersion(packageJson.version);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

async function describeFile(filePath, key) {
  const fileStats = await stat(filePath);

  return {
    filePath,
    key,
    size: fileStats.size,
    sha256: await hashFile(filePath),
    contentType: contentTypeFor(filePath)
  };
}

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

    if (existing.ContentLength === object.size && existingHash === object.sha256) {
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
  const busyTexPackagePath = path.join(
    projectRoot,
    "node_modules",
    "texlyre-busytex",
    "package.json"
  );
  const typstPackagePath = path.join(
    projectRoot,
    "node_modules",
    "@myriaddreamin",
    "typst-ts-web-compiler",
    "package.json"
  );
  const [busyTexVersion, typstVersion] = await Promise.all([
    readPackageVersion(busyTexPackagePath),
    readPackageVersion(typstPackagePath)
  ]);
  const releaseId =
    `busytex-${busyTexVersion}-typr.${TYPR_ASSET_REVISION}-typst-${typstVersion}`;
  const releasePrefix = `releases/${releaseId}`;
  const busyTexDirectory = path.join(projectRoot, "public", "core", "busytex");
  const busyTexFiles = await listFiles(busyTexDirectory);
  const typstWasmPath = path.join(
    projectRoot,
    "node_modules",
    "@myriaddreamin",
    "typst-ts-web-compiler",
    "pkg",
    "typst_ts_web_compiler_bg.wasm"
  );
  const objects = [];

  for (const filePath of busyTexFiles) {
    const relativePath = path.relative(busyTexDirectory, filePath).split(path.sep).join("/");
    objects.push(
      await describeFile(filePath, `${releasePrefix}/core/busytex/${relativePath}`)
    );
  }

  objects.push(
    await describeFile(
      typstWasmPath,
      `${releasePrefix}/typst/typst_ts_web_compiler_bg.wasm`
    )
  );

  const manifestBody = Buffer.from(
    `${JSON.stringify(
      {
        releaseId,
        busyTexVersion,
        typrAssetRevision: TYPR_ASSET_REVISION,
        typstVersion,
        files: objects.map(({ key, size, sha256 }) => ({ key, size, sha256 }))
      },
      null,
      2
    )}\n`
  );
  objects.push({
    key: `${releasePrefix}/manifest.json`,
    body: manifestBody,
    size: manifestBody.length,
    sha256: createHash("sha256").update(manifestBody).digest("hex"),
    contentType: contentTypeFor("manifest.json")
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
