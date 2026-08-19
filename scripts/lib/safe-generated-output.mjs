import { lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function assertSafeGeneratedOutputPath(target, label = "generated output") {
  const resolved = path.resolve(target);
  const temporaryRoot = path.resolve(os.tmpdir());
  const relative = path.relative(temporaryRoot, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of ${temporaryRoot}.`);
  }

  let cursor = temporaryRoot;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) {
        throw new Error(`${label} must not contain a symbolic-link ancestor.`);
      }
      if (cursor !== resolved && !metadata.isDirectory()) {
        throw new Error(`${label} has a non-directory ancestor.`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }

  return resolved;
}
