import { countColumn, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";

const WRAPPED_LINE_CLASS = "cm-wrapped-line-indent";
const WRAPPED_LINE_INDENT_PROPERTY = "--cm-wrapped-line-indent";

const wrappedLineIndentTheme = EditorView.baseTheme({
  [`.cm-line.${WRAPPED_LINE_CLASS}`]: {
    marginLeft: `var(${WRAPPED_LINE_INDENT_PROPERTY})`,
    textIndent: `calc(-1 * var(${WRAPPED_LINE_INDENT_PROPERTY}))`
  }
});

class WrappedLineIndentPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = createWrappedLineIndentDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = createWrappedLineIndentDecorations(update.view);
    }
  }
}

const wrappedLineIndentPlugin = ViewPlugin.fromClass(WrappedLineIndentPlugin, {
  decorations: (plugin) => plugin.decorations
});

function createWrappedLineIndentDecorations(view: EditorView): DecorationSet {
  const decorations = new RangeSetBuilder<Decoration>();
  let lastDecoratedLine = -1;

  for (const { from, to } of view.visibleRanges) {
    let position = view.state.doc.lineAt(from).from;

    while (position <= to) {
      const line = view.state.doc.lineAt(position);
      if (line.from > lastDecoratedLine) {
        const indentColumns = getLeadingIndentColumns(line.text, view.state.tabSize);
        if (indentColumns > 0) {
          decorations.add(
            line.from,
            line.from,
            Decoration.line({
              class: WRAPPED_LINE_CLASS,
              attributes: {
                style: `${WRAPPED_LINE_INDENT_PROPERTY}: ${indentColumns}ch`
              }
            })
          );
        }
        lastDecoratedLine = line.from;
      }

      if (line.to >= to || line.to === view.state.doc.length) {
        break;
      }
      position = line.to + 1;
    }
  }

  return decorations.finish();
}

export function getLeadingIndentColumns(line: string, tabSize: number): number {
  const indentation = line.match(/^[\t ]+/)?.[0] ?? "";
  return countColumn(indentation, tabSize);
}

export function wrappedLineIndent(): Extension {
  return [wrappedLineIndentTheme, wrappedLineIndentPlugin];
}
