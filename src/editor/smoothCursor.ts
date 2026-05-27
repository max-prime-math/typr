import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";

const DEFAULT_CURSOR_WIDTH = 1;
const BASE_SMEAR_STRENGTH = 25;
const CURSOR_FOLLOW_RATE = 34;
const TRAIL_FOLLOW_RATE = 15;
const LEAD_RESPONSE = 0.55;
const TRAIL_LEAD_RESPONSE = 0.3;
const SETTLE_DISTANCE = 0.16;
const SMEAR_MIN_DISTANCE = 0.9;
const MIN_FRAME_SECONDS = 1 / 240;
const MAX_FRAME_SECONDS = 1 / 24;
const DIAGONAL = 1 / Math.SQRT2;

interface Point {
  x: number;
  y: number;
}

type Quad = [Point, Point, Point, Point];

interface CursorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

const CORNER_DIRECTIONS: Quad = [
  { x: -DIAGONAL, y: -DIAGONAL },
  { x: DIAGONAL, y: -DIAGONAL },
  { x: DIAGONAL, y: DIAGONAL },
  { x: -DIAGONAL, y: DIAGONAL }
];

class SmoothCursorPlugin implements PluginValue {
  private readonly smear: HTMLDivElement;
  private readonly cursor: HTMLDivElement;
  private readonly vimMode: boolean;
  private readonly smearStrength: number;
  private frame: number | null = null;
  private lastFrameTime = 0;
  private targetQuad: Quad | null = null;
  private currentQuad: Quad | null = null;
  private trailQuad: Quad | null = null;
  private lastMotion: Point | null = null;
  private lastSmearGradient: string | null = null;

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

  update(_update: ViewUpdate): void {
    this.measure();
  }

  destroy(): void {
    this.stopAnimation();
    this.view.dom.classList.remove("cm-smooth-cursor-active");
    this.smear.remove();
    this.cursor.remove();
  }

