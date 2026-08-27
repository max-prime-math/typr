import { describe, expect, it } from "vitest";
import {
  getLatexItemNewlineInsertion,
  getOwnLineInsertion,
  getSmartNewlineInsertion
} from "./editorWhitespace";

describe("getOwnLineInsertion", () => {
  it("replaces a blank line and leaves the cursor at its beginning", () => {
    const source = "before\n   \nafter";

    expect(getOwnLineInsertion(source, 9, "\\input{figure.tikz}")).toEqual({
      cursor: 7,
      from: 7,
      insert: "\\input{figure.tikz}",
      to: 10
    });
  });

  it("inserts below a line with content and leaves the cursor before the command", () => {
    const source = "before\nafter";

    expect(getOwnLineInsertion(source, 3, "\\input{figure.tikz}")).toEqual({
      cursor: 7,
      from: 6,
      insert: "\n\\input{figure.tikz}",
      to: 6
    });
  });

  it("inserts below the final line without adding a trailing blank line", () => {
    const source = "before";

    expect(getOwnLineInsertion(source, source.length, "\\input{figure.tikz}")).toEqual({
      cursor: 7,
      from: 6,
      insert: "\n\\input{figure.tikz}",
      to: 6
    });
  });
});

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

describe("getLatexItemNewlineInsertion", () => {
  it("starts another item at the current item indentation", () => {
    const source = "\\begin{itemize}\n  \\item One";

    expect(getLatexItemNewlineInsertion(source, source.length)).toBe("\n  \\item ");
  });

  it("starts the first item one formatter indent below the environment", () => {
    const source = "  \\begin{enumerate}";

    expect(getLatexItemNewlineInsertion(source, source.length)).toBe("\n    \\item ");
  });

  it("leaves Shift+Enter alone outside a list environment", () => {
    const source = "\\begin{document}\nText";

    expect(getLatexItemNewlineInsertion(source, source.length)).toBeNull();
  });
});
