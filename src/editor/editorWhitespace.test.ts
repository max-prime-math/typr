import { describe, expect, it } from "vitest";
import { getSmartNewlineInsertion } from "./editorWhitespace";

describe("getSmartNewlineInsertion", () => {
  it("continues the current indentation on blank content", () => {
    expect(getSmartNewlineInsertion("  ", 2, "typst")).toBe("\n  ");
  });

  it("indents Typst continuations by the formatter indent width", () => {
    expect(getSmartNewlineInsertion("#let x = (", "#let x = (".length, "typst")).toBe("\n  ");
  });

  it("indents LaTeX environment bodies by the formatter indent width", () => {
    const source = "\\begin{itemize}";

    expect(getSmartNewlineInsertion(source, source.length, "latex")).toBe("\n  ");
  });

  it("continues Markdown unordered lists with normalized spacing", () => {
    const source = "- item";

    expect(getSmartNewlineInsertion(source, source.length, "markdown")).toBe("\n- ");
  });

  it("increments Markdown ordered lists", () => {
    const source = "  3. item";

    expect(getSmartNewlineInsertion(source, source.length, "markdown")).toBe("\n  4. ");
  });
});
