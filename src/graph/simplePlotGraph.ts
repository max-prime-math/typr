export interface SimplePlotGraphStyle {
  width: number;
  height: number;
  strokeWidth: number;
  xAxisLabel: string;
  yAxisLabel: string;
  xTickStep: number;
  yTickStep: number;
  showGrid: boolean;
  showOnlyGreatestTickLabel: boolean;
}

export interface SimplePlotFunctionEntry {
  expression: string;
  visible: boolean;
  color?: string;
  lineStyle?: SimplePlotLineStyle;
  startArrow?: SimplePlotArrowStyle;
  endArrow?: SimplePlotArrowStyle;
  samples?: number;
}

export type SimplePlotLineStyle = "solid" | "dashed" | "dotted";
export type SimplePlotArrowStyle = "none" | "arrow";

export interface SimplePlotWindow {
  xmin: number;
  xmax: number;
  xscl: number;
  ymin: number;
  ymax: number;
  yscl: number;
}

export interface SimplePlotGraphDocument {
  version: 1;
  functions: SimplePlotFunctionEntry[];
  window: SimplePlotWindow;
}

interface StoredSimplePlotGraphDocument {
  version?: unknown;
  functions?: unknown;
  window?: unknown;
}

type ExpressionNode =
  | { kind: "number"; value: number }
  | { kind: "variable" }
  | { kind: "constant"; name: "pi" | "e" }
  | { kind: "unary"; operator: "+" | "-"; argument: ExpressionNode }
  | {
      kind: "binary";
      operator: "+" | "-" | "*" | "/" | "^";
      left: ExpressionNode;
      right: ExpressionNode;
    }
  | { kind: "call"; name: SupportedFunctionName; argument: ExpressionNode };

type SupportedFunctionName =
  | "sin"
  | "cos"
  | "tan"
  | "sqrt"
  | "abs"
  | "ln"
  | "log"
  | "exp";

interface Token {
  kind: "number" | "identifier" | "operator" | "paren";
  value: string;
}

export interface ParsedSimplePlotFunction {
  originalExpression: string;
  normalizedExpression: string;
  typstExpression: string;
  evaluate: (x: number) => number;
}

export interface SimplePlotFunctionAnalysis {
  entry: SimplePlotFunctionEntry;
  parsed: ParsedSimplePlotFunction | null;
  error: string | null;
  color: string;
}

export const SIMPLE_PLOT_PACKAGE_VERSION = "0.8.0";
export const SIMPLE_PLOT_PACKAGE_IMPORT = `@preview/simple-plot:${SIMPLE_PLOT_PACKAGE_VERSION}`;
export const SIMPLE_PLOT_LINE_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#ec4899"
] as const;

const DEFAULT_FUNCTION_SAMPLES = 100;
const MIN_FUNCTION_SAMPLES = 10;
const MAX_FUNCTION_SAMPLES = 2000;
const MAX_STYLED_LINE_SAMPLES = 200;

const DEFAULT_FUNCTIONS: SimplePlotFunctionEntry[] = [
  { expression: "y = x^2", visible: true, samples: DEFAULT_FUNCTION_SAMPLES },
  { expression: "y = sin(x)", visible: true, samples: DEFAULT_FUNCTION_SAMPLES },
  { expression: "", visible: true, samples: DEFAULT_FUNCTION_SAMPLES }
];

const DEFAULT_WINDOW: SimplePlotWindow = {
  xmin: -10,
  xmax: 10,
  xscl: 1,
  ymin: -10,
  ymax: 10,
  yscl: 1
};

const FUNCTION_NAME_SET = new Set<SupportedFunctionName>([
  "sin",
  "cos",
  "tan",
  "sqrt",
  "abs",
  "ln",
  "log",
  "exp"
]);

export function createDefaultSimplePlotSource(): string {
  return serializeSimplePlotGraphDocument({
    version: 1,
    functions: DEFAULT_FUNCTIONS,
    window: DEFAULT_WINDOW
  });
}

