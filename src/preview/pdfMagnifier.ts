export const PDF_MAGNIFIER_MAGNIFICATION = 2.25;
export const PDF_MAGNIFIER_DEFAULT_DESKTOP_DIAMETER = 288;
export const PDF_MAGNIFIER_MIN_DESKTOP_DIAMETER = 160;
export const PDF_MAGNIFIER_MAX_DESKTOP_DIAMETER = 560;
export const PDF_MAGNIFIER_GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

export type PdfMagnifierShape = "circle" | "rectangle";

const PDF_MAGNIFIER_EDGE_INSET = 8;
const PDF_MAGNIFIER_MIN_FINGER_RADIUS = 18;

export interface PdfMagnifierBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface PdfMagnifierPoint {
  clientX: number;
  clientY: number;
}

export interface PdfMagnifierPlacement {
  left: number;
  top: number;
}

export interface PdfMagnifierDimensions {
  height: number;
  width: number;
}

export interface PdfMagnifierCrop {
  destinationHeight: number;
  destinationWidth: number;
  destinationX: number;
  destinationY: number;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
}

export function resizePdfMagnifierDiameter(
  currentDiameter: number,
  wheelDeltaY: number
): number {
  return clamp(
    currentDiameter - wheelDeltaY * 0.25,
    PDF_MAGNIFIER_MIN_DESKTOP_DIAMETER,
    PDF_MAGNIFIER_MAX_DESKTOP_DIAMETER
  );
}

export function resolvePdfMagnifierDimensions(
  width: number,
  shape: PdfMagnifierShape
): PdfMagnifierDimensions {
  return {
    height: shape === "rectangle" ? width / PDF_MAGNIFIER_GOLDEN_RATIO : width,
    width
  };
}

/**
 * Places the loupe around the pointer. Touch contact width is used when
 * available so the loupe's right edge is tangent to the user's finger rather
 * than to the center of the touch point.
 */
export function resolvePdfMagnifierPlacement({
  bounds,
  contactWidth,
  lensHeight,
  lensWidth,
  point,
  pointerType
}: {
  bounds: PdfMagnifierBounds;
  contactWidth: number;
  lensHeight: number;
  lensWidth: number;
  point: PdfMagnifierPoint;
  pointerType: string;
}): PdfMagnifierPlacement {
  const localX = point.clientX - bounds.left;
  const localY = point.clientY - bounds.top;
  const isTouch = pointerType === "touch";
  const contactRadius = Math.max(
    PDF_MAGNIFIER_MIN_FINGER_RADIUS,
    Math.max(0, contactWidth) / 2
  );
  const maximumTop = Math.max(
    PDF_MAGNIFIER_EDGE_INSET,
    bounds.height - lensHeight - PDF_MAGNIFIER_EDGE_INSET
  );

  return {
    // Finger input stays tangent to the left edge of the contact. A mouse or
    // pencil does not obscure the document, so center the larger desktop lens.
    left: isTouch
      ? localX - contactRadius - lensWidth
      : localX - lensWidth / 2,
    top: clamp(
      localY - lensHeight / 2,
      PDF_MAGNIFIER_EDGE_INSET,
      maximumTop
    )
  };
}

/** Resolves a page-canvas crop while retaining blank space beyond page edges. */
export function resolvePdfMagnifierCrop({
  canvasHeight,
  canvasWidth,
  destinationHeight,
  destinationWidth,
  lensHeight,
  lensWidth,
  magnification,
  pageHeight,
  pageWidth,
  pointX,
  pointY
}: {
  canvasHeight: number;
  canvasWidth: number;
  destinationHeight: number;
  destinationWidth: number;
  lensHeight: number;
  lensWidth: number;
  magnification: number;
  pageHeight: number;
  pageWidth: number;
  pointX: number;
  pointY: number;
}): PdfMagnifierCrop | null {
  if (
    canvasWidth <= 0 ||
    canvasHeight <= 0 ||
    destinationWidth <= 0 ||
    destinationHeight <= 0 ||
    lensWidth <= 0 ||
    lensHeight <= 0 ||
    pageWidth <= 0 ||
    pageHeight <= 0 ||
    magnification <= 0
  ) {
    return null;
  }

  const canvasScaleX = canvasWidth / pageWidth;
  const canvasScaleY = canvasHeight / pageHeight;
  const requestedSourceWidth = (lensWidth / magnification) * canvasScaleX;
  const requestedSourceHeight = (lensHeight / magnification) * canvasScaleY;
  const requestedSourceX = pointX * canvasScaleX - requestedSourceWidth / 2;
  const requestedSourceY = pointY * canvasScaleY - requestedSourceHeight / 2;
  const sourceX = clamp(requestedSourceX, 0, canvasWidth);
  const sourceY = clamp(requestedSourceY, 0, canvasHeight);
  const sourceRight = clamp(requestedSourceX + requestedSourceWidth, 0, canvasWidth);
  const sourceBottom = clamp(requestedSourceY + requestedSourceHeight, 0, canvasHeight);
  const sourceWidth = sourceRight - sourceX;
  const sourceHeight = sourceBottom - sourceY;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  return {
    destinationX: ((sourceX - requestedSourceX) / requestedSourceWidth) * destinationWidth,
    destinationY: ((sourceY - requestedSourceY) / requestedSourceHeight) * destinationHeight,
    destinationWidth: (sourceWidth / requestedSourceWidth) * destinationWidth,
    destinationHeight: (sourceHeight / requestedSourceHeight) * destinationHeight,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
