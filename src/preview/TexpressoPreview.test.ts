import { describe, expect, it, vi } from "vitest";
import { preloadTexpressoPageImages } from "./TexpressoPreview";

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
