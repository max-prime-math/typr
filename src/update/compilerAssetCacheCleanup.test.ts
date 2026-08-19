import { describe, expect, it, vi } from "vitest";
import {
  cleanupObsoleteCompilerAssetCaches,
  findObsoleteCompilerAssetCaches
} from "./compilerAssetCacheCleanup";

describe("compiler asset runtime cache cleanup", () => {
  it("removes prior releases without touching current, other channels, or unrelated caches", async () => {
    const names = [
      "typr-stable-old-compiler-assets",
      "typr-stable-old-busytex-assets",
      "typr-stable-current-compiler-assets",
      "typr-stable-current-busytex-assets",
      "typr-beta-old-compiler-assets",
      "typr-stable-tikz-editor-assets"
    ];
    expect(findObsoleteCompilerAssetCaches(names, "stable", "current")).toEqual([
      "typr-stable-old-compiler-assets",
      "typr-stable-old-busytex-assets"
    ]);
    const deleteCache = vi.fn(async () => true);
    const deleted = await cleanupObsoleteCompilerAssetCaches({
      keys: async () => names,
      delete: deleteCache
    }, "stable", "current");
    expect(deleted).toEqual([
      "typr-stable-old-compiler-assets",
      "typr-stable-old-busytex-assets"
    ]);
    expect(deleteCache).toHaveBeenCalledTimes(2);
  });
});
