import type { GraphAsset, GraphViewport } from "../app/appState";

const DEFAULT_FIGURE_HEIGHT = "35%";
const DEFAULT_FUNCTION_VIEWPORT: GraphViewport = {
  left: -10,
  right: 10,
  top: 10,
  bottom: -10
};

interface GraphSeries {
  points: Array<{ x: number; y: number }>;
  color: string;
  kind: "graph" | "scatter";
}

interface GraphExtraction {
  viewport: GraphViewport | null;
  series: GraphSeries[];
}

interface DesmosExpressionEntry {
  type?: string;
  latex?: string;
  hidden?: boolean;
  color?: string;
  style?: string;
  lineStyle?: string;
  columnMode?: string;
  columns?: Array<{
    values?: unknown[];
    latex?: string;
    color?: string;
  }>;
  points?: unknown[];
}

export interface GraphInsertResult {
  kind: "png" | "typst";
  text: string;
  supported: boolean;
}

export function buildGraphInsertResult(graph: GraphAsset): GraphInsertResult {
  return {
    kind: graph.contentType === "svg" ? "typst" : "png",
    text: `#figure(image("${buildGraphAssetPath(graph.name)}"))`,
    supported: graph.content.byteLength > 0
  };
}

export function buildGraphDownloadFilename(graph: GraphAsset): string {
  if (graph.renderMode === "typst") {
    const baseName = graph.name.replace(/\.(png|svg)$/i, "");
    return `${baseName || graph.name}.typ`;
  }

  return graph.name;
}

export function buildGraphDownloadBlob(graph: GraphAsset): Blob {
  if (graph.renderMode === "typst") {
    return new Blob([buildGraphInsertResult(graph).text], { type: "text/plain;charset=utf-8" });
  }

  const pngBuffer = graph.content.buffer.slice(
    graph.content.byteOffset,
    graph.content.byteOffset + graph.content.byteLength
  ) as ArrayBuffer;

  return new Blob([pngBuffer], {
    type: graph.contentType === "svg" ? "image/svg+xml" : "image/png"
  });
}

export function buildGraphTypstFigure(graph: GraphAsset): string | null {
  if (graph.content.byteLength === 0) {
    return null;
  }

  return `#figure(image("${buildGraphAssetPath(graph.name)}"))`;
}

function extractGraphExtraction(graph: GraphAsset): GraphExtraction | null {
  const expressions = parseGraphExpressions(graph.expressions);
  const series: GraphSeries[] = [];
  const samplingViewport = graph.viewport ?? DEFAULT_FUNCTION_VIEWPORT;

  for (const expression of expressions) {
    if (!expression || expression.hidden) {
      continue;
    }

    if (expression.type === "table" && Array.isArray(expression.columns)) {
      series.push(...extractSeriesFromTable(expression));
      continue;
    }

    const functionSeries = extractFunctionSeries(expression, samplingViewport);
    if (functionSeries) {
      series.push(functionSeries);
      continue;
    }

    const point = extractPointFromExpression(expression);
    if (point) {
      series.push({
        points: [point],
        color: safeColor(expression.color),
        kind: "scatter"
      });
    }
  }

  return {
    viewport: graph.viewport,
    series
  };
}

function extractSeriesFromTable(expression: DesmosExpressionEntry): GraphSeries[] {
  const columns = expression.columns ?? [];
  if (columns.length < 2) {
    return [];
  }

  const xValues = normalizeNumericValues(columns[0]?.values ?? []);
  const result: GraphSeries[] = [];

  for (let columnIndex = 1; columnIndex < columns.length; columnIndex += 1) {
    const yValues = normalizeNumericValues(columns[columnIndex]?.values ?? []);
    const points = xValues
      .map((xValue, index) => {
        const yValue = yValues[index];
        if (typeof yValue !== "number") {
          return null;
        }

        return { x: xValue, y: yValue };
      })
      .filter((point): point is { x: number; y: number } => point !== null);

    if (points.length === 0) {
      continue;
    }

    result.push({
      points,
      color: safeColor(columns[columnIndex]?.color ?? expression.color),
      kind: shouldRenderAsScatter(expression) || points.length === 1 ? "scatter" : "graph"
    });
  }

  return result;
}