export function parseSimplePlotGraphDocument(source: string): SimplePlotGraphDocument {
  try {
    const parsed = JSON.parse(source) as StoredSimplePlotGraphDocument;

    if (parsed && parsed.version === 1) {
      return normalizeSimplePlotGraphDocument(parsed);
    }
  } catch {
    // Fall through to migration path.
  }

  return migrateLegacyGraphSource(source);
}

export function serializeSimplePlotGraphDocument(document: SimplePlotGraphDocument): string {
  return JSON.stringify(normalizeSimplePlotGraphDocument(document));
}

export function analyzeSimplePlotFunctions(
  document: SimplePlotGraphDocument
): SimplePlotFunctionAnalysis[] {
  return document.functions.map((entry, index) => {
    const color = SIMPLE_PLOT_LINE_COLORS[index % SIMPLE_PLOT_LINE_COLORS.length];
    const trimmedExpression = entry.expression.trim();

    if (!trimmedExpression) {
      return {
        entry,
        parsed: null,
        error: null,
        color: entry.color?.trim() || color
      };
    }

    try {
      return {
        entry,
        parsed: parseFunctionExpression(trimmedExpression),
        error: null,
        color: entry.color?.trim() || color
      };
    } catch (error) {
      return {
        entry,
        parsed: null,
        error: error instanceof Error ? error.message : "Invalid function.",
        color: entry.color?.trim() || color
      };
    }
  });
}

export function buildSimplePlotFigureSource(
  document: SimplePlotGraphDocument,
  style: SimplePlotGraphStyle
): string {
  const normalizedDocument = normalizeSimplePlotGraphDocument(document);
  const normalizedStyle = normalizeSimplePlotStyle(style);
  const plotLines: string[] = [];
  const functionLines = analyzeSimplePlotFunctions(normalizedDocument)
    .filter((analysis) => analysis.entry.visible && analysis.parsed)
    .flatMap((analysis) =>
      buildFunctionPlotLines(analysis, normalizedDocument.window, normalizedStyle.strokeWidth)
    );
  const endpointLines = analyzeSimplePlotFunctions(normalizedDocument)
    .filter((analysis) => analysis.entry.visible && analysis.parsed)
    .flatMap((analysis) =>
      buildArrowMarkerLines(analysis, normalizedDocument.window, normalizedStyle.strokeWidth)
    );

  const showGrid = normalizedStyle.showGrid ? '"major"' : "false";
  const xAxisLabel = normalizedStyle.xAxisLabel.trim();
  const yAxisLabel = normalizedStyle.yAxisLabel.trim();
  plotLines.push(
    `#import "${SIMPLE_PLOT_PACKAGE_IMPORT}": plot, line-plot`,
    "#plot(",
    `  width: ${formatTypstNumber(normalizedStyle.width)},`,
    `  height: ${formatTypstNumber(normalizedStyle.height)},`,
    `  xmin: ${formatTypstNumber(normalizedDocument.window.xmin)}, xmax: ${formatTypstNumber(normalizedDocument.window.xmax)},`,
    `  ymin: ${formatTypstNumber(normalizedDocument.window.ymin)}, ymax: ${formatTypstNumber(normalizedDocument.window.ymax)},`,
    `  xtick-step: ${formatTypstNumber(normalizedDocument.window.xscl)},`,
    `  ytick-step: ${formatTypstNumber(normalizedDocument.window.yscl)},`,
    ...(normalizedStyle.showOnlyGreatestTickLabel ? ["  xtick-labels: none,", "  ytick-labels: none,", "  grid-label-break: false,", "  show-origin: false,"] : []),
    `  show-grid: ${showGrid},`,
    "  axis-x-pos: 0.0,",
    "  axis-y-pos: 0.0,",
    ...(xAxisLabel ? [`  xlabel: [${escapeTypstString(xAxisLabel)}],`] : []),
    ...(yAxisLabel ? [`  ylabel: [${escapeTypstString(yAxisLabel)}],`] : []),
    ...functionLines,
    ...endpointLines,
    ")"
  );

  const plotSource = plotLines.join("\n");

  if (!normalizedStyle.showOnlyGreatestTickLabel) {
    return plotSource;
  }

  return buildSingleAxisLabelOverlay(plotSource, normalizedDocument.window, normalizedStyle);
}

