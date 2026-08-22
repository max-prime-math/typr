export const LARGE_PDF_BYTE_THRESHOLD = 32 * 1024 * 1024;
export const LARGE_PDF_PAGE_THRESHOLD = 96;

export function shouldVirtualizePdfDocument(byteLength: number, pageCount: number): boolean {
  return byteLength >= LARGE_PDF_BYTE_THRESHOLD || pageCount >= LARGE_PDF_PAGE_THRESHOLD;
}
