import {
  acceptCompletion,
  autocompletion,
  clearSnippet,
  completionStatus,
  nextSnippetField,
  prevSnippetField,
  type CompletionSource
} from "@codemirror/autocomplete";
import {
  addCursorAbove,
  addCursorBelow,
  defaultKeymap,
  history,
  historyKeymap,
  indentMore
} from "@codemirror/commands";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import {
  search as searchExtension,
  searchKeymap,
  selectNextOccurrence,
  selectSelectionMatches
} from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
  type Command,
  type ViewUpdate
} from "@codemirror/view";
import { getCM, vim, Vim } from "@replit/codemirror-vim";
import { markdown } from "@codemirror/lang-markdown";
import { latex } from "codemirror-lang-latex";
import type { StyleSpec } from "style-mod";
import { tags } from "@lezer/highlight";
import type { KeybindingMap } from "../app/keybindings";
import { toCodeMirrorKeybinding } from "../app/keybindings";
import type { SourceLanguage } from "../compiler/sourceFileTypes";
import type { CompileDiagnostic } from "../compiler/types";
import { createEditorDiagnosticExtensions } from "./editorDiagnostics";
import { toggleMathDelimiterCommand } from "./mathActions";
import { smoothCursor } from "./smoothCursor";
import { typstLanguage } from "./typstLanguage";
import type { ThemeDefinition } from "../theme/themes";

interface EditorSetupOptions {
  onChange: (update: ViewUpdate) => void;
  onSelectionChange: (update: ViewUpdate) => void;
  readOnly: boolean;
  vimMode: boolean;
  relativeLineNumbers: boolean;
  cursorSmooth: boolean;
  cursorSmear: number;
  editorFontSize: number;
  keybindings: KeybindingMap;
  theme: ThemeDefinition;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
  language: SourceLanguage;
  snippetSource: CompletionSource;
  onSearchRequested: () => void;
  onCompileRequested: () => void;
  onFormatRequested: () => void;
  onCloseRequested: () => void;
}

export const diagnosticsCompartment = new Compartment();

let latestVimCloseRequested: (() => void) | null = null;
let vimCloseCommandsRegistered = false;

function registerVimCloseCommands(onCloseRequested: () => void): void {
  latestVimCloseRequested = onCloseRequested;

  if (vimCloseCommandsRegistered) {
    return;
  }

  Vim.defineEx("quit", "q", () => {
    latestVimCloseRequested?.();
  });
  Vim.defineEx("wq", "wq", () => {
    latestVimCloseRequested?.();
  });
  vimCloseCommandsRegistered = true;
}

const editorHighlightStyle = HighlightStyle.define([
  {
    tag: tags.comment,
    color: "var(--text-muted)",
    fontStyle: "italic"
  },
  {
    tag: [tags.keyword, tags.definitionKeyword, tags.processingInstruction],
    color: "var(--accent)",
    fontWeight: "700"
  },
  {
    tag: tags.heading,
    color: "var(--accent-strong)",
    fontWeight: "700"
  },
  {
    tag: [tags.className, tags.atom, tags.variableName],
    color: "color-mix(in srgb, var(--accent) 84%, var(--editor-foreground))"
  },
  {
    tag: tags.string,
    color: "color-mix(in srgb, var(--accent) 68%, var(--editor-foreground))"
  },
  {
    tag: [tags.labelName, tags.quote, tags.number],
    color: "color-mix(in srgb, var(--warning) 84%, var(--editor-foreground))"
  },
  {
    tag: [tags.meta, tags.monospace],
    color: "color-mix(in srgb, var(--text-muted) 64%, var(--editor-foreground))"
  },
  {
    tag: [tags.operator, tags.bracket, tags.punctuation],
    color: "color-mix(in srgb, var(--text-muted) 76%, var(--editor-foreground))"
  },
  {
    tag: tags.invalid,
    color: "var(--danger)",
    textDecoration: "underline wavy color-mix(in srgb, var(--danger) 60%, transparent)"
  },
  {
    tag: tags.strong,
    fontWeight: "700"
  },
  {
    tag: tags.emphasis,
    fontStyle: "italic"
  }
]);

