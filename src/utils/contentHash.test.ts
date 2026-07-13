import { describe, expect, it } from "vitest";
import {
  createFullContentSignature,
  hashByteContent,
  hashSampledByteContent,
  hashTextContent,
  sha1Hex
} from "./contentHash";

describe("content hash utilities", () => {
  it("preserves the full UTF-16 text hash used by compiler and preview caches", () => {
    expect(hashTextContent("abc")).toBe("1a47e90b");
    expect(hashTextContent("é🙂")).toBe("2cbe5bb");
  });

  it("hashes every byte for full byte-content signatures", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const changed = bytes.slice();
    changed[1] ^= 0xff;

    expect(hashByteContent(bytes)).toBe("90a458c5");
    expect(hashByteContent(changed)).not.toBe(hashByteContent(bytes));
  });

  it("preserves typed compiler signature prefixes and lengths", () => {
    expect(createFullContentSignature("abc")).toBe("text:3:1a47e90b");
    expect(createFullContentSignature(new Uint8Array([97, 98, 99]))).toBe(
      "bytes:3:1a47e90b"
    );
  });

  it("preserves the sampled PDF hash and its base-36 cache-key format", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const changedOutsideSample = bytes.slice();
    const changedInsideSample = bytes.slice();
    changedOutsideSample[1] ^= 0xff;
    changedInsideSample[2] ^= 0xff;

    expect(hashSampledByteContent(bytes, { radix: 36 })).toBe("xq2t6t");
    expect(hashSampledByteContent(changedOutsideSample, { radix: 36 })).toBe("xq2t6t");
    expect(hashSampledByteContent(changedInsideSample, { radix: 36 })).not.toBe("xq2t6t");
  });

  it("computes the full SHA-1 digest used by Git object IDs", async () => {
    const bytes = new TextEncoder().encode("abc");

    await expect(sha1Hex(bytes)).resolves.toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});
