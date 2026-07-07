import type { CompileResult, CompilerStatus } from "../compiler/types";
import { normalizeCompilerPath } from "../compiler/sourceFileTypes";

export interface LatexPdfPreviewPathState {
  sourcePath: string;
  result: CompileResult | null;
  isCompiling: boolean;
}

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

export function collectAvailableLatexPdfPreviewPaths(
  states: LatexPdfPreviewPathState[]
): Set<string> {
  const previewPaths = new Set<string>();

  for (const state of states) {
    const normalizedSourcePath = normalizeCompilerPath(state.sourcePath) || state.sourcePath;

    if (!normalizedSourcePath) {
      continue;
    }

    if (state.isCompiling && isLatexPdfSourcePath(normalizedSourcePath)) {
      previewPaths.add(getLatexPdfOutputPath(normalizedSourcePath));
    }

    if (state.result?.ok && state.result.output.kind === "pdf" && state.result.output.artifactData) {
      const resultSourcePath = getLatexPdfSourcePathForResult(
        normalizedSourcePath,
        state.result
      );

      if (isLatexPdfSourcePath(resultSourcePath)) {
        previewPaths.add(getLatexPdfOutputPath(resultSourcePath));
      }
    }
  }

  return previewPaths;
}

export function getCompilePreviewSourcePathsForResult(
  sourcePath: string,
  result: CompileResult
): string[] {
  const normalizedSourcePath = normalizeCompilerPath(sourcePath) || sourcePath;

  if (!normalizedSourcePath || !result.ok || result.output.kind !== "pdf") {
    return normalizedSourcePath ? [normalizedSourcePath] : [];
  }

  return uniquePaths([
    normalizedSourcePath,
    getLatexPdfSourcePathForResult(normalizedSourcePath, result)
  ]);
}

export function getLatexPdfSourcePathForResult(
  sourcePath: string,
  result: Extract<CompileResult, { ok: true }>
): string {
  const strategy = result.metadata?.strategy;

  if (!strategy) {
    return normalizeCompilerPath(sourcePath) || sourcePath;
  }

  const sourcePathForResult =
    strategy.previewKind === "subfile-wrapper"
      ? strategy.activeFilePath
      : strategy.mainFilePath;

  return normalizeCompilerPath(sourcePathForResult) || sourcePathForResult;
}

export function getLatexPdfOutputPath(sourcePath: string): string {
  const normalizedSourcePath = normalizeCompilerPath(sourcePath) || sourcePath;

  if (/\.(tex|ltx|latex)$/i.test(normalizedSourcePath)) {
    return normalizedSourcePath.replace(/\.(tex|ltx|latex)$/i, ".pdf");
  }

  return `${normalizedSourcePath}.pdf`;
}

function isLatexPdfSourcePath(path: string): boolean {
  return /\.(tex|ltx|latex)$/i.test(path);
}

function uniquePaths(paths: string[]): string[] {
  const unique = new Set<string>();

  for (const path of paths) {
    const normalizedPath = normalizeCompilerPath(path) || path;

    if (normalizedPath) {
      unique.add(normalizedPath);
    }
  }

  return [...unique];
}
