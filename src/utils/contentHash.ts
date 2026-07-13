import { bytesToHex } from "./bytes";

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

export type ContentHashRadix = 16 | 36;

interface SampledByteHashOptions {
  maxSamples?: number;
  radix?: ContentHashRadix;
}

/**
 * Hashes every JavaScript UTF-16 code unit with FNV-1a.
 *
 * This deliberately does not UTF-8 encode first: compiler and preview cache keys historically
 * used `charCodeAt`, and retaining those code-unit semantics preserves existing cache keys.
 */
export function hashTextContent(value: string, radix: ContentHashRadix = 16): string {
  let hash = FNV1A_OFFSET_BASIS;

  for (let index = 0; index < value.length; index += 1) {
    hash = updateFnv1a(hash, value.charCodeAt(index));
  }

  return formatFnv1a(hash, radix);
}

/** Hashes every byte in a view with FNV-1a. */
export function hashByteContent(value: Uint8Array, radix: ContentHashRadix = 16): string {
  let hash = FNV1A_OFFSET_BASIS;

  for (let index = 0; index < value.byteLength; index += 1) {
    hash = updateFnv1a(hash, value[index]);
  }

  return formatFnv1a(hash, radix);
}

/**
 * Creates the full typed signature used to detect changed compiler input files.
 * The content kind and length intentionally remain part of the legacy cache format.
 */
export function createFullContentSignature(content: string | Uint8Array): string {
  if (typeof content === "string") {
    return `text:${content.length}:${hashTextContent(content)}`;
  }

  return `bytes:${content.byteLength}:${hashByteContent(content)}`;
}

/**
 * Hashes evenly spaced bytes, including both endpoints when at least two samples are used.
 *
 * Sampled hashes are suitable only for inexpensive render-cache invalidation. They are not a
 * content-equality check, persistent object ID, or security primitive.
 */
export function hashSampledByteContent(
  value: Uint8Array,
  { maxSamples = 128, radix = 16 }: SampledByteHashOptions = {}
): string {
  let hash = FNV1A_OFFSET_BASIS;
  const normalizedMaxSamples = Number.isFinite(maxSamples)
    ? Math.max(0, Math.floor(maxSamples))
    : 0;
  const sampleCount = Math.min(normalizedMaxSamples, value.byteLength);
  const maxIndex = Math.max(0, value.byteLength - 1);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const byteIndex =
      sampleCount <= 1 ? 0 : Math.round((sampleIndex / (sampleCount - 1)) * maxIndex);
    hash = updateFnv1a(hash, value[byteIndex] ?? 0);
  }

  return formatFnv1a(hash, radix);
}

/** Computes the full SHA-1 digest required for Git-compatible object IDs. */
export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      const digest = await subtle.digest("SHA-1", buffer);
      return bytesToHex(new Uint8Array(digest));
    } catch {
      // Some embedded browser contexts expose crypto without SHA-1 support.
    }
  }

  return bytesToHex(sha1Digest(bytes));
}

function updateFnv1a(hash: number, value: number): number {
  return Math.imul(hash ^ value, FNV1A_PRIME);
}

function formatFnv1a(hash: number, radix: ContentHashRadix): string {
  return (hash >>> 0).toString(radix);
}

function sha1Digest(message: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((message.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.byteLength] = 0x80;

  const bitLength = message.byteLength * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
        1
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, h0);
  digestView.setUint32(4, h1);
  digestView.setUint32(8, h2);
  digestView.setUint32(12, h3);
  digestView.setUint32(16, h4);
  return digest;
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}