function extractPointFromExpression(
  expression: DesmosExpressionEntry
): { x: number; y: number } | null {
  if (!expression.latex) {
    return null;
  }

  const pointMatch = /^\\left\(\s*([^,]+)\s*,\s*([^)]+)\s*\\right\)$/u.exec(
    expression.latex
  );

  if (!pointMatch) {
    return null;
  }

  const x = Number(pointMatch[1]);
  const y = Number(pointMatch[2]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function extractFunctionSeries(
  expression: DesmosExpressionEntry,
  viewport: GraphViewport
): GraphSeries | null {
  if (!expression.latex) {
    return null;
  }

  const parsed = parseDesmosFunctionExpression(expression.latex);
  if (!parsed) {
    return null;
  }

  const samples = sampleFunction(parsed, viewport);
  if (samples.length === 0) {
    return null;
  }

  return {
    points: samples,
    color: safeColor(expression.color),
    kind: "graph"
  };
}

function parseDesmosFunctionExpression(
  latex: string
): { axis: "x" | "y"; expression: string } | null {
  const normalized = latex.replace(/\s+/g, "");
  const functionMatch = /^(y|x)=(.+)$/.exec(normalized);

  if (!functionMatch) {
    return null;
  }

  return {
    axis: functionMatch[1] as "x" | "y",
    expression: functionMatch[2]
  };
}

function sampleFunction(
  parsed: { axis: "x" | "y"; expression: string },
  viewport: GraphViewport
): Array<{ x: number; y: number }> {
  const steps = 160;
  const points: Array<{ x: number; y: number }> = [];
  const evaluator = buildFunctionEvaluator(parsed.expression);

  if (!evaluator) {
    return [];
  }

  if (parsed.axis === "y") {
    const min = viewport.left;
    const max = viewport.right;

    for (let index = 0; index <= steps; index += 1) {
      const x = min + ((max - min) * index) / steps;
      const y = evaluator(x);
      if (Number.isFinite(y)) {
        points.push({ x, y });
      }
    }

    return points;
  }

  const min = viewport.bottom;
  const max = viewport.top;

  for (let index = 0; index <= steps; index += 1) {
    const y = min + ((max - min) * index) / steps;
    const x = evaluator(y);
    if (Number.isFinite(x)) {
      points.push({ x, y });
    }
  }

  return points;
}

function buildFunctionEvaluator(expression: string): ((x: number) => number) | null {
  try {
    const jsExpression = translateDesmosLatexToJs(expression);
    // The expression string is user-authored graph input, but we only expose x plus Math.
    const evaluator = new Function(
      "x",
      `const { abs, acos, asin, atan, atan2, ceil, cos, exp, floor, log, log10, max, min, pow, round, sin, sqrt, tan, PI, E } = Math; return ${jsExpression};`
    ) as (x: number) => number;

    return (x: number) => {
      const value = evaluator(x);
      return typeof value === "number" ? value : Number(value);
    };
  } catch {
    return null;
  }
}

function translateDesmosLatexToJs(expression: string): string {
  let result = expression;

  result = result.replace(/\\left|\\right/g, "");
  result = result.replace(/\\cdot/g, "*");
  result = result.replace(/\\times/g, "*");
  result = result.replace(/\^\{([^}]+)\}/g, "**($1)");
  result = result.replace(/\^([A-Za-z0-9.]+)/g, "**$1");

  const replacements: Array<[RegExp, string]> = [
    [/\\sin/g, "sin"],
    [/\\cos/g, "cos"],
    [/\\tan/g, "tan"],
    [/\\sqrt/g, "sqrt"],
    [/\\abs/g, "abs"],
    [/\\ln/g, "log"],
    [/\\log/g, "log10"],
    [/\\pi/g, "PI"],
    [/\bpi\b/g, "PI"],
    [/\be\b/g, "E"]
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(/([A-Za-z0-9_)\]])\s*\(/g, "$1(");

  return result;
}

function shouldRenderAsScatter(expression: DesmosExpressionEntry): boolean {
  const style = (expression.style ?? expression.lineStyle ?? "").toUpperCase();
  return style.includes("POINT");
}

function parseGraphExpressions(rawExpressions: string): DesmosExpressionEntry[] {
  try {
    const parsed = JSON.parse(rawExpressions) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is DesmosExpressionEntry => Boolean(entry))
      : [];
  } catch {
    return [];
  }
}

function buildAxisSnippet(extraction: GraphExtraction): string {
  const viewport = extraction.viewport ?? deriveViewportFromSeries(extraction.series);
  const xStep = chooseStep(viewport.right - viewport.left);
  const yStep = chooseStep(viewport.top - viewport.bottom);

  return [
    `#let x_axis = axis(min: ${formatTypstNumber(viewport.left)}, max: ${formatTypstNumber(
      viewport.right
    )}, step: ${formatTypstNumber(xStep)}, location: "bottom", helper_lines: true)`,
    `#let y_axis = axis(min: ${formatTypstNumber(viewport.bottom)}, max: ${formatTypstNumber(
      viewport.top
    )}, step: ${formatTypstNumber(yStep)}, location: "left", helper_lines: true)`
  ].join("\n");
}

