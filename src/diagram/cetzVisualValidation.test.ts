import { describe, expect, it } from "vitest";
import { compareRgbaBuffers } from "./cetzVisualValidation";

describe("CeTZ visual comparison", () => {
  it("accepts identical raster buffers", () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255
    ]);

    expect(compareRgbaBuffers(pixels, pixels)).toEqual({
      changedPixelRatio: 0,
      inkMismatchRatio: 0,
      meanDifference: 0,
      similar: true
    });
  });

  it("rejects completely different raster buffers", () => {
    const black = new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255
    ]);
    const white = new Uint8ClampedArray([
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);
    const result = compareRgbaBuffers(black, white);

    expect(result.changedPixelRatio).toBe(1);
    expect(result.inkMismatchRatio).toBe(1);
    expect(result.meanDifference).toBe(1);
    expect(result.similar).toBe(false);
  });

  it("rejects buffers with incompatible dimensions", () => {
    expect(() =>
      compareRgbaBuffers(
        new Uint8ClampedArray(4),
        new Uint8ClampedArray(8)
      )
    ).toThrow("equal RGBA dimensions");
  });
});
