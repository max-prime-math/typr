import { describe, expect, it, vi } from "vitest";
import { preloadTexpressoPageImages, resolveTexpressoPageScale } from "./TexpressoPreview";

describe("TeXpresso raster preview scaling", () => {
  const viewport = { width: 900, height: 700 };
  const portrait = { width: 600, height: 800, nativeScale: 3 };

  it("matches PDF fit and percentage zoom semantics", () => {
    expect(resolveTexpressoPageScale({ mode: "fit-width", percent: 100 }, viewport, portrait)).toBe(1.5);
    expect(resolveTexpressoPageScale({ mode: "fit-height", percent: 100 }, viewport, portrait)).toBe(0.875);
    expect(resolveTexpressoPageScale({ mode: "fit-page", percent: 100 }, viewport, portrait)).toBe(0.875);
    expect(resolveTexpressoPageScale({ mode: "percent", percent: 75 }, viewport, portrait)).toBe(1.125);
  });

  it("fits pages independently and does not upscale past the raster resolution", () => {
    const landscape = { width: 800, height: 600, nativeScale: 3 };
    expect(resolveTexpressoPageScale({ mode: "fit-width", percent: 100 }, viewport, landscape)).toBe(1.125);
    expect(resolveTexpressoPageScale(
      { mode: "fit-width", percent: 100 },
      { width: 2400, height: 1800 },
      { ...portrait, nativeScale: 2 }
    )).toBe(2);
  });
});

describe("TeXpresso raster preview buffering", () => {
  it("decodes every page before resolving the revision preload", async () => {
    const resolvers: Array<() => void> = [];
    const sources: string[] = [];
    const preload = preloadTexpressoPageImages(
      [{ blobUrl: "blob:page-1" }, { blobUrl: "blob:page-2" }],
      () => {
        const image = {
          src: "",
          decode: vi.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)))
        };
        Object.defineProperty(image, "src", {
          get: () => sources.at(-1) ?? "",
          set: (source: string) => sources.push(source)
        });
        return image;
      }
    );

    let resolved = false;
    void preload.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(sources).toEqual(["blob:page-1", "blob:page-2"]);
    expect(resolved).toBe(false);

    resolvers[0]?.();
    await Promise.resolve();
    expect(resolved).toBe(false);

    resolvers[1]?.();
    await preload;
    expect(resolved).toBe(true);
  });
});
