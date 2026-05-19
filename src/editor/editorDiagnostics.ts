import { StateField } from "@codemirror/state";
import type { EditorState, Extension } from "@codemirror/state";
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
    create: (state) => createLineDecorations(state, lines),
    update: (value, transaction) => value.map(transaction.changes),
    provide: (field) => EditorView.decorations.from(field)
  });

  const lineMap = new Map<number, EditorDiagnosticLine>();

  for (const diagnosticLine of lines) {
    lineMap.set(diagnosticLine.line, diagnosticLine);
  }

  return [
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

function createLineDecorations(
  state: EditorState,
  lines: EditorDiagnosticLine[]
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

  return Decoration.set(decorations, true);
}

function collectDiagnosticLines(
  diagnostics: CompileDiagnostic[],
  highlightErrors: boolean
): EditorDiagnosticLine[] {
  const lines = new Map<number, EditorDiagnosticLine>();

  for (const diagnostic of diagnostics) {
    if (!diagnostic.line || diagnostic.line < 1) {
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
