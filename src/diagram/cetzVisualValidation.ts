const RASTER_SIZE = 256;
const SCRATCH_SIZE = 512;
const INK_COLOR_THRESHOLD = 245;
const PIXEL_DIFFERENCE_THRESHOLD = 32;
const MAX_MEAN_DIFFERENCE = 0.18;
const MAX_CHANGED_PIXEL_RATIO = 0.45;
const MAX_INK_MISMATCH_RATIO = 0.35;
const INK_MATCH_RADIUS = 2;

export interface DiagramVisualComparison {
  changedPixelRatio: number;
  inkMismatchRatio: number;
  meanDifference: number;
  similar: boolean;
}

export async function compareDiagramSvgs(
  referenceSvg: string,
  candidateSvg: string
): Promise<DiagramVisualComparison> {
  const [reference, candidate] = await Promise.all([
    normalizeSvgToRgba(referenceSvg),
    normalizeSvgToRgba(candidateSvg)
  ]);

  if (reference.hasInk !== candidate.hasInk) {
    return {
      changedPixelRatio: 1,
      inkMismatchRatio: 1,
      meanDifference: 1,
      similar: false
    };
  }

  if (!reference.hasInk && !candidate.hasInk) {
    return {
      changedPixelRatio: 0,
      inkMismatchRatio: 0,
      meanDifference: 0,
      similar: true
    };
  }

  return compareRgbaBuffers(reference.data, candidate.data);
}

export function compareRgbaBuffers(
  reference: Uint8ClampedArray,
  candidate: Uint8ClampedArray
): DiagramVisualComparison {
  if (reference.length !== candidate.length || reference.length % 4 !== 0) {
    throw new Error("Diagram comparison buffers must have equal RGBA dimensions.");
  }

  const pixelCount = reference.length / 4;
  const rasterWidth = Math.sqrt(pixelCount);
  let totalDifference = 0;
  let changedPixels = 0;

  for (let index = 0; index < reference.length; index += 4) {
    const redDifference = Math.abs((reference[index] ?? 0) - (candidate[index] ?? 0));
    const greenDifference = Math.abs(
      (reference[index + 1] ?? 0) - (candidate[index + 1] ?? 0)
    );
    const blueDifference = Math.abs(
      (reference[index + 2] ?? 0) - (candidate[index + 2] ?? 0)
    );
    const pixelDifference =
      (redDifference + greenDifference + blueDifference) / 3;

    totalDifference += pixelDifference;
    if (pixelDifference > PIXEL_DIFFERENCE_THRESHOLD) {
      changedPixels += 1;
    }
  }

  const meanDifference = pixelCount > 0
    ? totalDifference / pixelCount / 255
    : 0;
  const changedPixelRatio = pixelCount > 0 ? changedPixels / pixelCount : 0;
  const inkMismatchRatio = Number.isInteger(rasterWidth)
    ? calculateInkMismatch(reference, candidate, rasterWidth)
    : 0;

  return {
    changedPixelRatio,
    inkMismatchRatio,
    meanDifference,
    similar:
      meanDifference <= MAX_MEAN_DIFFERENCE &&
      changedPixelRatio <= MAX_CHANGED_PIXEL_RATIO &&
      inkMismatchRatio <= MAX_INK_MISMATCH_RATIO
  };
}

function calculateInkMismatch(
  reference: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
  width: number
): number {
  const referenceMask = createInkMask(reference);
  const candidateMask = createInkMask(candidate);
  const referenceInk = countMask(referenceMask);
  const candidateInk = countMask(candidateMask);

  if (referenceInk === 0 || candidateInk === 0) {
    return referenceInk === candidateInk ? 0 : 1;
  }

  const unmatchedReference = countUnmatchedInk(
    referenceMask,
    candidateMask,
    width
  );
  const unmatchedCandidate = countUnmatchedInk(
    candidateMask,
    referenceMask,
    width
  );

  return (unmatchedReference + unmatchedCandidate) / (referenceInk + candidateInk);
}

function createInkMask(pixels: Uint8ClampedArray): Uint8Array {
  const mask = new Uint8Array(pixels.length / 4);

  for (let index = 0; index < mask.length; index += 1) {
    const pixelIndex = index * 4;
    const red = pixels[pixelIndex] ?? 255;
    const green = pixels[pixelIndex + 1] ?? 255;
    const blue = pixels[pixelIndex + 2] ?? 255;
    mask[index] =
      red < INK_COLOR_THRESHOLD ||
      green < INK_COLOR_THRESHOLD ||
      blue < INK_COLOR_THRESHOLD
        ? 1
        : 0;
  }

  return mask;
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) {
    count += value;
  }
  return count;
}

