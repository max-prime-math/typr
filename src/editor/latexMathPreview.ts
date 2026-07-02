import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, showTooltip, ViewPlugin, type Tooltip, type ViewUpdate } from "@codemirror/view";
import "ratex-wasm/fonts.css";
import {
  initRatex,
  renderLatexToDisplayList,
  renderToCanvas,
  type DisplayList
} from "ratex-wasm";

interface MathPreviewRange {
  from: number;
  to: number;
  latex: string;
  display: boolean;
}

interface OpenMathRegion {
  contentFrom: number;
  display: boolean;
  close: string | null;
  envName?: string;
}

const MATH_ENVIRONMENTS = new Set([
  "align",
  "alignat",
  "displaymath",
  "equation",
  "gather",
  "math",
  "multline"
]);

const MIN_PREVIEW_LENGTH = 1;
let ratexReady: Promise<void> | null = null;

const setLatexMathPreviewTooltip = StateEffect.define<Tooltip | null>();

const latexMathPreviewTooltipField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLatexMathPreviewTooltip)) {
        value = effect.value;
      }
    }

    return value;
  },
  provide: (field) => showTooltip.from(field)
});

export function latexMathPreview(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      private currentRange: MathPreviewRange | null = null;
      private requestId = 0;

      constructor(private readonly view: EditorView) {}

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
          this.updatePreview();
        }
      }

      private updatePreview(): void {
        const range = getLatexMathPreviewRange(
          this.view.state.doc.toString(),
          this.view.state.selection.main.head
        );

        if (!this.view.hasFocus || !range) {
          this.clearPreview();
          return;
        }

        if (this.currentRange && areRangesEqual(this.currentRange, range)) {
          return;
        }

        this.currentRange = range;
        this.dispatchTooltip(null);
        const requestId = ++this.requestId;

        getRatexReady()
          .then(() => renderLatexToDisplayList(range.latex, getRatexTextColor(this.view.dom)))
          .then((displayList) => {
            if (requestId !== this.requestId || !this.currentRange || !areRangesEqual(this.currentRange, range)) {
              return;
            }
            this.dispatchTooltip(createMathTooltip(range, displayList));
          })
          .catch(() => {
            if (requestId !== this.requestId || !this.currentRange || !areRangesEqual(this.currentRange, range)) {
              return;
            }
            this.dispatchTooltip(null);
          });
      }

      private clearPreview(): void {
        this.currentRange = null;
        this.requestId += 1;
        this.dispatchTooltip(null);
      }

      private dispatchTooltip(tooltip: Tooltip | null): void {
        queueMicrotask(() => {
          if (!this.view.dom.isConnected) {
            return;
          }

          this.view.dispatch({
            effects: setLatexMathPreviewTooltip.of(tooltip)
          });
        });
      }
    },
    {}
  );

  return [
    latexMathPreviewTooltipField,
    plugin,
    EditorView.baseTheme({
      ".cm-tooltip:has(.cm-latex-math-preview), .cm-latex-math-preview": {
        border: "1px solid var(--border)",
        borderRadius: "8px",
        backgroundColor: "color-mix(in srgb, var(--surface-strong) 96%, transparent)",
        boxShadow: "0 14px 40px rgba(0, 0, 0, 0.16)",
        padding: "0",
        overflow: "hidden"
      },
      ".cm-latex-math-preview__canvas": {
        display: "block",
        maxWidth: "min(48rem, calc(100vw - 2rem))",
        maxHeight: "18rem"
      }
    })
  ];
}

export function getLatexMathPreviewRange(source: string, position: number): MathPreviewRange | null {
  const clampedPosition = Math.max(0, Math.min(position, source.length));
  const region = getContainingLatexMathRegion(source, clampedPosition);

  if (!region) {
    return null;
  }

  const to = Math.max(region.contentFrom, region.to);
  const latex = source.slice(region.contentFrom, to).trim();

  if (latex.length < MIN_PREVIEW_LENGTH || endsWithIncompleteCommand(latex)) {
    return null;
  }

  return {
    from: region.contentFrom,
    to,
    latex,
    display: region.display
  };
}

