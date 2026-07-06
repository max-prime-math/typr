import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, showTooltip, ViewPlugin, type Tooltip, type ViewUpdate } from "@codemirror/view";
import { renderTypstSourceToSvg } from "../compiler/typstRuntime";

interface TypstMathPreviewRange {
  from: number;
  to: number;
  math: string;
  display: boolean;
}

const MIN_PREVIEW_LENGTH = 1;
const setTypstMathPreviewTooltip = StateEffect.define<Tooltip | null>();

const typstMathPreviewTooltipField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setTypstMathPreviewTooltip)) {
        value = effect.value;
      }
    }

    return value;
  },
  provide: (field) => showTooltip.from(field)
});

export function typstMathPreview(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      private currentRange: TypstMathPreviewRange | null = null;
      private requestId = 0;

      constructor(private readonly view: EditorView) {}

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
          this.updatePreview();
        }
      }

      private updatePreview(): void {
        const range = getTypstMathPreviewRange(
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

        renderTypstSourceToSvg(buildTypstMathPreviewSource(range, getTypstPreviewTextColor(this.view.dom)), [], {
          mainFilePath: "typst-math-preview.typ"
        })
          .then((svg) => {
            if (requestId !== this.requestId || !this.currentRange || !areRangesEqual(this.currentRange, range)) {
              return;
            }
            this.dispatchTooltip(createTypstMathTooltip(range, svg));
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
            effects: setTypstMathPreviewTooltip.of(tooltip)
          });
        });
      }
    },
    {}
  );

  return [
    typstMathPreviewTooltipField,
    plugin,
    EditorView.baseTheme({
      ".cm-tooltip:has(.cm-typst-math-preview), .cm-typst-math-preview": {
        border: "1px solid var(--border)",
        borderRadius: "8px",
        backgroundColor: "color-mix(in srgb, var(--editor-background) 94%, transparent)",
        color: "var(--editor-foreground)",
        boxShadow: "0 14px 40px rgba(0, 0, 0, 0.16)",
        padding: "0",
        overflow: "hidden"
      },
      ".cm-typst-math-preview__svg": {
        display: "block",
        maxWidth: "min(48rem, calc(100vw - 2rem))",
        maxHeight: "18rem",
        padding: "0.35rem"
      },
      ".cm-typst-math-preview__svg svg": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "17rem"
      }
    })
  ];
}

export function getTypstMathPreviewRange(source: string, position: number): TypstMathPreviewRange | null {
  const clampedPosition = Math.max(0, Math.min(position, source.length));
  const open = findOpeningMathDelimiter(source, clampedPosition);

  if (open === null) {
    return null;
  }

  const close = findClosingMathDelimiter(source, open + 1);
  const to = close === null ? clampedPosition : close;

  if (clampedPosition < open + 1 || clampedPosition > to) {
    return null;
  }

  const rawMath = source.slice(open + 1, to);
  const math = rawMath.trim();

  if (math.length < MIN_PREVIEW_LENGTH || math.endsWith("\\")) {
    return null;
  }

  return {
    from: open + 1,
    to,
    math,
    display: isDisplayMathSpacing(rawMath, close !== null)
  };
}

function findOpeningMathDelimiter(source: string, position: number): number | null {
  let index = 0;
  let open: number | null = null;

  while (index < position) {
    if (source[index] === "$" && !isEscaped(source, index)) {
      open = open === null ? index : null;
    }
    index += 1;
  }

  return open;
}

function findClosingMathDelimiter(source: string, from: number): number | null {
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === "$" && !isEscaped(source, index)) {
      return index;
    }
  }

  return null;
}

function isDisplayMathSpacing(rawMath: string, isClosed: boolean): boolean {
  if (!rawMath) {
    return false;
  }

  const hasOpeningSpace = /^\s/.test(rawMath);
  const hasClosingSpace = isClosed ? /\s$/.test(rawMath) : true;
  return hasOpeningSpace && hasClosingSpace;
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function buildTypstMathPreviewSource(range: TypstMathPreviewRange, textColor: string | undefined): string {
  const textSettings = textColor
    ? `#set text(size: 20pt, fill: rgb("${textColor}"))`
    : "#set text(size: 20pt)";
  const math = range.display ? `$ ${range.math} $` : `$${range.math}$`;

  return [
    "#set page(width: auto, height: auto, margin: 4pt)",
    textSettings,
    math
  ].join("\n");
}

function getTypstPreviewTextColor(element: HTMLElement): string | undefined {
  const styles = getComputedStyle(element);
  const themeColor = styles.getPropertyValue("--editor-foreground").trim();
  const color = themeColor || styles.color;

  return toHexColor(color);
}

function toHexColor(color: string): string | undefined {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }

  const shortHex = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    return `#${shortHex.slice(1, 4).map((channel) => `${channel}${channel}`).join("")}`;
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

function createTypstMathTooltip(range: TypstMathPreviewRange, svg: string): Tooltip {
  return {
    pos: range.from,
    above: true,
    strictSide: false,
    arrow: false,
    create() {
      const wrapper = document.createElement("div");
      const svgHost = document.createElement("div");
      wrapper.className = "cm-typst-math-preview";
      svgHost.className = "cm-typst-math-preview__svg";
      svgHost.innerHTML = svg;
      wrapper.appendChild(svgHost);
      return { dom: wrapper };
    }
  };
}

function areRangesEqual(left: TypstMathPreviewRange, right: TypstMathPreviewRange): boolean {
  return (
    left.from === right.from &&
    left.to === right.to &&
    left.math === right.math &&
    left.display === right.display
  );
}