export function buildSimplePlotPreviewDocument(
  document: SimplePlotGraphDocument,
  style: SimplePlotGraphStyle
): string {
  return [
    "#set page(width: auto, height: auto, margin: 0in)",
    "#set text(size: 10pt)",
    buildSimplePlotFigureSource(document, style)
  ].join("\n\n");
}

export function createSimplePlotGraphAssetContent(
  document: SimplePlotGraphDocument,
  style: SimplePlotGraphStyle
): Uint8Array {
  return new TextEncoder().encode(buildSimplePlotFigureSource(document, style));
}

function normalizeSimplePlotGraphDocument(
  candidate: StoredSimplePlotGraphDocument | SimplePlotGraphDocument
): SimplePlotGraphDocument {
  const rawFunctions = Array.isArray(candidate.functions) ? candidate.functions : DEFAULT_FUNCTIONS;
  const functions = rawFunctions
    .map((entry) => normalizeSimplePlotFunctionEntry(entry))
    .filter((entry, index, entries) => index < 8 && (entry.expression.length > 0 || entries.length <= 3));

  return {
    version: 1,
    functions: functions.length > 0 ? functions : DEFAULT_FUNCTIONS,
    window: normalizeSimplePlotWindow(candidate.window)
  };
}

function normalizeSimplePlotFunctionEntry(candidate: unknown): SimplePlotFunctionEntry {
  if (!candidate || typeof candidate !== "object") {
    return {
      expression: "",
      visible: true,
      lineStyle: "solid",
      startArrow: "none",
      endArrow: "none",
      samples: DEFAULT_FUNCTION_SAMPLES
    };
  }

  const entry = candidate as Partial<SimplePlotFunctionEntry>;

  return {
    expression: typeof entry.expression === "string" ? entry.expression : "",
    visible: typeof entry.visible === "boolean" ? entry.visible : true,
    color: typeof entry.color === "string" && entry.color.trim() ? entry.color : undefined,
    lineStyle: normalizeLineStyle(entry.lineStyle),
    startArrow: normalizeArrowStyle(entry.startArrow),
    endArrow: normalizeArrowStyle(entry.endArrow),
    samples: normalizeSamples(entry.samples)
  };
}

function normalizeSamples(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_FUNCTION_SAMPLES;
  }

  return clamp(Math.round(value), MIN_FUNCTION_SAMPLES, MAX_FUNCTION_SAMPLES);
}

function getEffectiveFunctionSamples(entry: SimplePlotFunctionEntry): number {
  const samples = normalizeSamples(entry.samples);

  if (entry.lineStyle === "dashed" || entry.lineStyle === "dotted") {
    return Math.min(samples, MAX_STYLED_LINE_SAMPLES);
  }

  return samples;
}

function buildFunctionPlotLines(
  analysis: SimplePlotFunctionAnalysis,
  window: SimplePlotWindow,
  strokeWidth: number
): string[] {
  if (!analysis.parsed) {
    return [];
  }

  if (analysis.entry.lineStyle !== "dashed" && analysis.entry.lineStyle !== "dotted") {
    const samples = getEffectiveFunctionSamples(analysis.entry);
    return [
      `  (fn: x => ${analysis.parsed.typstExpression}, stroke: ${buildFunctionStroke(
        analysis.color,
        strokeWidth,
        analysis.entry.lineStyle
      )}, samples: ${samples}),`
    ];
  }

  const sampledRuns = sampleFunctionRuns(
    analysis.parsed,
    window,
    getEffectiveFunctionSamples(analysis.entry)
  );

  return sampledRuns.map(
    (points) =>
      `  line-plot(${formatTypstPointData(points)}, stroke: ${buildFunctionStroke(
        analysis.color,
        strokeWidth,
        analysis.entry.lineStyle
      )}, mark: "none"),`
  );
}

