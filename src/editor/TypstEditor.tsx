import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { createEditorState, diagnosticsCompartment } from "./codemirrorSetup";
import type { ThemeMode } from "../app/appState";
import type { CompileDiagnostic } from "../compiler/types";
import { createEditorDiagnosticExtensions } from "./editorDiagnostics";

interface TypstEditorProps {
  value: string;
  vimMode: boolean;
  theme: ThemeMode;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
  onChange: (value: string) => void;
}

export function TypstEditor({
  value,
  vimMode,
  theme,
  diagnostics,
  highlightErrors,
  onChange
}: TypstEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestOnChangeRef = useRef(onChange);

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

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
}
