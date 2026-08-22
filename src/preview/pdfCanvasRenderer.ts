import {
  GlobalWorkerOptions,
  getDocument,
  type PDFPageProxy,
  type PDFDocumentProxy
} from "pdfjs-dist";
import pdfWorkerUrl from "./pdfWorker.ts?worker&url";
import { shouldVirtualizePdfDocument } from "./pdfVirtualization";
import {
  resolvePdfCanvasResolution,
  shouldUpgradePdfCanvasResolution,
  type PdfCanvasResolution
} from "./pdfCanvasResolution";
import {
  isDarkPreviewRasterTheme,
  resolvePreviewRasterThemeColors,
  rethemeResolvedPreviewRasterCanvas,
  type ResolvedPreviewRasterThemeColors
} from "./previewRasterTheme";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const INITIAL_PDF_RENDER_BATCH_SIZE = 2;
const PDF_CANVAS_RENDER_CACHE_LIMIT = 6;
const PDF_PREWARM_DISPLAY_SCALE = 2;
const PDF_PREWARM_MAX_PIXELS = 9_000_000;
const PDF_RASTER_ZOOM: PdfCanvasZoomState = { mode: "fit-width", percent: 100 };
const VIRTUALIZED_PDF_RENDER_LIMIT = 8;

const virtualizedPdfSessions = new WeakMap<HTMLElement, () => void>();