function normalizeSimplePlotWindow(candidate: unknown): SimplePlotWindow {
  if (!candidate || typeof candidate !== "object") {
    return DEFAULT_WINDOW;
  }

  const windowCandidate = candidate as Partial<SimplePlotWindow>;
  const xmin = normalizeFiniteNumber(windowCandidate.xmin, DEFAULT_WINDOW.xmin);
  const xmax = normalizeFiniteNumber(windowCandidate.xmax, DEFAULT_WINDOW.xmax);
  const ymin = normalizeFiniteNumber(windowCandidate.ymin, DEFAULT_WINDOW.ymin);
  const ymax = normalizeFiniteNumber(windowCandidate.ymax, DEFAULT_WINDOW.ymax);

  return {
    xmin,
    xmax: xmax === xmin ? xmin + 1 : xmax,
    xscl: normalizePositiveNumber(windowCandidate.xscl, DEFAULT_WINDOW.xscl),
    ymin,
    ymax: ymax === ymin ? ymin + 1 : ymax,
    yscl: normalizePositiveNumber(windowCandidate.yscl, DEFAULT_WINDOW.yscl)
  };
}

function normalizeSimplePlotStyle(style: SimplePlotGraphStyle): SimplePlotGraphStyle {
  return {
    width: clamp(normalizeFiniteNumber(style.width, 6.8), 3.5, 16),
    height: clamp(normalizeFiniteNumber(style.height, 4.8), 2.5, 12),
    strokeWidth: clamp(normalizeFiniteNumber(style.strokeWidth, 1.4), 0.4, 4),
    xAxisLabel: style.xAxisLabel,
    yAxisLabel: style.yAxisLabel,
    xTickStep: clamp(normalizePositiveNumber(style.xTickStep, 1), 0.1, 1000),
    yTickStep: clamp(normalizePositiveNumber(style.yTickStep, 1), 0.1, 1000),
    showGrid: style.showGrid,
    showOnlyGreatestTickLabel: style.showOnlyGreatestTickLabel
  };
}

function migrateLegacyGraphSource(source: string): SimplePlotGraphDocument {
  const migratedExpressions = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:y|x)\s*=/.test(line));

  return {
    version: 1,
    functions:
      migratedExpressions.length > 0
        ? migratedExpressions.slice(0, 6).map((expression) => ({ expression, visible: true }))
        : DEFAULT_FUNCTIONS,
    window: DEFAULT_WINDOW
  };
}

function parseFunctionExpression(expression: string): ParsedSimplePlotFunction {
  const normalizedExpression = normalizeFunctionExpression(expression);
  const tokens = tokenizeExpression(normalizedExpression);
  const parser = new ExpressionParser(tokens);
  const tree = parser.parseExpression();
  parser.expectEnd();

  return {
    originalExpression: expression,
    normalizedExpression,
    typstExpression: emitTypstExpression(tree),
    evaluate: (x: number) => evaluateExpression(tree, x)
  };
}

function normalizeFunctionExpression(expression: string): string {
  let normalized = expression.trim();
  normalized = normalized.replace(/^y\s*=\s*/i, "");
  normalized = normalized.replace(/^f\(x\)\s*=\s*/i, "");
  normalized = normalized.replace(/\\left|\\right/g, "");
  normalized = normalized.replace(/\\cdot|\\times/g, "*");
  normalized = normalized.replace(/\\pi/g, "pi");
  normalized = normalized.replace(/\\sin/g, "sin");
  normalized = normalized.replace(/\\cos/g, "cos");
  normalized = normalized.replace(/\\tan/g, "tan");
  normalized = normalized.replace(/\\sqrt/g, "sqrt");
  normalized = normalized.replace(/\\abs/g, "abs");
  normalized = normalized.replace(/\\ln/g, "ln");
  normalized = normalized.replace(/\\log/g, "log");
  normalized = normalized.replace(/\s+/g, "");

  if (!normalized) {
    throw new Error("Enter a function like y = x^2.");
  }

  return normalized;
}