function createEditorTheme(
  theme: ThemeDefinition,
  cursorSmooth: boolean,
  editorFontSize: number
): Extension {
  const dark = theme.mode === "dark";
  const smoothCursorStyles: Record<string, StyleSpec> = cursorSmooth
    ? {
        ".cm-content": {
          caretColor: "transparent"
        },
        "&.cm-smooth-cursor-active .cm-cursor, &.cm-smooth-cursor-active .cm-dropCursor, &.cm-smooth-cursor-active .cm-fat-cursor": {
          borderLeftColor: "transparent !important",
          borderRightColor: "transparent !important",
          borderTopColor: "transparent !important",
          borderBottomColor: "transparent !important",
          opacity: "0 !important"
        },
        "&.cm-smooth-cursor-active.cm-focused .cm-cursor, &.cm-smooth-cursor-active.cm-focused .cm-dropCursor, &.cm-smooth-cursor-active.cm-focused .cm-fat-cursor": {
          display: "none !important"
        },
        ".cm-fat-cursor-mark": {
          backgroundColor: "transparent !important"
        },
        ".cm-smooth-cursor": {
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 12,
          pointerEvents: "none",
          borderRadius: "0",
          opacity: 0,
          backgroundColor: "var(--accent)",
          contain: "layout style paint",
          backfaceVisibility: "hidden",
          willChange: "transform, width, height, opacity, clip-path",
          transition: "opacity 90ms ease"
        },
        ".cm-smooth-cursor-smear": {
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 11,
          pointerEvents: "none",
          borderRadius: "0",
          opacity: 0,
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 72%, transparent))",
          contain: "layout style paint",
          backfaceVisibility: "hidden",
          willChange: "transform, width, height, opacity, clip-path, background"
        },
        ".cm-smooth-cursor-smear--visible": {
          opacity: 0.28
        },
        ".cm-smooth-cursor--visible": {
          opacity: 1
        }
      }
    : {};

  return EditorView.theme(
    {
      "&": {
        height: "100%",
        color: "var(--editor-foreground)",
        backgroundColor: "var(--editor-background)",
        fontSize: `${editorFontSize}px`
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily:
          '"Iosevka Term", "JetBrains Mono", "SFMono-Regular", monospace',
        lineHeight: "1.6"
      },
      ".cm-content": {
        minHeight: "100%",
        padding: "1rem"
      },
      ".cm-gutters": {
        backgroundColor: "var(--editor-gutter)",
        color: "var(--editor-gutter-foreground)",
        border: "none"
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--editor-active-line)"
      },
      ".cm-selectionBackground": {
        backgroundColor:
          "color-mix(in srgb, var(--accent) 22%, var(--editor-background)) !important"
      },
      ".cm-line::selection, .cm-line > span::selection, .cm-content ::selection": {
        backgroundColor: "transparent !important"
      },
      ...smoothCursorStyles
    },
    { dark }
  );
}

export function createEditorState(
  value: string,
  options: EditorSetupOptions
): EditorState {
  return EditorState.create({
    doc: value,
    extensions: createEditorExtensions(options)
  });
}

