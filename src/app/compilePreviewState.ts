import type { CompileResult, CompilerStatus } from "../compiler/types";
import {
  getSourceLanguage,
  isCompilableSourceFile,
  normalizeCompilerPath,
  type SourceLanguage
} from "../compiler/sourceFileTypes";
import type { LatexCompileMode } from "../compiler/latexCompiler";

interface CompileInputSnapshot {
  diagramRevision: string;
  source: string;
  sourcePath: string;
}

export type CompilePreviewEvent =
  | {
      type: "restore-requested";
      language: "typst" | "latex";
      result: Extract<CompileResult, { ok: true }> | null;
    }
  | {
      type: "manual-compile-requested";
      language: SourceLanguage;
      latexMode: LatexCompileMode;
      result: Extract<CompileResult, { ok: true }> | null;
    }
  | {
      type: "source-switched";
      hasScheduledCompileForSource: boolean;
      isCompilable: boolean;
      language: SourceLanguage;
    }
  | {
      type: "compile-completed";
      completed: CompileInputSnapshot;
      pending: CompileInputSnapshot;
    };

export type CompilePreviewTransition =
  | {
      type: "restore";
      result: Extract<CompileResult, { ok: true }>;
      statusLabel: "Restored Typst preview" | "Saved PDF preview ready";
    }
  | {
      type: "schedule";
      debounced: boolean;
      trigger: "auto" | "manual" | "queued";
    }
  | { type: "reset"; status: CompilerStatus }
  | { type: "preserve" }
  | { type: "settle" };

export function decideCompilePreviewTransition(
  event: CompilePreviewEvent
): CompilePreviewTransition {
  switch (event.type) {
    case "restore-requested":
      if (event.result) {
        return {
          type: "restore",
          result: event.result,
          statusLabel:
            event.language === "typst"
              ? "Restored Typst preview"
              : "Saved PDF preview ready"
        };
      }

      return event.language === "typst"
        ? { type: "schedule", debounced: false, trigger: "auto" }
        : { type: "preserve" };
    case "manual-compile-requested":
      if (event.language === "latex" && event.latexMode === "quick" && event.result) {
        return {
          type: "restore",
          result: event.result,
          statusLabel: "Saved PDF preview ready"
        };
      }

      return { type: "schedule", debounced: false, trigger: "manual" };
    case "source-switched":
      if (event.hasScheduledCompileForSource) {
        return { type: "preserve" };
      }

      return {
        type: "reset",
        status: {
          phase: "idle",
          mode: "worker",
          label: event.isCompilable
            ? event.language === "latex"
              ? "LaTeX ready"
              : "Typst ready"
            : "No compiler for active file",
          detail:
            event.language === "latex"
              ? "Press Compile or Ctrl+Enter to update the PDF preview."
              : undefined
        }
      };
    case "compile-completed":
      return compileInputsDiffer(event.completed, event.pending)
        ? { type: "schedule", debounced: false, trigger: "queued" }
        : { type: "settle" };
  }
}

function compileInputsDiffer(
  completed: CompileInputSnapshot,
  pending: CompileInputSnapshot
): boolean {
  return (
    pending.source !== completed.source ||
    pending.sourcePath !== completed.sourcePath ||
    pending.diagramRevision !== completed.diagramRevision
  );
}

export interface LatexPdfPreviewPathState {
  sourcePath: string;
  result: CompileResult | null;
  isCompiling: boolean;
}

export interface CompilePreviewState {
  result: CompileResult | null;
  lastSuccessfulResult: Extract<CompileResult, { ok: true }> | null;
  compilerStatus: CompilerStatus;
  isCompiling: boolean;
}

export function createIdleCompilerStatusForSource(path: string): CompilerStatus {
  const language = getSourceLanguage(path);
  const isCompilable = isCompilableSourceFile(path);

  return {
    phase: "idle",
    mode: "worker",
    label: isCompilable
      ? language === "latex"
        ? "LaTeX ready"
        : "Typst ready"
      : "No compiler for active file",
    detail:
      language === "latex"
        ? "Press Compile or Ctrl+Enter to update the PDF preview."
        : undefined
  };
}

export function createCompilePreviewState(
  path: string,
  overrides: Partial<CompilePreviewState> = {}
): CompilePreviewState {
  return {
    result: null,
    lastSuccessfulResult: null,
    compilerStatus: createIdleCompilerStatusForSource(path),
    isCompiling: false,
    ...overrides
  };
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
  completedSource,
  completedSourcePath,
  pendingDiagramRevision,
  pendingSource,
  pendingSourcePath
}: {
  completedDiagramRevision: string;
  completedSource: string;
  completedSourcePath: string;
  pendingDiagramRevision: string;
  pendingSource: string;
  pendingSourcePath: string;
}): boolean {
  return decideCompilePreviewTransition({
    type: "compile-completed",
    completed: {
      diagramRevision: completedDiagramRevision,
      source: completedSource,
      sourcePath: completedSourcePath
    },
    pending: {
      diagramRevision: pendingDiagramRevision,
      source: pendingSource,
      sourcePath: pendingSourcePath
    }
  }).type === "schedule";
}

export function shouldShowCompileActivity({
  compilerStatus,
  hasActiveCompileWork,
  isActiveCompileTarget,
  isCompiling
}: {
  compilerStatus: CompilerStatus;
  hasActiveCompileWork: boolean;
  isActiveCompileTarget: boolean;
  isCompiling: boolean;
}): boolean {
  return (
    isCompiling &&
    isActiveCompileTarget &&
    hasActiveCompileWork &&
    compilerStatus.phase !== "idle" &&
    compilerStatus.phase !== "ready" &&
    compilerStatus.phase !== "error"
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
