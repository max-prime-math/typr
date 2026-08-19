import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildLatexProjectIndex,
  createLatexProjectCompletionSource,
  resolveLatexFileReferenceAt,
  type LatexProjectFile
} from "./latexProjectIntelligence";

const PROJECT_FILES: LatexProjectFile[] = [
  {
    path: "main.tex",
    content: String.raw`\documentclass{article}
\usepackage{amsmath, graphicx}
\newcommand{\vect}[1]{\mathbf{#1}}
\DeclareMathOperator{\rank}{rank}
\newenvironment{example}{\begin{quote}}{\end{quote}}
\begin{document}
\section{Introduction \textbf{and motivation}}\label{sec:intro}
\input{chapters/methods}
\bibliography{references}
\end{document}`
  },
  {
    path: "chapters/methods.tex",
    content: String.raw`% \label{ignored}
\subsection{Methods}
\label{sec:methods}
\includegraphics{../figures/result.png}`
  },
  {
    path: "references.bib",
    content: String.raw`@article{smith2025,
  author = {Smith, Alice and Jones, Bob},
  title = {A {Nested} Title},
  year = "2025"
}
% @book{ignored, title={Ignored}}
@book{doe2024, title={Second Work}, author={Doe, Jane}, year={2024}}`
  },
  { path: "figures/result.png", content: "binary placeholder" },
  { path: "styles/local.sty", content: String.raw`\providecommand\localmacro{Local}` }
];

describe("LaTeX project intelligence", () => {
  it("indexes labels, bibliography metadata, packages, definitions, sections, and paths", () => {
    const index = buildLatexProjectIndex(PROJECT_FILES);

    expect(index.filePaths).toEqual([
      "chapters/methods.tex",
      "figures/result.png",
      "main.tex",
      "references.bib",
      "styles/local.sty"
    ]);
    expect(index.labels.map((entry) => entry.name)).toEqual(["sec:methods", "sec:intro"]);
    expect(index.labels[0].location).toMatchObject({ path: "chapters/methods.tex", line: 3 });
    expect(index.bibEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "smith2025",
          type: "article",
          author: "Smith, Alice and Jones, Bob",
          title: "A Nested Title",
          year: "2025"
        }),
        expect.objectContaining({ key: "doe2024", type: "book", title: "Second Work" })
      ])
    );
    expect(index.bibEntries.map((entry) => entry.key)).not.toContain("ignored");
    expect(index.packages.map((entry) => entry.name)).toEqual(["amsmath", "graphicx"]);
    expect(index.commands.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["\\vect", "\\rank", "\\localmacro"])
    );
    expect(index.environments.map((entry) => entry.name)).toContain("example");
    expect(index.sections.map((entry) => [entry.level, entry.title])).toEqual([
      [4, "Methods"],
      [3, "Introduction and motivation"]
    ]);
  });

  it("normalizes and de-duplicates file paths with the last content winning", () => {
    const index = buildLatexProjectIndex([
      { path: "./chapters/../main.tex", content: "\\label{old}" },
      { path: "main.tex", content: "\\label{new}" }
    ]);

    expect(index.filePaths).toEqual(["main.tex"]);
    expect(index.labels.map((entry) => entry.name)).toEqual(["new"]);
  });
});

