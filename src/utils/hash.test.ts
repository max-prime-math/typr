import { describe, expect, it } from "vitest";
import { sha1Hex } from "./hash";

describe("hash utilities", () => {
  it("computes SHA-1 hex without relying on Web Crypto", async () => {
    const bytes = new TextEncoder().encode("abc");

    await expect(sha1Hex(bytes)).resolves.toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});
