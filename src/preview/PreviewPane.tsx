import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { CompilerStatus, CompileResult } from "../compiler/typstCompiler";
import type { CompileDiagnostic } from "../compiler/types";
import { findActiveMarkdownBlockKey, renderMarkdownPreviewBlocks } from "../markdown/MarkdownPreviewBlocks";
import { shouldShowCompileActivity } from "../app/compilePreviewState";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeDefinition } from "../theme/themes";
import { scrollElementWithin } from "../utils/domScroll";
import {
  getRelativePathParent,
  joinRelativePaths,
  normalizeRelativePath
} from "../utils/relativePath";
import { createPdfPreviewCacheKey } from "./pdfPreviewCacheKey";
import {
  applyPdfCanvasZoom,
  prewarmPdfCanvasResolution,
  refinePdfCanvasResolution,
  renderPdfArtifactToCanvas
} from "./pdfCanvasRenderer";
import { applyTypstCanvasZoom, renderTypstArtifactToCanvas } from "./typstCanvasRenderer";
export { zoomPreviewByWheel } from "./previewZoom";
import { renderSourceMappingOverlay } from "./sourceMappingOverlay";
import { resolveSynctexForwardSearch, resolveSynctexReverseSearch, type PdfPreviewPoint } from "./synctex";
import {
  createSourceRange,
  parseSourceLocation,
  type PreviewRect,
  type PreviewSourceLink,
  type SourcePosition
} from "./sourceLinks";

interface PreviewPaneProps {
  result: CompileResult | null;
  lastSuccessfulResult: Extract<CompileResult, { ok: true }> | null;
  isErrorSettled: boolean;
  isCompiling: boolean;
  compilerStatus: CompilerStatus;
  paperView?: boolean;
  showToolbar?: boolean;
  activeSource?: SourcePosition | null;
  forwardSearchSource?: SourcePosition | null;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  onDebugRequested?: () => void;
  sourceLineCount?: number;
  sourcePath?: string;
  zoom?: PreviewZoomState;
  onZoomChange?: (zoom: PreviewZoomState) => void;
  workspacePreview?: WorkspacePreviewFile | null;
  viewportPadding?: number;
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
  assets?: readonly WorkspacePreviewAsset[];
}

export interface WorkspacePreviewAsset {
  path: string;
  content: string | Uint8Array;
  mimeType: string;
}

const ZOOM_PERCENT_STEPS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300];
export const DEFAULT_ZOOM: PreviewZoomState = {
  mode: "fit-width",
  percent: 100
};

const PAPER_PREVIEW_BACKGROUND = "#ffffff";
const PAPER_PREVIEW_FOREGROUND = "#000000";