function countUnmatchedInk(
  source: Uint8Array,
  target: Uint8Array,
  width: number
): number {
  let unmatched = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === 0) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    let matched = false;

    for (
      let offsetY = -INK_MATCH_RADIUS;
      offsetY <= INK_MATCH_RADIUS && !matched;
      offsetY += 1
    ) {
      const targetY = y + offsetY;
      if (targetY < 0 || targetY >= width) {
        continue;
      }

      for (
        let offsetX = -INK_MATCH_RADIUS;
        offsetX <= INK_MATCH_RADIUS;
        offsetX += 1
      ) {
        const targetX = x + offsetX;
        if (targetX < 0 || targetX >= width) {
          continue;
        }

        if (target[targetY * width + targetX] === 1) {
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      unmatched += 1;
    }
  }

  return unmatched;
}

async function normalizeSvgToRgba(
  svg: string
): Promise<{ data: Uint8ClampedArray; hasInk: boolean }> {
  const image = await loadSvgImage(svg);
  const scratch = document.createElement("canvas");
  scratch.width = SCRATCH_SIZE;
  scratch.height = SCRATCH_SIZE;
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchContext) {
    throw new Error("Canvas rendering is unavailable for CeTZ verification.");
  }

  const dimensions = getSvgDimensions(svg, image);
  const scale = Math.min(
    SCRATCH_SIZE / Math.max(1, dimensions.width),
    SCRATCH_SIZE / Math.max(1, dimensions.height)
  );
  const width = Math.max(1, dimensions.width * scale);
  const height = Math.max(1, dimensions.height * scale);
  scratchContext.clearRect(0, 0, SCRATCH_SIZE, SCRATCH_SIZE);
  scratchContext.drawImage(
    image,
    (SCRATCH_SIZE - width) / 2,
    (SCRATCH_SIZE - height) / 2,
    width,
    height
  );

  const scratchPixels = scratchContext.getImageData(
    0,
    0,
    SCRATCH_SIZE,
    SCRATCH_SIZE
  );
  const bounds = findInkBounds(scratchPixels.data, SCRATCH_SIZE, SCRATCH_SIZE);
  const normalized = document.createElement("canvas");
  normalized.width = RASTER_SIZE;
  normalized.height = RASTER_SIZE;
  const normalizedContext = normalized.getContext("2d", {
    willReadFrequently: true
  });
  if (!normalizedContext) {
    throw new Error("Canvas rendering is unavailable for CeTZ verification.");
  }

  normalizedContext.fillStyle = "#ffffff";
  normalizedContext.fillRect(0, 0, RASTER_SIZE, RASTER_SIZE);
  if (bounds) {
    const padding = 10;
    const availableSize = RASTER_SIZE - padding * 2;
    const normalizedScale = Math.min(
      availableSize / bounds.width,
      availableSize / bounds.height
    );
    const normalizedWidth = Math.max(1, bounds.width * normalizedScale);
    const normalizedHeight = Math.max(1, bounds.height * normalizedScale);
    normalizedContext.drawImage(
      scratch,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      (RASTER_SIZE - normalizedWidth) / 2,
      (RASTER_SIZE - normalizedHeight) / 2,
      normalizedWidth,
      normalizedHeight
    );
  }

  return {
    data: normalizedContext.getImageData(
      0,
      0,
      RASTER_SIZE,
      RASTER_SIZE
    ).data,
    hasInk: bounds !== null
  };
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml" })
    );
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to rasterize a diagram for CeTZ verification."));
    };
    image.src = objectUrl;
  });
}

function getSvgDimensions(
  svg: string,
  image: HTMLImageElement
): { height: number; width: number } {
  const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
  const svgElement = documentNode.documentElement;
  const viewBox = svgElement
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth =
    viewBox?.length === 4 && Number.isFinite(viewBox[2]) ? Math.abs(viewBox[2]) : 0;
  const viewBoxHeight =
    viewBox?.length === 4 && Number.isFinite(viewBox[3]) ? Math.abs(viewBox[3]) : 0;

  return {
    width: viewBoxWidth || image.naturalWidth || SCRATCH_SIZE,
    height: viewBoxHeight || image.naturalHeight || SCRATCH_SIZE
  };
}

function findInkBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): { height: number; width: number; x: number; y: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3] ?? 0;
      const red = pixels[index] ?? 255;
      const green = pixels[index + 1] ?? 255;
      const blue = pixels[index + 2] ?? 255;
      const isInk =
        alpha > 16 &&
        (red < INK_COLOR_THRESHOLD ||
          green < INK_COLOR_THRESHOLD ||
          blue < INK_COLOR_THRESHOLD);

      if (!isInk) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < minX || maxY < minY
    ? null
    : {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
}
