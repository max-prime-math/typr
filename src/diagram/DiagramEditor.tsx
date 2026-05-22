import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode
} from "react";
import type {
  DiagramAsset,
  DiagramPoint,
  DiagramShape,
  DiagramStroke
} from "../app/appState";
import { normalizeDiagramFileName } from "./diagramFiles";

interface DiagramEditorProps {
  diagram: DiagramAsset;
  inkColor: string;
  onInkColorChange: (color: string) => void;
  paperView?: boolean;
  isExpanded?: boolean;
  onExpand?: () => void;
  onAddStroke: (stroke: DiagramStroke) => void;
  onAddShape: (shape: DiagramShape) => void;
  onRemoveStroke: (id: string) => void;
  onRemoveShape: (id: string) => void;
  onClear: () => void;
  onNew: () => void;
  onSave: () => void;
  onInsertIntoDocument: () => void;
  onRename: (name: string) => void;
  onDownloadSvg: (svg: string) => void;
  onUndo: () => void;
}

const DEFAULT_DIAGRAM_VIEWBOX = {
  x: 0,
  y: 0,
  width: 640,
  height: 420
};
const DIAGRAM_VIEWBOX_PADDING = 48;
const DIAGRAM_VIEWBOX_MIN_SIZE = 144;
const MIN_MOVEMENT = 2.2;
const POLYGON_SNAP_DISTANCE = 12;
const ERASER_RADIUS = 20;
const DIAGRAM_COLOR_SWATCHES = ["#000000", "#d64545", "#c77718", "#2b6cb0", "#2f855a"] as const;
type DiagramTool = "pen" | "rect" | "ellipse" | "line" | "polygon" | "eraser";

