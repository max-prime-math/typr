import { EditorSelection, type SelectionRange } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";
import type { SourceLanguage } from "../compiler/sourceFileTypes";

export type MathDelimiterKey = "$" | "(" | ")" | "[" | "]";

export interface MathDelimiterEdit {
  from: number;
  to: number;
  insert: string;
  cursor: number;
  selection?: { anchor: number; head: number };
}

export const toggleMathDelimiterCommand: Command = (view) => {
  cycleMathDelimiter(view);
  return true;
};

export function cycleMathDelimiter(view: EditorView): void {
  const transaction = view.state.changeByRange((selection) => {
    if (selection.from === selection.to) {
      return {
        changes: {
          from: selection.from,
          insert: "$$"
        },
        range: EditorSelection.cursor(selection.from + 1)
      };
    }

    const selectionState = classifyMathSelection(view, selection);

    if (selectionState === "spaced") {
      return {
        changes: [
          {
            from: selection.from - 2,
            to: selection.from,
            insert: ""
          },
          {
            from: selection.to,
            to: selection.to + 2,
            insert: ""
          }
        ],
        range: shiftSelection(selection, -2)
      };
    }

    if (selectionState === "tight") {
      return {
        changes: [
          {
            from: selection.from - 1,
            to: selection.from,
            insert: ""
          },
          {
            from: selection.to,
            to: selection.to + 1,
            insert: ""
          }
        ],
        range: shiftSelection(selection, -1)
      };
    }

    return {
      changes: {
        from: selection.from,
        to: selection.to,
        insert: `$${view.state.sliceDoc(selection.from, selection.to)}$`
      },
      range: shiftSelection(selection, 1)
    };
  });

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });
}

/**
 * Applies the math-delimiter behavior used by direct editor keystrokes.
 * Returning null lets CodeMirror handle the key normally.
 */
export function getMathDelimiterEdit(
  source: string,
  selection: { from: number; to: number },
  key: MathDelimiterKey,
  language: SourceLanguage
): MathDelimiterEdit | null {
  const { from, to } = selection;

  if (key === "$") {
    if (from !== to) {
      const selectedText = source.slice(from, to);

      if (
        source.slice(from - 2, from) === "$$" &&
        source.slice(to, to + 2) === "$$" &&
        source[from - 3] !== "$" &&
        source[to + 2] !== "$"
      ) {
        return {
          from: from - 2,
          to: to + 2,
          insert: selectedText,
          cursor: to - 2,
          selection: { anchor: from - 2, head: to - 2 }
        };
      }

      if (
        source[from - 1] === "$" &&
        source[to] === "$" &&
        source[from - 2] !== "$" &&
        source[to + 1] !== "$"
      ) {
        return {
          from: from - 1,
          to: to + 1,
          insert: `$$${selectedText}$$`,
          cursor: to + 1,
          selection: { anchor: from + 1, head: to + 1 }
        };
      }

      return {
        from,
        to,
        insert: `$${selectedText}$`,
        cursor: to + 1,
        selection: { anchor: from + 1, head: to + 1 }
      };
    }

    if (isEscapedAt(source, from)) {
      return null;
    }

    // $|$ -> $$|$$, then $$|$$ -> nothing.
    if (
      source.slice(from - 2, from + 2) === "$$$$" &&
      source[from - 3] !== "$" &&
      source[from + 2] !== "$"
    ) {
      return { from: from - 2, to: from + 2, insert: "", cursor: from - 2 };
    }

    if (
      source[from - 1] === "$" &&
      source[from] === "$" &&
      source[from - 2] !== "$" &&
      source[from + 1] !== "$"
    ) {
      return { from: from - 1, to: from + 1, insert: "$$$$", cursor: from + 1 };
    }

    const activeDollar = getClosingDollarDelimiterAt(source, from);
    if (activeDollar && activeDollar.contentFrom < from) {
      return { from, to: from, insert: "", cursor: from + activeDollar.width };
    }

    return { from, to, insert: "$$", cursor: from + 1 };
  }

  if (language !== "latex" && language !== "markdown") {
    return null;
  }

  if (from !== to && (key === "]" || key === ")")) {
    const expectedOpener = key === "]" ? "\\[" : "\\(";
    const expectedCloser = key === "]" ? "\\]" : "\\)";
    if (
      source.slice(from - expectedOpener.length, from) === expectedOpener &&
      source.slice(to, to + expectedCloser.length) === expectedCloser
    ) {
      return { from: to, to, insert: "", cursor: to + expectedCloser.length };
    }
  }

  if ((key === "[" || key === "(") && from === to && hasUnescapedBackslashBefore(source, from)) {
    const closer = key === "[" ? "\\]" : "\\)";
    return { from, to, insert: `${key}${closer}`, cursor: from + 1 };
  }

  if ((key === "]" || key === ")") && from === to) {
    const closer = key === "]" ? "\\]" : "\\)";
    const opener = key === "]" ? "\\[" : "\\(";

    // Also accept typing the complete closer (\] or \)). The backslash was
    // inserted by the previous keystroke, so remove it and cross the auto-close.
    if (
      source[from - 1] === "\\" &&
      source.startsWith(closer, from) &&
      findActiveSlashOpener(source, from - 1, opener, closer) !== null
    ) {
      return { from: from - 1, to: from, insert: "", cursor: from + 1 };
    }

    if (source.startsWith(closer, from) && findActiveSlashOpener(source, from, opener, closer) !== null) {
      return { from, to, insert: "", cursor: from + closer.length };
    }
  }

  return null;
}

