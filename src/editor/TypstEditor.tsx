import {
  forwardRef,
  memo,
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
import { setDiagnostics } from "@codemirror/lint";
import { getCM, Vim } from "@replit/codemirror-vim";
import { createEditorState, diagnosticsCompartment } from "./codemirrorSetup";
import { cycleMathDelimiter } from "./mathActions";
import { toggleTextFormatInView, type TextFormatKind } from "./textFormatting";
import { smoothCursorJumpEffect } from "./smoothCursor";
import type { ThemeDefinition } from "../theme/themes";
import type { CompileDiagnostic } from "../compiler/types";
import type { SourceLanguage } from "../compiler/sourceFileTypes";
import type { KeybindingMap } from "../app/keybindings";
import { createEditorDiagnosticExtensions, toCodeMirrorDiagnostics } from "./editorDiagnostics";
import {
  createLanguageSnippetCompletionSource,
  isSnippetLanguage,
  isPositionInsideMathMode,
  type SnippetDefinition
} from "../snippets/snippets";

export interface TypstEditorSelection {
  lineNumber: number;
  from: number;
  to: number;
  head: number;
}

interface TypstEditorProps {
  value: string;
  readOnly?: boolean;
  vimMode: boolean;
  relativeLineNumbers: boolean;
  lineWrap: boolean;
  cursorSmooth: boolean;
  cursorSmear: number;
  constrainMobileScroll?: boolean;
  latexMathPreview: boolean;
  typstMathPreview: boolean;
  editorFontSize: number;
  keybindings: KeybindingMap;
  theme: ThemeDefinition;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
  language?: SourceLanguage;
  snippets: SnippetDefinition[];
  onSearchRequested: () => void;
  onCompileRequested: () => void;
  onFormatRequested: () => void;
  onToggleLineWrap: () => void;
  onCloseRequested: () => void;
  onSelectionChange: (selection: TypstEditorSelection) => void;
  onSourceDoubleClick?: (position: { line: number; column: number }) => void;
  onFocusChange?: (focused: boolean) => void;
  imagePasteInVim?: boolean;
  vimClipboardSharing?: boolean;
  onImagePaste?: (file: File) => Promise<boolean> | boolean;
  onImageRenameKey?: (
    event: KeyboardEvent,
    selection: { from: number; to: number }
  ) => { position: number } | { move: "lineEnd" } | null;
  onChange: (value: string) => void;
  onTextChanges?: (changes: readonly TypstEditorTextChange[], previousValue: string) => void;
}

export interface TypstEditorTextChange {
  /** UTF-16 offsets into previousValue, matching CodeMirror's document model. */
  from: number;
  to: number;
  text: string;
}

let vimClipboardSharingEnabled = false;
let vimClipboardRegisterSyncInstalled = false;

function setVimClipboardSharingEnabled(enabled: boolean): void {
  vimClipboardSharingEnabled = enabled;
  installVimClipboardRegisterSync();
}

function installVimClipboardRegisterSync(): void {
  if (vimClipboardRegisterSyncInstalled || typeof navigator === "undefined") {
    return;
  }

  const registerController = Vim.getRegisterController();
  const originalPushText = registerController.pushText.bind(registerController);

  registerController.pushText = (registerName, operator, pushedText, linewise, blockwise) => {
    originalPushText(registerName, operator, pushedText, linewise, blockwise);

    if (
      !vimClipboardSharingEnabled ||
      operator !== "yank" ||
      registerName === "_" ||
      typeof navigator.clipboard?.writeText !== "function"
    ) {
      return;
    }

    void navigator.clipboard.writeText(registerController.unnamedRegister.toString()).catch((error) => {
      console.warn("Unable to write Vim yank to system clipboard.", error);
    });
  };

  vimClipboardRegisterSyncInstalled = true;
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
  }, options?: { focus?: boolean }): void;
  insertText(text: string): void;
  insertTextAndSelect(text: string): void;
  insertTextAndSelectRange(text: string, selectionStart: number, selectionEnd: number): { from: number; to: number } | null;
  insertLatexGraphic(text: string): void;
  insertLatexGraphicAndSelectRange(text: string, selectionStart: number, selectionEnd: number): { from: number; to: number } | null;
  insertLatexTemplateWithPackages(template: string, packageNames: string[]): void;
  replaceRangeWithLatexTemplateWithPackages(from: number, to: number, template: string, packageNames: string[]): void;
  replaceRangeWithTemplate(from: number, to: number, template: string): void;
  insertTemplate(template: string): void;
  insertMathTemplate(template: string): void;
  insertSymbol(snippet: string): void;
  surroundSelection(before: string, after?: string): void;
  toggleCurrentLines(prefix: string, alternatePrefix?: string): void;
  cycleCurrentLinesHeading(maxLevel?: number): void;
  toggleMathMode(): void;
  toggleTextFormat(kind: TextFormatKind): void;
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

