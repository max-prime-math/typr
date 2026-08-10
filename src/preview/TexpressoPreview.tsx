import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PreviewZoomState } from "./PreviewPane";
import type { TexpressoLivePage, TexpressoLiveSnapshot } from "./texpressoClient";

const CSS_DPI = 96;
const VIEWPORT_PADDING = 28;

interface DisplayedRevision {
  sessionGeneration: number;
  revision: number | null;
  pages: readonly TexpressoLivePage[];
}

export function TexpressoPreview({
  snapshot,
  zoom,
  paperView = false,
  onRevisionCommitted
}: {
  snapshot: TexpressoLiveSnapshot;
  zoom: PreviewZoomState;
  paperView?: boolean;
  onRevisionCommitted: (sessionGeneration: number, revision: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef({ page: 0, ratio: 0 });
  const previousRevisionRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [displayed, setDisplayed] = useState<DisplayedRevision>(() => ({
    sessionGeneration: snapshot.sessionGeneration,
    revision: snapshot.visibleRevision,
    pages: snapshot.pages
  }));
  const pageDimensions = useMemo(
    () => displayed.pages.map((page) => ({
      width: page.width * CSS_DPI / page.dpi,
      height: page.height * CSS_DPI / page.dpi,
      nativeScale: page.dpi / CSS_DPI
    })),
    [displayed.pages]
  );
  const scale = resolveRasterScale(zoom, viewport, pageDimensions);
  const revisionKey = `${displayed.sessionGeneration}:${displayed.revision ?? 0}`;
  const incomingRevisionKey = `${snapshot.sessionGeneration}:${snapshot.visibleRevision ?? 0}`;

  const captureScrollAnchor = useCallback(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return;
    }
    const viewportRect = viewportElement.getBoundingClientRect();
    const pages = Array.from(viewportElement.querySelectorAll<HTMLElement>("[data-texpresso-page]"));
    if (pages.length === 0) {
      return;
    }
    const anchorY = viewportRect.top + Math.min(32, viewportRect.height / 3);
    let closest = pages[0]!;
    for (const page of pages) {
      if (page.getBoundingClientRect().top <= anchorY) {
        closest = page;
      } else {
        break;
      }
    }
    const rect = closest.getBoundingClientRect();
    anchorRef.current = {
      page: Number(closest.dataset.texpressoPage ?? 0),
      ratio: rect.height > 0 ? Math.max(0, Math.min(1, (anchorY - rect.top) / rect.height)) : 0
    };
  }, []);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement || typeof ResizeObserver === "undefined") {
      return;
    }
    const update = () => setViewport({
      width: viewportElement.clientWidth,
      height: viewportElement.clientHeight
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      snapshot.status !== "ready" ||
      snapshot.visibleRevision === null ||
      snapshot.pages.length === 0 ||
      incomingRevisionKey === revisionKey
    ) {
      return;
    }
    let cancelled = false;
    void preloadTexpressoPageImages(snapshot.pages).then(() => {
      if (!cancelled) {
        setDisplayed({
          sessionGeneration: snapshot.sessionGeneration,
          revision: snapshot.visibleRevision,
          pages: snapshot.pages
        });
      }
    }).catch(() => {
      // Keep the previous fully decoded revision visible. The next completed
      // revision or session restart gets another chance to replace it.
    });
    return () => {
      cancelled = true;
    };
  }, [incomingRevisionKey, revisionKey, snapshot.pages, snapshot.sessionGeneration, snapshot.status, snapshot.visibleRevision]);

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement || displayed.revision === null) {
      return;
    }
    const revisionChanged = previousRevisionRef.current !== null && previousRevisionRef.current !== revisionKey;
    previousRevisionRef.current = revisionKey;
    if (revisionChanged) {
      const pageIndex = Math.min(anchorRef.current.page, Math.max(0, displayed.pages.length - 1));
      const page = viewportElement.querySelector<HTMLElement>(`[data-texpresso-page="${pageIndex}"]`);
      if (page) {
        const viewportRect = viewportElement.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        viewportElement.scrollTop +=
          pageRect.top + pageRect.height * anchorRef.current.ratio - viewportRect.top - Math.min(32, viewportRect.height / 3);
      }
    }
    captureScrollAnchor();
    onRevisionCommitted(displayed.sessionGeneration, displayed.revision);
  }, [captureScrollAnchor, displayed.pages.length, displayed.revision, displayed.sessionGeneration, onRevisionCommitted, revisionKey]);

  return (
    <div className={`preview-layout preview-layout--edge-to-edge ${paperView ? "preview-layout--paper" : ""}`}>
      <div className={`preview-surface ${paperView ? "preview-surface--paper" : ""}`}>
        <div
          aria-label="TeXpresso live raster preview"
          className={`preview-document texpresso-preview ${paperView ? "texpresso-preview--paper" : ""}`}
          onScroll={captureScrollAnchor}
          ref={viewportRef}
        >
          <div className="texpresso-preview__pages">
            {displayed.pages.map((page, index) => {
              const dimensions = pageDimensions[index];
              return (
                <figure
                  className="texpresso-page canvas"
                  data-texpresso-page={page.page}
                  key={page.page}
                  style={{
                    width: `${(dimensions?.width ?? page.width) * scale}px`,
                    height: `${(dimensions?.height ?? page.height) * scale}px`
                  }}
                >
                  <img
                    alt={`Live preview page ${page.page + 1}`}
                    draggable={false}
                    height={page.height}
                    src={page.blobUrl}
                    width={page.width}
                  />
                </figure>
              );
            })}
          </div>
        </div>
        <TexpressoPreviewStatus snapshot={snapshot} />
      </div>
    </div>
  );
}

