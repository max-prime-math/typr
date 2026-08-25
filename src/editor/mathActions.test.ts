import { describe, expect, it } from "vitest";
import {
  applyMathDelimiterEdit,
  getMathDelimiterEdit,
  getSelectedMathDelimiterExit,
  getMathDelimiterTabEdit,
  type MathDelimiterKey
} from "./mathActions";
import type { SourceLanguage } from "../compiler/sourceFileTypes";

function typeDelimiter(
  source: string,
  cursor: number,
  key: MathDelimiterKey,
  language: SourceLanguage = "latex"
): { source: string; cursor: number } | null {
  const edit = getMathDelimiterEdit(source, { from: cursor, to: cursor }, key, language);
  return edit ? { source: applyMathDelimiterEdit(source, edit), cursor: edit.cursor } : null;
}

describe("typed math delimiters", () => {
  it("inserts, promotes, and cancels consecutive dollar delimiters", () => {
    const single = typeDelimiter("", 0, "$");
    expect(single).toEqual({ source: "$$", cursor: 1 });

    const double = typeDelimiter(single!.source, single!.cursor, "$");
    expect(double).toEqual({ source: "$$$$", cursor: 2 });

    expect(typeDelimiter(double!.source, double!.cursor, "$")).toEqual({
      source: "",
      cursor: 0
    });
  });

  it("exits single and double dollar delimiters after content", () => {
    expect(typeDelimiter("$x$", 2, "$")).toEqual({ source: "$x$", cursor: 3 });
    expect(typeDelimiter("$$x$$", 3, "$")).toEqual({ source: "$$x$$", cursor: 5 });
  });

  it("does not auto-pair an escaped dollar", () => {
    expect(typeDelimiter("\\", 1, "$")).toBeNull();
  });

  it("wraps a selection tightly", () => {
    const edit = getMathDelimiterEdit("alpha", { from: 0, to: 5 }, "$", "latex");
    expect(edit).not.toBeNull();
    expect(applyMathDelimiterEdit("alpha", edit!)).toBe("$alpha$");
    expect(edit?.selection).toEqual({ anchor: 1, head: 6 });
  });

  it("promotes and cancels dollar delimiters while keeping text selected", () => {
    const promoted = getMathDelimiterEdit("$alpha$", { from: 1, to: 6 }, "$", "latex");
    expect(applyMathDelimiterEdit("$alpha$", promoted!)).toBe("$$alpha$$");
    expect(promoted?.selection).toEqual({ anchor: 2, head: 7 });

    const cancelled = getMathDelimiterEdit("$$alpha$$", { from: 2, to: 7 }, "$", "latex");
    expect(applyMathDelimiterEdit("$$alpha$$", cancelled!)).toBe("alpha");
    expect(cancelled?.selection).toEqual({ anchor: 0, head: 5 });
  });

  it("pairs LaTeX bracket and parenthesis math delimiters", () => {
    expect(typeDelimiter("\\", 1, "[")).toEqual({ source: "\\[\\]", cursor: 2 });
    expect(typeDelimiter("\\", 1, "(")).toEqual({ source: "\\(\\)", cursor: 2 });
  });

  it("exits slash delimiters with the closing key", () => {
    expect(typeDelimiter("\\[x\\]", 3, "]")).toEqual({ source: "\\[x\\]", cursor: 5 });
    expect(typeDelimiter("\\(x\\)", 3, ")")).toEqual({ source: "\\(x\\)", cursor: 5 });

    const selected = getMathDelimiterEdit("\\[text\\]", { from: 2, to: 6 }, "]", "latex");
    expect(selected?.cursor).toBe(8);
  });

  it("accepts typing the complete slash closer", () => {
    expect(typeDelimiter("\\[x\\\\]", 4, "]")).toEqual({ source: "\\[x\\]", cursor: 5 });
  });

  it("only pairs slash delimiters in LaTeX-compatible languages", () => {
    expect(typeDelimiter("\\", 1, "[", "typst")).toBeNull();
  });
});

describe("tabbing out of math delimiters", () => {
  it("crosses each supported closing delimiter", () => {
    expect(getMathDelimiterTabEdit("$$", 1, "latex")?.cursor).toBe(2);
    expect(getMathDelimiterTabEdit("$$$$", 2, "latex")?.cursor).toBe(4);
    expect(getMathDelimiterTabEdit("$x$", 2, "latex")?.cursor).toBe(3);
    expect(getMathDelimiterTabEdit("$$x$$", 3, "latex")?.cursor).toBe(5);
    expect(getMathDelimiterTabEdit("\\[x\\]", 3, "latex")?.cursor).toBe(5);
    expect(getMathDelimiterTabEdit("\\(x\\)", 3, "markdown")?.cursor).toBe(5);
  });

  it("crosses a delimiter while its content remains selected", () => {
    expect(getSelectedMathDelimiterExit("$text$", { from: 1, to: 5 }, "latex")).toBe(6);
    expect(getSelectedMathDelimiterExit("$$text$$", { from: 2, to: 6 }, "latex")).toBe(8);
    expect(getSelectedMathDelimiterExit("\\[text\\]", { from: 2, to: 6 }, "latex")).toBe(8);
  });

  it("leaves Tab alone outside an active delimiter", () => {
    expect(getMathDelimiterTabEdit("plain", 5, "latex")).toBeNull();
  });
});
