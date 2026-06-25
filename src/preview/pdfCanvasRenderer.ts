import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfCanvasRenderOptions {
  paperView?: boolean;
  signal?: AbortSignal;
  themeColors?: {
    background: string;
    foreground: string;
  };
  zoom?: PdfCanvasZoomState;
}

export interface PdfCanvasZoomState {
  mode: "fit-width" | "fit-height" | "fit-page" | "percent";
  percent: number;
}

export async function renderPdfArtifactToCanvas(
  container: HTMLElement,
  artifactContent: Uint8Array,
  options: PdfCanvasRenderOptions = {}
): Promise<void> {
  const pdfDocument = await getDocument({
    data: copyBytes(artifactContent)
  }).promise;

  try {
    assertNotAborted(options.signal);
    const scrollAnchor = capturePdfScrollAnchor(container);
    const renderedPages: HTMLElement[] = [];
    const themeColors = options.paperView ? null : parsePdfThemeColors(options.themeColors);
    container.style.setProperty("--pdf-page-background", themeColors?.backgroundCss ?? "#ffffff");
    container.style.setProperty("--pdf-page-foreground", themeColors?.foregroundCss ?? "#000000");

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      assertNotAborted(options.signal);
      const page = await pdfDocument.getPage(pageNumber);
      const cssViewport = page.getViewport({ scale: 1 });
      const geometry = getPdfPageGeometry(
        container,
        cssViewport.width,
        cssViewport.height,
        options.zoom
      );
      const viewport = page.getViewport({
        scale: getPdfInitialRenderScale(container, cssViewport.width, cssViewport.height)
      });
      const pageElement = document.createElement("div");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", {
        alpha: false
      });

      if (!context) {
        throw new Error("Unable to create PDF canvas context.");
      }

      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      canvas.style.display = "block";
      canvas.style.width = `${geometry.displayWidth}px`;
      canvas.style.height = `${geometry.displayHeight}px`;
      canvas.style.imageRendering = "auto";

      pageElement.className = "pdf-page canvas";
      pageElement.dataset.pdfNaturalWidth = String(cssViewport.width);
      pageElement.dataset.pdfNaturalHeight = String(cssViewport.height);
      pageElement.style.position = "relative";
      pageElement.style.width = `${geometry.displayWidth}px`;
      pageElement.style.height = `${geometry.displayHeight}px`;
      pageElement.style.margin = "0 auto";
      pageElement.style.overflow = "hidden";
      pageElement.appendChild(canvas);
      assertNotAborted(options.signal);
      renderedPages.push(pageElement);

      const renderTask = page.render({
        canvas,
        canvasContext: context,
        background: "#ffffff",
        viewport
      });
      const abortRender = () => renderTask.cancel();

      options.signal?.addEventListener("abort", abortRender, { once: true });

      try {
        await renderTask.promise;
      } finally {
        options.signal?.removeEventListener("abort", abortRender);
      }

      assertNotAborted(options.signal);

      if (themeColors) {
        rethemePdfCanvas(canvas, context, themeColors);
      }
    }

    assertNotAborted(options.signal);
    container.replaceChildren(...renderedPages);
    applyPdfCanvasZoom(container, options.zoom);
    restorePdfScrollAnchor(container, scrollAnchor);
  } finally {
    await destroyPdfDocument(pdfDocument);
  }
}

export function applyPdfCanvasZoom(
  container: HTMLElement,
  zoom: PdfCanvasZoomState = { mode: "fit-width", percent: 100 }
): void {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));

  if (pages.length === 0) {
    return;
  }

  const scrollAnchor = capturePdfScrollAnchor(container);

  for (const page of pages) {
    const naturalWidth = Number.parseFloat(page.dataset.pdfNaturalWidth ?? "");
    const naturalHeight = Number.parseFloat(page.dataset.pdfNaturalHeight ?? "");

    if (
      !Number.isFinite(naturalWidth) ||
      !Number.isFinite(naturalHeight) ||
      naturalWidth <= 0 ||
      naturalHeight <= 0
    ) {
      continue;
    }

    const geometry = getPdfPageGeometry(container, naturalWidth, naturalHeight, zoom);
    page.style.width = `${geometry.displayWidth}px`;
    page.style.height = `${geometry.displayHeight}px`;

    const canvas = page.querySelector<HTMLCanvasElement>("canvas");

    if (canvas) {
      canvas.style.width = `${geometry.displayWidth}px`;
      canvas.style.height = `${geometry.displayHeight}px`;
    }
  }

  restorePdfScrollAnchor(container, scrollAnchor);
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

