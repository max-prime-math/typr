export interface PreviewRasterThemeColors {
  background: string;
  foreground: string;
}

export interface NativePreviewRasterThemeColors {
  background: number;
  foreground: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ResolvedPreviewRasterThemeColors {
  background: RgbColor;
  foreground: RgbColor;
  backgroundCss: string;
  foregroundCss: string;
}

let colorParseContext: CanvasRenderingContext2D | null | undefined;

export function resolvePreviewRasterThemeColors(
  colors: PreviewRasterThemeColors | undefined
): ResolvedPreviewRasterThemeColors | null {
  if (!colors) return null;
  const background = parseCssColor(colors.background);
  const foreground = parseCssColor(colors.foreground);
  if (!background || !foreground) return null;
  return {
    background,
    foreground,
    backgroundCss: formatRgb(background),
    foregroundCss: formatRgb(foreground)
  };
}

export function resolveNativePreviewRasterThemeColors(
  colors: PreviewRasterThemeColors | undefined
): NativePreviewRasterThemeColors | undefined {
  const resolved = resolvePreviewRasterThemeColors(colors);
  if (!resolved) return undefined;
  return {
    background: packRgb(resolved.background),
    foreground: packRgb(resolved.foreground)
  };
}

/** Applies the same paper-to-theme color mapping to any browser raster canvas. */
export async function rethemePreviewRasterCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  colors: PreviewRasterThemeColors,
  signal?: AbortSignal
): Promise<void> {
  const resolved = resolvePreviewRasterThemeColors(colors);
  if (!resolved) return;
  await rethemeResolvedPreviewRasterCanvas(
    canvas,
    context,
    resolved,
    isDarkPreviewRasterTheme(resolved),
    signal
  );
}

/** Recolors a raster already tinted by TeXpresso from its native color endpoints. */
export async function rethemeNativePreviewRasterCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  source: NativePreviewRasterThemeColors,
  target: PreviewRasterThemeColors,
  signal?: AbortSignal
): Promise<void> {
  const resolvedTarget = resolvePreviewRasterThemeColors(target);
  if (!resolvedTarget) return;
  const sourceBackground = unpackRgb(source.background);
  const sourceForeground = unpackRgb(source.foreground);
  const redDelta = sourceForeground.r - sourceBackground.r;
  const greenDelta = sourceForeground.g - sourceBackground.g;
  const blueDelta = sourceForeground.b - sourceBackground.b;
  const magnitudeSquared = redDelta ** 2 + greenDelta ** 2 + blueDelta ** 2;
  if (magnitudeSquared === 0) return;

  assertNotAborted(signal);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const chunkLength = 131_072 * 4;
  for (let chunkStart = 0; chunkStart < data.length; chunkStart += chunkLength) {
    const chunkEnd = Math.min(data.length, chunkStart + chunkLength);
    for (let index = chunkStart; index < chunkEnd; index += 4) {
      const inkAmount = (
        (data[index]! - sourceBackground.r) * redDelta +
        (data[index + 1]! - sourceBackground.g) * greenDelta +
        (data[index + 2]! - sourceBackground.b) * blueDelta
      ) / magnitudeSquared;
      const mapped = mixRgb(resolvedTarget.background, resolvedTarget.foreground, inkAmount);
      data[index] = mapped.r;
      data[index + 1] = mapped.g;
      data[index + 2] = mapped.b;
    }
    assertNotAborted(signal);
    if (chunkEnd < data.length) await yieldRethemeTask(signal);
  }

  assertNotAborted(signal);
  context.putImageData(image, 0, 0);
}

export async function rethemeResolvedPreviewRasterCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  colors: ResolvedPreviewRasterThemeColors,
  forceLuminance: boolean,
  signal?: AbortSignal
): Promise<void> {
  assertNotAborted(signal);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const sourceData = forceLuminance ? new Uint8ClampedArray(data) : null;
  const chunkLength = 131_072 * 4;

  for (let chunkStart = 0; chunkStart < data.length; chunkStart += chunkLength) {
    const chunkEnd = Math.min(data.length, chunkStart + chunkLength);
    for (let index = chunkStart; index < chunkEnd; index += 4) {
      const r = data[index]!;
      const g = data[index + 1]!;
      const b = data[index + 2]!;
      if (!forceLuminance && !isNeutralPixel(r, g, b)) continue;
      const brightness = forceLuminance && sourceData
        ? getLightlySmoothedBrightness(sourceData, canvas.width, canvas.height, index)
        : getPerceivedBrightness({ r, g, b });
      const mapped = mixRgb(colors.background, colors.foreground, 1 - brightness);
      data[index] = mapped.r;
      data[index + 1] = mapped.g;
      data[index + 2] = mapped.b;
    }
    assertNotAborted(signal);
    if (chunkEnd < data.length) await yieldRethemeTask(signal);
  }

  assertNotAborted(signal);
  context.putImageData(image, 0, 0);
}

export function isDarkPreviewRasterTheme(colors: ResolvedPreviewRasterThemeColors): boolean {
  return getPerceivedBrightness(colors.background) < getPerceivedBrightness(colors.foreground);
}

function yieldRethemeTask(signal: AbortSignal | undefined): Promise<void> {
  assertNotAborted(signal);
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 0);
    const abort = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Raster recoloring was cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function getLightlySmoothedBrightness(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  index: number
): number {
  const center = getPixelBrightness(data, index);
  if (center <= 0.04 || center >= 0.96) return center;
  const pixelIndex = index / 4;
  const x = pixelIndex % width;
  const y = Math.floor(pixelIndex / width);
  if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) return center;
  return (
    center * 0.82 +
    getPixelBrightness(data, index - 4) * 0.045 +
    getPixelBrightness(data, index + 4) * 0.045 +
    getPixelBrightness(data, index - width * 4) * 0.045 +
    getPixelBrightness(data, index + width * 4) * 0.045
  );
}

function getPixelBrightness(data: Uint8ClampedArray, index: number): number {
  return getPerceivedBrightness({ r: data[index]!, g: data[index + 1]!, b: data[index + 2]! });
}

function isNeutralPixel(r: number, g: number, b: number): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) <= 10;
}

function mixRgb(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const clampedAmount = clamp(amount, 0, 1);
  return {
    r: Math.round(from.r + (to.r - from.r) * clampedAmount),
    g: Math.round(from.g + (to.g - from.g) * clampedAmount),
    b: Math.round(from.b + (to.b - from.b) * clampedAmount)
  };
}

function getPerceivedBrightness(color: RgbColor): number {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

function parseCssColor(value: string): RgbColor | null {
  const normalized = normalizeCssColor(value) ?? value.trim();
  if (!normalized) return null;
  const hex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const numeric = Number.parseInt(hex[1]!, 16);
    return { r: (numeric >> 16) & 255, g: (numeric >> 8) & 255, b: numeric & 255 };
  }
  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1]!.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return {
    r: clamp(Math.round(parts[0]!), 0, 255),
    g: clamp(Math.round(parts[1]!), 0, 255),
    b: clamp(Math.round(parts[2]!), 0, 255)
  };
}

function normalizeCssColor(value: string): string | null {
  const context = getColorParseContext();
  if (!context) return null;
  context.fillStyle = "#000000";
  context.fillStyle = value;
  return typeof context.fillStyle === "string" ? context.fillStyle : null;
}

function getColorParseContext(): CanvasRenderingContext2D | null {
  if (colorParseContext !== undefined) return colorParseContext;
  if (typeof document === "undefined") {
    colorParseContext = null;
    return colorParseContext;
  }
  const canvas = document.createElement("canvas");
  colorParseContext = canvas.getContext("2d");
  return colorParseContext;
}

function formatRgb(color: RgbColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function packRgb(color: RgbColor): number {
  return (color.r << 16) | (color.g << 8) | color.b;
}

function unpackRgb(color: number): RgbColor {
  return { r: (color >> 16) & 255, g: (color >> 8) & 255, b: color & 255 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Raster recoloring was cancelled.", "AbortError");
}
