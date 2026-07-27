import { describe, expect, it } from "vitest";
import {
  closeWorkspaceTab,
  insertWorkspacePathAfterActive,
  normalizeUniqueWorkspacePaths,
  openWorkspacePreviewTab,
  reconcileWorkspaceTabs,
  remapWorkspacePath,
  remapWorkspacePaths,
  reorderWorkspacePaths
} from "./workspaceTabs";

describe("workspace tabs", () => {
  it("normalizes, de-duplicates, and inserts a tab after the active tab", () => {
    expect(
      insertWorkspacePathAfterActive(
        ["intro.typ", "./notes.typ", "notes.typ", "../escape.typ"],
        "chapters/one.typ",
        "intro.typ"
      )
    ).toEqual(["intro.typ", "chapters/one.typ", "notes.typ", "../escape.typ"]);
    expect(normalizeUniqueWorkspacePaths(["./intro.typ", "intro.typ", ""])).toEqual([
      "intro.typ"
    ]);
  });

  it("closes the active tab to its nearest sibling and preserves a different active tab", () => {
    expect(closeWorkspaceTab(["a.typ", "b.typ", "c.typ"], "b.typ", "b.typ")).toEqual({
      activePath: "c.typ",
      paths: ["a.typ", "c.typ"]
    });
    expect(closeWorkspaceTab(["a.typ", "b.typ"], "a.typ", "b.typ")).toEqual({
      activePath: "b.typ",
      paths: ["b.typ"]
    });
  });

  it("reorders tabs for drag/drop while retaining normalized paths", () => {
    expect(
      reorderWorkspacePaths(["a.typ", "b.typ", "c.typ"], "c.typ", "a.typ", false)
    ).toEqual(["c.typ", "a.typ", "b.typ"]);
  });

  it("moves exact and descendant paths with a renamed workspace entry", () => {
    expect(remapWorkspacePath("chapters/intro.typ", "chapters/intro.typ", "chapters/start.typ"))
      .toBe("chapters/start.typ");
    expect(remapWorkspacePath("chapters/drafts/one.typ", "chapters", "writing"))
      .toBe("writing/drafts/one.typ");
    expect(remapWorkspacePath("chapters-old/one.typ", "chapters", "writing"))
      .toBe("chapters-old/one.typ");
    expect(
      remapWorkspacePaths(
        ["chapters/one.typ", "notes.typ", "./chapters/one.typ"],
        "chapters",
        "writing"
      )
    ).toEqual(["writing/one.typ", "notes.typ"]);
  });

  it("reconciles stored and live tabs against currently available workspace files", () => {
    expect(
      reconcileWorkspaceTabs({
        activePath: "missing.typ",
        availablePaths: new Set(["a.typ", "b.typ"]),
        paths: ["./b.typ", "missing.typ"],
        storedPaths: ["a.typ", "missing.typ"],
        includeStoredPaths: true
      })
    ).toEqual({
      activePath: "b.typ",
      paths: ["b.typ", "a.typ"]
    });
  });
});


describe("preview tab persistence state", () => {
  it("opens after the active tab and persists activation explicitly", () => {
    expect(openWorkspacePreviewTab(
      ["README.md", "figure.svg"],
      "output/main.pdf",
      "README.md",
      true
    )).toEqual({
      paths: ["README.md", "output/main.pdf", "figure.svg"],
      activePath: "output/main.pdf"
    });
    expect(openWorkspacePreviewTab(
      ["README.md"],
      "figure.svg",
      "README.md",
      false
    )).toEqual({
      paths: ["README.md", "figure.svg"],
      activePath: "README.md"
    });
  });
});
