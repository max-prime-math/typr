import type {
  DiagramAsset,
  DiagramEndpoint,
  DiagramPoint,
  DiagramShape,
  DiagramStroke,
  DiagramStrokeStyle
} from "../app/appState";

const DEFAULT_DIAGRAM_VIEWBOX = { x: 0, y: 0, width: 640, height: 420 };
const DIAGRAM_VIEWBOX_PADDING = 48;
const DIAGRAM_VIEWBOX_MIN_SIZE = 144;

type DiagramEntity =
  | { kind: "stroke"; stroke: DiagramStroke }
  | { kind: "shape"; shape: DiagramShape };

interface DiagramBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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
    const points = shape.points
      .map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`)
      .join(" ");
    return `    <polygon points="${points}" fill="${shape.fillColor}" stroke="${shape.strokeColor}" stroke-width="${formatNumber(shape.strokeWidth)}"${formatDashSvgAttribute(shape.strokeStyle, shape.strokeWidth)} />`;
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

function getDiagramFrame(diagram: DiagramAsset): DiagramBounds {
  return diagram.frame ?? getDiagramAutoFrame(diagram);
}

function getDiagramAutoFrame(diagram: DiagramAsset): DiagramBounds {
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
      shape.strokeWidth / 2 +
        getEndpointPadding(shape.startMarker, shape.endMarker, shape.strokeWidth)
    );
  }

  return boundsFromPoints(
    [
      { x: shape.x1, y: shape.y1 },
      { x: shape.x2, y: shape.y2 }
    ],
    shape.strokeWidth / 2 +
      getEndpointPadding(shape.startMarker, shape.endMarker, shape.strokeWidth)
  );
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

function getRectCenter(shape: Extract<DiagramShape, { kind: "rect" }>) {
  return {
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2
  };
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

function getMarkerUrl(marker: DiagramEndpoint): string | undefined {
  const markerId = getMarkerId(marker);
  return markerId ? `url(#${markerId})` : undefined;
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

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
