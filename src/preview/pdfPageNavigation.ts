export interface PdfPagePosition {
  height: number;
  pageNumber: number;
  top: number;
}

// Keep these in sync with PDF.js's PDFPresentationMode wheel controller.
// PDF.js uses normalized page deltas so a click-wheel and a trackpad cross the
// page boundary at roughly the same point without one gesture skipping pages.
export const PDF_PAGE_SWITCH_COOLDOWN_MS = 50;
export const PDF_PAGE_SWITCH_THRESHOLD = 0.1;

export interface PdfWheelDelta {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
}

export function normalizePdfWheelEventDelta(event: PdfWheelDelta): number {
  let delta = Math.hypot(event.deltaX, event.deltaY);
  const angle = Math.atan2(event.deltaY, event.deltaX);

  if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
    delta = -delta;
  }

  // WheelEvent.DOM_DELTA_PIXEL and DOM_DELTA_LINE are 0 and 1 respectively.
  if (event.deltaMode === 0) {
    delta /= 30 * 30;
  } else if (event.deltaMode === 1) {
    delta /= 30;
  }

  return delta;
}

export function clampPdfPageNumber(pageNumber: number, pageCount: number): number {
  const lastPage = Math.max(1, Math.floor(pageCount));
  const requestedPage = Number.isFinite(pageNumber) ? Math.round(pageNumber) : 1;
  return Math.min(lastPage, Math.max(1, requestedPage));
}

export function resolveCurrentPdfPage(
  pages: readonly PdfPagePosition[],
  scrollTop: number,
  viewportHeight: number
): number {
  if (pages.length === 0) {
    return 1;
  }

  const viewportStart = Math.max(0, scrollTop);
  const viewportEnd = viewportStart + Math.max(1, viewportHeight);
  const viewportCenter = (viewportStart + viewportEnd) / 2;
  let bestPage = pages[0];
  let bestVisibleHeight = -1;
  let bestCenterDistance = Number.POSITIVE_INFINITY;

  for (const page of pages) {
    const pageEnd = page.top + Math.max(0, page.height);
    const visibleHeight = Math.max(
      0,
      Math.min(pageEnd, viewportEnd) - Math.max(page.top, viewportStart)
    );
    const centerDistance = Math.abs(page.top + page.height / 2 - viewportCenter);

    if (
      visibleHeight > bestVisibleHeight ||
      (visibleHeight === bestVisibleHeight && centerDistance < bestCenterDistance)
    ) {
      bestPage = page;
      bestVisibleHeight = visibleHeight;
      bestCenterDistance = centerDistance;
    }
  }

  return Math.max(1, bestPage.pageNumber);
}
