import {
  acceptCompletion,
  autocompletion,
  clearSnippet,
  completionStatus,
  nextSnippetField,
  prevSnippetField,
  type CompletionSource
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentMore } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type Command, type ViewUpdate } from "@codemirror/view";
import { getCM, vim } from "@replit/codemirror-vim";
import type { StyleSpec } from "style-mod";
import type { CompileDiagnostic } from "../compiler/types";
import { createEditorDiagnosticExtensions } from "./editorDiagnostics";
import { toggleMathDelimiterCommand } from "./mathActions";
import { smoothCursor } from "./smoothCursor";
import { typstLanguage } from "./typstLanguage";
import type { ThemeDefinition } from "../theme/themes";

interface EditorSetupOptions {
  onChange: (update: ViewUpdate) => void;
  vimMode: boolean;
  cursorSmooth: boolean;
  cursorSmear: number;
  theme: ThemeDefinition;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
  snippetSource: CompletionSource;
}

export const diagnosticsCompartment = new Compartment();

function createEditorTheme(theme: ThemeDefinition, cursorSmooth: boolean): Extension {
  const dark = theme.mode === "dark";
  const smoothCursorStyles: Record<string, StyleSpec> = cursorSmooth
    ? {
        ".cm-content": {
          caretColor: "transparent"
        },
        ".cm-cursor, .cm-dropCursor, .cm-fat-cursor": {
          borderLeftColor: "transparent !important",
          borderRightColor: "transparent !important",
          borderTopColor: "transparent !important",
          borderBottomColor: "transparent !important",
          opacity: "0 !important"
        },
        ".cm-focused .cm-cursor, .cm-focused .cm-dropCursor, .cm-focused .cm-fat-cursor": {
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
          willChange: "transform, width, height, opacity",
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
          willChange: "transform, width, height, opacity"
        },
        ".cm-smooth-cursor-smear--visible": {
          opacity: 0.28
        },
        ".cm-smooth-cursor--visible": {
          opacity: 1,
          animation: "typr-cursor-breathe 1.15s ease-in-out infinite"
        },
        "@keyframes typr-cursor-breathe": {
          "0%, 100%": {
            filter: "brightness(0.9)",
            opacity: 0.72,
            transformOrigin: "center"
          },
          "50%": {
            filter: "brightness(1.45)",
            opacity: 1
          }
        }
      }
    : {};

  return EditorView.theme(
    {
      "&": {
        height: "100%",
        color: "var(--editor-foreground)",
        backgroundColor: "var(--editor-background)",
        fontSize: "16px"
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
      ".cm-activeLine": {
        backgroundColor: "var(--editor-active-line)"
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--editor-active-line)"
      },
      ".cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "var(--editor-selection) !important"
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
  vimMode,
  cursorSmooth,
  cursorSmear,
  theme,
  diagnostics,
  highlightErrors,
  snippetSource
}: EditorSetupOptions): Extension[] {
  const keymaps = [...defaultKeymap, ...historyKeymap, ...searchKeymap];
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
    lineNumbers(),
    diagnosticsCompartment.of(
      createEditorDiagnosticExtensions(diagnostics, highlightErrors)
    ),
    highlightActiveLineGutter(),
    drawSelection(),
    history(),
    foldGutter(),
    indentOnInput(),
    bracketMatching(),
    autocompletion({
      override: [snippetSource]
    }),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    typstLanguage(),
    keymap.of([
      { key: "$", run: mathDelimiterCommand },
      { key: "Tab", run: tabCommand },
      { key: "Shift-Tab", run: prevSnippetField },
      { key: "Escape", run: clearSnippet },
      ...keymaps
    ]),
    EditorView.lineWrapping,
    createEditorTheme(theme, cursorSmooth),
    ...(cursorSmooth ? [smoothCursor(vimMode, cursorSmear)] : []),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update);
      }
    }),
    ...(vimMode ? [vim()] : [])
  ];
}

function shouldHandleMathDelimiterShortcut(view: EditorView, vimMode: boolean): boolean {
  if (!vimMode) {
    return true;
  }

  return getCM(view)?.state.vim?.insertMode === true;
}