export function preloadTexpressoPageImages(
  pages: readonly Pick<TexpressoLivePage, "blobUrl">[],
  createImage: () => Pick<HTMLImageElement, "src" | "decode"> = () => new Image()
): Promise<void> {
  return Promise.all(pages.map(async (page) => {
    const image = createImage();
    image.src = page.blobUrl;
    await image.decode();
  })).then(() => undefined);
}

export function TexpressoPreviewStatus({ snapshot }: { snapshot: TexpressoLiveSnapshot }) {
  const label = getStatusLabel(snapshot.status);
  return (
    <div
      className={`texpresso-status texpresso-status--${snapshot.status}`}
      role="status"
      aria-live="polite"
      title={snapshot.statusDetail}
    >
      <span className="texpresso-status__dot" aria-hidden="true" />
      <span>Live Preview · {label}</span>
      {snapshot.status === "error" && snapshot.statusDetail ? (
        <span className="texpresso-status__detail">{snapshot.statusDetail}</span>
      ) : null}
    </div>
  );
}

function resolveRasterScale(
  zoom: PreviewZoomState,
  viewport: { width: number; height: number },
  pages: readonly { width: number; height: number; nativeScale: number }[]
): number {
  if (pages.length === 0) {
    return 1;
  }
  const maxWidth = Math.max(...pages.map((page) => page.width));
  const maxHeight = Math.max(...pages.map((page) => page.height));
  const fitWidth = viewport.width > 0 ? Math.max(0.1, (viewport.width - VIEWPORT_PADDING * 2) / maxWidth) : 1;
  const fitHeight = viewport.height > 0 ? Math.max(0.1, (viewport.height - VIEWPORT_PADDING * 2) / maxHeight) : 1;
  const requested = zoom.mode === "fit-width"
    ? fitWidth
    : zoom.mode === "fit-height"
      ? fitHeight
      : zoom.mode === "fit-page"
        ? Math.min(fitWidth, fitHeight)
        : zoom.percent / 100;
  const nativeScale = Math.min(...pages.map((page) => page.nativeScale));
  return Math.max(0.1, Math.min(requested, nativeScale));
}

function getStatusLabel(status: TexpressoLiveSnapshot["status"]): string {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "updating":
      return "Updating";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    case "disconnected":
      return "Disconnected";
    case "inactive":
    default:
      return "Off";
  }
}