const TypstEditorComponent = forwardRef<TypstEditorHandle, TypstEditorProps>(function TypstEditor({
  value,
  readOnly = false,
  vimMode,
  relativeLineNumbers,
  lineWrap,
  cursorSmooth,
  cursorSmear,
  constrainMobileScroll = false,
  latexMathPreview,
  typstMathPreview,
  editorFontSize,
  keybindings,
  theme,
  diagnostics,
  highlightErrors,
  language = "typst",
  snippets,
  onSearchRequested,
  onCompileRequested,
  onFormatRequested,
  onToggleLineWrap,
  onCloseRequested,
  onSelectionChange,
  onSourceDoubleClick,
  onFocusChange,
  imagePasteInVim = false,
  vimClipboardSharing = false,
  onImagePaste,
  onImageRenameKey,
  onChange,
  onTextChanges
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const currentValueRef = useRef(value);
  const isApplyingExternalValueRef = useRef(false);
  const latestOnChangeRef = useRef(onChange);
  const latestOnTextChangesRef = useRef(onTextChanges);
  const latestOnSelectionChangeRef = useRef(onSelectionChange);
  const latestOnSourceDoubleClickRef = useRef(onSourceDoubleClick);
  const latestOnFocusChangeRef = useRef(onFocusChange);
  const latestImagePasteInVimRef = useRef(imagePasteInVim);
  const latestVimClipboardSharingRef = useRef(vimClipboardSharing);
  const latestOnImagePasteRef = useRef(onImagePaste);
  const latestOnImageRenameKeyRef = useRef(onImageRenameKey);
  const latestOnSearchRequestedRef = useRef(onSearchRequested);
  const latestOnCompileRequestedRef = useRef(onCompileRequested);
  const latestOnFormatRequestedRef = useRef(onFormatRequested);
  const latestOnCloseRequestedRef = useRef(onCloseRequested);
  const snippetsRef = useRef(snippets);
  const preservedViewStateRef = useRef<PreservedEditorViewState | null>(null);
  const diagnosticsSignatureRef = useRef(createDiagnosticsSignature(diagnostics, highlightErrors));
  const snippetCompletionSource = useMemo<CompletionSource>(
    () => {
      const snippetLanguage = isSnippetLanguage(language) ? language : "markdown";
      return (context) => createLanguageSnippetCompletionSource(snippetLanguage, snippetsRef.current)(context);
    },
    [language]
  );

  useEffect(() => {
    latestOnChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    latestOnTextChangesRef.current = onTextChanges;
  }, [onTextChanges]);

  useEffect(() => {
    latestOnSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    latestOnSourceDoubleClickRef.current = onSourceDoubleClick;
  }, [onSourceDoubleClick]);

  useEffect(() => {
    latestOnFocusChangeRef.current = onFocusChange;
  }, [onFocusChange]);

  useEffect(() => {
    latestImagePasteInVimRef.current = imagePasteInVim;
  }, [imagePasteInVim]);

  useEffect(() => {
    latestVimClipboardSharingRef.current = vimClipboardSharing;
    setVimClipboardSharingEnabled(vimClipboardSharing);
  }, [vimClipboardSharing]);

  useEffect(() => {
    latestOnImagePasteRef.current = onImagePaste;
  }, [onImagePaste]);

  useEffect(() => {
    latestOnImageRenameKeyRef.current = onImageRenameKey;
  }, [onImageRenameKey]);

  useEffect(() => {
    latestOnSearchRequestedRef.current = onSearchRequested;
  }, [onSearchRequested]);

  useEffect(() => {
    latestOnCompileRequestedRef.current = onCompileRequested;
  }, [onCompileRequested]);

  useEffect(() => {
    latestOnFormatRequestedRef.current = onFormatRequested;
  }, [onFormatRequested]);

  useEffect(() => {
    latestOnCloseRequestedRef.current = onCloseRequested;
  }, [onCloseRequested]);

  useEffect(() => {
    snippetsRef.current = snippets;
  }, [snippets]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        focusEditorView(viewRef.current);
      },
      focusRange(range, options) {
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

        if (options?.focus !== false) {
          focusEditorView(view);
        }
        view.dispatch({
          selection: EditorSelection.range(anchor, head),
          effects: [
            smoothCursorJumpEffect.of(undefined),
            EditorView.scrollIntoView(anchor, {
              y: "center"
            })
          ]
        });
        scheduleSmoothCursorSnap(view);
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
      insertTextAndSelectRange(text, selectionStart, selectionEnd) {
        const view = viewRef.current;

        if (!view) {
          return null;
        }

        const range = insertTextIntoView(view, text, { selectionStart, selectionEnd });
        view.focus();
        return range;
      },
      insertLatexGraphic(text) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        insertLatexGraphicIntoView(view, text, true);
        view.focus();
      },
      insertLatexGraphicAndSelectRange(text, selectionStart, selectionEnd) {
        const view = viewRef.current;

        if (!view) {
          return null;
        }

        const range = insertLatexGraphicIntoView(view, text, { selectionStart, selectionEnd });
        view.focus();
        return range;
      },
      insertLatexTemplateWithPackages(template, packageNames) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        insertLatexTemplateWithPackagesIntoView(view, template, packageNames);
        view.focus();
      },
      replaceRangeWithLatexTemplateWithPackages(from, to, template, packageNames) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        insertLatexTemplateWithPackagesIntoView(view, template, packageNames, { from, to });
        view.focus();
      },
      replaceRangeWithTemplate(from, to, template) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        const range = clampEditorRange(view, { from, to });
        insertSnippetIntoView(view, template, range.from, range.to);
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
      toggleTextFormat(kind) {
        const view = viewRef.current;

        if (!view) {
          return;
        }

        toggleTextFormatInView(view, language, kind);
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
        latestOnSearchRequestedRef.current();
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
    [language]
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const preservedViewState = preservedViewStateRef.current;
    currentValueRef.current = value;
    diagnosticsSignatureRef.current = createDiagnosticsSignature(diagnostics, highlightErrors);
    const view = new EditorView({
      state: createEditorState(value, {
        onChange: (update) => {
          if (isApplyingExternalValueRef.current) {
            isApplyingExternalValueRef.current = false;
            return;
          }

          const previousValue = currentValueRef.current;
          const changes = getEditorTextChanges(update);
          latestOnTextChangesRef.current?.(changes, previousValue);
          latestOnChangeRef.current(applyEditorChanges(currentValueRef, update));
        },
        onSelectionChange: (update) => {
          latestOnSelectionChangeRef.current(getEditorSelectionSnapshot(update.view));
        },
        onSourceDoubleClick: (position) => latestOnSourceDoubleClickRef.current?.(position),
        readOnly,
        vimMode,
        relativeLineNumbers,
        lineWrap,
        cursorSmooth,
        cursorSmear,
        constrainMobileScroll,
        latexMathPreviewEnabled: latexMathPreview,
        typstMathPreviewEnabled: typstMathPreview,
        editorFontSize,
        keybindings,
        theme,
        diagnostics,
        highlightErrors,
        language,
        snippetSource: snippetCompletionSource,
        onSearchRequested: () => latestOnSearchRequestedRef.current(),
        onCompileRequested: () => latestOnCompileRequestedRef.current(),
        onFormatRequested: () => latestOnFormatRequestedRef.current(),
        onToggleLineWrap,
        onCloseRequested: () => latestOnCloseRequestedRef.current(),
        onFocusChange: (focused) => latestOnFocusChangeRef.current?.(focused)
      }),
      parent: containerRef.current
    });

    if (preservedViewState) {
      const documentLength = view.state.doc.length;
      const selectionRanges = preservedViewState.selectionRanges.map((range) =>
        EditorSelection.range(
          clampDocumentOffset(range.anchor, documentLength),
          clampDocumentOffset(range.head, documentLength)
        )
      );
      const mainSelectionIndex = Math.min(
        preservedViewState.mainSelectionIndex,
        Math.max(0, selectionRanges.length - 1)
      );

      view.dispatch({
        selection: EditorSelection.create(selectionRanges, mainSelectionIndex)
      });
      view.scrollDOM.scrollTop = preservedViewState.scrollTop;
      view.scrollDOM.scrollLeft = preservedViewState.scrollLeft;

      if (preservedViewState.hadFocus) {
        view.focus();
      }
    }

    const handlePaste = (event: ClipboardEvent) => {
      const imageFile = getClipboardImageFile(event.clipboardData);

      if (!imageFile || !latestOnImagePasteRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void Promise.resolve(latestOnImagePasteRef.current(imageFile)).catch((error) => {
        console.error("Unable to paste clipboard image.", error);
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const selection = view.state.selection.main;
      const renameHandler = latestOnImageRenameKeyRef.current;

      if (renameHandler) {
        const result = renameHandler(event, {
          from: Math.min(selection.anchor, selection.head),
          to: Math.max(selection.anchor, selection.head)
        });

        if (result) {
          event.preventDefault();
          event.stopPropagation();
          const position = "move" in result
            ? view.state.doc.lineAt(selection.to).to
            : result.position;
          view.dispatch({
            selection: EditorSelection.cursor(clampDocumentOffset(position, view.state.doc.length)),
            scrollIntoView: true
          });
          return;
        }
      }

      const shouldReadClipboardForVimPaste =
        latestImagePasteInVimRef.current || latestVimClipboardSharingRef.current;

      if (shouldReadClipboardForVimPaste && shouldHandleVimPasteKey(event, view)) {
        event.preventDefault();
        event.stopPropagation();
        void handleVimPaste(view, {
          imagePasteInVim: latestImagePasteInVimRef.current,
          onImagePaste: latestOnImagePasteRef.current,
          vimClipboardSharing: latestVimClipboardSharingRef.current
        });
      }
    };

    view.dom.addEventListener("paste", handlePaste);
    view.dom.addEventListener("keydown", handleKeyDown, true);

    latestOnFocusChangeRef.current?.(view.hasFocus);
    view.dispatch(setDiagnostics(view.state, toCodeMirrorDiagnostics(view.state, diagnostics, highlightErrors)));
    viewRef.current = view;
    preservedViewStateRef.current = null;
    latestOnSelectionChangeRef.current(getEditorSelectionSnapshot(view));

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
      view.dom.removeEventListener("paste", handlePaste);
      view.dom.removeEventListener("keydown", handleKeyDown, true);
      latestOnFocusChangeRef.current?.(false);
      view.destroy();
      viewRef.current = null;
    };
  }, [
    constrainMobileScroll,
    cursorSmear,
    cursorSmooth,
    editorFontSize,
    latexMathPreview,
    typstMathPreview,
    keybindings,
    language,
    readOnly,
    relativeLineNumbers,
    lineWrap,
    theme,
    vimMode,
    snippetCompletionSource,
    onToggleLineWrap
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
    const selection = view.state.selection;
    const nextDocumentLength = value.length;
    const selectionRanges = selection.ranges.map((range) =>
      EditorSelection.range(
        clampDocumentOffset(range.anchor, nextDocumentLength),
        clampDocumentOffset(range.head, nextDocumentLength)
      )
    );
    const mainSelectionIndex = Math.min(
      selection.mainIndex,
      Math.max(0, selectionRanges.length - 1)
    );

    isApplyingExternalValueRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentLength,
        insert: value
      },
      selection: EditorSelection.create(selectionRanges, mainSelectionIndex)
    });
    currentValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const nextSignature = createDiagnosticsSignature(diagnostics, highlightErrors);

    if (nextSignature === diagnosticsSignatureRef.current) {
      return;
    }

    diagnosticsSignatureRef.current = nextSignature;
    view.dispatch({
      effects: diagnosticsCompartment.reconfigure(
        createEditorDiagnosticExtensions(diagnostics, highlightErrors)
      )
    });
    view.dispatch(setDiagnostics(view.state, toCodeMirrorDiagnostics(view.state, diagnostics, highlightErrors)));
  }, [diagnostics, highlightErrors]);

  return (
    <div
      className="editor-root"
      onBlurCapture={() => {
        window.setTimeout(() => {
          if (!containerRef.current?.contains(document.activeElement)) {
            latestOnFocusChangeRef.current?.(false);
          }
        }, 0);
      }}
      onFocusCapture={() => latestOnFocusChangeRef.current?.(true)}
      ref={containerRef}
    />
  );
});

