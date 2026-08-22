import { describe, expect, it } from "vitest";
import {
  analyzeLatexDirtyStateForTest,
  collectLatexFiles,
  createLatexFilesWithPdfTexFontMapOverridesForTest,
  createLatexQuickPreviewPlan,
  formatLatexErrorForTest,
  formatLatexFailureLog,
  isLikelyTypstSyntaxInLatexLog,
  isRuntimeFontGenerationFailure,
  shouldRetryWithFullBusyTexPackages
} from "./latexCompiler";
import { createEmptyProjectRepository, writeProjectFile } from "../project/projectState";

describe("LaTeX compiler diagnostics", () => {
  const mktexpkLog = [
    "TeX packages: [tasks]",
    "TeX packages unresolved: []",
    "Data packages used (preloaded): [/core/busytex/texlive-basic.js]",
    "Data packages used (not preloaded): []",
    "!pdfTeX error: /bin/busytex (file tcrm1200): Font tcrm1200 at 600 not found",
    "==> Fatal error occurred, no output PDF file produced!",
    "== STDERR:",
    "kpathsea: Running mktexpk --mfmode / --bdpi 600 --mag 1+0/600 --dpi 600 tcrm1200",
    "kpathsea: fork(): Function not implemented",
    "kpathsea: Appending font creation commands to missfont.log."
  ].join("\n");

  it("detects runtime font generation failures", () => {
    expect(isRuntimeFontGenerationFailure(mktexpkLog)).toBe(true);
    expect(shouldRetryWithFullBusyTexPackages(mktexpkLog)).toBe(true);
  });

  it("explains mktexpk failures and includes package resolver context", () => {
    const message = formatLatexFailureLog(mktexpkLog, { retriedFullDataPackages: true });

    expect(message).toContain("BusyTeX tried to generate or locate a TeX font at runtime");
    expect(message).toContain("WebAssembly cannot run external helpers");
    expect(message).toContain("Typr already retried");
    expect(message).toContain("BusyTeX package resolver");
    expect(message).toContain("tcrm1200");
    expect(message).toContain("mktexpk");
  });

  it("explains pdfTeX font-map retry attempts", () => {
    const message = formatLatexFailureLog(mktexpkLog, {
      retriedFullDataPackages: true,
      retriedPdfTexFontMapOverrides: true
    });

    expect(message).toContain("CM-Super T1/TS1 font maps");
  });

  it("explains Typst syntax found during a LaTeX compile", () => {
    const typstSyntaxLog = [
      "(./2.3.calculator-lab-estimating-derivatives.tex",
      "! You can't use `macro parameter character #' in horizontal mode.",
      'l.2 # figure(image("figures/diagram 1.svg"))',
      "This document may require an external tool."
    ].join("\n");
    const message = formatLatexFailureLog(typstSyntaxLog);

    expect(isLikelyTypstSyntaxInLatexLog(typstSyntaxLog)).toBe(true);
    expect(message).toContain("Typst syntax inside a file being compiled as LaTeX");
    expect(message).toContain("# figure(image(...))");
    expect(message).not.toContain("shell escape");
  });

  it("explains missing BusyTeX runtime assets", () => {
    const message = formatLatexErrorForTest(
      new Error(
        "Exception in Typr BusyTeX worker: NetworkError: A network error occurred. Stack: self.onmessage@http://localhost:5173/typr-busytex-worker.js:21:20"
      )
    );

    expect(message).toContain("BusyTeX assets are required under public/core/busytex");
    expect(message).toContain("npm run busytex:assets");
  });
});

describe("LaTeX quick preview planning", () => {
  it("wraps a non-standalone active file with the root preamble", () => {
    const plan = createLatexQuickPreviewPlan(
      [
        {
          path: "main.tex",
          content: [
            "\\documentclass{book}",
            "\\usepackage{amsmath}",
            "\\begin{document}",
            "\\include{chapters/one}",
            "\\end{document}"
          ].join("\n")
        },
        {
          path: "chapters/one.tex",
          content: "\\chapter{One}\nHello"
        }
      ],
      "chapters/one.tex",
      "quick"
    );

    expect(plan.previewKind).toBe("subfile-wrapper");
    expect(plan.mainFilePath).toBe(".typr-preview.tex");
    const wrapper = plan.files.find((file) => file.path === ".typr-preview.tex");
    expect(wrapper?.content).toContain("\\documentclass{book}");
    expect(wrapper?.content).toContain("\\usepackage{amsmath}");
    expect(wrapper?.content).toContain("\\input{chapters/one.tex}");
    expect(wrapper?.content).not.toContain("\\include{chapters/one}");
  });

  it("places the wrapper beside a nested root file", () => {
    const plan = createLatexQuickPreviewPlan(
      [
        {
          path: "book/main.tex",
          content: "\\documentclass{article}\n\\begin{document}\n\\input{sections/a}\n\\end{document}"
        },
        {
          path: "book/sections/a.tex",
          content: "Nested section"
        }
      ],
      "book/sections/a.tex",
      "quick"
    );

    expect(plan.previewKind).toBe("subfile-wrapper");
    expect(plan.mainFilePath).toBe("book/.typr-preview.tex");
    const wrapper = plan.files.find((file) => file.path === "book/.typr-preview.tex");
    expect(wrapper?.content).toContain("\\input{sections/a.tex}");
  });

  it("does not wrap standalone documents or full compiles", () => {
    const files = [
      {
        path: "main.tex",
        content: "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}"
      }
    ];

    expect(createLatexQuickPreviewPlan(files, "main.tex", "quick").previewKind).toBe("document");
    expect(createLatexQuickPreviewPlan(files, "main.tex", "full").previewKind).toBe("document");
  });

  it("injects pdfTeX font map overrides before the document body", () => {
    const files = createLatexFilesWithPdfTexFontMapOverridesForTest(
      [
        {
          path: "notes/main.tex",
          content: "\\documentclass{article}\n\\usepackage{textcomp}\n\\begin{document}\nHello\n\\end{document}"
        }
      ],
      "notes/main.tex"
    );

    const mainFile = files.find((file) => file.path === "notes/main.tex");
    const fontMapFile = files.find((file) => file.path === "notes/.typr-pdftex-fontmaps.tex");

    expect(mainFile?.content).toContain("\\documentclass{article}\n\\usepackage{type1ec}");
    expect(mainFile?.content).toContain("\\input{.typr-pdftex-fontmaps.tex}");
    expect(fontMapFile?.content).toContain("\\pdfmapfile{+cm-super-t1.map}");
    expect(fontMapFile?.content).toContain("\\pdfmapfile{+cm-super-ts1.map}");
  });
});

