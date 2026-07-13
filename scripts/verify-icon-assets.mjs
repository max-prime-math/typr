import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const canonicalRoot = path.join(root, "src/icons");
const publicRoot = path.join(root, "public/icons");
const stablePublicIcons = new Map([
  ["icon-192.png", 192],
  ["icon-512.png", 512]
]);

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function readPngDimensions(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) {
    return undefined;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

const [canonicalFiles, publicFiles] = await Promise.all([
  listFiles(canonicalRoot),
  listFiles(publicRoot)
]);
const canonicalPaths = new Set(canonicalFiles);
const publicPaths = new Set(publicFiles);
const errors = [];

for (const publicPath of publicFiles) {
  if (canonicalPaths.has(publicPath)) {
    errors.push(`${publicPath}: duplicated in src/icons and public/icons`);
  }
  if (!stablePublicIcons.has(publicPath)) {
    errors.push(`${publicPath}: unexpected public icon; import UI icons from src/icons`);
  }
}

for (const [publicPath, expectedSize] of stablePublicIcons) {
  if (!publicPaths.has(publicPath)) {
    errors.push(`${publicPath}: missing stable public icon`);
    continue;
  }

  const dimensions = readPngDimensions(await readFile(path.join(publicRoot, publicPath)));
  if (!dimensions) {
    errors.push(`${publicPath}: expected a PNG file`);
  } else if (dimensions.width !== expectedSize || dimensions.height !== expectedSize) {
    errors.push(
      `${publicPath}: expected ${expectedSize}x${expectedSize}, got ${dimensions.width}x${dimensions.height}`
    );
  }
}

if (errors.length > 0) {
  console.error("Icon asset verification failed:");
  for (const error of errors.sort()) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Icon asset verification passed: ${canonicalFiles.length} canonical source assets, ${publicFiles.length} stable public assets.`
  );
}