export const TypstEditor = memo(TypstEditorComponent);

function createDiagnosticsSignature(
  diagnostics: CompileDiagnostic[],
  highlightErrors: boolean
): string {
  return `${highlightErrors ? "1" : "0"}|${diagnostics
    .map((diagnostic) =>
      [
        diagnostic.severity,
        diagnostic.path ?? "",
        diagnostic.line ?? "",
        diagnostic.column ?? "",
        diagnostic.endLine ?? "",
        diagnostic.endColumn ?? "",
        diagnostic.range ?? "",
        diagnostic.message,
        diagnostic.provenance?.label ?? "",
        diagnostic.provenance?.source ?? ""
      ].join("\u{1f}")
    )
    .join("\u{1e}")}`;
}


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

/**
 * Multiple selections are reported against the pre-transaction document.
 * Applying them from the end of the document keeps every range valid while
 * TeXpresso receives one monotonically numbered change per replacement.
 */
export function getEditorTextChanges(update: Pick<ViewUpdate, "changes">): TypstEditorTextChange[] {
  const changes: TypstEditorTextChange[] = [];
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changes.push({ from: fromA, to: toA, text: inserted.toString() });
  });
  return changes.sort((left, right) => right.from - left.from || right.to - left.to);
}

function getEditorSelectionSnapshot(view: EditorView): TypstEditorSelection {
  const selection = view.state.selection.main;

  return {
    lineNumber: view.state.doc.lineAt(selection.head).number,
    from: selection.from,
    to: selection.to,
    head: selection.head
  };
}

