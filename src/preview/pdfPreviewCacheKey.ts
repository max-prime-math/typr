import { hashByteContent } from "../utils/contentHash";

const pdfContentHashCache = new WeakMap<Uint8Array, string>();

/** Builds a content-exact key used to reuse rendered PDF preview pages. */
export function createPdfPreviewCacheKey(scope: string, content: Uint8Array): string {
  let contentHash = pdfContentHashCache.get(content);

  if (!contentHash) {
    contentHash = hashByteContent(content, 36);
    pdfContentHashCache.set(content, contentHash);
  }

  return `${scope}:${content.byteLength}:${contentHash}`;
}