export interface PdfCanvasRenderOptions {
  cacheKey?: string;
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

export interface PdfCanvasZoomFocus {
  clientX: number;
  clientY: number;
}

export async function renderPdfArtifactToCanvas(
  container: HTMLElement,
  artifactContent: Uint8Array,
  options: PdfCanvasRenderOptions = {}
): Promise<void> {
  assertNotAborted(options.signal);
  disposeVirtualizedPdfSession(container);
  rememberVisiblePdfCanvasScroll(container);
  const scrollAnchor = capturePdfScrollAnchor(container);
  const themeColors = options.paperView ? null : resolvePreviewRasterThemeColors(options.themeColors);
  const useDarkRetheme = themeColors ? isDarkPreviewRasterTheme(themeColors) : false;
  const virtualizeBySize = shouldVirtualizePdfDocument(artifactContent.byteLength, 0);
  const renderCacheKey = virtualizeBySize ? null : createPdfCanvasRenderCacheKey(options, themeColors);

  container.style.setProperty("--pdf-page-background", themeColors?.backgroundCss ?? "#ffffff");
  container.style.setProperty("--pdf-page-foreground", themeColors?.foregroundCss ?? "#000000");

  const restoredEntry = restorePdfCanvasRenderFromCache(container, renderCacheKey, options.zoom);

  if (restoredEntry?.complete) {
    return;
  }

  const loadingTask = getDocument({
    data: copyBytes(artifactContent)
  });
  const pdfDocument = await loadingTask.promise;

  if (virtualizeBySize || shouldVirtualizePdfDocument(artifactContent.byteLength, pdfDocument.numPages)) {
    try {
      await renderVirtualizedPdfDocument(container, pdfDocument, loadingTask, {
        ...options,
        themeColors,
        useDarkRetheme
      });
      return;
    } catch (error) {
      await destroyPdfDocument(pdfDocument);
      await destroyPdfLoadingTask(loadingTask);
      throw error;
    }
  }

  try {
    delete container.dataset.pdfVirtualized;
    assertNotAborted(options.signal);
    const startPageNumber = restoredEntry ? restoredEntry.pages.length + 1 : 1;

    if (!restoredEntry) {
      delete container.dataset.pdfCanvasRenderCacheKey;
      container.replaceChildren();
    }

    if (restoredEntry && startPageNumber > pdfDocument.numPages) {
      applyPdfCanvasZoom(container, options.zoom);
      restorePdfScrollAnchor(container, scrollAnchor);
      rememberPdfCanvasRender(renderCacheKey, container, true);
      return;
    }

    for (let pageNumber = startPageNumber; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      assertNotAborted(options.signal);
      const target = await createPdfPageRenderTarget(
        pdfDocument,
        pageNumber,
        container,
        PDF_RASTER_ZOOM,
        Boolean(themeColors)
      );

      assertNotAborted(options.signal);
      container.appendChild(target.pageElement);
      await renderPdfPageTarget(target, {
        signal: options.signal,
        themeColors,
        useDarkRetheme
      });
      rememberPdfCanvasRender(renderCacheKey, container, false);

      if (pageNumber === Math.min(INITIAL_PDF_RENDER_BATCH_SIZE, pdfDocument.numPages)) {
        applyPdfCanvasZoom(container, options.zoom);
        restorePdfScrollAnchor(container, scrollAnchor);
      }

      await yieldPdfRenderFrame(options.signal);
    }

    applyPdfCanvasZoom(container, options.zoom);
    restorePdfScrollAnchor(container, scrollAnchor);
    rememberPdfCanvasRender(renderCacheKey, container, true);
  } finally {
    await destroyPdfDocument(pdfDocument);
    await destroyPdfLoadingTask(loadingTask);
  }
}

async function renderVirtualizedPdfDocument(
  container: HTMLElement,
  pdfDocument: PDFDocumentProxy,
  loadingTask: ReturnType<typeof getDocument>,
  options: Omit<PdfCanvasRenderOptions, "themeColors"> & {
    themeColors: ResolvedPreviewRasterThemeColors | null;
    useDarkRetheme: boolean;
  }
): Promise<void> {
  assertNotAborted(options.signal);
  delete container.dataset.pdfCanvasRenderCacheKey;
  container.dataset.pdfVirtualized = "true";

  const firstPage = await pdfDocument.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1 });
  const placeholderGeometry = getPdfPageGeometry(
    container,
    firstViewport.width,
    firstViewport.height,
    options.zoom
  );
  firstPage.cleanup();

  const pages = Array.from({ length: pdfDocument.numPages }, (_, index) => {
    const pageElement = document.createElement("div");
    pageElement.className = "pdf-page canvas";
    pageElement.dataset.pdfNaturalWidth = String(firstViewport.width);
    pageElement.dataset.pdfNaturalHeight = String(firstViewport.height);
    pageElement.dataset.pdfPageNumber = String(index + 1);
    pageElement.setAttribute("aria-label", `PDF page ${index + 1}`);
    pageElement.style.position = "relative";
    pageElement.style.width = `${placeholderGeometry.displayWidth}px`;
    pageElement.style.height = `${placeholderGeometry.displayHeight}px`;
    pageElement.style.margin = "0 auto";
    pageElement.style.overflow = "hidden";
    return pageElement;
  });
  container.replaceChildren(...pages);

  let disposed = false;
  let observer: IntersectionObserver | null = null;
  let renderQueue = Promise.resolve();
  const renderedPages = new Set<number>();
  const queuedPages = new Set<number>();
  const activePages = new Set<number>();

  const evictDistantPages = (focusPage: number) => {
    if (renderedPages.size <= VIRTUALIZED_PDF_RENDER_LIMIT) return;
    const candidates = [...renderedPages]
      .filter((pageNumber) => !activePages.has(pageNumber))
      .sort((left, right) => Math.abs(right - focusPage) - Math.abs(left - focusPage));
    for (const pageNumber of candidates) {
      if (renderedPages.size <= VIRTUALIZED_PDF_RENDER_LIMIT) break;
      const pageElement = pages[pageNumber - 1];
      const canvas = pageElement?.querySelector<HTMLCanvasElement>("canvas");
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      pageElement?.replaceChildren();
      pageElement?.classList.remove("pdf-page--rendering");
      renderedPages.delete(pageNumber);
    }
  };

  const renderPage = async (pageNumber: number) => {
    if (disposed || renderedPages.has(pageNumber)) return;
    assertNotAborted(options.signal);
    const pageElement = pages[pageNumber - 1];
    if (!pageElement) return;
    const target = await createPdfPageRenderTarget(
      pdfDocument,
      pageNumber,
      container,
      PDF_RASTER_ZOOM,
      Boolean(options.themeColors),
      pageElement
    );
    try {
      await renderPdfPageTarget(target, {
        signal: options.signal,
        themeColors: options.themeColors,
        useDarkRetheme: options.useDarkRetheme
      });
      if (disposed) return;
      target.canvas.dataset.pdfRasterScale = String(
        target.canvas.width / Math.max(1, target.pageElement.getBoundingClientRect().width)
      );
      renderedPages.add(pageNumber);
      applyPdfCanvasZoom(container, options.zoom);
      evictDistantPages(pageNumber);
    } finally {
      target.page.cleanup();
    }
  };

  const enqueuePage = (pageNumber: number) => {
    if (disposed || renderedPages.has(pageNumber) || queuedPages.has(pageNumber)) return;
    queuedPages.add(pageNumber);
    renderQueue = renderQueue
      .catch(() => undefined)
      .then(() => renderPage(pageNumber))
      .catch((error) => {
        if (!options.signal?.aborted) {
          console.warn(`[typr] PDF page ${pageNumber} failed to render.`, error);
        }
      })
      .finally(() => queuedPages.delete(pageNumber));
  };

  for (let pageNumber = 1; pageNumber <= Math.min(INITIAL_PDF_RENDER_BATCH_SIZE, pages.length); pageNumber += 1) {
    await renderPage(pageNumber);
  }
  applyPdfCanvasZoom(container, options.zoom);

  if (typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number.parseInt((entry.target as HTMLElement).dataset.pdfPageNumber ?? "", 10);
        if (!Number.isFinite(pageNumber)) continue;
        if (entry.isIntersecting) {
          activePages.add(pageNumber);
          enqueuePage(pageNumber);
        } else {
          activePages.delete(pageNumber);
        }
      }
    }, {
      root: container,
      rootMargin: "150% 0px"
    });
    for (const page of pages) observer.observe(page);
  }

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    options.signal?.removeEventListener("abort", cleanup);
    virtualizedPdfSessions.delete(container);
    void destroyPdfDocument(pdfDocument).then(() => destroyPdfLoadingTask(loadingTask));
  };
  virtualizedPdfSessions.set(container, cleanup);
  options.signal?.addEventListener("abort", cleanup, { once: true });
}

