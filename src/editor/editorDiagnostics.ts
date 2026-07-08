import { StateField } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
import { lintGutter, linter } from "@codemirror/lint";
import type { Diagnostic as CodeMirrorDiagnostic } from "@codemirror/lint";
import { Decoration, EditorView, GutterMarker, gutter } from "@codemirror/view";
import type { CompileDiagnostic } from "../compiler/types";

interface EditorDiagnosticLine {
  line: number;
  severity: "error" | "warning";
  message: string;
}

class DiagnosticMarker extends GutterMarker {
  constructor(
    private readonly severity: "error" | "warning",
    private readonly message: string
  ) {
    super();
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = `cm-diagnostic-marker cm-diagnostic-marker--${this.severity}`;
    marker.textContent = this.severity === "error" ? "!" : "•";
    marker.title = this.message;
    marker.setAttribute("aria-label", this.message);
    return marker;
  }
}

export function createEditorDiagnosticExtensions(
  diagnostics: CompileDiagnostic[],
  highlightErrors: boolean
): Extension[] {
  const lines = collectDiagnosticLines(diagnostics, highlightErrors);
  const decorationField = StateField.define({
    create: (state) => createDiagnosticDecorations(state, lines, diagnostics, highlightErrors),
    update: (_value, transaction) =>
      createDiagnosticDecorations(transaction.state, lines, diagnostics, highlightErrors),
    provide: (field) => EditorView.decorations.from(field)
  });

  const lineMap = new Map<number, EditorDiagnosticLine>();

  for (const diagnosticLine of lines) {
    lineMap.set(diagnosticLine.line, diagnosticLine);
  }

  return [
    linter((view) => toCodeMirrorDiagnostics(view.state, diagnostics, highlightErrors), { delay: 120 }),
    lintGutter({
      markerFilter: (codeMirrorDiagnostics) =>
        codeMirrorDiagnostics.filter((diagnostic) => !isHarperDiagnosticMessage(diagnostic.message)),
      tooltipFilter: (codeMirrorDiagnostics) =>
        codeMirrorDiagnostics.filter((diagnostic) => !isHarperDiagnosticMessage(diagnostic.message))
    }),
    decorationField,
    gutter({
      class: "cm-diagnostic-gutter",
      lineMarker(view, line) {
        const diagnosticLine = lineMap.get(view.state.doc.lineAt(line.from).number);

        if (!diagnosticLine) {
          return null;
        }

        return new DiagnosticMarker(diagnosticLine.severity, diagnosticLine.message);
      },
      initialSpacer() {
        return new DiagnosticMarker("warning", "Diagnostic");
      }
    })
  ];
}

export function toCodeMirrorDiagnostics(
  state: EditorState,
  diagnostics: CompileDiagnostic[],
  highlightErrors: boolean
): CodeMirrorDiagnostic[] {
  return diagnostics
    .map((diagnostic) => {
      const range = getDiagnosticRange(state, diagnostic);

      if (!range) {
        return null;
      }

      const severity = diagnostic.severity === "error" && !highlightErrors
        ? "warning"
        : diagnostic.severity;
      const isHarperDiagnostic = isHarperDiagnosticMessage(diagnostic.message);
      const codeMirrorDiagnostic: CodeMirrorDiagnostic = {
        from: range.from,
        to: range.to,
        severity,
        source: getDiagnosticSource(diagnostic.message),
        message: diagnostic.message,
        markClass: isHarperDiagnostic
          ? "cm-diagnostic-range cm-diagnostic-range--harper"
          : `cm-diagnostic-range cm-diagnostic-range--${severity}`
      };

      return codeMirrorDiagnostic;
    })
    .filter((diagnostic): diagnostic is CodeMirrorDiagnostic => diagnostic !== null);
}

function getDiagnosticSource(message: string): string | undefined {
  const separatorIndex = message.indexOf(":");
  return separatorIndex > 0 ? message.slice(0, separatorIndex) : undefined;
}

function isHarperDiagnosticMessage(message: string): boolean {
  return message.startsWith("Harper ");
}

function createDiagnosticDecorations(
  state: EditorState,
  lines: EditorDiagnosticLine[],
  diagnostics: CompileDiagnostic[],
  highlightErrors: boolean
) {
  const decorations = [];

  for (const diagnosticLine of lines) {
    const clampedLineNumber = Math.min(
      Math.max(1, diagnosticLine.line),
      state.doc.lines
    );
    const line = state.doc.line(clampedLineNumber);

    decorations.push(
      Decoration.line({
        attributes: {
          class: `cm-diagnostic-line cm-diagnostic-line--${diagnosticLine.severity}`
        }
      }).range(line.from)
    );
  }

  for (const diagnostic of diagnostics) {
    const range = getDiagnosticRange(state, diagnostic);

    if (!range) {
      continue;
    }

    const severity = diagnostic.severity === "error" && !highlightErrors ? "warning" : diagnostic.severity;
    const isHarperDiagnostic = isHarperDiagnosticMessage(diagnostic.message);

    decorations.push(
      Decoration.mark({
        attributes: {
          class: isHarperDiagnostic
            ? "cm-diagnostic-range cm-diagnostic-range--harper"
            : `cm-diagnostic-range cm-diagnostic-range--${severity}`,
          title: diagnostic.message
        }
      }).range(range.from, range.to)
    );
  }

  return Decoration.set(decorations, true);
}

function getDiagnosticRange(
  state: EditorState,
  diagnostic: CompileDiagnostic
): { from: number; to: number } | null {
  if (!diagnostic.line || !diagnostic.column || diagnostic.line < 1 || diagnostic.column < 1) {
    return null;
  }

  const lineNumber = Math.min(Math.max(1, diagnostic.line), state.doc.lines);
  const line = state.doc.line(lineNumber);
  const from = Math.min(line.to, line.from + diagnostic.column - 1);
  let to = from + 1;

  if (diagnostic.endLine && diagnostic.endColumn) {
    const endLineNumber = Math.min(Math.max(1, diagnostic.endLine), state.doc.lines);
    const endLine = state.doc.line(endLineNumber);
    to = Math.min(endLine.to, endLine.from + Math.max(0, diagnostic.endColumn - 1));
  }

  if (to <= from) {
    to = Math.min(line.to, from + 1);
  }

  return to > from ? { from, to } : null;
}

function collectDiagnosticLines(
  diagnostics: CompileDiagnostic[],
  highlightErrors: boolean
): EditorDiagnosticLine[] {
  const lines = new Map<number, EditorDiagnosticLine>();

  for (const diagnostic of diagnostics) {
    if (!diagnostic.line || diagnostic.line < 1 || isHarperDiagnosticMessage(diagnostic.message)) {
      continue;
    }

    const existing = lines.get(diagnostic.line);
    const nextSeverity =
      existing?.severity === "error" || diagnostic.severity === "error"
        ? "error"
        : "warning";
    const nextMessage = existing
      ? `${existing.message}\n\n${diagnostic.message}`
      : diagnostic.message;

    lines.set(diagnostic.line, {
      line: diagnostic.line,
      severity:
        nextSeverity === "error" && !highlightErrors ? "warning" : nextSeverity,
      message: nextMessage
    });
  }

  return [...lines.values()];
}
