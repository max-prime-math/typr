import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { CompilerStatus, CompileResult } from "../compiler/typstCompiler";
import type { CompileDiagnostic } from "../compiler/types";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeDefinition } from "../theme/themes";
import { applyPdfCanvasZoom, renderPdfArtifactToCanvas } from "./pdfCanvasRenderer";
import { renderTypstArtifactToCanvas } from "./typstCanvasRenderer";
import { renderSourceMappingOverlay } from "./sourceMappingOverlay";
import {
  createSourceRange,
  parseSourceLocation,
  sourcePositionIntersectsRange,
  type PreviewRect,
  type PreviewSourceLink,
  type SourcePosition,
  type SourceRange
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
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
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
  activeSource = null,
  onSourceJump,
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
  const showCompilerActivity = shouldShowCompilerActivity(isCompiling, compilerStatus);

  if (workspacePreview) {
    const isPdfPreview = workspacePreview.mimeType === "application/pdf";

    return (
      <div className={getPreviewLayoutClassName(paperView, isPdfPreview)}>
        <div className={`preview-surface ${paperView ? "preview-surface--paper" : ""}`}>
          <WorkspaceFilePreview
            activeSource={activeSource}
            file={workspacePreview}
            onSourceJump={onSourceJump}
            paperView={paperView}
            theme={theme}
            zoom={currentZoom}
          />
        </div>
      </div>
    );
  }

  if (result === null) {
    return (
      <div className={`preview-state ${paperView ? "preview-state--paper" : ""}`}>
        <div className="preview-status">
          {isCompiling ? (
            <p>
              <PreviewStatusIcon kind="compiling" label={compilerStatus.label} />
            </p>
          ) : null}
          <PreviewActivityStatus
            centered
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
            ) : shouldUseChromiumCanvasPreview(fallbackResult) ? (
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
                sourceLineCount={sourceLineCount}
                sourcePath={sourcePath}
                theme={theme}
                zoom={currentZoom}
                viewportPadding={viewportPadding}
              />
            )}
            {showCompilerActivity ? (
              <PreviewActivityStatus docked status={compilerStatus} />
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
            paperView={paperView}
            theme={theme}
            zoom={currentZoom}
          />
        ) : shouldUseChromiumCanvasPreview(result) ? (
          <ChromiumCanvasPreview artifactData={result.output.artifactData!} paperView={paperView} />
        ) : (
            <PreviewDocument
              artifactData={result.output.artifactData}
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
          <PreviewActivityStatus docked status={compilerStatus} />
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
  const selectValue =
    zoom.mode === "percent"
      ? `${zoom.percent}`
      : zoom.mode;

  return (
    <div className="preview-zoom-controls" aria-label="Preview zoom controls">
      <button
        className="preview-zoom-button"
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
        {ZOOM_PERCENT_STEPS.map((percent) => (
          <option key={percent} value={`${percent}`}>
            {percent}%
          </option>
        ))}
      </select>
      <button
        className="preview-zoom-button"
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
  status
}: {
  centered?: boolean;
  docked?: boolean;
  status: CompilerStatus | null;
}) {
  if (!status) {
    return null;
  }

  return (
    <PreviewActivityStatusBody
      centered={centered}
      docked={docked}
      status={status}
    />
  );
}

function PreviewActivityStatusBody({
  centered,
  docked,
  status
}: {
  centered: boolean;
  docked: boolean;
  status: CompilerStatus;
}) {
  const progress = usePreviewActivityProgress(status);

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

function shouldShowCompilerActivity(
  isCompiling: boolean,
  status: CompilerStatus
): boolean {
  return (
    isCompiling &&
    status.phase !== "idle" &&
    status.phase !== "ready" &&
    status.phase !== "error"
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

function PreviewDocument({
  artifactData,
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

  const contentWidth =
    dimensions && viewportSize.width > 0
      ? Math.max(240, Math.round(dimensions.width * resolvedZoom.scale))
      : Math.max(240, viewportSize.width || 0);
  const hasMeasuredViewport = viewportSize.width > 0;
  const hasStablePreviewLayout = hasMeasuredViewport && dimensions !== null;
  const currentImageStatus =
    imageState?.blobUrl === blobUrl ? imageState.status : "loading";

  return (
    <div
      className={`preview-document ${isFaulted ? "preview-document--faulted" : ""}`}
      ref={viewportRef}
    >
      <div
        className={`preview-document__canvas ${
          hasStablePreviewLayout ? "" : "preview-document__canvas--pending"
        }`}
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
          width: hasMeasuredViewport ? `${contentWidth}px` : "100%"
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
  activeSource,
  file,
  onSourceJump,
  paperView,
  theme,
  zoom
}: {
  activeSource: SourcePosition | null;
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
        onSourceJump={onSourceJump}
        paperView={paperView}
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
    />
  );
}

function WorkspaceBinaryFilePreview({
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
    <div
      className={`preview-document ${
        isPdf ? "preview-document--pdf" : "preview-document--asset"
      } ${paperView ? "preview-document--paper" : ""}`}
    >
      <div className="preview-file-preview">
        <img alt={file.name} className="preview-file-preview__image" src={blobUrl} />
      </div>
    </div>
  );
}

function MarkdownFilePreview({
  activeSource,
  file,
  onSourceJump,
  paperView
}: {
  activeSource: SourcePosition | null;
  file: WorkspacePreviewFile;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  paperView: boolean;
}) {
  const source = decodeWorkspaceTextContent(file.content);
  const sourcePath = file.path || file.name;
  const activeMarkdownSource =
    activeSource && normalizeSourcePathForPreview(activeSource.path) === normalizeSourcePathForPreview(sourcePath)
      ? activeSource
      : null;
  const blocks = useMemo(
    () => renderMarkdownBlocks(source, {
      activeSource: activeMarkdownSource,
      onSourceJump,
      sourcePath
    }),
    [activeMarkdownSource, onSourceJump, source, sourcePath]
  );
  const activeBlockKey = useMemo(
    () => findActiveMarkdownBlockKey(source, activeMarkdownSource),
    [activeMarkdownSource, source]
  );
  const articleRef = useRef<HTMLElement | null>(null);

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

    activeBlock.scrollIntoView({
      block: "center",
      inline: "nearest"
    });
  }, [activeBlockKey]);

  return (
    <div
      className={`preview-document preview-document--markdown ${
        paperView ? "preview-document--paper" : ""
      }`}
    >
      <article className="preview-markdown" aria-label={`${file.name} preview`} ref={articleRef}>
        {blocks.length > 0 ? blocks : (
          <p className="preview-markdown__empty">Empty Markdown file.</p>
        )}
      </article>
    </div>
  );
}

interface MarkdownRenderOptions {
  activeSource: SourcePosition | null;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  sourcePath: string;
}

interface MarkdownBlockInfo {
  key: string;
  range: SourceRange;
}

function renderMarkdownBlocks(source: string, options: MarkdownRenderOptions): ReactNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(```+|~~~+)\s*(.*)$/);
    if (fence) {
      const startLine = index + 1;
      const fenceMarker = fence[1];
      const info = fence[2]?.trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trimStart().startsWith(fenceMarker)) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      const block = createMarkdownBlockInfo("code", blockIndex, options.sourcePath, startLine, index);
      blocks.push(
        <pre
          {...createMarkdownBlockProps(block, options, "preview-markdown__code-block")}
          key={block.key}
        >
          <code data-language={info || undefined}>{codeLines.join("\n")}</code>
        </pre>
      );
      blockIndex += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const block = createMarkdownBlockInfo("heading", blockIndex, options.sourcePath, index + 1, index + 1);
      blocks.push(
        renderMarkdownHeading(
          heading[1].length,
          parseMarkdownInline(heading[2], `heading-${blockIndex}`),
          block,
          options
        )
      );
      index += 1;
      blockIndex += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      const block = createMarkdownBlockInfo("hr", blockIndex, options.sourcePath, index + 1, index + 1);
      blocks.push(<hr {...createMarkdownBlockProps(block, options)} key={block.key} />);
      index += 1;
      blockIndex += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const startLine = index + 1;
      const quoteLines: string[] = [];

      while (index < lines.length) {
        const quoteMatch = lines[index].match(/^\s{0,3}>\s?(.*)$/);
        if (!quoteMatch) {
          break;
        }
        quoteLines.push(quoteMatch[1]);
        index += 1;
      }

      const block = createMarkdownBlockInfo("quote", blockIndex, options.sourcePath, startLine, index);
      blocks.push(
        <blockquote {...createMarkdownBlockProps(block, options)} key={block.key}>
          <p>{parseMarkdownInline(quoteLines.join(" "), `quote-${blockIndex}`)}</p>
        </blockquote>
      );
      blockIndex += 1;
      continue;
    }

    const unorderedListMatch = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    if (unorderedListMatch) {
      const startLine = index + 1;
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s{0,3}[-*+]\s+(.+)$/);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1]);
        index += 1;
      }

      const block = createMarkdownBlockInfo("ul", blockIndex, options.sourcePath, startLine, index);
      blocks.push(
        <ul {...createMarkdownBlockProps(block, options)} key={block.key}>
          {items.map((item, itemIndex) => (
            <li key={`ul-${blockIndex}-${itemIndex}`}>
              {parseMarkdownInline(item, `ul-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ul>
      );
      blockIndex += 1;
      continue;
    }

    const orderedListMatch = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
    if (orderedListMatch) {
      const startLine = index + 1;
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s{0,3}\d+[.)]\s+(.+)$/);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1]);
        index += 1;
      }

      const block = createMarkdownBlockInfo("ol", blockIndex, options.sourcePath, startLine, index);
      blocks.push(
        <ol {...createMarkdownBlockProps(block, options)} key={block.key}>
          {items.map((item, itemIndex) => (
            <li key={`ol-${blockIndex}-${itemIndex}`}>
              {parseMarkdownInline(item, `ol-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ol>
      );
      blockIndex += 1;
      continue;
    }

    const startLine = index + 1;
    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    if (paragraphLines.length > 0) {
      const block = createMarkdownBlockInfo("p", blockIndex, options.sourcePath, startLine, index);
      blocks.push(
        <p {...createMarkdownBlockProps(block, options)} key={block.key}>
          {parseMarkdownInline(paragraphLines.join(" "), `p-${blockIndex}`)}
        </p>
      );
      blockIndex += 1;
      continue;
    }

    index += 1;
  }

  return blocks;
}

function createMarkdownBlockInfo(
  kind: string,
  index: number,
  sourcePath: string,
  startLine: number,
  endLine: number
): MarkdownBlockInfo {
  return {
    key: `${kind}-${index}`,
    range: createSourceRange({
      path: sourcePath,
      line: startLine,
      column: 0,
      endLine: Math.max(startLine, endLine),
      endColumn: 0
    })
  };
}

function createMarkdownBlockProps(
  block: MarkdownBlockInfo,
  options: MarkdownRenderOptions,
  className?: string
) {
  const active = options.activeSource
    ? sourcePositionIntersectsRange(options.activeSource, block.range)
    : false;
  const blockClassName = [
    className,
    "preview-markdown__source-block",
    active ? "preview-markdown__source-block--active" : null
  ].filter(Boolean).join(" ");

  return {
    className: blockClassName,
    "data-source-block-key": block.key,
    "data-source-line": `${block.range.line}`,
    "data-source-end-line": `${block.range.endLine ?? block.range.line}`,
    onDoubleClick: (event: ReactMouseEvent<HTMLElement>) => {
      if (!options.onSourceJump) {
        return;
      }

      options.onSourceJump({
        previewRect: getPreviewRectFromElement(event.currentTarget),
        source: block.range
      });
    }
  };
}

function findActiveMarkdownBlockKey(source: string, activeSource: SourcePosition | null): string | null {
  if (!activeSource) {
    return null;
  }

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const startLine = index + 1;
    let kind = "p";
    let endLine = startLine;

    const fence = line.match(/^\s*(```+|~~~+)\s*(.*)$/);
    if (fence) {
      kind = "code";
      const fenceMarker = fence[1];
      index += 1;

      while (index < lines.length && !lines[index].trimStart().startsWith(fenceMarker)) {
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      endLine = index;
    } else if (/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.test(line)) {
      kind = "heading";
      index += 1;
      endLine = startLine;
    } else if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      kind = "hr";
      index += 1;
      endLine = startLine;
    } else if (/^\s{0,3}>\s?/.test(line)) {
      kind = "quote";
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
        index += 1;
      }
      endLine = index;
    } else if (/^\s{0,3}[-*+]\s+(.+)$/.test(line)) {
      kind = "ul";
      while (index < lines.length && /^\s{0,3}[-*+]\s+(.+)$/.test(lines[index])) {
        index += 1;
      }
      endLine = index;
    } else if (/^\s{0,3}\d+[.)]\s+(.+)$/.test(line)) {
      kind = "ol";
      while (index < lines.length && /^\s{0,3}\d+[.)]\s+(.+)$/.test(lines[index])) {
        index += 1;
      }
      endLine = index;
    } else {
      while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
        index += 1;
      }
      endLine = index;
    }

    if (activeSource.line >= startLine && activeSource.line <= Math.max(startLine, endLine)) {
      return `${kind}-${blockIndex}`;
    }

    blockIndex += 1;
  }

  return null;
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

