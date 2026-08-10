import { describe, expect, it } from "vitest";
import { resolveBusyTexBasePath } from "./compilerAssetUrls";

describe("resolveBusyTexBasePath", () => {
  it("uses the versioned same-origin self-hosted route", () => {
    expect(resolveBusyTexBasePath({
      selfHostedAssetBaseUrl: "/compiler-assets/release-sha256-123",
      externalAssetBaseUrl: "https://ignored.example.test",
      dev: false,
      moduleUrl: "http://typr.local/assets/app.js"
    })).toBe("/compiler-assets/release-sha256-123/core/busytex");
  });

  it("uses an immutable external compiler asset release when configured", () => {
    expect(
      resolveBusyTexBasePath({
        externalAssetBaseUrl:
          " https://assets.typr.ca/releases/busytex-1.1.1-typr.1-typst-0.7.0-rc2/ ",
        dev: false,
        moduleUrl: "https://typr.ca/assets/app.js"
      })
    ).toBe(
      "https://assets.typr.ca/releases/busytex-1.1.1-typr.1-typst-0.7.0-rc2/core/busytex"
    );
  });

  it("uses the local public directory during development", () => {
    expect(
      resolveBusyTexBasePath({
        dev: true,
        moduleUrl: "http://localhost:5173/src/compiler/compilerAssetUrls.ts"
      })
    ).toBe("/core/busytex");
  });

  it("resolves self-contained production assets relative to the emitted module", () => {
    expect(
      resolveBusyTexBasePath({
        dev: false,
        moduleUrl: "https://example.test/typr/assets/app.js"
      })
    ).toBe("https://example.test/typr/core/busytex");
  });
});
