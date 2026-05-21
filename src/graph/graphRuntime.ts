import gnuplotWasmUrl from "gnuplot-wasm/src/gnuplot.wasm?url";
import type { GraphStyle } from "../app/appState";

interface PlotlyFigureSpec {
  data?: unknown[];
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface PlotlyFunctionSpec {
  axis: "x" | "y";
  expression: string;
  domainStart: number;
  domainEnd: number;
  samples: number;
}

interface PlotlyModule {
  newPlot(
    container: HTMLElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>
  ): Promise<unknown>;
  toImage(
    container: HTMLElement,
    options: { format: "svg" | "png"; width?: number; height?: number }
  ): Promise<string>;
  purge(container: HTMLElement): void;
}

interface GnuplotResult {
  render(script: string): { svg: string };
}

type GnuplotFactory = (options?: { locateFile?: (fileName: string) => string }) => Promise<GnuplotResult>;

let plotlyPromise: Promise<PlotlyModule> | null = null;
let gnuplotPromise: Promise<GnuplotFactory> | null = null;

export async function loadPlotly(): Promise<PlotlyModule> {
  if (!plotlyPromise) {
    plotlyPromise = import("plotly.js-dist-min").then((module) => {
      const plotly = (module as unknown as { default?: PlotlyModule }).default ?? (module as unknown as PlotlyModule);
      return plotly;
    });
  }

  return plotlyPromise;
}

export async function loadGnuplot(): Promise<GnuplotFactory> {
  if (!gnuplotPromise) {
    gnuplotPromise = import("gnuplot-wasm").then(
      (module) => (module as unknown as { default: GnuplotFactory }).default
    );
  }

  return gnuplotPromise;
}

export function parsePlotlySource(source: string, style: GraphStyle): PlotlyFigureSpec {
  const functionSpec = parsePlotlyFunctionSource(source);
  if (functionSpec) {
    return buildPlotlyFunctionFigure(functionSpec, style);
  }

  try {
    const parsed = JSON.parse(source) as PlotlyFigureSpec;
    return {
      data: applyPlotlyStyle(Array.isArray(parsed?.data) ? parsed.data : [], style),
      layout: applyPlotlyLayout(parsed?.layout ?? {}, style),
      config: parsed?.config ?? {}
    };
  } catch {
    return {
      data: [],
      layout: applyPlotlyLayout({}, style),
      config: {}
    };
  }
}

function parsePlotlyFunctionSource(source: string): PlotlyFunctionSpec | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const equationLine = lines[0] ?? "";
  const equationMatch = /^(y|x)\s*=\s*(.+)$/i.exec(equationLine);
  if (!equationMatch) {
    return null;
  }

  let domainStart = -10;
  let domainEnd = 10;
  let samples = 200;

  for (const line of lines.slice(1)) {
    const domainMatch = /^domain\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|to|-)\s*(-?\d+(?:\.\d+)?)$/i.exec(
      line
    );
    if (domainMatch) {
      domainStart = Number(domainMatch[1]);
      domainEnd = Number(domainMatch[2]);
      continue;
    }

    const samplesMatch = /^samples\s*:\s*(\d+)$/i.exec(line);
    if (samplesMatch) {
      samples = Math.max(10, Number(samplesMatch[1]));
    }
  }

  if (!Number.isFinite(domainStart) || !Number.isFinite(domainEnd) || domainStart === domainEnd) {
    domainStart = -10;
    domainEnd = 10;
  }

  return {
    axis: equationMatch[1].toLowerCase() as "x" | "y",
    expression: equationMatch[2].trim(),
    domainStart,
    domainEnd,
    samples
  };
}

function buildPlotlyFunctionFigure(spec: PlotlyFunctionSpec, style: GraphStyle): PlotlyFigureSpec {
  const evaluator = buildFunctionEvaluator(spec.expression);
  if (!evaluator) {
    return { data: [], layout: {}, config: {} };
  }

  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index <= spec.samples; index += 1) {
    const t = spec.domainStart + ((spec.domainEnd - spec.domainStart) * index) / spec.samples;
    if (spec.axis === "y") {
      const y = evaluator(t);
      if (Number.isFinite(y)) {
        points.push({ x: t, y });
      }
    } else {
      const x = evaluator(t);
      if (Number.isFinite(x)) {
        points.push({ x, y: t });
      }
    }
  }

  return {
    data: [
      {
        x: points.map((point) => point.x),
        y: points.map((point) => point.y),
        mode: "lines",
        type: "scatter",
        line: { color: "#000000", width: style.strokeWidth }
      }
    ],
    layout: applyPlotlyLayout(
      {
        width: style.width,
        height: style.height
      },
      style
    ),
    config: {
      responsive: true,
      displayModeBar: false
    }
  };
}

function buildFunctionEvaluator(expression: string): ((value: number) => number) | null {
  try {
    const jsExpression = translateFunctionExpression(expression);
    const evaluator = new Function(
      "x",
      `const { abs, acos, asin, atan, atan2, ceil, cos, exp, floor, log, log10, max, min, pow, round, sin, sqrt, tan, PI, E } = Math; return ${jsExpression};`
    ) as (x: number) => number;

    return (value: number) => {
      const result = evaluator(value);
      return typeof result === "number" ? result : Number(result);
    };
  } catch {
    return null;
  }
}

function translateFunctionExpression(expression: string): string {
  let result = expression.replace(/\s+/g, "");
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

  return result;
}