function deriveViewportFromSeries(series: GraphSeries[]): GraphViewport {
  const points = series.flatMap((entry) => entry.points);

  if (points.length === 0) {
    return {
      left: -10,
      right: 10,
      top: 10,
      bottom: -10
    };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPadding = Math.max(1, (xMax - xMin) * 0.15 || 1);
  const yPadding = Math.max(1, (yMax - yMin) * 0.15 || 1);

  return {
    left: xMin - xPadding,
    right: xMax + xPadding,
    top: yMax + yPadding,
    bottom: yMin - yPadding
  };
}

function chooseStep(range: number): number {
  if (!Number.isFinite(range) || range <= 0) {
    return 1;
  }

  const roughStep = range / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const scaled = roughStep / magnitude;
  const bucket = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return bucket * magnitude;
}

function normalizeNumericValues(values: unknown[]): number[] {
  return values
    .map((value) => Number(value))
    .filter((value): value is number => Number.isFinite(value));
}

function formatPointArray(points: Array<{ x: number; y: number }>): string {
  return `(${points.map((point) => `(${formatTypstNumber(point.x)}, ${formatTypstNumber(point.y)})`).join(", ")})`;
}

function formatTypstNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return Number(value.toFixed(6)).toString();
}

function typstColorLiteral(color: string): string {
  const normalized = safeColor(color);
  return `rgb("${normalized}")`;
}

function buildGraphSvgMarkup(extraction: GraphExtraction): string {
  const viewport = extraction.viewport ?? deriveViewportFromSeries(extraction.series);
  const width = 1000;
  const height = 700;
  const margin = 72;
  const plotWidth = width - margin * 2;
  const plotHeight = height - margin * 2;
  const xRange = viewport.right - viewport.left || 1;
  const yRange = viewport.top - viewport.bottom || 1;
  const xStep = chooseStep(xRange);
  const yStep = chooseStep(yRange);

  const mapX = (x: number) => margin + ((x - viewport.left) / xRange) * plotWidth;
  const mapY = (y: number) => margin + ((viewport.top - y) / yRange) * plotHeight;
  const xAxisY = viewport.bottom <= 0 && viewport.top >= 0 ? mapY(0) : null;
  const yAxisX = viewport.left <= 0 && viewport.right >= 0 ? mapX(0) : null;

  const gridLines = [
    ...buildVerticalGridLines(viewport.left, viewport.right, xStep).map((x) => {
      const screenX = mapX(x);
      return `<line x1="${formatSvgNumber(screenX)}" y1="${margin}" x2="${formatSvgNumber(
        screenX
      )}" y2="${formatSvgNumber(height - margin)}" stroke="#d9d9d9" stroke-width="1" />`;
    }),
    ...buildHorizontalGridLines(viewport.bottom, viewport.top, yStep).map((y) => {
      const screenY = mapY(y);
      return `<line x1="${margin}" y1="${formatSvgNumber(screenY)}" x2="${formatSvgNumber(
        width - margin
      )}" y2="${formatSvgNumber(screenY)}" stroke="#d9d9d9" stroke-width="1" />`;
    })
  ];

  const axes = [
    xAxisY === null
      ? null
      : `<line x1="${margin}" y1="${formatSvgNumber(xAxisY)}" x2="${formatSvgNumber(
          width - margin
        )}" y2="${formatSvgNumber(xAxisY)}" stroke="#7a7a7a" stroke-width="1.5" />`,
    yAxisX === null
      ? null
      : `<line x1="${formatSvgNumber(yAxisX)}" y1="${margin}" x2="${formatSvgNumber(
          yAxisX
        )}" y2="${formatSvgNumber(height - margin)}" stroke="#7a7a7a" stroke-width="1.5" />`
  ].filter((entry): entry is string => Boolean(entry));

  const seriesMarkup = extraction.series.flatMap((series) => {
    const color = safeColor(series.color);
    const screenPoints = series.points
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => ({
        x: mapX(point.x),
        y: mapY(point.y)
      }));

    if (screenPoints.length === 0) {
      return [];
    }

    if (series.kind === "scatter" || screenPoints.length === 1) {
      return screenPoints.map(
        (point) =>
          `<circle cx="${formatSvgNumber(point.x)}" cy="${formatSvgNumber(point.y)}" r="4" fill="${color}" />`
      );
    }

    const path = screenPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)}`)
      .join(" ");

    return [
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
    ];
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Graph">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />`,
    `<g shape-rendering="geometricPrecision">`,
    ...gridLines,
    ...axes,
    ...seriesMarkup,
    `</g>`,
    `</svg>`
  ].join("\n");
}

function buildVerticalGridLines(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(step) || step <= 0) {
    return [];
  }

  const start = Math.ceil(min / step) * step;
  const lines: number[] = [];

  for (let value = start; value <= max; value += step) {
    if (Number.isFinite(value)) {
      lines.push(value);
    }
  }

  return lines;
}

function buildHorizontalGridLines(min: number, max: number, step: number): number[] {
  return buildVerticalGridLines(min, max, step);
}

function safeColor(color: string | undefined): string {
  if (!color) {
    return "#000000";
  }

  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  return "#000000";
}

function buildGraphAssetPath(fileName: string): string {
  return `figures/${fileName}`;
}

function formatSvgNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return Number(value.toFixed(3)).toString();
}
