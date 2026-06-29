import { describe, expect, it } from "vitest";
import {
  createCompletedPreviewCompilerStatus,
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
