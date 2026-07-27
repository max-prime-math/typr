import type { SourceLanguage } from "../compiler/sourceFileTypes";

export type TikzInsertMode = "recommended" | "rendered" | "cetz";
export type TikzInsertionArtifact = "source" | "svg" | "pdf" | "cetz";

export interface TikzInsertionOption {
  mode: TikzInsertMode;
  label: string;
}

export interface TikzInsertion {
  artifact: TikzInsertionArtifact;
  latexPackages: string[];
  text: string;
}

interface BuildTikzInsertionOptions {
  cetzReference: string;
  label: string;
  language: SourceLanguage;
  mode: TikzInsertMode;
  pdfReference: string;
  source: string;
  sourceReference: string;
  svgReference: string;
}

export function getTikzInsertionOptions(
  language: SourceLanguage
): TikzInsertionOption[] {
  if (language === "latex") {
    return [
      { mode: "recommended", label: "Editable TikZ" },
      { mode: "rendered", label: "Rendered PDF" }
    ];
  }

  if (language === "markdown" || language === "typst") {
    if (language === "typst") {
      return [
        { mode: "recommended", label: "Auto (CeTZ if verified)" },
        { mode: "cetz", label: "Editable CeTZ" },
        { mode: "rendered", label: "SVG image" }
      ];
    }

    return [{ mode: "recommended", label: "SVG image" }];
  }

  return [];
}

export function buildTikzInsertion({
  cetzReference,
  label,
  language,
  mode,
  pdfReference,
  source,
  sourceReference,
  svgReference
}: BuildTikzInsertionOptions): TikzInsertion | null {
  if (language === "latex") {
    if (mode === "recommended" && isInputSafeTikzFragment(source)) {
      return {
        artifact: "source",
        latexPackages: ["tikz"],
        text: `\n\\input{${sourceReference}}\n`
      };
    }

    return {
      artifact: "pdf",
      latexPackages: ["graphicx"],
      text: `\n\\includegraphics{${pdfReference}}\n`
    };
  }

  if (language === "markdown") {
    return {
      artifact: "svg",
      latexPackages: [],
      text: `\n![${escapeMarkdownAlt(label)}](${svgReference})\n`
    };
  }

  if (language === "typst") {
    if (mode === "cetz") {
      return {
        artifact: "cetz",
        latexPackages: [],
        text: [
          "",
          "#figure(",
          `  include "${escapeTypstString(cetzReference)}",`,
          ")",
          ""
        ].join("\n")
      };
    }

    return {
      artifact: "svg",
      latexPackages: [],
      text: [
        "",
        "#figure(",
        `  image("${escapeTypstString(svgReference)}", alt: "${escapeTypstString(label)}"),`,
        ")",
        ""
      ].join("\n")
    };
  }

  return null;
}

export function isInputSafeTikzFragment(source: string): boolean {
  const commentlessSource = stripLatexComments(source);

  return (
    /\\begin\s*\{tikzpicture}/.test(commentlessSource) &&
    /\\end\s*\{tikzpicture}/.test(commentlessSource) &&
    !/\\documentclass\b/.test(commentlessSource) &&
    !/\\begin\s*\{document}/.test(commentlessSource)
  );
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function escapeTypstString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function stripLatexComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") {
          continue;
        }

        let slashCount = 0;
        for (let slashIndex = index - 1; slashIndex >= 0 && line[slashIndex] === "\\"; slashIndex -= 1) {
          slashCount += 1;
        }

        if (slashCount % 2 === 0) {
          return line.slice(0, index);
        }
      }

      return line;
    })
    .join("\n");
}
