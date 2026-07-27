import { describe, expect, it } from "vitest";
import {
  buildTikzInsertion,
  getTikzInsertionOptions,
  isInputSafeTikzFragment
} from "./tikzInsertion";

const SOURCE = String.raw`\begin{tikzpicture}
  \draw (0, 0) -- (1, 1);
\end{tikzpicture}`;

describe("TikZ insertion policy", () => {
  it("inserts a safe fragment by reference and requests TikZ for LaTeX", () => {
    expect(buildTikzInsertion({
      cetzReference: "figures/orbit.cetz.typ",
      label: "orbit",
      language: "latex",
      mode: "recommended",
      pdfReference: "figures/orbit.pdf",
      source: SOURCE,
      sourceReference: "figures/orbit.tikz",
      svgReference: "figures/orbit.svg"
    })).toEqual({
      artifact: "source",
      latexPackages: ["tikz"],
      text: "\n\\input{figures/orbit.tikz}\n"
    });
  });

  it("falls back to rendered PDF when imported LaTeX is a full document", () => {
    const source = String.raw`\documentclass{standalone}
\begin{document}
${SOURCE}
\end{document}`;

    expect(buildTikzInsertion({
      cetzReference: "../figures/orbit.cetz.typ",
      label: "orbit",
      language: "latex",
      mode: "recommended",
      pdfReference: "../figures/orbit.pdf",
      source,
      sourceReference: "../figures/orbit.tikz",
      svgReference: "../figures/orbit.svg"
    })).toMatchObject({
      artifact: "pdf",
      latexPackages: ["graphicx"],
      text: "\n\\includegraphics{../figures/orbit.pdf}\n"
    });
  });

  it("uses portable SVG references for Markdown and Typst", () => {
    expect(buildTikzInsertion({
      cetzReference: "figures/orbit.cetz.typ",
      label: "orbit]",
      language: "markdown",
      mode: "recommended",
      pdfReference: "orbit.pdf",
      source: SOURCE,
      sourceReference: "orbit.tikz",
      svgReference: "figures/orbit.svg"
    })?.text).toBe("\n![orbit\\]](figures/orbit.svg)\n");

    expect(buildTikzInsertion({
      cetzReference: "figures/orbit.cetz.typ",
      label: 'orbit "one"',
      language: "typst",
      mode: "recommended",
      pdfReference: "orbit.pdf",
      source: SOURCE,
      sourceReference: "orbit.tikz",
      svgReference: "figures/orbit.svg"
    })?.text).toContain('alt: "orbit \\"one\\""');
  });

  it("inserts verified CeTZ as a managed Typst include", () => {
    expect(buildTikzInsertion({
      cetzReference: "../figures/orbit.cetz.typ",
      label: "orbit",
      language: "typst",
      mode: "cetz",
      pdfReference: "orbit.pdf",
      source: SOURCE,
      sourceReference: "orbit.tikz",
      svgReference: "orbit.svg"
    })).toEqual({
      artifact: "cetz",
      latexPackages: [],
      text: '\n#figure(\n  include "../figures/orbit.cetz.typ",\n)\n'
    });
  });

  it("does not offer insertion for unsupported text files", () => {
    expect(getTikzInsertionOptions("text")).toEqual([]);
  });

  it("offers verified, explicit, and rendered insertion modes for Typst", () => {
    expect(getTikzInsertionOptions("typst")).toEqual([
      { mode: "recommended", label: "Auto (CeTZ if verified)" },
      { mode: "cetz", label: "Editable CeTZ" },
      { mode: "rendered", label: "SVG image" }
    ]);
  });

  it("ignores commented document wrappers when checking fragments", () => {
    expect(isInputSafeTikzFragment(`% \\\\documentclass{article}\n${SOURCE}`)).toBe(true);
  });
});