interface PdfPageGeometry {
  displayWidth: number;
  displayHeight: number;
}

function getPdfPageGeometry(
  container: HTMLElement,
  pageNaturalWidth: number,
  pageNaturalHeight: number,
  zoom: PdfCanvasZoomState = { mode: "fit-width", percent: 100 }
): PdfPageGeometry {
  const viewport = getPdfViewportSize(container, pageNaturalWidth, pageNaturalHeight);
  const displayScale = getPdfDisplayScale(viewport, pageNaturalWidth, pageNaturalHeight, zoom);
  const displayWidth = Math.max(1, Math.round(pageNaturalWidth * displayScale));
  const displayHeight = Math.max(1, Math.round(pageNaturalHeight * displayScale));

  return {
    displayWidth,
    displayHeight
  };
}

function getPdfInitialRenderScale(
  container: HTMLElement,
  pageNaturalWidth: number,
  pageNaturalHeight: number
): number {
  const viewport = getPdfViewportSize(container, pageNaturalWidth, pageNaturalHeight);
  const fitWidthScale = getPdfDisplayScale(
    viewport,
    pageNaturalWidth,
    pageNaturalHeight,
    { mode: "fit-width", percent: 100 }
  );

  return getPdfRenderScale(fitWidthScale);
}

function getPdfViewportSize(
  container: HTMLElement,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number } {
  const style = getComputedStyle(container);
  const horizontalPadding =
    parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
  const verticalPadding =
    parseFloat(style.paddingTop || "0") + parseFloat(style.paddingBottom || "0");
  const availableWidth = container.clientWidth - horizontalPadding;
  const availableHeight = container.clientHeight - verticalPadding;

  return {
    width: Math.max(1, Math.floor(availableWidth || fallbackWidth || 600)),
    height: Math.max(1, Math.floor(availableHeight || fallbackHeight || 842))
  };
}

function getPdfDisplayScale(
  viewport: { width: number; height: number },
  pageNaturalWidth: number,
  pageNaturalHeight: number,
  zoom: PdfCanvasZoomState
): number {
  if (pageNaturalWidth <= 0 || pageNaturalHeight <= 0) {
    return 1;
  }

  if (zoom.mode === "fit-height") {
    return viewport.height / pageNaturalHeight;
  }

  if (zoom.mode === "fit-page") {
    return Math.min(
      viewport.width / pageNaturalWidth,
      viewport.height / pageNaturalHeight
    );
  }

  if (zoom.mode === "percent") {
    return (viewport.width / pageNaturalWidth) * (zoom.percent / 100);
  }

  return viewport.width / pageNaturalWidth;
}

function getPdfRenderScale(displayScale: number): number {
  if (typeof window === "undefined") {
    return Math.max(1, displayScale * 2);
  }

  const deviceScale = Math.max(1, window.devicePixelRatio || 1);
  const outputScale = Math.min(3, Math.max(2, deviceScale));
  return Math.min(4, Math.max(2, displayScale * outputScale));
}

async function destroyPdfDocument(document: PDFDocumentProxy): Promise<void> {
  try {
    await document.cleanup();
  } catch {
    // Best-effort cleanup only.
  }
}

interface PdfScrollAnchor {
  pageIndex: number;
  pageYRatio: number;
  pageXRatio: number;
  fallbackYRatio: number;
  fallbackXRatio: number;
}