function clampDocumentOffset(offset: number, documentLength: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(documentLength, Math.max(0, offset));
}

function insertLatexGraphicIntoView(
  view: EditorView,
  text: string,
  selection: boolean | { selectionStart: number; selectionEnd: number } = true
): { from: number; to: number } {
  const source = view.state.doc.toString();
  const insertionRange = resolveInsertionRange(view);
  const packageInsertion = getLatexPackageInsertion(source, "graphicx", getLatexGraphicsPackageReplacement);
  const packageOffset =
    packageInsertion && packageInsertion.from <= insertionRange.from
      ? packageInsertion.insert.length - ((packageInsertion.to ?? packageInsertion.from) - packageInsertion.from)
      : 0;
  const textFrom = insertionRange.from + packageOffset;
  const textChange = {
    from: insertionRange.from,
    to: insertionRange.to,
    insert: text
  };
  const changes = packageInsertion
    ? packageInsertion.from <= insertionRange.from
      ? [packageInsertion, textChange]
      : [textChange, packageInsertion]
    : textChange;
  const selectionRange =
    typeof selection === "object"
      ? EditorSelection.range(
          textFrom + clampDocumentOffset(selection.selectionStart, text.length),
          textFrom + clampDocumentOffset(selection.selectionEnd, text.length)
        )
      : selection
        ? EditorSelection.range(textFrom, textFrom + text.length)
        : EditorSelection.cursor(textFrom + text.length);

  view.dispatch({
    changes,
    selection: selectionRange,
    scrollIntoView: true
  });

  return {
    from: selectionRange.from,
    to: selectionRange.to
  };
}

