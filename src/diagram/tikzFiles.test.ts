import { describe, expect, it } from "vitest";
import { createEmptyProjectRepository } from "../project/projectState";
import {
  DEFAULT_TIKZ_SOURCE,
  collectTikzFigureFiles,
  createNextTikzPath,
  getTikzCetzPath,
  getTikzPdfPath,
  getTikzSvgPath,
  normalizeTikzFileName,
  renameTikzFigureFiles,
  writeTikzFigureFiles
} from "./tikzFiles";

describe("TikZ project files", () => {
  it("creates source and SVG companion files as ordinary project documents", () => {
    const project = createEmptyProjectRepository({
      displayName: "TikZ test",
      defaultFileName: "main.typ"
    });
    const path = createNextTikzPath(project);
    const updated = writeTikzFigureFiles(
      project,
      path,
      DEFAULT_TIKZ_SOURCE,
      "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"
    );

    expect(path).toBe("figures/diagram.tikz");
    expect(updated.filesystem.entries[path]?.source.kind).toBe("document");
    expect(updated.filesystem.entries[getTikzSvgPath(path)]?.source.kind).toBe("document");
    expect(collectTikzFigureFiles(updated)).toEqual([
      {
        path,
        name: "diagram.tikz",
        source: DEFAULT_TIKZ_SOURCE,
        svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
        hasCetz: false,
        hasPdf: false
      }
    ]);
  });

  it("uses collision-free names and renames all managed artifacts and open tabs together", () => {
    const project = createEmptyProjectRepository({
      displayName: "TikZ test",
      defaultFileName: "main.typ"
    });
    const withFirst = writeTikzFigureFiles(
      project,
      "figures/diagram.tikz",
      DEFAULT_TIKZ_SOURCE,
      "<svg/>",
      new Uint8Array([37, 80, 68, 70]),
      "#canvas({})\n"
    );
    const openProject = {
      ...withFirst,
      selection: {
        activeFilePath: "figures/diagram.tikz",
        openFilePaths: ["main.typ", "figures/diagram.tikz"]
      }
    };

    expect(createNextTikzPath(openProject)).toBe("figures/diagram 2.tikz");

    const renamed = renameTikzFigureFiles(openProject, "figures/diagram.tikz", "orbit.svg");
    expect(renamed.path).toBe("figures/orbit.tikz");
    expect(renamed.project.filesystem.entries["figures/orbit.tikz"]).toBeDefined();
    expect(renamed.project.filesystem.entries["figures/orbit.svg"]).toBeDefined();
    expect(renamed.project.filesystem.entries["figures/orbit.pdf"]).toBeDefined();
    expect(renamed.project.filesystem.entries["figures/orbit.cetz.typ"]).toBeDefined();
    expect(
      renamed.project.filesystem.entries["figures/orbit.cetz.typ"]?.source.kind
    ).toBe("document");
    expect(renamed.project.selection.activeFilePath).toBe("figures/orbit.tikz");
    expect(renamed.project.selection.openFilePaths).toContain("figures/orbit.tikz");
  });

  it("invalidates a stale rendered PDF when source or SVG changes", () => {
    const project = createEmptyProjectRepository({
      displayName: "TikZ test",
      defaultFileName: "main.typ"
    });
    const withPdf = writeTikzFigureFiles(
      project,
      "figures/orbit.tikz",
      DEFAULT_TIKZ_SOURCE,
      "<svg/>",
      new Uint8Array([37, 80, 68, 70]),
      "#canvas({})\n"
    );
    const unchanged = writeTikzFigureFiles(
      withPdf,
      "figures/orbit.tikz",
      DEFAULT_TIKZ_SOURCE,
      "<svg/>"
    );
    const changed = writeTikzFigureFiles(
      unchanged,
      "figures/orbit.tikz",
      `${DEFAULT_TIKZ_SOURCE}% changed`,
      "<svg/>"
    );

    expect(unchanged.filesystem.entries[getTikzPdfPath("figures/orbit.tikz")]).toBeDefined();
    expect(unchanged.filesystem.entries[getTikzCetzPath("figures/orbit.tikz")]).toBeDefined();
    expect(changed.filesystem.entries[getTikzPdfPath("figures/orbit.tikz")]).toBeUndefined();
    expect(changed.filesystem.entries[getTikzCetzPath("figures/orbit.tikz")]).toBeUndefined();
  });

  it("normalizes names to a safe TikZ leaf name", () => {
    expect(normalizeTikzFileName("../bad:name.tex")).toBe("bad-name.tikz");
    expect(normalizeTikzFileName("")).toBe("diagram.tikz");
  });
});
