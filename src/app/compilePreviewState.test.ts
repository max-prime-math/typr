import { describe, expect, it } from "vitest";
import {
  collectAvailableLatexPdfPreviewPaths,
  createCompletedPreviewCompilerStatus,
  decideCompilePreviewTransition,
  getCompilePreviewSourcePathsForResult,
  getLatexPdfOutputPath,
  shouldRunPendingCompileAfterCompletion,
  shouldShowCompileActivity
} from "./compilePreviewState";
import type { CompileResult, CompilerStatus } from "../compiler/types";

describe("compile preview state", () => {
  const compilingStatus: CompilerStatus = {
    phase: "compiling",
    mode: "worker",
    label: "Compiling LaTeX"
  };

  const typstResult: Extract<CompileResult, { ok: true }> = {
    ok: true,
    engine: "typst-ts",
    diagnostics: [],
    output: {
      kind: "svg",
      content: "<svg />"
    }
  };
  const latexResult: Extract<CompileResult, { ok: true }> = {
    ok: true,
    engine: "busytex",
    diagnostics: [],
    output: {
      kind: "pdf",
      content: "",
      artifactData: new Uint8Array([1, 2, 3])
    }
  };

  it("restores a matching Typst cache hit", () => {
    expect(
      decideCompilePreviewTransition({
        type: "restore-requested",
        language: "typst",
        result: typstResult
      })
    ).toEqual({
      type: "restore",
      result: typstResult,
      statusLabel: "Restored Typst preview"
    });
  });

  it("schedules compilation after a stale Typst cache miss", () => {
    expect(
      decideCompilePreviewTransition({
        type: "restore-requested",
        language: "typst",
        result: null
      })
    ).toEqual({
      type: "schedule",
      debounced: false,
      trigger: "auto"
    });
  });

  it("restores a fresh saved LaTeX PDF", () => {
    expect(
      decideCompilePreviewTransition({
        type: "restore-requested",
        language: "latex",
        result: latexResult
      })
    ).toEqual({
      type: "restore",
      result: latexResult,
      statusLabel: "Saved PDF preview ready"
    });
  });

  it("schedules compilation after a stale saved PDF miss", () => {
    expect(
      decideCompilePreviewTransition({
        type: "manual-compile-requested",
        language: "latex",
        latexMode: "quick",
        result: null
      })
    ).toEqual({
      type: "schedule",
      debounced: false,
      trigger: "manual"
    });
  });

  it("uses a saved PDF only for a quick manual compile", () => {
    expect(
      decideCompilePreviewTransition({
        type: "manual-compile-requested",
        language: "latex",
        latexMode: "quick",
        result: latexResult
      })
    ).toEqual({
      type: "restore",
      result: latexResult,
      statusLabel: "Saved PDF preview ready"
    });
    expect(
      decideCompilePreviewTransition({
        type: "manual-compile-requested",
        language: "latex",
        latexMode: "full",
        result: latexResult
      })
    ).toEqual({
      type: "schedule",
      debounced: false,
      trigger: "manual"
    });
  });

  it("resets preview state when the source switches without matching scheduled work", () => {
    expect(
      decideCompilePreviewTransition({
        type: "source-switched",
        hasScheduledCompileForSource: false,
        isCompilable: true,
        language: "latex"
      })
    ).toEqual({
      type: "reset",
      status: {
        phase: "idle",
        mode: "worker",
        label: "LaTeX ready",
        detail: "Press Compile or Ctrl+Enter to update the PDF preview."
      }
    });
  });

  it("schedules the queued source after the active compile completes", () => {
    expect(
      decideCompilePreviewTransition({
        type: "compile-completed",
        completed: {
          diagramRevision: "diagram-a",
          source: "= One",
          sourcePath: "one.typ"
        },
        pending: {
          diagramRevision: "diagram-a",
          source: "= Two",
          sourcePath: "two.typ"
        }
      })
    ).toEqual({
      type: "schedule",
      debounced: false,
      trigger: "queued"
    });
  });

  it("marks returned LaTeX compile failures as errors", () => {
    const result: CompileResult = {
      ok: false,
      engine: "busytex",
      errors: [
        {
          message: "Undefined control sequence.",
          severity: "error",
          path: "main.tex"
        }
      ]
    };

    expect(createCompletedPreviewCompilerStatus(result, compilingStatus)).toEqual({
      phase: "error",
      mode: "worker",
      label: "LaTeX preview failed",
      detail: "Undefined control sequence."
    });
  });

  it("marks successful PDF compiles as ready", () => {
    const result: CompileResult = {
      ok: true,
      engine: "busytex",
      diagnostics: [],
      output: {
        kind: "pdf",
        content: "",
        artifactData: new Uint8Array([1, 2, 3])
      }
    };

    expect(createCompletedPreviewCompilerStatus(result, compilingStatus)).toEqual({
      phase: "ready",
      mode: "worker",
      label: "PDF preview ready"
    });
  });


  it("does not show compile activity for stale preview state without real compiler work", () => {
    expect(
      shouldShowCompileActivity({
        compilerStatus: compilingStatus,
        hasActiveCompileWork: false,
        isActiveCompileTarget: true,
        isCompiling: true
      })
    ).toBe(false);
  });

  it("does not show compile activity for previews that are not the active compile target", () => {
    expect(
      shouldShowCompileActivity({
        compilerStatus: compilingStatus,
        hasActiveCompileWork: true,
        isActiveCompileTarget: false,
        isCompiling: true
      })
    ).toBe(false);
  });

  it("only shows compile activity while a compile-status phase is active", () => {
    expect(
      shouldShowCompileActivity({
        compilerStatus: compilingStatus,
        hasActiveCompileWork: true,
        isActiveCompileTarget: true,
        isCompiling: true
      })
    ).toBe(true);
    expect(
      shouldShowCompileActivity({
        compilerStatus: {
          phase: "ready",
          mode: "worker",
          label: "Saved PDF preview ready"
        },
        hasActiveCompileWork: true,
        isActiveCompileTarget: true,
        isCompiling: true
      })
    ).toBe(false);
  });

  it("keeps a pending LaTeX PDF preview path available before the artifact exists", () => {
    expect(
      [...collectAvailableLatexPdfPreviewPaths([
        {
          sourcePath: "chapters/intro.tex",
          result: null,
          isCompiling: true
        }
      ])]
    ).toEqual(["chapters/intro.pdf"]);
  });

  it("uses compile metadata to identify the completed LaTeX PDF output path", () => {
    const result: CompileResult = {
      ok: true,
      engine: "busytex",
      diagnostics: [],
      output: {
        kind: "pdf",
        content: "",
        artifactData: new Uint8Array([1, 2, 3])
      },
      metadata: {
        strategy: {
          requestedMode: "full",
          effectiveMode: "full",
          previewKind: "root-document",
          activeFilePath: "chapters/intro.tex",
          mainFilePath: "main.tex",
          reason: "Full compile requested"
        }
      }
    };

    expect(
      [...collectAvailableLatexPdfPreviewPaths([
        {
          sourcePath: "chapters/intro.tex",
          result,
          isCompiling: false
        }
      ])]
    ).toEqual(["main.pdf"]);
    expect(getCompilePreviewSourcePathsForResult("chapters/intro.tex", result)).toEqual([
      "chapters/intro.tex",
      "main.tex"
    ]);
  });

  it("derives LaTeX PDF output paths from source paths", () => {
    expect(getLatexPdfOutputPath("main.tex")).toBe("main.pdf");
    expect(getLatexPdfOutputPath("notes/paper.latex")).toBe("notes/paper.pdf");
  });

  it("reruns pending compiles when only the source path changed", () => {
    expect(
      shouldRunPendingCompileAfterCompletion({
        completedDiagramRevision: "diagram-a",
        completedSource: "\\section{Same}",
        completedSourcePath: "chapter-one.tex",
        pendingDiagramRevision: "diagram-a",
        pendingSource: "\\section{Same}",
        pendingSourcePath: "chapter-two.tex"
      })
    ).toBe(true);
  });

  it("does not rerun when the pending compile still matches the completed compile", () => {
    expect(
      shouldRunPendingCompileAfterCompletion({
        completedDiagramRevision: "diagram-a",
        completedSource: "\\section{Same}",
        completedSourcePath: "chapter-one.tex",
        pendingDiagramRevision: "diagram-a",
        pendingSource: "\\section{Same}",
        pendingSourcePath: "chapter-one.tex"
      })
    ).toBe(false);
  });
});
