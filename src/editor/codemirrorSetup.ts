import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import type { CompileDiagnostic } from "../compiler/types";
import { createEditorDiagnosticExtensions } from "./editorDiagnostics";
import { typstLanguage } from "./typstLanguage";
import type { ThemeDefinition } from "../theme/themes";

interface EditorSetupOptions {
  onChange: (value: string) => void;
  vimMode: boolean;
  theme: ThemeDefinition;
  diagnostics: CompileDiagnostic[];
  highlightErrors: boolean;
}

export const diagnosticsCompartment = new Compartment();

function createEditorTheme(theme: ThemeDefinition): Extension {
  const dark = theme.mode === "dark";

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
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-cursor": {
        borderLeftColor: "var(--accent)"
      }
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
  theme,
  diagnostics,
  highlightErrors
}: EditorSetupOptions): Extension[] {
  const keymaps = [...defaultKeymap, ...historyKeymap, ...searchKeymap];

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
    autocompletion(),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    typstLanguage(),
    keymap.of([indentWithTab, ...keymaps]),
    EditorView.lineWrapping,
    createEditorTheme(theme),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    ...(vimMode ? [vim()] : [])
  ];
}