function applyPlotlyStyle(data: unknown[], style: GraphStyle): unknown[] {
  return data.map((trace) => {
    if (!trace || typeof trace !== "object") {
      return trace;
    }

    const candidate = trace as Record<string, unknown>;
    const nextTrace: Record<string, unknown> = { ...candidate };
    const line = (candidate.line as Record<string, unknown> | undefined) ?? {};
    nextTrace.line = {
      ...line,
      width:
        typeof line.width === "number" && Number.isFinite(line.width)
          ? Math.max(line.width, style.strokeWidth)
          : style.strokeWidth
    };
    return nextTrace;
  });
}

function applyPlotlyLayout(
  layout: Record<string, unknown>,
  style: GraphStyle
): Record<string, unknown> {
  return {
    ...layout,
    width: style.width,
    height: style.height,
    margin: { l: 42, r: 18, t: 18, b: 36 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: {
      zeroline: true,
      gridcolor: "#d9d9d9",
      title: { text: style.xAxisLabel }
    },
    yaxis: {
      zeroline: true,
      gridcolor: "#d9d9d9",
      title: { text: style.yAxisLabel }
    }
  };
}

export async function renderPlotlyFigure(
  container: HTMLElement,
  source: string,
  style: GraphStyle
): Promise<void> {
  const plotly = await loadPlotly();
  const figure = parsePlotlySource(source, style);

  plotly.purge(container);
  await plotly.newPlot(container, figure.data ?? [], figure.layout, figure.config);
}

export async function capturePlotlySvg(
  container: HTMLElement,
  width = 1400,
  height = 900
): Promise<string> {
  const plotly = await loadPlotly();
  return plotly.toImage(container, { format: "svg", width, height });
}

export async function capturePlotlyDataUri(
  container: HTMLElement,
  format: "svg" | "png",
  width = 1400,
  height = 900
): Promise<string> {
  const plotly = await loadPlotly();
  return plotly.toImage(container, { format, width, height });
}

export async function renderGnuplotSvg(source: string, style: GraphStyle): Promise<string> {
  const gnuplotFactory = await loadGnuplot();
  const { render } = await gnuplotFactory({
    locateFile: () => gnuplotWasmUrl
  });

  return render(buildGnuplotScript(source, style)).svg;
}

function buildGnuplotScript(source: string, style: GraphStyle): string {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const body = lines.filter((line) => !/^set\s+(xlabel|ylabel|samples|grid|key)/i.test(line));
  const plotLines = body.length > 0 ? body : [source];
  const arrowSettings = style.axisArrows
    ? [
        'set arrow from graph 0.98,0 to graph 1.05,0 heads filled size screen 0.02,15,45 lc rgb "#666666"',
        'set arrow from graph 0,0.98 to graph 0,1.05 heads filled size screen 0.02,15,45 lc rgb "#666666"'
      ]
    : [];

  return [
    `set terminal svg size ${Math.max(100, Math.round(style.width))},${Math.max(
      100,
      Math.round(style.height)
    )} enhanced background rgb "transparent"`,
    `set samples 400`,
    `set grid`,
    `set border lw ${Math.max(1, style.strokeWidth)}`,
    `set xlabel "${escapeGnuplotLabel(style.xAxisLabel)}"`,
    `set ylabel "${escapeGnuplotLabel(style.yAxisLabel)}"`,
    ...arrowSettings,
    ...plotLines
  ].join("\n");
}

function escapeGnuplotLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}

export async function svgTextToPngBytes(svgText: string): Promise<Uint8Array> {
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth || image.width || 1);
    canvas.height = Math.max(1, image.naturalHeight || image.height || 1);
    const context = canvas.getContext("2d");

    if (!context) {
      return new Uint8Array();
    }

    context.drawImage(image, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) {
      return new Uint8Array();
    }

    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decoratePngDataUri(
  dataUri: string,
  style: GraphStyle
): Promise<string> {
  const image = await loadImage(dataUri);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth || image.width || style.width);
  canvas.height = Math.max(1, image.naturalHeight || image.height || style.height);
  const context = canvas.getContext("2d");

  if (!context) {
    return dataUri;
  }

  context.drawImage(image, 0, 0);
  context.strokeStyle = "#666666";
  context.fillStyle = "#666666";
  context.lineWidth = Math.max(1, style.strokeWidth);
  context.font = "16px sans-serif";

  if (style.axisArrows) {
    drawArrow(context, canvas.width - 26, canvas.height / 2, canvas.width - 6, canvas.height / 2);
    drawArrow(context, canvas.width / 2, 26, canvas.width / 2, 6);
  }

  if (style.xAxisLabel) {
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(style.xAxisLabel, canvas.width / 2, canvas.height - 8);
  }

  if (style.yAxisLabel) {
    context.save();
    context.translate(14, canvas.height / 2);
    context.rotate(-Math.PI / 2);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(style.yAxisLabel, 0, 0);
    context.restore();
  }

  const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!pngBlob) {
    return dataUri;
  }

  return await blobToDataUri(pngBlob);
}

export async function decoratePngBytes(
  pngBytes: Uint8Array,
  style: GraphStyle
): Promise<Uint8Array> {
  const arrayBuffer = pngBytes.buffer.slice(
    pngBytes.byteOffset,
    pngBytes.byteOffset + pngBytes.byteLength
  );
  const dataUri = await blobToDataUri(new Blob([arrayBuffer as ArrayBuffer], { type: "image/png" }));
  const decorated = await decoratePngDataUri(dataUri, style);
  const response = await fetch(decorated);
  return new Uint8Array(await response.arrayBuffer());
}

function drawArrow(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLength = 8;

  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();

  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  context.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  context.closePath();
  context.fill();
}

async function blobToDataUri(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to rasterize SVG."));
    image.src = source;
  });
}
