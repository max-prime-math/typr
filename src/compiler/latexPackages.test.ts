import { describe, expect, it } from "vitest";
import { extractLatexPackageNames } from "./latexPackages";

describe("LaTeX package detection", () => {
  it("extracts usepackage and RequirePackage names", () => {
    const packageNames = extractLatexPackageNames(
      [
        "\\usepackage{amsmath, graphicx}",
        "\\usepackage[most]{tcolorbox}",
        "\\RequirePackage{hyperref}"
      ].join("\n")
    );

    expect(packageNames).toEqual(["amsmath", "graphicx", "hyperref", "tcolorbox"]);
  });

  it("ignores commented packages and strips sty suffixes", () => {
    const packageNames = extractLatexPackageNames(
      [
        "% \\usepackage{ignored}",
        "\\usepackage{styles/custom.sty}",
        "Text with an escaped percent \\% before \\usepackage{visible}"
      ].join("\n")
    );

    expect(packageNames).toEqual(["custom", "visible"]);
  });
});
