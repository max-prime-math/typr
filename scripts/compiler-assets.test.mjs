import { describe, expect, it } from "vitest";
import {
  contentTypeForCompilerAsset,
  createCompilerAssetManifest,
  createCompilerAssetReleaseId,
  isSafeCompilerAssetPath,
  serializeCompilerAssetManifest,
  TYPR_COMPILER_ASSET_REVISION,
  validateCompilerAssetManifest
} from "./lib/compiler-assets.mjs";
import { assertSafeGeneratedOutputPath } from "./lib/safe-generated-output.mjs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { verifyPublishedCompilerAssets } from "./verify-compiler-assets.mjs";

const HASH = "a".repeat(64);

describe("compiler asset manifests", () => {
  it("derives a deterministic immutable release ID", () => {
    expect(createCompilerAssetReleaseId({
      busyTexVersion: "0.4.1",
      typstVersion: "0.7.0-rc.2",
      contentDigest: HASH
    })).toBe(`busytex-0.4.1-typr.${TYPR_COMPILER_ASSET_REVISION}-typst-0.7.0-rc.2-sha256-${"a".repeat(24)}`);
  });

  it("serializes sorted release-relative file metadata deterministically", () => {
    const manifest = createCompilerAssetManifest({
      busyTexVersion: "1",
      typstVersion: "2",
      typrAssetRevision: 1,
      files: [{
        sourcePath: "/unused",
        path: "typst/compiler.wasm",
        size: 12,
        sha256: HASH,
        contentType: "application/wasm"
      }]
    });
    expect(serializeCompilerAssetManifest(manifest)).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });

  it("rejects traversal, absolute, duplicate, and malformed entries", () => {
    expect(isSafeCompilerAssetPath("core/busytex/worker.js")).toBe(true);
    for (const unsafe of ["../escape", "/absolute", "a\\b", "a//b", "a/./b", "a/../b", "a\0b"]) {
      expect(isSafeCompilerAssetPath(unsafe)).toBe(false);
    }
    const manifest = createCompilerAssetManifest({
      busyTexVersion: "1", typstVersion: "2", typrAssetRevision: 1,
      files: [{ sourcePath: "/unused", path: "same", size: 1, sha256: HASH, contentType: "application/octet-stream" }]
    });
    expect(() => validateCompilerAssetManifest({ ...manifest, files: [manifest.files[0], manifest.files[0]] }))
      .toThrow(/duplicate/u);
    expect(() => validateCompilerAssetManifest({ ...manifest, files: [{ ...manifest.files[0], size: -1 }] }))
      .toThrow(/invalid/u);
  });

  it("assigns browser-safe MIME types", () => {
    expect(contentTypeForCompilerAsset("compiler.wasm")).toBe("application/wasm");
    expect(contentTypeForCompilerAsset("worker.js")).toContain("application/javascript");
    expect(contentTypeForCompilerAsset("bundle.data")).toBe("application/octet-stream");
  });
});

describe("generated output safety", () => {
  it("allows task-specific directories below the operating-system temporary directory", async () => {
    await expect(assertSafeGeneratedOutputPath(path.join(os.tmpdir(), "typr-output-test")))
      .resolves.toBe(path.resolve(os.tmpdir(), "typr-output-test"));
  });

  it("rejects broad or non-temporary output targets", async () => {
    await expect(assertSafeGeneratedOutputPath(os.tmpdir())).rejects.toThrow(/child/u);
    await expect(assertSafeGeneratedOutputPath("/")).rejects.toThrow(/child/u);
    await expect(assertSafeGeneratedOutputPath(process.cwd())).rejects.toThrow(/child/u);
  });

  it("rejects a temporary output path whose existing parent is a symlink", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "typr-output-safety-"));
    try {
      await symlink(process.cwd(), path.join(root, "outside"), "dir");
      await expect(assertSafeGeneratedOutputPath(path.join(root, "outside", "generated")))
        .rejects.toThrow(/symbolic-link ancestor/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("public compiler asset verification", () => {
  it("verifies manifest bytes, immutable headers, object hash, and ranges", async () => {
    const payload = Buffer.alloc(32, 7);
    const manifest = {
      releaseId: "test-release",
      files: [{
        path: "compiler.wasm",
        size: payload.length,
        sha256: createHash("sha256").update(payload).digest("hex"),
        contentType: "application/wasm"
      }]
    };
    const lockText = "{\"releaseId\":\"test-release\"}\n";
    const fetchImpl = async (url, options = {}) => {
      expect(options.headers?.["Accept-Encoding"]).toBe("identity");
      const value = String(url);
      if (value.endsWith("manifest.json")) {
        return mockResponse(value, Buffer.from(lockText), "application/json; charset=utf-8");
      }
      if (options.headers?.Range) {
        return mockResponse(value, payload, "application/wasm", 206);
      }
      return mockResponse(value, payload, "application/wasm");
    };
    await expect(verifyPublishedCompilerAssets({
      baseUrl: "https://assets.example/",
      fetchImpl,
      lockText,
      manifest
    })).resolves.toBeUndefined();
  });

  it("rejects published bytes that do not match the lock", async () => {
    const expected = Buffer.alloc(32, 7);
    const published = Buffer.alloc(32, 8);
    const manifest = {
      releaseId: "test-release",
      files: [{
        path: "compiler.wasm",
        size: expected.length,
        sha256: createHash("sha256").update(expected).digest("hex"),
        contentType: "application/wasm"
      }]
    };
    const lockText = "{}\n";
    const fetchImpl = async (url) => String(url).endsWith("manifest.json")
      ? mockResponse(String(url), Buffer.from(lockText), "application/json; charset=utf-8")
      : mockResponse(String(url), published, "application/wasm");
    await expect(verifyPublishedCompilerAssets({
      baseUrl: "https://assets.example/",
      fetchImpl,
      lockText,
      manifest
    })).rejects.toThrow(/SHA-256/u);
  });
});

function mockResponse(url, body, contentType, status = 200) {
  return {
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    body: (async function* () { yield body; })(),
    headers: new Headers({
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": String(body.length),
      ...(status === 206 ? { "content-range": `bytes 0-31/${body.length}` } : {}),
      "content-type": contentType
    }),
    ok: status >= 200 && status < 300,
    status,
    text: async () => body.toString("utf8"),
    url
  };
}