  private measure(): void {
    this.view.requestMeasure({
      read: (view) => {
        const selection = view.state.selection.main;

        if (!view.hasFocus || view.state.selection.ranges.length !== 1 || !selection.empty) {
          return null;
        }

        const coords = view.coordsAtPos(selection.head);

        if (!coords) {
          return null;
        }

        const root = view.dom.getBoundingClientRect();

        return {
          x: coords.left - root.left,
          y: coords.top - root.top,
          width: resolveCursorWidth(view, this.vimMode),
          height: coords.bottom - coords.top
        } satisfies CursorBox;
      },
      write: (box) => {
        if (!box) {
          this.reset();
          return;
        }

        const nextTarget = createRectQuad(box);
        const nextCenter = getQuadCenter(nextTarget);
        const referenceCenter = this.currentQuad
          ? getQuadCenter(this.currentQuad)
          : nextCenter;
        const movement = subtractPoints(nextCenter, referenceCenter);

        if (pointLength(movement) > 0.01) {
          this.lastMotion = normalizePoint(movement);
        }

        this.targetQuad = nextTarget;
        this.view.dom.classList.add("cm-smooth-cursor-active");
        this.cursor.classList.add("cm-smooth-cursor--visible");

        if (!this.currentQuad || !this.trailQuad) {
          this.currentQuad = cloneQuad(nextTarget);
          this.trailQuad = cloneQuad(nextTarget);
          this.render();
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

    this.lastFrameTime = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (timestamp: number): void => {
    if (!this.targetQuad || !this.currentQuad || !this.trailQuad) {
      this.frame = null;
      this.lastFrameTime = 0;
      return;
    }

    const elapsedSeconds =
      this.lastFrameTime === 0
        ? MIN_FRAME_SECONDS
        : clamp(
            (timestamp - this.lastFrameTime) / 1000,
            MIN_FRAME_SECONDS,
            MAX_FRAME_SECONDS
          );
    this.lastFrameTime = timestamp;

    const cursorMotion =
      normalizePoint(subtractPoints(getQuadCenter(this.targetQuad), getQuadCenter(this.currentQuad))) ??
      this.lastMotion;
    if (cursorMotion) {
      this.lastMotion = cursorMotion;
    }

    this.currentQuad = followQuad(
      this.currentQuad,
      this.targetQuad,
      elapsedSeconds,
      cursorMotion,
      CURSOR_FOLLOW_RATE,
      LEAD_RESPONSE
    );

    const trailMotion =
      normalizePoint(subtractPoints(getQuadCenter(this.currentQuad), getQuadCenter(this.trailQuad))) ??
      cursorMotion;

    this.trailQuad = followQuad(
      this.trailQuad,
      this.currentQuad,
      elapsedSeconds,
      trailMotion,
      TRAIL_FOLLOW_RATE,
      TRAIL_LEAD_RESPONSE
    );

    this.render();

    if (isQuadSettled(this.currentQuad, this.targetQuad) && isQuadSettled(this.trailQuad, this.currentQuad)) {
      this.currentQuad = cloneQuad(this.targetQuad);
      this.trailQuad = cloneQuad(this.targetQuad);
      this.render();
      this.frame = null;
      this.lastFrameTime = 0;
      return;
    }

    this.frame = requestAnimationFrame(this.tick);
  };

  private render(): void {
    if (!this.currentQuad || !this.trailQuad) {
      return;
    }

    renderPolygon(this.cursor, this.currentQuad);
    this.renderSmear(this.currentQuad, this.trailQuad);
  }

  private renderSmear(cursorQuad: Quad, trailQuad: Quad): void {
    if (this.smearStrength <= 0) {
      this.hideSmear();
      return;
    }

    const distance = pointLength(subtractPoints(getQuadCenter(cursorQuad), getQuadCenter(trailQuad)));
    if (distance < SMEAR_MIN_DISTANCE) {
      this.hideSmear();
      return;
    }

    const hull = computeConvexHull([...trailQuad, ...cursorQuad]);
    if (hull.length < 3) {
      this.hideSmear();
      return;
    }

    renderPolygon(this.smear, hull);
    this.smear.classList.add("cm-smooth-cursor-smear--visible");

    const intensity = this.smearStrength / BASE_SMEAR_STRENGTH;
    const maxOpacity = Math.min(0.82, 0.2 + intensity * 0.22);
    const opacity = clamp(0.12 + distance * 0.018 * intensity, 0, maxOpacity);
    const direction = subtractPoints(getQuadCenter(cursorQuad), getQuadCenter(trailQuad));

    this.smear.style.opacity = `${opacity}`;
    const gradient = buildSmearGradient(direction);
    if (gradient !== this.lastSmearGradient) {
      this.smear.style.background = gradient;
      this.lastSmearGradient = gradient;
    }
  }

  private hideSmear(): void {
    this.smear.classList.remove("cm-smooth-cursor-smear--visible");
    this.smear.style.opacity = "0";
    this.smear.style.clipPath = "none";
  }

  private reset(): void {
    this.stopAnimation();
    this.targetQuad = null;
    this.currentQuad = null;
    this.trailQuad = null;
    this.lastMotion = null;
    this.lastSmearGradient = null;
    this.hideSmear();
    this.view.dom.classList.remove("cm-smooth-cursor-active");
    this.cursor.classList.remove("cm-smooth-cursor--visible");
    this.cursor.style.clipPath = "none";
  }

  private stopAnimation(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    this.lastFrameTime = 0;
  }
}

function resolveCursorWidth(view: EditorView, vimMode: boolean): number {
  if (vimMode && !isVimInsertMode(view)) {
    return Math.max(8, view.defaultCharacterWidth);
  }

  return DEFAULT_CURSOR_WIDTH;
}

function followQuad(
  current: Quad,
  target: Quad,
  elapsedSeconds: number,
  direction: Point | null,
  baseRate: number,
  leadResponse: number
): Quad {
  return current.map((point, index) => {
    const response = getCornerResponse(index, direction, leadResponse);
    const alpha = 1 - Math.exp(-baseRate * response * elapsedSeconds);
    return {
      x: point.x + (target[index].x - point.x) * alpha,
      y: point.y + (target[index].y - point.y) * alpha
    };
  }) as Quad;
}

function getCornerResponse(index: number, direction: Point | null, leadResponse: number): number {
  if (!direction) {
    return 1;
  }

  const alignment = dotProduct(CORNER_DIRECTIONS[index], direction);
  return clamp(1 + alignment * leadResponse, 0.55, 1.75);
}

function renderPolygon(element: HTMLDivElement, points: Point[]): void {
  const bounds = getBounds(points);
  element.style.transform = `translate3d(${bounds.minX}px, ${bounds.minY}px, 0)`;
  element.style.width = `${bounds.width}px`;
  element.style.height = `${bounds.height}px`;
  element.style.clipPath = buildPolygonClipPath(points, bounds);
}

function buildPolygonClipPath(points: Point[], bounds: Bounds): string {
  return `polygon(${points
    .map(
      (point) =>
        `${(point.x - bounds.minX).toFixed(3)}px ${(point.y - bounds.minY).toFixed(3)}px`
    )
    .join(", ")})`;
}

function createRectQuad(box: CursorBox): Quad {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height }
  ];
}

function cloneQuad(quad: Quad): Quad {
  return quad.map((point) => ({ ...point })) as Quad;
}

function getQuadCenter(quad: Quad): Point {
  return getPointsCenter(quad);
}

function getPointsCenter(points: Point[]): Point {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length
  };
}

function getBounds(points: Point[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function computeConvexHull(points: Point[]): Point[] {
  const uniquePoints = dedupePoints(points).sort((left, right) =>
    left.x === right.x ? left.y - right.y : left.x - right.x
  );

  if (uniquePoints.length <= 2) {
    return uniquePoints;
  }

  const lower: Point[] = [];
  for (const point of uniquePoints) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point[] = [];
  for (let index = uniquePoints.length - 1; index >= 0; index -= 1) {
    const point = uniquePoints[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

function dedupePoints(points: Point[]): Point[] {
  const seen = new Set<string>();
  const unique: Point[] = [];

  for (const point of points) {
    const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(point);
  }

  return unique;
}

function isQuadSettled(current: Quad, target: Quad): boolean {
  return current.every((point, index) =>
    Math.abs(point.x - target[index].x) < SETTLE_DISTANCE &&
    Math.abs(point.y - target[index].y) < SETTLE_DISTANCE
  );
}

function buildSmearGradient(direction: Point): string {
  const rawAngle = (Math.atan2(direction.y, direction.x) * 180) / Math.PI + 90;
  const angle = Math.round(rawAngle / 45) * 45;
  return `linear-gradient(${angle}deg, color-mix(in srgb, var(--accent) 10%, transparent), color-mix(in srgb, var(--accent) 84%, transparent))`;
}

function subtractPoints(left: Point, right: Point): Point {
  return {
    x: left.x - right.x,
    y: left.y - right.y
  };
}

function pointLength(point: Point): number {
  return Math.hypot(point.x, point.y);
}

function normalizePoint(point: Point): Point | null {
  const length = pointLength(point);
  if (length < 0.001) {
    return null;
  }

  return {
    x: point.x / length,
    y: point.y / length
  };
}

function dotProduct(left: Point, right: Point): number {
  return left.x * right.x + left.y * right.y;
}

function cross(origin: Point, left: Point, right: Point): number {
  return (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isVimInsertMode(view: EditorView): boolean {
  return getCM(view)?.state.vim?.insertMode === true;
}

export function smoothCursor(vimMode: boolean, smearStrength: number): Extension {
  return ViewPlugin.define(
    (view) => new SmoothCursorPlugin(view, { vimMode, smearStrength })
  );
}
