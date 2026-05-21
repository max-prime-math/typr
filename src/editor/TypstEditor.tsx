import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef
} from "react";
import type { MutableRefObject } from "react";
import { snippet } from "@codemirror/autocomplete";
import type { CompletionSource } from "@codemirror/autocomplete";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel, gotoLine } from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { createEditorState, diagnosticsCompartment } from "./codemirrorSetup";
import { cycleMathDelimiter } from "./mathActions";
import type { ThemeDefinition } from "../theme/themes";
import type { CompileDiagnostic } from "../compiler/types";
import { createEditorDiagnosticExtensions } from "./editorDiagnostics";
import {
  createSnippetCompletionSource,
  isPositionInsideMathMode,
  type TypstSnippet
} from "../snippets/snippets";

interface TypstEditorProps {
  value: string;
  vimMode: boolean;
  cursorSmooth: boolean;
  cursorSmear: number;
  theme: ThemeDefinition;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
  snippets: TypstSnippet[];
  onChange: (value: string) => void;
}

export interface TypstEditorHandle {
  focus(): void;
  focusRange(range: {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  }): void;
  insertText(text: string): void;
  insertSymbol(snippet: string): void;
  surroundSelection(before: string, after?: string): void;
  toggleCurrentLines(prefix: string, alternatePrefix?: string): void;
  cycleCurrentLinesHeading(maxLevel?: number): void;
  toggleMathMode(): void;
  undo: () => void;
  redo: () => void;
  search: () => void;
  goToLine: () => void;
  selectAll: () => void;
}

export const TypstEditor = forwardRef<TypstEditorHandle, TypstEditorProps>(function TypstEditor({
  value,
  vimMode,
  cursorSmooth,
  cursorSmear,
  theme,
  diagnostics,
  highlightErrors,
  snippets,
  onChange
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentValueRef = useRef(value);
  const latestOnChangeRef = useRef(onChange);
  const snippetsRef = useRef(snippets);
  const snippetCompletionSource = useMemo<CompletionSource>(
    () => (context) => createSnippetCompletionSource(snippetsRef.current)(context),
    []
  );

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    snippetsRef.current = snippets;
  }, [snippets]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
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
      insertText(text) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        insertTextIntoView(view, text);
        view.focus();
      },
      insertSymbol(snippet) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        insertSymbolIntoView(view, snippet);
        view.focus();
      },
      surroundSelection(before, after = before) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        wrapSelection(view, before, after);
        view.focus();
      },
      toggleCurrentLines(prefix, alternatePrefix) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        toggleCurrentLines(view, prefix, alternatePrefix);
        view.focus();
      },
      cycleCurrentLinesHeading(maxLevel = 4) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        cycleCurrentLinesHeading(view, maxLevel);
        view.focus();
      },
      toggleMathMode() {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        cycleMathDelimiter(view);
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
        onChange: (update) =>
          latestOnChangeRef.current(applyEditorChanges(currentValueRef, update)),
        vimMode,
        cursorSmooth,
        cursorSmear,
        theme,
        diagnostics,
        highlightErrors,
        snippetSource: snippetCompletionSource
      }),
      parent: containerRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [cursorSmear, cursorSmooth, theme, vimMode, snippetCompletionSource]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    if (value === currentValueRef.current) {
      return;
    }

    const currentLength = view.state.doc.length;
    currentValueRef.current = value;
    view.dispatch({
      changes: {
        from: 0,
        to: currentLength,
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

function applyEditorChanges(
  currentValueRef: MutableRefObject<string>,
  update: ViewUpdate
): string {
  const previousValue = currentValueRef.current;
  let nextValue = "";
  let previousOffset = 0;

  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    nextValue += previousValue.slice(previousOffset, fromA);
    nextValue += inserted.toString();
    previousOffset = toA;
  });

  nextValue += previousValue.slice(previousOffset);
  currentValueRef.current = nextValue;

  return nextValue;
}

function insertTextIntoView(view: EditorView, text: string): void {
  const selection = view.state.selection.main;

  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: text
    },
    selection: EditorSelection.cursor(selection.from + text.length),
    scrollIntoView: true
  });
}

function replaceSelection(view: EditorView, before: string, after: string): void {
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const hasSelection = selection.from !== selection.to;
  const insert = hasSelection
    ? `${before}${selectedText}${after}`
    : `${before}${after}`;
  const cursor = selection.from + before.length;
  const head = hasSelection ? cursor + selectedText.length : cursor;

  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert
    },
    selection: EditorSelection.range(cursor, head),
    scrollIntoView: true
  });
}

function wrapSelection(view: EditorView, before: string, after: string): void {
  replaceSelection(view, before, after);
}

function insertSymbolIntoView(view: EditorView, template: string): void {
  const selection = view.state.selection.main;
  const insertion = isPositionInsideMathMode(view.state, selection.from)
    ? template
    : `$${template}$`;

  snippet(insertion)(
    {
      state: view.state,
      dispatch(tr) {
        view.dispatch(tr);
      }
    },
    null,
    selection.from,
    selection.to
  );
}

function toggleCurrentLines(view: EditorView, prefix: string, alternatePrefix?: string): void {
  const selection = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(selection.from);
  const toLine = view.state.doc.lineAt(selection.to);
  const lineNumbers = [];

  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lineNumbers.push(lineNumber);
  }

  const changes = lineNumbers.map((lineNumber) => {
    const line = view.state.doc.line(lineNumber);
    const lineText = line.text;

    if (lineText.startsWith(prefix)) {
      return {
        from: line.from,
        to: line.from + prefix.length,
        insert: ""
      };
    }

    if (alternatePrefix && lineText.startsWith(alternatePrefix)) {
      return {
        from: line.from,
        to: line.from + alternatePrefix.length,
        insert: prefix
      };
    }

    return {
      from: line.from,
      insert: prefix
    };
  });

  view.dispatch({
    changes,
    scrollIntoView: true
  });
}

function cycleCurrentLinesHeading(view: EditorView, maxLevel: number): void {
  const selection = view.state.selection.main;
  const fromLine = view.state.doc.lineAt(selection.from);
  const toLine = view.state.doc.lineAt(selection.to);
  const lineNumbers = [];

  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lineNumbers.push(lineNumber);
  }

  const changes = lineNumbers.map((lineNumber) => {
    const line = view.state.doc.line(lineNumber);
    const match = line.text.match(/^(=+)\s/);
    const currentLevel = match ? match[1].length : 0;
    const nextLevel = currentLevel >= maxLevel ? 0 : currentLevel + 1;
    const nextPrefix = nextLevel > 0 ? `${"=".repeat(nextLevel)} ` : "";

    if (match) {
      return {
        from: line.from,
        to: line.from + match[0].length,
        insert: nextPrefix
      };
    }

    return {
      from: line.from,
      insert: nextPrefix
    };
  });

  view.dispatch({
    changes,
    scrollIntoView: true
  });
}

function clampLineNumber(view: EditorView, lineNumber: number): number {
  return Math.max(1, Math.min(lineNumber, view.state.doc.lines));
}

function clampColumn(column: number, lineLength: number): number {
  return Math.max(0, Math.min(Math.max(column, 1) - 1, lineLength));
}
