import { describe, expect, it } from "vitest";
import {
  getPreferredNewDocumentExtension,
  getSourceLanguage,
  isCompilableSourceFile,
  isLatexMainSourceFile,
  isTypstSourceFile,
  normalizeCompilerPath
} from "./sourceFileTypes";

describe("source file type routing", () => {
  it("detects Typst, LaTeX, Markdown, and generic text sources", () => {
    expect(getSourceLanguage("main.typ")).toBe("typst");
    expect(getSourceLanguage("paper.tex")).toBe("latex");
    expect(getSourceLanguage("styles/custom.sty")).toBe("latex");
    expect(getSourceLanguage("figures/orbit.tikz")).toBe("latex");
    expect(getSourceLanguage("notes.md")).toBe("markdown");
    expect(getSourceLanguage("README.markdown")).toBe("markdown");
    expect(getSourceLanguage(".gitignore")).toBe("text");
  });

  it("only treats main source files as compilable", () => {
    expect(isCompilableSourceFile("main.typ")).toBe(true);
    expect(isCompilableSourceFile("paper.tex")).toBe(true);
    expect(isCompilableSourceFile("layout.cls")).toBe(false);
    expect(isCompilableSourceFile("figures/orbit.tikz")).toBe(false);
    expect(isCompilableSourceFile("notes.md")).toBe(false);
  });

  it("normalizes terminal project paths for compiler inputs", () => {
    expect(normalizeCompilerPath("/project/chapters/one.tex")).toBe("chapters/one.tex");
    expect(normalizeCompilerPath("project/main.typ")).toBe("main.typ");
  });

  it("separates Typst and LaTeX main file predicates", () => {
    expect(isTypstSourceFile("main.typst")).toBe(true);
    expect(isTypstSourceFile("main.tex")).toBe(false);
    expect(isLatexMainSourceFile("main.ltx")).toBe(true);
    expect(isLatexMainSourceFile("bibliography.bib")).toBe(false);
  });

  it("only carries md, tex, and typ extensions into newly created documents", () => {
    expect(getPreferredNewDocumentExtension("notes/README.MD")).toBe(".md");
    expect(getPreferredNewDocumentExtension("paper.tex")).toBe(".tex");
    expect(getPreferredNewDocumentExtension("draft.typ")).toBe(".typ");
    expect(getPreferredNewDocumentExtension("draft.typst")).toBeNull();
    expect(getPreferredNewDocumentExtension("references.bib")).toBeNull();
    expect(getPreferredNewDocumentExtension("notes.txt")).toBeNull();
  });
});