function insertLatexTemplateWithPackagesIntoView(
  view: EditorView,
  template: string,
  packageNames: string[],
  replacementRange?: { from: number; to: number }
): void {
  const source = view.state.doc.toString();
  const insertionRange = replacementRange ? clampEditorRange(view, replacementRange) : resolveInsertionRange(view);
  const packageInsertions = getLatexPackageInsertions(source, packageNames);

  if (packageInsertions.length === 0) {
    insertSnippetIntoView(view, template, insertionRange.from, insertionRange.to);
    return;
  }

  const offset = packageInsertions.reduce((total, insertion) => {
    if (insertion.from > insertionRange.from) {
      return total;
    }

    return total + insertion.insert.length - ((insertion.to ?? insertion.from) - insertion.from);
  }, 0);
  const nextFrom = insertionRange.from + offset;
  const nextTo = insertionRange.to + offset;

  view.dispatch({
    changes: packageInsertions,
    selection: EditorSelection.range(nextFrom, nextTo),
    scrollIntoView: true
  });

  insertSnippetIntoView(view, template, nextFrom, nextTo);
}

function getLatexPackageInsertions(
  source: string,
  packageNames: string[]
): Array<{ from: number; to?: number; insert: string }> {
  const queuedPackageNames = new Set<string>();
  const insertions: Array<{ from: number; to?: number; insert: string }> = [];

  for (const packageName of packageNames) {
    const normalizedPackageName = normalizeLatexPackageName(packageName);

    if (!normalizedPackageName || queuedPackageNames.has(normalizedPackageName)) {
      continue;
    }

    queuedPackageNames.add(normalizedPackageName);

    const insertion = getLatexPackageInsertion(source, normalizedPackageName);

    if (insertion) {
      insertions.push(insertion);
    }
  }

  return combineLatexPackageInsertions(insertions);
}