function disposeVirtualizedPdfSession(container: HTMLElement): void {
  virtualizedPdfSessions.get(container)?.();
}

interface PdfResolutionUpgradeTarget {
  canvas: HTMLCanvasElement;
  displayWidth: number;
  naturalWidth: number;
  pageElement: HTMLElement;
  pageNumber: number;
  renderWidth: number;
  resolution: PdfCanvasResolution;
}

interface PdfCanvasRefinementOptions extends PdfCanvasRenderOptions {
  maxPixelsPerTarget?: number;
  maxTargets?: number;
  targetDisplayScale?: number;
}

export async function refinePdfCanvasResolution(
  container: HTMLElement,
  artifactContent: Uint8Array,
  options: PdfCanvasRefinementOptions = {}
): Promise<void> {
  assertNotAborted(options.signal);
  const targets = collectPdfResolutionUpgradeTargets(container, options);

  if (targets.length === 0) {
    return;
  }

  const themeColors = options.paperView ? null : resolvePreviewRasterThemeColors(options.themeColors);
  const useDarkRetheme = themeColors ? isDarkPreviewRasterTheme(themeColors) : false;
  const loadingTask = getDocument({
    data: copyBytes(artifactContent)
  });
  const pdfDocument = await loadingTask.promise;

  try {
    for (const target of targets) {
      assertNotAborted(options.signal);

      if (target.pageNumber > pdfDocument.numPages) {
        continue;
      }

      const page = await pdfDocument.getPage(target.pageNumber);
      const viewport = page.getViewport({
        scale: target.renderWidth / target.naturalWidth
      });
      const stagingCanvas = document.createElement("canvas");
      const stagingContext = stagingCanvas.getContext("2d", {
        alpha: false,
        willReadFrequently: Boolean(themeColors)
      });

      if (!stagingContext) {
        throw new Error("Unable to create PDF refinement canvas context.");
      }

      stagingCanvas.width = target.resolution.width;
      stagingCanvas.height = target.resolution.height;
      stagingContext.imageSmoothingEnabled = true;
      stagingContext.imageSmoothingQuality = "high";

      await renderPdfPageTarget({
        canvas: stagingCanvas,
        context: stagingContext,
        outputScale: target.resolution.outputScale,
        page,
        pageElement: target.pageElement,
        viewport
      }, {
        signal: options.signal,
        themeColors,
        useDarkRetheme
      });
      assertNotAborted(options.signal);

      const liveCanvas = target.pageElement.querySelector<HTMLCanvasElement>("canvas");

      if (liveCanvas !== target.canvas || !liveCanvas.isConnected) {
        continue;
      }

      const liveContext = liveCanvas.getContext("2d", { alpha: false });

      if (!liveContext) {
        continue;
      }

      liveCanvas.width = stagingCanvas.width;
      liveCanvas.height = stagingCanvas.height;
      liveCanvas.dataset.pdfRasterScale = String(
        target.resolution.width / Math.max(1, target.displayWidth)
      );
      liveContext.imageSmoothingEnabled = true;
      liveContext.imageSmoothingQuality = "high";
      liveContext.drawImage(stagingCanvas, 0, 0);
      await yieldPdfRenderFrame(options.signal);
    }
  } finally {
    await destroyPdfDocument(pdfDocument);
    await destroyPdfLoadingTask(loadingTask);
  }
}