export function PreviewPane({
  result,
  lastSuccessfulResult,
  isErrorSettled,
  isCompiling,
  compilerStatus,
  paperView = false,
  showToolbar = true,
  activeSource = null,
  forwardSearchSource = null,
  onSourceJump,
  onDebugRequested,
  sourceLineCount,
  sourcePath,
  zoom,
  onZoomChange,
  workspacePreview,
  viewportPadding = 28
}: PreviewPaneProps) {
  const { theme } = useTheme();
  const [internalZoom, setInternalZoom] = useState<PreviewZoomState>(DEFAULT_ZOOM);
  const currentZoom = zoom ?? internalZoom;
  const setZoom = onZoomChange ?? setInternalZoom;
  const showCompilerActivity = shouldShowCompileActivity({
    compilerStatus,
    hasActiveCompileWork: true,
    isActiveCompileTarget: true,
    isCompiling
  });

  if (workspacePreview) {
    const isPdfPreview = workspacePreview.mimeType === "application/pdf";

    return (
      <div className={getPreviewLayoutClassName(paperView, isPdfPreview)}>
        <div className={`preview-surface ${paperView ? "preview-surface--paper" : ""}`}>
          <WorkspaceFilePreview
            activeSource={activeSource}
            file={workspacePreview}
            forwardSearchSource={forwardSearchSource}
            onSourceJump={onSourceJump}
            paperView={paperView}
            theme={theme}
            zoom={currentZoom}
          />
          {showCompilerActivity ? (
            <PreviewActivityStatus docked onDebugRequested={onDebugRequested} status={compilerStatus} />
          ) : null}
        </div>
      </div>
    );
  }

  if (result === null) {
    return (
      <div
        className={`preview-state ${paperView ? "preview-state--paper" : ""} ${
          showCompilerActivity ? "preview-state--compiling" : ""
        }`}
      >
        <div className="preview-status">
          <PreviewActivityStatus
            docked={showCompilerActivity}
            onDebugRequested={onDebugRequested}
            status={showCompilerActivity ? compilerStatus : null}
          />
        </div>
      </div>
    );
  }

  if (!result.ok) {
    const fallbackResult = lastSuccessfulResult;
    const isPdfPreview = fallbackResult?.output.kind === "pdf";

    return (
      <div className={getPreviewLayoutClassName(paperView, Boolean(isPdfPreview))}>
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
            {fallbackResult.output.kind === "pdf" && fallbackResult.output.artifactData ? (
              <PdfPreview
                artifactData={fallbackResult.output.artifactData}
                cacheKey={createPdfPreviewCacheKey(
                  `compile:${sourcePath ?? "preview"}`,
                  fallbackResult.output.artifactData
                )}
                isFaulted={isErrorSettled}
                paperView={paperView}
                theme={theme}
                zoom={currentZoom}
              />
            ) : shouldUseChromiumCanvasPreview() ? (
              <ChromiumCanvasPreview
                artifactData={fallbackResult.output.artifactData!}
                isFaulted={isErrorSettled}
                paperView={paperView}
                zoom={currentZoom}
              />
            ) : (
              <PreviewDocument
                artifactData={fallbackResult.output.artifactData}
                isCompiling={isCompiling}
                isFaulted={isErrorSettled}
                paperView={paperView}
                markup={fallbackResult.output.content}
                onSourceJump={onSourceJump}
                sourceLineCount={sourceLineCount}
                sourcePath={sourcePath}
                theme={theme}
                zoom={currentZoom}
                viewportPadding={viewportPadding}
              />
            )}
            {showCompilerActivity ? (
              <PreviewActivityStatus docked onDebugRequested={onDebugRequested} status={compilerStatus} />
            ) : null}
          </div>
        ) : (
          <div className="preview-state">
            <div className="preview-status">
              <p>The preview could not be generated.</p>
              <PreviewFailureDetails
                detail={compilerStatus.detail}
                errors={result.errors}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  const isPdfPreview = result.output.kind === "pdf";

  return (
    <div className={getPreviewLayoutClassName(paperView, isPdfPreview)}>
      <div className={`preview-surface ${paperView ? "preview-surface--paper" : ""}`}>
        {showToolbar ? (
          <div className="preview-toolbar">
            <PreviewZoomControls
              onZoomChange={setZoom}
              zoom={currentZoom}
            />
          </div>
        ) : null}
        {result.output.kind === "pdf" && result.output.artifactData ? (
          <PdfPreview
            artifactData={result.output.artifactData}
            cacheKey={createPdfPreviewCacheKey(
              `compile:${sourcePath ?? "preview"}`,
              result.output.artifactData
            )}
            forwardSearchSource={forwardSearchSource}
            onSourceJump={onSourceJump}
            paperView={paperView}
            sourceLineCount={sourceLineCount}
            sourceMapData={result.output.sourceMapData}
            sourcePath={sourcePath}
            theme={theme}
            zoom={currentZoom}
          />
        ) : shouldUseChromiumCanvasPreview() ? (
          <ChromiumCanvasPreview
            artifactData={result.output.artifactData!}
            paperView={paperView}
            zoom={currentZoom}
          />
        ) : (
            <PreviewDocument
              artifactData={result.output.artifactData}
              forwardSearchSource={forwardSearchSource}
              isCompiling={isCompiling}
              paperView={paperView}
              markup={result.output.content}
              onSourceJump={onSourceJump}
              sourceLineCount={sourceLineCount}
              sourcePath={sourcePath}
              theme={theme}
              zoom={currentZoom}
              viewportPadding={viewportPadding}
            />
        )}
        {showCompilerActivity ? (
          <PreviewActivityStatus docked onDebugRequested={onDebugRequested} status={compilerStatus} />
        ) : null}
      </div>
    </div>
  );
}

function getPreviewLayoutClassName(paperView: boolean, edgeToEdge: boolean): string {
  return `preview-layout ${paperView ? "preview-layout--paper" : ""} ${
    edgeToEdge ? "preview-layout--edge-to-edge" : ""
  }`;
}

function PreviewFailureDetails({
  detail,
  errors
}: {
  detail?: string;
  errors: CompileDiagnostic[];
}) {
  const messages = [
    ...errors.map((error) => error.message),
    detail
  ].filter((message): message is string => Boolean(message?.trim()));
  const uniqueMessages = Array.from(new Set(messages));

  if (uniqueMessages.length === 0) {
    return null;
  }

  return (
    <div className="preview-status__details">
      {uniqueMessages.map((message) => (
        <p className="preview-status__detail" key={message}>
          {message}
        </p>
      ))}
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
  const customZoomPercent =
    zoom.mode === "percent" && !ZOOM_PERCENT_STEPS.includes(zoom.percent)
      ? zoom.percent
      : null;
  const selectValue =
    zoom.mode === "percent"
      ? `${zoom.percent}`
      : zoom.mode;

  return (
    <div className="preview-zoom-controls" aria-label="Preview zoom controls">
      <button
        aria-label="Zoom out"
        className="pane__button pane__icon-button preview-zoom-button"
        onClick={() => onZoomChange(nextZoomStep(zoom, -1))}
        title="Zoom out"
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
        {customZoomPercent !== null ? (
          <option value={`${customZoomPercent}`}>{customZoomPercent}%</option>
        ) : null}
        {ZOOM_PERCENT_STEPS.map((percent) => (
          <option key={percent} value={`${percent}`}>
            {percent}%
          </option>
        ))}
      </select>
      <button
        aria-label="Zoom in"
        className="pane__button pane__icon-button preview-zoom-button"
        onClick={() => onZoomChange(nextZoomStep(zoom, 1))}
        title="Zoom in"
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
    <span className="preview-status-icon-wrap" aria-label={label} title={label}>
      <span
        aria-hidden="true"
        className={`preview-status-icon preview-status-icon--${kind}`}
      />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

function PreviewActivityStatus({
  centered = false,
  docked = false,
  onDebugRequested,
  status
}: {
  centered?: boolean;
  docked?: boolean;
  onDebugRequested?: () => void;
  status: CompilerStatus | null;
}) {
  if (!status) {
    return null;
  }

  return (
    <PreviewActivityStatusBody
      centered={centered}
      docked={docked}
      onDebugRequested={onDebugRequested}
      status={status}
    />
  );
}

function PreviewActivityStatusBody({
  centered,
  docked,
  onDebugRequested,
  status
}: {
  centered: boolean;
  docked: boolean;
  onDebugRequested?: () => void;
  status: CompilerStatus;
}) {
  const progress = usePreviewActivityProgress(status);
  const showDebugButton = Boolean(onDebugRequested && /latex/i.test(`${status.label} ${status.detail ?? ""}`));

  return (
    <div
      className={`preview-activity ${centered ? "preview-activity--centered" : ""} ${
        docked ? "preview-activity--docked" : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="preview-activity__row">
        <span className="preview-activity__label">{status.label}</span>
        {showDebugButton ? (
          <button
            aria-label="Open Debug tab"
            className="preview-activity__debug-button"
            onClick={onDebugRequested}
            title="Open Debug tab"
            type="button"
          >
            i
          </button>
        ) : null}
      </div>
      {status.detail ? (
        <p className="preview-activity__detail">{status.detail}</p>
      ) : null}
      <div
        className="preview-activity__bar"
        role="progressbar"
        aria-label={status.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.percent)}
      >
        <span
          className="preview-activity__bar-fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

function usePreviewActivityProgress(
  status: CompilerStatus
): { percent: number } {
  const statusKey = `${status.phase}:${status.label}:${status.detail ?? ""}`;
  const [progressState, setProgressState] = useState(() => {
    const startedAt = getPreviewNow();

    return {
      statusKey,
      phaseStartedAt: startedAt,
      visualPercent: resolvePreviewActivityPercent(status, 0)
    };
  });

  useEffect(() => {
    setProgressState((current) => {
      const now = getPreviewNow();
      const phaseChanged = current.statusKey !== statusKey;
      const phaseStartedAt = phaseChanged ? now : current.phaseStartedAt;
      const elapsedMs = phaseChanged ? 0 : now - phaseStartedAt;

      return {
        statusKey,
        phaseStartedAt,
        visualPercent: Math.max(
          current.visualPercent,
          resolvePreviewActivityPercent(status, elapsedMs)
        )
      };
    });
  }, [statusKey, status]);

  useEffect(() => {
    let frameId = 0;

    const tick = () => {
      setProgressState((current) => {
        const elapsedMs = getPreviewNow() - current.phaseStartedAt;

        return {
          ...current,
          visualPercent: Math.max(
            current.visualPercent,
            resolvePreviewActivityPercent(status, elapsedMs)
          )
        };
      });
      frameId = window.setTimeout(tick, 240);
    };

    tick();

    return () => {
      window.clearTimeout(frameId);
    };
  }, [status]);

  return {
    percent: Math.max(3, Math.min(98, progressState.visualPercent))
  };
}

function resolvePreviewActivityPercent(
  status: CompilerStatus,
  elapsedMs: number
): number {
  const range = getPreviewActivityPhaseRange(status.phase);
  const explicitProgress = normalizeExplicitProgress(status.progress);

  if (explicitProgress !== null) {
    return range.start + (range.end - range.start) * explicitProgress;
  }

  const phaseProgress = 1 - Math.exp(-elapsedMs / range.durationMs);
  return range.start + (range.end - range.start) * phaseProgress;
}

function normalizeExplicitProgress(
  progress: CompilerStatus["progress"] | undefined
): number | null {
  if (!progress || progress.total <= 0) {
    return null;
  }

  const total = Math.max(1, progress.total);
  const current = Math.max(0, Math.min(total, progress.current));
  return current / total;
}

function getPreviewActivityPhaseRange(
  phase: CompilerStatus["phase"]
): { start: number; end: number; durationMs: number } {
  switch (phase) {
    case "worker-starting":
      return { start: 3, end: 12, durationMs: 900 };
    case "loading-typst":
    case "loading-latex":
      return { start: 12, end: 32, durationMs: 1800 };
    case "loading-packages":
      return { start: 24, end: 48, durationMs: 2400 };
    case "loading-fonts":
      return { start: 18, end: 42, durationMs: 1800 };
    case "fallback-main-thread":
      return { start: 22, end: 52, durationMs: 1600 };
    case "compiling":
      return { start: 42, end: 88, durationMs: 5200 };
    case "rendering":
      return { start: 88, end: 96, durationMs: 1100 };
    case "ready":
      return { start: 98, end: 98, durationMs: 1 };
    case "idle":
    case "error":
    default:
      return { start: 3, end: 12, durationMs: 1200 };
  }
}

function getPreviewNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

interface CursorZoomAnchor {
  clientX: number;
  clientY: number;
  xRatio: number;
  yRatio: number;
}

function useCursorAnchoredZoom(
  viewportRef: { current: HTMLElement | null },
  contentRef: { current: HTMLElement | null },
  zoomScale: number
): void {
  const anchorRef = useRef<CursorZoomAnchor | null>(null);
  const previousScaleRef = useRef<number | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const captureAt = (clientX: number, clientY: number) => {
      const content = contentRef.current;

      if (!content) {
        return;
      }

      const rect = content.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      anchorRef.current = {
        clientX,
        clientY,
        xRatio: (clientX - rect.left) / rect.width,
        yRatio: (clientY - rect.top) / rect.height
      };
    };
    const handlePointerMove = (event: PointerEvent) => captureAt(event.clientX, event.clientY);
    const handleWheel = (event: WheelEvent) => captureAt(event.clientX, event.clientY);
    const handleTouch = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        return;
      }

      const first = event.touches.item(0);
      const second = event.touches.item(1);

      if (first && second) {
        captureAt(
          (first.clientX + second.clientX) / 2,
          (first.clientY + second.clientY) / 2
        );
      }
    };

    viewport.addEventListener("pointermove", handlePointerMove, { passive: true });
    viewport.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    viewport.addEventListener("touchstart", handleTouch, { capture: true, passive: true });
    viewport.addEventListener("touchmove", handleTouch, { capture: true, passive: true });

    return () => {
      viewport.removeEventListener("pointermove", handlePointerMove);
      viewport.removeEventListener("wheel", handleWheel, true);
      viewport.removeEventListener("touchstart", handleTouch, true);
      viewport.removeEventListener("touchmove", handleTouch, true);
    };
  }, [contentRef, viewportRef]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const previousScale = previousScaleRef.current;
    previousScaleRef.current = zoomScale;

    if (!viewport || !content || previousScale === null || previousScale === zoomScale) {
      return;
    }

    const anchor = anchorRef.current;

    if (anchor) {
      const rect = content.getBoundingClientRect();
      viewport.scrollLeft += rect.left + rect.width * anchor.xRatio - anchor.clientX;
      viewport.scrollTop += rect.top + rect.height * anchor.yRatio - anchor.clientY;
      return;
    }

    const scaleRatio = zoomScale / previousScale;
    viewport.scrollLeft =
      (viewport.scrollLeft + viewport.clientWidth / 2) * scaleRatio - viewport.clientWidth / 2;
    viewport.scrollTop =
      (viewport.scrollTop + viewport.clientHeight / 2) * scaleRatio - viewport.clientHeight / 2;
  }, [contentRef, viewportRef, zoomScale]);
}

function PreviewDocument({
  artifactData,
  forwardSearchSource,
  isCompiling = false,
  paperView = false,
  markup,
  isFaulted = false,
  onSourceJump,
  sourceLineCount,
  sourcePath,
  theme,
  zoom,
  viewportPadding = 28
}: {
  artifactData?: Uint8Array;
  forwardSearchSource?: SourcePosition | null;
  isCompiling?: boolean;
  paperView?: boolean;
  markup: string;
  isFaulted?: boolean;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  sourceLineCount?: number;
  sourcePath?: string;
  theme: ThemeDefinition;
  zoom: PreviewZoomState;
  viewportPadding?: number;
}) {
  const normalizedMarkup = useMemo(
    () => normalizePreviewSvg(markup, paperView, theme),
    [markup, paperView, theme]
  );
  const displayMarkup = normalizedMarkup;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const semanticForwardSearchKeyRef = useRef<string | null>(null);
  const [typstSyncMarker, setTypstSyncMarker] = useState<PreviewRect | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [imageState, setImageState] = useState<{
    blobUrl: string;
    status: "loading" | "loaded" | "error";
  } | null>(null);
  const dimensions = useMemo(
    () => extractSvgDimensions(displayMarkup),
    [displayMarkup]
  );
  const resolvedZoom = useMemo(
    () => resolveZoomValue(zoom, viewportSize, dimensions),
    [dimensions, viewportSize, zoom]
  );
  useCursorAnchoredZoom(viewportRef, canvasRef, resolvedZoom.scale);

  const { blobUrl, blobStartedAt } = useMemo(() => {
    const startedAt =
      typeof performance === "undefined" ? 0 : performance.now();
    const blob = new Blob([displayMarkup], { type: "image/svg+xml" });
    return {
      blobUrl: URL.createObjectURL(blob),
      blobStartedAt: startedAt
    };
  }, [displayMarkup]);

  useEffect(() => {
    logPreviewTiming("svg", blobStartedAt);

    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobStartedAt, blobUrl]);

  useEffect(() => {
    if (!typstSyncMarker) {
      return;
    }

    const timeout = window.setTimeout(() => setTypstSyncMarker(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [typstSyncMarker]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize({
        width: Math.max(0, viewport.clientWidth - viewportPadding),
        height: Math.max(0, viewport.clientHeight - viewportPadding)
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
  }, [viewportPadding]);

  const hasMeasuredViewport = viewportSize.width > 0;
  const hasStablePreviewLayout = hasMeasuredViewport && dimensions !== null;
  const baseScale =
    dimensions && viewportSize.width > 0
      ? viewportSize.width / dimensions.width
      : 1;
  const baseContentWidth =
    dimensions && hasMeasuredViewport
      ? Math.max(1, dimensions.width * baseScale)
      : Math.max(1, viewportSize.width || 0);
  const baseContentHeight =
    dimensions && hasMeasuredViewport
      ? Math.max(1, dimensions.height * baseScale)
      : 1;
  const contentWidth =
    dimensions && hasMeasuredViewport
      ? Math.max(1, dimensions.width * resolvedZoom.scale)
      : baseContentWidth;
  const contentHeight =
    dimensions && hasMeasuredViewport
      ? Math.max(1, dimensions.height * resolvedZoom.scale)
      : baseContentHeight;
  const liveZoomScale = baseScale > 0 ? resolvedZoom.scale / baseScale : 1;
  const currentImageStatus =
    imageState?.blobUrl === blobUrl ? imageState.status : "loading";
  const typstForwardSearchKey = forwardSearchSource
    ? createPreviewSourcePositionKey(forwardSearchSource)
    : null;
  const handleTypstForwardSearch = useCallback((element: HTMLElement, source: SourcePosition) => {
    if (!canvasRef.current || !viewportRef.current) {
      return;
    }

    semanticForwardSearchKeyRef.current = createPreviewSourcePositionKey(source);
    scrollElementWithin(viewportRef.current, element, {
      behavior: "smooth",
      block: "center",
      inline: "center"
    });
    setTypstSyncMarker(getLocalPreviewRect(canvasRef.current, element));
  }, []);

  useEffect(() => {
    if (!forwardSearchSource || !typstForwardSearchKey || !canvasRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (semanticForwardSearchKeyRef.current === typstForwardSearchKey || !canvasRef.current) {
        return;
      }

      scrollTypstPreviewToApproximateSourceLine(
        viewportRef.current,
        canvasRef.current,
        forwardSearchSource,
        sourceLineCount
      );
    }, 420);

    return () => window.clearTimeout(timeout);
  }, [forwardSearchSource, sourceLineCount, typstForwardSearchKey]);

  return (
    <div
      className={`preview-document ${isFaulted ? "preview-document--faulted" : ""}`}
      ref={viewportRef}
    >
      <div
        className="preview-document__canvas-sizer"
        style={{
          height: hasStablePreviewLayout ? `${contentHeight}px` : undefined,
          width: hasStablePreviewLayout ? `${contentWidth}px` : "100%"
        }}
      >
      <div
        className={`preview-document__canvas ${
          hasStablePreviewLayout ? "preview-document__canvas--transformed" : "preview-document__canvas--pending"
        }`}
        ref={canvasRef}
        onDoubleClick={onSourceJump
          ? (event) => {
              if (event.defaultPrevented) {
                return;
              }

              onSourceJump(createFallbackPreviewSourceLink(
                event.currentTarget,
                event.clientY,
                sourcePath,
                sourceLineCount
              ));
            }
          : undefined}
        style={{
          transform: hasStablePreviewLayout ? `scale(${liveZoomScale})` : undefined,
          width: hasMeasuredViewport ? `${baseContentWidth}px` : "100%"
        }}
      >
        <img
          alt="Typst preview document"
          className="preview-document__object"
          draggable={false}
          onError={() => setImageState({ blobUrl, status: "error" })}
          onLoad={() => setImageState({ blobUrl, status: "loaded" })}
          src={blobUrl}
        />
        {currentImageStatus === "loading" ? (
          <div className="preview-document__loading">
            <PreviewActivityStatus
              centered
              status={{
                phase: "rendering",
                mode: "worker",
                label: "Loading rendered page",
                detail: "Preparing the preview image"
              }}
            />
          </div>
        ) : null}
        {currentImageStatus === "error" ? (
          <div className="preview-document__loading preview-document__loading--error">
            Preview image failed to load.
          </div>
        ) : null}
        {typstSyncMarker ? <PreviewSyncMarker rect={typstSyncMarker} /> : null}
        {artifactData && onSourceJump ? (
          <PreviewSourceMappingOverlay
            artifactData={artifactData}
            isCompiling={isCompiling}
            forwardSearchSource={forwardSearchSource}
            onForwardSearch={handleTypstForwardSearch}
            onSourceJump={onSourceJump}
            sourceLineCount={sourceLineCount}
            sourcePath={sourcePath}
            overlayWidth={baseContentWidth}
            paperView={paperView}
          />
        ) : null}
      </div>
      </div>
    </div>
  );
}

function WorkspaceFilePreview({
  activeSource,
  forwardSearchSource,
  file,
  onSourceJump,
  paperView,
  theme,
  zoom
}: {
  activeSource: SourcePosition | null;
  forwardSearchSource?: SourcePosition | null;
  file: WorkspacePreviewFile;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  paperView: boolean;
  theme: ThemeDefinition;
  zoom: PreviewZoomState;
}) {
  const pdfArtifactData = useMemo(() => {
    return file.mimeType === "application/pdf"
      ? encodeWorkspacePreviewBytes(file.content)
      : null;
  }, [file.content, file.mimeType]);
  const pdfCacheKey = useMemo(() => {
    return pdfArtifactData
      ? createPdfPreviewCacheKey(`workspace:${file.path}`, pdfArtifactData)
      : undefined;
  }, [file.path, pdfArtifactData]);

  if (file.mimeType === "text/markdown") {
    return (
      <MarkdownFilePreview
        activeSource={activeSource}
        file={file}
        forwardSearchSource={forwardSearchSource}
        onSourceJump={onSourceJump}
        paperView={paperView}
        zoom={zoom}
      />
    );
  }

  if (file.mimeType === "application/pdf" && pdfArtifactData) {
    return (
      <PdfPreview
        artifactData={pdfArtifactData}
        cacheKey={pdfCacheKey}
        paperView={paperView}
        theme={theme}
        zoom={zoom}
      />
    );
  }

  return (
    <WorkspaceBinaryFilePreview
      file={file}
      paperView={paperView}
      theme={theme}
      zoom={zoom}
    />
  );
}

function WorkspaceBinaryFilePreview({
  file,
  paperView,
  theme,
  zoom
}: {
  file: WorkspacePreviewFile;
  paperView: boolean;
  theme: ThemeDefinition;
  zoom: PreviewZoomState;
}) {
  const documentRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [imageDimensions, setImageDimensions] = useState<{
    blobUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const blobUrl = useMemo(() => {
    const blob = buildWorkspacePreviewBlob(file, paperView, theme);

    return URL.createObjectURL(blob);
  }, [file, paperView, theme]);
  const dimensions = imageDimensions?.blobUrl === blobUrl ? imageDimensions : null;
  const resolvedZoom = useMemo(
    () => resolveZoomValue(zoom, viewportSize, dimensions),
    [dimensions, viewportSize, zoom]
  );

  useCursorAnchoredZoom(documentRef, imageRef, resolvedZoom.scale);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    const viewport = documentRef.current;

    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize({
        width: Math.max(1, viewport.clientWidth - 32),
        height: Math.max(1, viewport.clientHeight - 32)
      });
    };

    updateViewportSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportSize);
      return () => window.removeEventListener("resize", updateViewportSize);
    }

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`preview-document preview-document--asset ${
        paperView ? "preview-document--paper" : ""
      }`}
      ref={documentRef}
    >
      <div className="preview-file-preview">
        <img
          alt={file.name}
          className="preview-file-preview__image"
          draggable={false}
          onLoad={(event) => {
            setImageDimensions({
              blobUrl,
              width: Math.max(1, event.currentTarget.naturalWidth),
              height: Math.max(1, event.currentTarget.naturalHeight)
            });
          }}
          ref={imageRef}
          src={blobUrl}
          style={dimensions ? {
            width: `${dimensions.width * resolvedZoom.scale}px`,
            height: `${dimensions.height * resolvedZoom.scale}px`
          } : undefined}
        />
      </div>
    </div>
  );
}

function createMarkdownAssetUrlMap(
  assets: readonly WorkspacePreviewAsset[] | undefined
): ReadonlyMap<string, string> {
  const urls = new Map<string, string>();

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return urls;
  }

  for (const asset of assets ?? []) {
    const path = normalizeRelativePath(asset.path);

    if (!path || urls.has(path)) {
      continue;
    }

    urls.set(
      path,
      URL.createObjectURL(
        new Blob([encodeWorkspacePreviewBlobPart(asset.content)], {
          type: asset.mimeType
        })
      )
    );
  }

  return urls;
}

function resolveMarkdownAssetHref(
  sourcePath: string,
  href: string,
  assetUrls: ReadonlyMap<string, string>
): string | null {
  const trimmedHref = href.trim();

  if (
    !trimmedHref ||
    trimmedHref.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmedHref)
  ) {
    return null;
  }

  const pathWithoutSuffix = trimmedHref.split(/[?#]/, 1)[0];
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathWithoutSuffix);
  } catch {
    return null;
  }

  const sourceDirectory = getRelativePathParent(sourcePath);
  const resolvedPath = normalizeRelativePath(
    decodedPath.startsWith("/")
      ? decodedPath.slice(1)
      : joinRelativePaths(sourceDirectory, decodedPath)
  );

  if (
    !resolvedPath ||
    resolvedPath === ".." ||
    resolvedPath.startsWith("../")
  ) {
    return null;
  }

  return assetUrls.get(resolvedPath) ?? null;
}

function MarkdownFilePreview({
  activeSource,
  forwardSearchSource,
  file,
  onSourceJump,
  paperView,
  zoom
}: {
  activeSource: SourcePosition | null;
  forwardSearchSource?: SourcePosition | null;
  file: WorkspacePreviewFile;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  paperView: boolean;
  zoom: PreviewZoomState;
}) {
  const source = decodeWorkspaceTextContent(file.content);
  const sourcePath = file.path || file.name;
  const activeMarkdownSource =
    activeSource && normalizeSourcePathForPreview(activeSource.path) === normalizeSourcePathForPreview(sourcePath)
      ? activeSource
      : null;
  const forwardMarkdownSource =
    forwardSearchSource && normalizeSourcePathForPreview(forwardSearchSource.path) === normalizeSourcePathForPreview(sourcePath)
      ? forwardSearchSource
      : null;
  const assetUrls = useMemo(() => createMarkdownAssetUrlMap(file.assets), [file.assets]);
  const resolveImageHref = useCallback(
    (href: string) => resolveMarkdownAssetHref(file.path, href, assetUrls),
    [assetUrls, file.path]
  );
  const blocks = useMemo(
    () => renderMarkdownPreviewBlocks(source, {
      activeSource: activeMarkdownSource,
      onSourceJump,
      resolveImageHref,
      sourcePath
    }),
    [activeMarkdownSource, onSourceJump, resolveImageHref, source, sourcePath]
  );
  const activeBlockKey = useMemo(
    () => findActiveMarkdownBlockKey(source, activeMarkdownSource),
    [activeMarkdownSource, source]
  );
  const forwardBlockKey = useMemo(
    () => findActiveMarkdownBlockKey(source, forwardMarkdownSource),
    [forwardMarkdownSource, source]
  );
  const articleRef = useRef<HTMLElement | null>(null);
  const documentRef = useRef<HTMLDivElement | null>(null);
  const markdownZoomScale = zoom.mode === "percent" ? zoom.percent / 100 : 1;
  useCursorAnchoredZoom(documentRef, articleRef, markdownZoomScale);
  const [markdownSyncMarker, setMarkdownSyncMarker] = useState<PreviewRect | null>(null);

  useEffect(() => {
    return () => {
      for (const url of assetUrls.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [assetUrls]);

  useEffect(() => {
    if (!markdownSyncMarker) {
      return;
    }

    const timeout = window.setTimeout(() => setMarkdownSyncMarker(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [markdownSyncMarker]);

  useEffect(() => {
    if (!forwardBlockKey || !articleRef.current || !documentRef.current) {
      return;
    }

    const forwardBlock = articleRef.current.querySelector<HTMLElement>(
      `[data-source-block-key="${forwardBlockKey}"]`
    );

    if (!forwardBlock) {
      return;
    }

    scrollElementWithin(documentRef.current, forwardBlock, {
      behavior: "smooth",
      block: "center",
      inline: "center"
    });
    setMarkdownSyncMarker(getLocalPreviewRect(documentRef.current, forwardBlock));
  }, [forwardBlockKey]);

  useEffect(() => {
    if (!activeBlockKey || !articleRef.current) {
      return;
    }

    const activeBlock = articleRef.current.querySelector<HTMLElement>(
      `[data-source-block-key="${activeBlockKey}"]`
    );

    if (!activeBlock) {
      return;
    }

    if (documentRef.current) {
      scrollElementWithin(documentRef.current, activeBlock, {
        block: "center",
        inline: "center"
      });
    }
  }, [activeBlockKey]);

  return (
    <div
      ref={documentRef}
      className={`preview-document preview-document--markdown ${
        paperView ? "preview-document--paper" : ""
      }`}
    >
      {markdownSyncMarker ? <PreviewSyncMarker rect={markdownSyncMarker} /> : null}
      <article className="preview-markdown" aria-label={`${file.name} preview`} ref={articleRef} style={{ zoom: markdownZoomScale }}>
        {blocks.length > 0 ? blocks : (
          <p className="preview-markdown__empty">Empty Markdown file.</p>
        )}
      </article>
    </div>
  );
}

function getPreviewRectFromElement(element: HTMLElement): PreviewRect {
  const rect = element.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function createFallbackPreviewSourceLink(
  element: HTMLElement,
  clientY: number,
  sourcePath?: string,
  sourceLineCount?: number
): PreviewSourceLink {
  const rect = element.getBoundingClientRect();

  return {
    previewRect: getPreviewRectFromElement(element),
    source: createSourceRange({
      path: sourcePath,
      line: estimateSourceLineFromPreviewPosition(clientY, rect, sourceLineCount),
      column: 0
    })
  };
}

function estimateSourceLineFromPreviewPosition(
  clientY: number,
  rect: DOMRect,
  sourceLineCount?: number
): number {
  const totalLines = Math.max(1, Math.floor(sourceLineCount ?? 1));

  if (!Number.isFinite(clientY) || rect.height <= 0 || totalLines <= 1) {
    return 1;
  }

  const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));

  return Math.min(totalLines, Math.max(1, Math.round(ratio * (totalLines - 1)) + 1));
}

function normalizeSourcePathForPreview(path: string | undefined): string {
  return (path ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

function PreviewSourceMappingOverlay({
  artifactData,
  forwardSearchSource,
  isCompiling,
  onForwardSearch,
  onSourceJump,
  sourceLineCount,
  sourcePath,
  overlayWidth,
  paperView
}: {
  artifactData: Uint8Array;
  forwardSearchSource?: SourcePosition | null;
  isCompiling: boolean;
  onForwardSearch?: (element: HTMLElement, source: SourcePosition) => void;
  onSourceJump: (sourceLink: PreviewSourceLink) => void;
  sourceLineCount?: number;
  sourcePath?: string;
  overlayWidth: number;
  paperView: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<Awaited<ReturnType<typeof renderSourceMappingOverlay>> | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || isCompiling) {
      return;
    }

    let cancelled = false;
    let disposeOverlay = () => {};
    let disposeDoubleClickListener = () => {};
    const handle = window.setTimeout(() => {
      void renderSourceMappingOverlay(container, artifactData)
        .then((overlay) => {
          if (cancelled) {
            overlay.dispose();
            return;
          }

          overlayRef.current = overlay;
          const pendingForwardElement = forwardSearchSource
            ? overlay.resolveElementForSource(forwardSearchSource)
            : null;

          if (pendingForwardElement && forwardSearchSource) {
            onForwardSearch?.(pendingForwardElement, forwardSearchSource);
          } else if (forwardSearchSource) {
            logTypstSyncDebug("forward source not resolved", forwardSearchSource);
          }

          disposeOverlay = overlay.dispose;
          const interactionHost = container.parentElement ?? container;
          const handleDoubleClick = (event: MouseEvent) => {
            const sourceLocation =
              overlay.resolveSourceLocation(event.target) ??
              overlay.resolveSourceLocationAt({ x: event.clientX, y: event.clientY });
            const source = sourceLocation ? parseSourceLocation(sourceLocation) : null;

            if (source) {
              event.preventDefault();
              event.stopPropagation();
              logTypstSyncDebug("reverse source resolved", source);
              onSourceJump({
                previewRect: getPreviewRectFromElement(
                  event.target instanceof HTMLElement && container.contains(event.target)
                    ? event.target
                    : container
                ),
                source
              });
            } else {
              logTypstSyncDebug("reverse source not resolved", getTypstSemanticDebugSample(container));
              onSourceJump(createFallbackPreviewSourceLink(
                container.parentElement ?? container,
                event.clientY,
                sourcePath,
                sourceLineCount
              ));
            }
          };
          interactionHost.addEventListener("dblclick", handleDoubleClick, true);
          disposeDoubleClickListener = () => {
            interactionHost.removeEventListener("dblclick", handleDoubleClick, true);
          };
        })
        .catch((error) => {
          logTypstSyncDebug("overlay render failed", error);
          container.innerHTML = "";
          disposeDoubleClickListener();
          disposeDoubleClickListener = () => {};
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      disposeDoubleClickListener();
      overlayRef.current = null;
      disposeOverlay();
    };
  }, [artifactData, forwardSearchSource, isCompiling, onForwardSearch, onSourceJump, overlayWidth, paperView]);

  useEffect(() => {
    if (!forwardSearchSource || !onForwardSearch) {
      return;
    }

    const element = overlayRef.current?.resolveElementForSource(forwardSearchSource) ?? null;

    if (element) {
      onForwardSearch(element, forwardSearchSource);
    }
  }, [forwardSearchSource, onForwardSearch]);

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
  isFaulted = false,
  zoom
}: {
  artifactData: Uint8Array;
  paperView?: boolean;
  isFaulted?: boolean;
  zoom: PreviewZoomState;
}) {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
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

    void renderTypstArtifactToCanvas(container, artifactData)
      .then(() => {
        if (!cancelled) {
          applyTypstCanvasZoom(container, zoomRef.current);
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

  useLayoutEffect(() => {
    if (containerRef.current) {
      applyTypstCanvasZoom(containerRef.current, zoom);
    }
  }, [zoom]);


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

function PdfPreview({
  artifactData,
  cacheKey,
  paperView = false,
  isFaulted = false,
  forwardSearchSource = null,
  onSourceJump,
  sourceLineCount,
  sourceMapData,
  sourcePath,
  theme,
  zoom
}: {
  artifactData: Uint8Array;
  cacheKey?: string;
  paperView?: boolean;
  isFaulted?: boolean;
  forwardSearchSource?: SourcePosition | null;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  sourceLineCount?: number;
  sourceMapData?: Uint8Array;
  sourcePath?: string;
  theme: ThemeDefinition;
  zoom: PreviewZoomState;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  const zoomFocusRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const renderedPdfArtifactRef = useRef<Uint8Array | null>(null);
  const prewarmedPdfArtifactRef = useRef<Uint8Array | null>(null);
  const pdfTouchActiveRef = useRef(false);
  const pdfGestureActiveRef = useRef(false);
  const pdfResolutionWorkRef = useRef<Promise<void>>(Promise.resolve());
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pdfRenderRevision, setPdfRenderRevision] = useState(0);
  const [synctexMarker, setSynctexMarker] = useState<PreviewRect | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  zoomRef.current = zoom;

  const queuePdfResolutionWork = useCallback((work: () => Promise<void>): Promise<void> => {
    const queuedWork = pdfResolutionWorkRef.current
      .catch(() => undefined)
      .then(work);
    pdfResolutionWorkRef.current = queuedWork;
    return queuedWork;
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let frame = 0;
    const updateViewportSize = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = {
          width: container.clientWidth,
          height: container.clientHeight
        };

        setViewportSize((current) => {
          return current.width === next.width && current.height === next.height
            ? current
            : next;
        });
      });
    };

    updateViewportSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportSize);

      return () => {
        if (frame) {
          window.cancelAnimationFrame(frame);
        }
        window.removeEventListener("resize", updateViewportSize);
      };
    }

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(container);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const renderStartedAt =
      typeof performance === "undefined" ? 0 : performance.now();
    setRenderError(null);
    renderedPdfArtifactRef.current = null;
    prewarmedPdfArtifactRef.current = null;

    void renderPdfArtifactToCanvas(container, artifactData, {
      cacheKey,
      paperView,
      signal: abortController.signal,
      themeColors: {
        background: theme.palette.editorBackground,
        foreground: theme.palette.editorForeground
      },
      zoom: zoomRef.current
    })
      .then(() => {
        if (!cancelled) {
          applyPdfCanvasZoom(container, zoomRef.current, zoomFocusRef.current);
          logPreviewTiming("pdf-canvas", renderStartedAt);
          renderedPdfArtifactRef.current = artifactData;
          setPdfRenderRevision((current) => current + 1);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRenderError(
            error instanceof Error ? error.message : "PDF canvas preview failed."
          );
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      if (renderedPdfArtifactRef.current === artifactData) {
        renderedPdfArtifactRef.current = null;
      }
    };
  }, [
    artifactData,
    cacheKey,
    paperView,
    theme.palette.editorBackground,
    theme.palette.editorForeground,
  ]);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    applyPdfCanvasZoom(container, zoom, zoomFocusRef.current);
  }, [viewportSize.height, viewportSize.width, zoom]);


  useEffect(() => {
    const container = containerRef.current;

    if (
      !container ||
      pdfRenderRevision === 0 ||
      renderedPdfArtifactRef.current !== artifactData ||
      prewarmedPdfArtifactRef.current === artifactData
    ) {
      return;
    }

    const abortController = new AbortController();
    const signal = abortController.signal;
    const cancelIdleWork = schedulePdfIdleWork(() => {
      void queuePdfResolutionWork(() =>
        prewarmPdfCanvasResolution(container, artifactData, {
          paperView,
          signal,
          themeColors: {
            background: theme.palette.editorBackground,
            foreground: theme.palette.editorForeground
          }
        })
      )
        .then(() => {
          if (!signal.aborted) {
            prewarmedPdfArtifactRef.current = artifactData;
          }
        })
        .catch((error) => {
          if (!signal.aborted) {
            console.warn("[typr] PDF resolution prewarm failed.", error);
          }
        });
    });

    const cancelForInteraction = () => {
      cancelIdleWork();
      abortController.abort();
    };
    container.addEventListener("touchstart", cancelForInteraction, { passive: true });
    container.addEventListener("gesturestart", cancelForInteraction, { passive: true });
    container.addEventListener("wheel", cancelForInteraction, { passive: true });

    return () => {
      container.removeEventListener("touchstart", cancelForInteraction);
      container.removeEventListener("gesturestart", cancelForInteraction);
      container.removeEventListener("wheel", cancelForInteraction);
      cancelIdleWork();
      abortController.abort();
    };
  }, [
    artifactData,
    paperView,
    pdfRenderRevision,
    queuePdfResolutionWork,
    theme.palette.editorBackground,
    theme.palette.editorForeground
  ]);

  useEffect(() => {
    const container = containerRef.current;

    if (
      !container ||
      pdfRenderRevision === 0 ||
      renderedPdfArtifactRef.current !== artifactData
    ) {
      return;
    }

    let timeout = 0;
    let refinementAbortController: AbortController | null = null;
    const isInteractionActive = () =>
      pdfTouchActiveRef.current || pdfGestureActiveRef.current;
    const runRefinement = () => {
      if (isInteractionActive()) {
        timeout = window.setTimeout(runRefinement, 180);
        return;
      }

      refinementAbortController?.abort();
      refinementAbortController = new AbortController();
      const signal = refinementAbortController.signal;

      void queuePdfResolutionWork(() =>
        refinePdfCanvasResolution(container, artifactData, {
          maxPixelsPerTarget: container.clientWidth <= 720 ? 9_000_000 : undefined,
          maxTargets: 1,
          paperView,
          signal,
          themeColors: {
            background: theme.palette.editorBackground,
            foreground: theme.palette.editorForeground
          }
        })
      ).catch((error) => {
        if (!signal.aborted) {
          console.warn("[typr] PDF resolution refinement failed.", error);
        }
      });
    };
    const scheduleRefinement = (delay: number) => {
      window.clearTimeout(timeout);
      refinementAbortController?.abort();
      timeout = window.setTimeout(runRefinement, delay);
    };
    const pauseRefinement = () => {
      window.clearTimeout(timeout);
      refinementAbortController?.abort();
    };
    const handleTouchStart = (event: TouchEvent) => {
      pdfTouchActiveRef.current = event.touches.length > 0;
      pauseRefinement();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      pdfTouchActiveRef.current = event.touches.length > 0;
      if (!isInteractionActive()) {
        scheduleRefinement(420);
      }
    };
    const handleGestureStart = () => {
      pdfGestureActiveRef.current = true;
      pauseRefinement();
    };
    const handleGestureEnd = () => {
      pdfGestureActiveRef.current = false;
      if (!isInteractionActive()) {
        scheduleRefinement(420);
      }
    };
    const handleWheel = () => scheduleRefinement(420);
    const handleScroll = () => scheduleRefinement(360);

    scheduleRefinement(600);
    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    container.addEventListener("gesturestart", handleGestureStart, { passive: true });
    container.addEventListener("gestureend", handleGestureEnd, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      window.clearTimeout(timeout);
      refinementAbortController?.abort();
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
      container.removeEventListener("gesturestart", handleGestureStart);
      container.removeEventListener("gestureend", handleGestureEnd);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [
    artifactData,
    paperView,
    pdfRenderRevision,
    queuePdfResolutionWork,
    theme.palette.editorBackground,
    theme.palette.editorForeground,
    viewportSize.height,
    viewportSize.width,
    zoom
  ]);


  useEffect(() => {
    if (!sourceMapData || !forwardSearchSource) {
      return;
    }

    const sourceLink = resolveSynctexForwardSearch(sourceMapData, forwardSearchSource);

    if (!sourceLink?.previewRect) {
      return;
    }

    scrollPdfPreviewToRect(containerRef.current, sourceLink.previewRect);
    setSynctexMarker(getPdfContainerRect(containerRef.current, sourceLink.previewRect));
  }, [forwardSearchSource, sourceMapData]);

  useEffect(() => {
    if (!synctexMarker) {
      return;
    }

    const timeout = window.setTimeout(() => setSynctexMarker(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [synctexMarker]);
  if (renderError) {
    return (
      <div className={`preview-document ${isFaulted ? "preview-document--faulted" : ""}`}>
        <div className="preview-canvas-error">{renderError}</div>
      </div>
    );
  }

  return (
    <div
      className={`preview-document preview-document--canvas preview-document--pdf-canvas ${
        paperView ? "preview-document--pdf-paper" : ""
      } ${isFaulted ? "preview-document--faulted" : ""}`}
      onPointerMove={(event) => {
        zoomFocusRef.current = { clientX: event.clientX, clientY: event.clientY };
      }}
      onTouchMove={(event) => {
        if (event.touches.length < 2) {
          return;
        }

        const first = event.touches.item(0);
        const second = event.touches.item(1);

        if (first && second) {
          zoomFocusRef.current = {
            clientX: (first.clientX + second.clientX) / 2,
            clientY: (first.clientY + second.clientY) / 2
          };
        }
      }}
      onWheelCapture={(event) => {
        zoomFocusRef.current = { clientX: event.clientX, clientY: event.clientY };
      }}
      onDoubleClick={onSourceJump
        ? (event) => {
            const point = getPdfPreviewPointFromEvent(event, containerRef.current);
            const sourceLink = point && sourceMapData
              ? resolveSynctexReverseSearch(sourceMapData, point)
              : null;
            const fallbackLink = !sourceLink && point
              ? createFallbackPreviewSourceLink(
                  findPdfPageElement(event.target, containerRef.current ?? event.currentTarget) ?? event.currentTarget,
                  event.clientY,
                  sourcePath,
                  sourceLineCount
                )
              : null;

            event.preventDefault();
            event.stopPropagation();
            logPdfSourceJumpMode(sourceLink ? "synctex" : "fallback", Boolean(sourceMapData));
            onSourceJump(sourceLink ?? fallbackLink ?? createFallbackPreviewSourceLink(
              event.currentTarget,
              event.clientY,
              sourcePath,
              sourceLineCount
            ));
          }
        : undefined}
      ref={containerRef}
    >
      {synctexMarker ? <PreviewSyncMarker rect={synctexMarker} /> : null}
    </div>
  );
}

function getLocalPreviewRect(container: HTMLElement, element: HTMLElement): PreviewRect {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  return {
    left: elementRect.left - containerRect.left + container.scrollLeft,
    top: elementRect.top - containerRect.top + container.scrollTop,
    width: elementRect.width,
    height: elementRect.height
  };
}

function createPreviewSourcePositionKey(source: SourcePosition): string {
  return [source.path ?? "", source.line, source.column].join(":");
}

function scrollTypstPreviewToApproximateSourceLine(
  viewport: HTMLElement | null,
  canvas: HTMLElement,
  source: SourcePosition,
  sourceLineCount: number | undefined
): void {
  if (!viewport) {
    return;
  }

  const totalLines = Math.max(1, Math.floor(sourceLineCount ?? source.line));
  const ratio = totalLines <= 1 ? 0 : Math.min(1, Math.max(0, (source.line - 1) / (totalLines - 1)));
  const targetTop = ratio * Math.max(0, canvas.offsetHeight - viewport.clientHeight);

  viewport.scrollTo({
    left: viewport.scrollLeft,
    top: Math.max(0, targetTop),
    behavior: "smooth"
  });
}

function logPdfSourceJumpMode(mode: "synctex" | "fallback", hasSourceMapData: boolean): void {
  if (typeof console === "undefined") {
    return;
  }

  console.debug("[typr] PDF source jump used " + mode + (hasSourceMapData ? " with" : " without") + " SyncTeX data");
}

function PreviewSyncMarker({ rect }: { rect: PreviewRect }) {
  return (
    <div
      aria-hidden="true"
      className="pdf-synctex-marker"
      style={{
        left: String(rect.left + rect.width / 2) + "px",
        top: String(rect.top + rect.height / 2) + "px"
      }}
    />
  );
}

function getPdfPreviewPointFromEvent(
  event: ReactMouseEvent<HTMLElement>,
  container: HTMLElement | null
): PdfPreviewPoint | null {
  if (!container) {
    return null;
  }

  const page = findPdfPageElement(event.target, container);

  if (!page) {
    return null;
  }

  const pageRect = page.getBoundingClientRect();
  const naturalWidth = Number.parseFloat(page.dataset.pdfNaturalWidth ?? "");
  const naturalHeight = Number.parseFloat(page.dataset.pdfNaturalHeight ?? "");
  const pageIndex = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas")).indexOf(page);

  if (pageIndex < 0 || pageRect.width <= 0 || pageRect.height <= 0) {
    return null;
  }

  return {
    pageNumber: pageIndex + 1,
    x: ((event.clientX - pageRect.left) / pageRect.width) * (Number.isFinite(naturalWidth) ? naturalWidth : page.offsetWidth),
    y: ((event.clientY - pageRect.top) / pageRect.height) * (Number.isFinite(naturalHeight) ? naturalHeight : page.offsetHeight)
  };
}

function getPdfContainerRect(container: HTMLElement | null, rect: PreviewRect): PreviewRect | null {
  if (!container) {
    return null;
  }

  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));
  const page = pages[Math.max(0, (rect.pageNumber ?? 1) - 1)];

  if (!page) {
    return null;
  }

  const naturalWidth = Number.parseFloat(page.dataset.pdfNaturalWidth ?? "");
  const naturalHeight = Number.parseFloat(page.dataset.pdfNaturalHeight ?? "");
  const scaleX = page.offsetWidth / (Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : page.offsetWidth || 1);
  const scaleY = page.offsetHeight / (Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : page.offsetHeight || 1);

  return {
    pageNumber: rect.pageNumber,
    left: page.offsetLeft + rect.left * scaleX,
    top: page.offsetTop + rect.top * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY
  };
}

function scrollPdfPreviewToRect(container: HTMLElement | null, rect: PreviewRect): void {
  if (!container) {
    return;
  }

  const pages = Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"));
  const page = pages[Math.max(0, (rect.pageNumber ?? 1) - 1)];

  if (!page) {
    return;
  }

  const naturalWidth = Number.parseFloat(page.dataset.pdfNaturalWidth ?? "");
  const naturalHeight = Number.parseFloat(page.dataset.pdfNaturalHeight ?? "");
  const scaleX = page.offsetWidth / (Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : page.offsetWidth || 1);
  const scaleY = page.offsetHeight / (Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : page.offsetHeight || 1);
  const targetLeft = page.offsetLeft + (rect.left + rect.width / 2) * scaleX - container.clientWidth / 2;
  const targetTop = page.offsetTop + (rect.top + rect.height / 2) * scaleY - container.clientHeight / 2;

  container.scrollTo({
    left: Math.max(0, targetLeft),
    top: Math.max(0, targetTop),
    behavior: "smooth"
  });
}

function findPdfPageElement(target: EventTarget | null, container: HTMLElement): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>(".pdf-page.canvas")
    : container.querySelector<HTMLElement>(".pdf-page.canvas");
}

function getTypstSemanticDebugSample(container: HTMLElement): Array<Record<string, string>> {
  return Array.from(container.querySelectorAll<HTMLElement>(".typst-html-semantics *"))
    .slice(0, 8)
    .map((element) => {
      const attrs: Record<string, string> = { tag: element.tagName.toLowerCase() };

      for (const attribute of Array.from(element.attributes).slice(0, 8)) {
        attrs[attribute.name] = attribute.value.slice(0, 160);
      }

      return attrs;
    });
}

function logTypstSyncDebug(message: string, detail?: unknown): void {
  if (typeof console === "undefined") {
    return;
  }

  console.debug("[typr] Typst sync " + message, detail ?? "");
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
        <summary>Output excerpt</summary>
        <pre>{debugInfo.excerpt}</pre>
      </details>
    </section>
  );
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
    excerpt: formatPreviewDebugExcerpt(markup)
  };
}

function formatPreviewDebugExcerpt(markup: string): string {
  const limit = 2500;

  if (markup.length <= limit * 2) {
    return markup;
  }

  return [
    markup.slice(0, limit),
    "\n\n... output truncated ...\n\n",
    markup.slice(-limit)
  ].join("");
}

function shouldUseChromiumCanvasPreview(): boolean {
  return false;
}

function schedulePdfIdleWork(callback: () => void): () => void {
  const idleWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number }
    ) => number;
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 1200 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timeout = window.setTimeout(callback, 350);
  return () => window.clearTimeout(timeout);
}

function logPreviewTiming(mode: "svg" | "canvas" | "pdf-canvas", startedAt: number): void {
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

    svg.setAttribute(
      "color",
      paperView ? PAPER_PREVIEW_FOREGROUND : theme.palette.editorForeground
    );

    if (paperView) {
      const existingStyle = svg.getAttribute("style") ?? "";
      const trimmedStyle = existingStyle.trim();
      const stylePrefix = trimmedStyle.endsWith(";") ? trimmedStyle.slice(0, -1) : trimmedStyle;
      svg.setAttribute(
        "style",
        [
          stylePrefix,
          `color:${PAPER_PREVIEW_FOREGROUND}`,
          `--glyph_fill:${PAPER_PREVIEW_FOREGROUND}`,
          "--glyph_stroke:transparent",
          `background-color:${PAPER_PREVIEW_BACKGROUND}`
        ]
          .filter(Boolean)
          .join(";")
      );
      const existingBackground = svg.querySelector(":scope > rect[data-preview-background]");

      if (existingBackground) {
        existingBackground.setAttribute("fill", PAPER_PREVIEW_BACKGROUND);
      } else {
        const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        background.setAttribute("data-preview-background", "true");
        background.setAttribute("x", "0");
        background.setAttribute("y", "0");
        background.setAttribute("width", "100%");
        background.setAttribute("height", "100%");
        background.setAttribute("fill", PAPER_PREVIEW_BACKGROUND);
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

    addPreviewPageOutlines(document, paperView, theme);

    return new XMLSerializer().serializeToString(document);
  } catch {
    return markup;
  }
}

function addPreviewPageOutlines(
  document: XMLDocument,
  paperView: boolean,
  theme: ThemeDefinition
): void {
  const outlineColor = paperView ? "#8c959f" : theme.palette.textMuted;
  const outlineOpacity = paperView ? "0.62" : theme.mode === "dark" ? "0.78" : "0.44";
  const outlineWidth = theme.mode === "dark" && !paperView ? 1.5 : 1;

  for (const page of Array.from(document.querySelectorAll<SVGElement>("g.typst-page"))) {
    const pageWidth = Number.parseFloat(page.getAttribute("data-page-width") ?? "");
    const pageHeight = Number.parseFloat(page.getAttribute("data-page-height") ?? "");

    if (!(pageWidth > outlineWidth) || !(pageHeight > outlineWidth)) {
      continue;
    }

    page.querySelector(":scope > rect[data-preview-page-outline]")?.remove();

    const inset = outlineWidth / 2;
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    outline.setAttribute("data-preview-page-outline", "true");
    outline.setAttribute("x", String(inset));
    outline.setAttribute("y", String(inset));
    outline.setAttribute("width", String(pageWidth - outlineWidth));
    outline.setAttribute("height", String(pageHeight - outlineWidth));
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", outlineColor);
    outline.setAttribute("stroke-opacity", outlineOpacity);
    outline.setAttribute("stroke-width", String(outlineWidth));
    outline.setAttribute("vector-effect", "non-scaling-stroke");
    outline.setAttribute("pointer-events", "none");
    outline.setAttribute("shape-rendering", "crispEdges");
    page.append(outline);
  }
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
    return new Blob([encodeWorkspacePreviewBlobPart(file.content)], { type: file.mimeType });
  }

  const markup = decodeWorkspaceTextContent(file.content);
  const normalizedMarkup = normalizePreviewSvg(markup, paperView, theme);
  return new Blob([normalizedMarkup || markup], { type: file.mimeType });
}

function encodeWorkspacePreviewBlobPart(content: string | Uint8Array): BlobPart {
  const bytes = encodeWorkspacePreviewBytes(content);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeWorkspacePreviewBytes(content: string | Uint8Array): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (typeof TextEncoder === "undefined") {
    return new Uint8Array();
  }

  return new TextEncoder().encode(content);
}


function decodeWorkspaceTextContent(content: string | Uint8Array): string {
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
