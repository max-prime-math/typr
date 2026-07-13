import type {
  CompileDiagnostic,
  CompileMetadata,
  CompileResult
} from "../compiler/types";
import { areOptionalBytesEqual } from "../utils/bytes";

export interface CompileResultCompletion {
  previewResult: CompileResult;
  diagnosticResult: CompileResult;
  outputChanged: boolean;
  buildLog: {
    diagnostics: CompileDiagnostic[];
    metadata?: CompileMetadata;
  };
}

export function resolveCompileResultCompletion(
  current: CompileResult | null,
  completed: CompileResult
): CompileResultCompletion {
  const resultWithReusedOutput = reuseCompileOutputIfUnchanged(current, completed);

  return {
    previewResult: shouldReusePreviewResult(current, resultWithReusedOutput)
      ? current
      : resultWithReusedOutput,
    diagnosticResult: shouldReuseDiagnosticResult(current, resultWithReusedOutput)
      ? current
      : resultWithReusedOutput,
    outputChanged: didCompileOutputChange(current, completed),
    buildLog: {
      diagnostics: completed.ok ? completed.diagnostics : completed.errors,
      metadata: completed.metadata
    }
  };
}

function shouldReusePreviewResult(
  current: CompileResult | null,
  next: CompileResult
): current is CompileResult {
  if (!current || current.ok !== next.ok || current.engine !== next.engine) {
    return false;
  }

  if (current.ok && next.ok) {
    return current.output === next.output;
  }

  return !current.ok && !next.ok && areDiagnosticsEqual(current.errors, next.errors);
}

function shouldReuseDiagnosticResult(
  current: CompileResult | null,
  next: CompileResult
): current is CompileResult {
  if (!current || current.ok !== next.ok || current.engine !== next.engine) {
    return false;
  }

  if (current.ok && next.ok) {
    return (
      current.output === next.output &&
      areDiagnosticsEqual(current.diagnostics, next.diagnostics)
    );
  }

  return !current.ok && !next.ok && areDiagnosticsEqual(current.errors, next.errors);
}

function reuseCompileOutputIfUnchanged(
  current: CompileResult | null,
  next: CompileResult
): CompileResult {
  if (!current?.ok || !next.ok || current.engine !== next.engine) {
    return next;
  }

  if (!areCompileRenderOutputsEqual(current, next)) {
    return next;
  }

  if (areOptionalBytesEqual(current.output.sourceMapData, next.output.sourceMapData)) {
    return {
      ...next,
      output: current.output
    };
  }

  return {
    ...next,
    output: {
      ...next.output,
      artifactData: current.output.artifactData
    }
  };
}

function didCompileOutputChange(
  current: CompileResult | null,
  next: CompileResult
): boolean {
  if (!current?.ok || !next.ok || current.engine !== next.engine) {
    return true;
  }

  return !areCompileRenderOutputsEqual(current, next);
}

function areCompileRenderOutputsEqual(
  current: Extract<CompileResult, { ok: true }>,
  next: Extract<CompileResult, { ok: true }>
): boolean {
  if (current.output.kind !== next.output.kind) {
    return false;
  }

  if (current.output.kind !== "pdf" && current.output.content !== next.output.content) {
    return false;
  }

  return areOptionalBytesEqual(
    current.output.artifactData,
    next.output.artifactData
  );
}


function areDiagnosticsEqual(
  current: CompileDiagnostic[],
  next: CompileDiagnostic[]
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((currentDiagnostic, index) => {
    const nextDiagnostic = next[index];

    return (
      currentDiagnostic.message === nextDiagnostic.message &&
      currentDiagnostic.severity === nextDiagnostic.severity &&
      currentDiagnostic.path === nextDiagnostic.path &&
      currentDiagnostic.range === nextDiagnostic.range &&
      currentDiagnostic.packageName === nextDiagnostic.packageName &&
      currentDiagnostic.line === nextDiagnostic.line &&
      currentDiagnostic.column === nextDiagnostic.column &&
      currentDiagnostic.endLine === nextDiagnostic.endLine &&
      currentDiagnostic.endColumn === nextDiagnostic.endColumn
    );
  });
}