function tokenizeExpression(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];

    if (/[0-9.]/.test(character)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) {
        end += 1;
      }

      tokens.push({ kind: "number", value: expression.slice(index, end) });
      index = end;
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      let end = index + 1;
      while (end < expression.length && /[A-Za-z0-9_]/.test(expression[end])) {
        end += 1;
      }

      tokens.push({ kind: "identifier", value: expression.slice(index, end).toLowerCase() });
      index = end;
      continue;
    }

    if ("+-*/^,".includes(character)) {
      tokens.push({ kind: "operator", value: character });
      index += 1;
      continue;
    }

    if (character === "(" || character === ")") {
      tokens.push({ kind: "paren", value: character });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported character: ${character}`);
  }

  return tokens;
}

class ExpressionParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): ExpressionNode {
    return this.parseAddition();
  }

  expectEnd(): void {
    if (this.peek()) {
      throw new Error(`Unexpected token: ${this.peek()!.value}`);
    }
  }

  private parseAddition(): ExpressionNode {
    let node = this.parseMultiplication();

    while (true) {
      const token = this.peek();

      if (!token || token.kind !== "operator" || (token.value !== "+" && token.value !== "-")) {
        return node;
      }

      this.index += 1;
      node = {
        kind: "binary",
        operator: token.value as "+" | "-",
        left: node,
        right: this.parseMultiplication()
      };
    }
  }

  private parseMultiplication(): ExpressionNode {
    let node = this.parsePower();

    while (true) {
      const token = this.peek();

      if (!token) {
        return node;
      }

      if (token.kind === "operator" && (token.value === "*" || token.value === "/")) {
        this.index += 1;
        node = {
          kind: "binary",
          operator: token.value as "*" | "/",
          left: node,
          right: this.parsePower()
        };
        continue;
      }

      if (startsImplicitMultiplication(token)) {
        node = {
          kind: "binary",
          operator: "*",
          left: node,
          right: this.parsePower()
        };
        continue;
      }

      return node;
    }
  }

  private parsePower(): ExpressionNode {
    let node = this.parseUnary();
    const token = this.peek();

    if (token?.kind === "operator" && token.value === "^") {
      this.index += 1;
      node = {
        kind: "binary",
        operator: "^",
        left: node,
        right: this.parsePower()
      };
    }

    return node;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();

    if (token?.kind === "operator" && (token.value === "+" || token.value === "-")) {
      this.index += 1;
      return {
        kind: "unary",
        operator: token.value as "+" | "-",
        argument: this.parseUnary()
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.peek();

    if (!token) {
      throw new Error("Unexpected end of expression.");
    }

    if (token.kind === "number") {
      this.index += 1;
      const value = Number(token.value);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${token.value}`);
      }

      return { kind: "number", value };
    }

    if (token.kind === "identifier") {
      this.index += 1;

      if (token.value === "x") {
        return { kind: "variable" };
      }

      if (token.value === "pi" || token.value === "e") {
        return { kind: "constant", name: token.value };
      }

      if (!FUNCTION_NAME_SET.has(token.value as SupportedFunctionName)) {
        throw new Error(`Unsupported identifier: ${token.value}`);
      }

      this.consumeParen("(");
      const argument = this.parseExpression();
      this.consumeParen(")");

      return {
        kind: "call",
        name: token.value as SupportedFunctionName,
        argument
      };
    }

    if (token.kind === "paren" && token.value === "(") {
      this.index += 1;
      const node = this.parseExpression();
      this.consumeParen(")");
      return node;
    }

    throw new Error(`Unexpected token: ${token.value}`);
  }

  private consumeParen(value: "(" | ")"): void {
    const token = this.peek();

    if (!token || token.kind !== "paren" || token.value !== value) {
      throw new Error(`Expected '${value}'.`);
    }

    this.index += 1;
  }

  private peek(): Token | null {
    return this.tokens[this.index] ?? null;
  }
}

function startsImplicitMultiplication(token: Token): boolean {
  return token.kind === "number" || token.kind === "identifier" || (token.kind === "paren" && token.value === "(");
}