function collectPdfResolutionUpgradeTargets(
  container: HTMLElement,
  options: PdfCanvasRefinementOptions
): PdfResolutionUpgradeTarget[] {
  const containerRect = container.getBoundingClientRect();
  const overscan = container.clientHeight;
  const visibleTop = containerRect.top - overscan;
  const visibleBottom = containerRect.bottom + overscan;
  const outputScale = getPdfOutputScale();
  const targetDisplayScale = Math.max(1, options.targetDisplayScale ?? 1);
  const maxTargets = Math.max(1, options.maxTargets ?? Number.POSITIVE_INFINITY);

  return Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"))
    .map((pageElement, index): PdfResolutionUpgradeTarget | null => {
      const pageRect = pageElement.getBoundingClientRect();

      if (pageRect.bottom < visibleTop || pageRect.top > visibleBottom) {
        return null;
      }

      const canvas = pageElement.querySelector<HTMLCanvasElement>("canvas");
      const naturalWidth = Number.parseFloat(pageElement.dataset.pdfNaturalWidth ?? "");
      const displayWidth = pageRect.width;
      const displayHeight = pageRect.height;
      const renderWidth = displayWidth * targetDisplayScale;
      const renderHeight = displayHeight * targetDisplayScale;

      if (
        !canvas ||
        !(naturalWidth > 0) ||
        !(displayWidth > 0) ||
        !(displayHeight > 0)
      ) {
        return null;
      }

      const resolution = resolvePdfCanvasResolution(
        renderWidth,
        renderHeight,
        outputScale,
        { maxPixels: options.maxPixelsPerTarget }
      );

      if (!shouldUpgradePdfCanvasResolution(canvas.width, canvas.height, resolution)) {
        return null;
      }

      return {
        canvas,
        displayWidth,
        naturalWidth,
        pageElement,
        pageNumber: Number.parseInt(pageElement.dataset.pdfPageNumber ?? "", 10) || index + 1,
        renderWidth,
        resolution
      };
    })
    .filter((target): target is PdfResolutionUpgradeTarget => target !== null)
    .sort((left, right) => {
      const viewportCenter = containerRect.top + container.clientHeight / 2;
      const leftRect = left.pageElement.getBoundingClientRect();
      const rightRect = right.pageElement.getBoundingClientRect();
      const leftDistance = Math.abs(leftRect.top + leftRect.height / 2 - viewportCenter);
      const rightDistance = Math.abs(rightRect.top + rightRect.height / 2 - viewportCenter);
      return leftDistance - rightDistance;
    })
    .slice(0, maxTargets);
}

export function prewarmPdfCanvasResolution(
  container: HTMLElement,
  artifactContent: Uint8Array,
  options: PdfCanvasRenderOptions = {}
): Promise<void> {
  return refinePdfCanvasResolution(container, artifactContent, {
    ...options,
    maxPixelsPerTarget: PDF_PREWARM_MAX_PIXELS,
    maxTargets: 1,
    targetDisplayScale: PDF_PREWARM_DISPLAY_SCALE
  });
}

interface PdfCanvasRenderCacheEntry {
  complete: boolean;
  pages: HTMLElement[];
  scrollLeft: number;
  scrollTop: number;
  lastUsedAt: number;
}

const pdfCanvasRenderCache = new Map<string, PdfCanvasRenderCacheEntry>();

function createPdfCanvasRenderCacheKey(
  options: PdfCanvasRenderOptions,
  themeColors: ResolvedPreviewRasterThemeColors | null
): string | null {
  if (!options.cacheKey) {
    return null;
  }

  const themeKey = options.paperView
    ? "paper"
    : `${themeColors?.backgroundCss ?? "#ffffff"}:${themeColors?.foregroundCss ?? "#000000"}`;

  return [
    options.cacheKey,
    themeKey,
    getPdfOutputScale()
  ].join("|");
}

function restorePdfCanvasRenderFromCache(
  container: HTMLElement,
  cacheKey: string | null,
  zoom: PdfCanvasZoomState | undefined
): PdfCanvasRenderCacheEntry | null {
  if (!cacheKey) {
    return null;
  }

  const entry = pdfCanvasRenderCache.get(cacheKey);

  if (!entry || entry.pages.length === 0) {
    pdfCanvasRenderCache.delete(cacheKey);
    return null;
  }

  if (entry.pages.some((page) => page.isConnected && page.parentElement !== container)) {
    return null;
  }

  container.replaceChildren(...entry.pages);
  container.dataset.pdfCanvasRenderCacheKey = cacheKey;
  entry.lastUsedAt = Date.now();
  applyPdfCanvasZoom(container, zoom);
  container.scrollTop = entry.scrollTop;
  container.scrollLeft = entry.scrollLeft;
  return entry;
}

