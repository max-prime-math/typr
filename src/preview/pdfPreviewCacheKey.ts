import { hashSampledByteContent } from "../utils/contentHash";

/** Builds the stable sampled key used to reuse rendered PDF preview pages. */
export function createPdfPreviewCacheKey(scope: string, content: Uint8Array): string {
  return `${scope}:${content.byteLength}:${hashSampledByteContent(content, { radix: 36 })}`;
}
