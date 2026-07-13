import { describe, expect, it } from "vitest";
import {
  getRelativePathBasename,
  getRelativePathParent,
  joinRelativePaths,
  moveRelativePath,
  normalizeRelativePath,
  stripRelativePathPrefix
} from "./relativePath";
import { assertSafeProjectPath, isReservedGitPath } from "../project/projectState";

describe("relative path utilities", () => {
  it("normalizes slashes, whitespace, root-relative input, and dot segments", () => {
    expect(normalizeRelativePath("chapters\\drafts\\intro.typ")).toBe(
      "chapters/drafts/intro.typ"
    );
    expect(normalizeRelativePath(" /chapters\\\\drafts// ./intro.typ ")).toBe(
      "chapters/drafts/intro.typ"
    );
    expect(normalizeRelativePath("/chapters/drafts/../overview.typ")).toBe(
      "chapters/overview.typ"
    );
    expect(normalizeRelativePath("../../shared/main.typ")).toBe("../../shared/main.typ");
  });

  it("provides consistent basename, parent, and join operations", () => {
    expect(getRelativePathBasename("/chapters/drafts/intro.typ")).toBe("intro.typ");
    expect(getRelativePathParent("/chapters/drafts/intro.typ")).toBe("chapters/drafts");
    expect(getRelativePathParent("main.typ")).toBeNull();
    expect(joinRelativePaths("/chapters/drafts", "../overview.typ")).toBe(
      "chapters/overview.typ"
    );
  });

  it("supports basename-only renames and nested moves without matching sibling prefixes", () => {
    const currentPath = "chapters/drafts/intro.typ";
    const renamedPath = joinRelativePaths(
      getRelativePathParent(currentPath),
      "overview.typ"
    );

    expect(renamedPath).toBe("chapters/drafts/overview.typ");
    expect(moveRelativePath("chapters/drafts/notes/todo.typ", "chapters/drafts", "archive"))
      .toBe("archive/notes/todo.typ");
    expect(moveRelativePath("chapters/drafts-2/todo.typ", "chapters/drafts", "archive"))
      .toBe("chapters/drafts-2/todo.typ");
  });

  it("handles figures paths through the same prefix semantics", () => {
    expect(stripRelativePathPrefix("figures/plots/result.svg", "figures")).toBe(
      "plots/result.svg"
    );
    expect(stripRelativePathPrefix("figures", "figures")).toBe("");
    expect(stripRelativePathPrefix("figures-old/result.svg", "figures")).toBeNull();
    expect(joinRelativePaths("figures", "plots", "result.svg")).toBe(
      "figures/plots/result.svg"
    );
  });

  it("leaves Git reservation to the stricter project validator", () => {
    expect(normalizeRelativePath("/.git//objects/aa")).toBe(".git/objects/aa");
    expect(isReservedGitPath("/.git//objects/aa")).toBe(true);
    expect(isReservedGitPath("notes/.gitignore")).toBe(false);
    expect(() => assertSafeProjectPath("project/../.git/config")).toThrow(
      "cannot escape the project root"
    );
    expect(() => assertSafeProjectPath("/.git/config")).toThrow(
      "reserved for Typr git storage"
    );
  });
});