function rememberPdfCanvasRender(
  cacheKey: string | null,
  container: HTMLElement,
  complete: boolean
): void {
  if (!cacheKey) {
    delete container.dataset.pdfCanvasRenderCacheKey;
    return;
  }

  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));

  if (pages.length === 0) {
    return;
  }

  pdfCanvasRenderCache.set(cacheKey, {
    complete,
    pages,
    scrollLeft: container.scrollLeft,
    scrollTop: container.scrollTop,
    lastUsedAt: Date.now()
  });
  container.dataset.pdfCanvasRenderCacheKey = cacheKey;
  prunePdfCanvasRenderCache(cacheKey);
}

function rememberVisiblePdfCanvasScroll(container: HTMLElement): void {
  const cacheKey = container.dataset.pdfCanvasRenderCacheKey;

  if (!cacheKey) {
    return;
  }

  const entry = pdfCanvasRenderCache.get(cacheKey);

  if (!entry) {
    return;
  }

  entry.scrollLeft = container.scrollLeft;
  entry.scrollTop = container.scrollTop;
  entry.lastUsedAt = Date.now();
}

function prunePdfCanvasRenderCache(activeKey: string): void {
  if (pdfCanvasRenderCache.size <= PDF_CANVAS_RENDER_CACHE_LIMIT) {
    return;
  }

  const entries = Array.from(pdfCanvasRenderCache.entries()).sort(
    (left, right) => left[1].lastUsedAt - right[1].lastUsedAt
  );

  for (const [cacheKey] of entries) {
    if (cacheKey === activeKey) {
      continue;
    }

    pdfCanvasRenderCache.delete(cacheKey);

    if (pdfCanvasRenderCache.size <= PDF_CANVAS_RENDER_CACHE_LIMIT) {
      return;
    }
  }
}

interface PdfPageRenderTarget {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  outputScale: number;
  page: PDFPageProxy;
  pageElement: HTMLElement;
  viewport: ReturnType<PDFPageProxy["getViewport"]>;
}