export function getMathDelimiterTabEdit(
  source: string,
  cursor: number,
  language: SourceLanguage
): MathDelimiterEdit | null {
  if (
    source.slice(cursor - 2, cursor + 2) === "$$$$" &&
    source[cursor - 3] !== "$" &&
    source[cursor + 2] !== "$"
  ) {
    return { from: cursor, to: cursor, insert: "", cursor: cursor + 2 };
  }

  if (
    source[cursor - 1] === "$" &&
    source[cursor] === "$" &&
    source[cursor - 2] !== "$" &&
    source[cursor + 1] !== "$"
  ) {
    return { from: cursor, to: cursor, insert: "", cursor: cursor + 1 };
  }

  const activeDollar = getClosingDollarDelimiterAt(source, cursor);
  if (activeDollar) {
    return { from: cursor, to: cursor, insert: "", cursor: cursor + activeDollar.width };
  }

  if (language !== "latex" && language !== "markdown") {
    return null;
  }

  for (const [opener, closer] of [["\\[", "\\]"], ["\\(", "\\)"]] as const) {
    if (
      source.startsWith(closer, cursor) &&
      findActiveSlashOpener(source, cursor, opener, closer) !== null
    ) {
      return { from: cursor, to: cursor, insert: "", cursor: cursor + closer.length };
    }
  }

  return null;
}

export function getSelectedMathDelimiterExit(
  source: string,
  selection: { from: number; to: number },
  language: SourceLanguage
): number | null {
  const { from, to } = selection;
  if (from === to) {
    return null;
  }

  if (source.slice(from - 2, from) === "$$" && source.slice(to, to + 2) === "$$") {
    return to + 2;
  }

  if (source[from - 1] === "$" && source[to] === "$") {
    return to + 1;
  }

  if (language === "latex" || language === "markdown") {
    for (const [opener, closer] of [["\\[", "\\]"], ["\\(", "\\)"]] as const) {
      if (
        source.slice(from - opener.length, from) === opener &&
        source.slice(to, to + closer.length) === closer
      ) {
        return to + closer.length;
      }
    }
  }

  return null;
}

export function applyMathDelimiterEdit(source: string, edit: MathDelimiterEdit): string {
  return source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
}

function getClosingDollarDelimiterAt(
  source: string,
  cursor: number
): { width: 1 | 2; contentFrom: number } | null {
  for (const width of [2, 1] as const) {
    const delimiter = "$".repeat(width);
    if (!isExactDollarDelimiterAt(source, cursor, width)) {
      continue;
    }

    const positions: number[] = [];
    let position = source.indexOf(delimiter);
    while (position !== -1 && position < cursor) {
      if (isExactDollarDelimiterAt(source, position, width)) {
        positions.push(position);
      }
      position = source.indexOf(delimiter, position + 1);
    }

    if (positions.length % 2 === 1) {
      return {
        width,
        contentFrom: positions[positions.length - 1] + width
      };
    }
  }

  return null;
}

function isExactDollarDelimiterAt(source: string, position: number, width: 1 | 2): boolean {
  if (
    position < 0 ||
    source.slice(position, position + width) !== "$".repeat(width) ||
    isEscapedAt(source, position)
  ) {
    return false;
  }

  return source[position - 1] !== "$" && source[position + width] !== "$";
}

function findActiveSlashOpener(
  source: string,
  cursor: number,
  opener: "\\[" | "\\(",
  closer: "\\]" | "\\)"
): number | null {
  const openerPosition = source.lastIndexOf(opener, cursor - 1);
  if (openerPosition === -1 || isEscapedAt(source, openerPosition)) {
    return null;
  }

  const closerPosition = source.lastIndexOf(closer, cursor - 1);
  return closerPosition < openerPosition ? openerPosition : null;
}

function hasUnescapedBackslashBefore(source: string, cursor: number): boolean {
  return source[cursor - 1] === "\\" && !isEscapedAt(source, cursor - 1);
}

function isEscapedAt(source: string, position: number): boolean {
  let backslashCount = 0;
  for (let index = position - 1; index >= 0 && source[index] === "\\"; index -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function classifyMathSelection(
  view: EditorView,
  selection: SelectionRange
): "plain" | "tight" | "spaced" {
  const doc = view.state.doc;
  const before1 = selection.from > 0 ? doc.sliceString(selection.from - 1, selection.from) : "";
  const after1 = selection.to < doc.length ? doc.sliceString(selection.to, selection.to + 1) : "";

  if (before1 === "$" && after1 === "$") {
    return "tight";
  }

  const before2 =
    selection.from > 1 ? doc.sliceString(selection.from - 2, selection.from - 1) : "";
  const after2 =
    selection.to + 1 < doc.length ? doc.sliceString(selection.to + 1, selection.to + 2) : "";

  if (before2 === "$" && before1 === " " && after1 === " " && after2 === "$") {
    return "spaced";
  }

  return "plain";
}

function shiftSelection(selection: SelectionRange, offset: number): SelectionRange {
  return EditorSelection.range(selection.from + offset, selection.to + offset);
}
