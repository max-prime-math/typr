import { describe, expect, it } from "vitest";
import { getLeadingIndentColumns } from "./wrappedLineIndent";

describe("getLeadingIndentColumns", () => {
  it("counts leading spaces", () => {
    expect(getLeadingIndentColumns("    indented text", 2)).toBe(4);
  });

  it("expands leading tabs using the editor tab size", () => {
    expect(getLeadingIndentColumns("\t  indented text", 4)).toBe(6);
    expect(getLeadingIndentColumns(" \tindented text", 4)).toBe(4);
  });

  it("ignores whitespace after the first non-whitespace character", () => {
    expect(getLeadingIndentColumns("not indented", 2)).toBe(0);
    expect(getLeadingIndentColumns("  first  second", 2)).toBe(2);
  });
});
