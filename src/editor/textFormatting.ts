import { EditorSelection } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";
import type { SourceLanguage } from "../compiler/sourceFileTypes";

export type TextFormatKind = "bold" | "italic" | "underline";

interface TextFormatMarkup {
  before: string;
  after: string;
}

interface TextRange {
  from: number;
  to: number;
}

interface TextFormatResult {
  changes: {
    from: number;
    to: number;
    insert: string;
  };
  selection: TextRange;
}

export function toggleTextFormatCommand(
  language: SourceLanguage,
  kind: TextFormatKind
): Command {
  return (view) => {
    toggleTextFormatInView(view, language, kind);
    return true;
  };
}

export function toggleTextFormatInView(
  view: EditorView,
  language: SourceLanguage,
  kind: TextFormatKind
): void {
  const markup = getTextFormatMarkup(language, kind);
  const source = view.state.doc.toString();
  const transaction = view.state.changeByRange((selection) => {
    const result = toggleTextFormatRange(source, selection, markup);

    return {
      changes: result.changes,
      range: EditorSelection.range(result.selection.from, result.selection.to)
    };
  });

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });
  view.focus();
}

export function toggleTextFormatInSource(
  source: string,
  selection: TextRange,
  language: SourceLanguage,
  kind: TextFormatKind
): { source: string; selection: TextRange } {
  const result = toggleTextFormatRange(source, selection, getTextFormatMarkup(language, kind));

  return {
    source: `${source.slice(0, result.changes.from)}${result.changes.insert}${source.slice(result.changes.to)}`,
    selection: result.selection
  };
}

function getTextFormatMarkup(language: SourceLanguage, kind: TextFormatKind): TextFormatMarkup {
  if (language === "latex") {
    if (kind === "bold") {
      return { before: "\\textbf{", after: "}" };
    }

    if (kind === "italic") {
      return { before: "\\textit{", after: "}" };
    }

    return { before: "\\underline{", after: "}" };
  }

  if (language === "markdown") {
    if (kind === "bold") {
      return { before: "**", after: "**" };
    }

    if (kind === "italic") {
      return { before: "_", after: "_" };
    }

    return { before: "<u>", after: "</u>" };
  }

  if (kind === "bold") {
    return { before: "*", after: "*" };
  }

  if (kind === "italic") {
    return { before: "_", after: "_" };
  }

  return { before: "#underline[", after: "]" };
}

function toggleTextFormatRange(
  source: string,
  selection: TextRange,
  markup: TextFormatMarkup
): TextFormatResult {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selectedText = source.slice(from, to);

  if (from !== to) {
    const outsideWrapped = getOutsideWrappedRange(source, from, to, markup);

    if (outsideWrapped) {
      return removeMarkup(source, outsideWrapped.contentFrom, outsideWrapped.contentTo, markup);
    }

    if (selectedText.startsWith(markup.before) && selectedText.endsWith(markup.after)) {
      const content = selectedText.slice(markup.before.length, selectedText.length - markup.after.length);

      return {
        changes: { from, to, insert: content },
        selection: { from, to: from + content.length }
      };
    }

    return wrapRange(source, from, to, markup);
  }

  const enclosingRange = findEnclosingMarkupRange(source, from, markup);

  if (enclosingRange) {
    return removeMarkup(source, enclosingRange.contentFrom, enclosingRange.contentTo, markup);
  }

  return wrapRange(source, from, to, markup);
}

function getOutsideWrappedRange(
  source: string,
  from: number,
  to: number,
  markup: TextFormatMarkup
): { contentFrom: number; contentTo: number } | null {
  const beforeFrom = from - markup.before.length;
  const afterTo = to + markup.after.length;

  if (
    beforeFrom >= 0 &&
    afterTo <= source.length &&
    source.slice(beforeFrom, from) === markup.before &&
    source.slice(to, afterTo) === markup.after
  ) {
    return { contentFrom: from, contentTo: to };
  }

  return null;
}

function findEnclosingMarkupRange(
  source: string,
  position: number,
  markup: TextFormatMarkup
): { contentFrom: number; contentTo: number } | null {
  const lineStart = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextLineBreak = source.indexOf("\n", position);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const beforeFrom = source.lastIndexOf(markup.before, position);

  if (beforeFrom < lineStart) {
    return null;
  }

  const contentFrom = beforeFrom + markup.before.length;

  if (contentFrom > position) {
    return null;
  }

  const contentTo = source.indexOf(markup.after, position);

  if (contentTo < position || contentTo + markup.after.length > lineEnd) {
    return null;
  }

  return { contentFrom, contentTo };
}

function wrapRange(
  source: string,
  from: number,
  to: number,
  markup: TextFormatMarkup
): TextFormatResult {
  const selectedText = source.slice(from, to);
  const insert = `${markup.before}${selectedText}${markup.after}`;
  const contentFrom = from + markup.before.length;
  const contentTo = contentFrom + selectedText.length;

  return {
    changes: { from, to, insert },
    selection: { from: contentFrom, to: contentTo }
  };
}

function removeMarkup(
  source: string,
  contentFrom: number,
  contentTo: number,
  markup: TextFormatMarkup
): TextFormatResult {
  const from = contentFrom - markup.before.length;
  const to = contentTo + markup.after.length;
  const content = source.slice(contentFrom, contentTo);

  return {
    changes: { from, to, insert: content },
    selection: { from, to: from + content.length }
  };
}
