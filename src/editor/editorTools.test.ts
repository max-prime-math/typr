import { describe, expect, it } from "vitest";
import {
  formatLatexSource,
  formatMarkdownSource,
  formatTypstSource,
  lintLatexSource,
  lintMarkdownSource,
  lintTypstSource,
  normalizeEditorToolingPreferences
} from "./editorTools";

describe("editor tooling preferences", () => {
  it("normalizes missing editor tooling preferences", () => {
    const preferences = normalizeEditorToolingPreferences(undefined);

    expect(preferences.lintOnEdit).toBe(true);
    expect(preferences.formatOnCompile).toBe(false);
    expect(preferences.languages.markdown.formatter).toBe("built-in");
    expect(preferences.languages.markdown.linter).toBe("built-in");
    expect(preferences.languages.typst.formatter).toBe("built-in");
    expect(preferences.languages.latex.formatter).toBe("built-in");
  });

  it("migrates phase-one Typst and LaTeX disabled defaults to built-in tools", () => {
    const preferences = normalizeEditorToolingPreferences({
      lintOnEdit: true,
      formatOnCompile: false,
      languages: {
        typst: {
          formatter: "disabled",
          linter: "disabled"
        },
        latex: {
          formatter: "disabled",
          linter: "disabled"
        },
        markdown: {
          formatter: "built-in",
          linter: "built-in"
        }
      }
    });

    expect(preferences.schemaVersion).toBe(2);
    expect(preferences.languages.typst.formatter).toBe("built-in");
    expect(preferences.languages.latex.formatter).toBe("built-in");
  });
});

describe("Markdown formatter", () => {
  it("normalizes common Markdown spacing", () => {
    expect(formatMarkdownSource("#Title  \n\n\n-   item\n")).toBe("# Title\n\n- item\n");
  });
});

describe("Markdown linter", () => {
  it("detects heading jumps and unclosed fences without flagging trailing whitespace", () => {
    const diagnostics = lintMarkdownSource(["# Title  ", "### Jump", "```ts", "const x = 1;"].join("\n"), "notes.md");

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          line: 2,
          message: "Markdown lint: heading jumps from h1 to h3."
        }),
        expect.objectContaining({
          severity: "error",
          line: 3,
          message: "Markdown lint: code fence is not closed."
        })
      ])
    );
    expect(diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Markdown lint: trailing whitespace."
        })
      ])
    );
  });
});

describe("Typst formatter", () => {
  it("normalizes headings, lists, indentation, and trailing whitespace", () => {
    expect(formatTypstSource("=Title  \n#let x = (\n1\n)\n-   item\n")).toBe(
      "= Title\n#let x = (\n  1\n)\n- item\n"
    );
  });
});

describe("Typst linter", () => {
  it("detects heading jumps, LaTeX syntax, and unclosed raw blocks", () => {
    const diagnostics = lintTypstSource(["= Title", "=== Jump", "\\begin{document}", "```"].join("\n"), "main.typ");

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          line: 2,
          message: "Typst lint: heading jumps from level 1 to 3."
        }),
        expect.objectContaining({
          severity: "warning",
          line: 3,
          message: "Typst lint: this line looks like LaTeX syntax."
        }),
        expect.objectContaining({
          severity: "error",
          line: 4,
          message: "Typst lint: raw code block is not closed."
        })
      ])
    );
  });

  it("does not warn for prose apostrophes or trailing spaces", () => {
    const diagnostics = lintTypstSource("It's fine to type a space here ", "main.typ");

    expect(diagnostics).toEqual([]);
  });
});

describe("LaTeX formatter", () => {
  it("normalizes environment indentation and item spacing", () => {
    expect(
      formatLatexSource(
        "\\begin{itemize}\n\\item   One\n\\begin{enumerate}\n\\item Two\n\\end{enumerate}\n\\end{itemize}\n"
      )
    ).toBe(
      "\\begin{itemize}\n  \\item One\n  \\begin{enumerate}\n    \\item Two\n  \\end{enumerate}\n\\end{itemize}\n"
    );
  });
});

describe("LaTeX linter", () => {
  it("detects Typst syntax, browser shell escape issues, and unclosed environments", () => {
    const diagnostics = lintLatexSource(
      ["\\begin{document}", "# figure(image(\"figures/diagram 1.svg\"))", "\\usepackage{minted}"].join("\n"),
      "main.tex"
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          line: 2,
          message: "LaTeX lint: '#' starts a macro parameter here; did you paste Typst syntax?"
        }),
        expect.objectContaining({
          severity: "warning",
          line: 3,
          message: "LaTeX lint: this may require shell escape, which browser preview cannot run."
        }),
        expect.objectContaining({
          severity: "error",
          line: 1,
          message: "LaTeX lint: \\begin{document} is not closed."
        })
      ])
    );
  });
});
