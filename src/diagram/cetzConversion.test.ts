import { describe, expect, it } from "vitest";
import {
  assessCetzConversion,
  buildCetzValidationSource,
  collectTopLevelTikzCommands
} from "./cetzConversion";
import type { TylaxCheckSummary } from "./tylaxTypes";

const CLEAN_DIAGNOSTICS: TylaxCheckSummary = {
  errors: [],
  warnings: [],
  infos: [],
  has_errors: false
};

describe("CeTZ conversion assessment", () => {
  it("accepts supported top-level commands with renderable output", () => {
    const source = String.raw`\begin{tikzpicture}
  \draw (0, 0) -- (1, 1);
  \node at (0, 0) {$\frac{1}{2}$};
\end{tikzpicture}`;
    const cetz = `#canvas({\n  line((0, 0), (1, 1))\n  content((0, 0), [$1/2$])\n})`;

    expect(collectTopLevelTikzCommands(source)).toEqual(["draw", "node"]);
    expect(assessCetzConversion(source, cetz, CLEAN_DIAGNOSTICS)).toEqual({
      blockers: [],
      sourceCommands: ["draw", "node"],
      warnings: []
    });
  });

  it("rejects silently skipped and explicitly unsupported commands", () => {
    const source = String.raw`\begin{tikzpicture}
  \foo{bar};
  \addplot {x^2};
\end{tikzpicture}`;
    const diagnostics: TylaxCheckSummary = {
      ...CLEAN_DIAGNOSTICS,
      warnings: ["command '\\addplot' is not fully supported"]
    };
    const assessment = assessCetzConversion(
      source,
      "#canvas({\n})",
      diagnostics
    );

    expect(assessment.blockers).toContain(
      "Unsupported top-level TikZ commands: \\foo, \\addplot"
    );
    expect(assessment.blockers).toContain(
      "Tylax produced no renderable CeTZ drawing commands."
    );
    expect(assessment.warnings).toEqual([
      "command '\\addplot' is not fully supported"
    ]);
  });

  it("requires exactly one TikZ picture", () => {
    const source = String.raw`\draw (0, 0) -- (1, 1);`;
    const assessment = assessCetzConversion(
      source,
      "#canvas({\n  line((0, 0), (1, 1))\n})",
      CLEAN_DIAGNOSTICS
    );

    expect(assessment.blockers).toContain(
      "The source must contain exactly one tikzpicture environment."
    );
  });

  it("wraps candidate output in an auto-sized transparent page", () => {
    expect(buildCetzValidationSource("#canvas({})")).toBe(
      "#set page(width: auto, height: auto, margin: 0pt, fill: none)\n#canvas({})\n"
    );
  });
});