function combineLatexPackageInsertions(
  insertions: Array<{ from: number; to?: number; insert: string }>
): Array<{ from: number; to?: number; insert: string }> {
  const combinedInsertions: Array<{ from: number; to?: number; insert: string }> = [];

  for (const insertion of insertions) {
    const existingInsertion = combinedInsertions.find(
      (currentInsertion) =>
        currentInsertion.from === insertion.from &&
        currentInsertion.to == null &&
        insertion.to == null
    );

    if (existingInsertion) {
      existingInsertion.insert += insertion.insert;
      continue;
    }

    combinedInsertions.push({ ...insertion });
  }

  return combinedInsertions;
}

function getLatexPackageInsertion(
  source: string,
  packageName: string,
  replacementProvider?: (source: string) => { from: number; to: number; insert: string } | null
): { from: number; to?: number; insert: string } | null {
  const normalizedPackageName = normalizeLatexPackageName(packageName);

  if (!normalizedPackageName || latexSourceHasPackage(source, normalizedPackageName)) {
    return null;
  }

  const existingPackageReplacement = replacementProvider?.(source);

  if (existingPackageReplacement) {
    return existingPackageReplacement;
  }

  const documentClassMatch = source.match(/\\documentclass(?:\s*\[[^\]]*])?\s*\{[^}]+}/);

  if (!documentClassMatch || documentClassMatch.index == null) {
    return {
      from: 0,
      insert: `\\usepackage{${normalizedPackageName}}\n`
    };
  }

  return {
    from: documentClassMatch.index + documentClassMatch[0].length,
    insert: `\n\\usepackage{${normalizedPackageName}}`
  };
}

