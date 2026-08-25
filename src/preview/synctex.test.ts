import { describe, expect, it } from "vitest";
import { gzipSync, strToU8 } from "fflate";
import { resolveSynctexForwardSearch, resolveSynctexReverseSearch } from "./synctex";

const synctex = gzipSync(strToU8([
  "SyncTeX Version:1",
  "Input:1:Booklet 1/booklet_01.tex",
  "Input:2:Booklet 1/chapters/second.tex",
  "Output:pdf",
  "Magnification:1000",
  "Unit:1",
  "X Offset:0",
  "Y Offset:0",
  "Content:",
  "{1",
  "x1,10:6578176,6578176",
  "x2,20:13156352,13156352",
  "}1",
  "Postamble:"
].join("\n")));

describe("SyncTeX source mapping", () => {
  it("uses precise character records for reverse search", () => {
    const link = resolveSynctexReverseSearch(synctex, { pageNumber: 1, x: 200, y: 200 });

    expect(link?.source).toMatchObject({ path: "Booklet 1/chapters/second.tex", line: 20, column: 0 });
    expect(link?.previewRect?.pageNumber).toBe(1);
    expect(link?.previewRect?.left).toBeCloseTo(200);
    expect(link?.previewRect?.top).toBeCloseTo(200);
  });

  it("matches nested project paths for forward search", () => {
    const link = resolveSynctexForwardSearch(synctex, {
      path: "Booklet 1/chapters/second.tex",
      line: 20,
      column: 0
    });

    expect(link?.source).toMatchObject({ path: "Booklet 1/chapters/second.tex", line: 20 });
    expect(link?.previewRect?.pageNumber).toBe(1);
    expect(link?.previewRect?.left).toBeCloseTo(200);
    expect(link?.previewRect?.top).toBeCloseTo(200);
  });
});
