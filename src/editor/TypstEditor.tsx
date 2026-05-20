import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel, gotoLine } from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorState, diagnosticsCompartment } from "./codemirrorSetup";
import type { ThemeDefinition } from "../theme/themes";
import type { CompileDiagnostic } from "../compiler/types";
import { createEditorDiagnosticExtensions } from "./editorDiagnostics";

interface TypstEditorProps {
  value: string;
  vimMode: boolean;
  theme: ThemeDefinition;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
  onChange: (value: string) => void;
}

export interface TypstEditorHandle {
  focusRange(range: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  }): void;
  undo: () => void;
  redo: () => void;
  search: () => void;
  goToLine: () => void;
  selectAll: () => void;
}

export const TypstEditor = forwardRef<TypstEditorHandle, TypstEditorProps>(function TypstEditor({
  value,
  vimMode,
  theme,
  diagnostics,
  highlightErrors,
  onChange
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestOnChangeRef = useRef(onChange);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      focusRange(range) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        const lineNumber = clampLineNumber(view, range.line);
        const line = view.state.doc.line(lineNumber);
        const anchor = line.from + clampColumn(range.column, line.length);
        const hasExplicitSelectionEnd =
          range.endLine !== undefined || range.endColumn !== undefined;
        const endLineNumber = clampLineNumber(view, range.endLine ?? range.line);
        const endLine = view.state.doc.line(endLineNumber);
        const head = hasExplicitSelectionEnd
          ? endLine.from + clampColumn(range.endColumn ?? range.column, endLine.length)
          : anchor;

        view.dispatch({
          selection: EditorSelection.range(anchor, head),
          effects: EditorView.scrollIntoView(anchor, {
            y: "center"
          })
        });
        view.focus();
      },
      undo() {
        const view = viewRef.current;
        if (view) {
          undo(view);
          view.focus();
        }
      },
      redo() {
        const view = viewRef.current;
        if (view) {
          redo(view);
          view.focus();
        }
      },
      search() {
        const view = viewRef.current;
        if (view) {
          openSearchPanel(view);
          view.focus();
        }
      },
      goToLine() {
        const view = viewRef.current;
        if (view) {
          gotoLine(view);
          view.focus();
        }
      },
      selectAll() {
        const view = viewRef.current;
        if (view) {
          const doc = view.state.doc;
          view.dispatch({
            selection: EditorSelection.single(0, doc.length),
            scrollIntoView: true
          });
          view.focus();
        }
      }
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const view = new EditorView({
      state: createEditorState(value, {
        onChange: (nextValue) => latestOnChangeRef.current(nextValue),
        vimMode,
        theme,
        diagnostics,
        highlightErrors
      }),
      parent: containerRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [theme, vimMode]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();

    if (value === currentValue) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value
      }
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: diagnosticsCompartment.reconfigure(
        createEditorDiagnosticExtensions(diagnostics, highlightErrors)
      )
    });
  }, [diagnostics, highlightErrors]);

  return <div className="editor-root" ref={containerRef} />;
});

function clampLineNumber(view: EditorView, lineNumber: number): number {
  return Math.max(1, Math.min(lineNumber, view.state.doc.lines));
}

function clampColumn(column: number, lineLength: number): number {
  return Math.max(0, Math.min(Math.max(column, 1) - 1, lineLength));
}
