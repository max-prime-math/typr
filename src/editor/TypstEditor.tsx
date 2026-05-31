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
import {
  findNext as cmFindNext,
  findPrevious as cmFindPrevious,
  getSearchQuery as getEditorSearchQuery,
  gotoLine,
  replaceAll as cmReplaceAll,
  replaceNext as cmReplaceNext,
  selectMatches as cmSelectMatches,
  SearchQuery,
  setSearchQuery as setEditorSearchQuery
} from "@codemirror/search";
import { EditorSelection } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { createEditorState, diagnosticsCompartment } from "./codemirrorSetup";
import { cycleMathDelimiter } from "./mathActions";
import type { ThemeDefinition } from "../theme/themes";
import type { CompileDiagnostic } from "../compiler/types";
import type { KeybindingMap } from "../app/keybindings";
import { createEditorDiagnosticExtensions } from "./editorDiagnostics";
import {
  createSnippetCompletionSource,
  isPositionInsideMathMode,
  type TypstSnippet
} from "../snippets/snippets";

interface TypstEditorProps {
  value: string;
  readOnly?: boolean;
  vimMode: boolean;
  relativeLineNumbers: boolean;
  cursorSmooth: boolean;
  cursorSmear: number;
  editorFontSize: number;
  keybindings: KeybindingMap;
  theme: ThemeDefinition;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
  snippets: TypstSnippet[];
  onSearchRequested: () => void;
  onCompileRequested: () => void;
  onSelectionChange: (lineNumber: number) => void;
  onChange: (value: string) => void;
}

interface PreservedEditorViewState {
  selectionRanges: {
    anchor: number;
    head: number;
  }[];
  mainSelectionIndex: number;
  scrollTop: number;
  scrollLeft: number;
  hadFocus: boolean;
}

export interface TypstSearchQueryState {
  search: string;
  replace: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
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
  insertTextAndSelect(text: string): void;
  insertTemplate(template: string): void;
  insertMathTemplate(template: string): void;
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
  getSearchQuery: () => TypstSearchQueryState;
  setSearchQuery: (query: TypstSearchQueryState) => void;
  findNext: () => void;
  findPrevious: () => void;
  selectMatches: () => void;
  replaceNext: () => void;
  replaceAll: () => void;
}

export const TypstEditor = forwardRef<TypstEditorHandle, TypstEditorProps>(function TypstEditor({
  value,
  readOnly = false,
  vimMode,
  relativeLineNumbers,
  cursorSmooth,
  cursorSmear,
  editorFontSize,
  keybindings,
  theme,
  diagnostics,
  highlightErrors,
  snippets,
  onSearchRequested,
  onCompileRequested,
  onSelectionChange,
  onChange
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentValueRef = useRef(value);
  const isApplyingExternalValueRef = useRef(false);
  const latestOnChangeRef = useRef(onChange);
  const snippetsRef = useRef(snippets);
  const preservedViewStateRef = useRef<PreservedEditorViewState | null>(null);
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
      insertTextAndSelect(text) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        insertTextIntoView(view, text, true);
        view.focus();
      },
      insertTemplate(template) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        insertSnippetIntoView(view, template);
        view.focus();
      },
      insertMathTemplate(template) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        const selection = view.state.selection.main;
        const insertion = isPositionInsideMathMode(view.state, selection.from)
          ? template
          : `$${template}$`;

        insertSnippetIntoView(view, insertion);
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
        onSearchRequested();
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
      },
      getSearchQuery() {
        const view = viewRef.current;

        if (!view) {
          return {
            search: "",
            replace: "",
            caseSensitive: false,
            regexp: false,
            wholeWord: false
          };
        }

        const query = getEditorSearchQuery(view.state);

        return {
          search: query.search,
          replace: query.replace,
          caseSensitive: query.caseSensitive,
          regexp: query.regexp,
          wholeWord: query.wholeWord
        };
      },
      setSearchQuery(query) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        view.dispatch({
          effects: setEditorSearchQuery.of(
            new SearchQuery({
              search: query.search,
              replace: query.replace,
              caseSensitive: query.caseSensitive,
              regexp: query.regexp,
              wholeWord: query.wholeWord
            })
          )
        });
      },
      findNext() {
        const view = viewRef.current;
        if (view) {
          cmFindNext(view);
          view.focus();
        }
      },
      findPrevious() {
        const view = viewRef.current;
        if (view) {
          cmFindPrevious(view);
          view.focus();
        }
      },
      selectMatches() {
        const view = viewRef.current;
        if (view) {
          cmSelectMatches(view);
          view.focus();
        }
      },
      replaceNext() {
        const view = viewRef.current;
        if (view) {
          cmReplaceNext(view);
          view.focus();
        }
      },
      replaceAll() {
        const view = viewRef.current;
        if (view) {
          cmReplaceAll(view);
          view.focus();
        }
      }
    }),
    [onCompileRequested, onSearchRequested]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const preservedViewState = preservedViewStateRef.current;
    const view = new EditorView({
      state: createEditorState(value, {
        onChange: (update) => {
          if (isApplyingExternalValueRef.current) {
            isApplyingExternalValueRef.current = false;
            return;
          }

          latestOnChangeRef.current(applyEditorChanges(currentValueRef, update));
        },
        onSelectionChange: (update) => {
          onSelectionChange(update.state.doc.lineAt(update.state.selection.main.head).number);
        },
        readOnly,
        vimMode,
        relativeLineNumbers,
        cursorSmooth,
        cursorSmear,
        editorFontSize,
        keybindings,
        theme,
        diagnostics,
        highlightErrors,
        snippetSource: snippetCompletionSource,
        onSearchRequested,
        onCompileRequested
      }),
      parent: containerRef.current
    });

    if (preservedViewState) {
      view.dispatch({
        selection: EditorSelection.create(
          preservedViewState.selectionRanges.map((range) =>
            EditorSelection.range(range.anchor, range.head)
          ),
          preservedViewState.mainSelectionIndex
        )
      });
      view.scrollDOM.scrollTop = preservedViewState.scrollTop;
      view.scrollDOM.scrollLeft = preservedViewState.scrollLeft;

      if (preservedViewState.hadFocus) {
        view.focus();
      }
    }

    viewRef.current = view;
    preservedViewStateRef.current = null;
    onSelectionChange(view.state.doc.lineAt(view.state.selection.main.head).number);

    return () => {
      preservedViewStateRef.current = {
        selectionRanges: view.state.selection.ranges.map((range) => ({
          anchor: range.anchor,
          head: range.head
        })),
        mainSelectionIndex: view.state.selection.mainIndex,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
        hadFocus: view.hasFocus
      };
      view.destroy();
      viewRef.current = null;
    };
  }, [
    cursorSmear,
    cursorSmooth,
    editorFontSize,
    keybindings,
    onCompileRequested,
    onSelectionChange,
    readOnly,
    relativeLineNumbers,
    theme,
    vimMode,
    snippetCompletionSource
  ]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    if (value === currentValueRef.current) {
      return;
    }

    const currentLength = view.state.doc.length;
    isApplyingExternalValueRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentLength,
        insert: value
      }
    });
    currentValueRef.current = value;
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