function getLatexGraphicsPackageReplacement(source: string): { from: number; to: number; insert: string } | null {
  let lineStart = 0;

  for (const line of source.split(/\r?\n/)) {
    const commentStart = getLatexCommentStart(line);
    const visibleLine = commentStart >= 0 ? line.slice(0, commentStart) : line;
    const packagePattern = /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*])?\s*\{([^}]*)}/gi;

    for (const match of visibleLine.matchAll(packagePattern)) {
      if (match.index == null) {
        continue;
      }

      const packageList = match[1] ?? "";
      const packageListStart = lineStart + match.index + match[0].indexOf("{") + 1;
      const graphicsMatch = packageList.match(/(^|,)\s*graphics\s*(?=,|$)/i);

      if (graphicsMatch?.index == null) {
        continue;
      }

      const tokenStart = packageListStart + graphicsMatch.index + graphicsMatch[0].search(/graphics/i);

      return {
        from: tokenStart,
        to: tokenStart + "graphics".length,
        insert: "graphicx"
      };
    }

    lineStart += line.length + 1;
  }

  return null;
}

function latexSourceHasPackage(source: string, packageName: string): boolean {
  const normalizedPackageName = normalizeLatexPackageName(packageName);

  if (!normalizedPackageName) {
    return false;
  }

  for (const line of stripLatexComments(source).split(/\r?\n/)) {
    const packagePattern = /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*])?\s*\{([^}]*)}/gi;

    for (const match of line.matchAll(packagePattern)) {
      const packageList = match[1] ?? "";
      const packages = packageList
        .split(",")
        .map((name) => normalizeLatexPackageName(name));

      if (packages.includes(normalizedPackageName)) {
        return true;
      }
    }
  }

  return false;
}

function normalizeLatexPackageName(packageName: string): string {
  const normalizedPackageName = packageName
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .at(-1)
    ?.replace(/\.sty$/i, "")
    .trim()
    .toLowerCase() ?? "";

  return /^[a-z0-9_.-]+$/.test(normalizedPackageName) ? normalizedPackageName : "";
}

function stripLatexComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const commentStart = getLatexCommentStart(line);

      return commentStart >= 0 ? line.slice(0, commentStart) : line;
    })
    .join("\n");
}

function getLatexCommentStart(line: string): number {
  let backslashCount = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\\") {
      backslashCount += 1;
      continue;
    }

    if (char === "%" && backslashCount % 2 === 0) {
      return index;
    }

    backslashCount = 0;
  }

  return -1;
}

function insertTextIntoView(
  view: EditorView,
  text: string,
  selection: boolean | { selectionStart: number; selectionEnd: number } = false
): { from: number; to: number } {
  const insertionRange = resolveInsertionRange(view);
  const selectionRange =
    typeof selection === "object"
      ? EditorSelection.range(
          insertionRange.from + clampDocumentOffset(selection.selectionStart, text.length),
          insertionRange.from + clampDocumentOffset(selection.selectionEnd, text.length)
        )
      : selection
        ? EditorSelection.range(insertionRange.from, insertionRange.from + text.length)
        : EditorSelection.cursor(insertionRange.from + text.length);
  const transaction = {
    changes: {
      from: insertionRange.from,
      to: insertionRange.to,
      insert: text
    },
    selection: selectionRange
  };

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });

  return {
    from: selectionRange.from,
    to: selectionRange.to
  };
}

function clampEditorRange(view: EditorView, range: { from: number; to: number }): { from: number; to: number } {
  const documentLength = view.state.doc.length;
  const from = clampDocumentOffset(range.from, documentLength);
  const to = clampDocumentOffset(range.to, documentLength);

  return from <= to ? { from, to } : { from: to, to: from };
}

