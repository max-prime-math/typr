import { describe, expect, it } from "vitest";
import { matchesIgnorePattern, shouldIgnorePath } from "./pathFilters";

describe("git path filters", () => {
  it("matches basename globs below nested directories", () => {
    expect(matchesIgnorePattern("main.pdf", "*.pdf")).toBe(true);
    expect(matchesIgnorePattern("build/main.pdf", "*.pdf")).toBe(true);
    expect(shouldIgnorePath("chapters/out/main.aux", ["*.aux"])).toBe(true);
  });

  it("matches directory ignore patterns below nested directories", () => {
    expect(matchesIgnorePattern("latex.out/main.log", "latex.out/")).toBe(true);
    expect(matchesIgnorePattern("chapters/latex.out/main.log", "latex.out/")).toBe(true);
  });
});