function insertTextIntoView(
  view: EditorView,
  text: string,
  selectInsertedText = false
): void {
  const transaction = view.state.changeByRange((selection) => ({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: text
    },
    range: selectInsertedText
      ? EditorSelection.range(selection.from, selection.from + text.length)
      : EditorSelection.cursor(selection.from + text.length)
  }));

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });
}

function replaceSelection(view: EditorView, before: string, after: string): void {
  const transaction = view.state.changeByRange((selection) => {
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const hasSelection = selection.from !== selection.to;
    const insert = hasSelection
      ? `${before}${selectedText}${after}`
      : `${before}${after}`;
    const cursor = selection.from + before.length;
    const head = hasSelection ? cursor + selectedText.length : cursor;

    return {
      changes: {
        from: selection.from,
        to: selection.to,
        insert
      },
      range: EditorSelection.range(cursor, head)
    };
  });

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });
}

function wrapSelection(view: EditorView, before: string, after: string): void {
  replaceSelection(view, before, after);
}

function insertSnippetIntoView(view: EditorView, template: string): void {
  const selection = view.state.selection.main;
  snippet(template)(
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

function insertSymbolIntoView(view: EditorView, template: string): void {
  const selection = view.state.selection.main;
  const insertion = isPositionInsideMathMode(view.state, selection.from)
    ? template
    : `$${template}$`;

  insertSnippetIntoView(view, insertion);
}

function toggleCurrentLines(view: EditorView, prefix: string, alternatePrefix?: string): void {
  const lineNumbers = getSelectedLineNumbers(view);

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
  const lineNumbers = getSelectedLineNumbers(view);

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

function getSelectedLineNumbers(view: EditorView): number[] {
  const lineNumbers = new Set<number>();

  for (const selection of view.state.selection.ranges) {
    const fromLine = view.state.doc.lineAt(selection.from);
    const toLine = view.state.doc.lineAt(selection.to);

    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
      lineNumbers.add(lineNumber);
    }
  }

  return [...lineNumbers].sort((left, right) => left - right);
}

function clampLineNumber(view: EditorView, lineNumber: number): number {
  return Math.max(1, Math.min(lineNumber, view.state.doc.lines));
}

function clampColumn(column: number, lineLength: number): number {
  return Math.max(0, Math.min(Math.max(column, 1) - 1, lineLength));
}
