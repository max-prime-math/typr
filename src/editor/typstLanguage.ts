import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";

export function typstLanguage(): Extension {
  // TODO: Replace this markdown fallback with a dedicated Typst parser/highlighter
  // when a maintained CodeMirror 6 Typst language package is selected.
  return markdown();
}
