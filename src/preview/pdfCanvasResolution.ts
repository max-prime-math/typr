const MAX_PDF_CANVAS_DIMENSION = 8192;
const MAX_PDF_CANVAS_PIXELS = 24_000_000;
const PDF_RESOLUTION_UPGRADE_THRESHOLD = 0.92;

export interface PdfCanvasResolution {
  height: number;
  outputScale: number;
  width: number;
}

export interface PdfCanvasResolutionLimits {
  maxDimension?: number;
  maxPixels?: number;
}

export function resolvePdfCanvasResolution(
  displayWidth: number,
  displayHeight: number,
  preferredOutputScale: number,
  limits: PdfCanvasResolutionLimits = {}
): PdfCanvasResolution {
  const safeWidth = Math.max(1, displayWidth);
  const safeHeight = Math.max(1, displayHeight);
  const maxDimension = limits.maxDimension ?? MAX_PDF_CANVAS_DIMENSION;
  const maxPixels = limits.maxPixels ?? MAX_PDF_CANVAS_PIXELS;
  const dimensionScale = Math.min(
    maxDimension / safeWidth,
    maxDimension / safeHeight
  );
  const pixelScale = Math.sqrt(maxPixels / (safeWidth * safeHeight));
  const outputScale = Math.max(
    0.1,
    Math.min(preferredOutputScale, dimensionScale, pixelScale)
  );

  return {
    width: Math.max(1, Math.ceil(safeWidth * outputScale)),
    height: Math.max(1, Math.ceil(safeHeight * outputScale)),
    outputScale
  };
}

export function shouldUpgradePdfCanvasResolution(
  currentWidth: number,
  currentHeight: number,
  target: PdfCanvasResolution
): boolean {
  return (
    currentWidth < target.width * PDF_RESOLUTION_UPGRADE_THRESHOLD ||
    currentHeight < target.height * PDF_RESOLUTION_UPGRADE_THRESHOLD
  );
}
