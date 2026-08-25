import { describe, expect, it } from "vitest";
import {
  PDF_SYNC_SMOOTH_SCROLL_MAX_PAGE_DISTANCE,
  shouldSmoothScrollPdfSyncJump
} from "./pdfSyncNavigation";

describe("PDF SyncTeX navigation", () => {
  it("smooth-scrolls nearby page jumps", () => {
    expect(shouldSmoothScrollPdfSyncJump(20, 20 + PDF_SYNC_SMOOTH_SCROLL_MAX_PAGE_DISTANCE)).toBe(true);
    expect(shouldSmoothScrollPdfSyncJump(20, 20 - PDF_SYNC_SMOOTH_SCROLL_MAX_PAGE_DISTANCE)).toBe(true);
  });

  it("jumps instantly when the destination is more than ten pages away", () => {
    expect(shouldSmoothScrollPdfSyncJump(1, 12)).toBe(false);
    expect(shouldSmoothScrollPdfSyncJump(100, 89)).toBe(false);
  });
});
