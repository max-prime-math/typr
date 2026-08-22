import { describe, expect, it, vi } from "vitest";
import { rethemeNativePreviewRasterCanvas } from "./previewRasterTheme";

describe("native TeXpresso raster theme transitions", () => {
  it("maps native background and foreground endpoints into the new theme", async () => {
    const pixels = new Uint8ClampedArray([
      0x1e, 0x1e, 0x2e, 255,
      0xcd, 0xd6, 0xf4, 255
    ]);
    const image = { data: pixels } as ImageData;
    const context = {
      getImageData: vi.fn(() => image),
      putImageData: vi.fn()
    } as unknown as CanvasRenderingContext2D;

    await rethemeNativePreviewRasterCanvas(
      { width: 2, height: 1 } as HTMLCanvasElement,
      context,
      { background: 0x1e1e2e, foreground: 0xcdd6f4 },
      { background: "#ffffff", foreground: "#000000" }
    );

    expect([...pixels]).toEqual([
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);
    expect(context.putImageData).toHaveBeenCalledWith(image, 0, 0);
  });
});
