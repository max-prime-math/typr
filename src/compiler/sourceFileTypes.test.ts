import { describe, expect, it } from "vitest";
import {
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
    expect(getSourceLanguage("notes.md")).toBe("markdown");
    expect(getSourceLanguage("README.markdown")).toBe("markdown");
    expect(getSourceLanguage(".gitignore")).toBe("text");
  });

  it("only treats main source files as compilable", () => {
    expect(isCompilableSourceFile("main.typ")).toBe(true);
    expect(isCompilableSourceFile("paper.tex")).toBe(true);
    expect(isCompilableSourceFile("layout.cls")).toBe(false);
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
});