export function DiagramEditor({
  diagram,
  inkColor,
  onInkColorChange,
  paperView = false,
  isExpanded = false,
  onExpand,
  onAddStroke,
  onAddShape,
  onRemoveStroke,
  onRemoveShape,
  onClear,
  onNew,
  onSave,
  onInsertIntoDocument,
  onRename,
  onDownloadSvg,
  onUndo
}: DiagramEditorProps) {
  const activePointerIdRef = useRef<number | null>(null);
  const draftStrokeRef = useRef<DiagramStroke | null>(null);
  const draftShapeRef = useRef<DiagramShape | null>(null);
  const [draftStroke, setDraftStroke] = useState<DiagramStroke | null>(null);
  const [draftShape, setDraftShape] = useState<DiagramShape | null>(null);
  const [draftPolygon, setDraftPolygon] = useState<DiagramPoint[] | null>(null);
  const [polygonCursor, setPolygonCursor] = useState<DiagramPoint | null>(null);
  const [eraserCursor, setEraserCursor] = useState<DiagramPoint | null>(null);
  const [eraserDragging, setEraserDragging] = useState(false);
  const [fileNameDraft, setFileNameDraft] = useState(diagram.name);
  const [activeTool, setActiveTool] = useState<DiagramTool>("pen");
  const isCustomInkColor = !DIAGRAM_COLOR_SWATCHES.some(
    (swatch) => swatch.toLowerCase() === inkColor.toLowerCase()
  );

  const previewDiagram = useMemo(() => {
    const strokes = draftStroke ? [...diagram.strokes, draftStroke] : diagram.strokes;
    const shapes = draftShape ? [...diagram.shapes, draftShape] : diagram.shapes;

    let previewShapes = shapes;

    if (draftPolygon && draftPolygon.length >= 1) {
      const draftShapes: DiagramShape[] = [];

      for (let i = 1; i < draftPolygon.length; i++) {
        draftShapes.push({
          kind: "line",
          id: `draft-poly-line-${i}`,
          strokeColor: inkColor,
          strokeWidth: 2.5,
          x1: draftPolygon[i - 1].x,
          y1: draftPolygon[i - 1].y,
          x2: draftPolygon[i].x,
          y2: draftPolygon[i].y,
          updatedAt: new Date().toISOString()
        });
      }

      if (polygonCursor && draftPolygon.length >= 1) {
        draftShapes.push({
          kind: "line",
          id: "draft-poly-cursor",
          strokeColor: inkColor,
          strokeWidth: 2.5,
          x1: draftPolygon[draftPolygon.length - 1].x,
          y1: draftPolygon[draftPolygon.length - 1].y,
          x2: polygonCursor.x,
          y2: polygonCursor.y,
          updatedAt: new Date().toISOString()
        });
      }

      draftShapes.push({
        kind: "ellipse",
        id: "draft-poly-start-dot",
        strokeColor: inkColor,
        strokeWidth: 2,
        fillColor: inkColor,
        cx: draftPolygon[0].x,
        cy: draftPolygon[0].y,
        rx: 5,
        ry: 5,
        originX: draftPolygon[0].x,
        originY: draftPolygon[0].y,
        updatedAt: new Date().toISOString()
      });

      previewShapes = [...shapes, ...draftShapes];
    }

    return {
      ...diagram,
      strokes,
      shapes: previewShapes
    };
  }, [diagram, draftShape, draftStroke, draftPolygon, polygonCursor, inkColor]);
  const displayFrame = DEFAULT_DIAGRAM_VIEWBOX;
  const svgMarkup = useMemo(
    () => serializeDiagramSvg(previewDiagram),
    [previewDiagram]
  );

  useEffect(() => {
    setFileNameDraft(diagram.name);
  }, [diagram.name]);

  useEffect(() => {
    return () => {
      activePointerIdRef.current = null;
    };
  }, []);

  function startStroke(event: PointerEvent<SVGSVGElement>) {
    if (activeTool === "eraser" || activeTool === "polygon") return;
    if (activeTool !== "pen") {
      startShape(event);
      return;
    }

    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    const nextStroke = createStroke(inkColor, event.pointerType, point, event.pressure);

    activePointerIdRef.current = event.pointerId;
    draftStrokeRef.current = nextStroke;
    setDraftStroke(nextStroke);

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort. Drawing still works without pointer capture.
    }
  }

  function extendStroke(event: PointerEvent<SVGSVGElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    setDraftStroke((currentStroke) => {
      if (!currentStroke) {
        return currentStroke;
      }

      const lastPoint = currentStroke.points[currentStroke.points.length - 1];

      if (distance(lastPoint, point) < MIN_MOVEMENT) {
        return currentStroke;
      }

      const nextStroke = {
        ...currentStroke,
        points: [...currentStroke.points, point]
      };
      draftStrokeRef.current = nextStroke;
      return nextStroke;
    });
  }

  function finishStroke(event: PointerEvent<SVGSVGElement>) {
    if (activeTool === "eraser" || activeTool === "polygon") return;
    if (activeTool !== "pen") {
      finishShape(event);
      return;
    }

    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    const committedStroke = draftStrokeRef.current;
    draftStrokeRef.current = null;
    setDraftStroke(null);

    if (committedStroke) {
      onAddStroke(committedStroke);
    }

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Ignore release failures.
    }
  }

  function startShape(event: PointerEvent<SVGSVGElement>) {
    if (activeTool === "eraser" || activeTool === "polygon") return;
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    const nextShape = createShapeDraft(activeTool as Exclude<DiagramTool, "pen">, inkColor, point);

    activePointerIdRef.current = event.pointerId;
    draftShapeRef.current = nextShape;
    setDraftShape(nextShape);

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort. Drawing still works without pointer capture.
    }
  }

  function extendShape(event: PointerEvent<SVGSVGElement>) {
    if (activeTool === "pen" || activeTool === "polygon" || activeTool === "eraser" || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    setDraftShape((currentShape) => {
      if (!currentShape) {
        return currentShape;
      }

      const nextShape = updateShapeDraft(currentShape, point);
      draftShapeRef.current = nextShape;
      return nextShape;
    });
  }

  function finishShape(event: PointerEvent<SVGSVGElement>) {
    if (activeTool === "pen" || activeTool === "polygon" || activeTool === "eraser" || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    const committedShape = draftShapeRef.current;
    draftShapeRef.current = null;
    setDraftShape(null);

    if (committedShape && shapeHasArea(committedShape)) {
      onAddShape(committedShape);
    }

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Ignore release failures.
    }
  }

  const eraserHitRef = useRef<Set<string>>(new Set());

  function eraseAtPoint(point: DiagramPoint) {
    for (const stroke of diagram.strokes) {
      if (eraserHitRef.current.has(stroke.id)) continue;
      for (const p of stroke.points) {
        if (Math.hypot(p.x - point.x, p.y - point.y) < ERASER_RADIUS) {
          eraserHitRef.current.add(stroke.id);
          onRemoveStroke(stroke.id);
          return;
        }
      }
    }

    for (const shape of diagram.shapes) {
      if (eraserHitRef.current.has(shape.id)) continue;
      if (shape.kind === "rect") {
        if (point.x >= shape.x && point.x <= shape.x + shape.width &&
            point.y >= shape.y && point.y <= shape.y + shape.height) {
          eraserHitRef.current.add(shape.id);
          onRemoveShape(shape.id);
          return;
        }
      } else if (shape.kind === "ellipse") {
        const dx = (point.x - shape.cx) / shape.rx;
        const dy = (point.y - shape.cy) / shape.ry;
        if (dx * dx + dy * dy <= 1) {
          eraserHitRef.current.add(shape.id);
          onRemoveShape(shape.id);
          return;
        }
      } else if (shape.kind === "line") {
        const d = pointToSegmentDistance(point, shape.x1, shape.y1, shape.x2, shape.y2);
        if (d < ERASER_RADIUS) {
          eraserHitRef.current.add(shape.id);
          onRemoveShape(shape.id);
          return;
        }
      } else if (shape.kind === "polygon") {
        for (let i = 0; i < shape.points.length; i++) {
          const next = (i + 1) % shape.points.length;
          const d = pointToSegmentDistance(point, shape.points[i].x, shape.points[i].y, shape.points[next].x, shape.points[next].y);
          if (d < ERASER_RADIUS) {
            eraserHitRef.current.add(shape.id);
            onRemoveShape(shape.id);
            return;
          }
        }
      }
    }
  }

  function handleEraserMouseDown(event: PointerEvent<SVGSVGElement>) {
    if (activeTool !== "eraser") return;
    const point = pointerEventToDiagramPoint(event, displayFrame);
    eraserHitRef.current.clear();
    setEraserDragging(true);
    eraseAtPoint(point);
  }

  function handleEraserMouseMove(event: PointerEvent<SVGSVGElement>) {
    if (activeTool !== "eraser") return;
    const point = pointerEventToDiagramPoint(event, displayFrame);
    setEraserCursor(point);
    if (eraserDragging) {
      eraseAtPoint(point);
    }
  }

  function handleEraserMouseUp() {
    if (activeTool !== "eraser") return;
    setEraserDragging(false);
    eraserHitRef.current.clear();
  }

  function handleEraserMouseLeave() {
    setEraserCursor(null);
    if (eraserDragging) {
      setEraserDragging(false);
      eraserHitRef.current.clear();
    }
  }

  function commitFileName() {
    const normalized = normalizeDiagramFileName(fileNameDraft);

    setFileNameDraft(normalized);

    if (normalized !== diagram.name) {
      onRename(normalized);
    }
  }

  return (
    <div
      className={`diagram-editor ${paperView ? "diagram-editor--paper" : ""} ${
        isExpanded ? "diagram-editor--expanded" : ""
      }`}
    >
      <div className="diagram-editor__header">
        <div className="diagram-editor__header-main">
          <label className="sync-field diagram-editor__name-field">
            <input
              aria-label="Filename"
              onBlur={commitFileName}
              onChange={(event) => setFileNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitFileName();
                }
              }}
              type="text"
              value={fileNameDraft}
            />
          </label>
          <button
            className="pane__button pane__button--compact diagram-editor__new-button"
            onClick={onNew}
            type="button"
          >
            New
          </button>
          {onExpand ? (
            <button
              className="pane__button pane__button--compact diagram-editor__expand-button"
              onClick={onExpand}
              type="button"
            >
              Expand
            </button>
          ) : null}
        </div>
      </div>

      <div className="diagram-editor__palette" aria-label="Diagram colors">
        <div className="diagram-editor__toolrow" aria-label="Diagram tools">
          {([
            ["pen", "Pen"],
            ["rect", "Rect"],
            ["ellipse", "Ellipse"],
            ["line", "Line"],
            ["polygon", "Polygon"],
            ["eraser", "Eraser"]
          ] as const).map(([tool, label]) => (
            <button
              aria-pressed={activeTool === tool}
              className="pane__button pane__button--compact diagram-editor__tool"
              key={tool}
              onClick={() => {
                setActiveTool(tool);
                activePointerIdRef.current = null;
                draftStrokeRef.current = null;
                draftShapeRef.current = null;
                setDraftStroke(null);
                setDraftShape(null);
                setDraftPolygon(null);
                setPolygonCursor(null);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {DIAGRAM_COLOR_SWATCHES.map((color) => (
          <button
            aria-pressed={inkColor.toLowerCase() === color.toLowerCase()}
            aria-label={`Stroke color ${color}`}
            className="diagram-editor__color-swatch"
            key={color}
            onClick={() => onInkColorChange(color)}
            type="button"
            title={color}
          >
            <span
              className="diagram-editor__color-swatch-fill"
              style={{ backgroundColor: color }}
            />
          </button>
        ))}
        <label
          className={`diagram-editor__color-swatch diagram-editor__color-swatch--hue ${
            isCustomInkColor ? "diagram-editor__color-swatch--active" : ""
          }`}
          title="Custom color"
        >
          <input
            aria-label="Custom stroke color"
            onChange={(event) => onInkColorChange(event.target.value)}
            type="color"
            value={inkColor}
          />
          <span
            className="diagram-editor__color-swatch-fill diagram-editor__color-swatch-fill--hue"
            style={{
              backgroundColor: inkColor
            }}
          />
        </label>
      </div>

      <div
        className={`diagram-editor__surface ${paperView ? "diagram-editor__surface--paper" : ""}`}
      >
        <svg
          aria-label="Diagram drawing surface"
          className="diagram-editor__svg"
          height={displayFrame.height}
          style={activeTool === "eraser" ? { cursor: "none", overflow: "visible" } : { overflow: "visible" }}
          onClick={(event) => {
            if (activeTool === "eraser") return;
            if (activeTool !== "polygon") return;
            const point = pointerEventToDiagramPoint(event as unknown as PointerEvent<SVGSVGElement>, displayFrame);
            setDraftPolygon((prev) => {
              if (!prev) return [point];
              const start = prev[0];
              if (prev.length >= 3 && Math.hypot(point.x - start.x, point.y - start.y) < POLYGON_SNAP_DISTANCE) {
                const shape: DiagramShape = {
                  kind: "polygon",
                  id: `shape-${crypto.randomUUID()}`,
                  strokeColor: inkColor,
                  strokeWidth: 2.5,
                  fillColor: "transparent",
                  points: prev,
                  updatedAt: new Date().toISOString()
                };
                onAddShape(shape);
                return null;
              }
              return [...prev, point];
            });
          }}
          onDoubleClick={(event) => {
            if (activeTool !== "polygon") return;
            event.preventDefault();
            setDraftPolygon((prev) => {
              if (!prev || prev.length < 3) return null;
              const shape: DiagramShape = {
                kind: "polygon",
                id: `shape-${crypto.randomUUID()}`,
                strokeColor: inkColor,
                strokeWidth: 2.5,
                fillColor: "transparent",
                points: prev,
                updatedAt: new Date().toISOString()
              };
              onAddShape(shape);
              return null;
            });
          }}
          onMouseLeave={() => {
            if (activeTool === "eraser") {
              handleEraserMouseLeave();
              return;
            }
            if (activeTool !== "polygon") return;
            setPolygonCursor(null);
          }}
          onPointerDown={(event) => {
            if (activeTool === "eraser") {
              handleEraserMouseDown(event);
              return;
            }
            startStroke(event);
          }}
          onPointerMove={(event) => {
            if (activeTool === "eraser") {
              handleEraserMouseMove(event);
              return;
            }
            if (activeTool === "polygon") {
              const point = pointerEventToDiagramPoint(event, displayFrame);
              setPolygonCursor(point);
              return;
            }
            if (activeTool === "pen") {
              extendStroke(event);
              return;
            }

            extendShape(event);
          }}
          onPointerUp={(event) => {
            if (activeTool === "eraser") {
              handleEraserMouseUp();
              return;
            }
            finishStroke(event);
          }}
          onPointerCancel={(event) => {
            if (activeTool === "eraser") {
              handleEraserMouseUp();
              return;
            }
            finishStroke(event);
          }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={`${displayFrame.x} ${displayFrame.y} ${displayFrame.width} ${displayFrame.height}`}
          width={displayFrame.width}
        >
          <defs>
            <pattern
              height="48"
              id="diagram-grid"
              patternUnits="userSpaceOnUse"
              width="48"
            >
              <path
                d="M 48 0 L 0 0 0 48"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect
            fill="url(#diagram-grid)"
            height={displayFrame.height}
            width={displayFrame.width}
            x={displayFrame.x}
            y={displayFrame.y}
          />
          <rect
            fill="transparent"
            height={displayFrame.height}
            pointerEvents="all"
            width={displayFrame.width}
            x={displayFrame.x}
            y={displayFrame.y}
          />
          {previewDiagram.strokes.map((stroke) => (
            <DiagramStrokePath
              key={stroke.id}
              stroke={stroke}
              displayColor={stroke.color}
            />
          ))}
          {previewDiagram.shapes.map((shape) => (
            <DiagramShapePath key={shape.id} shape={shape} />
          ))}
          {draftShape ? <DiagramShapePath shape={draftShape} isDraft /> : null}
          {eraserCursor ? (
            <>
              <circle
                cx={eraserCursor.x}
                cy={eraserCursor.y}
                r={ERASER_RADIUS}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={eraserDragging ? 0.95 : 0.85}
                strokeWidth={2.5}
                pointerEvents="none"
              />
              <circle
                cx={eraserCursor.x}
                cy={eraserCursor.y}
                r={ERASER_RADIUS}
                fill="none"
                stroke="#000000"
                strokeOpacity={eraserDragging ? 0.5 : 0.35}
                strokeWidth={1}
                pointerEvents="none"
              />
            </>
          ) : null}
        </svg>
      </div>

      <div className="diagram-editor__actions">
        <button className="pane__button pane__button--compact" onClick={onUndo} type="button">
          Undo
        </button>
        <button className="pane__button pane__button--compact" onClick={onClear} type="button">
          Clear
        </button>
        <button className="pane__button pane__button--compact" onClick={onSave} type="button">
          Save
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={onInsertIntoDocument}
          type="button"
        >
          Insert into doc
        </button>
        <button
          className="pane__button pane__button--compact"
          onClick={() => onDownloadSvg(svgMarkup)}
          type="button"
        >
          Download SVG
        </button>
      </div>
    </div>
  );
}

export class DiagramEditorErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="diagram-editor diagram-editor--error">
          <div className="diagram-editor__header">
            <div>
              <strong>Sketch</strong>
              <p>The diagram canvas failed to load.</p>
            </div>
          </div>
          <div className="sidebar-card">
            <p className="sidebar-card__copy">
              The rest of the app is still available. Reloading should restore the panel.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function serializeDiagramSvg(diagram: DiagramAsset): string {
  const frame = getDiagramFrame(diagram);
  const strokeNodes = diagram.strokes.map((stroke) => strokeToSvgNode(stroke)).join("\n");
  const shapeNodes = diagram.shapes.map((shape) => shapeToSvgNode(shape)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}" fill="none">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
${strokeNodes}
${shapeNodes}
  </g>
</svg>
`;
}

function DiagramStrokePath({
  stroke,
  displayColor
}: {
  stroke: DiagramStroke;
  displayColor: string;
}) {
  if (stroke.points.length === 1) {
    const [point] = stroke.points;
    return (
      <circle cx={point.x} cy={point.y} fill={displayColor} r={stroke.width / 2} />
    );
  }

  return (
    <path
      d={strokeToPathData(stroke.points)}
      fill="none"
      stroke={displayColor}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={stroke.width}
    />
  );
}

function DiagramShapePath({
  shape,
  isDraft = false
}: {
  shape: DiagramShape;
  isDraft?: boolean;
}) {
  const commonProps = {
    fill: shape.kind === "line" ? "none" : shape.fillColor,
    stroke: shape.strokeColor,
    strokeDasharray: isDraft ? "6 4" : undefined,
    strokeOpacity: isDraft ? 0.85 : 1,
    strokeWidth: shape.strokeWidth
  } as const;

  if (shape.kind === "rect") {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        {...commonProps}
      />
    );
  }

  if (shape.kind === "ellipse") {
    return (
      <ellipse
        cx={shape.cx}
        cy={shape.cy}
        rx={shape.rx}
        ry={shape.ry}
        {...commonProps}
      />
    );
  }

  if (shape.kind === "polygon") {
    const pointsAttr = shape.points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polygon
        points={pointsAttr}
        {...commonProps}
      />
    );
  }

  return (
    <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...commonProps} />
  );
}

function strokeToSvgNode(stroke: DiagramStroke): string {
  if (stroke.points.length === 1) {
    const [point] = stroke.points;
    return `    <circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${formatNumber(stroke.width / 2)}" fill="${stroke.color}" />`;
  }

  return `    <path d="${strokeToPathData(stroke.points)}" stroke="${stroke.color}" stroke-width="${formatNumber(stroke.width)}" />`;
}

function shapeToSvgNode(shape: DiagramShape): string {
  if (shape.kind === "rect") {
    return `    <rect x="${formatNumber(shape.x)}" y="${formatNumber(shape.y)}" width="${formatNumber(shape.width)}" height="${formatNumber(shape.height)}" fill="${shape.fillColor}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}" />`;
  }

  if (shape.kind === "ellipse") {
    return `    <ellipse cx="${formatNumber(shape.cx)}" cy="${formatNumber(shape.cy)}" rx="${formatNumber(shape.rx)}" ry="${formatNumber(shape.ry)}" fill="${shape.fillColor}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}" />`;
  }

  if (shape.kind === "polygon") {
    const pts = shape.points.map((p) => `${formatNumber(p.x)},${formatNumber(p.y)}`).join(" ");
    return `    <polygon points="${pts}" fill="${shape.fillColor}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}" />`;
  }

  return `    <line x1="${formatNumber(shape.x1)}" y1="${formatNumber(shape.y1)}" x2="${formatNumber(shape.x2)}" y2="${formatNumber(shape.y2)}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}" />`;
}

function strokeToPathData(points: DiagramPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const [point] = points;
    return `M ${formatNumber(point.x)} ${formatNumber(point.y)}`;
  }

  if (points.length === 2) {
    const [firstPoint, secondPoint] = points;
    return `M ${formatNumber(firstPoint.x)} ${formatNumber(firstPoint.y)} L ${formatNumber(
      secondPoint.x
    )} ${formatNumber(secondPoint.y)}`;
  }

  const segments = [`M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;

    const control1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6
    };
    const control2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6
    };

    segments.push(
      `C ${formatNumber(control1.x)} ${formatNumber(control1.y)} ${formatNumber(
        control2.x
      )} ${formatNumber(control2.y)} ${formatNumber(p2.x)} ${formatNumber(p2.y)}`
    );
  }

  return segments.join(" ");
}

function createShapeDraft(
  tool: Exclude<DiagramTool, "pen">,
  color: string,
  point: DiagramPoint
): DiagramShape {
  const updatedAt = new Date().toISOString();

  if (tool === "rect") {
    return {
      kind: "rect",
      id: `shape-${crypto.randomUUID()}`,
      strokeColor: color,
      strokeWidth: 2.5,
      fillColor: "transparent",
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      originX: point.x,
      originY: point.y,
      updatedAt
    };
  }

  if (tool === "ellipse") {
    return {
      kind: "ellipse",
      id: `shape-${crypto.randomUUID()}`,
      strokeColor: color,
      strokeWidth: 2.5,
      fillColor: "transparent",
      cx: point.x,
      cy: point.y,
      rx: 0,
      ry: 0,
      originX: point.x,
      originY: point.y,
      updatedAt
    };
  }

  return {
    kind: "line",
    id: `shape-${crypto.randomUUID()}`,
    strokeColor: color,
    strokeWidth: 2.5,
    x1: point.x,
    y1: point.y,
    x2: point.x,
    y2: point.y,
    updatedAt
  };
}

function updateShapeDraft(shape: DiagramShape, point: DiagramPoint): DiagramShape {
  if (shape.kind === "rect") {
    const x = Math.min(shape.originX, point.x);
    const y = Math.min(shape.originY, point.y);
    const width = Math.abs(point.x - shape.originX);
    const height = Math.abs(point.y - shape.originY);

    return {
      ...shape,
      x,
      y,
      width,
      height,
      updatedAt: new Date().toISOString()
    };
  }

  if (shape.kind === "ellipse") {
    const cx = (shape.originX + point.x) / 2;
    const cy = (shape.originY + point.y) / 2;
    const rx = Math.abs(point.x - shape.originX) / 2;
    const ry = Math.abs(point.y - shape.originY) / 2;

    return {
      ...shape,
      cx,
      cy,
      rx,
      ry,
      updatedAt: new Date().toISOString()
    };
  }

  if (shape.kind === "line") {
    return {
      ...shape,
      x2: point.x,
      y2: point.y,
      updatedAt: new Date().toISOString()
    };
  }

  return shape;
}

function shapeHasArea(shape: DiagramShape): boolean {
  if (shape.kind === "line") {
    return distance(
      { x: shape.x1, y: shape.y1, pressure: 0 },
      { x: shape.x2, y: shape.y2, pressure: 0 }
    ) >= MIN_MOVEMENT;
  }

  if (shape.kind === "ellipse") {
    return shape.rx >= MIN_MOVEMENT && shape.ry >= MIN_MOVEMENT;
  }

  if (shape.kind === "polygon") {
    return shape.points.length >= 3;
  }

  return shape.width >= MIN_MOVEMENT && shape.height >= MIN_MOVEMENT;
}

function createStroke(
  color: string,
  pointerType: string,
  point: DiagramPoint,
  pressure: number
): DiagramStroke {
  const normalizedPressure = Number.isFinite(pressure) && pressure > 0 ? pressure : pointerType === "mouse" ? 0.35 : 0.55;

  return {
    id: `stroke-${crypto.randomUUID()}`,
    color,
    width: clampStrokeWidth(pointerType, normalizedPressure),
    points: [point],
    updatedAt: new Date().toISOString()
  };
}

function clampStrokeWidth(pointerType: string, pressure: number): number {
  const baseWidth = pointerType === "pen" ? 5.5 : pointerType === "touch" ? 6.5 : 4.5;
  return Math.max(2.25, Math.min(12, baseWidth * (0.6 + pressure)));
}

function pointerEventToDiagramPoint(event: PointerEvent<SVGSVGElement>, _frame: DiagramFrame): DiagramPoint {
  const svg = event.currentTarget;
  const ctm = svg.getScreenCTM();

  if (ctm) {
    return {
      x: (event.clientX - ctm.e) / ctm.a,
      y: (event.clientY - ctm.f) / ctm.d,
      pressure: Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.5
    };
  }

  const rect = svg.getBoundingClientRect();
  const xRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
  const yRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;

  return {
    x: _frame.x + clamp(xRatio, 0, 1) * _frame.width,
    y: _frame.y + clamp(yRatio, 0, 1) * _frame.height,
    pressure: Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.5
  };
}

interface DiagramFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getDiagramFrame(diagram: DiagramAsset): DiagramFrame {
  if (diagram.strokes.length === 0 && diagram.shapes.length === 0) {
    return DEFAULT_DIAGRAM_VIEWBOX;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of diagram.strokes) {
    const radius = stroke.width / 2;

    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - radius);
      minY = Math.min(minY, point.y - radius);
      maxX = Math.max(maxX, point.x + radius);
      maxY = Math.max(maxY, point.y + radius);
    }
  }

  for (const shape of diagram.shapes) {
    if (shape.kind === "rect") {
      minX = Math.min(minX, shape.x - shape.strokeWidth / 2);
      minY = Math.min(minY, shape.y - shape.strokeWidth / 2);
      maxX = Math.max(maxX, shape.x + shape.width + shape.strokeWidth / 2);
      maxY = Math.max(maxY, shape.y + shape.height + shape.strokeWidth / 2);
      continue;
    }

    if (shape.kind === "ellipse") {
      minX = Math.min(minX, shape.cx - shape.rx - shape.strokeWidth / 2);
      minY = Math.min(minY, shape.cy - shape.ry - shape.strokeWidth / 2);
      maxX = Math.max(maxX, shape.cx + shape.rx + shape.strokeWidth / 2);
      maxY = Math.max(maxY, shape.cy + shape.ry + shape.strokeWidth / 2);
      continue;
    }

    if (shape.kind === "polygon") {
      for (const p of shape.points) {
        minX = Math.min(minX, p.x - shape.strokeWidth / 2);
        minY = Math.min(minY, p.y - shape.strokeWidth / 2);
        maxX = Math.max(maxX, p.x + shape.strokeWidth / 2);
        maxY = Math.max(maxY, p.y + shape.strokeWidth / 2);
      }
      continue;
    }

    minX = Math.min(minX, Math.min(shape.x1, shape.x2) - shape.strokeWidth / 2);
    minY = Math.min(minY, Math.min(shape.y1, shape.y2) - shape.strokeWidth / 2);
    maxX = Math.max(maxX, Math.max(shape.x1, shape.x2) + shape.strokeWidth / 2);
    maxY = Math.max(maxY, Math.max(shape.y1, shape.y2) + shape.strokeWidth / 2);
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return DEFAULT_DIAGRAM_VIEWBOX;
  }

  const x = minX - DIAGRAM_VIEWBOX_PADDING;
  const y = minY - DIAGRAM_VIEWBOX_PADDING;
  const width = Math.max(
    DIAGRAM_VIEWBOX_MIN_SIZE,
    maxX - minX + DIAGRAM_VIEWBOX_PADDING * 2
  );
  const height = Math.max(
    DIAGRAM_VIEWBOX_MIN_SIZE,
    maxY - minY + DIAGRAM_VIEWBOX_PADDING * 2
  );

  return { x, y, width, height };
}

function distance(a: DiagramPoint, b: DiagramPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function pointToSegmentDistance(
  point: DiagramPoint,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(point.x - x1, point.y - y1);

  let t = ((point.x - x1) * dx + (point.y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(point.x - (x1 + t * dx), point.y - (y1 + t * dy));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
