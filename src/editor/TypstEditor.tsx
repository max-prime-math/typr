import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
import { snippet } from "@codemirror/autocomplete";
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

        toggleDelimitedSelection(view, "$");
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
  const insertion = isCursorInsideMathMode(view, selection.from)
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

function toggleDelimitedSelection(view: EditorView, delimiter: string): void {
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const hasSelection = selection.from !== selection.to;

  if (hasSelection) {
    const isWrapped =
      selectedText.startsWith(delimiter) &&
      selectedText.endsWith(delimiter) &&
      selectedText.length >= delimiter.length * 2;

    if (isWrapped) {
      const start = selection.from;
      const end = selection.to;
      const innerLength = selectedText.length - delimiter.length * 2;

      view.dispatch({
        changes: [
          {
            from: start,
            to: start + delimiter.length,
            insert: ""
          },
          {
            from: end - delimiter.length,
            to: end,
            insert: ""
          }
        ],
        selection: EditorSelection.range(start, start + innerLength),
        scrollIntoView: true
      });
      return;
    }

    replaceSelection(view, delimiter, delimiter);
    return;
  }

  const beforeFrom = Math.max(0, selection.from - delimiter.length);
  const afterTo = Math.min(view.state.doc.length, selection.to + delimiter.length);
  const beforeText = view.state.sliceDoc(beforeFrom, selection.from);
  const afterText = view.state.sliceDoc(selection.to, afterTo);

  if (beforeText === delimiter && afterText === delimiter) {
    view.dispatch({
      changes: [
        {
          from: beforeFrom,
          to: selection.from,
          insert: ""
        },
        {
          from: selection.to,
          to: afterTo,
          insert: ""
        }
      ],
      selection: EditorSelection.cursor(beforeFrom),
      scrollIntoView: true
    });
    return;
  }

  view.dispatch({
    changes: {
      from: selection.from,
      insert: `${delimiter}${delimiter}`
    },
    selection: EditorSelection.cursor(selection.from + delimiter.length),
    scrollIntoView: true
  });
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

function isCursorInsideMathMode(view: EditorView, position: number): boolean {
  const line = view.state.doc.lineAt(position);
  const text = line.text.slice(0, position - line.from);
  let isEscaped = false;
  let delimiterCount = 0;

  for (const character of text) {
    if (character === "\\" && !isEscaped) {
      isEscaped = true;
      continue;
    }

    if (character === "$" && !isEscaped) {
      delimiterCount += 1;
    }

    isEscaped = false;
  }

  return delimiterCount % 2 === 1;
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