function evaluateExpression(node: ExpressionNode, x: number): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "variable":
      return x;
    case "constant":
      return node.name === "pi" ? Math.PI : Math.E;
    case "unary": {
      const value = evaluateExpression(node.argument, x);
      return node.operator === "-" ? -value : value;
    }
    case "binary": {
      const left = evaluateExpression(node.left, x);
      const right = evaluateExpression(node.right, x);

      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        default:
          return Math.pow(left, right);
      }
    }
    case "call": {
      const value = evaluateExpression(node.argument, x);

      switch (node.name) {
        case "sin":
          return Math.sin(value);
        case "cos":
          return Math.cos(value);
        case "tan":
          return Math.tan(value);
        case "sqrt":
          return Math.sqrt(value);
        case "abs":
          return Math.abs(value);
        case "ln":
          return Math.log(value);
        case "log":
          return Math.log10(value);
        default:
          return Math.exp(value);
      }
    }
  }
}

function emitTypstExpression(node: ExpressionNode): string {
  switch (node.kind) {
    case "number":
      return formatTypstNumber(node.value);
    case "variable":
      return "x";
    case "constant":
      return node.name === "pi" ? "calc.pi" : "calc.e";
    case "unary":
      return `${node.operator}${wrapTypstExpression(node.argument)}`;
    case "binary":
      if (node.operator === "^") {
        return `calc.pow(${emitTypstExpression(node.left)}, ${emitTypstExpression(node.right)})`;
      }

      return `${wrapTypstExpression(node.left)} ${node.operator} ${wrapTypstExpression(node.right)}`;
    case "call":
      if (node.name === "log") {
        return `calc.log(${emitTypstExpression(node.argument)}, base: 10.0)`;
      }

      if (node.name === "ln") {
        return `calc.ln(${emitTypstExpression(node.argument)})`;
      }

      return `calc.${node.name}(${emitTypstExpression(node.argument)})`;
  }
}

function wrapTypstExpression(node: ExpressionNode): string {
  if (node.kind === "number" || node.kind === "variable" || node.kind === "constant" || node.kind === "call") {
    return emitTypstExpression(node);
  }

  return `(${emitTypstExpression(node)})`;
}

function formatTypstNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0";
  }

  if (Number.isInteger(value)) {
    return `${value.toFixed(1)}`;
  }

  return Number(value.toFixed(6)).toString();
}

function formatTypstLength(value: number): string {
  return `${Number(value.toFixed(3)).toString()}pt`;
}

