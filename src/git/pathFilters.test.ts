import { describe, expect, it } from "vitest";
import { matchesIgnorePattern, shouldIgnorePath } from "./pathFilters";

describe("git path filters", () => {
  it("matches basename globs below nested directories", () => {
    expect(matchesIgnorePattern("main.pdf", "*.pdf")).toBe(true);
    expect(matchesIgnorePattern("build/main.pdf", "*.pdf")).toBe(true);
    expect(shouldIgnorePath("chapters/out/main.aux", ["*.aux"])).toBe(true);
    expect(matchesIgnorePattern("build/main.pdf.backup", "*.pdf")).toBe(false);
  });

  it("matches directory ignore patterns below nested directories", () => {
    expect(matchesIgnorePattern("latex.out/main.log", "latex.out/")).toBe(true);
    expect(matchesIgnorePattern("chapters/latex.out/main.log", "latex.out/")).toBe(true);
    expect(matchesIgnorePattern("chapters/latex.output/main.log", "latex.out/")).toBe(false);
    expect(matchesIgnorePattern("chapters/reports/main.pdf", "reports")).toBe(true);
  });

  it("keeps anchored patterns at the repository root", () => {
    expect(matchesIgnorePattern("main.pdf", "/main.pdf")).toBe(true);
    expect(matchesIgnorePattern("chapters/main.pdf", "/main.pdf")).toBe(false);
    expect(matchesIgnorePattern("build/main.pdf", "/build/")).toBe(true);
    expect(matchesIgnorePattern("chapters/build/main.pdf", "/build/")).toBe(false);
  });

  it("treats slashes and wildcards as path-segment boundaries", () => {
    expect(matchesIgnorePattern("docs/main.pdf", "docs/*.pdf")).toBe(true);
    expect(matchesIgnorePattern("docs/nested/main.pdf", "docs/*.pdf")).toBe(false);
    expect(matchesIgnorePattern("archive/docs/main.pdf", "docs/*.pdf")).toBe(false);
    expect(matchesIgnorePattern("chapters/cache-v2/main.aux", "cache*")).toBe(true);
    expect(matchesIgnorePattern("chapters/my-cache/main.aux", "cache*")).toBe(false);
  });

  it("applies supported negation patterns in declaration order", () => {
    expect(shouldIgnorePath("output/main.pdf", ["*.pdf", "!main.pdf"])).toBe(false);
    expect(shouldIgnorePath("output/main.pdf", ["!main.pdf", "*.pdf"])).toBe(true);
    expect(shouldIgnorePath("output/appendix.pdf", ["*.pdf", "!/appendix.pdf"])).toBe(true);
  });
});
