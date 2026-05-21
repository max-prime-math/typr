import { useEffect, useMemo, useRef, useState } from "react";
import type { CompilerStatus, CompileResult } from "../compiler/typstCompiler";
import { renderTypstArtifactToCanvas } from "./typstCanvasRenderer";
import { renderSourceMappingOverlay } from "./sourceMappingOverlay";

interface PreviewPaneProps {
  result: CompileResult | null;
  lastSuccessfulResult: Extract<CompileResult, { ok: true }> | null;
  isErrorSettled: boolean;
  isCompiling: boolean;
  compilerStatus: CompilerStatus;
  paperView?: boolean;
  showToolbar?: boolean;
  onSourceJump?: (sourceLocation: string) => void;
  zoom?: PreviewZoomState;
  onZoomChange?: (zoom: PreviewZoomState) => void;
}

export type PreviewZoomMode = "fit-width" | "fit-height" | "fit-page" | "percent";

export interface PreviewZoomState {
  mode: PreviewZoomMode;
  percent: number;
}

const ZOOM_PERCENT_STEPS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];
export const DEFAULT_ZOOM: PreviewZoomState = {
  mode: "fit-width",
  percent: 100
};

export function PreviewPane({
  result,
  lastSuccessfulResult,
  isErrorSettled,
  isCompiling,
  compilerStatus,
  paperView = false,
  showToolbar = true,
  onSourceJump,
  zoom,
  onZoomChange
}: PreviewPaneProps) {
  const [internalZoom, setInternalZoom] = useState<PreviewZoomState>(DEFAULT_ZOOM);
  const currentZoom = zoom ?? internalZoom;
  const setZoom = onZoomChange ?? setInternalZoom;

  if (result === null) {
    return (
      <div className={`preview-state ${paperView ? "preview-state--paper" : ""}`}>
        <div className="preview-status">
          <p>{isCompiling ? compilerStatus.label : "Preparing preview..."}</p>
          {compilerStatus.detail ? (
            <p className="preview-status__detail">{compilerStatus.detail}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!result.ok) {
    const fallbackResult = lastSuccessfulResult;

    return (
      <div className={`preview-layout ${paperView ? "preview-layout--paper" : ""}`}>
        {fallbackResult ? (
          <div className={`preview-surface ${paperView ? "preview-surface--paper" : ""}`}>
            {showToolbar ? (
              <div className="preview-toolbar">
                <PreviewZoomControls
                  onZoomChange={setZoom}
                  zoom={currentZoom}
                />
              </div>
            ) : null}
            {shouldUseChromiumCanvasPreview(fallbackResult) ? (
              <ChromiumCanvasPreview
                artifactData={fallbackResult.output.artifactData!}
                isFaulted={isErrorSettled}
                paperView={paperView}
              />
            ) : (
              <PreviewDocument
                artifactData={fallbackResult.output.artifactData}
                isCompiling={isCompiling}
                isFaulted={isErrorSettled}
                paperView={paperView}
                markup={fallbackResult.output.content}
                onSourceJump={onSourceJump}
                zoom={currentZoom}
              />
            )}
          </div>
        ) : (
          <div className="preview-state">
            <div className="preview-status">
              <p>The preview could not be generated.</p>
              {compilerStatus.detail ? (
                <p className="preview-status__detail">{compilerStatus.detail}</p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`preview-layout ${paperView ? "preview-layout--paper" : ""}`}>
      <div className={`preview-surface ${paperView ? "preview-surface--paper" : ""}`}>
        {showToolbar ? (
          <div className="preview-toolbar">
            <PreviewZoomControls
              onZoomChange={setZoom}
              zoom={currentZoom}
            />
          </div>
        ) : null}
        {shouldUseChromiumCanvasPreview(result) ? (
          <ChromiumCanvasPreview artifactData={result.output.artifactData!} paperView={paperView} />
        ) : (
          <PreviewDocument
            artifactData={result.output.artifactData}
            isCompiling={isCompiling}
            paperView={paperView}
            markup={result.output.content}
            onSourceJump={onSourceJump}
            zoom={currentZoom}
          />
        )}
      </div>
    </div>
  );
}

export function PreviewZoomControls({
  zoom,
  onZoomChange
}: {
  zoom: PreviewZoomState;
  onZoomChange: (zoom: PreviewZoomState) => void;
}) {
  const selectValue =
    zoom.mode === "percent"
      ? `${zoom.percent}`
      : zoom.mode;

  return (
    <div className="preview-zoom-controls" aria-label="Preview zoom controls">
      <button
        className="preview-zoom-button"
        onClick={() => onZoomChange(nextZoomStep(zoom, -1))}
        type="button"
      >
        -
      </button>
      <select
        aria-label="Preview zoom"
        className="preview-zoom-select"
        onChange={(event) => onZoomChange(parseZoomSelection(event.target.value))}
        value={selectValue}
      >
        <option value="fit-width">Fit Width</option>
        <option value="fit-height">Fit Height</option>
        <option value="fit-page">Fit Page</option>
        {ZOOM_PERCENT_STEPS.map((percent) => (
          <option key={percent} value={`${percent}`}>
            {percent}%
          </option>
        ))}
      </select>
      <button
        className="preview-zoom-button"
        onClick={() => onZoomChange(nextZoomStep(zoom, 1))}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function PreviewDocument({
  artifactData,
  isCompiling = false,
  paperView = false,
  markup,
  isFaulted = false,
  onSourceJump,
  zoom
}: {
  artifactData?: Uint8Array;
  isCompiling?: boolean;
  paperView?: boolean;
  markup: string;
  isFaulted?: boolean;
  onSourceJump?: (sourceLocation: string) => void;
  zoom: PreviewZoomState;
}) {
  const blobStartedAt =
    typeof performance === "undefined" ? 0 : performance.now();
  const normalizedMarkup = useMemo(
    () => normalizePreviewSvg(markup, paperView),
    [markup, paperView]
  );
  const displayMarkup = normalizedMarkup;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const dimensions = useMemo(
    () => extractSvgDimensions(displayMarkup),
    [displayMarkup]
  );
  const resolvedZoom = useMemo(
    () => resolveZoomValue(zoom, viewportSize, dimensions),
    [dimensions, viewportSize, zoom]
  );

  const blobUrl = useMemo(() => {
    const blob = new Blob([displayMarkup], { type: "image/svg+xml" });
    return URL.createObjectURL(blob);
  }, [displayMarkup]);

  useEffect(() => {
    logPreviewTiming("svg", blobStartedAt);

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobStartedAt, blobUrl]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize({
        width: Math.max(0, viewport.clientWidth - 28),
        height: Math.max(0, viewport.clientHeight - 28)
      });
    };

    updateViewportSize();
    const observer = new ResizeObserver(() => {
      updateViewportSize();
    });
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  const contentWidth = dimensions
    ? Math.max(240, Math.round(dimensions.width * resolvedZoom.scale))
    : Math.max(240, viewportSize.width || 0);

  return (
    <div
      className={`preview-document ${isFaulted ? "preview-document--faulted" : ""}`}
      ref={viewportRef}
    >
      <div
        className="preview-document__canvas"
        style={{
          width: `${contentWidth}px`
        }}
      >
        <img
          alt="Typst preview document"
          className="preview-document__object"
          draggable={false}
          src={blobUrl}
        />
        {artifactData && onSourceJump ? (
          <PreviewSourceMappingOverlay
            artifactData={artifactData}
            isCompiling={isCompiling}
            onSourceJump={onSourceJump}
            overlayWidth={contentWidth}
            paperView={paperView}
          />
        ) : null}
      </div>
    </div>
  );
}

function PreviewSourceMappingOverlay({
  artifactData,
  isCompiling,
  onSourceJump,
  overlayWidth,
  paperView
}: {
  artifactData: Uint8Array;
  isCompiling: boolean;
  onSourceJump: (sourceLocation: string) => void;
  overlayWidth: number;
  paperView: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || isCompiling) {
      return;
    }

    let cancelled = false;
    let disposeOverlay = () => {};
    const handle = window.setTimeout(() => {
      void renderSourceMappingOverlay(container, artifactData, paperView)
        .then((overlay) => {
          if (cancelled) {
            overlay.dispose();
            return;
          }

          disposeOverlay = overlay.dispose;
          container.ondblclick = (event) => {
            const sourceLocation = overlay.resolveSourceLocation(event.target);

            if (sourceLocation) {
              onSourceJump(sourceLocation);
            }
          };
        })
        .catch(() => {
          container.innerHTML = "";
          container.ondblclick = null;
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      container.ondblclick = null;
      disposeOverlay();
    };
  }, [artifactData, isCompiling, onSourceJump, overlayWidth, paperView]);

  return (
    <div
      aria-hidden="true"
      className="preview-interaction-layer"
      ref={containerRef}
    />
  );
}

function ChromiumCanvasPreview({
  artifactData,
  paperView = false,
  isFaulted = false
}: {
  artifactData: Uint8Array;
  paperView?: boolean;
  isFaulted?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let cancelled = false;
    const renderStartedAt =
      typeof performance === "undefined" ? 0 : performance.now();
    setRenderError(null);

    void renderTypstArtifactToCanvas(container, artifactData, paperView)
      .then(() => {
        if (!cancelled) {
          logPreviewTiming("canvas", renderStartedAt);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRenderError(
            error instanceof Error ? error.message : "Canvas preview failed."
          );
        }
      });

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [artifactData, containerRef, paperView]);

  if (renderError) {
    return (
      <div className={`preview-document ${isFaulted ? "preview-document--faulted" : ""}`}>
        <div className="preview-canvas-error">{renderError}</div>
      </div>
    );
  }

  return (
    <div
      className={`preview-document preview-document--canvas ${
        isFaulted ? "preview-document--faulted" : ""
      }`}
      ref={containerRef}
    />
  );
}

function parseZoomSelection(value: string): PreviewZoomState {
  if (value === "fit-width" || value === "fit-height" || value === "fit-page") {
    return {
      mode: value,
      percent: 100
    };
  }

  const percent = Number.parseInt(value, 10);

  return {
    mode: "percent",
    percent: Number.isFinite(percent) ? percent : 100
  };
}

export function nextZoomStep(
  zoom: PreviewZoomState,
  direction: -1 | 1
): PreviewZoomState {
  const currentPercent = zoom.mode === "percent" ? zoom.percent : 100;
  const currentIndex = ZOOM_PERCENT_STEPS.findIndex((percent) => percent >= currentPercent);
  const fallbackIndex =
    currentIndex === -1
      ? ZOOM_PERCENT_STEPS.length - 1
      : ZOOM_PERCENT_STEPS[currentIndex] === currentPercent
        ? currentIndex
        : direction > 0
          ? currentIndex
          : Math.max(0, currentIndex - 1);
  const nextIndex = Math.max(
    0,
    Math.min(ZOOM_PERCENT_STEPS.length - 1, fallbackIndex + direction)
  );

  return {
    mode: "percent",
    percent: ZOOM_PERCENT_STEPS[nextIndex]
  };
}

function resolveZoomValue(
  zoom: PreviewZoomState,
  viewportSize: {
    width: number;
    height: number;
  },
  dimensions: SvgDimensions | null
) {
  if (!dimensions || viewportSize.width <= 0 || viewportSize.height <= 0) {
    return {
      scale: 1
    };
  }

  if (zoom.mode === "fit-height") {
    return {
      scale: viewportSize.height / dimensions.height
    };
  }

  if (zoom.mode === "fit-page") {
    return {
      scale: Math.min(
        viewportSize.width / dimensions.width,
        viewportSize.height / dimensions.height
      )
    };
  }

  if (zoom.mode === "percent") {
    return {
      scale: (viewportSize.width / dimensions.width) * (zoom.percent / 100)
    };
  }

  return {
    scale: viewportSize.width / dimensions.width
  };
}

interface SvgDimensions {
  width: number;
  height: number;
}

function extractSvgDimensions(markup: string): SvgDimensions | null {
  const dataWidth = parseNumericAttribute(extractAttribute(markup, "data-width"));
  const dataHeight = parseNumericAttribute(extractAttribute(markup, "data-height"));

  if (dataWidth && dataHeight) {
    return {
      width: dataWidth,
      height: dataHeight
    };
  }

  const width = parseNumericAttribute(extractAttribute(markup, "width"));
  const height = parseNumericAttribute(extractAttribute(markup, "height"));

  if (width && height) {
    return {
      width,
      height
    };
  }

  const viewBox = extractAttribute(markup, "viewBox");

  if (viewBox) {
    const parts = viewBox
      .split(/[,\s]+/)
      .map((part) => Number.parseFloat(part))
      .filter((part) => Number.isFinite(part));

    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return {
        width: parts[2],
        height: parts[3]
      };
    }
  }

  return null;
}

function parseNumericAttribute(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function PreviewDebugPanel({ markup }: { markup: string }) {
  const debugInfo = useMemo(() => analyzePreviewMarkup(markup), [markup]);

  return (
    <section className="preview-debug-panel" aria-label="Preview debug information">
      <h3>Preview Debug</h3>
      <div className="preview-debug-grid">
        <div className="preview-debug-card">
          <h4>Structure</h4>
          <ul>
            <li>SVG tag: {debugInfo.hasSvg ? "yes" : "no"}</li>
            <li>Defs blocks: {debugInfo.defsCount}</li>
            <li>Path tags: {debugInfo.pathCount}</li>
            <li>Outline glyph markers: {debugInfo.outlineGlyphCount}</li>
            <li>Use tags: {debugInfo.useCount}</li>
          </ul>
        </div>
        <div className="preview-debug-card">
          <h4>Embedded Content</h4>
          <ul>
            <li>Images: {debugInfo.imageCount}</li>
            <li>Data image URLs: {debugInfo.dataImageCount}</li>
            <li>foreignObject tags: {debugInfo.foreignObjectCount}</li>
            <li>Text tags: {debugInfo.textCount}</li>
            <li>Script tags: {debugInfo.scriptCount}</li>
          </ul>
        </div>
        <div className="preview-debug-card">
          <h4>SVG Metrics</h4>
          <ul>
            <li>ViewBox: {debugInfo.viewBox ?? "missing"}</li>
            <li>Width: {debugInfo.width ?? "missing"}</li>
            <li>Height: {debugInfo.height ?? "missing"}</li>
            <li>data-width: {debugInfo.dataWidth ?? "missing"}</li>
            <li>data-height: {debugInfo.dataHeight ?? "missing"}</li>
          </ul>
        </div>
      </div>
      <details className="preview-debug-markup">
        <summary>Markup excerpt</summary>
        <pre>{debugInfo.excerpt}</pre>
      </details>
    </section>
  );
}

function formatDiagnostic(diagnostic: {
  message: string;
  path?: string;
  range?: string;
  packageName?: string;
}) {
  const location = [diagnostic.packageName, diagnostic.path, diagnostic.range]
    .filter(Boolean)
    .join(" ");

  return location ? `${location}: ${diagnostic.message}` : diagnostic.message;
}

function analyzePreviewMarkup(markup: string) {
  return {
    hasSvg: /<svg\b/i.test(markup),
    defsCount: countMatches(markup, /<defs\b/gi),
    pathCount: countMatches(markup, /<path\b/gi),
    outlineGlyphCount: countMatches(markup, /outline_glyph/gi),
    useCount: countMatches(markup, /<use\b/gi),
    imageCount: countMatches(markup, /<image\b/gi),
    dataImageCount: countMatches(markup, /data:image\//gi),
    foreignObjectCount: countMatches(markup, /<foreignObject\b/gi),
    textCount: countMatches(markup, /<text\b/gi),
    scriptCount: countMatches(markup, /<script\b/gi),
    viewBox: extractAttribute(markup, "viewBox"),
    width: extractAttribute(markup, "width"),
    height: extractAttribute(markup, "height"),
    dataWidth: extractAttribute(markup, "data-width"),
    dataHeight: extractAttribute(markup, "data-height"),
    excerpt: markup.slice(0, 2500)
  };
}

function shouldUseChromiumCanvasPreview(
  result: CompileResult
): boolean {
  return false;
}

function logPreviewTiming(mode: "svg" | "canvas", startedAt: number): void {
  if (typeof console === "undefined" || typeof performance === "undefined") {
    return;
  }

  console.debug(
    `[typr] preview ${mode} prepared in ${(performance.now() - startedAt).toFixed(1)}ms`
  );
}

function normalizePreviewSvg(markup: string, paperView: boolean): string {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return markup;
  }

  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(markup, "image/svg+xml");
    const svg = document.documentElement;

    if (!svg || svg.nodeName.toLowerCase() !== "svg") {
      return markup;
    }

    if (paperView) {
      const existingBackground = svg.querySelector(":scope > rect[data-preview-background]");

      if (existingBackground) {
        existingBackground.setAttribute("fill", "#fffef9");
      } else {
        const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        background.setAttribute("data-preview-background", "true");
        background.setAttribute("x", "0");
        background.setAttribute("y", "0");
        background.setAttribute("width", "100%");
        background.setAttribute("height", "100%");
        background.setAttribute("fill", "#fffef9");
        svg.insertBefore(background, svg.firstChild);
      }
    } else {
      const existingBackground = svg.querySelector(":scope > rect[data-preview-background]");
      existingBackground?.remove();
    }

    const glyphDefs = new Map<string, SVGElement>();

    for (const element of Array.from(document.querySelectorAll("defs .outline_glyph[id]"))) {
      glyphDefs.set(element.id, element as SVGElement);
    }

    for (const useElement of Array.from(document.querySelectorAll("use"))) {
      const href =
        useElement.getAttribute("href") ??
        useElement.getAttribute("xlink:href");

      if (!href || !href.startsWith("#")) {
        continue;
      }

      const glyphDefinition = glyphDefs.get(href.slice(1));

      if (!glyphDefinition) {
        continue;
      }

      const replacement = glyphDefinition.cloneNode(true) as SVGElement;
      replacement.removeAttribute("id");

      const x = useElement.getAttribute("x");
      const y = useElement.getAttribute("y");
      const useTransform = useElement.getAttribute("transform");
      const translate = x || y ? `translate(${x ?? "0"} ${y ?? "0"})` : "";
      const mergedTransform = [translate, useTransform].filter(Boolean).join(" ");

      if (mergedTransform) {
        replacement.setAttribute("transform", mergedTransform);
      }

      const useClass = useElement.getAttribute("class");
      if (useClass) {
        replacement.setAttribute(
          "class",
          [replacement.getAttribute("class"), useClass].filter(Boolean).join(" ")
        );
      }

      for (const attributeName of useElement.getAttributeNames()) {
        if (
          attributeName === "href" ||
          attributeName === "xlink:href" ||
          attributeName === "x" ||
          attributeName === "y" ||
          attributeName === "transform" ||
          attributeName === "class"
        ) {
          continue;
        }

        replacement.setAttribute(
          attributeName,
          useElement.getAttribute(attributeName) ?? ""
        );
      }

      useElement.replaceWith(replacement);
    }

    for (const defsUse of Array.from(document.querySelectorAll("defs use"))) {
      defsUse.remove();
    }

    return new XMLSerializer().serializeToString(document);
  } catch {
    return markup;
  }
}

function applyChromiumSupersampling(markup: string): string {
  if (!isChromiumBrowser()) {
    return markup;
  }

  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return markup;
  }

  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(markup, "image/svg+xml");
    const svg = document.documentElement;

    if (!svg || svg.nodeName.toLowerCase() !== "svg") {
      return markup;
    }

    const factor = 2;
    scaleNumericAttribute(svg, "width", factor);
    scaleNumericAttribute(svg, "height", factor);
    scaleNumericAttribute(svg, "data-width", factor);
    scaleNumericAttribute(svg, "data-height", factor);

    const existingStyle = svg.getAttribute("style") ?? "";
    const extraStyle = "shape-rendering:geometricPrecision;text-rendering:geometricPrecision;";
    svg.setAttribute("style", `${existingStyle}${existingStyle ? ";" : ""}${extraStyle}`);

    return new XMLSerializer().serializeToString(document);
  } catch {
    return markup;
  }
}

function scaleNumericAttribute(
  element: Element,
  attributeName: string,
  factor: number
): void {
  const rawValue = element.getAttribute(attributeName);

  if (!rawValue) {
    return;
  }

  const match = rawValue.match(/^([0-9]+(?:\.[0-9]+)?)(.*)$/);

  if (!match) {
    return;
  }

  const numericValue = Number.parseFloat(match[1]);
  const suffix = match[2] ?? "";

  if (Number.isNaN(numericValue)) {
    return;
  }

  element.setAttribute(attributeName, `${(numericValue * factor).toFixed(3)}${suffix}`);
}

function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isEdgeOrChrome =
    userAgent.includes("Edg/") || userAgent.includes("Chrome/");
  const isFirefox = userAgent.includes("Firefox/");
  const isSafari = userAgent.includes("Safari/") && !userAgent.includes("Chrome/");

  return isEdgeOrChrome && !isFirefox && !isSafari;
}

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) || []).length;
}

function extractAttribute(markup: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}="([^"]+)"`, "i");
  return markup.match(pattern)?.[1] ?? null;
}