function resolveInsertionRange(view: EditorView): { from: number; to: number } {
  const selection = view.state.selection.main;

  if (isPrimaryCursorVisible(view, selection.from, selection.to)) {
    return {
      from: selection.from,
      to: selection.to
    };
  }

  const end = view.state.doc.length;
  return { from: end, to: end };
}

function isPrimaryCursorVisible(view: EditorView, from: number, to: number): boolean {
  if (view.state.selection.ranges.length !== 1) {
    return false;
  }

  const position = from === to ? from : to;
  const cursorRect = view.coordsAtPos(position);

  if (!cursorRect) {
    return false;
  }

  const scrollRect = view.scrollDOM.getBoundingClientRect();

  return (
    cursorRect.bottom >= scrollRect.top &&
    cursorRect.top <= scrollRect.bottom &&
    cursorRect.right >= scrollRect.left &&
    cursorRect.left <= scrollRect.right
  );
}

function scheduleSmoothCursorSnap(view: EditorView): void {
  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    if (!view.dom.isConnected) {
      return;
    }

    view.dispatch({
      effects: smoothCursorJumpEffect.of(undefined)
    });
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

function insertSnippetIntoView(view: EditorView, template: string, from?: number, to?: number): void {
  const selection = view.state.selection.main;
  snippet(template)(
    {
      state: view.state,
      dispatch(tr) {
        view.dispatch(tr);
      }
    },
    null,
    from ?? selection.from,
    to ?? selection.to
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

function focusEditorView(view: EditorView | null): void {
  if (!view) {
    return;
  }

  view.contentDOM.focus({ preventScroll: true });
}

function clampLineNumber(view: EditorView, lineNumber: number): number {
  return Math.max(1, Math.min(lineNumber, view.state.doc.lines));
}

function clampColumn(column: number, lineLength: number): number {
  return Math.max(0, Math.min(Math.max(column, 1) - 1, lineLength));
}

function getClipboardImageFile(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) {
    return null;
  }

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();

    if (file) {
      return file;
    }
  }

  for (const file of Array.from(clipboardData.files)) {
    if (file.type.startsWith("image/")) {
      return file;
    }
  }

  return null;
}


function shouldHandleVimPasteKey(event: KeyboardEvent, view: EditorView): boolean {
  if (
    event.key !== "p" ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return false;
  }

  const vimState = getCM(view)?.state.vim;
  return Boolean(vimState && vimState.insertMode !== true);
}

async function handleVimPaste(
  view: EditorView,
  options: {
    imagePasteInVim: boolean;
    onImagePaste: ((file: File) => Promise<boolean> | boolean) | undefined;
    vimClipboardSharing: boolean;
  }
): Promise<void> {
  if (options.imagePasteInVim && typeof navigator.clipboard?.read === "function") {
    const imageFile = await readClipboardImageFile();

    if (imageFile && options.onImagePaste) {
      await options.onImagePaste(imageFile);
      return;
    }
  }

  const cm = getCM(view);

  if (!cm) {
    return;
  }

  if (options.vimClipboardSharing && typeof navigator.clipboard?.readText === "function") {
    try {
      const clipboardText = await navigator.clipboard.readText();

      if (clipboardText) {
        Vim.getRegisterController().unnamedRegister.setText(clipboardText);
      }
    } catch (error) {
      console.warn("Unable to read system clipboard for Vim paste.", error);
    }
  }

  Vim.handleKey(cm, "p", "mapping");
}

async function readClipboardImageFile(): Promise<File | null> {
  try {
    const items = await navigator.clipboard.read();

    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));

      if (!imageType) {
        continue;
      }

      const blob = await item.getType(imageType);
      const extension = imageType === "image/jpeg" ? "jpg" : imageType.split("/").at(-1) || "png";
      return new File([blob], `clipboard-image.${extension}`, { type: imageType });
    }
  } catch (error) {
    console.warn("Unable to read clipboard image for Vim paste.", error);
  }

  return null;
}
