import { EditorSelection, type SelectionRange } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";

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
          insert: "$  $"
        },
        range: EditorSelection.cursor(selection.from + 2)
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
            from: selection.from,
            insert: " "
          },
          {
            from: selection.to,
            insert: " "
          }
        ],
        range: shiftSelection(selection, 1)
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
