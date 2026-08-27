import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type PluginValue } from "@codemirror/view";

const VIM_CURSOR_LAYER_SELECTOR = ".cm-vimCursorLayer";
const FAT_CURSOR_SELECTOR = ".cm-fat-cursor";
const CURSOR_HEIGHT_TOLERANCE = 0.5;

class FullHeightVimCursorPlugin implements PluginValue {
  private readonly observer: MutationObserver;
  private cursorLayer: HTMLElement | null = null;

  constructor(private readonly view: EditorView) {
    this.observer = new MutationObserver(this.normalizeCursors);
    this.observeCursorLayer();
    this.normalizeCursors();
  }

  destroy(): void {
    this.observer.disconnect();
  }

  private readonly normalizeCursors = (): void => {
    if (!this.cursorLayer?.isConnected) {
      this.observeCursorLayer();
    }

    const cursors = this.cursorLayer?.querySelectorAll<HTMLElement>(FAT_CURSOR_SELECTOR);
    if (!cursors) {
      return;
    }

    if (cursors.length === 0) {
      return;
    }

    const position = this.view.state.selection.main.head;
    const coords = this.view.coordsAtPos(position);
    if (!coords) {
      return;
    }

    const fullHeight = (coords.bottom - coords.top) / this.view.scaleY;
    for (const cursor of cursors) {
      normalizePartialCursorHeight(cursor, fullHeight);
    }
  };

  private observeCursorLayer(): void {
    this.observer.disconnect();
    this.cursorLayer = this.view.scrollDOM.querySelector<HTMLElement>(
      VIM_CURSOR_LAYER_SELECTOR
    );

    if (this.cursorLayer) {
      this.observer.observe(this.cursorLayer, {
        attributes: true,
        attributeFilter: ["style"],
        childList: true,
        subtree: true
      });
      return;
    }

    this.observer.observe(this.view.scrollDOM, { childList: true });
  }
}

function normalizePartialCursorHeight(cursor: HTMLElement, fullHeight: number): void {
  if (cursor.style.color !== "transparent") {
    return;
  }

  const height = Number.parseFloat(cursor.style.height);
  const top = Number.parseFloat(cursor.style.top);
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(top) ||
    height >= fullHeight - CURSOR_HEIGHT_TOLERANCE
  ) {
    return;
  }

  const bottom = top + height;
  cursor.style.top = `${bottom - fullHeight}px`;
  cursor.style.height = `${fullHeight}px`;
  cursor.style.lineHeight = `${fullHeight}px`;
}

export function fullHeightVimCursor(): Extension {
  return ViewPlugin.define((view) => new FullHeightVimCursorPlugin(view));
}
