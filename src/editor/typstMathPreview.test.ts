import { describe, expect, it } from "vitest";
import { getTypstMathPreviewRange } from "./typstMathPreview";

describe("getTypstMathPreviewRange", () => {
  it("extracts the current Typst dollar math", () => {
    const source = "Let $x^2 + y^2$ be useful.";
    const position = source.indexOf("y^2") + 1;

    expect(getTypstMathPreviewRange(source, position)).toMatchObject({
      math: "x^2 + y^2",
      display: false
    });
  });

  it("previews unclosed math up to the cursor", () => {
    const source = "Let $sum_(i=1)^n i";

    expect(getTypstMathPreviewRange(source, source.length)).toMatchObject({
      math: "sum_(i=1)^n i",
      display: false
    });
  });

  it("detects Typst display math from delimiter spacing", () => {
    const source = "Let $ x^2 + y^2 $ be useful.";
    const position = source.indexOf("y^2") + 1;

    expect(getTypstMathPreviewRange(source, position)).toMatchObject({
      math: "x^2 + y^2",
      display: true
    });
  });

  it("treats unclosed spaced math as display while typing", () => {
    const source = "Let $ sum_(i=1)^n i";

    expect(getTypstMathPreviewRange(source, source.length)).toMatchObject({
      math: "sum_(i=1)^n i",
      display: true
    });
  });

  it("keeps one-sided spacing inline once closed", () => {
    const source = "Let $ x + y$ be useful.";
    const position = source.indexOf("y") + 1;

    expect(getTypstMathPreviewRange(source, position)).toMatchObject({
      math: "x + y",
      display: false
    });
  });

  it("ignores escaped dollar signs", () => {
    expect(getTypstMathPreviewRange("Cost is \\$5 here", 10)).toBeNull();
  });

  it("does not preview outside the math region", () => {
    const source = "Let $x + y$ be useful.";

    expect(getTypstMathPreviewRange(source, source.indexOf("useful"))).toBeNull();
  });
});
