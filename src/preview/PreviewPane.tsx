import { useEffect, useMemo, useRef, useState } from "react";
import type { CompilerStatus, CompileResult } from "../compiler/typstCompiler";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeDefinition } from "../theme/themes";
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
  workspacePreview?: WorkspacePreviewFile | null;
}

export type PreviewStatusKind = "live" | "compiling";

export type PreviewZoomMode = "fit-width" | "fit-height" | "fit-page" | "percent";

export interface PreviewZoomState {
  mode: PreviewZoomMode;
  percent: number;
}

export interface WorkspacePreviewFile {
  name: string;
  path: string;
  content: string | Uint8Array;
  mimeType: string;
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
  onZoomChange,
  workspacePreview
}: PreviewPaneProps) {
  const { theme } = useTheme();
  const [internalZoom, setInternalZoom] = useState<PreviewZoomState>(DEFAULT_ZOOM);
  const currentZoom = zoom ?? internalZoom;
  const setZoom = onZoomChange ?? setInternalZoom;

  if (workspacePreview) {
    return (
      <div className={`preview-layout ${paperView ? "preview-layout--paper" : ""}`}>
        <div className={`preview-surface ${paperView ? "preview-surface--paper" : ""}`}>
          <WorkspaceFilePreview
            file={workspacePreview}
            paperView={paperView}
            theme={theme}
          />
        </div>
      </div>
    );
  }

  if (result === null) {
    return (
      <div className={`preview-state ${paperView ? "preview-state--paper" : ""}`}>
        <div className="preview-status">
          <p>
            <PreviewStatusIcon
              kind={isCompiling ? "compiling" : "live"}
              label={isCompiling ? compilerStatus.label : "Preparing preview"}
            />
          </p>
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
                theme={theme}
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
              theme={theme}
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

export function PreviewStatusIcon({
  kind,
  label
}: {
  kind: PreviewStatusKind;
  label: string;
}) {
  return (
    <span className="preview-status-icon-wrap" aria-label={label}>
      <span
        aria-hidden="true"
        className={`preview-status-icon preview-status-icon--${kind}`}
      />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

function PreviewDocument({
  artifactData,
  isCompiling = false,
  paperView = false,
  markup,
  isFaulted = false,
  onSourceJump,
  theme,
  zoom
}: {
  artifactData?: Uint8Array;
  isCompiling?: boolean;
  paperView?: boolean;
  markup: string;
  isFaulted?: boolean;
  onSourceJump?: (sourceLocation: string) => void;
  theme: ThemeDefinition;
  zoom: PreviewZoomState;
}) {
  const blobStartedAt =
    typeof performance === "undefined" ? 0 : performance.now();
  const normalizedMarkup = useMemo(
    () => normalizePreviewSvg(markup, paperView, theme),
    [markup, paperView, theme]
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

function WorkspaceFilePreview({
  file,
  paperView,
  theme
}: {
  file: WorkspacePreviewFile;
  paperView: boolean;
  theme: ThemeDefinition;
}) {
  const blobUrl = useMemo(() => {
    const blob = buildWorkspacePreviewBlob(file, paperView, theme);

    return URL.createObjectURL(blob);
  }, [file, paperView, theme]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const isPdf = file.mimeType === "application/pdf";

  return (
    <div className={`preview-document preview-document--asset ${paperView ? "preview-document--paper" : ""}`}>
      {isPdf ? (
        <object
          aria-label={file.name}
          className="preview-file-preview__embed"
          data={blobUrl}
          type={file.mimeType}
        >
          <p className="preview-file-preview__fallback">
            {file.name}
          </p>
        </object>
      ) : (
        <div className="preview-file-preview">
          <img alt={file.name} className="preview-file-preview__image" src={blobUrl} />
        </div>
      )}
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

function normalizePreviewSvg(markup: string, paperView: boolean, theme: ThemeDefinition): string {
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

    svg.setAttribute("color", paperView ? "#000000" : theme.palette.editorForeground);

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

    if (!paperView && theme.mode === "dark") {
      rethemePreviewSvgColors(document, theme);
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

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

interface CanonicalColorAnchor {
  name: string;
  rgb: RgbaColor;
  neutral?: boolean;
}

interface PreviewColorTransform {
  background: RgbaColor;
  foreground: RgbaColor;
  backgroundBrightness: number;
  foregroundBrightness: number;
  anchors: Array<CanonicalColorAnchor & { mapped: RgbaColor }>;
}

const SVG_COLOR_ATTRIBUTES = [
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
  "color"
] as const;

const COLOR_STYLE_PROPERTY_PATTERN =
  /(\b(?:fill|stroke|stop-color|flood-color|lighting-color|color|background-color)\s*:\s*)([^;}{]+)/gi;

const COLOR_TOKEN_PATTERN =
  /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b[a-z]+\b/gi;

const CANONICAL_COLOR_ANCHORS: CanonicalColorAnchor[] = [
  { name: "black", rgb: { r: 0, g: 0, b: 0, a: 1 }, neutral: true },
  { name: "gray", rgb: { r: 128, g: 128, b: 128, a: 1 }, neutral: true },
  { name: "white", rgb: { r: 255, g: 255, b: 255, a: 1 }, neutral: true },
  { name: "red", rgb: { r: 255, g: 0, b: 0, a: 1 } },
  { name: "orange", rgb: { r: 255, g: 165, b: 0, a: 1 } },
  { name: "yellow", rgb: { r: 255, g: 255, b: 0, a: 1 } },
  { name: "green", rgb: { r: 0, g: 128, b: 0, a: 1 } },
  { name: "cyan", rgb: { r: 0, g: 255, b: 255, a: 1 } },
  { name: "blue", rgb: { r: 0, g: 0, b: 255, a: 1 } },
  { name: "purple", rgb: { r: 128, g: 0, b: 128, a: 1 } },
  { name: "magenta", rgb: { r: 255, g: 0, b: 255, a: 1 } },
  { name: "brown", rgb: { r: 139, g: 69, b: 19, a: 1 } }
];

let colorParseContext: CanvasRenderingContext2D | null | undefined;

function buildWorkspacePreviewBlob(
  file: WorkspacePreviewFile,
  paperView: boolean,
  theme: ThemeDefinition
): Blob {
  if (file.mimeType !== "image/svg+xml") {
    return new Blob([file.content as BlobPart], { type: file.mimeType });
  }

  const markup = decodeSvgMarkup(file.content);
  const normalizedMarkup = normalizePreviewSvg(markup, paperView, theme);
  return new Blob([normalizedMarkup], { type: file.mimeType });
}

function decodeSvgMarkup(content: string | Uint8Array): string {
  if (typeof content === "string") {
    return content;
  }

  if (typeof TextDecoder === "undefined") {
    return "";
  }

  return new TextDecoder().decode(content);
}

function rethemePreviewSvgColors(document: XMLDocument, theme: ThemeDefinition): void {
  const transform = createPreviewColorTransform(theme);
  const root = document.documentElement;

  root.setAttribute("color", formatColor(transform.foreground));

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attributeName of SVG_COLOR_ATTRIBUTES) {
      const rawValue = element.getAttribute(attributeName);

      if (!rawValue) {
        continue;
      }

      const nextValue = transformStandaloneColorValue(rawValue, transform);

      if (nextValue && nextValue !== rawValue) {
        element.setAttribute(attributeName, nextValue);
      }
    }

    const inlineStyle = element.getAttribute("style");
    if (inlineStyle) {
      const nextStyle = replaceColorDeclarations(inlineStyle, transform);

      if (nextStyle !== inlineStyle) {
        element.setAttribute("style", nextStyle);
      }
    }
  }

  for (const styleElement of Array.from(document.querySelectorAll("style"))) {
    const cssText = styleElement.textContent;

    if (!cssText) {
      continue;
    }

    const nextCssText = replaceColorDeclarations(cssText, transform);

    if (nextCssText !== cssText) {
      styleElement.textContent = nextCssText;
    }
  }
}

function replaceColorDeclarations(cssText: string, transform: PreviewColorTransform): string {
  return cssText.replace(COLOR_STYLE_PROPERTY_PATTERN, (_match, prefix, value: string) => {
    const nextValue = value.replace(COLOR_TOKEN_PATTERN, (token) => {
      return transformStandaloneColorValue(token, transform) ?? token;
    });

    return `${prefix}${nextValue}`;
  });
}

function transformStandaloneColorValue(
  rawValue: string,
  transform: PreviewColorTransform
): string | null {
  const parsedColor = parseCssColor(rawValue);

  if (!parsedColor || parsedColor.a === 0) {
    return null;
  }

  return formatColor(transformPreviewColor(parsedColor, transform));
}

function createPreviewColorTransform(theme: ThemeDefinition): PreviewColorTransform {
  const background = parseCssColor(theme.palette.surfaceStrong) ?? {
    r: 30,
    g: 30,
    b: 46,
    a: 1
  };
  const foreground = parseCssColor(theme.palette.editorForeground) ?? {
    r: 205,
    g: 214,
    b: 244,
    a: 1
  };

  return {
    background,
    foreground,
    backgroundBrightness: getPerceivedBrightness(background),
    foregroundBrightness: getPerceivedBrightness(foreground),
    anchors: CANONICAL_COLOR_ANCHORS.map((anchor) => ({
      ...anchor,
      mapped: anchor.neutral
        ? mixRgb(background, foreground, 1 - getPerceivedBrightness(anchor.rgb))
        : mapChromaticAnchor(anchor.rgb, background, foreground)
    }))
  };
}

function transformPreviewColor(color: RgbaColor, transform: PreviewColorTransform): RgbaColor {
  if (areColorsClose(color, transform.foreground, 20)) {
    return {
      ...transform.foreground,
      a: color.a
    };
  }

  if (areColorsClose(color, transform.background, 20)) {
    return {
      ...transform.background,
      a: color.a
    };
  }

  const nearestAnchor = findNearestCanonicalColor(color, transform.anchors);
  const brightness = getPerceivedBrightness(color);
  const targetBrightness = clamp(
    transform.backgroundBrightness +
      (1 - brightness) * (transform.foregroundBrightness - transform.backgroundBrightness),
    Math.min(transform.backgroundBrightness, transform.foregroundBrightness),
    Math.max(transform.backgroundBrightness, transform.foregroundBrightness)
  );

  if (nearestAnchor.neutral || rgbToHsl(color).s < 0.08) {
    const neutral = mixRgb(
      transform.background,
      transform.foreground,
      1 - brightness
    );

    return {
      ...neutral,
      a: color.a
    };
  }

  const sourceHsl = rgbToHsl(color);
  const anchorHsl = rgbToHsl(nearestAnchor.rgb);
  const mappedAnchorHsl = rgbToHsl(nearestAnchor.mapped);
  const hue = wrapHue(mappedAnchorHsl.h + shortestHueDelta(anchorHsl.h, sourceHsl.h));
  const saturation = clamp(mappedAnchorHsl.s + (sourceHsl.s - anchorHsl.s), 0.18, 1);
  const lightness = solveLightnessForBrightness(hue, saturation, targetBrightness);

  return {
    ...hslToRgb({ h: hue, s: saturation, l: lightness }),
    a: color.a
  };
}

function mapChromaticAnchor(
  anchor: RgbaColor,
  background: RgbaColor,
  foreground: RgbaColor
): RgbaColor {
  const anchorHsl = rgbToHsl(anchor);
  const brightness = getPerceivedBrightness(anchor);
  const backgroundBrightness = getPerceivedBrightness(background);
  const foregroundBrightness = getPerceivedBrightness(foreground);
  const targetBrightness = clamp(
    backgroundBrightness + (1 - brightness) * (foregroundBrightness - backgroundBrightness),
    Math.min(backgroundBrightness, foregroundBrightness),
    Math.max(backgroundBrightness, foregroundBrightness)
  );
  const lightness = solveLightnessForBrightness(anchorHsl.h, anchorHsl.s, targetBrightness);

  return {
    ...hslToRgb({ h: anchorHsl.h, s: anchorHsl.s, l: lightness }),
    a: 1
  };
}

function findNearestCanonicalColor(
  color: RgbaColor,
  anchors: Array<CanonicalColorAnchor & { mapped: RgbaColor }>
): CanonicalColorAnchor & { mapped: RgbaColor } {
  let bestAnchor = anchors[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of anchors) {
    const distance = getRgbDistanceSquared(color, anchor.rgb);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestAnchor = anchor;
    }
  }

  return bestAnchor;
}

function solveLightnessForBrightness(
  hue: number,
  saturation: number,
  targetBrightness: number
): number {
  let lower = 0;
  let upper = 1;

  for (let index = 0; index < 18; index += 1) {
    const candidate = (lower + upper) / 2;
    const candidateBrightness = getPerceivedBrightness(
      hslToRgb({ h: hue, s: saturation, l: candidate })
    );

    if (candidateBrightness < targetBrightness) {
      lower = candidate;
    } else {
      upper = candidate;
    }
  }

  return (lower + upper) / 2;
}

function parseCssColor(rawValue: string): RgbaColor | null {
  const normalizedValue = normalizeCssColor(rawValue);

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.startsWith("#")) {
    return parseHexColor(normalizedValue);
  }

  const rgbMatch = normalizedValue.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );

  if (!rgbMatch) {
    return null;
  }

  return {
    r: clampChannel(Number.parseFloat(rgbMatch[1])),
    g: clampChannel(Number.parseFloat(rgbMatch[2])),
    b: clampChannel(Number.parseFloat(rgbMatch[3])),
    a: clamp(Number.parseFloat(rgbMatch[4] ?? "1"), 0, 1)
  };
}

function normalizeCssColor(rawValue: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const trimmedValue = rawValue.trim();
  const normalizedKeyword = trimmedValue.toLowerCase();
  if (
    trimmedValue.length === 0 ||
    normalizedKeyword === "none" ||
    normalizedKeyword === "currentcolor" ||
    normalizedKeyword === "context-fill" ||
    normalizedKeyword === "context-stroke" ||
    normalizedKeyword.startsWith("url(")
  ) {
    return null;
  }

  const option = new Option();
  option.style.color = "";
  option.style.color = trimmedValue;

  if (!option.style.color) {
    return null;
  }

  const context = getColorParseContext();
  if (!context) {
    return null;
  }

  context.fillStyle = "#010203";
  context.fillStyle = option.style.color;
  return typeof context.fillStyle === "string" ? context.fillStyle : null;
}

function getColorParseContext(): CanvasRenderingContext2D | null {
  if (colorParseContext !== undefined) {
    return colorParseContext;
  }

  if (typeof document === "undefined") {
    colorParseContext = null;
    return colorParseContext;
  }

  const canvas = document.createElement("canvas");
  colorParseContext = canvas.getContext("2d");
  return colorParseContext;
}

function parseHexColor(value: string): RgbaColor | null {
  const hex = value.slice(1);

  if (hex.length === 3 || hex.length === 4) {
    const [r, g, b, a = "f"] = hex.split("").map((part) => part + part);

    return {
      r: Number.parseInt(r, 16),
      g: Number.parseInt(g, 16),
      b: Number.parseInt(b, 16),
      a: Number.parseInt(a, 16) / 255
    };
  }

  if (hex.length === 6 || hex.length === 8) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }

  return null;
}

function rgbToHsl(color: RgbaColor): HslColor {
  const red = color.r / 255;
  const green = color.g / 255;
  const blue = color.b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;

  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return {
    h: hue * 60,
    s: saturation,
    l: lightness
  };
}

function hslToRgb(color: HslColor): RgbaColor {
  const hue = wrapHue(color.h) / 360;
  const saturation = clamp(color.s, 0, 1);
  const lightness = clamp(color.l, 0, 1);

  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return { r: channel, g: channel, b: channel, a: 1 };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: Math.round(hueToChannel(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToChannel(p, q, hue) * 255),
    b: Math.round(hueToChannel(p, q, hue - 1 / 3) * 255),
    a: 1
  };
}

function hueToChannel(p: number, q: number, hue: number): number {
  let normalizedHue = hue;

  if (normalizedHue < 0) {
    normalizedHue += 1;
  }

  if (normalizedHue > 1) {
    normalizedHue -= 1;
  }

  if (normalizedHue < 1 / 6) {
    return p + (q - p) * 6 * normalizedHue;
  }

  if (normalizedHue < 1 / 2) {
    return q;
  }

  if (normalizedHue < 2 / 3) {
    return p + (q - p) * (2 / 3 - normalizedHue) * 6;
  }

  return p;
}

function mixRgb(first: RgbaColor, second: RgbaColor, weight: number): RgbaColor {
  const mix = clamp(weight, 0, 1);

  return {
    r: Math.round(first.r + (second.r - first.r) * mix),
    g: Math.round(first.g + (second.g - first.g) * mix),
    b: Math.round(first.b + (second.b - first.b) * mix),
    a: first.a + (second.a - first.a) * mix
  };
}

function getPerceivedBrightness(color: RgbaColor): number {
  return Math.sqrt(
    0.299 * color.r * color.r +
      0.587 * color.g * color.g +
      0.114 * color.b * color.b
  ) / 255;
}

function getRgbDistanceSquared(first: RgbaColor, second: RgbaColor): number {
  const red = first.r - second.r;
  const green = first.g - second.g;
  const blue = first.b - second.b;
  return red * red + green * green + blue * blue;
}

function areColorsClose(first: RgbaColor, second: RgbaColor, threshold: number): boolean {
  return getRgbDistanceSquared(first, second) <= threshold * threshold * 3;
}

function shortestHueDelta(from: number, to: number): number {
  const wrapped = ((to - from + 540) % 360) - 180;
  return wrapped;
}

function wrapHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function formatColor(color: RgbaColor): string {
  if (color.a >= 0.999) {
    return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
  }

  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")})`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampChannel(value: number): number {
  return Math.round(clamp(value, 0, 255));
}
