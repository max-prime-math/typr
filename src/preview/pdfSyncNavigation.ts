export const PDF_SYNC_SMOOTH_SCROLL_MAX_PAGE_DISTANCE = 10;

export function shouldSmoothScrollPdfSyncJump(
  currentPageNumber: number,
  targetPageNumber: number
): boolean {
  return Math.abs(targetPageNumber - currentPageNumber) <= PDF_SYNC_SMOOTH_SCROLL_MAX_PAGE_DISTANCE;
}
