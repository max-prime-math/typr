import { describe, expect, it } from "vitest";
import { convertLatexFallback } from "./latexFallback";

describe("convertLatexFallback", () => {
  it("converts common math snippets", () => {
    expect(convertLatexFallback("\\frac{a^2}{\\sqrt{b}}", "math")).toBe(
      "$frac(a^2, sqrt(b))$"
    );
  });

  it("strips math delimiters", () => {
    expect(convertLatexFallback("\\[x + \\alpha\\]", "math")).toBe("$x + alpha$");
  });

  it("converts simple text markup and inline math", () => {
    expect(
      convertLatexFallback("\\section{Title}\nA \\textbf{bold} $x + y$.", "text")
    ).toBe("= Title\nA *bold* $x + y$.");
  });
});
