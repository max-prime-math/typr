import { describe, expect, it } from "vitest";
import { areBytesEqual, areOptionalBytesEqual, bytesToHex } from "./bytes";

describe("byte utilities", () => {
  it("compares complete byte views", () => {
    const backing = new Uint8Array([9, 1, 2, 3, 9]);

    expect(areBytesEqual(backing.subarray(1, 4), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(areBytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(areBytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
  });

  it("compares optional byte content without conflating absence and empty bytes", () => {
    expect(areOptionalBytesEqual(undefined, undefined)).toBe(true);
    expect(areOptionalBytesEqual(undefined, new Uint8Array())).toBe(false);
    expect(areOptionalBytesEqual(new Uint8Array([1]), new Uint8Array([1]))).toBe(true);
  });

  it("encodes every byte as two lowercase hexadecimal digits", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  });
});