function getContainingLatexMathRegion(
  source: string,
  position: number
): (OpenMathRegion & { to: number }) | null {
  let open: OpenMathRegion | null = null;
  let index = 0;

  while (index < source.length) {
    const token = readMathToken(source, index);

    if (!token) {
      index += 1;
      continue;
    }

    if (open) {
      if (isClosingToken(open, token)) {
        if (position >= open.contentFrom && position <= token.from) {
          return { ...open, to: token.from };
        }

        open = null;
      }

      index = token.to;
      continue;
    }

    if (token.kind === "open") {
      open = {
        contentFrom: token.to,
        display: token.display,
        close: token.close,
        envName: token.envName
      };
    }

    index = token.to;
  }

  if (open && position >= open.contentFrom) {
    return { ...open, to: position };
  }

  return null;
}

function readMathToken(source: string, index: number):
  | { kind: "open"; from: number; to: number; close: string | null; display: boolean; envName?: string }
  | { kind: "close"; from: number; to: number; close: string; envName?: string }
  | null {
  const character = source[index];

  if (character === "$" && !isEscaped(source, index)) {
    const isDisplay = source[index + 1] === "$";
    return {
      kind: "open",
      from: index,
      to: index + (isDisplay ? 2 : 1),
      close: isDisplay ? "$$" : "$",
      display: isDisplay
    };
  }

  if (character !== "\\") {
    return null;
  }

  const next = source[index + 1];

  if (next === "(") {
    return { kind: "open", from: index, to: index + 2, close: "\\)", display: false };
  }

  if (next === "[") {
    return { kind: "open", from: index, to: index + 2, close: "\\]", display: true };
  }

  if (next === ")" || next === "]") {
    return { kind: "close", from: index, to: index + 2, close: `\\${next}` };
  }

  const beginMatch = source.slice(index).match(/^\\begin\{([A-Za-z*]+)\}/);
  if (beginMatch) {
    const envName = beginMatch[1];
    const baseEnvName = envName.replace(/\*$/, "");

    if (MATH_ENVIRONMENTS.has(baseEnvName)) {
      return {
        kind: "open",
        from: index,
        to: index + beginMatch[0].length,
        close: null,
        display: baseEnvName !== "math",
        envName
      };
    }
  }

  const endMatch = source.slice(index).match(/^\\end\{([A-Za-z*]+)\}/);
  if (endMatch) {
    return {
      kind: "close",
      from: index,
      to: index + endMatch[0].length,
      close: "\\end",
      envName: endMatch[1]
    };
  }

  return null;
}

function isClosingToken(
  open: OpenMathRegion,
  token: { kind: "close" | "open"; close?: string | null; envName?: string }
): boolean {
  if (open.envName) {
    return token.kind === "close" && token.close === "\\end" && token.envName === open.envName;
  }

  return token.close === open.close;
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function endsWithIncompleteCommand(latex: string): boolean {
  return /\\[A-Za-z]*$/.test(latex);
}

function getRatexTextColor(element: HTMLElement): string | undefined {
  const styles = getComputedStyle(element);
  const themeColor = styles.getPropertyValue("--editor-foreground").trim();
  const color = themeColor || styles.color;

  return toRatexColor(color);
}

function toRatexColor(color: string): string | undefined {
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) {
    return color;
  }

  const match = color.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
  if (!match) {
    return undefined;
  }

  const channels = match.slice(1, 4).map((value) =>
    Math.max(0, Math.min(255, Math.round(Number(value))))
  );

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getRatexReady(): Promise<void> {
  ratexReady ??= initRatex();
  return ratexReady;
}

function createMathTooltip(range: MathPreviewRange, displayList: DisplayList): Tooltip {
  return {
    pos: range.from,
    above: true,
    strictSide: false,
    arrow: false,
    create() {
      const wrapper = document.createElement("div");
      const canvas = document.createElement("canvas");
      wrapper.className = "cm-latex-math-preview";
      canvas.className = "cm-latex-math-preview__canvas";
      renderToCanvas(displayList, canvas, {
        fontSize: range.display ? 26 : 22,
        padding: 8,
        backgroundColor: "transparent"
      });
      wrapper.appendChild(canvas);

      return { dom: wrapper };
    }
  };
}

function areRangesEqual(left: MathPreviewRange, right: MathPreviewRange): boolean {
  return (
    left.from === right.from &&
    left.to === right.to &&
    left.latex === right.latex &&
    left.display === right.display
  );
}
