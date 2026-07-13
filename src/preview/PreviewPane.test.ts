import { describe, expect, it } from "vitest";
import { createPdfPreviewCacheKey } from "./pdfPreviewCacheKey";
import { zoomPreviewByWheel } from "./previewZoom";
import { resolvePdfCanvasResolution, shouldUpgradePdfCanvasResolution } from "./pdfCanvasResolution";

describe("PDF preview cache keys", () => {
  it("preserves the legacy sampled byte key format", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);

    expect(createPdfPreviewCacheKey("workspace:paper.pdf", bytes)).toBe(
      "workspace:paper.pdf:256:xq2t6t"
    );
  });
});


describe("continuous preview zoom", () => {
  it("preserves small trackpad deltas instead of jumping between preset steps", () => {
    expect(zoomPreviewByWheel({ mode: "percent", percent: 100 }, -2)).toEqual({
      mode: "percent",
      percent: 100.4
    });
  });

  it("zooms in and out monotonically from fit modes", () => {
    expect(zoomPreviewByWheel({ mode: "fit-width", percent: 100 }, -100).percent).toBeGreaterThan(100);
    expect(zoomPreviewByWheel({ mode: "fit-page", percent: 100 }, 100).percent).toBeLessThan(100);
  });

  it("clamps extreme wheel input to the supported range", () => {
    expect(zoomPreviewByWheel({ mode: "percent", percent: 100 }, -100000).percent).toBe(500);
    expect(zoomPreviewByWheel({ mode: "percent", percent: 100 }, 100000).percent).toBe(25);
  });
});


describe("adaptive PDF canvas resolution", () => {
  it("raises backing resolution to match the zoomed display size", () => {
    const target = resolvePdfCanvasResolution(780, 1103, 3);

    expect(target).toEqual({
      width: 2340,
      height: 3309,
      outputScale: 3
    });
    expect(shouldUpgradePdfCanvasResolution(1365, 1929, target)).toBe(true);
    expect(shouldUpgradePdfCanvasResolution(2340, 3309, target)).toBe(false);
  });

  it("caps extreme zoom levels without leaving normal zoom pixelated", () => {
    const target = resolvePdfCanvasResolution(6000, 9000, 3);

    expect(target.width).toBeLessThanOrEqual(8192);
    expect(target.height).toBeLessThanOrEqual(8192);
    expect(target.width * target.height).toBeLessThanOrEqual(24_010_000);
  });

  it("prewarms enough backing resolution for the first large zoom within its pixel budget", () => {
    const prewarmed = resolvePdfCanvasResolution(780 * 2, 1103 * 2, 2, {
      maxPixels: 9_000_000
    });
    const firstZoomTarget = resolvePdfCanvasResolution(780 * 1.7, 1103 * 1.7, 2);

    expect(prewarmed.width * prewarmed.height).toBeLessThanOrEqual(9_010_000);
    expect(
      shouldUpgradePdfCanvasResolution(
        prewarmed.width,
        prewarmed.height,
        firstZoomTarget
      )
    ).toBe(false);
  });
});