function isMarkdownBlockStart(line: string): boolean {
  return (
    /^\s*(```+|~~~+)/.test(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s{0,3}[-*+]\s+/.test(line) ||
    /^\s{0,3}\d+[.)]\s+/.test(line)
  );
}

function renderMarkdownHeading(
  level: number,
  children: ReactNode[],
  block: MarkdownBlockInfo,
  options: MarkdownRenderOptions
): ReactNode {
  switch (level) {
    case 1:
      return <h1 {...createMarkdownBlockProps(block, options)} key={block.key}>{children}</h1>;
    case 2:
      return <h2 {...createMarkdownBlockProps(block, options)} key={block.key}>{children}</h2>;
    case 3:
      return <h3 {...createMarkdownBlockProps(block, options)} key={block.key}>{children}</h3>;
    case 4:
      return <h4 {...createMarkdownBlockProps(block, options)} key={block.key}>{children}</h4>;
    case 5:
      return <h5 {...createMarkdownBlockProps(block, options)} key={block.key}>{children}</h5>;
    default:
      return <h6 {...createMarkdownBlockProps(block, options)} key={block.key}>{children}</h6>;
  }
}

function parseMarkdownInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let nodeIndex = 0;

  const pushText = (value: string) => {
    if (!value) {
      return;
    }
    nodes.push(value);
  };

  while (index < text.length) {
    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        nodes.push(
          <code key={`${keyPrefix}-code-${nodeIndex}`}>
            {text.slice(index + 1, end)}
          </code>
        );
        nodeIndex += 1;
        index = end + 1;
        continue;
      }
    }

    if (text[index] === "[") {
      const linkMatch = text.slice(index).match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
      const href = linkMatch ? sanitizeMarkdownHref(linkMatch[2]) : null;
      if (linkMatch && href) {
        nodes.push(
          <a
            href={href}
            key={`${keyPrefix}-link-${nodeIndex}`}
            rel="noreferrer"
            target={isExternalMarkdownHref(href) ? "_blank" : undefined}
          >
            {parseMarkdownInline(linkMatch[1], `${keyPrefix}-link-${nodeIndex}`)}
          </a>
        );
        nodeIndex += 1;
        index += linkMatch[0].length;
        continue;
      }
    }

    const strongMarker = text.startsWith("**", index) ? "**" : text.startsWith("__", index) ? "__" : null;
    if (strongMarker) {
      const end = text.indexOf(strongMarker, index + strongMarker.length);
      if (end > index + strongMarker.length) {
        nodes.push(
          <strong key={`${keyPrefix}-strong-${nodeIndex}`}>
            {parseMarkdownInline(
              text.slice(index + strongMarker.length, end),
              `${keyPrefix}-strong-${nodeIndex}`
            )}
          </strong>
        );
        nodeIndex += 1;
        index = end + strongMarker.length;
        continue;
      }
    }

    const emphasisMarker =
      text[index] === "*" || text[index] === "_" ? text[index] : null;
    if (emphasisMarker) {
      const end = text.indexOf(emphasisMarker, index + 1);
      if (end > index + 1) {
        nodes.push(
          <em key={`${keyPrefix}-em-${nodeIndex}`}>
            {parseMarkdownInline(
              text.slice(index + 1, end),
              `${keyPrefix}-em-${nodeIndex}`
            )}
          </em>
        );
        nodeIndex += 1;
        index = end + 1;
        continue;
      }
    }

    const nextSpecial = findNextMarkdownInlineSpecial(text, index + 1);
    pushText(text.slice(index, nextSpecial));
    index = nextSpecial;
  }

  return nodes;
}

function findNextMarkdownInlineSpecial(text: string, start: number): number {
  const positions = ["`", "[", "*", "_"]
    .map((marker) => text.indexOf(marker, start))
    .filter((position) => position >= 0);

  return positions.length > 0 ? Math.min(...positions) : text.length;
}

function sanitizeMarkdownHref(href: string): string | null {
  const trimmed = href.trim();

  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return trimmed;
  }

  if (
    (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) &&
    !trimmed.startsWith("//")
  ) {
    return trimmed;
  }

  return null;
}

function isExternalMarkdownHref(href: string): boolean {
  return /^https?:/i.test(href);
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
  onSourceJump: (sourceLink: PreviewSourceLink) => void;
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
    let disposeDoubleClickListener = () => {};
    const handle = window.setTimeout(() => {
      void renderSourceMappingOverlay(container, artifactData, paperView)
        .then((overlay) => {
          if (cancelled) {
            overlay.dispose();
            return;
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
              onSourceJump({
                previewRect: getPreviewRectFromElement(
                  event.target instanceof HTMLElement && container.contains(event.target)
                    ? event.target
                    : container
                ),
                source
              });
            }
          };
          interactionHost.addEventListener("dblclick", handleDoubleClick, true);
          disposeDoubleClickListener = () => {
            interactionHost.removeEventListener("dblclick", handleDoubleClick, true);
          };
        })
        .catch(() => {
          container.innerHTML = "";
          disposeDoubleClickListener();
          disposeDoubleClickListener = () => {};
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      disposeDoubleClickListener();
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

function PdfPreview({
  artifactData,
  cacheKey,
  paperView = false,
  isFaulted = false,
  theme,
  zoom
}: {
  artifactData: Uint8Array;
  cacheKey?: string;
  paperView?: boolean;
  isFaulted?: boolean;
  theme: ThemeDefinition;
  zoom: PreviewZoomState;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  zoomRef.current = zoom;

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
          applyPdfCanvasZoom(container, zoomRef.current);
          logPreviewTiming("pdf-canvas", renderStartedAt);
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
    };
  }, [
    artifactData,
    cacheKey,
    paperView,
    theme.palette.editorBackground,
    theme.palette.editorForeground,
    viewportSize.height,
    viewportSize.width,
    zoom.mode,
    zoom.percent
  ]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    applyPdfCanvasZoom(container, zoom);
  }, [viewportSize.height, viewportSize.width, zoom]);

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
        <summary>Output excerpt</summary>
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

function shouldUseChromiumCanvasPreview(
  result: CompileResult
): boolean {
  return false;
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

  const markup = decodeWorkspaceTextContent(file.content);
  const normalizedMarkup = normalizePreviewSvg(markup, paperView, theme);
  return new Blob([normalizedMarkup], { type: file.mimeType });
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

function createPdfPreviewCacheKey(scope: string, content: Uint8Array): string {
  let hash = 2166136261;
  const sampleCount = Math.min(128, content.byteLength);
  const maxIndex = Math.max(0, content.byteLength - 1);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const byteIndex =
      sampleCount <= 1 ? 0 : Math.round((sampleIndex / (sampleCount - 1)) * maxIndex);
    hash ^= content[byteIndex] ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return `${scope}:${content.byteLength}:${(hash >>> 0).toString(36)}`;
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
