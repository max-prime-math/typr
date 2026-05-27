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
  DiagramCanvasFrame,
  DiagramEndpoint,
  DiagramPoint,
  DiagramShape,
  DiagramStroke,
  DiagramStrokeStyle
} from "../app/appState";
import { normalizeDiagramFileName } from "./diagramFiles";

interface DiagramEditorProps {
  diagram: DiagramAsset;
  inkColor: string;
  onInkColorChange: (color: string) => void;
  fillColor: string;
  onFillColorChange: (color: string) => void;
  strokeStyle: DiagramStrokeStyle;
  onStrokeStyleChange: (style: DiagramStrokeStyle) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  startMarker: DiagramEndpoint;
  onStartMarkerChange: (marker: DiagramEndpoint) => void;
  endMarker: DiagramEndpoint;
  onEndMarkerChange: (marker: DiagramEndpoint) => void;
  paperView?: boolean;
  isExpanded?: boolean;
  onExpandLeft?: () => void;
  onExpandRight?: () => void;
  onAddStroke: (stroke: DiagramStroke) => void;
  onAddShape: (shape: DiagramShape) => void;
  onUpdateStroke: (stroke: DiagramStroke) => void;
  onUpdateShape: (shape: DiagramShape) => void;
  onUpdateFrame: (frame: DiagramCanvasFrame | null) => void;
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
const SELECTION_HIT_PADDING = 10;
const SELECTION_HANDLE_RADIUS = 7;
const ROTATION_HANDLE_OFFSET = 26;
const KEYBOARD_MOVE_STEP = 10;
const KEYBOARD_FINE_MOVE_STEP = 1;
const MIN_STROKE_WIDTH = 0.5;
const MAX_STROKE_WIDTH = 48;
const MIN_CANVAS_DIMENSION = 24;
const MIN_ZOOM_LEVEL = 0.1;
const MAX_ZOOM_LEVEL = 8;
const ZOOM_MULTIPLIER = 1.2;
const STROKE_WIDTH_PRESETS = [1, 2.5, 4, 8] as const;
const DIAGRAM_COLOR_SWATCHES = ["#000000", "#d64545", "#c77718", "#2b6cb0", "#2f855a"] as const;
const DIAGRAM_STROKE_STYLE_ITEMS: Array<{
  style: DiagramStrokeStyle;
  label: string;
}> = [
  { style: "solid", label: "Solid" },
  { style: "dotted", label: "Dotted" },
  { style: "fine-dotted", label: "Finely dotted" },
  { style: "dashed", label: "Dashed" }
];
const DIAGRAM_ENDPOINT_ITEMS: Array<{
  endpoint: DiagramEndpoint;
  label: string;
}> = [
  { endpoint: "none", label: "None" },
  { endpoint: "arrow", label: "Arrow" },
  { endpoint: "dot", label: "Dot" },
  { endpoint: "open-dot", label: "Empty dot" }
];
const EMPTY_COLOR_VALUE = "transparent";
type DiagramTool = "pointer" | "crop" | "pen" | "rect" | "ellipse" | "line" | "polygon" | "eraser";
const DIAGRAM_TOOL_ITEMS: Array<{ tool: DiagramTool; label: string }> = [
  { tool: "pointer", label: "Pointer" },
  { tool: "crop", label: "Crop" },
  { tool: "pen", label: "Pen" },
  { tool: "rect", label: "Rectangle" },
  { tool: "ellipse", label: "Ellipse" },
  { tool: "line", label: "Line" },
  { tool: "polygon", label: "Polygon" },
  { tool: "eraser", label: "Eraser" }
];

type DiagramSelectionTarget =
  | { kind: "stroke"; id: string }
  | { kind: "shape"; id: string };

type SelectionTransformMode = "move" | "resize-nw" | "resize-ne" | "resize-se" | "resize-sw" | "rotate";

type DiagramEntity =
  | { kind: "stroke"; stroke: DiagramStroke }
  | { kind: "shape"; shape: DiagramShape };

interface DiagramBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type CropTransformMode = "move" | "resize-nw" | "resize-ne" | "resize-se" | "resize-sw";

interface CropTransformState {
  mode: CropTransformMode;
  startPoint: DiagramPoint;
  originalFrame: DiagramCanvasFrame;
}

interface SelectionTransformState {
  mode: SelectionTransformMode;
  selection: DiagramSelectionTarget;
  startPoint: DiagramPoint;
  originalEntity: DiagramEntity;
  originalBounds: DiagramBounds;
  originalSelectionRotation: number;
}

export function DiagramEditor({
  diagram,
  inkColor,
  onInkColorChange,
  fillColor,
  onFillColorChange,
  strokeStyle,
  onStrokeStyleChange,
  strokeWidth,
  onStrokeWidthChange,
  startMarker,
  onStartMarkerChange,
  endMarker,
  onEndMarkerChange,
  paperView = false,
  isExpanded = false,
  onExpandLeft,
  onExpandRight,
  onAddStroke,
  onAddShape,
  onUpdateStroke,
  onUpdateShape,
  onUpdateFrame,
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
  const surfaceRef = useRef<SVGSVGElement | null>(null);
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
  const [selectedTarget, setSelectedTarget] = useState<DiagramSelectionTarget | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<DiagramBounds | null>(null);
  const [selectionRotation, setSelectionRotation] = useState(0);
  const [transformState, setTransformState] = useState<SelectionTransformState | null>(null);
  const [cropTransformState, setCropTransformState] = useState<CropTransformState | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewportCenter, setViewportCenter] = useState<DiagramPoint | null>(null);
  const [viewportBaseSize, setViewportBaseSize] = useState<Pick<DiagramBounds, "width" | "height"> | null>(null);
  const hasExpandControls = onExpandLeft || onExpandRight;
  const selectedEntity = useMemo(
    () => findDiagramEntity(diagram, selectedTarget),
    [diagram, selectedTarget]
  );
  const supportsFill =
    activeTool === "rect" ||
    activeTool === "ellipse" ||
    activeTool === "polygon" ||
    (activeTool === "pointer" &&
      selectedEntity?.kind === "shape" &&
      selectedEntity.shape.kind !== "line");
  const isCustomInkColor = !DIAGRAM_COLOR_SWATCHES.some(
    (swatch) => swatch.toLowerCase() === inkColor.toLowerCase()
  ) && inkColor !== EMPTY_COLOR_VALUE;
  const isCustomFillColor = !DIAGRAM_COLOR_SWATCHES.some(
    (swatch) => swatch.toLowerCase() === fillColor.toLowerCase()
  ) && fillColor !== EMPTY_COLOR_VALUE;
  const supportsEndpoints =
    activeTool === "pen" ||
    activeTool === "line" ||
    (activeTool === "pointer" &&
      (selectedEntity?.kind === "stroke" ||
        (selectedEntity?.kind === "shape" && selectedEntity.shape.kind === "line")));

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
          strokeWidth,
          strokeStyle,
          startMarker: "none",
          endMarker: "none",
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
          strokeWidth,
          strokeStyle,
          startMarker: "none",
          endMarker: "none",
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
        strokeStyle: "solid",
        fillColor: inkColor,
        rotation: 0,
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
  }, [diagram, draftShape, draftStroke, draftPolygon, polygonCursor, inkColor, strokeStyle, strokeWidth]);
  const autoFrame = useMemo(() => getDiagramAutoFrame(previewDiagram), [previewDiagram]);
  const effectiveFrame = diagram.frame ?? autoFrame;
  const displayFrame = useMemo(() => {
    const baseSize = viewportBaseSize ?? {
      width: effectiveFrame.width,
      height: effectiveFrame.height
    };
    const center = viewportCenter ?? getFrameCenter(effectiveFrame);
    return {
      x: center.x - baseSize.width / (2 * zoomLevel),
      y: center.y - baseSize.height / (2 * zoomLevel),
      width: baseSize.width / zoomLevel,
      height: baseSize.height / zoomLevel
    };
  }, [effectiveFrame, viewportBaseSize, viewportCenter, zoomLevel]);
  const svgMarkup = useMemo(
    () => serializeDiagramSvg(previewDiagram),
    [previewDiagram]
  );
  const selectionOverlay = useMemo(
    () => (selectionBounds ? getSelectionOverlay(selectionBounds, selectionRotation) : null),
    [selectionBounds, selectionRotation]
  );
  const cropOverlay = useMemo(
    () => getCropOverlay(effectiveFrame),
    [effectiveFrame]
  );

  useEffect(() => {
    setFileNameDraft(diagram.name);
  }, [diagram.name]);

  useEffect(() => {
    setZoomLevel(1);
    setViewportBaseSize({
      width: effectiveFrame.width,
      height: effectiveFrame.height
    });
    setViewportCenter(getFrameCenter(effectiveFrame));
  }, [diagram.id]);

  useEffect(() => {
    return () => {
      activePointerIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (selectedTarget && !selectedEntity) {
      setSelectedTarget(null);
      setSelectionBounds(null);
      setSelectionRotation(0);
      setTransformState(null);
    }
  }, [selectedEntity, selectedTarget]);

  function syncToolbarColors(entity: DiagramEntity) {
    if (entity.kind === "stroke") {
      onInkColorChange(entity.stroke.color);
      onStrokeStyleChange(entity.stroke.strokeStyle);
      onStrokeWidthChange(entity.stroke.width);
      onStartMarkerChange(entity.stroke.startMarker);
      onEndMarkerChange(entity.stroke.endMarker);
      return;
    }

    onInkColorChange(entity.shape.strokeColor);
    onStrokeStyleChange(entity.shape.strokeStyle);
    onStrokeWidthChange(entity.shape.strokeWidth);
    if (entity.shape.kind !== "line") {
      onFillColorChange(entity.shape.fillColor);
    } else {
      onStartMarkerChange(entity.shape.startMarker);
      onEndMarkerChange(entity.shape.endMarker);
    }
  }

  function selectEntity(entity: DiagramEntity | null) {
    if (!entity) {
      setSelectedTarget(null);
      setSelectionBounds(null);
      setSelectionRotation(0);
      return;
    }

    setSelectedTarget(
      entity.kind === "stroke"
        ? { kind: "stroke", id: entity.stroke.id }
        : { kind: "shape", id: entity.shape.id }
    );
    setSelectionBounds(getEntityBounds(entity));
    setSelectionRotation(0);
    syncToolbarColors(entity);
  }

  function handleStrokeColorChange(nextColor: string) {
    onInkColorChange(nextColor);

    if (activeTool !== "pointer" || !selectedEntity) {
      return;
    }

    if (selectedEntity.kind === "stroke") {
      onUpdateStroke({
        ...selectedEntity.stroke,
        color: nextColor,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    onUpdateShape({
      ...selectedEntity.shape,
      strokeColor: nextColor,
      updatedAt: new Date().toISOString()
    });
  }

  function handleFillColorChange(nextColor: string) {
    onFillColorChange(nextColor);

    if (
      activeTool !== "pointer" ||
      !selectedEntity ||
      selectedEntity.kind !== "shape" ||
      selectedEntity.shape.kind === "line"
    ) {
      return;
    }

    onUpdateShape({
      ...selectedEntity.shape,
      fillColor: nextColor,
      updatedAt: new Date().toISOString()
    });
  }

  function handleStrokeStyleChange(nextStyle: DiagramStrokeStyle) {
    onStrokeStyleChange(nextStyle);

    if (activeTool !== "pointer" || !selectedEntity) {
      return;
    }

    if (selectedEntity.kind === "stroke") {
      onUpdateStroke({
        ...selectedEntity.stroke,
        strokeStyle: nextStyle,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    onUpdateShape({
      ...selectedEntity.shape,
      strokeStyle: nextStyle,
      updatedAt: new Date().toISOString()
    });
  }

  function handleStrokeWidthChange(nextWidth: number) {
    const clampedWidth = clampStrokeWidthValue(nextWidth);
    onStrokeWidthChange(clampedWidth);

    if (activeTool !== "pointer" || !selectedEntity) {
      return;
    }

    if (selectedEntity.kind === "stroke") {
      const nextStroke = {
        ...selectedEntity.stroke,
        width: clampedWidth,
        updatedAt: new Date().toISOString()
      };
      onUpdateStroke(nextStroke);
      setSelectionBounds(getStrokeBounds(nextStroke));
      return;
    }

    const nextShape = {
      ...selectedEntity.shape,
      strokeWidth: clampedWidth,
      updatedAt: new Date().toISOString()
    };
    onUpdateShape(nextShape);
    setSelectionBounds(getShapeBounds(nextShape));
  }

  function handleEndpointChange(side: "start" | "end", nextMarker: DiagramEndpoint) {
    if (side === "start") {
      onStartMarkerChange(nextMarker);
    } else {
      onEndMarkerChange(nextMarker);
    }

    if (activeTool !== "pointer" || !selectedEntity) {
      return;
    }

    if (selectedEntity.kind === "stroke") {
      const nextStroke = {
        ...selectedEntity.stroke,
        startMarker: side === "start" ? nextMarker : selectedEntity.stroke.startMarker,
        endMarker: side === "end" ? nextMarker : selectedEntity.stroke.endMarker,
        updatedAt: new Date().toISOString()
      };
      onUpdateStroke(nextStroke);
      setSelectionBounds(getStrokeBounds(nextStroke));
      return;
    }

    if (selectedEntity.shape.kind !== "line") {
      return;
    }

    const nextShape = {
      ...selectedEntity.shape,
      startMarker: side === "start" ? nextMarker : selectedEntity.shape.startMarker,
      endMarker: side === "end" ? nextMarker : selectedEntity.shape.endMarker,
      updatedAt: new Date().toISOString()
    };
    onUpdateShape(nextShape);
    setSelectionBounds(getShapeBounds(nextShape));
  }

  useEffect(() => {
    if (activeTool !== "pointer") {
      setSelectedTarget(null);
      setSelectionBounds(null);
      setSelectionRotation(0);
      setTransformState(null);
    }
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== "crop") {
      setCropTransformState(null);
    }
  }, [activeTool]);

  function commitFrame(nextFrame: DiagramCanvasFrame) {
    const normalizedFrame = normalizeCanvasFrame(nextFrame);
    onUpdateFrame(normalizedFrame);
  }

  function handleFrameDimensionChange(axis: "width" | "height", nextValue: number) {
    if (!Number.isFinite(nextValue)) {
      return;
    }

    commitFrame({
      ...effectiveFrame,
      [axis]: Math.max(MIN_CANVAS_DIMENSION, Math.round(nextValue))
    });
  }

  function adjustZoom(direction: "in" | "out") {
    setZoomLevel((currentZoom) =>
      clampZoomLevel(
        direction === "in"
          ? currentZoom * ZOOM_MULTIPLIER
          : currentZoom / ZOOM_MULTIPLIER
      )
    );
  }

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
    const nextStroke = createStroke(
      inkColor,
      strokeWidth,
      strokeStyle,
      startMarker,
      endMarker,
      point
    );

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
    const nextShape = createShapeDraft(
      activeTool as Exclude<DiagramTool, "pen">,
      inkColor,
      fillColor,
      strokeStyle,
      strokeWidth,
      startMarker,
      endMarker,
      point
    );

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
      if (hitTestStroke(stroke, point, ERASER_RADIUS)) {
        eraserHitRef.current.add(stroke.id);
        onRemoveStroke(stroke.id);
        return;
      }
    }

    for (const shape of diagram.shapes) {
      if (eraserHitRef.current.has(shape.id)) continue;
      if (hitTestShape(shape, point, ERASER_RADIUS)) {
        eraserHitRef.current.add(shape.id);
        onRemoveShape(shape.id);
        return;
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

  function applyUpdatedEntity(entity: DiagramEntity) {
    if (entity.kind === "stroke") {
      onUpdateStroke(entity.stroke);
      return;
    }

    onUpdateShape(entity.shape);
  }

  function handleDeleteSelection() {
    if (!selectedTarget) {
      return;
    }

    if (selectedTarget.kind === "stroke") {
      onRemoveStroke(selectedTarget.id);
    } else {
      onRemoveShape(selectedTarget.id);
    }

    setSelectedTarget(null);
    setSelectionBounds(null);
    setSelectionRotation(0);
    setTransformState(null);
  }

  function nudgeSelection(dx: number, dy: number) {
    if (!selectedEntity) {
      return;
    }

    applyUpdatedEntity(translateEntity(selectedEntity, dx, dy));
    setSelectionBounds((currentBounds) =>
      currentBounds
        ? {
            ...currentBounds,
            x: currentBounds.x + dx,
            y: currentBounds.y + dy
          }
        : currentBounds
    );
  }

  function beginSelectionTransform(
    mode: SelectionTransformMode,
    selection: DiagramSelectionTarget,
    entity: DiagramEntity,
    point: DiagramPoint,
    event: PointerEvent<SVGSVGElement>
  ) {
    const bounds = getEntityBounds(entity);
    activePointerIdRef.current = event.pointerId;
    setTransformState({
      mode,
      selection,
      startPoint: point,
      originalEntity: entity,
      originalBounds: bounds,
      originalSelectionRotation: selectionRotation
    });

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort.
    }
  }

  function handlePointerToolDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    surfaceRef.current?.focus();

    if (selectedTarget && selectedEntity && selectionOverlay) {
      const handle = hitTestSelectionHandle(selectionOverlay, point);
      if (handle) {
        beginSelectionTransform(handle, selectedTarget, selectedEntity, point, event);
        return;
      }
    }

    const hitEntity = hitTestDiagramEntity(diagram, point);
    if (hitEntity) {
      selectEntity(hitEntity);
      const selection: DiagramSelectionTarget =
        hitEntity.kind === "stroke"
          ? { kind: "stroke", id: hitEntity.stroke.id }
          : { kind: "shape", id: hitEntity.shape.id };
      beginSelectionTransform("move", selection, hitEntity, point, event);
      return;
    }

    setSelectedTarget(null);
    setSelectionBounds(null);
    setSelectionRotation(0);
    setTransformState(null);
  }

  function handlePointerToolMove(event: PointerEvent<SVGSVGElement>) {
    if (
      !transformState ||
      activePointerIdRef.current !== event.pointerId ||
      !selectedTarget ||
      transformState.selection.id !== selectedTarget.id ||
      transformState.selection.kind !== selectedTarget.kind
    ) {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    let nextEntity = transformState.originalEntity;

    if (transformState.mode === "move") {
      let dx = point.x - transformState.startPoint.x;
      let dy = point.y - transformState.startPoint.y;

      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          dy = 0;
        } else {
          dx = 0;
        }
      }

      nextEntity = translateEntity(transformState.originalEntity, dx, dy);
      setSelectionBounds({
        ...transformState.originalBounds,
        x: transformState.originalBounds.x + dx,
        y: transformState.originalBounds.y + dy
      });
    } else if (transformState.mode === "rotate") {
      const center = getBoundsCenter(transformState.originalBounds);
      const startAngle = Math.atan2(
        transformState.startPoint.y - center.y,
        transformState.startPoint.x - center.x
      );
      const nextAngle = Math.atan2(point.y - center.y, point.x - center.x);
      const angleDelta = nextAngle - startAngle;
      nextEntity = rotateEntity(
        transformState.originalEntity,
        angleDelta,
        center
      );
      setSelectionBounds(transformState.originalBounds);
      setSelectionRotation(transformState.originalSelectionRotation + angleDelta);
    } else {
      nextEntity = resizeEntityFromHandle(
        transformState.originalEntity,
        transformState.originalBounds,
        transformState.mode,
        point
      );
      setSelectionBounds(getEntityBounds(nextEntity));
    }

    applyUpdatedEntity(nextEntity);
  }

  function handlePointerToolUp(event: PointerEvent<SVGSVGElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    setTransformState(null);

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Ignore release failures.
    }
  }

  function beginCropTransform(
    mode: CropTransformMode,
    point: DiagramPoint,
    event: PointerEvent<SVGSVGElement>
  ) {
    activePointerIdRef.current = event.pointerId;
    setCropTransformState({
      mode,
      startPoint: point,
      originalFrame: effectiveFrame
    });

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort.
    }
  }

  function handleCropToolDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    surfaceRef.current?.focus();
    const handle = hitTestCropHandle(cropOverlay, point);

    if (handle) {
      beginCropTransform(handle, point, event);
      return;
    }

    if (pointInBounds(point, effectiveFrame, 6)) {
      beginCropTransform("move", point, event);
    }
  }

  function handleCropToolMove(event: PointerEvent<SVGSVGElement>) {
    if (!cropTransformState || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    const nextFrame =
      cropTransformState.mode === "move"
        ? translateCanvasFrame(
            cropTransformState.originalFrame,
            point.x - cropTransformState.startPoint.x,
            point.y - cropTransformState.startPoint.y
          )
        : resizeCanvasFrame(
            cropTransformState.originalFrame,
            cropTransformState.mode,
            point
          );
    commitFrame(nextFrame);
  }

  function handleCropToolUp(event: PointerEvent<SVGSVGElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    setCropTransformState(null);

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Ignore release failures.
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
            aria-label="New diagram"
            className="pane__button pane__button--compact diagram-editor__new-button"
            onClick={onNew}
            title="New diagram"
            type="button"
          >
            <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.9"
              />
            </svg>
            <span className="visually-hidden">New diagram</span>
          </button>
          {hasExpandControls ? (
            <div className="diagram-editor__nav-buttons">
              {onExpandLeft ? (
                <button
                  aria-label="Collapse diagram layout"
                  className="pane__button pane__button--compact diagram-editor__expand-button"
                  onClick={onExpandLeft}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="diagram-editor__expand-icon diagram-editor__expand-icon--left"
                  />
                </button>
              ) : null}
              {onExpandRight ? (
                <button
                  aria-label="Expand diagram layout"
                  className="pane__button pane__button--compact diagram-editor__expand-button"
                  onClick={onExpandRight}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="diagram-editor__expand-icon diagram-editor__expand-icon--right"
                  />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="diagram-editor__header-dimensions" aria-label="Canvas dimensions">
          <div className="diagram-editor__zoom-controls" aria-label="Canvas zoom">
            <button
              aria-label="Zoom out"
              className="pane__button pane__button--compact diagram-editor__zoom-button"
              onClick={() => adjustZoom("out")}
              type="button"
            >
              -
            </button>
            <span className="diagram-editor__zoom-label">{`${Math.round(zoomLevel * 100)}%`}</span>
            <button
              aria-label="Zoom in"
              className="pane__button pane__button--compact diagram-editor__zoom-button"
              onClick={() => adjustZoom("in")}
              type="button"
            >
              +
            </button>
          </div>
          <label className="diagram-editor__dimension-field">
            <span>X</span>
            <input
              aria-label="Canvas width"
              min={MIN_CANVAS_DIMENSION}
              onChange={(event) => handleFrameDimensionChange("width", Number(event.target.value))}
              step="1"
              type="number"
              value={Math.round(effectiveFrame.width)}
            />
          </label>
          <label className="diagram-editor__dimension-field">
            <span>Y</span>
            <input
              aria-label="Canvas height"
              min={MIN_CANVAS_DIMENSION}
              onChange={(event) => handleFrameDimensionChange("height", Number(event.target.value))}
              step="1"
              type="number"
              value={Math.round(effectiveFrame.height)}
            />
          </label>
        </div>
      </div>

      <div className="diagram-editor__palette" aria-label="Diagram colors">
        <PaletteGroup isExpanded={isExpanded} title="Tools">
          <div className="diagram-editor__toolrow" aria-label="Diagram tools">
            {DIAGRAM_TOOL_ITEMS.map(({ tool, label }) => (
              <button
                aria-label={label}
                aria-pressed={activeTool === tool}
                className="pane__button pane__button--compact diagram-editor__tool"
                key={tool}
                onClick={() => {
                  setActiveTool(tool);
                  activePointerIdRef.current = null;
                  draftStrokeRef.current = null;
                  draftShapeRef.current = null;
                  setSelectedTarget(null);
                  setSelectionBounds(null);
                  setSelectionRotation(0);
                  setTransformState(null);
                  setCropTransformState(null);
                  setDraftStroke(null);
                  setDraftShape(null);
                  setDraftPolygon(null);
                  setPolygonCursor(null);
                }}
                title={label}
                type="button"
              >
                <DiagramToolIcon tool={tool} />
                <span className="visually-hidden">{label}</span>
              </button>
            ))}
          </div>
        </PaletteGroup>
        <PaletteGroup isExpanded={isExpanded} title="Stroke">
          <ColorSwatchRow
            activeColor={inkColor}
            ariaLabel="Stroke colors"
            customColorInputLabel="Custom stroke color"
            hideInlineLabel={isExpanded}
            isCustomColor={isCustomInkColor}
            label="Stroke"
            onColorChange={handleStrokeColorChange}
          />
        </PaletteGroup>
        {supportsFill ? (
          <PaletteGroup isExpanded={isExpanded} title="Fill">
            <ColorSwatchRow
              activeColor={fillColor}
              ariaLabel="Fill colors"
              customColorInputLabel="Custom fill color"
              hideInlineLabel={isExpanded}
              isCustomColor={isCustomFillColor}
              label="Fill"
              onColorChange={handleFillColorChange}
            />
          </PaletteGroup>
        ) : null}
        <PaletteGroup isExpanded={isExpanded} title="Style">
          <StrokeStyleRow
            activeStyle={strokeStyle}
            hideInlineLabel={isExpanded}
            onStyleChange={handleStrokeStyleChange}
          />
        </PaletteGroup>
        <PaletteGroup isExpanded={isExpanded} title="Width">
          <StrokeWidthRow
            hideInlineLabel={isExpanded}
            onStrokeWidthChange={handleStrokeWidthChange}
            strokeWidth={strokeWidth}
          />
        </PaletteGroup>
        {supportsEndpoints ? (
          <PaletteGroup isExpanded={isExpanded} title="Ends">
            <EndpointRow
              endMarker={endMarker}
              hideInlineLabel={isExpanded}
              onEndMarkerChange={(nextMarker) => handleEndpointChange("end", nextMarker)}
              onStartMarkerChange={(nextMarker) => handleEndpointChange("start", nextMarker)}
              startMarker={startMarker}
            />
          </PaletteGroup>
        ) : null}
      </div>

      <div
        className={`diagram-editor__surface ${paperView ? "diagram-editor__surface--paper" : ""}`}
      >
        <svg
          aria-label="Diagram drawing surface"
          className="diagram-editor__svg"
          height={displayFrame.height}
          ref={surfaceRef}
          style={activeTool === "eraser" ? { cursor: "none", overflow: "visible" } : { overflow: "visible" }}
          onClick={(event) => {
            if (activeTool === "pointer") return;
            if (activeTool === "crop") return;
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
                  strokeWidth,
                  strokeStyle,
                  fillColor,
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
            if (activeTool === "pointer") return;
            if (activeTool !== "polygon") return;
            event.preventDefault();
            setDraftPolygon((prev) => {
              if (!prev || prev.length < 3) return null;
              const shape: DiagramShape = {
                kind: "polygon",
                id: `shape-${crypto.randomUUID()}`,
                strokeColor: inkColor,
                strokeWidth,
                strokeStyle,
                fillColor,
                points: prev,
                updatedAt: new Date().toISOString()
              };
              onAddShape(shape);
              return null;
            });
          }}
          onKeyDown={(event) => {
            if (activeTool !== "pointer" || !selectedEntity) {
              return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
              event.preventDefault();
              handleDeleteSelection();
              return;
            }

            const step = event.shiftKey ? KEYBOARD_FINE_MOVE_STEP : KEYBOARD_MOVE_STEP;

            if (event.key === "ArrowLeft") {
              event.preventDefault();
              nudgeSelection(-step, 0);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              nudgeSelection(step, 0);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              nudgeSelection(0, -step);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              nudgeSelection(0, step);
            }
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
            if (activeTool === "pointer") {
              handlePointerToolDown(event);
              return;
            }
            if (activeTool === "crop") {
              handleCropToolDown(event);
              return;
            }
            if (activeTool === "eraser") {
              handleEraserMouseDown(event);
              return;
            }
            startStroke(event);
          }}
          onPointerMove={(event) => {
            if (activeTool === "pointer") {
              handlePointerToolMove(event);
              return;
            }
            if (activeTool === "crop") {
              handleCropToolMove(event);
              return;
            }
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
            if (activeTool === "pointer") {
              handlePointerToolUp(event);
              return;
            }
            if (activeTool === "crop") {
              handleCropToolUp(event);
              return;
            }
            if (activeTool === "eraser") {
              handleEraserMouseUp();
              return;
            }
            finishStroke(event);
          }}
          onPointerCancel={(event) => {
            if (activeTool === "pointer") {
              handlePointerToolUp(event);
              return;
            }
            if (activeTool === "crop") {
              handleCropToolUp(event);
              return;
            }
            if (activeTool === "eraser") {
              handleEraserMouseUp();
              return;
            }
            finishStroke(event);
          }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          tabIndex={0}
          viewBox={`${displayFrame.x} ${displayFrame.y} ${displayFrame.width} ${displayFrame.height}`}
          width={displayFrame.width}
        >
          <defs>
            <DiagramMarkerDefs />
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
          {selectionOverlay ? (
            <SelectionOverlay
              activeMode={transformState?.mode ?? null}
              overlay={selectionOverlay}
            />
          ) : null}
          {activeTool === "crop" ? (
            <CropOverlay
              cropFrame={effectiveFrame}
              displayFrame={displayFrame}
              overlay={cropOverlay}
              activeMode={cropTransformState?.mode ?? null}
            />
          ) : null}
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
          Insert
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

function DiagramToolIcon({ tool }: { tool: DiagramTool }) {
  if (tool === "pointer") {
    return (
      <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
        <path
          d="M7 4.8 17.8 13l-4.7.7 2 4.5-2.6 1.2-2-4.5-3.5 3.2Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (tool === "crop") {
    return (
      <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
        <path
          d="M8 4v12.2a3.8 3.8 0 0 0 3.8 3.8H20M4 8h8.2A3.8 3.8 0 0 1 16 11.8V20"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (tool === "pen") {
    return (
      <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
        <path
          d="M6 18 15.8 8.2a1.9 1.9 0 0 1 2.7 0l1.3 1.3a1.9 1.9 0 0 1 0 2.7L10 22H6z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path d="m14.8 9.2 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 22 4.8 19.4 6 18" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (tool === "rect") {
    return (
      <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
        <rect
          x="5"
          y="6"
          width="14"
          height="12"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (tool === "ellipse") {
    return (
      <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
        <ellipse
          cx="12"
          cy="12"
          rx="7"
          ry="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (tool === "line") {
    return (
      <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
        <path d="M6 18 18 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="6" cy="18" r="1.7" fill="currentColor" />
        <circle cx="18" cy="7" r="1.7" fill="currentColor" />
      </svg>
    );
  }

  if (tool === "polygon") {
    return (
      <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
        <path
          d="m12 5 6 4.4-2.3 7.1H8.3L6 9.4Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="5" r="1.2" fill="currentColor" />
        <circle cx="18" cy="9.4" r="1.2" fill="currentColor" />
        <circle cx="15.7" cy="16.5" r="1.2" fill="currentColor" />
        <circle cx="8.3" cy="16.5" r="1.2" fill="currentColor" />
        <circle cx="6" cy="9.4" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
      <path
        d="m8 9 4-4 7 7-4 4"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m6 15 3-3 6 6H9a3 3 0 0 1-3-3Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function StrokeStyleIcon({ style }: { style: DiagramStrokeStyle }) {
  return (
    <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
      <path
        d="M4 12h16"
        fill="none"
        stroke="currentColor"
        strokeDasharray={getDashArray(style, 1.8)}
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EndpointIcon({ endpoint }: { endpoint: DiagramEndpoint }) {
  return (
    <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
      <path
        d="M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      {endpoint === "arrow" ? (
        <path
          d="m14.5 7.8 4.8 4.2-4.8 4.2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ) : null}
      {endpoint === "dot" ? <circle cx="19" cy="12" fill="currentColor" r="2.3" /> : null}
      {endpoint === "open-dot" ? (
        <circle cx="19" cy="12" fill="none" r="2.3" stroke="currentColor" strokeWidth="1.7" />
      ) : null}
    </svg>
  );
}

function DiagramMarkerDefs() {
  return (
    <>
      <marker
        id="diagram-marker-arrow"
        markerHeight="10"
        markerUnits="strokeWidth"
        markerWidth="10"
        orient="auto-start-reverse"
        refX="8.6"
        refY="5"
      >
        <path
          d="M1.6 1.6 8.4 5 1.6 8.4"
          fill="none"
          stroke="context-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
      </marker>
      <marker
        id="diagram-marker-dot"
        markerHeight="6"
        markerUnits="strokeWidth"
        markerWidth="6"
        orient="auto-start-reverse"
        refX="3"
        refY="3"
      >
        <circle cx="3" cy="3" fill="context-stroke" r="2.1" stroke="none" />
      </marker>
      <marker
        id="diagram-marker-open-dot"
        markerHeight="7"
        markerUnits="strokeWidth"
        markerWidth="7"
        orient="auto-start-reverse"
        refX="3.5"
        refY="3.5"
      >
        <circle cx="3.5" cy="3.5" fill="none" r="2.45" stroke="context-stroke" strokeWidth="1.2" />
      </marker>
    </>
  );
}

function ColorSwatchRow({
  label,
  ariaLabel,
  activeColor,
  isCustomColor,
  customColorInputLabel,
  hideInlineLabel = false,
  onColorChange
}: {
  label: string;
  ariaLabel: string;
  activeColor: string;
  isCustomColor: boolean;
  customColorInputLabel: string;
  hideInlineLabel?: boolean;
  onColorChange: (color: string) => void;
}) {
  const colorInputValue =
    activeColor !== EMPTY_COLOR_VALUE ? activeColor : DIAGRAM_COLOR_SWATCHES[0];

  return (
    <div className="diagram-editor__color-row" aria-label={ariaLabel}>
      {!hideInlineLabel ? <span className="diagram-editor__color-row-label">{label}</span> : null}
      <button
        aria-label={`${label} empty color`}
        aria-pressed={activeColor === EMPTY_COLOR_VALUE}
        className="diagram-editor__color-swatch"
        onClick={() => onColorChange(EMPTY_COLOR_VALUE)}
        type="button"
        title="Empty color"
      >
        <span className="diagram-editor__color-swatch-fill diagram-editor__color-swatch-fill--empty">
          <span className="diagram-editor__color-swatch-slash" />
        </span>
      </button>
      {DIAGRAM_COLOR_SWATCHES.map((color) => (
        <button
          aria-pressed={activeColor.toLowerCase() === color.toLowerCase()}
          aria-label={`${label} color ${color}`}
          className="diagram-editor__color-swatch"
          key={`${label}-${color}`}
          onClick={() => onColorChange(color)}
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
          isCustomColor ? "diagram-editor__color-swatch--active" : ""
        }`}
        title={`Custom ${label.toLowerCase()} color`}
      >
        <input
          aria-label={customColorInputLabel}
          onChange={(event) => onColorChange(event.target.value)}
          type="color"
          value={colorInputValue}
        />
        <span
          className="diagram-editor__color-swatch-fill diagram-editor__color-swatch-fill--hue"
          style={{
            backgroundColor: colorInputValue
          }}
        />
      </label>
    </div>
  );
}

function StrokeStyleRow({
  activeStyle,
  hideInlineLabel = false,
  onStyleChange
}: {
  activeStyle: DiagramStrokeStyle;
  hideInlineLabel?: boolean;
  onStyleChange: (style: DiagramStrokeStyle) => void;
}) {
  return (
    <div className="diagram-editor__control-row" aria-label="Stroke styles">
      {!hideInlineLabel ? <span className="diagram-editor__control-row-label">Style</span> : null}
      <div className="diagram-editor__control-group">
        {DIAGRAM_STROKE_STYLE_ITEMS.map(({ style, label }) => (
          <button
            aria-label={label}
            aria-pressed={activeStyle === style}
            className="pane__button pane__button--compact diagram-editor__option-button"
            key={style}
            onClick={() => onStyleChange(style)}
            title={label}
            type="button"
          >
            <StrokeStyleIcon style={style} />
            <span className="visually-hidden">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StrokeWidthRow({
  strokeWidth,
  hideInlineLabel = false,
  onStrokeWidthChange
}: {
  strokeWidth: number;
  hideInlineLabel?: boolean;
  onStrokeWidthChange: (width: number) => void;
}) {
  return (
    <div className="diagram-editor__control-row" aria-label="Stroke width">
      {!hideInlineLabel ? <span className="diagram-editor__control-row-label">Width</span> : null}
      <div className="diagram-editor__control-group diagram-editor__control-group--width">
        {STROKE_WIDTH_PRESETS.map((preset) => (
          <button
            aria-label={`Stroke width ${preset}`}
            aria-pressed={Math.abs(strokeWidth - preset) < 0.01}
            className="pane__button pane__button--compact diagram-editor__option-button diagram-editor__option-button--width"
            key={preset}
            onClick={() => onStrokeWidthChange(preset)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="diagram-editor__width-preview"
              style={{ height: `${Math.max(1.5, preset)}px` }}
            />
          </button>
        ))}
        <label className="diagram-editor__width-input">
          <span className="visually-hidden">Exact stroke width</span>
          <input
            aria-label="Exact stroke width"
            inputMode="decimal"
            max={MAX_STROKE_WIDTH}
            min={MIN_STROKE_WIDTH}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (Number.isFinite(nextValue)) {
                onStrokeWidthChange(nextValue);
              }
            }}
            step="0.5"
            type="number"
            value={formatStrokeWidthInput(strokeWidth)}
          />
        </label>
      </div>
    </div>
  );
}

function EndpointRow({
  startMarker,
  endMarker,
  hideInlineLabel = false,
  onStartMarkerChange,
  onEndMarkerChange
}: {
  startMarker: DiagramEndpoint;
  endMarker: DiagramEndpoint;
  hideInlineLabel?: boolean;
  onStartMarkerChange: (marker: DiagramEndpoint) => void;
  onEndMarkerChange: (marker: DiagramEndpoint) => void;
}) {
  return (
    <div className="diagram-editor__control-row diagram-editor__control-row--endpoints" aria-label="Line endpoints">
      {!hideInlineLabel ? <span className="diagram-editor__control-row-label">Ends</span> : null}
      <div className="diagram-editor__endpoint-sections">
        <div className="diagram-editor__endpoint-section">
          <span className="diagram-editor__endpoint-label">Start</span>
          <div className="diagram-editor__control-group">
            {DIAGRAM_ENDPOINT_ITEMS.map(({ endpoint, label }) => (
              <button
                aria-label={`Start ${label.toLowerCase()}`}
                aria-pressed={startMarker === endpoint}
                className="pane__button pane__button--compact diagram-editor__option-button"
                key={`start-${endpoint}`}
                onClick={() => onStartMarkerChange(endpoint)}
                title={`Start ${label.toLowerCase()}`}
                type="button"
              >
                <EndpointIcon endpoint={endpoint} />
                <span className="visually-hidden">{`Start ${label}`}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="diagram-editor__endpoint-section">
          <span className="diagram-editor__endpoint-label">End</span>
          <div className="diagram-editor__control-group">
            {DIAGRAM_ENDPOINT_ITEMS.map(({ endpoint, label }) => (
              <button
                aria-label={`End ${label.toLowerCase()}`}
                aria-pressed={endMarker === endpoint}
                className="pane__button pane__button--compact diagram-editor__option-button"
                key={`end-${endpoint}`}
                onClick={() => onEndMarkerChange(endpoint)}
                title={`End ${label.toLowerCase()}`}
                type="button"
              >
                <EndpointIcon endpoint={endpoint} />
                <span className="visually-hidden">{`End ${label}`}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteGroup({
  title,
  isExpanded,
  children
}: {
  title: string;
  isExpanded: boolean;
  children: ReactNode;
}) {
  return (
    <div className="diagram-editor__palette-group">
      {isExpanded ? <div className="diagram-editor__palette-group-title">{title}</div> : null}
      {children}
    </div>
  );
}

interface SelectionOverlayGeometry {
  bounds: DiagramBounds;
  corners: Record<"nw" | "ne" | "se" | "sw", DiagramPoint>;
  rotationHandle: DiagramPoint;
  rotationStemStart: DiagramPoint;
  handles: Record<Exclude<SelectionTransformMode, "move" | "rotate">, DiagramPoint>;
}

function SelectionOverlay({
  overlay,
  activeMode
}: {
  overlay: SelectionOverlayGeometry;
  activeMode: SelectionTransformMode | null;
}) {
  return (
    <>
      <polygon
        points={[
          overlay.corners.nw,
          overlay.corners.ne,
          overlay.corners.se,
          overlay.corners.sw
        ].map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeDasharray="8 6"
        strokeOpacity="0.9"
        strokeWidth="1.5"
        pointerEvents="none"
      />
      <line
        x1={overlay.rotationStemStart.x}
        y1={overlay.rotationStemStart.y}
        x2={overlay.rotationHandle.x}
        y2={overlay.rotationHandle.y}
        stroke="currentColor"
        strokeOpacity="0.8"
        strokeWidth="1.5"
        pointerEvents="none"
      />
      <circle
        cx={overlay.rotationHandle.x}
        cy={overlay.rotationHandle.y}
        r={SELECTION_HANDLE_RADIUS - 1}
        fill={activeMode === "rotate" ? "currentColor" : "var(--surface-strong)"}
        stroke="currentColor"
        strokeWidth="1.5"
        pointerEvents="none"
      />
      {(Object.entries(overlay.handles) as Array<
        [Exclude<SelectionTransformMode, "move" | "rotate">, DiagramPoint]
      >).map(([mode, point]) => (
        <rect
          key={mode}
          x={point.x - (SELECTION_HANDLE_RADIUS - 1)}
          y={point.y - (SELECTION_HANDLE_RADIUS - 1)}
          width={(SELECTION_HANDLE_RADIUS - 1) * 2}
          height={(SELECTION_HANDLE_RADIUS - 1) * 2}
          fill={activeMode === mode ? "currentColor" : "var(--surface-strong)"}
          stroke="currentColor"
          strokeWidth="1.5"
          pointerEvents="none"
        />
      ))}
    </>
  );
}

interface CropOverlayGeometry {
  bounds: DiagramCanvasFrame;
  handles: Record<Exclude<CropTransformMode, "move">, DiagramPoint>;
}

function CropOverlay({
  cropFrame,
  displayFrame,
  overlay,
  activeMode
}: {
  cropFrame: DiagramCanvasFrame;
  displayFrame: DiagramBounds;
  overlay: CropOverlayGeometry;
  activeMode: CropTransformMode | null;
}) {
  const topShadeHeight = Math.max(0, cropFrame.y - displayFrame.y);
  const bottomShadeY = cropFrame.y + cropFrame.height;
  const bottomShadeHeight = Math.max(
    0,
    displayFrame.y + displayFrame.height - bottomShadeY
  );
  const leftShadeWidth = Math.max(0, cropFrame.x - displayFrame.x);
  const rightShadeX = cropFrame.x + cropFrame.width;
  const rightShadeWidth = Math.max(
    0,
    displayFrame.x + displayFrame.width - rightShadeX
  );

  return (
    <>
      {topShadeHeight > 0 ? (
        <rect
          x={displayFrame.x}
          y={displayFrame.y}
          width={displayFrame.width}
          height={topShadeHeight}
          fill="currentColor"
          fillOpacity="0.08"
          pointerEvents="none"
        />
      ) : null}
      {bottomShadeHeight > 0 ? (
        <rect
          x={displayFrame.x}
          y={bottomShadeY}
          width={displayFrame.width}
          height={bottomShadeHeight}
          fill="currentColor"
          fillOpacity="0.08"
          pointerEvents="none"
        />
      ) : null}
      {leftShadeWidth > 0 ? (
        <rect
          x={displayFrame.x}
          y={cropFrame.y}
          width={leftShadeWidth}
          height={cropFrame.height}
          fill="currentColor"
          fillOpacity="0.08"
          pointerEvents="none"
        />
      ) : null}
      {rightShadeWidth > 0 ? (
        <rect
          x={rightShadeX}
          y={cropFrame.y}
          width={rightShadeWidth}
          height={cropFrame.height}
          fill="currentColor"
          fillOpacity="0.08"
          pointerEvents="none"
        />
      ) : null}
      <rect
        x={cropFrame.x}
        y={cropFrame.y}
        width={cropFrame.width}
        height={cropFrame.height}
        fill="none"
        stroke="currentColor"
        strokeDasharray="10 5"
        strokeOpacity="0.9"
        strokeWidth="1.5"
        pointerEvents="none"
      />
      {(Object.entries(overlay.handles) as Array<
        [Exclude<CropTransformMode, "move">, DiagramPoint]
      >).map(([mode, point]) => (
        <rect
          key={mode}
          x={point.x - (SELECTION_HANDLE_RADIUS - 1)}
          y={point.y - (SELECTION_HANDLE_RADIUS - 1)}
          width={(SELECTION_HANDLE_RADIUS - 1) * 2}
          height={(SELECTION_HANDLE_RADIUS - 1) * 2}
          fill={activeMode === mode ? "currentColor" : "var(--surface-strong)"}
          stroke="currentColor"
          strokeWidth="1.5"
          pointerEvents="none"
        />
      ))}
    </>
  );
}

function findDiagramEntity(
  diagram: DiagramAsset,
  target: DiagramSelectionTarget | null
): DiagramEntity | null {
  if (!target) {
    return null;
  }

  if (target.kind === "stroke") {
    const stroke = diagram.strokes.find((entry) => entry.id === target.id);
    return stroke ? { kind: "stroke", stroke } : null;
  }

  const shape = diagram.shapes.find((entry) => entry.id === target.id);
  return shape ? { kind: "shape", shape } : null;
}

function hitTestDiagramEntity(diagram: DiagramAsset, point: DiagramPoint): DiagramEntity | null {
  for (let index = diagram.shapes.length - 1; index >= 0; index -= 1) {
    const shape = diagram.shapes[index];
    if (hitTestShape(shape, point, SELECTION_HIT_PADDING)) {
      return { kind: "shape", shape };
    }
  }

  for (let index = diagram.strokes.length - 1; index >= 0; index -= 1) {
    const stroke = diagram.strokes[index];
    if (hitTestStroke(stroke, point, SELECTION_HIT_PADDING)) {
      return { kind: "stroke", stroke };
    }
  }

  return null;
}

function hitTestSelectionHandle(
  overlay: SelectionOverlayGeometry,
  point: DiagramPoint
): SelectionTransformMode | null {
  if (distance(overlay.rotationHandle, point) <= SELECTION_HANDLE_RADIUS + 2) {
    return "rotate";
  }

  for (const [mode, handlePoint] of Object.entries(overlay.handles) as Array<
    [Exclude<SelectionTransformMode, "move" | "rotate">, DiagramPoint]
  >) {
    if (
      Math.abs(handlePoint.x - point.x) <= SELECTION_HANDLE_RADIUS + 2 &&
      Math.abs(handlePoint.y - point.y) <= SELECTION_HANDLE_RADIUS + 2
    ) {
      return mode;
    }
  }

  return null;
}

function getSelectionOverlay(bounds: DiagramBounds, rotation: number): SelectionOverlayGeometry {
  const center = getBoundsCenter(bounds);
  const topCenterX = bounds.x + bounds.width / 2;
  const corners = {
    nw: rotatePoint({ x: bounds.x, y: bounds.y }, center, rotation),
    ne: rotatePoint({ x: bounds.x + bounds.width, y: bounds.y }, center, rotation),
    se: rotatePoint(
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      center,
      rotation
    ),
    sw: rotatePoint({ x: bounds.x, y: bounds.y + bounds.height }, center, rotation)
  };
  const rotationStemStart = rotatePoint({ x: topCenterX, y: bounds.y }, center, rotation);
  const rotationHandle = rotatePoint(
    { x: topCenterX, y: bounds.y - ROTATION_HANDLE_OFFSET },
    center,
    rotation
  );
  return {
    bounds,
    corners: {
      nw: { ...corners.nw, pressure: 1 },
      ne: { ...corners.ne, pressure: 1 },
      se: { ...corners.se, pressure: 1 },
      sw: { ...corners.sw, pressure: 1 }
    },
    rotationStemStart: { ...rotationStemStart, pressure: 1 },
    rotationHandle: { ...rotationHandle, pressure: 1 },
    handles: {
      "resize-nw": { ...corners.nw, pressure: 1 },
      "resize-ne": { ...corners.ne, pressure: 1 },
      "resize-se": {
        ...corners.se,
        pressure: 1
      },
      "resize-sw": { ...corners.sw, pressure: 1 }
    }
  };
}

function getCropOverlay(frame: DiagramCanvasFrame): CropOverlayGeometry {
  return {
    bounds: frame,
    handles: {
      "resize-nw": { x: frame.x, y: frame.y, pressure: 1 },
      "resize-ne": { x: frame.x + frame.width, y: frame.y, pressure: 1 },
      "resize-se": { x: frame.x + frame.width, y: frame.y + frame.height, pressure: 1 },
      "resize-sw": { x: frame.x, y: frame.y + frame.height, pressure: 1 }
    }
  };
}

function hitTestCropHandle(
  overlay: CropOverlayGeometry,
  point: DiagramPoint
): Exclude<CropTransformMode, "move"> | null {
  for (const [mode, handlePoint] of Object.entries(overlay.handles) as Array<
    [Exclude<CropTransformMode, "move">, DiagramPoint]
  >) {
    if (
      Math.abs(handlePoint.x - point.x) <= SELECTION_HANDLE_RADIUS + 2 &&
      Math.abs(handlePoint.y - point.y) <= SELECTION_HANDLE_RADIUS + 2
    ) {
      return mode;
    }
  }

  return null;
}

function getEntityBounds(entity: DiagramEntity): DiagramBounds {
  return entity.kind === "stroke"
    ? getStrokeBounds(entity.stroke)
    : getShapeBounds(entity.shape);
}

function getStrokeBounds(stroke: DiagramStroke): DiagramBounds {
  if (stroke.points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of stroke.points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const padding =
    stroke.width / 2 + getEndpointPadding(stroke.startMarker, stroke.endMarker, stroke.width);
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2)
  };
}

function getShapeBounds(shape: DiagramShape): DiagramBounds {
  if (shape.kind === "rect") {
    const center = getRectCenter(shape);
    const corners = [
      rotatePoint({ x: shape.x, y: shape.y }, center, shape.rotation),
      rotatePoint({ x: shape.x + shape.width, y: shape.y }, center, shape.rotation),
      rotatePoint(
        { x: shape.x + shape.width, y: shape.y + shape.height },
        center,
        shape.rotation
      ),
      rotatePoint({ x: shape.x, y: shape.y + shape.height }, center, shape.rotation)
    ];
    return boundsFromPoints(corners, shape.strokeWidth / 2);
  }

  if (shape.kind === "ellipse") {
    const cos = Math.cos(shape.rotation);
    const sin = Math.sin(shape.rotation);
    const extentX = Math.sqrt((shape.rx * cos) ** 2 + (shape.ry * sin) ** 2);
    const extentY = Math.sqrt((shape.rx * sin) ** 2 + (shape.ry * cos) ** 2);
    return {
      x: shape.cx - extentX - shape.strokeWidth / 2,
      y: shape.cy - extentY - shape.strokeWidth / 2,
      width: Math.max(1, extentX * 2 + shape.strokeWidth),
      height: Math.max(1, extentY * 2 + shape.strokeWidth)
    };
  }

  if (shape.kind === "polygon") {
    return boundsFromPoints(shape.points, shape.strokeWidth / 2);
  }

  return boundsFromPoints(
    [
      { x: shape.x1, y: shape.y1 },
      { x: shape.x2, y: shape.y2 }
    ],
    shape.strokeWidth / 2 + getEndpointPadding(shape.startMarker, shape.endMarker, shape.strokeWidth)
  );
}

function hitTestStroke(stroke: DiagramStroke, point: DiagramPoint, padding = 0): boolean {
  if (stroke.points.length === 0) {
    return false;
  }

  const radius = stroke.width / 2 + padding;
  if (
    hitTestEndpointMarker(stroke.points[0], point, stroke.startMarker, stroke.width, padding) ||
    hitTestEndpointMarker(
      stroke.points[stroke.points.length - 1],
      point,
      stroke.endMarker,
      stroke.width,
      padding
    )
  ) {
    return true;
  }

  if (stroke.points.length === 1) {
    return distance(stroke.points[0], point) <= radius;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    if (
      pointToSegmentDistance(
        point,
        stroke.points[index - 1].x,
        stroke.points[index - 1].y,
        stroke.points[index].x,
        stroke.points[index].y
      ) <= radius
    ) {
      return true;
    }
  }

  return false;
}

function hitTestShape(shape: DiagramShape, point: DiagramPoint, padding = 0): boolean {
  if (shape.kind === "rect") {
    const center = getRectCenter(shape);
    const local = rotatePoint(point, center, -shape.rotation);
    return (
      local.x >= shape.x - padding &&
      local.x <= shape.x + shape.width + padding &&
      local.y >= shape.y - padding &&
      local.y <= shape.y + shape.height + padding
    );
  }

  if (shape.kind === "ellipse") {
    const local = rotatePoint(point, { x: shape.cx, y: shape.cy }, -shape.rotation);
    const rx = Math.max(shape.rx + padding, 0.0001);
    const ry = Math.max(shape.ry + padding, 0.0001);
    const dx = (local.x - shape.cx) / rx;
    const dy = (local.y - shape.cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  if (shape.kind === "line") {
    if (
      hitTestEndpointMarker(
        { x: shape.x1, y: shape.y1, pressure: 1 },
        point,
        shape.startMarker,
        shape.strokeWidth,
        padding
      ) ||
      hitTestEndpointMarker(
        { x: shape.x2, y: shape.y2, pressure: 1 },
        point,
        shape.endMarker,
        shape.strokeWidth,
        padding
      )
    ) {
      return true;
    }

    return (
      pointToSegmentDistance(point, shape.x1, shape.y1, shape.x2, shape.y2) <=
      shape.strokeWidth / 2 + padding
    );
  }

  if (pointInPolygon(shape.points, point)) {
    return true;
  }

  for (let index = 0; index < shape.points.length; index += 1) {
    const next = (index + 1) % shape.points.length;
    if (
      pointToSegmentDistance(
        point,
        shape.points[index].x,
        shape.points[index].y,
        shape.points[next].x,
        shape.points[next].y
      ) <=
      shape.strokeWidth / 2 + padding
    ) {
      return true;
    }
  }

  return false;
}

function translateEntity(entity: DiagramEntity, dx: number, dy: number): DiagramEntity {
  const updatedAt = new Date().toISOString();

  if (entity.kind === "stroke") {
    return {
      kind: "stroke",
      stroke: {
        ...entity.stroke,
        points: entity.stroke.points.map((point) => ({
          ...point,
          x: point.x + dx,
          y: point.y + dy
        })),
        updatedAt
      }
    };
  }

  const shape = entity.shape;
  if (shape.kind === "rect") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        x: shape.x + dx,
        y: shape.y + dy,
        originX: shape.originX + dx,
        originY: shape.originY + dy,
        updatedAt
      }
    };
  }

  if (shape.kind === "ellipse") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        cx: shape.cx + dx,
        cy: shape.cy + dy,
        originX: shape.originX + dx,
        originY: shape.originY + dy,
        updatedAt
      }
    };
  }

  if (shape.kind === "line") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        x1: shape.x1 + dx,
        y1: shape.y1 + dy,
        x2: shape.x2 + dx,
        y2: shape.y2 + dy,
        updatedAt
      }
    };
  }

  return {
    kind: "shape",
    shape: {
      ...shape,
      points: shape.points.map((point) => ({
        ...point,
        x: point.x + dx,
        y: point.y + dy
      })),
      updatedAt
    }
  };
}

function rotateEntity(entity: DiagramEntity, angleDelta: number, center: DiagramPoint): DiagramEntity {
  const updatedAt = new Date().toISOString();

  if (entity.kind === "stroke") {
    return {
      kind: "stroke",
      stroke: {
        ...entity.stroke,
        points: entity.stroke.points.map((point) => ({
          ...point,
          ...rotatePoint(point, center, angleDelta)
        })),
        updatedAt
      }
    };
  }

  const shape = entity.shape;
  if (shape.kind === "rect") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        rotation: shape.rotation + angleDelta,
        updatedAt
      }
    };
  }

  if (shape.kind === "ellipse") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        rotation: shape.rotation + angleDelta,
        updatedAt
      }
    };
  }

  if (shape.kind === "line") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        ...rotateLine(shape, center, angleDelta),
        updatedAt
      }
    };
  }

  return {
    kind: "shape",
    shape: {
      ...shape,
      points: shape.points.map((point) => ({
        ...point,
        ...rotatePoint(point, center, angleDelta)
      })),
      updatedAt
    }
  };
}

function resizeEntityFromHandle(
  entity: DiagramEntity,
  bounds: DiagramBounds,
  mode: Exclude<SelectionTransformMode, "move" | "rotate">,
  point: DiagramPoint
): DiagramEntity {
  if (entity.kind === "shape" && entity.shape.kind === "rect") {
    return {
      kind: "shape",
      shape: resizeRectFromHandle(entity.shape, mode, point)
    };
  }

  if (entity.kind === "shape" && entity.shape.kind === "ellipse") {
    return {
      kind: "shape",
      shape: resizeEllipseFromHandle(entity.shape, mode, point)
    };
  }

  const anchor = getResizeAnchor(bounds, mode);
  const scaledPoint = clampResizePoint(anchor, point, mode);
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const scaleX =
    mode === "resize-nw" || mode === "resize-sw"
      ? (anchor.x - scaledPoint.x) / width
      : (scaledPoint.x - anchor.x) / width;
  const scaleY =
    mode === "resize-nw" || mode === "resize-ne"
      ? (anchor.y - scaledPoint.y) / height
      : (scaledPoint.y - anchor.y) / height;

  return scaleEntityWorld(entity, anchor, scaleX, scaleY);
}

function scaleEntityWorld(
  entity: DiagramEntity,
  anchor: DiagramPoint,
  scaleX: number,
  scaleY: number
): DiagramEntity {
  const updatedAt = new Date().toISOString();
  const scalePoint = (point: DiagramPoint): DiagramPoint => ({
    ...point,
    x: anchor.x + (point.x - anchor.x) * scaleX,
    y: anchor.y + (point.y - anchor.y) * scaleY
  });

  if (entity.kind === "stroke") {
    return {
      kind: "stroke",
      stroke: {
        ...entity.stroke,
        points: entity.stroke.points.map(scalePoint),
        updatedAt
      }
    };
  }

  const shape = entity.shape;
  if (shape.kind === "line") {
    const start = scalePoint({ x: shape.x1, y: shape.y1, pressure: 1 });
    const end = scalePoint({ x: shape.x2, y: shape.y2, pressure: 1 });
    return {
      kind: "shape",
      shape: {
        ...shape,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        updatedAt
      }
    };
  }

  if (shape.kind !== "polygon") {
    return entity;
  }

  return {
    kind: "shape",
    shape: {
      ...shape,
      points: shape.points.map(scalePoint),
      updatedAt
    }
  };
}

function resizeRectFromHandle(
  shape: Extract<DiagramShape, { kind: "rect" }>,
  mode: Exclude<SelectionTransformMode, "move" | "rotate">,
  point: DiagramPoint
): Extract<DiagramShape, { kind: "rect" }> {
  const center = getRectCenter(shape);
  const localDrag = rotatePoint(point, center, -shape.rotation);
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  const anchor = getLocalResizeAnchor(halfWidth, halfHeight, mode);
  const nextBox = resizeLocalBox(anchor, localDrag, mode);
  const localCenter = {
    x: (nextBox.left + nextBox.right) / 2,
    y: (nextBox.top + nextBox.bottom) / 2
  };
  const worldCenter = rotatePoint(
    { x: center.x + localCenter.x, y: center.y + localCenter.y },
    center,
    shape.rotation
  );
  return {
    ...shape,
    x: worldCenter.x - nextBox.width / 2,
    y: worldCenter.y - nextBox.height / 2,
    width: nextBox.width,
    height: nextBox.height,
    updatedAt: new Date().toISOString()
  };
}

function resizeEllipseFromHandle(
  shape: Extract<DiagramShape, { kind: "ellipse" }>,
  mode: Exclude<SelectionTransformMode, "move" | "rotate">,
  point: DiagramPoint
): Extract<DiagramShape, { kind: "ellipse" }> {
  const center = { x: shape.cx, y: shape.cy };
  const localDrag = rotatePoint(point, center, -shape.rotation);
  const anchor = getLocalResizeAnchor(shape.rx, shape.ry, mode);
  const nextBox = resizeLocalBox(anchor, {
    x: localDrag.x - center.x,
    y: localDrag.y - center.y
  }, mode);
  const localCenter = {
    x: (nextBox.left + nextBox.right) / 2,
    y: (nextBox.top + nextBox.bottom) / 2
  };
  const worldCenter = rotatePoint(
    { x: center.x + localCenter.x, y: center.y + localCenter.y },
    center,
    shape.rotation
  );
  return {
    ...shape,
    cx: worldCenter.x,
    cy: worldCenter.y,
    rx: nextBox.width / 2,
    ry: nextBox.height / 2,
    updatedAt: new Date().toISOString()
  };
}

function getResizeAnchor(
  bounds: DiagramBounds,
  mode: Exclude<SelectionTransformMode, "move" | "rotate">
): DiagramPoint {
  switch (mode) {
    case "resize-nw":
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height, pressure: 1 };
    case "resize-ne":
      return { x: bounds.x, y: bounds.y + bounds.height, pressure: 1 };
    case "resize-se":
      return { x: bounds.x, y: bounds.y, pressure: 1 };
    case "resize-sw":
      return { x: bounds.x + bounds.width, y: bounds.y, pressure: 1 };
  }
}

function getLocalResizeAnchor(
  halfWidth: number,
  halfHeight: number,
  mode: Exclude<SelectionTransformMode, "move" | "rotate">
) {
  switch (mode) {
    case "resize-nw":
      return { x: halfWidth, y: halfHeight };
    case "resize-ne":
      return { x: -halfWidth, y: halfHeight };
    case "resize-se":
      return { x: -halfWidth, y: -halfHeight };
    case "resize-sw":
      return { x: halfWidth, y: -halfHeight };
  }
}

function resizeLocalBox(
  anchor: { x: number; y: number },
  drag: { x: number; y: number },
  mode: Exclude<SelectionTransformMode, "move" | "rotate">
) {
  const minSize = 4;

  if (mode === "resize-nw") {
    const right = anchor.x;
    const bottom = anchor.y;
    const left = Math.min(drag.x, right - minSize);
    const top = Math.min(drag.y, bottom - minSize);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  if (mode === "resize-ne") {
    const left = anchor.x;
    const bottom = anchor.y;
    const right = Math.max(drag.x, left + minSize);
    const top = Math.min(drag.y, bottom - minSize);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  if (mode === "resize-se") {
    const left = anchor.x;
    const top = anchor.y;
    const right = Math.max(drag.x, left + minSize);
    const bottom = Math.max(drag.y, top + minSize);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  const right = anchor.x;
  const top = anchor.y;
  const left = Math.min(drag.x, right - minSize);
  const bottom = Math.max(drag.y, top + minSize);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function clampResizePoint(
  anchor: DiagramPoint,
  point: DiagramPoint,
  mode: Exclude<SelectionTransformMode, "move" | "rotate">
): DiagramPoint {
  const minSize = 4;
  if (mode === "resize-nw") {
    return {
      ...point,
      x: Math.min(point.x, anchor.x - minSize),
      y: Math.min(point.y, anchor.y - minSize)
    };
  }

  if (mode === "resize-ne") {
    return {
      ...point,
      x: Math.max(point.x, anchor.x + minSize),
      y: Math.min(point.y, anchor.y - minSize)
    };
  }

  if (mode === "resize-se") {
    return {
      ...point,
      x: Math.max(point.x, anchor.x + minSize),
      y: Math.max(point.y, anchor.y + minSize)
    };
  }

  return {
    ...point,
    x: Math.min(point.x, anchor.x - minSize),
    y: Math.max(point.y, anchor.y + minSize)
  };
}

function normalizeCanvasFrame(frame: DiagramCanvasFrame): DiagramCanvasFrame {
  return {
    x: frame.x,
    y: frame.y,
    width: Math.max(MIN_CANVAS_DIMENSION, frame.width),
    height: Math.max(MIN_CANVAS_DIMENSION, frame.height)
  };
}

function clampZoomLevel(zoomLevel: number): number {
  return clamp(zoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
}

function getFrameCenter(frame: Pick<DiagramBounds, "x" | "y" | "width" | "height">): DiagramPoint {
  return {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
    pressure: 1
  };
}

function translateCanvasFrame(
  frame: DiagramCanvasFrame,
  dx: number,
  dy: number
): DiagramCanvasFrame {
  return normalizeCanvasFrame({
    ...frame,
    x: frame.x + dx,
    y: frame.y + dy
  });
}

function resizeCanvasFrame(
  frame: DiagramCanvasFrame,
  mode: Exclude<CropTransformMode, "move">,
  point: DiagramPoint
): DiagramCanvasFrame {
  const bounds = resizeBounds(
    frame,
    mode,
    point,
    MIN_CANVAS_DIMENSION
  );
  return normalizeCanvasFrame(bounds);
}

function resizeBounds(
  bounds: DiagramBounds,
  mode: Exclude<CropTransformMode, "move">,
  point: DiagramPoint,
  minSize: number
): DiagramBounds {
  if (mode === "resize-nw") {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const x = Math.min(point.x, right - minSize);
    const y = Math.min(point.y, bottom - minSize);
    return { x, y, width: right - x, height: bottom - y };
  }

  if (mode === "resize-ne") {
    const left = bounds.x;
    const bottom = bounds.y + bounds.height;
    const x2 = Math.max(point.x, left + minSize);
    const y = Math.min(point.y, bottom - minSize);
    return { x: left, y, width: x2 - left, height: bottom - y };
  }

  if (mode === "resize-se") {
    const x2 = Math.max(point.x, bounds.x + minSize);
    const y2 = Math.max(point.y, bounds.y + minSize);
    return { x: bounds.x, y: bounds.y, width: x2 - bounds.x, height: y2 - bounds.y };
  }

  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const x = Math.min(point.x, right - minSize);
  const y2 = Math.max(point.y, top + minSize);
  return { x, y: top, width: right - x, height: y2 - top };
}

function pointInBounds(point: DiagramPoint, bounds: DiagramBounds, padding = 0): boolean {
  return (
    point.x >= bounds.x - padding &&
    point.x <= bounds.x + bounds.width + padding &&
    point.y >= bounds.y - padding &&
    point.y <= bounds.y + bounds.height + padding
  );
}

function getBoundsCenter(bounds: DiagramBounds): DiagramPoint {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    pressure: 1
  };
}

function getRectCenter(shape: Extract<DiagramShape, { kind: "rect" }>) {
  return {
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2
  };
}

function rotateLine(
  shape: Extract<DiagramShape, { kind: "line" }>,
  center: DiagramPoint,
  angleDelta: number
) {
  const start = rotatePoint({ x: shape.x1, y: shape.y1 }, center, angleDelta);
  const end = rotatePoint({ x: shape.x2, y: shape.y2 }, center, angleDelta);
  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y
  };
}

function boundsFromPoints(
  points: Array<{ x: number; y: number }>,
  padding = 0
): DiagramBounds {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

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
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2)
  };
}

function hitTestEndpointMarker(
  endpoint: DiagramPoint,
  point: DiagramPoint,
  marker: DiagramEndpoint,
  strokeWidth: number,
  padding: number
): boolean {
  const extraRadius = getMarkerPadding(marker, strokeWidth);
  return extraRadius > 0 ? distance(endpoint, point) <= extraRadius + padding : false;
}

function pointInPolygon(points: DiagramPoint[], point: DiagramPoint): boolean {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / Math.max(yj - yi, 0.000001) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function rotatePoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  angle: number
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

function radiansToDegrees(angle: number): number {
  return (angle * 180) / Math.PI;
}

function getDashArray(style: DiagramStrokeStyle, strokeWidth: number): string | undefined {
  const unit = Math.max(strokeWidth, 1);

  if (style === "dotted") {
    return `0 ${formatNumber(unit * 2.4)}`;
  }

  if (style === "fine-dotted") {
    return `0 ${formatNumber(unit * 1.45)}`;
  }

  if (style === "dashed") {
    return `${formatNumber(unit * 4.2)} ${formatNumber(unit * 2.7)}`;
  }

  return undefined;
}

function getMarkerId(marker: DiagramEndpoint): string | null {
  if (marker === "arrow") {
    return "diagram-marker-arrow";
  }

  if (marker === "dot") {
    return "diagram-marker-dot";
  }

  if (marker === "open-dot") {
    return "diagram-marker-open-dot";
  }

  return null;
}

function getMarkerUrl(marker: DiagramEndpoint): string | undefined {
  const markerId = getMarkerId(marker);
  return markerId ? `url(#${markerId})` : undefined;
}

function formatDashSvgAttribute(style: DiagramStrokeStyle, strokeWidth: number): string {
  const dashArray = getDashArray(style, strokeWidth);
  return dashArray ? ` stroke-dasharray="${dashArray}"` : "";
}

function formatMarkerSvgAttributes(
  startMarker: DiagramEndpoint,
  endMarker: DiagramEndpoint
): string {
  const attributes: string[] = [];
  const startUrl = getMarkerUrl(startMarker);
  const endUrl = getMarkerUrl(endMarker);

  if (startUrl) {
    attributes.push(` marker-start="${startUrl}"`);
  }

  if (endUrl) {
    attributes.push(` marker-end="${endUrl}"`);
  }

  return attributes.join("");
}

function getDiagramMarkerDefsSvg(): string {
  return [
    '    <marker id="diagram-marker-arrow" markerWidth="10" markerHeight="10" refX="8.6" refY="5" markerUnits="strokeWidth" orient="auto-start-reverse">',
    '      <path d="M1.6 1.6 8.4 5 1.6 8.4" fill="none" stroke="context-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" />',
    "    </marker>",
    '    <marker id="diagram-marker-dot" markerWidth="6" markerHeight="6" refX="3" refY="3" markerUnits="strokeWidth" orient="auto-start-reverse">',
    '      <circle cx="3" cy="3" r="2.1" fill="context-stroke" stroke="none" />',
    "    </marker>",
    '    <marker id="diagram-marker-open-dot" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" markerUnits="strokeWidth" orient="auto-start-reverse">',
    '      <circle cx="3.5" cy="3.5" r="2.45" fill="none" stroke="context-stroke" stroke-width="1.2" />',
    "    </marker>"
  ].join("\n");
}

function getMarkerPadding(marker: DiagramEndpoint, strokeWidth: number): number {
  if (marker === "arrow") {
    return strokeWidth * 4;
  }

  if (marker === "dot" || marker === "open-dot") {
    return strokeWidth * 1.7;
  }

  return 0;
}

function getEndpointPadding(
  startMarker: DiagramEndpoint,
  endMarker: DiagramEndpoint,
  strokeWidth: number
): number {
  return Math.max(getMarkerPadding(startMarker, strokeWidth), getMarkerPadding(endMarker, strokeWidth));
}

function formatStrokeWidthInput(width: number): string {
  return Number.isInteger(width) ? String(width) : String(Number(width.toFixed(2)));
}

export function serializeDiagramSvg(diagram: DiagramAsset): string {
  const frame = getDiagramFrame(diagram);
  const markerDefs = getDiagramMarkerDefsSvg();
  const strokeNodes = diagram.strokes.map((stroke) => strokeToSvgNode(stroke)).join("\n");
  const shapeNodes = diagram.shapes.map((shape) => shapeToSvgNode(shape)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}" fill="none">
  <defs>
${markerDefs}
  </defs>
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
      strokeDasharray={getDashArray(stroke.strokeStyle, stroke.width)}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd={getMarkerUrl(stroke.endMarker)}
      markerStart={getMarkerUrl(stroke.startMarker)}
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
    strokeDasharray: isDraft ? "6 4" : getDashArray(shape.strokeStyle, shape.strokeWidth),
    strokeOpacity: isDraft ? 0.85 : 1,
    strokeWidth: shape.strokeWidth
  } as const;

  if (shape.kind === "rect") {
    const center = getRectCenter(shape);
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        transform={
          shape.rotation
            ? `rotate(${radiansToDegrees(shape.rotation)} ${center.x} ${center.y})`
            : undefined
        }
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
        transform={
          shape.rotation
            ? `rotate(${radiansToDegrees(shape.rotation)} ${shape.cx} ${shape.cy})`
            : undefined
        }
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
    <line
      x1={shape.x1}
      y1={shape.y1}
      x2={shape.x2}
      y2={shape.y2}
      markerEnd={getMarkerUrl(shape.endMarker)}
      markerStart={getMarkerUrl(shape.startMarker)}
      {...commonProps}
    />
  );
}

function strokeToSvgNode(stroke: DiagramStroke): string {
  if (stroke.points.length === 1) {
    const [point] = stroke.points;
    return `    <circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${formatNumber(stroke.width / 2)}" fill="${stroke.color}" />`;
  }

  return `    <path d="${strokeToPathData(stroke.points)}" stroke="${stroke.color}" stroke-width="${formatNumber(stroke.width)}"${formatDashSvgAttribute(stroke.strokeStyle, stroke.width)}${formatMarkerSvgAttributes(stroke.startMarker, stroke.endMarker)} />`;
}

function shapeToSvgNode(shape: DiagramShape): string {
  if (shape.kind === "rect") {
    const center = getRectCenter(shape);
    const transform =
      shape.rotation !== 0
        ? ` transform="rotate(${formatNumber(radiansToDegrees(shape.rotation))} ${formatNumber(center.x)} ${formatNumber(center.y)})"`
        : "";
    return `    <rect x="${formatNumber(shape.x)}" y="${formatNumber(shape.y)}" width="${formatNumber(shape.width)}" height="${formatNumber(shape.height)}" fill="${shape.fillColor}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}"${formatDashSvgAttribute(shape.strokeStyle, shape.strokeWidth)}${transform} />`;
  }

  if (shape.kind === "ellipse") {
    const transform =
      shape.rotation !== 0
        ? ` transform="rotate(${formatNumber(radiansToDegrees(shape.rotation))} ${formatNumber(shape.cx)} ${formatNumber(shape.cy)})"`
        : "";
    return `    <ellipse cx="${formatNumber(shape.cx)}" cy="${formatNumber(shape.cy)}" rx="${formatNumber(shape.rx)}" ry="${formatNumber(shape.ry)}" fill="${shape.fillColor}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}"${formatDashSvgAttribute(shape.strokeStyle, shape.strokeWidth)}${transform} />`;
  }

  if (shape.kind === "polygon") {
    const pts = shape.points.map((p) => `${formatNumber(p.x)},${formatNumber(p.y)}`).join(" ");
    return `    <polygon points="${pts}" fill="${shape.fillColor}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}"${formatDashSvgAttribute(shape.strokeStyle, shape.strokeWidth)} />`;
  }

  return `    <line x1="${formatNumber(shape.x1)}" y1="${formatNumber(shape.y1)}" x2="${formatNumber(shape.x2)}" y2="${formatNumber(shape.y2)}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}"${formatDashSvgAttribute(shape.strokeStyle, shape.strokeWidth)}${formatMarkerSvgAttributes(shape.startMarker, shape.endMarker)} />`;
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
  fillColor: string,
  strokeStyle: DiagramStrokeStyle,
  strokeWidth: number,
  startMarker: DiagramEndpoint,
  endMarker: DiagramEndpoint,
  point: DiagramPoint
): DiagramShape {
  const updatedAt = new Date().toISOString();
  const nextStrokeWidth = clampStrokeWidthValue(strokeWidth);

  if (tool === "rect") {
    return {
      kind: "rect",
      id: `shape-${crypto.randomUUID()}`,
      strokeColor: color,
      strokeWidth: nextStrokeWidth,
      strokeStyle,
      fillColor,
      rotation: 0,
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
      strokeWidth: nextStrokeWidth,
      strokeStyle,
      fillColor,
      rotation: 0,
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
    strokeWidth: nextStrokeWidth,
    strokeStyle,
    startMarker,
    endMarker,
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
  width: number,
  strokeStyle: DiagramStrokeStyle,
  startMarker: DiagramEndpoint,
  endMarker: DiagramEndpoint,
  point: DiagramPoint
): DiagramStroke {
  return {
    id: `stroke-${crypto.randomUUID()}`,
    color,
    width: clampStrokeWidthValue(width),
    strokeStyle,
    startMarker,
    endMarker,
    points: [point],
    updatedAt: new Date().toISOString()
  };
}

function clampStrokeWidthValue(width: number): number {
  return clamp(width, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH);
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
  return diagram.frame ?? getDiagramAutoFrame(diagram);
}

function getDiagramAutoFrame(diagram: DiagramAsset): DiagramFrame {
  if (diagram.strokes.length === 0 && diagram.shapes.length === 0) {
    return DEFAULT_DIAGRAM_VIEWBOX;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of diagram.strokes) {
    const bounds = getStrokeBounds(stroke);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  for (const shape of diagram.shapes) {
    const bounds = getShapeBounds(shape);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
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

function getCropWorkspaceFrame(
  autoFrame: DiagramFrame,
  cropFrame: DiagramCanvasFrame
): DiagramFrame {
  const minX = Math.min(autoFrame.x, cropFrame.x);
  const minY = Math.min(autoFrame.y, cropFrame.y);
  const maxX = Math.max(autoFrame.x + autoFrame.width, cropFrame.x + cropFrame.width);
  const maxY = Math.max(autoFrame.y + autoFrame.height, cropFrame.y + cropFrame.height);

  return {
    x: minX - DIAGRAM_VIEWBOX_PADDING / 2,
    y: minY - DIAGRAM_VIEWBOX_PADDING / 2,
    width: Math.max(DIAGRAM_VIEWBOX_MIN_SIZE, maxX - minX + DIAGRAM_VIEWBOX_PADDING),
    height: Math.max(DIAGRAM_VIEWBOX_MIN_SIZE, maxY - minY + DIAGRAM_VIEWBOX_PADDING)
  };
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
