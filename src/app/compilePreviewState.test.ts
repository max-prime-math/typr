import { describe, expect, it } from "vitest";
import {
  collectAvailableLatexPdfPreviewPaths,
  createCompletedPreviewCompilerStatus,
  getCompilePreviewSourcePathsForResult,
  getLatexPdfOutputPath,
  shouldRunPendingCompileAfterCompletion
} from "./compilePreviewState";
import type { CompileResult, CompilerStatus } from "../compiler/types";

describe("compile preview state", () => {
  const compilingStatus: CompilerStatus = {
    phase: "compiling",
    mode: "worker",
    label: "Compiling LaTeX"
  };

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
        completedGraphRevision: "graph-a",
        completedSource: "\\section{Same}",
        completedSourcePath: "chapter-one.tex",
        pendingDiagramRevision: "diagram-a",
        pendingGraphRevision: "graph-a",
        pendingSource: "\\section{Same}",
        pendingSourcePath: "chapter-two.tex"
      })
    ).toBe(true);
  });

  it("does not rerun when the pending compile still matches the completed compile", () => {
    expect(
      shouldRunPendingCompileAfterCompletion({
        completedDiagramRevision: "diagram-a",
        completedGraphRevision: "graph-a",
        completedSource: "\\section{Same}",
        completedSourcePath: "chapter-one.tex",
        pendingDiagramRevision: "diagram-a",
        pendingGraphRevision: "graph-a",
        pendingSource: "\\section{Same}",
        pendingSourcePath: "chapter-one.tex"
      })
    ).toBe(false);
  });
});