function escapeTypstString(value: string): string {
  return value.replace(/[\\\[\]]/g, (character) => `\\${character}`);
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatAxisMaxLabel(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return Number(value.toFixed(6)).toString();
}

function buildSingleAxisLabelOverlay(
  plotSource: string,
  window: SimplePlotWindow,
  style: SimplePlotGraphStyle
): string {
  const width = formatTypstNumber(style.width);
  const height = formatTypstNumber(style.height);
  const yAxisOffset = formatTypstLengthFromCm(
    clamp(resolveHorizontalAxisFraction(window.xmin, window.xmax, 0) * style.width + 0.22, 0, style.width)
  );
  const xLabelOffset = formatTypstLengthFromCm(clamp(style.width - 0.4, 0, style.width));
  const xTickVerticalOffset = formatTypstLengthFromCm(
    clamp(resolveVerticalAxisFraction(window.ymin, window.ymax, 0) * style.height - 0.22, 0, style.height)
  );

  return [
    `#box(width: ${width}cm, height: ${height}cm, inset: 0pt, clip: false)[`,
    `  #place(top + left, dx: ${yAxisOffset}, dy: 0.2cm)[${formatAxisMaxLabel(window.ymax)}]`,
    `  #place(top + left, dx: ${xLabelOffset}, dy: ${xTickVerticalOffset})[${formatAxisMaxLabel(window.xmax)}]`,
    `  ${plotSource}`,
    "]"
  ].join("\n");
}

function resolveVerticalAxisFraction(minimum: number, maximum: number, value: number): number {
  if (maximum === minimum) {
    return 0.5;
  }

  return (maximum - value) / (maximum - minimum);
}

function resolveHorizontalAxisFraction(minimum: number, maximum: number, value: number): number {
  if (maximum === minimum) {
    return 0.5;
  }

  return (value - minimum) / (maximum - minimum);
}

function formatTypstLengthFromCm(value: number): string {
  return `${Number(value.toFixed(4)).toString()}cm`;
}

function normalizeLineStyle(value: unknown): SimplePlotLineStyle {
  return value === "dashed" || value === "dotted" ? value : "solid";
}

function normalizeArrowStyle(value: unknown): SimplePlotArrowStyle {
  return value === "arrow" ? "arrow" : "none";
}

function buildFunctionStroke(
  color: string,
  strokeWidth: number,
  lineStyle: SimplePlotFunctionEntry["lineStyle"]
): string {
  const thickness = formatTypstLength(strokeWidth);

  if (lineStyle === "dashed" || lineStyle === "dotted") {
    return `(paint: rgb("${color}"), thickness: ${thickness}, dash: "${lineStyle}")`;
  }

  return `rgb("${color}") + ${thickness}`;
}

function buildArrowMarkerLines(
  analysis: SimplePlotFunctionAnalysis,
  window: SimplePlotWindow,
  strokeWidth: number
): string[] {
  if (!analysis.parsed) {
    return [];
  }

  const lines: string[] = [];
  const startPoint = sampleFunctionPoint(analysis.parsed, window.xmin);
  const endPoint = sampleFunctionPoint(analysis.parsed, window.xmax);

  if (analysis.entry.startArrow === "arrow" && startPoint) {
    lines.push(buildArrowMarkerLine(startPoint, analysis.color, strokeWidth));
  }

  if (analysis.entry.endArrow === "arrow" && endPoint) {
    lines.push(buildArrowMarkerLine(endPoint, analysis.color, strokeWidth));
  }

  return lines;
}

function sampleFunctionPoint(
  parsed: ParsedSimplePlotFunction,
  x: number
): { x: number; y: number } | null {
  const y = parsed.evaluate(x);

  if (!Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function sampleFunctionRuns(
  parsed: ParsedSimplePlotFunction,
  window: SimplePlotWindow,
  samples: number
): Array<Array<{ x: number; y: number }>> {
  const stepCount = Math.max(1, samples - 1);
  const xSpan = window.xmax - window.xmin;
  const ySpan = Math.max(1, Math.abs(window.ymax - window.ymin));
  const jumpThreshold = ySpan * 1.5;
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let currentRun: Array<{ x: number; y: number }> = [];
  let previousPoint: { x: number; y: number } | null = null;

  for (let index = 0; index < samples; index += 1) {
    const fraction = stepCount === 0 ? 0 : index / stepCount;
    const x = window.xmin + xSpan * fraction;
    const point = sampleFunctionPoint(parsed, x);

    if (!point) {
      if (currentRun.length >= 2) {
        runs.push(currentRun);
      }
      currentRun = [];
      previousPoint = null;
      continue;
    }

    if (previousPoint && Math.abs(point.y - previousPoint.y) > jumpThreshold) {
      if (currentRun.length >= 2) {
        runs.push(currentRun);
      }
      currentRun = [point];
      previousPoint = point;
      continue;
    }

    currentRun.push(point);
    previousPoint = point;
  }

  if (currentRun.length >= 2) {
    runs.push(currentRun);
  }

  return runs;
}

function formatTypstPointData(points: ReadonlyArray<{ x: number; y: number }>): string {
  return `(${points
    .map((point) => `(${formatTypstNumber(point.x)}, ${formatTypstNumber(point.y)})`)
    .join(", ")})`;
}

function buildArrowMarkerLine(
  point: { x: number; y: number },
  color: string,
  strokeWidth: number
): string {
  return `  (data: ((${formatTypstNumber(point.x)}, ${formatTypstNumber(point.y)})), mark: "triangle*", mark-size: ${formatMarkerSize(
    strokeWidth
  )}, mark-fill: rgb("${color}"), stroke: none),`;
}

function formatMarkerSize(strokeWidth: number): string {
  return Number(clamp(strokeWidth * 0.065, 0.08, 0.18).toFixed(3)).toString();
}
