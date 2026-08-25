import { describe, expect, it } from "vitest";
import { createPdfPreviewCacheKey } from "./pdfPreviewCacheKey";
import {
  clampPdfPageNumber,
  normalizePdfWheelEventDelta,
  resolveCurrentPdfPage
} from "./pdfPageNavigation";
import { zoomPreviewByWheel } from "./previewZoom";
import { resolvePdfCanvasResolution, shouldUpgradePdfCanvasResolution } from "./pdfCanvasResolution";

describe("PDF preview cache keys", () => {
  it("hashes the complete PDF rather than a sparse byte sample", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const changedOutsideLegacySample = bytes.slice();
    changedOutsideLegacySample[1] ^= 0xff;

    expect(createPdfPreviewCacheKey("workspace:paper.pdf", bytes)).toBe(
      "workspace:paper.pdf:256:144sds5"
    );
    expect(createPdfPreviewCacheKey("workspace:paper.pdf", changedOutsideLegacySample))
      .not.toBe(createPdfPreviewCacheKey("workspace:paper.pdf", bytes));
  });
});

describe("PDF page navigation", () => {
  const pages = [
    { height: 800, pageNumber: 1, top: 0 },
    { height: 800, pageNumber: 2, top: 800 },
    { height: 800, pageNumber: 3, top: 1600 }
  ];

  it("selects the page occupying most of the viewport", () => {
    expect(resolveCurrentPdfPage(pages, 650, 500)).toBe(2);
    expect(resolveCurrentPdfPage(pages, 1450, 500)).toBe(3);
  });

  it("uses viewport proximity to resolve an exact page boundary", () => {
    expect(resolveCurrentPdfPage(pages, 600, 400)).toBe(1);
  });

  it("clamps typed page numbers to the document", () => {
    expect(clampPdfPageNumber(-4, 12)).toBe(1);
    expect(clampPdfPageNumber(7, 12)).toBe(7);
    expect(clampPdfPageNumber(99, 12)).toBe(12);
  });

  it("normalizes wheel deltas using PDF.js page-navigation units", () => {
    expect(normalizePdfWheelEventDelta({ deltaMode: 0, deltaX: 0, deltaY: 90 })).toBeCloseTo(-0.1);
    expect(normalizePdfWheelEventDelta({ deltaMode: 1, deltaX: 0, deltaY: -3 })).toBeCloseTo(0.1);
    expect(normalizePdfWheelEventDelta({ deltaMode: 2, deltaX: 0, deltaY: 1 })).toBe(-1);
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
