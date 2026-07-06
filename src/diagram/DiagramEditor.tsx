import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import type {
  DiagramAsset,
  DiagramCanvasFrame,
  DiagramEndpoint,
  DiagramPoint,
  DiagramShape,
  DiagramStroke,
  DiagramStrokeStyle
} from "../app/appState";
import { InlinePaneExpandControls } from "../app/InlinePaneExpandControls";
import diagramBezierIconUrl from "../icons/diagram/bezier.svg?url";
import diagramCropIconUrl from "../icons/diagram/crop.svg?url";
import diagramDefaultIconUrl from "../icons/diagram/default.svg?url";
import diagramEllipseIconUrl from "../icons/diagram/ellipse.svg?url";
import diagramHandIconUrl from "../icons/diagram/hand.svg?url";
import diagramLineIconUrl from "../icons/diagram/line.svg?url";
import diagramMagnetIconUrl from "../icons/diagram/magnet.svg?url";
import diagramPenIconUrl from "../icons/diagram/pen.svg?url";
import diagramPointerIconUrl from "../icons/diagram/pointer.svg?url";
import diagramPolygonIconUrl from "../icons/diagram/polygon.svg?url";
import diagramRectIconUrl from "../icons/diagram/rect.svg?url";
import diagramZoomInIconUrl from "../icons/diagram/zoom-in.svg?url";
import diagramZoomOutIconUrl from "../icons/diagram/zoom-out.svg?url";
import { createRandomId } from "../utils/randomId";
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
const VERTEX_SNAP_RADIUS_PX = 12;
const MIN_STROKE_WIDTH = 0.5;
const MAX_STROKE_WIDTH = 48;
const MIN_CANVAS_DIMENSION = 24;
const MIN_ZOOM_LEVEL = 0.1;
const MAX_ZOOM_LEVEL = 8;
const ZOOM_MULTIPLIER = 1.2;
const ZOOM_CLICK_MULTIPLIER = 1.1;
const ZOOM_PERCENT_STEPS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300] as const;
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
type DiagramTool =
  | "pointer"
  | "hand"
  | "crop"
  | "zoom"
  | "pen"
  | "rect"
  | "ellipse"
  | "line"
  | "bezier"
  | "polygon"
  | "eraser";
const DIAGRAM_TOOL_ITEMS: Array<{ tool: DiagramTool; label: string }> = [
  { tool: "pointer", label: "Pointer" },
  { tool: "hand", label: "Hand" },
  { tool: "crop", label: "Crop" },
  { tool: "pen", label: "Pen" },
  { tool: "rect", label: "Rectangle" },
  { tool: "ellipse", label: "Ellipse" },
  { tool: "line", label: "Line" },
  { tool: "bezier", label: "Bezier" },
  { tool: "polygon", label: "Polygon" },
  { tool: "eraser", label: "Eraser" }
];

type DiagramSelectionTarget =
  | { kind: "stroke"; id: string }
  | { kind: "shape"; id: string };

type SelectionTransformMode = "move" | "resize-nw" | "resize-ne" | "resize-se" | "resize-sw" | "rotate";
type BezierHandleKind =
  | "start"
  | "control1"
  | "control2"
  | "end"
  | "linked-start"
  | "linked-end";

type DiagramEntity =
  | { kind: "stroke"; stroke: DiagramStroke }
  | { kind: "shape"; shape: DiagramShape };
type BezierShapeEntity = { kind: "shape"; shape: Extract<DiagramShape, { kind: "bezier" }> };

interface DiagramBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type CropTransformMode =
  | "create"
  | "move"
  | "resize-n"
  | "resize-ne"
  | "resize-e"
  | "resize-se"
  | "resize-s"
  | "resize-sw"
  | "resize-w"
  | "resize-nw";

interface CropTransformState {
  mode: CropTransformMode;
  startPoint: DiagramPoint;
  originalFrame: DiagramCanvasFrame;
}

interface ZoomDragState {
  startPoint: DiagramPoint;
  currentPoint: DiagramPoint;
}

interface HandTransformState {
  startClientX: number;
  startClientY: number;
  originalCenter: DiagramPoint;
  originalDisplayFrame: DiagramBounds;
  originalViewportBox: { width: number; height: number };
}

interface SelectionTransformState {
  kind: "selection";
  mode: SelectionTransformMode;
  selection: DiagramSelectionTarget;
  startPoint: DiagramPoint;
  originalEntity: DiagramEntity;
  originalBounds: DiagramBounds;
  originalSelectionRotation: number;
}

interface BezierHandleTransformState {
  kind: "bezier-handle";
  handle: BezierHandleKind;
  selection: DiagramSelectionTarget;
  startPoint: DiagramPoint;
  originalEntity: BezierShapeEntity;
  linkedEntity: BezierShapeEntity | null;
}

type PointerTransformState = SelectionTransformState | BezierHandleTransformState;

