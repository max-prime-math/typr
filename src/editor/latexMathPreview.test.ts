import { describe, expect, it } from "vitest";
import { getLatexMathPreviewRange } from "./latexMathPreview";

describe("getLatexMathPreviewRange", () => {
  it("extracts the current inline dollar math", () => {
    const source = "Let $x^2 + y^2$ be useful.";
    const position = source.indexOf("y^2") + 1;

    expect(getLatexMathPreviewRange(source, position)).toMatchObject({
      latex: "x^2 + y^2",
      display: false
    });
  });

  it("previews unclosed inline math up to the cursor", () => {
    const source = "Let $\\frac{1}{2}";

    expect(getLatexMathPreviewRange(source, source.length)).toMatchObject({
      latex: "\\frac{1}{2}",
      display: false
    });
  });

  it("extracts display math from bracket delimiters", () => {
    const source = "\\[\\int_0^1 x\\,dx\\]";
    const position = source.indexOf("x");

    expect(getLatexMathPreviewRange(source, position)).toMatchObject({
      latex: "\\int_0^1 x\\,dx",
      display: true
    });
  });

  it("extracts display math from math environments", () => {
    const source = "\\begin{equation*}\\sqrt{x}\\end{equation*}";
    const position = source.indexOf("sqrt");

    expect(getLatexMathPreviewRange(source, position)).toMatchObject({
      latex: "\\sqrt{x}",
      display: true
    });
  });

  it("ignores escaped dollar signs outside math", () => {
    expect(getLatexMathPreviewRange("Cost is \\$5 here", 10)).toBeNull();
  });

  it("does not preview incomplete commands", () => {
    const source = "Let $\\fra";

    expect(getLatexMathPreviewRange(source, source.length)).toBeNull();
  });
});