describe("LaTeX project file collection", () => {
  it("collects referenced dependencies without cloning unrelated project binaries", () => {
    let project = createEmptyProjectRepository({
      displayName: "Dependency closure",
      defaultFileName: null
    });
    const mainSource = [
      "\\documentclass{article}",
      "\\usepackage{styles/local}",
      "\\addbibresource{refs/sources.bib}",
      "\\begin{document}",
      "\\input{chapters/intro}",
      "\\includegraphics{figures/chart}",
      "\\end{document}"
    ].join("\n");

    project = writeProjectFile(project, "main.tex", mainSource);
    project = writeProjectFile(project, "chapters/intro.tex", "\\lstinputlisting{../data/table.csv}");
    project = writeProjectFile(project, "styles/local.sty", "\\ProvidesPackage{local}");
    project = writeProjectFile(project, "refs/sources.bib", "@book{one,title={One}}");
    project = writeProjectFile(project, "data/table.csv", "x,y\n1,2\n");
    project = writeProjectFile(project, "figures/chart.pdf", new Uint8Array([1, 2, 3]));
    project = writeProjectFile(project, "resources/textbook.pdf", new Uint8Array(16 * 1024 * 1024));
    project = writeProjectFile(
      project,
      "notes/unrelated.tex",
      "\\documentclass{article}\\begin{document}Unrelated\\end{document}"
    );

    const files = collectLatexFiles(project, "main.tex", mainSource, []);

    expect(files.map((file) => file.path)).toEqual([
      "chapters/intro.tex",
      "data/table.csv",
      "figures/chart.pdf",
      "main.tex",
      "refs/sources.bib",
      "styles/local.sty"
    ]);
    expect(files.find((file) => file.path === "figures/chart.pdf")?.content).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(files.some((file) => file.path === "resources/textbook.pdf")).toBe(false);
    expect(files.some((file) => file.path === "notes/unrelated.tex")).toBe(false);
  });

  it("includes the detected root and its dependencies for an active subfile", () => {
    let project = createEmptyProjectRepository({
      displayName: "Subfile closure",
      defaultFileName: null
    });
    const rootSource = [
      "\\documentclass{book}",
      "\\begin{document}",
      "\\include{chapters/one}",
      "\\includegraphics{figures/root-chart.png}",
      "\\end{document}"
    ].join("\n");
    const chapterSource = "\\chapter{One}\nShort chapter";

    project = writeProjectFile(project, "main.tex", rootSource);
    project = writeProjectFile(project, "chapters/one.tex", chapterSource);
    project = writeProjectFile(project, "figures/root-chart.png", new Uint8Array([4, 5, 6]));
    project = writeProjectFile(project, "resources/unrelated.pdf", new Uint8Array(16 * 1024 * 1024));

    const files = collectLatexFiles(project, "chapters/one.tex", chapterSource, []);

    expect(files.map((file) => file.path)).toEqual([
      "chapters/one.tex",
      "figures/root-chart.png",
      "main.tex"
    ]);
  });
});

describe("LaTeX dirty analysis", () => {
  it("classifies ordinary body edits without requiring a full compile", () => {
    const previousFiles = [
      {
        path: "chapters/one.tex",
        content: "\\section{One}\nOld text"
      }
    ];
    const files = [
      {
        path: "chapters/one.tex",
        content: "\\section{One}\nNew text"
      }
    ];
    const dirty = analyzeLatexDirtyStateForTest(files, previousFiles);

    expect(dirty.status).toBe("changed");
    expect(dirty.requiresFullCompile).toBe(false);
    expect(dirty.categories).toContainEqual({ category: "tex-body", count: 1 });
  });

  it("classifies root preamble edits as full-compile changes", () => {
    const previousFiles = [
      {
        path: "main.tex",
        content: "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello\n\\end{document}"
      }
    ];
    const files = [
      {
        path: "main.tex",
        content: "\\documentclass{article}\n\\usepackage{mathtools}\n\\begin{document}\nHello\n\\end{document}"
      }
    ];
    const dirty = analyzeLatexDirtyStateForTest(files, previousFiles);

    expect(dirty.requiresFullCompile).toBe(true);
    expect(dirty.categories).toContainEqual({ category: "tex-preamble", count: 1 });
  });

  it("classifies bibliography edits as full-compile changes", () => {
    const dirty = analyzeLatexDirtyStateForTest(
      [
        {
          path: "refs.bib",
          content: "@book{a,title={New}}"
        }
      ],
      [
        {
          path: "refs.bib",
          content: "@book{a,title={Old}}"
        }
      ]
    );

    expect(dirty.requiresFullCompile).toBe(true);
    expect(dirty.categories).toContainEqual({ category: "bibliography", count: 1 });
  });
});