type DiagramReorderAction = "front" | "back" | "forward" | "backward";

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
  const temporaryHandPreviousToolRef = useRef<{
    tool: DiagramTool;
    isCropToolPrimed: boolean;
  } | null>(null);
  const surfaceContainerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const draftStrokeRef = useRef<DiagramStroke | null>(null);
  const draftShapeRef = useRef<DiagramShape | null>(null);
  const [draftStroke, setDraftStroke] = useState<DiagramStroke | null>(null);
  const [draftShape, setDraftShape] = useState<DiagramShape | null>(null);
  const [draftPolygon, setDraftPolygon] = useState<DiagramPoint[] | null>(null);
  const [polygonCursor, setPolygonCursor] = useState<DiagramPoint | null>(null);
  const [bezierStartPoint, setBezierStartPoint] = useState<DiagramPoint | null>(null);
  const [bezierChainOriginPoint, setBezierChainOriginPoint] = useState<DiagramPoint | null>(null);
  const [bezierChainOriginOutgoingControlPoint, setBezierChainOriginOutgoingControlPoint] = useState<DiagramPoint | null>(null);
  const [bezierCursor, setBezierCursor] = useState<DiagramPoint | null>(null);
  const [bezierOutgoingControlPoint, setBezierOutgoingControlPoint] = useState<DiagramPoint | null>(null);
  const [bezierClosingIncomingControlPoint, setBezierClosingIncomingControlPoint] = useState<DiagramPoint | null>(null);
  const [eraserCursor, setEraserCursor] = useState<DiagramPoint | null>(null);
  const [eraserDragging, setEraserDragging] = useState(false);
  const [fileNameDraft, setFileNameDraft] = useState(diagram.name);
  const [activeTool, setActiveTool] = useState<DiagramTool>("pen");
  const [isZoomOutModifierDown, setIsZoomOutModifierDown] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<DiagramSelectionTarget | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<DiagramBounds | null>(null);
  const [selectionRotation, setSelectionRotation] = useState(0);
  const [transformState, setTransformState] = useState<PointerTransformState | null>(null);
  const [cropTransformState, setCropTransformState] = useState<CropTransformState | null>(null);
  const [cropDraftFrame, setCropDraftFrame] = useState<DiagramCanvasFrame | null>(null);
  const [isCropToolPrimed, setIsCropToolPrimed] = useState(false);
  const [handTransformState, setHandTransformState] = useState<HandTransformState | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isVertexSnapEnabled, setIsVertexSnapEnabled] = useState(false);
  const [viewportCenter, setViewportCenter] = useState<DiagramPoint | null>(null);
  const [viewportBaseSize, setViewportBaseSize] = useState<Pick<DiagramBounds, "width" | "height"> | null>(null);
  const [zoomDragState, setZoomDragState] = useState<ZoomDragState | null>(null);
  const [surfaceViewportBox, setSurfaceViewportBox] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    containerWidth: 0,
    containerHeight: 0
  });
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
      selectedEntity.shape.kind !== "line" &&
      selectedEntity.shape.kind !== "bezier");
  const isCustomInkColor = !DIAGRAM_COLOR_SWATCHES.some(
    (swatch) => swatch.toLowerCase() === inkColor.toLowerCase()
  ) && inkColor !== EMPTY_COLOR_VALUE;
  const isCustomFillColor = !DIAGRAM_COLOR_SWATCHES.some(
    (swatch) => swatch.toLowerCase() === fillColor.toLowerCase()
  ) && fillColor !== EMPTY_COLOR_VALUE;
  const supportsEndpoints =
    activeTool === "pen" ||
    activeTool === "line" ||
    activeTool === "bezier" ||
    (activeTool === "pointer" &&
      (selectedEntity?.kind === "stroke" ||
        (selectedEntity?.kind === "shape" &&
          (selectedEntity.shape.kind === "line" || selectedEntity.shape.kind === "bezier"))));
  const supportsStrokeContext =
    activeTool === "pointer"
      ? Boolean(selectedEntity)
      : activeTool === "pen" ||
        activeTool === "line" ||
        activeTool === "bezier" ||
        activeTool === "rect" ||
        activeTool === "ellipse" ||
        activeTool === "polygon";
  const supportsStyleContext = supportsStrokeContext;
  const supportsWidthContext = supportsStrokeContext;
  const supportsArrangeContext = Boolean(selectedTarget);
  const supportsStrokeInspector = supportsStyleContext || supportsWidthContext || supportsEndpoints;
  const hasContextControls =
    supportsArrangeContext ||
    supportsStrokeContext ||
    supportsFill ||
    supportsStrokeInspector ||
    supportsEndpoints;

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

    if (bezierStartPoint) {
      const draftShapes: DiagramShape[] = [
        {
          kind: "ellipse",
          id: "draft-bezier-start-dot",
          strokeColor: inkColor,
          strokeWidth: 2,
          strokeStyle: "solid",
          fillColor: inkColor,
          rotation: 0,
          cx: bezierStartPoint.x,
          cy: bezierStartPoint.y,
          rx: 5,
          ry: 5,
          originX: bezierStartPoint.x,
          originY: bezierStartPoint.y,
          updatedAt: new Date().toISOString()
        }
      ];

      if (
        bezierChainOriginPoint &&
        !pointsMatch(bezierStartPoint, bezierChainOriginPoint)
      ) {
        draftShapes.push({
          kind: "ellipse",
          id: "draft-bezier-origin-dot",
          strokeColor: inkColor,
          strokeWidth: 2,
          strokeStyle: "solid",
          fillColor: inkColor,
          rotation: 0,
          cx: bezierChainOriginPoint.x,
          cy: bezierChainOriginPoint.y,
          rx: 4,
          ry: 4,
          originX: bezierChainOriginPoint.x,
          originY: bezierChainOriginPoint.y,
          updatedAt: new Date().toISOString()
        });
      }

      if (bezierCursor && !draftShape) {
        draftShapes.push({
          kind: "line",
          id: "draft-bezier-guide",
          strokeColor: inkColor,
          strokeWidth: 1.5,
          strokeStyle: "fine-dotted",
          startMarker: "none",
          endMarker: "none",
          x1: bezierStartPoint.x,
          y1: bezierStartPoint.y,
          x2: bezierCursor.x,
          y2: bezierCursor.y,
          updatedAt: new Date().toISOString()
        });
      }

      previewShapes = [...previewShapes, ...draftShapes];
    }

    return {
      ...diagram,
      strokes,
      shapes: previewShapes
    };
  }, [
    bezierCursor,
    bezierChainOriginPoint,
    bezierStartPoint,
    diagram,
    draftShape,
    draftStroke,
    draftPolygon,
    polygonCursor,
    inkColor,
    strokeStyle,
    strokeWidth
  ]);
  const autoFrame = useMemo(() => getDiagramAutoFrame(previewDiagram), [previewDiagram]);
  const effectiveFrame = diagram.frame ?? autoFrame;
  const surfaceAspectRatio = useMemo(() => {
    if (!isExpanded) {
      return 1;
    }

    if (
      surfaceViewportBox.containerWidth > 0 &&
      surfaceViewportBox.containerHeight > 0
    ) {
      return surfaceViewportBox.containerWidth / surfaceViewportBox.containerHeight;
    }

    return effectiveFrame.width / effectiveFrame.height;
  }, [
    effectiveFrame.height,
    effectiveFrame.width,
    isExpanded,
    surfaceViewportBox.containerHeight,
    surfaceViewportBox.containerWidth
  ]);
  const displayFrame = useMemo(() => {
    const baseSize = viewportBaseSize ?? {
      width: effectiveFrame.width,
      height: effectiveFrame.height
    };
    const center = viewportCenter ?? getFrameCenter(effectiveFrame);
    let width = baseSize.width / zoomLevel;
    let height = baseSize.height / zoomLevel;
    const currentAspect = width / height;

    if (surfaceAspectRatio > 0) {
      if (currentAspect < surfaceAspectRatio) {
        width = height * surfaceAspectRatio;
      } else if (currentAspect > surfaceAspectRatio) {
        height = width / surfaceAspectRatio;
      }
    }

    return {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height
    };
  }, [effectiveFrame, surfaceAspectRatio, viewportBaseSize, viewportCenter, zoomLevel]);
  const zoomSelectValue = useMemo(
    () => getZoomSelectValue(zoomLevel),
    [zoomLevel]
  );
  const zoomCursor = useMemo(
    () => createZoomCursorDataUrl(isZoomOutModifierDown),
    [isZoomOutModifierDown]
  );
  const surfaceStyle = useMemo(
    () => ({
      aspectRatio: "1 / 1"
    }),
    []
  );
  const svgMarkup = useMemo(
    () => serializeDiagramSvg(previewDiagram),
    [previewDiagram]
  );
  const orderedPreviewEntities = useMemo(
    () => getOrderedDiagramEntities(previewDiagram),
    [previewDiagram]
  );
  const selectionOverlay = useMemo(
    () => (selectionBounds ? getSelectionOverlay(selectionBounds, selectionRotation) : null),
    [selectionBounds, selectionRotation]
  );
  const bezierOverlay = useMemo(
    () =>
      selectedEntity?.kind === "shape" && selectedEntity.shape.kind === "bezier"
        ? getBezierEditOverlay(diagram, selectedEntity.shape)
        : null,
    [diagram, selectedEntity]
  );
  const draftBezierOverlay = useMemo(
    () =>
      draftShape?.kind === "bezier"
        ? getBezierEditOverlay(previewDiagram, draftShape)
        : null,
    [draftShape, previewDiagram]
  );
  const cropOverlay = useMemo(
    () => getCropOverlay(cropDraftFrame ?? effectiveFrame),
    [cropDraftFrame, effectiveFrame]
  );
  const zoomOverlay = useMemo(
    () => (zoomDragState ? getZoomDragOverlay(zoomDragState) : null),
    [zoomDragState]
  );
  const activeSelectionMode = transformState?.kind === "selection" ? transformState.mode : null;
  const activeBezierHandle = transformState?.kind === "bezier-handle" ? transformState.handle : null;

  useEffect(() => {
    setFileNameDraft(diagram.name);
  }, [diagram.name]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const surfaceContainer = surfaceContainerRef.current;
    const surface = surfaceRef.current;
    if (!surfaceContainer || !surface || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateViewportBox = () => {
      const containerRect = surfaceContainer.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      const renderedViewportBox = getRenderedViewportBox(
        surfaceRect.width,
        surfaceRect.height,
        displayFrame.width,
        displayFrame.height
      );

      setSurfaceViewportBox({
        left: surfaceRect.left - containerRect.left + renderedViewportBox.left,
        top: surfaceRect.top - containerRect.top + renderedViewportBox.top,
        width: renderedViewportBox.width,
        height: renderedViewportBox.height,
        containerWidth: containerRect.width,
        containerHeight: containerRect.height
      });
    };

    updateViewportBox();
    const observer = new ResizeObserver(updateViewportBox);
    observer.observe(surfaceContainer);
    observer.observe(surface);
    window.addEventListener("resize", updateViewportBox);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewportBox);
    };
  }, [displayFrame.height, displayFrame.width]);

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
    if (entity.shape.kind !== "line" && entity.shape.kind !== "bezier") {
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
      selectedEntity.shape.kind === "line" ||
      selectedEntity.shape.kind === "bezier"
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

    if (selectedEntity.shape.kind !== "line" && selectedEntity.shape.kind !== "bezier") {
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
      setCropDraftFrame(null);
    }
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== "zoom") {
      setZoomDragState(null);
    }
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== "zoom") {
      setIsZoomOutModifierDown(false);
      return;
    }

    const updateModifierState = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsZoomOutModifierDown(event.type === "keydown");
      }
    };

    const resetModifierState = () => {
      setIsZoomOutModifierDown(false);
    };

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("keydown", updateModifierState);
    window.addEventListener("keyup", updateModifierState);
    window.addEventListener("blur", resetModifierState);

    return () => {
      window.removeEventListener("keydown", updateModifierState);
      window.removeEventListener("keyup", updateModifierState);
      window.removeEventListener("blur", resetModifierState);
    };
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

  function setZoomToPercent(percent: number) {
    if (!Number.isFinite(percent)) {
      return;
    }

    setZoomLevel(clampZoomLevel(percent / 100));
  }

  function toggleVertexSnap() {
    setIsVertexSnapEnabled((current) => !current);
  }

  function getSnappedPointerPoint(
    event: PointerEvent<SVGSVGElement>,
    tool: DiagramTool
  ): DiagramPoint {
    const rawPoint = pointerEventToDiagramPoint(event, displayFrame);
    const supportsVertexSnap =
      tool === "line" ||
      tool === "bezier" ||
      tool === "rect" ||
      tool === "ellipse" ||
      tool === "polygon";

    if (!isVertexSnapEnabled || !supportsVertexSnap) {
      return rawPoint;
    }

    return snapPointToNearestVertex(
      rawPoint,
      [...getDiagramVertices(diagram), ...(draftPolygon ?? [])],
      getDiagramHitPadding(event.currentTarget, displayFrame, VERTEX_SNAP_RADIUS_PX)
    );
  }

  function applyZoomToSquare(bounds: DiagramBounds) {
    if (bounds.width < 1 || bounds.height < 1) {
      return;
    }

    const baseSize = viewportBaseSize ?? {
      width: effectiveFrame.width,
      height: effectiveFrame.height
    };

    if (baseSize.width <= 0 || baseSize.height <= 0) {
      return;
    }

    const nextZoom = clampZoomLevel(Math.min(baseSize.width / bounds.width, baseSize.height / bounds.height));
    setViewportCenter(getBoundsCenter(bounds));
    setZoomLevel(nextZoom);
  }

  function handleZoomToolDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    surfaceRef.current?.focus();
    activePointerIdRef.current = event.pointerId;
    setZoomDragState({
      startPoint: point,
      currentPoint: point
    });

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort.
    }
  }

  function handleZoomToolMove(event: PointerEvent<SVGSVGElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      setIsZoomOutModifierDown(event.shiftKey);
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    setIsZoomOutModifierDown(event.shiftKey);
    setZoomDragState((currentDrag) =>
      currentDrag
        ? {
            ...currentDrag,
            currentPoint: point
          }
        : currentDrag
    );
  }

  function finishZoomTool(event: PointerEvent<SVGSVGElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const dragState = zoomDragState;
    activePointerIdRef.current = null;
    setIsZoomOutModifierDown(event.shiftKey);
    setZoomDragState(null);

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Ignore release failures.
    }

    if (!dragState) {
      return;
    }

    const dragBounds = getZoomDragBounds(dragState.startPoint, dragState.currentPoint);
    const dragDistance = distance(dragState.startPoint, dragState.currentPoint);

    if (dragDistance < 4) {
      const zoomOut = event.shiftKey || isZoomOutModifierDown;
      setViewportCenter(dragState.startPoint);
      setZoomLevel((currentZoom) =>
        clampZoomLevel(
          currentZoom * (zoomOut ? 1 / ZOOM_CLICK_MULTIPLIER : ZOOM_CLICK_MULTIPLIER)
        )
      );
      return;
    }

    applyZoomToSquare(dragBounds);
  }

  function handleHandToolDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    surfaceRef.current?.focus();
    activePointerIdRef.current = event.pointerId;
    setHandTransformState({
      startClientX: event.clientX,
      startClientY: event.clientY,
      originalCenter: viewportCenter ?? getFrameCenter(effectiveFrame),
      originalDisplayFrame: displayFrame,
      originalViewportBox: {
        width: Math.max(surfaceViewportBox.width, 1),
        height: Math.max(surfaceViewportBox.height, 1)
      }
    });

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort.
    }
  }

  function handleHandToolMove(event: PointerEvent<SVGSVGElement>) {
    if (!handTransformState || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const dx =
      ((event.clientX - handTransformState.startClientX) * handTransformState.originalDisplayFrame.width) /
      handTransformState.originalViewportBox.width;
    const dy =
      ((event.clientY - handTransformState.startClientY) * handTransformState.originalDisplayFrame.height) /
      handTransformState.originalViewportBox.height;
    setViewportCenter({
      x: handTransformState.originalCenter.x - dx,
      y: handTransformState.originalCenter.y - dy,
      pressure: 1
    });
  }

  function finishHandTool(event: PointerEvent<SVGSVGElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    setHandTransformState(null);

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Ignore release failures.
    }
  }

  function activateTemporaryHandTool() {
    if (temporaryHandPreviousToolRef.current || activeTool === "hand") {
      return;
    }

    temporaryHandPreviousToolRef.current = {
      tool: activeTool,
      isCropToolPrimed
    };
    activePointerIdRef.current = null;
    setHandTransformState(null);
    setActiveTool("hand");
  }

  function restoreTemporaryHandTool() {
    const previousTool = temporaryHandPreviousToolRef.current;
    if (!previousTool) {
      return;
    }

    temporaryHandPreviousToolRef.current = null;
    activePointerIdRef.current = null;
    setHandTransformState(null);
    setActiveTool(previousTool.tool);
    setIsCropToolPrimed(previousTool.tool === "crop" ? previousTool.isCropToolPrimed : false);
  }

  function activateTool(tool: DiagramTool) {
    temporaryHandPreviousToolRef.current = null;
    setActiveTool(tool);
    setIsCropToolPrimed(tool === "crop");
    activePointerIdRef.current = null;
    draftStrokeRef.current = null;
    draftShapeRef.current = null;
    setSelectedTarget(null);
    setSelectionBounds(null);
    setSelectionRotation(0);
    setTransformState(null);
    setCropTransformState(null);
    setHandTransformState(null);
    setDraftStroke(null);
    setDraftShape(null);
    setDraftPolygon(null);
    setPolygonCursor(null);
    setBezierStartPoint(null);
    setBezierChainOriginPoint(null);
    setBezierChainOriginOutgoingControlPoint(null);
    setBezierCursor(null);
    setBezierOutgoingControlPoint(null);
    setBezierClosingIncomingControlPoint(null);
  }

  function clearBezierChain() {
    activePointerIdRef.current = null;
    draftShapeRef.current = null;
    setDraftShape(null);
    setBezierStartPoint(null);
    setBezierChainOriginPoint(null);
    setBezierChainOriginOutgoingControlPoint(null);
    setBezierCursor(null);
    setBezierOutgoingControlPoint(null);
    setBezierClosingIncomingControlPoint(null);
  }

  function startBezierSegment(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const point = getSnappedPointerPoint(event, "bezier");
    surfaceRef.current?.focus();

    if (!bezierStartPoint) {
      setBezierStartPoint(point);
      setBezierChainOriginPoint(point);
      setBezierChainOriginOutgoingControlPoint(null);
      setBezierCursor(point);
      setBezierClosingIncomingControlPoint(null);
      return;
    }

    const closingSnapRadius = bezierChainOriginPoint
      ? Math.max(
          POLYGON_SNAP_DISTANCE,
          getDiagramHitPadding(event.currentTarget, displayFrame, 12)
        )
      : POLYGON_SNAP_DISTANCE;
    const closingToOrigin =
      bezierChainOriginPoint &&
      !pointsMatch(bezierStartPoint, bezierChainOriginPoint) &&
      distance(point, bezierChainOriginPoint) <= closingSnapRadius;
    const endPoint = closingToOrigin ? bezierChainOriginPoint : point;
    const closingIncomingControlPoint = closingToOrigin ? endPoint : null;
    setBezierClosingIncomingControlPoint(closingIncomingControlPoint);

    const nextShape = createBezierShapeFromHandlePoint(
      inkColor,
      strokeWidth,
      strokeStyle,
      startMarker,
      endMarker,
      bezierStartPoint,
      endPoint,
      endPoint,
      bezierOutgoingControlPoint,
      closingIncomingControlPoint
    );

    activePointerIdRef.current = event.pointerId;
    draftShapeRef.current = nextShape;
    setDraftShape(nextShape);

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Best effort.
    }
  }

  function extendBezierSegment(event: PointerEvent<SVGSVGElement>) {
    const point = getSnappedPointerPoint(event, "bezier");

    if (activePointerIdRef.current !== event.pointerId) {
      setBezierCursor(point);
      return;
    }

    setDraftShape((currentShape) => {
      const baseShape =
        currentShape?.kind === "bezier"
          ? currentShape
          : draftShapeRef.current?.kind === "bezier"
            ? draftShapeRef.current
            : null;

      if (!baseShape) {
        return currentShape;
      }

      const isClosingDraft =
        Boolean(bezierChainOriginPoint) &&
        pointsMatch(
          { x: baseShape.x2, y: baseShape.y2 },
          bezierChainOriginPoint as DiagramPoint
        ) &&
        !pointsMatch(
          { x: baseShape.x1, y: baseShape.y1 },
          bezierChainOriginPoint as DiagramPoint
        );

      const nextShape = isClosingDraft
        ? updateClosingBezierCreationDraft(baseShape, point)
        : updateBezierCreationDraft(baseShape, point);
      draftShapeRef.current = nextShape;
      return nextShape;
    });
  }

  function finishBezierSegment(event: PointerEvent<SVGSVGElement>, commit = true) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    const committedShape = draftShapeRef.current;
    draftShapeRef.current = null;
    setDraftShape(null);
    setBezierClosingIncomingControlPoint(null);

    if (commit && committedShape?.kind === "bezier" && shapeHasArea(committedShape)) {
      onAddShape(committedShape);
      if (
        bezierChainOriginPoint &&
        !bezierChainOriginOutgoingControlPoint &&
        pointsMatch(
          { x: committedShape.x1, y: committedShape.y1 },
          bezierChainOriginPoint
        )
      ) {
        setBezierChainOriginOutgoingControlPoint({
          x: committedShape.cx1,
          y: committedShape.cy1,
          pressure: 1
        });
      }
      if (
        bezierChainOriginPoint &&
        pointsMatch(
          { x: committedShape.x2, y: committedShape.y2 },
          bezierChainOriginPoint
        )
      ) {
        try {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }
        } catch {
          // Ignore release failures.
        }
        clearBezierChain();
        return;
      }
      const nextStart = { x: committedShape.x2, y: committedShape.y2, pressure: 1 };
      setBezierStartPoint(nextStart);
      setBezierCursor(nextStart);
      setBezierOutgoingControlPoint(
        getMirroredBezierControlPoint(
          nextStart,
          { x: committedShape.cx2, y: committedShape.cy2, pressure: 1 }
        )
      );
    }

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Ignore release failures.
    }
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

    const point = getSnappedPointerPoint(event, activeTool);
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

    const point = getSnappedPointerPoint(event, activeTool);
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

  function reorderSelection(action: DiagramReorderAction) {
    if (!selectedTarget) {
      return;
    }

    const orderedEntities = getOrderedDiagramEntities(diagram);
    const selectedIndex = orderedEntities.findIndex(
      (entity) => getDiagramEntityId(entity) === selectedTarget.id
    );

    if (selectedIndex < 0) {
      return;
    }

    if (action === "front") {
      if (selectedIndex === orderedEntities.length - 1) {
        return;
      }

      const selectedOrderEntity = orderedEntities[selectedIndex];
      const maxTimestamp = Math.max(...orderedEntities.map(getDiagramEntityTimestamp));
      applyUpdatedEntity(setDiagramEntityTimestamp(selectedOrderEntity, maxTimestamp + 1));
      return;
    }

    if (action === "back") {
      if (selectedIndex === 0) {
        return;
      }

      const selectedOrderEntity = orderedEntities[selectedIndex];
      const minTimestamp = Math.min(...orderedEntities.map(getDiagramEntityTimestamp));
      applyUpdatedEntity(setDiagramEntityTimestamp(selectedOrderEntity, minTimestamp - 1));
      return;
    }

    const swapIndex = action === "forward" ? selectedIndex + 1 : selectedIndex - 1;
    if (swapIndex < 0 || swapIndex >= orderedEntities.length) {
      return;
    }

    const selectedOrderEntity = orderedEntities[selectedIndex];
    const neighborOrderEntity = orderedEntities[swapIndex];
    const selectedTimestamp = getDiagramEntityTimestamp(selectedOrderEntity);
    const neighborTimestamp = getDiagramEntityTimestamp(neighborOrderEntity);

    applyUpdatedEntity(setDiagramEntityTimestamp(selectedOrderEntity, neighborTimestamp));
    applyUpdatedEntity(setDiagramEntityTimestamp(neighborOrderEntity, selectedTimestamp));
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
      kind: "selection",
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

  function beginBezierHandleTransform(
    handle: BezierHandleKind,
    selection: DiagramSelectionTarget,
    entity: BezierShapeEntity,
    linkedEntity: BezierShapeEntity | null,
    point: DiagramPoint,
    event: PointerEvent<SVGSVGElement>
  ) {
    activePointerIdRef.current = event.pointerId;
    setTransformState({
      kind: "bezier-handle",
      handle,
      selection,
      startPoint: point,
      originalEntity: entity,
      linkedEntity
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
    const selectedBezierEntity = isBezierShapeEntity(selectedEntity) ? selectedEntity : null;
    const bezierNeighbors = selectedBezierEntity
      ? findConnectedBezierNeighbors(diagram, selectedBezierEntity.shape)
      : null;

    if (selectedTarget && selectedBezierEntity && bezierOverlay) {
      const bezierHandle = hitTestBezierHandle(bezierOverlay, point);
      if (bezierHandle) {
        beginBezierHandleTransform(
          bezierHandle,
          selectedTarget,
          selectedBezierEntity,
          bezierHandle === "linked-start"
            ? bezierNeighbors?.previous ?? null
            : bezierHandle === "linked-end"
              ? bezierNeighbors?.next ?? null
              : null,
          point,
          event
        );
        return;
      }
    }

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
    let nextEntity: DiagramEntity = transformState.originalEntity;

    if (transformState.kind === "bezier-handle") {
      if (
        (transformState.handle === "linked-start" || transformState.handle === "linked-end") &&
        transformState.linkedEntity
      ) {
        const linkedHandle = transformState.handle === "linked-start" ? "control2" : "control1";
        applyUpdatedEntity({
          kind: "shape",
          shape: updateBezierHandle(transformState.linkedEntity.shape, linkedHandle, point)
        });
      } else {
        const localHandle =
          transformState.handle === "linked-start"
            ? "control1"
            : transformState.handle === "linked-end"
              ? "control2"
              : transformState.handle;
        const localPointBase =
          transformState.handle === "linked-start"
            ? getMirroredBezierControlPoint(
                { x: transformState.originalEntity.shape.x1, y: transformState.originalEntity.shape.y1, pressure: 1 },
                point
              )
            : transformState.handle === "linked-end"
              ? getMirroredBezierControlPoint(
                  { x: transformState.originalEntity.shape.x2, y: transformState.originalEntity.shape.y2, pressure: 1 },
                  point
                )
              : point;
        nextEntity = {
          kind: "shape",
          shape: updateBezierHandle(
            transformState.originalEntity.shape,
            localHandle,
            localPointBase
          )
        };
        setSelectionBounds(getEntityBounds(nextEntity));
        applyUpdatedEntity(nextEntity);
      }
      return;
    }

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
    pointerId: number,
    captureTarget: { setPointerCapture?: (pointerId: number) => void } | null
  ) {
    activePointerIdRef.current = pointerId;
    setCropTransformState({
      mode,
      startPoint: point,
      originalFrame: effectiveFrame
    });
    setCropDraftFrame(mode === "create" ? createCanvasFrameFromPoints(point, point) : effectiveFrame);
    setIsCropToolPrimed(false);

    try {
      captureTarget?.setPointerCapture?.(pointerId);
    } catch {
      // Best effort.
    }
  }

  function handleCropToolDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    const handleHitPadding = getDiagramHitPadding(
      event.currentTarget,
      displayFrame,
      event.pointerType === "mouse" ? 12 : 18
    );
    surfaceRef.current?.focus();
    const activeCropFrame = cropDraftFrame ?? effectiveFrame;
    const handle = isCropToolPrimed ? null : hitTestCropHandle(cropOverlay, point, handleHitPadding);

    if (handle) {
      beginCropTransform(handle, point, event.pointerId, event.currentTarget);
      return;
    }

    if (isCropToolPrimed || !pointInBounds(point, activeCropFrame, 6)) {
      beginCropTransform("create", point, event.pointerId, event.currentTarget);
      return;
    }

    if (pointInBounds(point, activeCropFrame, 6)) {
      beginCropTransform("move", point, event.pointerId, event.currentTarget);
    }
  }

  function handleCropToolMove(event: PointerEvent<SVGSVGElement>) {
    if (!cropTransformState || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = pointerEventToDiagramPoint(event, displayFrame);
    const rawNextFrame =
      cropTransformState.mode === "create"
        ? createCanvasFrameFromPoints(cropTransformState.startPoint, point)
        : cropTransformState.mode === "move"
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
    const nextFrame =
      cropTransformState.mode === "move"
        ? constrainCanvasFrameToBounds(rawNextFrame, displayFrame)
        : clipCanvasFrameToBounds(rawNextFrame, displayFrame);
    setCropDraftFrame(nextFrame);
  }

  function finishCropTool(event: PointerEvent<SVGSVGElement>, commit = true) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const nextFrame = cropDraftFrame;
    activePointerIdRef.current = null;
    setCropTransformState(null);
    setCropDraftFrame(null);

    if (commit && nextFrame) {
      commitFrame(nextFrame);
    }

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
          <InlinePaneExpandControls
            collapseLabel="Collapse diagram layout"
            expandLabel="Expand diagram layout"
            onExpandLeft={onExpandLeft}
            onExpandRight={onExpandRight}
          />
        </div>
        <div className="diagram-editor__header-dimensions" aria-label="Canvas dimensions">
          <div className="diagram-editor__zoom-controls" aria-label="Canvas zoom">
            <label className="diagram-editor__zoom-select-field">
              <span className="visually-hidden">Zoom level</span>
              <select
                aria-label="Zoom level"
                className="diagram-editor__zoom-select"
                onChange={(event) => setZoomToPercent(Number(event.target.value))}
                value={zoomSelectValue}
              >
                {ZOOM_PERCENT_STEPS.map((percent) => (
                  <option key={percent} value={percent}>
                    {percent}%
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label="Zoom tool"
              aria-pressed={activeTool === "zoom"}
              className="pane__button pane__button--compact diagram-editor__zoom-tool-button"
              onClick={() => activateTool("zoom")}
              title="Zoom"
              type="button"
            >
              <DiagramToolIcon tool="zoom" />
              <span className="visually-hidden">Zoom</span>
            </button>
            <button
              aria-label="Vertex snap"
              aria-pressed={isVertexSnapEnabled}
              className="pane__button pane__button--compact diagram-editor__zoom-tool-button"
              onClick={toggleVertexSnap}
              title={`Vertex snap (${isVertexSnapEnabled ? "on" : "off"})`}
              type="button"
            >
              <MagnetIcon />
              <span className="visually-hidden">
                {`Vertex snap ${isVertexSnapEnabled ? "on" : "off"}`}
              </span>
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

      <div className="diagram-editor__tool-strip">
        <PaletteGroup isExpanded={isExpanded} title="Tools">
          <div className="diagram-editor__toolrow" aria-label="Diagram tools">
            {DIAGRAM_TOOL_ITEMS.map(({ tool, label }) => (
              <button
                aria-label={label}
                aria-pressed={activeTool === tool}
                className="pane__button pane__button--compact diagram-editor__tool"
                key={tool}
                onClick={() => activateTool(tool)}
                title={label}
                type="button"
              >
                <DiagramToolIcon tool={tool} />
                <span className="visually-hidden">{label}</span>
              </button>
            ))}
          </div>
        </PaletteGroup>
      </div>

      <div className="diagram-editor__context-panel" aria-label="Diagram context tools">
        {hasContextControls ? (
          <div className="diagram-editor__palette diagram-editor__palette--context">
            {supportsArrangeContext ? (
              <PaletteGroup isExpanded={true} title="Arrange">
                <div className="diagram-editor__selection-actions">
                  <button
                    className="pane__button pane__button--compact"
                    onClick={() => reorderSelection("back")}
                    title="Send to back (Shift+[)"
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className="pane__button pane__button--compact"
                    onClick={() => reorderSelection("backward")}
                    title="Send backward ([)"
                    type="button"
                  >
                    Down
                  </button>
                  <button
                    className="pane__button pane__button--compact"
                    onClick={() => reorderSelection("forward")}
                    title="Bring forward (])"
                    type="button"
                  >
                    Up
                  </button>
                  <button
                    className="pane__button pane__button--compact"
                    onClick={() => reorderSelection("front")}
                    title="Bring to front (Shift+])"
                    type="button"
                  >
                    Front
                  </button>
                </div>
              </PaletteGroup>
            ) : null}
            {supportsStrokeContext ? (
              <PaletteGroup isExpanded={true} title="Stroke">
                <ColorSwatchRow
                  activeColor={inkColor}
                  ariaLabel="Stroke colors"
                  customColorInputLabel="Custom stroke color"
                  hideInlineLabel={true}
                  isCustomColor={isCustomInkColor}
                  label="Stroke"
                  onColorChange={handleStrokeColorChange}
                />
              </PaletteGroup>
            ) : null}
            {supportsFill ? (
              <PaletteGroup isExpanded={true} title="Fill">
                <ColorSwatchRow
                  activeColor={fillColor}
                  ariaLabel="Fill colors"
                  customColorInputLabel="Custom fill color"
                  hideInlineLabel={true}
                  isCustomColor={isCustomFillColor}
                  label="Fill"
                  onColorChange={handleFillColorChange}
                />
              </PaletteGroup>
            ) : null}
            {supportsStrokeInspector ? (
              <PaletteGroup isExpanded={true} title="Line">
                <StrokeInspectorMenu
                  endMarker={endMarker}
                  onEndMarkerChange={(nextMarker) => handleEndpointChange("end", nextMarker)}
                  onStartMarkerChange={(nextMarker) => handleEndpointChange("start", nextMarker)}
                  onStrokeStyleChange={handleStrokeStyleChange}
                  onStrokeWidthChange={handleStrokeWidthChange}
                  startMarker={startMarker}
                  strokeStyle={strokeStyle}
                  strokeWidth={strokeWidth}
                  supportsEndpoints={supportsEndpoints}
                />
              </PaletteGroup>
            ) : null}
          </div>
        ) : (
          <div className="diagram-editor__context-empty">No tool settings for this mode.</div>
        )}
      </div>

      <div
        className={`diagram-editor__surface ${paperView ? "diagram-editor__surface--paper" : ""} ${
          isExpanded ? "diagram-editor__surface--expanded" : "diagram-editor__surface--fixed"
        }`}
        ref={surfaceContainerRef}
        style={isExpanded ? undefined : surfaceStyle}
      >
        <svg
          aria-label="Diagram drawing surface"
          className="diagram-editor__svg"
          ref={surfaceRef}
          style={
            activeTool === "eraser"
              ? { cursor: "none", overflow: "visible" }
              : activeTool === "hand"
                ? { cursor: handTransformState ? "grabbing" : "grab", overflow: "visible" }
              : activeTool === "zoom"
                ? { cursor: zoomCursor, overflow: "visible" }
                : { overflow: "visible" }
          }
          onClick={(event) => {
            if (activeTool === "pointer") return;
            if (activeTool === "hand") return;
            if (activeTool === "crop") return;
            if (activeTool === "zoom") return;
            if (activeTool === "eraser") return;
            if (activeTool !== "polygon") return;
            const point = getSnappedPointerPoint(
              event as unknown as PointerEvent<SVGSVGElement>,
              "polygon"
            );
            setDraftPolygon((prev) => {
              if (!prev) return [point];
              const start = prev[0];
              if (prev.length >= 3 && Math.hypot(point.x - start.x, point.y - start.y) < POLYGON_SNAP_DISTANCE) {
                const shape: DiagramShape = {
                  kind: "polygon",
                  id: `shape-${createRandomId()}`,
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
            if (activeTool === "zoom") return;
            if (activeTool !== "polygon") return;
            event.preventDefault();
            setDraftPolygon((prev) => {
              if (!prev || prev.length < 3) return null;
              const shape: DiagramShape = {
                kind: "polygon",
                id: `shape-${createRandomId()}`,
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
            if (event.metaKey || event.ctrlKey || event.altKey) {
              return;
            }

            if (event.code === "Space") {
              event.preventDefault();
              if (!event.repeat) {
                activateTemporaryHandTool();
              }
              return;
            }

            if (!event.repeat) {
              const key = event.key.toLowerCase();
              const toolKeymap: Partial<Record<string, DiagramTool>> = {
                a: "pointer",
                h: "hand",
                c: "crop",
                z: "zoom",
                w: "pen",
                r: "rect",
                e: "ellipse",
                l: "line",
                b: "bezier",
                p: "polygon",
                x: "eraser"
              };
              const nextTool = toolKeymap[key];

              if (key === "m") {
                event.preventDefault();
                toggleVertexSnap();
                return;
              }

              if (key === "escape" && activeTool === "bezier") {
                event.preventDefault();
                clearBezierChain();
                return;
              }

              if (nextTool) {
                event.preventDefault();
                activateTool(nextTool);
                return;
              }
            }

            if (selectedTarget) {
              if (event.key === "]") {
                event.preventDefault();
                reorderSelection(event.shiftKey ? "front" : "forward");
                return;
              }

              if (event.key === "[") {
                event.preventDefault();
                reorderSelection(event.shiftKey ? "back" : "backward");
                return;
              }
            }

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
          onKeyUp={(event) => {
            if (event.code === "Space") {
              event.preventDefault();
              restoreTemporaryHandTool();
            }
          }}
          onBlur={() => {
            restoreTemporaryHandTool();
          }}
          onMouseLeave={() => {
            if (activeTool === "eraser") {
              handleEraserMouseLeave();
              return;
            }
            if (activeTool === "zoom") {
              setIsZoomOutModifierDown(false);
              return;
            }
            if (activeTool === "bezier") {
              if (activePointerIdRef.current === null) {
                setBezierCursor(null);
              }
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
            if (activeTool === "hand") {
              handleHandToolDown(event);
              return;
            }
            if (activeTool === "crop") {
              handleCropToolDown(event);
              return;
            }
            if (activeTool === "zoom") {
              handleZoomToolDown(event);
              return;
            }
            if (activeTool === "eraser") {
              handleEraserMouseDown(event);
              return;
            }
            if (activeTool === "bezier") {
              startBezierSegment(event);
              return;
            }
            startStroke(event);
          }}
          onPointerMove={(event) => {
            if (activeTool === "pointer") {
              handlePointerToolMove(event);
              return;
            }
            if (activeTool === "hand") {
              handleHandToolMove(event);
              return;
            }
            if (activeTool === "crop") {
              handleCropToolMove(event);
              return;
            }
            if (activeTool === "zoom") {
              handleZoomToolMove(event);
              return;
            }
            if (activeTool === "eraser") {
              handleEraserMouseMove(event);
              return;
            }
            if (activeTool === "bezier") {
              extendBezierSegment(event);
              return;
            }
            if (activeTool === "polygon") {
              const point = getSnappedPointerPoint(event, "polygon");
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
            if (activeTool === "hand") {
              finishHandTool(event);
              return;
            }
            if (activeTool === "crop") {
              finishCropTool(event);
              return;
            }
            if (activeTool === "zoom") {
              finishZoomTool(event);
              return;
            }
            if (activeTool === "eraser") {
              handleEraserMouseUp();
              return;
            }
            if (activeTool === "bezier") {
              finishBezierSegment(event);
              return;
            }
            finishStroke(event);
          }}
          onPointerCancel={(event) => {
            if (activeTool === "pointer") {
              handlePointerToolUp(event);
              return;
            }
            if (activeTool === "hand") {
              finishHandTool(event);
              return;
            }
            if (activeTool === "crop") {
              finishCropTool(event, false);
              return;
            }
            if (activeTool === "zoom") {
              finishZoomTool(event);
              return;
            }
            if (activeTool === "eraser") {
              handleEraserMouseUp();
              return;
            }
            if (activeTool === "bezier") {
              finishBezierSegment(event, false);
              return;
            }
            finishStroke(event);
          }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          tabIndex={0}
          viewBox={`${displayFrame.x} ${displayFrame.y} ${displayFrame.width} ${displayFrame.height}`}
          width="100%"
          height="100%"
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
          {orderedPreviewEntities.map((entity) =>
            entity.kind === "stroke" ? (
              <DiagramStrokePath
                key={entity.stroke.id}
                stroke={entity.stroke}
                displayColor={entity.stroke.color}
              />
            ) : (
              <DiagramShapePath key={entity.shape.id} shape={entity.shape} />
            )
          )}
          {selectionOverlay ? (
            <SelectionOverlay
              activeMode={activeSelectionMode}
              overlay={selectionOverlay}
            />
          ) : null}
          {bezierOverlay ? (
            <BezierEditOverlay activeHandle={activeBezierHandle} overlay={bezierOverlay} />
          ) : null}
          {zoomOverlay ? <ZoomOverlay overlay={zoomOverlay} /> : null}
          {draftShape ? <DiagramShapePath shape={draftShape} isDraft /> : null}
          {draftBezierOverlay ? (
            <BezierEditOverlay activeHandle={null} overlay={draftBezierOverlay} />
          ) : null}
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
        <CropViewportOverlay
          cropFrame={cropDraftFrame ?? effectiveFrame}
          displayFrame={displayFrame}
          overlay={cropOverlay}
          activeMode={cropTransformState?.mode ?? null}
          isEditable={activeTool === "crop"}
          showHandles={!isCropToolPrimed}
          viewportBox={surfaceViewportBox}
          onHandlePointerDown={(mode, event) => {
            if (!surfaceRef.current) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            surfaceRef.current.focus();
            const point = clientPointToDiagramPoint(
              surfaceRef.current,
              event.clientX,
              event.clientY,
              event.pressure,
              displayFrame
            );
            beginCropTransform(mode, point, event.pointerId, surfaceRef.current);
          }}
        />
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
  if (tool === "zoom") {
    return <DiagramIcon src={diagramZoomInIconUrl} alt="Zoom in" />;
  }

  if (tool === "hand") {
    return <DiagramIcon src={diagramHandIconUrl} alt="Hand" />;
  }

  if (tool === "pointer") {
    return <DiagramIcon src={diagramPointerIconUrl} alt="Pointer" />;
  }

  if (tool === "crop") {
    return <DiagramIcon src={diagramCropIconUrl} alt="Crop" />;
  }

  if (tool === "pen") {
    return <DiagramIcon src={diagramPenIconUrl} alt="Pen" />;
  }

  if (tool === "rect") {
    return <DiagramIcon src={diagramRectIconUrl} alt="Rectangle" />;
  }

  if (tool === "ellipse") {
    return <DiagramIcon src={diagramEllipseIconUrl} alt="Ellipse" />;
  }

  if (tool === "line") {
    return <DiagramIcon src={diagramLineIconUrl} alt="Line" />;
  }

  if (tool === "bezier") {
    return <DiagramIcon src={diagramBezierIconUrl} alt="Bezier" />;
  }

  if (tool === "polygon") {
    return <DiagramIcon src={diagramPolygonIconUrl} alt="Polygon" />;
  }

  return <DiagramIcon src={diagramDefaultIconUrl} alt="Shape" />;
}

function DiagramIcon({ src, alt }: { src: string; alt: string }) {
  const iconUrl = getPublicAssetUrl(src);

  return (
    <span
      aria-hidden="true"
      className="diagram-editor__tool-icon diagram-editor__tool-icon--mask"
      style={{
        maskImage: `url("${iconUrl}")`,
        WebkitMaskImage: `url("${iconUrl}")`
      } satisfies CSSProperties}
    />
  );
}

function getPublicAssetUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");

  if (import.meta.env.DEV) {
    return `/${normalizedPath}`;
  }

  const bundleBase = import.meta.url.slice(0, import.meta.url.lastIndexOf("/") + 1);
  return `${bundleBase}../${normalizedPath}`;
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

function EndpointIcon({
  endpoint,
  side = "end"
}: {
  endpoint: DiagramEndpoint;
  side?: "start" | "end";
}) {
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
          d={side === "start" ? "m9.5 7.8-4.8 4.2 4.8 4.2" : "m14.5 7.8 4.8 4.2-4.8 4.2"}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ) : null}
      {endpoint === "dot" ? (
        <circle cx={side === "start" ? 5 : 19} cy="12" fill="currentColor" r="2.3" />
      ) : null}
      {endpoint === "open-dot" ? (
        <circle
          cx={side === "start" ? 5 : 19}
          cy="12"
          fill="none"
          r="2.3"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      ) : null}
    </svg>
  );
}

function MagnetIcon() {
  return <DiagramIcon src={diagramMagnetIconUrl} alt="Snap" />;
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

type StrokeInspectorMenuSection = "start" | "stroke" | "end" | null;

function StrokeInspectorMenu({
  strokeStyle,
  strokeWidth,
  startMarker,
  endMarker,
  supportsEndpoints,
  onStrokeStyleChange,
  onStrokeWidthChange,
  onStartMarkerChange,
  onEndMarkerChange
}: {
  strokeStyle: DiagramStrokeStyle;
  strokeWidth: number;
  startMarker: DiagramEndpoint;
  endMarker: DiagramEndpoint;
  supportsEndpoints: boolean;
  onStrokeStyleChange: (style: DiagramStrokeStyle) => void;
  onStrokeWidthChange: (width: number) => void;
  onStartMarkerChange: (marker: DiagramEndpoint) => void;
  onEndMarkerChange: (marker: DiagramEndpoint) => void;
}) {
  const [openSection, setOpenSection] = useState<StrokeInspectorMenuSection>(null);

  useEffect(() => {
    if (openSection === null || typeof window === "undefined") {
      return;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.closest('[data-diagram-stroke-menu-root="true"]')
      ) {
        setOpenSection(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenSection(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSection]);

  return (
    <div className="diagram-editor__stroke-menu">
      {supportsEndpoints ? (
        <StrokeInspectorMenuButton
          ariaLabel="Start endpoint controls"
          isOpen={openSection === "start"}
          onToggle={() => setOpenSection((current) => (current === "start" ? null : "start"))}
          panel={
            <EndpointMenuSection
              activeMarker={startMarker}
              onMarkerChange={onStartMarkerChange}
              side="start"
              title="Start"
            />
          }
          title="Start endpoint"
        >
          <LineControlTriggerIcon
            endpoint={startMarker}
            side="start"
            strokeStyle={strokeStyle}
            strokeWidth={strokeWidth}
          />
        </StrokeInspectorMenuButton>
      ) : null}
      <StrokeInspectorMenuButton
        ariaLabel="Stroke style and width controls"
        isOpen={openSection === "stroke"}
        onToggle={() => setOpenSection((current) => (current === "stroke" ? null : "stroke"))}
        panel={
          <div className="diagram-editor__line-menu-panel">
            <div className="diagram-editor__line-menu-field">
              <div className="diagram-editor__line-menu-label">Style</div>
              <div className="diagram-editor__control-group">
                {DIAGRAM_STROKE_STYLE_ITEMS.map(({ style, label }) => (
                  <button
                    aria-label={label}
                    aria-pressed={strokeStyle === style}
                    className="pane__button pane__button--compact diagram-editor__option-button"
                    key={style}
                    onClick={() => onStrokeStyleChange(style)}
                    title={label}
                    type="button"
                  >
                    <StrokeStyleIcon style={style} />
                    <span className="visually-hidden">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="diagram-editor__line-menu-field">
              <div className="diagram-editor__line-menu-label">Width</div>
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
          </div>
        }
        title="Stroke style and width"
      >
        <LineControlTriggerIcon side="stroke" strokeStyle={strokeStyle} strokeWidth={strokeWidth} />
      </StrokeInspectorMenuButton>
      {supportsEndpoints ? (
        <StrokeInspectorMenuButton
          ariaLabel="End endpoint controls"
          isOpen={openSection === "end"}
          onToggle={() => setOpenSection((current) => (current === "end" ? null : "end"))}
          panel={
            <EndpointMenuSection
              activeMarker={endMarker}
              onMarkerChange={onEndMarkerChange}
              side="end"
              title="End"
            />
          }
          title="End endpoint"
        >
          <LineControlTriggerIcon
            endpoint={endMarker}
            side="end"
            strokeStyle={strokeStyle}
            strokeWidth={strokeWidth}
          />
        </StrokeInspectorMenuButton>
      ) : null}
    </div>
  );
}

function StrokeInspectorMenuButton({
  children,
  panel,
  isOpen,
  onToggle,
  ariaLabel,
  title
}: {
  children: ReactNode;
  panel: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  ariaLabel: string;
  title: string;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const updatePosition = () => {
      const triggerBox = triggerRef.current?.getBoundingClientRect();
      if (!triggerBox) {
        return;
      }

      const estimatedPanelWidth = 232;
      const viewportPadding = 12;
      const nextLeft = Math.min(
        Math.max(viewportPadding, triggerBox.left),
        window.innerWidth - estimatedPanelWidth - viewportPadding
      );
      setPanelPosition({
        top: Math.min(triggerBox.bottom + 6, window.innerHeight - viewportPadding),
        left: nextLeft
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  return (
    <div
      className={`menu-dropdown diagram-editor__line-menu ${isOpen ? "menu-dropdown--open" : ""}`}
      data-diagram-stroke-menu-root="true"
    >
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className="pane__button pane__button--compact diagram-editor__line-menu-trigger"
        onClick={onToggle}
        ref={triggerRef}
        title={title}
        type="button"
      >
        <span className="diagram-editor__line-menu-trigger-icon">{children}</span>
        <span aria-hidden="true" className="diagram-editor__line-menu-chevron">
          ▾
        </span>
      </button>
      {isOpen && panelPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="menu-dropdown__panel diagram-editor__line-menu-popover"
              data-diagram-stroke-menu-root="true"
              style={{
                position: "fixed",
                top: `${panelPosition.top}px`,
                left: `${panelPosition.left}px`
              }}
            >
              {panel}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function EndpointMenuSection({
  title,
  activeMarker,
  side,
  onMarkerChange
}: {
  title: string;
  activeMarker: DiagramEndpoint;
  side: "start" | "end";
  onMarkerChange: (marker: DiagramEndpoint) => void;
}) {
  return (
    <div className="diagram-editor__line-menu-panel">
      <div className="diagram-editor__line-menu-field">
        <div className="diagram-editor__line-menu-label">{title}</div>
        <div className="diagram-editor__control-group">
          {DIAGRAM_ENDPOINT_ITEMS.map(({ endpoint, label }) => (
            <button
              aria-label={`${title} ${label.toLowerCase()}`}
              aria-pressed={activeMarker === endpoint}
              className="pane__button pane__button--compact diagram-editor__option-button"
              key={`${title}-${endpoint}`}
              onClick={() => onMarkerChange(endpoint)}
              title={label}
              type="button"
            >
              <EndpointIcon endpoint={endpoint} side={side} />
              <span className="visually-hidden">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LineControlTriggerIcon({
  side,
  strokeStyle,
  strokeWidth,
  endpoint = "none"
}: {
  side: "start" | "stroke" | "end";
  strokeStyle: DiagramStrokeStyle;
  strokeWidth: number;
  endpoint?: DiagramEndpoint;
}) {
  const normalizedStrokeWidth = Math.max(1.5, Math.min(3.2, 1.25 + strokeWidth * 0.35));

  return (
    <svg aria-hidden="true" className="diagram-editor__tool-icon" viewBox="0 0 24 24">
      <path
        d="M4.5 12h15"
        fill="none"
        stroke="currentColor"
        strokeDasharray={getDashArray(strokeStyle, 1.8)}
        strokeLinecap="round"
        strokeWidth={normalizedStrokeWidth}
      />
      {side === "start" ? renderLineControlEndpoint("start", endpoint, normalizedStrokeWidth) : null}
      {side === "end" ? renderLineControlEndpoint("end", endpoint, normalizedStrokeWidth) : null}
    </svg>
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

function renderLineControlEndpoint(
  side: "start" | "end",
  endpoint: DiagramEndpoint,
  strokeWidth: number
) {
  const anchorX = side === "start" ? 4.5 : 19.5;
  const dotX = side === "start" ? 4.9 : 19.1;

  if (endpoint === "arrow") {
    const baseX = side === "start" ? anchorX + 4.8 : anchorX - 4.8;
    return (
      <path
        d={`M${baseX} 7.8 ${anchorX} 12 ${baseX} 16.2`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={Math.max(1.7, strokeWidth)}
      />
    );
  }

  if (endpoint === "dot") {
    return <circle cx={dotX} cy="12" fill="currentColor" r="2.3" />;
  }

  if (endpoint === "open-dot") {
    return (
      <circle
        cx={dotX}
        cy="12"
        fill="none"
        r="2.3"
        stroke="currentColor"
        strokeWidth={Math.max(1.6, strokeWidth * 0.9)}
      />
    );
  }

  return null;
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

interface BezierEditOverlayGeometry {
  handles: {
    start: DiagramPoint;
    control1: DiagramPoint;
    control2: DiagramPoint;
    end: DiagramPoint;
    "linked-start"?: DiagramPoint;
    "linked-end"?: DiagramPoint;
  };
}

function BezierEditOverlay({
  overlay,
  activeHandle
}: {
  overlay: BezierEditOverlayGeometry;
  activeHandle: BezierHandleKind | null;
}) {
  return (
    <>
      <line
        x1={overlay.handles.start.x}
        y1={overlay.handles.start.y}
        x2={overlay.handles.control1.x}
        y2={overlay.handles.control1.y}
        stroke="currentColor"
        strokeDasharray="4 3"
        strokeOpacity="0.7"
        strokeWidth="1.2"
        pointerEvents="none"
      />
      <line
        x1={overlay.handles.end.x}
        y1={overlay.handles.end.y}
        x2={overlay.handles.control2.x}
        y2={overlay.handles.control2.y}
        stroke="currentColor"
        strokeDasharray="4 3"
        strokeOpacity="0.7"
        strokeWidth="1.2"
        pointerEvents="none"
      />
      {overlay.handles["linked-start"] ? (
        <line
          x1={overlay.handles.start.x}
          y1={overlay.handles.start.y}
          x2={overlay.handles["linked-start"].x}
          y2={overlay.handles["linked-start"].y}
          stroke="currentColor"
          strokeDasharray="4 3"
          strokeOpacity="0.45"
          strokeWidth="1.2"
          pointerEvents="none"
        />
      ) : null}
      {overlay.handles["linked-end"] ? (
        <line
          x1={overlay.handles.end.x}
          y1={overlay.handles.end.y}
          x2={overlay.handles["linked-end"].x}
          y2={overlay.handles["linked-end"].y}
          stroke="currentColor"
          strokeDasharray="4 3"
          strokeOpacity="0.45"
          strokeWidth="1.2"
          pointerEvents="none"
        />
      ) : null}
      {(Object.entries(overlay.handles) as Array<[BezierHandleKind, DiagramPoint | undefined]>).map(
        ([handle, point]) =>
          !point ? null : handle === "control1" || handle === "control2" || handle === "linked-start" || handle === "linked-end" ? (
            <circle
              key={handle}
              cx={point.x}
              cy={point.y}
              r={SELECTION_HANDLE_RADIUS - 2}
              fill={activeHandle === handle ? "currentColor" : "var(--surface-strong)"}
              stroke="currentColor"
              strokeWidth="1.5"
              pointerEvents="none"
            />
          ) : (
            <rect
              key={handle}
              x={point.x - (SELECTION_HANDLE_RADIUS - 1)}
              y={point.y - (SELECTION_HANDLE_RADIUS - 1)}
              width={(SELECTION_HANDLE_RADIUS - 1) * 2}
              height={(SELECTION_HANDLE_RADIUS - 1) * 2}
              fill={activeHandle === handle ? "currentColor" : "var(--surface-strong)"}
              stroke="currentColor"
              strokeWidth="1.5"
              pointerEvents="none"
            />
          )
      )}
    </>
  );
}

interface CropOverlayGeometry {
  bounds: DiagramCanvasFrame;
  handles: Record<Exclude<CropTransformMode, "move" | "create">, DiagramPoint>;
}

interface ZoomOverlayGeometry {
  bounds: DiagramBounds;
}

function CropViewportOverlay({
  cropFrame,
  displayFrame,
  overlay,
  activeMode,
  isEditable,
  showHandles,
  viewportBox,
  onHandlePointerDown
}: {
  cropFrame: DiagramCanvasFrame;
  displayFrame: DiagramBounds;
  overlay: CropOverlayGeometry;
  activeMode: CropTransformMode | null;
  isEditable: boolean;
  showHandles: boolean;
  viewportBox: { left: number; top: number; width: number; height: number };
  onHandlePointerDown: (
    mode: Exclude<CropTransformMode, "move" | "create">,
    event: PointerEvent<HTMLSpanElement>
  ) => void;
}) {
  const visibleCropFrame = intersectDiagramCanvasFrames(cropFrame, displayFrame);
  const overlayOpacity = isEditable ? 0.55 : 0.28;

  if (!visibleCropFrame) {
    return (
      <div
        aria-hidden="true"
        className="diagram-editor__crop-overlay"
        style={{
          backgroundColor: `rgba(168, 168, 168, ${overlayOpacity})`
        }}
      />
    );
  }

  const cropWindowBounds = getViewportOverlayBounds(
    visibleCropFrame,
    displayFrame,
    viewportBox
  );
  const cropWindowStyle = getViewportOverlayBoundsStyle(cropWindowBounds);
  const cropRight = cropWindowBounds.left + cropWindowBounds.width;
  const cropBottom = cropWindowBounds.top + cropWindowBounds.height;
  const overlayShadeStyle = {
    backgroundColor: `rgba(168, 168, 168, ${overlayOpacity})`
  };

  return (
    <div aria-hidden="true" className="diagram-editor__crop-overlay">
      <div
        className="diagram-editor__crop-shade"
        style={{
          ...overlayShadeStyle,
          left: "0px",
          top: "0px",
          width: "100%",
          height: `${Math.max(0, cropWindowBounds.top)}px`
        }}
      />
      <div
        className="diagram-editor__crop-shade"
        style={{
          ...overlayShadeStyle,
          left: "0px",
          top: `${Math.max(0, cropWindowBounds.top)}px`,
          width: `${Math.max(0, cropWindowBounds.left)}px`,
          height: `${Math.max(0, cropWindowBounds.height)}px`
        }}
      />
      <div
        className="diagram-editor__crop-shade"
        style={{
          ...overlayShadeStyle,
          left: `${cropRight}px`,
          top: `${Math.max(0, cropWindowBounds.top)}px`,
          right: "0px",
          height: `${Math.max(0, cropWindowBounds.height)}px`
        }}
      />
      <div
        className="diagram-editor__crop-shade"
        style={{
          ...overlayShadeStyle,
          left: "0px",
          top: `${cropBottom}px`,
          width: "100%",
          bottom: "0px"
        }}
      />
      <div
        className={`diagram-editor__crop-window ${isEditable ? "diagram-editor__crop-window--editable" : ""}`}
        style={cropWindowStyle}
      />
      {isEditable && showHandles
        ? (Object.entries(overlay.handles) as Array<
            [Exclude<CropTransformMode, "move" | "create">, DiagramPoint]
          >).map(([mode, point]) => (
            <span
              key={mode}
              className={`diagram-editor__crop-handle ${activeMode === mode ? "diagram-editor__crop-handle--active" : ""}`}
              onPointerDown={(event) => onHandlePointerDown(mode, event)}
              style={getViewportOverlayPointStyle(point, displayFrame, viewportBox)}
            />
          ))
        : null}
    </div>
  );
}

function ZoomOverlay({
  overlay
}: {
  overlay: ZoomOverlayGeometry;
}) {
  return (
    <>
      <rect
        x={overlay.bounds.x}
        y={overlay.bounds.y}
        width={overlay.bounds.width}
        height={overlay.bounds.height}
        fill="color-mix(in srgb, var(--accent) 8%, transparent)"
        stroke="currentColor"
        strokeDasharray="8 5"
        strokeOpacity="0.9"
        strokeWidth="1.5"
        pointerEvents="none"
      />
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

function isBezierShapeEntity(entity: DiagramEntity | null): entity is BezierShapeEntity {
  return entity?.kind === "shape" && entity.shape.kind === "bezier";
}

function pointsMatch(
  a: Pick<DiagramPoint, "x" | "y">,
  b: Pick<DiagramPoint, "x" | "y">,
  epsilon = 0.001
) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function findConnectedBezierNeighbors(
  diagram: DiagramAsset,
  shape: Extract<DiagramShape, { kind: "bezier" }>
) {
  const beziers = getOrderedDiagramEntities(diagram).filter(isBezierShapeEntity);
  const currentIndex = beziers.findIndex((entity) => entity.shape.id === shape.id);

  if (currentIndex < 0) {
    return {
      previous: null,
      next: null
    };
  }

  let previous: BezierShapeEntity | null = null;
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = beziers[index];
    if (
      pointsMatch(
        { x: candidate.shape.x2, y: candidate.shape.y2 },
        { x: shape.x1, y: shape.y1 }
      )
    ) {
      previous = candidate;
      break;
    }
  }

  let next: BezierShapeEntity | null = null;
  for (let index = currentIndex + 1; index < beziers.length; index += 1) {
    const candidate = beziers[index];
    if (
      pointsMatch(
        { x: candidate.shape.x1, y: candidate.shape.y1 },
        { x: shape.x2, y: shape.y2 }
      )
    ) {
      next = candidate;
      break;
    }
  }

  return {
    previous,
    next
  };
}

function getOrderedDiagramEntities(diagram: DiagramAsset): DiagramEntity[] {
  return [
    ...diagram.strokes.map((stroke, index) => ({
      entity: { kind: "stroke", stroke } as DiagramEntity,
      updatedAt: Date.parse(stroke.updatedAt),
      kindOrder: 0,
      index
    })),
    ...diagram.shapes.map((shape, index) => ({
      entity: { kind: "shape", shape } as DiagramEntity,
      updatedAt: Date.parse(shape.updatedAt),
      kindOrder: 1,
      index
    }))
  ]
    .sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) {
        return a.updatedAt - b.updatedAt;
      }

      if (a.kindOrder !== b.kindOrder) {
        return a.kindOrder - b.kindOrder;
      }

      return a.index - b.index;
    })
    .map(({ entity }) => entity);
}

function getDiagramEntityId(entity: DiagramEntity): string {
  return entity.kind === "stroke" ? entity.stroke.id : entity.shape.id;
}

function getDiagramEntityTimestamp(entity: DiagramEntity): number {
  const value = Date.parse(entity.kind === "stroke" ? entity.stroke.updatedAt : entity.shape.updatedAt);
  return Number.isFinite(value) ? value : 0;
}

function setDiagramEntityTimestamp(entity: DiagramEntity, timestamp: number): DiagramEntity {
  const updatedAt = new Date(timestamp).toISOString();

  if (entity.kind === "stroke") {
    return {
      kind: "stroke",
      stroke: {
        ...entity.stroke,
        updatedAt
      }
    };
  }

  return {
    kind: "shape",
    shape: {
      ...entity.shape,
      updatedAt
    }
  };
}

function hitTestDiagramEntity(diagram: DiagramAsset, point: DiagramPoint): DiagramEntity | null {
  const orderedEntities = getOrderedDiagramEntities(diagram);

  for (const padding of [0, SELECTION_HIT_PADDING]) {
    for (let index = orderedEntities.length - 1; index >= 0; index -= 1) {
      const entity = orderedEntities[index];
      if (entity.kind === "shape") {
        if (hitTestShape(entity.shape, point, padding)) {
          return entity;
        }
        continue;
      }

      if (hitTestStroke(entity.stroke, point, padding)) {
        return entity;
      }
    }
  }

  return null;
}

function ZoomToolIcon({ isZoomOut }: { isZoomOut: boolean }) {
  return (
    <DiagramIcon
      src={isZoomOut ? diagramZoomOutIconUrl : diagramZoomInIconUrl}
      alt={isZoomOut ? "Zoom out" : "Zoom in"}
    />
  );
}

function createZoomCursorDataUrl(isZoomOut: boolean): string {
  const symbolPath = isZoomOut ? 'M7.5 10h5' : 'M7.5 10h5M10 7.5v5';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <circle cx="10" cy="10" r="5.5" fill="#ffffff" stroke="#111111" stroke-width="1.8" />
      <path d="M14 14 L20 20" fill="none" stroke="#111111" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
      <path d="${symbolPath}" fill="none" stroke="#111111" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
    </svg>
  `;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 10 10, ${isZoomOut ? "zoom-out" : "zoom-in"}`;
}

function getZoomSelectValue(zoomLevel: number): string {
  const percent = Math.round(zoomLevel * 100);
  let closest: number = ZOOM_PERCENT_STEPS[0];

  for (const step of ZOOM_PERCENT_STEPS) {
    if (Math.abs(step - percent) < Math.abs(closest - percent)) {
      closest = step;
    }
  }

  return `${closest}`;
}

function getZoomDragBounds(startPoint: DiagramPoint, currentPoint: DiagramPoint): DiagramBounds {
  const deltaX = currentPoint.x - startPoint.x;
  const deltaY = currentPoint.y - startPoint.y;
  const side = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const x = deltaX >= 0 ? startPoint.x : startPoint.x - side;
  const y = deltaY >= 0 ? startPoint.y : startPoint.y - side;

  return {
    x,
    y,
    width: side,
    height: side
  };
}

function getZoomDragOverlay(zoomDragState: ZoomDragState): ZoomOverlayGeometry {
  return {
    bounds: getZoomDragBounds(zoomDragState.startPoint, zoomDragState.currentPoint)
  };
}

function intersectDiagramCanvasFrames(
  a: DiagramCanvasFrame,
  b: DiagramBounds
): DiagramCanvasFrame | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) {
    return null;
  }

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1
  };
}

function getViewportOverlayBounds(
  bounds: DiagramBounds,
  displayFrame: DiagramBounds,
  viewportBox: { left: number; top: number; width: number; height: number }
) {
  return {
    left: viewportBox.left + ((bounds.x - displayFrame.x) / displayFrame.width) * viewportBox.width,
    top: viewportBox.top + ((bounds.y - displayFrame.y) / displayFrame.height) * viewportBox.height,
    width: (bounds.width / displayFrame.width) * viewportBox.width,
    height: (bounds.height / displayFrame.height) * viewportBox.height
  };
}

function getViewportOverlayBoundsStyle(bounds: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`
  };
}

function getViewportOverlayPointStyle(
  point: DiagramPoint,
  displayFrame: DiagramBounds,
  viewportBox: { left: number; top: number; width: number; height: number }
) {
  return {
    left: `${viewportBox.left + ((point.x - displayFrame.x) / displayFrame.width) * viewportBox.width}px`,
    top: `${viewportBox.top + ((point.y - displayFrame.y) / displayFrame.height) * viewportBox.height}px`
  };
}

function getRenderedViewportBox(
  viewportWidth: number,
  viewportHeight: number,
  viewBoxWidth: number,
  viewBoxHeight: number
) {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    viewBoxWidth <= 0 ||
    viewBoxHeight <= 0
  ) {
    return {
      left: 0,
      top: 0,
      width: viewportWidth,
      height: viewportHeight
    };
  }

  const scale = Math.min(viewportWidth / viewBoxWidth, viewportHeight / viewBoxHeight);
  const width = viewBoxWidth * scale;
  const height = viewBoxHeight * scale;

  return {
    left: (viewportWidth - width) / 2,
    top: (viewportHeight - height) / 2,
    width,
    height
  };
}

function getDiagramHitPadding(
  surface: SVGSVGElement,
  displayFrame: DiagramBounds,
  pixels: number
): number {
  const rect = surface.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return pixels;
  }

  return Math.max((displayFrame.width / rect.width) * pixels, (displayFrame.height / rect.height) * pixels);
}

function snapPointToNearestVertex(
  point: DiagramPoint,
  vertices: DiagramPoint[],
  snapRadius: number
): DiagramPoint {
  let nearestVertex: DiagramPoint | null = null;
  let nearestDistance = snapRadius;

  for (const vertex of vertices) {
    const vertexDistance = distance(point, vertex);
    if (vertexDistance <= nearestDistance) {
      nearestVertex = vertex;
      nearestDistance = vertexDistance;
    }
  }

  return nearestVertex
    ? {
        x: nearestVertex.x,
        y: nearestVertex.y,
        pressure: point.pressure
      }
    : point;
}

function getDiagramVertices(diagram: DiagramAsset): DiagramPoint[] {
  const vertices: DiagramPoint[] = [];

  for (const stroke of diagram.strokes) {
    vertices.push(...stroke.points);
  }

  for (const shape of diagram.shapes) {
    if (shape.kind === "line") {
      vertices.push(
        { x: shape.x1, y: shape.y1, pressure: 1 },
        { x: shape.x2, y: shape.y2, pressure: 1 }
      );
      continue;
    }

    if (shape.kind === "bezier") {
      vertices.push(
        { x: shape.x1, y: shape.y1, pressure: 1 },
        { x: shape.cx1, y: shape.cy1, pressure: 1 },
        { x: shape.cx2, y: shape.cy2, pressure: 1 },
        { x: shape.x2, y: shape.y2, pressure: 1 }
      );
      continue;
    }

    if (shape.kind === "polygon") {
      vertices.push(...shape.points);
      continue;
    }

    if (shape.kind === "rect") {
      vertices.push(
        { x: shape.x, y: shape.y, pressure: 1 },
        { x: shape.x + shape.width, y: shape.y, pressure: 1 },
        { x: shape.x + shape.width, y: shape.y + shape.height, pressure: 1 },
        { x: shape.x, y: shape.y + shape.height, pressure: 1 }
      );
    }
  }

  return vertices;
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

function getBezierEditOverlay(
  diagram: DiagramAsset,
  shape: Extract<DiagramShape, { kind: "bezier" }>
): BezierEditOverlayGeometry {
  const neighbors = findConnectedBezierNeighbors(diagram, shape);
  const startAnchor = { x: shape.x1, y: shape.y1, pressure: 1 };
  const endAnchor = { x: shape.x2, y: shape.y2, pressure: 1 };
  return {
    handles: {
      start: startAnchor,
      control1: { x: shape.cx1, y: shape.cy1, pressure: 1 },
      control2: { x: shape.cx2, y: shape.cy2, pressure: 1 },
      end: endAnchor,
      "linked-start": neighbors.previous
        ? { x: neighbors.previous.shape.cx2, y: neighbors.previous.shape.cy2, pressure: 1 }
        : getMirroredBezierControlPoint(startAnchor, {
            x: shape.cx1,
            y: shape.cy1,
            pressure: 1
          }),
      "linked-end": neighbors.next
        ? { x: neighbors.next.shape.cx1, y: neighbors.next.shape.cy1, pressure: 1 }
        : getMirroredBezierControlPoint(endAnchor, {
            x: shape.cx2,
            y: shape.cy2,
            pressure: 1
          })
    }
  };
}

function hitTestBezierHandle(
  overlay: BezierEditOverlayGeometry,
  point: DiagramPoint
): BezierHandleKind | null {
  let nearestHandle: BezierHandleKind | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [handle, handlePoint] of Object.entries(overlay.handles) as Array<
    [BezierHandleKind, DiagramPoint | undefined]
  >) {
    if (!handlePoint) {
      continue;
    }
    const radius = handle === "control1" || handle === "control2"
      ? SELECTION_HANDLE_RADIUS + 2
      : SELECTION_HANDLE_RADIUS + 3;
    const currentDistance = distance(handlePoint, point);
    if (currentDistance <= radius && currentDistance < nearestDistance) {
      nearestHandle = handle;
      nearestDistance = currentDistance;
    }
  }

  return nearestHandle;
}

function getCropOverlay(frame: DiagramCanvasFrame): CropOverlayGeometry {
  return {
    bounds: frame,
    handles: {
      "resize-n": { x: frame.x + frame.width / 2, y: frame.y, pressure: 1 },
      "resize-nw": { x: frame.x, y: frame.y, pressure: 1 },
      "resize-ne": { x: frame.x + frame.width, y: frame.y, pressure: 1 },
      "resize-e": { x: frame.x + frame.width, y: frame.y + frame.height / 2, pressure: 1 },
      "resize-se": { x: frame.x + frame.width, y: frame.y + frame.height, pressure: 1 },
      "resize-s": { x: frame.x + frame.width / 2, y: frame.y + frame.height, pressure: 1 },
      "resize-sw": { x: frame.x, y: frame.y + frame.height, pressure: 1 },
      "resize-w": { x: frame.x, y: frame.y + frame.height / 2, pressure: 1 }
    }
  };
}

function hitTestCropHandle(
  overlay: CropOverlayGeometry,
  point: DiagramPoint,
  padding: number
): Exclude<CropTransformMode, "move" | "create"> | null {
  let nearestHandle: Exclude<CropTransformMode, "move" | "create"> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [mode, handlePoint] of Object.entries(overlay.handles) as Array<
    [Exclude<CropTransformMode, "move" | "create">, DiagramPoint]
  >) {
    const deltaX = handlePoint.x - point.x;
    const deltaY = handlePoint.y - point.y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;

    if (Math.abs(deltaX) <= padding && Math.abs(deltaY) <= padding && distanceSquared < nearestDistance) {
      nearestHandle = mode;
      nearestDistance = distanceSquared;
    }
  }

  return nearestHandle;
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

  if (shape.kind === "bezier") {
    return boundsFromPoints(
      sampleBezierCurvePoints(shape),
      shape.strokeWidth / 2 + getEndpointPadding(shape.startMarker, shape.endMarker, shape.strokeWidth)
    );
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
    const outerHit =
      local.x >= shape.x - padding &&
      local.x <= shape.x + shape.width + padding &&
      local.y >= shape.y - padding &&
      local.y <= shape.y + shape.height + padding;

    if (!outerHit) {
      return false;
    }

    if (shapeHasVisibleFill(shape)) {
      return true;
    }

    const inset = shape.strokeWidth / 2 + padding;
    const innerLeft = shape.x + inset;
    const innerRight = shape.x + shape.width - inset;
    const innerTop = shape.y + inset;
    const innerBottom = shape.y + shape.height - inset;
    const innerHit =
      innerLeft < innerRight &&
      innerTop < innerBottom &&
      local.x > innerLeft &&
      local.x < innerRight &&
      local.y > innerTop &&
      local.y < innerBottom;

    return !innerHit;
  }

  if (shape.kind === "ellipse") {
    const local = rotatePoint(point, { x: shape.cx, y: shape.cy }, -shape.rotation);
    const outerRx = Math.max(shape.rx + shape.strokeWidth / 2 + padding, 0.0001);
    const outerRy = Math.max(shape.ry + shape.strokeWidth / 2 + padding, 0.0001);
    const outerDx = (local.x - shape.cx) / outerRx;
    const outerDy = (local.y - shape.cy) / outerRy;
    const outerHit = outerDx * outerDx + outerDy * outerDy <= 1;

    if (!outerHit) {
      return false;
    }

    if (shapeHasVisibleFill(shape)) {
      return true;
    }

    const innerRx = shape.rx - shape.strokeWidth / 2 - padding;
    const innerRy = shape.ry - shape.strokeWidth / 2 - padding;
    if (innerRx <= 0 || innerRy <= 0) {
      return true;
    }

    const innerDx = (local.x - shape.cx) / innerRx;
    const innerDy = (local.y - shape.cy) / innerRy;
    return innerDx * innerDx + innerDy * innerDy >= 1;
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

  if (shape.kind === "bezier") {
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

    const curvePoints = sampleBezierCurvePoints(shape);
    for (let index = 1; index < curvePoints.length; index += 1) {
      if (
        pointToSegmentDistance(
          point,
          curvePoints[index - 1].x,
          curvePoints[index - 1].y,
          curvePoints[index].x,
          curvePoints[index].y
        ) <=
        shape.strokeWidth / 2 + padding
      ) {
        return true;
      }
    }

    return false;
  }

  if (shapeHasVisibleFill(shape) && pointInPolygon(shape.points, point)) {
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

function shapeHasVisibleFill(shape: DiagramShape): boolean {
  return "fillColor" in shape && shape.fillColor !== EMPTY_COLOR_VALUE;
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

  if (shape.kind === "bezier") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        x1: shape.x1 + dx,
        y1: shape.y1 + dy,
        cx1: shape.cx1 + dx,
        cy1: shape.cy1 + dy,
        cx2: shape.cx2 + dx,
        cy2: shape.cy2 + dy,
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

  if (shape.kind === "bezier") {
    return {
      kind: "shape",
      shape: {
        ...shape,
        ...rotateBezier(shape, center, angleDelta),
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

  if (shape.kind === "bezier") {
    const start = scalePoint({ x: shape.x1, y: shape.y1, pressure: 1 });
    const control1 = scalePoint({ x: shape.cx1, y: shape.cy1, pressure: 1 });
    const control2 = scalePoint({ x: shape.cx2, y: shape.cy2, pressure: 1 });
    const end = scalePoint({ x: shape.x2, y: shape.y2, pressure: 1 });
    return {
      kind: "shape",
      shape: {
        ...shape,
        x1: start.x,
        y1: start.y,
        cx1: control1.x,
        cy1: control1.y,
        cx2: control2.x,
        cy2: control2.y,
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

function createCanvasFrameFromPoints(
  startPoint: DiagramPoint,
  endPoint: DiagramPoint
): DiagramCanvasFrame {
  const x = Math.min(startPoint.x, endPoint.x);
  const y = Math.min(startPoint.y, endPoint.y);

  return {
    x,
    y,
    width: Math.max(1, Math.abs(endPoint.x - startPoint.x)),
    height: Math.max(1, Math.abs(endPoint.y - startPoint.y))
  };
}

function constrainCanvasFrameToBounds(
  frame: DiagramCanvasFrame,
  bounds: DiagramBounds
): DiagramCanvasFrame {
  const width = Math.min(frame.width, bounds.width);
  const height = Math.min(frame.height, bounds.height);
  const maxX = bounds.x + bounds.width - width;
  const maxY = bounds.y + bounds.height - height;

  return normalizeCanvasFrame({
    x: clamp(frame.x, bounds.x, maxX),
    y: clamp(frame.y, bounds.y, maxY),
    width,
    height
  });
}

function clipCanvasFrameToBounds(
  frame: DiagramCanvasFrame,
  bounds: DiagramBounds
): DiagramCanvasFrame {
  const x1 = clamp(frame.x, bounds.x, bounds.x + bounds.width);
  const y1 = clamp(frame.y, bounds.y, bounds.y + bounds.height);
  const x2 = clamp(frame.x + frame.width, bounds.x, bounds.x + bounds.width);
  const y2 = clamp(frame.y + frame.height, bounds.y, bounds.y + bounds.height);

  return normalizeCanvasFrame({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1))
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
  if (mode === "resize-n") {
    const bottom = bounds.y + bounds.height;
    const y = Math.min(point.y, bottom - minSize);
    return { x: bounds.x, y, width: bounds.width, height: bottom - y };
  }

  if (mode === "resize-s") {
    const y2 = Math.max(point.y, bounds.y + minSize);
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: y2 - bounds.y };
  }

  if (mode === "resize-e") {
    const x2 = Math.max(point.x, bounds.x + minSize);
    return { x: bounds.x, y: bounds.y, width: x2 - bounds.x, height: bounds.height };
  }

  if (mode === "resize-w") {
    const right = bounds.x + bounds.width;
    const x = Math.min(point.x, right - minSize);
    return { x, y: bounds.y, width: right - x, height: bounds.height };
  }

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

function rotateBezier(
  shape: Extract<DiagramShape, { kind: "bezier" }>,
  center: DiagramPoint,
  angleDelta: number
) {
  const start = rotatePoint({ x: shape.x1, y: shape.y1 }, center, angleDelta);
  const control1 = rotatePoint({ x: shape.cx1, y: shape.cy1 }, center, angleDelta);
  const control2 = rotatePoint({ x: shape.cx2, y: shape.cy2 }, center, angleDelta);
  const end = rotatePoint({ x: shape.x2, y: shape.y2 }, center, angleDelta);
  return {
    x1: start.x,
    y1: start.y,
    cx1: control1.x,
    cy1: control1.y,
    cx2: control2.x,
    cy2: control2.y,
    x2: end.x,
    y2: end.y
  };
}

function updateBezierHandle(
  shape: Extract<DiagramShape, { kind: "bezier" }>,
  handle: "start" | "control1" | "control2" | "end",
  point: DiagramPoint
): Extract<DiagramShape, { kind: "bezier" }> {
  const updatedAt = new Date().toISOString();

  if (handle === "start") {
    const dx = point.x - shape.x1;
    const dy = point.y - shape.y1;
    return {
      ...shape,
      x1: point.x,
      y1: point.y,
      cx1: shape.cx1 + dx,
      cy1: shape.cy1 + dy,
      updatedAt
    };
  }

  if (handle === "end") {
    const dx = point.x - shape.x2;
    const dy = point.y - shape.y2;
    return {
      ...shape,
      x2: point.x,
      y2: point.y,
      cx2: shape.cx2 + dx,
      cy2: shape.cy2 + dy,
      updatedAt
    };
  }

  if (handle === "control1") {
    return {
      ...shape,
      cx1: point.x,
      cy1: point.y,
      updatedAt
    };
  }

  return {
    ...shape,
    cx2: point.x,
    cy2: point.y,
    updatedAt
  };
}

function getMirroredBezierControlPoint(
  anchor: DiagramPoint,
  controlPoint: DiagramPoint
): DiagramPoint {
  return {
    x: anchor.x + (anchor.x - controlPoint.x),
    y: anchor.y + (anchor.y - controlPoint.y),
    pressure: 1
  };
}

function getMatchingClosingStartControlPoint(
  startPoint: DiagramPoint,
  endPoint: DiagramPoint,
  endControlPoint: DiagramPoint
): DiagramPoint {
  return {
    x: startPoint.x + (endPoint.x - endControlPoint.x),
    y: startPoint.y + (endPoint.y - endControlPoint.y),
    pressure: 1
  };
}

function getLinearBezierControlPoints(start: DiagramPoint, end: DiagramPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    cx1: start.x + dx / 3,
    cy1: start.y + dy / 3,
    cx2: start.x + (dx * 2) / 3,
    cy2: start.y + (dy * 2) / 3
  };
}

function getBezierControlPointsFromHandlePoint(
  start: DiagramPoint,
  end: DiagramPoint,
  handlePoint: DiagramPoint,
  startControlPoint?: DiagramPoint | null,
  endControlPoint?: DiagramPoint | null
) {
  const base = getLinearBezierControlPoints(start, end);
  const offsetX = handlePoint.x - end.x;
  const offsetY = handlePoint.y - end.y;

  return {
    x1: start.x,
    y1: start.y,
    cx1: startControlPoint?.x ?? base.cx1,
    cy1: startControlPoint?.y ?? base.cy1,
    cx2: endControlPoint?.x ?? base.cx2 + offsetX,
    cy2: endControlPoint?.y ?? base.cy2 + offsetY,
    x2: end.x,
    y2: end.y
  };
}

function createBezierShapeFromHandlePoint(
  color: string,
  strokeWidth: number,
  strokeStyle: DiagramStrokeStyle,
  startMarker: DiagramEndpoint,
  endMarker: DiagramEndpoint,
  start: DiagramPoint,
  end: DiagramPoint,
  handlePoint: DiagramPoint,
  startControlPoint?: DiagramPoint | null,
  endControlPoint?: DiagramPoint | null
): Extract<DiagramShape, { kind: "bezier" }> {
  return {
    kind: "bezier",
    id: `shape-${createRandomId()}`,
    strokeColor: color,
    strokeWidth: clampStrokeWidthValue(strokeWidth),
    strokeStyle,
    startMarker,
    endMarker,
    ...getBezierControlPointsFromHandlePoint(
      start,
      end,
      handlePoint,
      startControlPoint,
      endControlPoint
    ),
    updatedAt: new Date().toISOString()
  };
}

function updateBezierCreationDraft(
  shape: Extract<DiagramShape, { kind: "bezier" }>,
  handlePoint: DiagramPoint
): Extract<DiagramShape, { kind: "bezier" }> {
  return {
    ...shape,
    ...getBezierControlPointsFromHandlePoint(
      { x: shape.x1, y: shape.y1, pressure: 1 },
      { x: shape.x2, y: shape.y2, pressure: 1 },
      handlePoint,
      { x: shape.cx1, y: shape.cy1, pressure: 1 }
    ),
    updatedAt: new Date().toISOString()
  };
}

function updateClosingBezierCreationDraft(
  shape: Extract<DiagramShape, { kind: "bezier" }>,
  handlePoint: DiagramPoint
): Extract<DiagramShape, { kind: "bezier" }> {
  const startPoint = { x: shape.x1, y: shape.y1, pressure: 1 };
  const endPoint = { x: shape.x2, y: shape.y2, pressure: 1 };
  const matchingStartControlPoint = getMatchingClosingStartControlPoint(
    startPoint,
    endPoint,
    handlePoint
  );
  return {
    ...shape,
    cx1: matchingStartControlPoint.x,
    cy1: matchingStartControlPoint.y,
    cx2: handlePoint.x,
    cy2: handlePoint.y,
    updatedAt: new Date().toISOString()
  };
}

function evaluateBezierPoint(
  shape: Extract<DiagramShape, { kind: "bezier" }>,
  t: number
): DiagramPoint {
  const inverse = 1 - t;
  const x =
    inverse ** 3 * shape.x1 +
    3 * inverse * inverse * t * shape.cx1 +
    3 * inverse * t * t * shape.cx2 +
    t ** 3 * shape.x2;
  const y =
    inverse ** 3 * shape.y1 +
    3 * inverse * inverse * t * shape.cy1 +
    3 * inverse * t * t * shape.cy2 +
    t ** 3 * shape.y2;
  return { x, y, pressure: 1 };
}

function sampleBezierCurvePoints(
  shape: Extract<DiagramShape, { kind: "bezier" }>,
  segments = 24
): DiagramPoint[] {
  const points: DiagramPoint[] = [];

  for (let index = 0; index <= segments; index += 1) {
    points.push(evaluateBezierPoint(shape, index / segments));
  }

  return points;
}

function getBezierCurveLength(shape: Extract<DiagramShape, { kind: "bezier" }>): number {
  const points = sampleBezierCurvePoints(shape);
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }

  return total;
}

function bezierToPathData(shape: Extract<DiagramShape, { kind: "bezier" }>): string {
  return `M ${formatNumber(shape.x1)} ${formatNumber(shape.y1)} C ${formatNumber(
    shape.cx1
  )} ${formatNumber(shape.cy1)} ${formatNumber(shape.cx2)} ${formatNumber(
    shape.cy2
  )} ${formatNumber(shape.x2)} ${formatNumber(shape.y2)}`;
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
    return `${formatNumber(unit * 0.6)} ${formatNumber(unit * 2.1)}`;
  }

  if (style === "fine-dotted") {
    return `${formatNumber(unit * 0.35)} ${formatNumber(unit * 1.25)}`;
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
  if (typeof diagram.content === "string" && /<svg[\s>]/i.test(diagram.content.trim())) {
    return diagram.content;
  }

  const frame = getDiagramFrame(diagram);
  const markerDefs = getDiagramMarkerDefsSvg();
  const entityNodes = getOrderedDiagramEntities(diagram)
    .map((entity) =>
      entity.kind === "stroke" ? strokeToSvgNode(entity.stroke) : shapeToSvgNode(entity.shape)
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${frame.x} ${frame.y} ${frame.width} ${frame.height}" fill="none">
  <defs>
${markerDefs}
  </defs>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
${entityNodes}
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
    fill: shape.kind === "line" || shape.kind === "bezier" ? "none" : shape.fillColor,
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

  if (shape.kind === "bezier") {
    return (
      <path
        d={bezierToPathData(shape)}
        markerEnd={getMarkerUrl(shape.endMarker)}
        markerStart={getMarkerUrl(shape.startMarker)}
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

  if (shape.kind === "bezier") {
    return `    <path d="${bezierToPathData(shape)}" fill="none" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}"${formatDashSvgAttribute(shape.strokeStyle, shape.strokeWidth)}${formatMarkerSvgAttributes(shape.startMarker, shape.endMarker)} />`;
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
      id: `shape-${createRandomId()}`,
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
      id: `shape-${createRandomId()}`,
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

  if (tool === "bezier") {
    return {
      kind: "bezier",
      id: `shape-${createRandomId()}`,
      strokeColor: color,
      strokeWidth: nextStrokeWidth,
      strokeStyle,
      startMarker,
      endMarker,
      ...getBezierControlPointsFromHandlePoint(point, point, point),
      updatedAt
    };
  }

  return {
    kind: "line",
    id: `shape-${createRandomId()}`,
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

  if (shape.kind === "bezier") {
    return {
      ...shape,
      ...getBezierControlPointsFromHandlePoint(
        { x: shape.x1, y: shape.y1, pressure: 1 },
        { x: shape.x2, y: shape.y2, pressure: 1 },
        point
      ),
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

  if (shape.kind === "bezier") {
    return getBezierCurveLength(shape) >= MIN_MOVEMENT;
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
    id: `stroke-${createRandomId()}`,
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
  return clientPointToDiagramPoint(
    event.currentTarget,
    event.clientX,
    event.clientY,
    event.pressure,
    _frame
  );
}

function clientPointToDiagramPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  pressure: number,
  frame: DiagramFrame
): DiagramPoint {
  const ctm = svg.getScreenCTM();

  if (ctm) {
    return {
      x: (clientX - ctm.e) / ctm.a,
      y: (clientY - ctm.f) / ctm.d,
      pressure: Number.isFinite(pressure) && pressure > 0 ? pressure : 0.5
    };
  }

  const rect = svg.getBoundingClientRect();
  const xRatio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const yRatio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;

  return {
    x: frame.x + clamp(xRatio, 0, 1) * frame.width,
    y: frame.y + clamp(yRatio, 0, 1) * frame.height,
    pressure: Number.isFinite(pressure) && pressure > 0 ? pressure : 0.5
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