export function createEditorExtensions({
  onChange,
  onSelectionChange,
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
  language,
  snippetSource,
  onSearchRequested,
  onCompileRequested,
  onFormatRequested,
  onCloseRequested
}: EditorSetupOptions): Extension[] {
  if (vimMode) {
    registerVimCloseCommands(onCloseRequested);
  }

  const lineNumberExtension = lineNumbers({
    formatNumber: (lineNumber, state) => {
      if (!relativeLineNumbers) {
        return String(lineNumber);
      }

      const activeLine = state.doc.lineAt(state.selection.main.head).number;
      const delta = Math.abs(lineNumber - activeLine);
      return delta === 0 ? String(lineNumber) : String(delta);
    }
  });

  const keymaps = [
    { key: toCodeMirrorKeybinding(keybindings.openSearch), run: () => {
      onSearchRequested();
      return true;
    }, scope: "editor" },
    { key: toCodeMirrorKeybinding(keybindings.compile), run: () => {
      onCompileRequested();
      return true;
    }, scope: "editor" },
    { key: toCodeMirrorKeybinding(keybindings.formatDocument), run: () => {
      onFormatRequested();
      return true;
    }, scope: "editor" },
    { key: toCodeMirrorKeybinding(keybindings.multiCursorAbove), run: addCursorAbove },
    { key: toCodeMirrorKeybinding(keybindings.multiCursorBelow), run: addCursorBelow },
    { key: toCodeMirrorKeybinding(keybindings.multiCursorNextMatch), run: selectNextOccurrence, preventDefault: true },
    { key: toCodeMirrorKeybinding(keybindings.multiCursorAllMatches), run: selectSelectionMatches },
    { key: toCodeMirrorKeybinding(keybindings.multiCursorLineEnds), run: addCursorToSelectedLineEnds },
    ...defaultKeymap.filter(
      (binding) => binding.run !== addCursorAbove && binding.run !== addCursorBelow
    ),
    ...historyKeymap,
    ...searchKeymap.filter(
      (binding) =>
        binding.key !== "Mod-f" &&
        binding.run !== selectNextOccurrence &&
        binding.run !== selectSelectionMatches
    )
  ];
  const tabCommand: Command = (view) => {
    if (nextSnippetField(view)) {
      return true;
    }

    if (completionStatus(view.state) !== null) {
      return acceptCompletion(view);
    }

    return indentMore(view);
  };
  const mathDelimiterCommand: Command = (view) => {
    if (!shouldHandleMathDelimiterShortcut(view, vimMode)) {
      return false;
    }

    return toggleMathDelimiterCommand(view);
  };

  return [
    EditorState.readOnly.of(readOnly),
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey),
    rectangularSelection({
      eventFilter: isRectangularSelectionGesture
    }),
    crosshairCursor({ key: "Alt" }),
    lineNumberExtension,
    diagnosticsCompartment.of(
      createEditorDiagnosticExtensions(diagnostics, highlightErrors)
    ),
    highlightActiveLineGutter(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    searchExtension(),
    autocompletion({
      override: [snippetSource]
    }),
    syntaxHighlighting(editorHighlightStyle, { fallback: true }),
    createLanguageExtension(language),
    keymap.of([
      { key: "$", run: mathDelimiterCommand },
      { key: "Tab", run: tabCommand },
      { key: "Shift-Tab", run: prevSnippetField },
      { key: "Escape", run: clearSnippet },
      ...keymaps
    ]),
    EditorView.lineWrapping,
    createEditorTheme(theme, cursorSmooth, editorFontSize),
    ...(cursorSmooth ? [smoothCursor(vimMode, cursorSmear)] : []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update);
      }

      if (update.selectionSet) {
        onSelectionChange(update);
      }
    }),
    ...(vimMode ? [vim()] : [])
  ];
}

function createLanguageExtension(language: SourceLanguage): Extension {
  if (language === "latex") {
    return latex({
      autoCloseTags: false,
      enableAutocomplete: false,
      enableLinting: false,
      enableTooltips: false,
      autoCloseBrackets: false
    });
  }

  if (language === "typst") {
    return typstLanguage();
  }

  if (language === "markdown") {
    return markdown();
  }

  return [];
}

function shouldHandleMathDelimiterShortcut(view: EditorView, vimMode: boolean): boolean {
  if (!vimMode) {
    return true;
  }

  return getCM(view)?.state.vim?.insertMode === true;
}

function isRectangularSelectionGesture(event: MouseEvent): boolean {
  return event.button === 0 && event.altKey && event.shiftKey;
}

const addCursorToSelectedLineEnds: Command = (view) => {
  const lineEnds = new Map<number, number>();

  for (const selection of view.state.selection.ranges) {
    const fromLine = view.state.doc.lineAt(selection.from);
    const toLine = view.state.doc.lineAt(selection.to);

    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber);
      lineEnds.set(lineNumber, line.to);
    }
  }

  if (lineEnds.size <= 1 && view.state.selection.ranges.length === 1) {
    return false;
  }

  const ranges = [...lineEnds.values()].map((position) => EditorSelection.cursor(position));
  view.dispatch({
    selection: EditorSelection.create(ranges, ranges.length - 1),
    scrollIntoView: true,
    userEvent: "select.multiple"
  });

  return true;
};
