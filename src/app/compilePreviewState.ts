import type { CompileResult, CompilerStatus } from "../compiler/types";

export function createCompletedPreviewCompilerStatus(
  result: CompileResult,
  currentStatus: CompilerStatus
): CompilerStatus {
  if (result.ok) {
    return {
      phase: "ready",
      mode: currentStatus.mode,
      label: result.output.kind === "pdf" ? "PDF preview ready" : "Preview ready"
    };
  }

  return {
    phase: "error",
    mode: currentStatus.mode,
    label: result.engine === "busytex" ? "LaTeX preview failed" : "Preview failed",
    detail: result.errors[0]?.message
  };
}

export function shouldRunPendingCompileAfterCompletion({
  completedDiagramRevision,
  completedGraphRevision,
  completedSource,
  completedSourcePath,
  pendingDiagramRevision,
  pendingGraphRevision,
  pendingSource,
  pendingSourcePath
}: {
  completedDiagramRevision: string;
  completedGraphRevision: string;
  completedSource: string;
  completedSourcePath: string;
  pendingDiagramRevision: string;
  pendingGraphRevision: string;
  pendingSource: string;
  pendingSourcePath: string;
}): boolean {
  return (
    pendingSource !== completedSource ||
    pendingSourcePath !== completedSourcePath ||
    pendingDiagramRevision !== completedDiagramRevision ||
    pendingGraphRevision !== completedGraphRevision
  );
}
