import type { CompileDiagnostic } from "./types";

interface TypstStructuredDiagnosticLike {
  package: string;
  path: string;
  range: string;
  severity: string;
  message: string;
}

interface ParsedDiagnosticRange {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

// Typst's structured diagnostic ranges appear to land one line early relative
// to the editor's document model in this app, so normalize them here before
// they reach CodeMirror decorations.
const TYPST_DIAGNOSTIC_LINE_OFFSET = 1;

const TYPST_RANGE_PATTERN =
  /^(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;

export function normalizeTypstDiagnostic(
  diagnostic: TypstStructuredDiagnosticLike
): CompileDiagnostic {
  const parsedRange = parseTypstRange(diagnostic.range);

  return {
    message: diagnostic.message,
    severity:
      diagnostic.severity.toLowerCase() === "warning" ? "warning" : "error",
    path: diagnostic.path || undefined,
    range: diagnostic.range || undefined,
    packageName: diagnostic.package || undefined,
    ...parsedRange
  };
}

function parseTypstRange(range: string): ParsedDiagnosticRange | null {
  if (!range) {
    return null;
  }

  const match = range.match(TYPST_RANGE_PATTERN);

  if (!match) {
    return null;
  }

  const line = Number.parseInt(match[1], 10);
  const column = Number.parseInt(match[2], 10);
  const explicitEndLine = match[3] ? Number.parseInt(match[3], 10) : line;
  const endColumn = match[4]
    ? Number.parseInt(match[4], 10)
    : column;

  if (
    Number.isNaN(line) ||
    Number.isNaN(column) ||
    Number.isNaN(explicitEndLine) ||
    Number.isNaN(endColumn)
  ) {
    return null;
  }

  return {
    line: line + TYPST_DIAGNOSTIC_LINE_OFFSET,
    column,
    endLine: explicitEndLine + TYPST_DIAGNOSTIC_LINE_OFFSET,
    endColumn
  };
}
