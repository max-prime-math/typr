import { describe, expect, it, vi } from "vitest";
import { prepareBrowserForLatexCompile } from "./latexCompilePreparation";

describe("LaTeX compile browser preparation", () => {
  it("releases diagnostic and Typst workers before yielding and persisting tabs", async () => {
    const calls: string[] = [];

    await prepareBrowserForLatexCompile({
      lowMemoryMode: true,
      releaseHarperMemory: () => calls.push("release-harper"),
      releaseTypstMemory: () => calls.push("release-typst"),
      yieldToBrowser: async () => {
        calls.push("yield");
      },
      persistWorkspace: async () => {
        calls.push("persist");
      }
    });

    expect(calls).toEqual(["release-harper", "release-typst", "yield", "persist"]);
  });

  it("keeps compilation available when the persistence flush fails", async () => {
    const releaseHarperMemory = vi.fn();
    const releaseTypstMemory = vi.fn();

    await expect(prepareBrowserForLatexCompile({
      lowMemoryMode: false,
      releaseHarperMemory,
      releaseTypstMemory,
      yieldToBrowser: vi.fn(async () => undefined),
      persistWorkspace: vi.fn(async () => {
        throw new Error("storage unavailable");
      })
    })).resolves.toBeUndefined();
    expect(releaseHarperMemory).not.toHaveBeenCalled();
    expect(releaseTypstMemory).not.toHaveBeenCalled();
  });
});
