import { describe, expect, it } from "vitest";
import {
  analyzeLatexDirtyStateForTest,
  createLatexQuickPreviewPlan,
  formatLatexFailureLog,
  isRuntimeFontGenerationFailure,
  shouldRetryWithFullBusyTexPackages
} from "./latexCompiler";

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
