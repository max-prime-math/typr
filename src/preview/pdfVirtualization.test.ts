import { describe, expect, it } from "vitest";
import {
  LARGE_PDF_BYTE_THRESHOLD,
  LARGE_PDF_PAGE_THRESHOLD,
  shouldVirtualizePdfDocument
} from "./pdfVirtualization";

describe("large PDF virtualization", () => {
  it("virtualizes documents that are large by bytes or page count", () => {
    expect(shouldVirtualizePdfDocument(LARGE_PDF_BYTE_THRESHOLD, 1)).toBe(true);
    expect(shouldVirtualizePdfDocument(1, LARGE_PDF_PAGE_THRESHOLD)).toBe(true);
  });

  it("keeps ordinary documents on the eager renderer", () => {
    expect(shouldVirtualizePdfDocument(LARGE_PDF_BYTE_THRESHOLD - 1, LARGE_PDF_PAGE_THRESHOLD - 1)).toBe(false);
  });
});
