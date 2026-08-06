import { describe, expect, it } from "vitest";
import { resolveScrollOffset } from "./domScroll";

describe("resolveScrollOffset", () => {
  it("leaves fully visible targets in place", () => {
    expect(resolveScrollOffset(100, 300, 180, 40, "nearest")).toBe(100);
  });

  it("reveals targets before and after the viewport", () => {
    expect(resolveScrollOffset(100, 300, 40, 20, "nearest")).toBe(40);
    expect(resolveScrollOffset(100, 300, 430, 20, "nearest")).toBe(150);
  });

  it("does not move when a target already spans the viewport", () => {
    expect(resolveScrollOffset(100, 300, 40, 500, "nearest")).toBe(100);
  });

  it("centers a target without allowing a negative offset", () => {
    expect(resolveScrollOffset(100, 300, 500, 40, "center")).toBe(370);
    expect(resolveScrollOffset(100, 300, 10, 20, "center")).toBe(0);
  });

  it("preserves the current offset when scrolling is disabled for an axis", () => {
    expect(resolveScrollOffset(100, 300, 500, 40, "none")).toBe(100);
  });
});
