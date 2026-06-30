import { describe, expect, it } from "vitest";
import { toggleTextFormatInSource } from "./textFormatting";

describe("text formatting toggles", () => {
  it("wraps and unwraps Typst bold selections", () => {
    const wrapped = toggleTextFormatInSource("hello world", { from: 6, to: 11 }, "typst", "bold");

    expect(wrapped.source).toBe("hello *world*");
    expect(wrapped.selection).toEqual({ from: 7, to: 12 });

    const unwrapped = toggleTextFormatInSource(wrapped.source, wrapped.selection, "typst", "bold");

    expect(unwrapped.source).toBe("hello world");
    expect(unwrapped.selection).toEqual({ from: 6, to: 11 });
  });

  it("unwraps Typst italic text when the cursor is inside it", () => {
    const result = toggleTextFormatInSource("start _middle_ end", { from: 9, to: 9 }, "typst", "italic");

    expect(result.source).toBe("start middle end");
    expect(result.selection).toEqual({ from: 6, to: 12 });
  });

  it("uses LaTeX text commands", () => {
    const wrapped = toggleTextFormatInSource("alpha beta", { from: 6, to: 10 }, "latex", "underline");

    expect(wrapped.source).toBe("alpha \\underline{beta}");

    const unwrapped = toggleTextFormatInSource(wrapped.source, { from: 17, to: 17 }, "latex", "underline");

    expect(unwrapped.source).toBe("alpha beta");
    expect(unwrapped.selection).toEqual({ from: 6, to: 10 });
  });

  it("uses Markdown delimiters and HTML underline", () => {
    expect(toggleTextFormatInSource("make bold", { from: 5, to: 9 }, "markdown", "bold").source).toBe(
      "make **bold**"
    );
    expect(toggleTextFormatInSource("make italic", { from: 5, to: 11 }, "markdown", "italic").source).toBe(
      "make _italic_"
    );
    expect(toggleTextFormatInSource("make underline", { from: 5, to: 14 }, "markdown", "underline").source).toBe(
      "make <u>underline</u>"
    );
  });
});