async function createPdfPageRenderTarget(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
  container: HTMLElement,
  zoom: PdfCanvasZoomState = { mode: "fit-width", percent: 100 },
  needsReadback = false,
  existingPageElement?: HTMLElement
): Promise<PdfPageRenderTarget> {
  const page = await pdfDocument.getPage(pageNumber);
  const cssViewport = page.getViewport({ scale: 1 });
  const geometry = getPdfPageGeometry(
    container,
    cssViewport.width,
    cssViewport.height,
    zoom
  );
  const viewport = page.getViewport({ scale: geometry.displayScale });
  const outputScale = getPdfOutputScale();
  const pageElement = existingPageElement ?? document.createElement("div");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: needsReadback
  });

  if (!context) {
    throw new Error("Unable to create PDF canvas context.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  canvas.width = Math.max(1, Math.ceil(viewport.width * outputScale));
  canvas.height = Math.max(1, Math.ceil(viewport.height * outputScale));
  canvas.style.display = "block";
  canvas.style.width = `${geometry.displayWidth}px`;
  canvas.style.height = `${geometry.displayHeight}px`;
  canvas.style.imageRendering = "auto";
  canvas.style.filter = "none";

  // PDF.js paints the canvas white before Typr can apply its dark-theme
  // retheming. Keep that intermediate raster hidden so replacing a native
  // Companion PDF does not flash white in a dark preview.
  pageElement.className = "pdf-page canvas pdf-page--rendering";
  pageElement.dataset.pdfNaturalWidth = String(cssViewport.width);
  pageElement.dataset.pdfNaturalHeight = String(cssViewport.height);
  pageElement.dataset.pdfPageNumber = String(pageNumber);
  pageElement.style.position = "relative";
  pageElement.style.width = `${geometry.displayWidth}px`;
  pageElement.style.height = `${geometry.displayHeight}px`;
  pageElement.style.margin = "0 auto";
  pageElement.style.overflow = "hidden";
  pageElement.replaceChildren(canvas);

  return {
    canvas,
    context,
    outputScale,
    page,
    pageElement,
    viewport
  };
}

async function renderPdfPageTarget(
  target: PdfPageRenderTarget,
  options: {
    signal?: AbortSignal;
    themeColors: ResolvedPreviewRasterThemeColors | null;
    useDarkRetheme: boolean;
  }
): Promise<void> {
  const renderTask = target.page.render({
    canvas: target.canvas,
    canvasContext: target.context,
    background: "#ffffff",
    transform:
      target.outputScale === 1
        ? undefined
        : [target.outputScale, 0, 0, target.outputScale, 0, 0],
    viewport: target.viewport
  });
  const abortRender = () => renderTask.cancel();

  options.signal?.addEventListener("abort", abortRender, { once: true });

  try {
    await renderTask.promise;
  } finally {
    options.signal?.removeEventListener("abort", abortRender);
  }

  assertNotAborted(options.signal);

  if (options.themeColors) {
    await rethemeResolvedPreviewRasterCanvas(
      target.canvas,
      target.context,
      options.themeColors,
      options.useDarkRetheme,
      options.signal
    );
  }

  target.pageElement.classList.remove("pdf-page--rendering");
}

function yieldPdfRenderFrame(signal: AbortSignal | undefined): Promise<void> {
  assertNotAborted(signal);

  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const frame = window.requestAnimationFrame(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    });
    const abort = () => {
      window.cancelAnimationFrame(frame);
      reject(new DOMException("PDF render was cancelled.", "AbortError"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function applyPdfCanvasZoom(
  container: HTMLElement,
  zoom: PdfCanvasZoomState = { mode: "fit-width", percent: 100 },
  focus?: PdfCanvasZoomFocus | null
): void {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));

  if (pages.length === 0) {
    return;
  }

  const scrollAnchor = capturePdfScrollAnchor(container, focus);

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
  displayScale: number;
}

function getPdfPageGeometry(
  container: HTMLElement,
  pageNaturalWidth: number,
  pageNaturalHeight: number,
  zoom: PdfCanvasZoomState = { mode: "fit-width", percent: 100 }
): PdfPageGeometry {
  const viewport = getPdfViewportSize(container, pageNaturalWidth, pageNaturalHeight);
  const displayScale = getPdfDisplayScale(viewport, pageNaturalWidth, pageNaturalHeight, zoom);
  const displayWidth = Math.max(1, pageNaturalWidth * displayScale);
  const displayHeight = Math.max(1, pageNaturalHeight * displayScale);

  return {
    displayWidth,
    displayHeight,
    displayScale
  };
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

function getPdfOutputScale(): number {
  if (typeof window === "undefined") {
    return 2;
  }

  const deviceScale = Math.max(1, window.devicePixelRatio || 1);
  return Math.min(3, Math.max(2, deviceScale));
}

async function destroyPdfDocument(document: PDFDocumentProxy): Promise<void> {
  try {
    await document.cleanup();
  } catch {
    // Best-effort cleanup only.
  }

}

async function destroyPdfLoadingTask(
  loadingTask: ReturnType<typeof getDocument>
): Promise<void> {
  try {
    await loadingTask.destroy();
  } catch {
    // Best-effort worker shutdown only.
  }
}

interface PdfScrollAnchor {
  viewportX: number;
  viewportY: number;
  pageIndex: number;
  pageYRatio: number;
  pageXRatio: number;
  fallbackYRatio: number;
  fallbackXRatio: number;
}

function capturePdfScrollAnchor(
  container: HTMLElement,
  focus?: PdfCanvasZoomFocus | null
): PdfScrollAnchor | null {
  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  const fallbackYRatio = maxScrollTop > 0 ? container.scrollTop / maxScrollTop : 0;
  const fallbackXRatio = maxScrollLeft > 0 ? container.scrollLeft / maxScrollLeft : 0;
  const containerRect = container.getBoundingClientRect();
  const viewportX = focus
    ? clamp(focus.clientX - containerRect.left, 0, container.clientWidth)
    : container.clientWidth / 2;
  const viewportY = focus
    ? clamp(focus.clientY - containerRect.top, 0, container.clientHeight)
    : container.clientHeight / 2;

  if (pages.length === 0) {
    return null;
  }

  const centerY = container.scrollTop + viewportY;
  const centerX = container.scrollLeft + viewportX;
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
    viewportX,
    viewportY,
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
  container.scrollTop = nextCenterY - anchor.viewportY;
  container.scrollLeft = nextCenterX - anchor.viewportX;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("PDF render was cancelled.", "AbortError");
  }
}