function capturePdfScrollAnchor(container: HTMLElement): PdfScrollAnchor | null {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  const fallbackYRatio = maxScrollTop > 0 ? container.scrollTop / maxScrollTop : 0;
  const fallbackXRatio = maxScrollLeft > 0 ? container.scrollLeft / maxScrollLeft : 0;

  if (pages.length === 0) {
    return null;
  }

  const centerY = container.scrollTop + container.clientHeight / 2;
  const centerX = container.scrollLeft + container.clientWidth / 2;
  let bestPageIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [index, page] of pages.entries()) {
    const pageTop = page.offsetTop;
    const pageBottom = pageTop + page.offsetHeight;
    const distance =
      centerY < pageTop
        ? pageTop - centerY
        : centerY > pageBottom
          ? centerY - pageBottom
          : 0;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPageIndex = index;
    }
  }

  const page = pages[bestPageIndex]!;
  const pageHeight = Math.max(1, page.offsetHeight);
  const pageWidth = Math.max(1, page.offsetWidth);

  return {
    pageIndex: bestPageIndex,
    pageYRatio: clamp((centerY - page.offsetTop) / pageHeight, 0, 1),
    pageXRatio: clamp((centerX - page.offsetLeft) / pageWidth, 0, 1),
    fallbackYRatio,
    fallbackXRatio
  };
}

function restorePdfScrollAnchor(
  container: HTMLElement,
  anchor: PdfScrollAnchor | null
): void {
  if (!anchor) {
    return;
  }

  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));
  const page = pages[Math.min(anchor.pageIndex, pages.length - 1)];

  if (!page) {
    container.scrollTop =
      anchor.fallbackYRatio * Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollLeft =
      anchor.fallbackXRatio * Math.max(0, container.scrollWidth - container.clientWidth);
    return;
  }

  const nextCenterY = page.offsetTop + page.offsetHeight * anchor.pageYRatio;
  const nextCenterX = page.offsetLeft + page.offsetWidth * anchor.pageXRatio;
  container.scrollTop = nextCenterY - container.clientHeight / 2;
  container.scrollLeft = nextCenterX - container.clientWidth / 2;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface PdfThemeColors {
  background: RgbColor;
  foreground: RgbColor;
  backgroundCss: string;
  foregroundCss: string;
}

let colorParseContext: CanvasRenderingContext2D | null | undefined;

function parsePdfThemeColors(
  colors: PdfCanvasRenderOptions["themeColors"]
): PdfThemeColors | null {
  if (!colors) {
    return null;
  }

  const background = parseCssColor(colors.background);
  const foreground = parseCssColor(colors.foreground);

  if (!background || !foreground) {
    return null;
  }

  return {
    background,
    foreground,
    backgroundCss: formatRgb(background),
    foregroundCss: formatRgb(foreground)
  };
}

function rethemePdfCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  colors: PdfThemeColors
): void {
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;

    if (!isNeutralPixel(r, g, b)) {
      continue;
    }

    const ink = 1 - getPerceivedBrightness({ r, g, b });
    const mapped = mixRgb(colors.background, colors.foreground, ink);
    data[index] = mapped.r;
    data[index + 1] = mapped.g;
    data[index + 2] = mapped.b;
  }

  context.putImageData(image, 0, 0);
}

function isNeutralPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min <= 10;
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
  const normalized = normalizeCssColor(value);

  if (!normalized) {
    return null;
  }

  const hex = normalized.match(/^#([0-9a-f]{6})$/i);

  if (hex) {
    const value = Number.parseInt(hex[1]!, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  }

  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/i);

  if (!rgb) {
    return null;
  }

  const parts = rgb[1]!.split(",").map((part) => Number.parseFloat(part.trim()));

  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return {
    r: clamp(Math.round(parts[0]!), 0, 255),
    g: clamp(Math.round(parts[1]!), 0, 255),
    b: clamp(Math.round(parts[2]!), 0, 255)
  };
}

function normalizeCssColor(value: string): string | null {
  const context = getColorParseContext();

  if (!context) {
    return null;
  }

  context.fillStyle = "#000000";
  context.fillStyle = value;
  return typeof context.fillStyle === "string" ? context.fillStyle : null;
}

function getColorParseContext(): CanvasRenderingContext2D | null {
  if (colorParseContext !== undefined) {
    return colorParseContext;
  }

  const canvas = document.createElement("canvas");
  colorParseContext = canvas.getContext("2d");
  return colorParseContext;
}

function formatRgb(color: RgbColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("PDF render was cancelled.", "AbortError");
  }
}
