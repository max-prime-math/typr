import type { CompileDiagnostic } from "../compiler/types";

/**
 * Prefer LSP wording when the compiler has reported the same diagnostic at the
 * same source location. Compilation still runs for preview generation and any
 * compiler-only failures remain visible.
 */
export function mergeEditorDiagnostics(
  lintDiagnostics: CompileDiagnostic[],
  externalDiagnostics: CompileDiagnostic[],
  compilerDiagnostics: CompileDiagnostic[]
): CompileDiagnostic[] {
  const lspDiagnostics = externalDiagnostics.filter((diagnostic) => diagnostic.provenance?.kind === "lsp");
  const otherDiagnostics = [
    ...lintDiagnostics,
    ...externalDiagnostics.filter((diagnostic) => diagnostic.provenance?.kind !== "lsp"),
    ...compilerDiagnostics
  ];

  return [
    ...otherDiagnostics.filter(
      (diagnostic) => !lspDiagnostics.some((lspDiagnostic) => isSameDiagnostic(lspDiagnostic, diagnostic))
    ),
    ...lspDiagnostics
  ];
}

function isSameDiagnostic(lspDiagnostic: CompileDiagnostic, otherDiagnostic: CompileDiagnostic): boolean {
  if ((lspDiagnostic.path ?? "") !== (otherDiagnostic.path ?? "")) {
    return false;
  }

  if (
    lspDiagnostic.line !== undefined &&
    lspDiagnostic.column !== undefined &&
    (lspDiagnostic.line !== otherDiagnostic.line || lspDiagnostic.column !== otherDiagnostic.column)
  ) {
    return false;
  }

  return normalizeMessage(lspDiagnostic.message, true) === normalizeMessage(otherDiagnostic.message, false);
}

function normalizeMessage(message: string, stripLspSource: boolean): string {
  return message
    .replace(stripLspSource ? /^[^:\n]+:\s*/ : /^/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}