describe("LaTeX project completion", () => {
  const index = buildLatexProjectIndex(PROJECT_FILES);

  function complete(source: string, activePath = "main.tex", packages: string[] = []) {
    const state = EditorState.create({ doc: source });
    const completionSource = createLatexProjectCompletionSource(index, {
      activePath,
      packageNames: packages
    });
    return completionSource(new CompletionContext(state, state.doc.length, false));
  }

  it("completes labels and replaces only the current comma-separated citation key", () => {
    const reference = complete("See \\eqref{sec:");
    expect(reference && "options" in reference ? reference.options.map((option) => option.label) : []).toEqual(
      expect.arrayContaining(["sec:intro", "sec:methods"])
    );

    const citationSource = "\\parencite{smith2025, do";
    const citation = complete(citationSource);
    expect(citation?.from).toBe(citationSource.indexOf("do"));
    expect(citation && "options" in citation ? citation.options.map((option) => option.label) : []).toContain(
      "doe2024"
    );
  });

  it("completes project files relative to the active source file", () => {
    const input = complete("\\input{", "chapters/methods.tex");
    expect(input && "options" in input ? input.options : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "../main", apply: "../main" }),
        expect.objectContaining({ label: "methods", apply: "methods" })
      ])
    );

    const graphic = complete("\\includegraphics[width=1cm]{", "chapters/methods.tex");
    expect(graphic && "options" in graphic ? graphic.options : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "../figures/result.png" })
      ])
    );

    const bibliography = complete("\\bibliography{");
    expect(bibliography && "options" in bibliography ? bibliography.options : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "references" })])
    );
  });

  it("completes catalog packages and project-defined commands and environments", () => {
    const packages = complete("\\usepackage{mat", "main.tex", ["mathtools"]);
    expect(packages && "options" in packages ? packages.options : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "amsmath", detail: "Used in this project" }),
        expect.objectContaining({ label: "mathtools", detail: "LaTeX package" })
      ])
    );

    const commands = complete("Text \\v");
    expect(commands && "options" in commands ? commands.options : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "\\vect" })])
    );

    const environments = complete("\\begin{exa");
    expect(environments && "options" in environments ? environments.options : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "example" })])
    );
  });

  it("does not offer semantic completions inside a LaTeX comment", () => {
    expect(complete("% See \\ref{sec:")).toBeNull();
  });

  it("gates semantic and package completion independently", () => {
    const packageState = EditorState.create({ doc: "\\usepackage{mat" });
    const withoutPackages = createLatexProjectCompletionSource(index, {
      activePath: "main.tex",
      packageNames: ["mathtools"],
      packageCompletion: false
    });
    expect(
      withoutPackages(new CompletionContext(packageState, packageState.doc.length, false))
    ).toBeNull();

    const packageOnly = createLatexProjectCompletionSource(index, {
      activePath: "main.tex",
      packageNames: ["mathtools"],
      semanticCompletion: false,
      packageCompletion: true
    });
    expect(
      packageOnly(new CompletionContext(packageState, packageState.doc.length, false))?.options
        .map((option) => option.label)
    ).toContain("mathtools");

    const referenceState = EditorState.create({ doc: "\\ref{sec:" });
    expect(
      packageOnly(new CompletionContext(referenceState, referenceState.doc.length, false))
    ).toBeNull();
  });
});

describe("LaTeX file reference resolution", () => {
  const index = buildLatexProjectIndex(PROJECT_FILES);

  it("resolves extensionless includes relative to the active file", () => {
    const source = "Before \\input{methods} after";
    const result = resolveLatexFileReferenceAt(
      source,
      source.indexOf("methods") + 2,
      "chapters/intro.tex",
      index
    );

    expect(result).toEqual(
      expect.objectContaining({
        path: "chapters/methods.tex",
        command: "input",
        reference: "methods"
      })
    );
    expect(source.slice(result?.from, result?.to)).toBe("methods");
  });

  it("resolves the citation-style list item under the cursor for bibliography files", () => {
    const source = "\\bibliography{missing, references}";
    const result = resolveLatexFileReferenceAt(
      source,
      source.indexOf("references") + 2,
      "main.tex",
      index
    );

    expect(result?.path).toBe("references.bib");
    expect(source.slice(result?.from, result?.to)).toBe("references");
  });

  it("ignores commented and unresolved references", () => {
    expect(resolveLatexFileReferenceAt("% \\input{main}", 12, "main.tex", index)).toBeNull();
    expect(resolveLatexFileReferenceAt("\\input{missing}", 10, "main.tex", index)).toBeNull();
  });
});
