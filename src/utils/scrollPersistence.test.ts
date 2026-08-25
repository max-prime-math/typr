import { describe, expect, it } from "vitest";
import { normalizeStoredScrollPositions } from "./scrollPersistence";

describe("scroll position persistence", () => {
  it("keeps finite two-axis positions, including the top of a document", () => {
    expect(normalizeStoredScrollPositions({
      source: { left: 17.4, top: 0, updatedAt: 123.8 },
      preview: { left: 0, top: 942.6, updatedAt: 456 }
    })).toEqual({
      source: { left: 17, top: 0, updatedAt: 124 },
      preview: { left: 0, top: 943, updatedAt: 456 }
    });
  });

  it("drops malformed and negative stored positions", () => {
    expect(normalizeStoredScrollPositions({
      negative: { left: 0, top: -1, updatedAt: 1 },
      missing: { top: 20 },
      infinite: { left: 0, top: Number.POSITIVE_INFINITY },
      legacy: 120
    })).toEqual({});
  });
});
