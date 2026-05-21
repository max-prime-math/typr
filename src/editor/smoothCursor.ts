import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

const CURSOR_SETTLE_DISTANCE = 0.35;
const CURSOR_ANIMATION_STIFFNESS = 0.32;
const SMEAR_MIN_DISTANCE = 3;
const BASE_SMEAR_STRENGTH = 25;
const BASE_SMEAR_MAX_OPACITY = 0.7;

interface CursorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SmearShape {
  x: number;
  y: number;
  width: number;
  height: number;
  clipPath: string;
  background: string;
}

class SmoothCursorPlugin implements PluginValue {
  private readonly smear: HTMLDivElement;
  private readonly cursor: HTMLDivElement;
  private readonly vimMode: boolean;
  private readonly smearStrength: number;
  private frame: number | null = null;
  private current: CursorBox | null = null;
  private rendered: CursorBox | null = null;
  private target: CursorBox | null = null;

  constructor(
    private readonly view: EditorView,
    options: { vimMode: boolean; smearStrength: number }
  ) {
    this.vimMode = options.vimMode;
    this.smearStrength = options.smearStrength;
    this.smear = document.createElement("div");
    this.smear.className = "cm-smooth-cursor-smear";
    this.smear.setAttribute("aria-hidden", "true");
    this.cursor = document.createElement("div");
    this.cursor.className = "cm-smooth-cursor";
    this.cursor.setAttribute("aria-hidden", "true");
    this.view.dom.appendChild(this.smear);
    this.view.dom.appendChild(this.cursor);
    this.measure();
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.geometryChanged ||
      update.focusChanged
    ) {
      this.measure();
    }
  }

  destroy(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    this.smear.remove();
    this.cursor.remove();
  }

  private measure(): void {
    this.view.requestMeasure({
      read: (view) => {
        const selection = view.state.selection.main;

        if (!view.hasFocus || !selection.empty) {
          return null;
        }

        const coords = view.coordsAtPos(selection.head);

        if (!coords) {
          return null;
        }

        const root = view.dom.getBoundingClientRect();
        const lineHeight = Math.max(coords.bottom - coords.top, view.defaultLineHeight);
        const width = this.vimMode
          ? Math.max(8, view.defaultCharacterWidth)
          : 2.5;

        return {
          x: coords.left - root.left,
          y: coords.top - root.top,
          width,
          height: lineHeight
        } satisfies CursorBox;
      },
      write: (box) => {
        if (!box) {
          this.target = null;
          this.hideSmear();
          this.cursor.classList.remove("cm-smooth-cursor--visible");
          return;
        }

        this.target = box;
        this.cursor.classList.add("cm-smooth-cursor--visible");

        if (!this.current) {
          this.current = box;
          this.render(box);
          return;
        }

        this.startAnimation();
      }
    });
  }

  private startAnimation(): void {
    if (this.frame !== null) {
      return;
    }

    const tick = () => {
      if (!this.current || !this.target) {
        this.frame = null;
        return;
      }

      const next = interpolateBox(this.current, this.target);
      this.current = next;
      this.render(next);

      if (isSettled(next, this.target)) {
        this.current = this.target;
        this.render(this.target);
        this.frame = null;
        return;
      }

      this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  private render(box: CursorBox): void {
    const previous = this.rendered;
    const targetDelta = this.target
      ? {
          x: this.target.x - box.x,
          y: this.target.y - box.y
        }
      : { x: 0, y: 0 };
    const distance = previous ? Math.hypot(box.x - previous.x, box.y - previous.y) : 0;
    const stretch = Math.min(14, Math.abs(targetDelta.x) * 0.2);
    const width = this.vimMode ? box.width + stretch : box.width;

    this.renderSmear(previous, box, width, distance);
    this.cursor.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    this.cursor.style.width = `${width}px`;
    this.cursor.style.height = `${box.height}px`;
    this.rendered = box;
  }

  private renderSmear(
    previous: CursorBox | null,
    box: CursorBox,
    cursorWidth: number,
    distance: number
  ): void {
    if (this.smearStrength <= 0 || !previous || distance < SMEAR_MIN_DISTANCE) {
      this.hideSmear();
      return;
    }

    const intensity = this.smearStrength / BASE_SMEAR_STRENGTH;
    const velocity = {
      x: box.x - previous.x,
      y: box.y - previous.y
    };
    const smearShape = createSmearShape(
      previous,
      box,
      cursorWidth,
      velocity,
      distance,
      intensity
    );
    const opacity = Math.min(
      Math.min(1, BASE_SMEAR_MAX_OPACITY * intensity),
      0.18 + (distance / 80) * intensity
    );

    this.smear.classList.add("cm-smooth-cursor-smear--visible");
    this.smear.style.opacity = `${opacity}`;
    this.smear.style.transform = `translate3d(${smearShape.x}px, ${smearShape.y}px, 0)`;
    this.smear.style.width = `${smearShape.width}px`;
    this.smear.style.height = `${smearShape.height}px`;
    this.smear.style.clipPath = smearShape.clipPath;
    this.smear.style.background = smearShape.background;
  }

  private hideSmear(): void {
    this.smear.classList.remove("cm-smooth-cursor-smear--visible");
    this.smear.style.opacity = "0";
    this.smear.style.clipPath = "none";
  }
}

function createSmearShape(
  previous: CursorBox,
  current: CursorBox,
  cursorWidth: number,
  velocity: { x: number; y: number },
  distance: number,
  intensity: number
): SmearShape {
  const horizontal = Math.abs(velocity.x) >= Math.abs(velocity.y);
  const leadTowardsPositiveSecondary = horizontal ? velocity.y >= 0 : velocity.x >= 0;

  if (horizontal) {
    const width = Math.abs(velocity.x) + cursorWidth;
    const height = current.height;
    const lag = Math.min(width * 0.55, Math.max(4, distance * 0.22 * intensity));
    const clipPath =
      velocity.x >= 0
        ? leadTowardsPositiveSecondary
          ? `polygon(0 0, 100% 0, calc(100% - ${lag}px) 100%, 0 100%)`
          : `polygon(0 0, calc(100% - ${lag}px) 0, 100% 100%, 0 100%)`
        : leadTowardsPositiveSecondary
          ? `polygon(${lag}px 0, 100% 0, 100% 100%, 0 100%)`
          : `polygon(0 0, 100% 0, 100% 100%, ${lag}px 100%)`;
    const background =
      velocity.x >= 0
        ? "linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 80%, transparent))"
        : "linear-gradient(270deg, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 80%, transparent))";

    return {
      x: Math.min(previous.x, current.x),
      y: current.y,
      width,
      height,
      clipPath,
      background
    };
  }

  const width = cursorWidth;
  const height = Math.abs(velocity.y) + current.height;
  const lag = Math.min(height * 0.55, Math.max(4, distance * 0.22 * intensity));
  const clipPath =
    velocity.y >= 0
      ? leadTowardsPositiveSecondary
        ? `polygon(0 0, 100% 0, 100% calc(100% - ${lag}px), 0 100%)`
        : `polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - ${lag}px))`
      : leadTowardsPositiveSecondary
        ? `polygon(0 ${lag}px, 100% 0, 100% 100%, 0 100%)`
        : `polygon(0 0, 100% ${lag}px, 100% 100%, 0 100%)`;
  const background =
    velocity.y >= 0
      ? "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 80%, transparent))"
      : "linear-gradient(0deg, color-mix(in srgb, var(--accent) 8%, transparent), color-mix(in srgb, var(--accent) 80%, transparent))";

  return {
    x: current.x,
    y: Math.min(previous.y, current.y),
    width,
    height,
    clipPath,
    background
  };
}

function interpolateBox(current: CursorBox, target: CursorBox): CursorBox {
  return {
    x: current.x + (target.x - current.x) * CURSOR_ANIMATION_STIFFNESS,
    y: current.y + (target.y - current.y) * CURSOR_ANIMATION_STIFFNESS,
    width: current.width + (target.width - current.width) * CURSOR_ANIMATION_STIFFNESS,
    height: current.height + (target.height - current.height) * CURSOR_ANIMATION_STIFFNESS
  };
}

function isSettled(current: CursorBox, target: CursorBox): boolean {
  return (
    Math.abs(current.x - target.x) < CURSOR_SETTLE_DISTANCE &&
    Math.abs(current.y - target.y) < CURSOR_SETTLE_DISTANCE &&
    Math.abs(current.width - target.width) < CURSOR_SETTLE_DISTANCE &&
    Math.abs(current.height - target.height) < CURSOR_SETTLE_DISTANCE
  );
}

export function smoothCursor(vimMode: boolean, smearStrength: number): Extension {
  return ViewPlugin.define(
    (view) => new SmoothCursorPlugin(view, { vimMode, smearStrength })
  );
}
