import { describe, expect, it } from "vitest";
import {
  captureTypstCanvasScrollAnchor,
  restoreTypstCanvasScrollAnchor
} from "./typstCanvasRenderer";

function fakePage(offsetTop: number, offsetHeight: number): HTMLElement {
  return { offsetTop, offsetHeight } as HTMLElement;
}

function fakeContainer(
  pages: HTMLElement[],
  options: { clientHeight: number; scrollHeight: number; scrollTop: number }
): HTMLElement {
  return {
    ...options,
    querySelectorAll: () => pages
  } as unknown as HTMLElement;
}

describe("Typst canvas page scroll anchors", () => {
  it("restores the same page and within-page position after replacement", () => {
    const before = fakeContainer(
      [fakePage(0, 800), fakePage(820, 800), fakePage(1640, 800)],
      { clientHeight: 600, scrollHeight: 2440, scrollTop: 1040 }
    );
    const anchor = captureTypstCanvasScrollAnchor(before);
    expect(anchor?.pageIndex).toBe(1);

    const after = fakeContainer(
      [fakePage(0, 900), fakePage(920, 900), fakePage(1840, 900)],
      { clientHeight: 600, scrollHeight: 2740, scrollTop: 0 }
    );
    restoreTypstCanvasScrollAnchor(after, anchor);

    expect(after.scrollTop).toBeCloseTo(1171.5, 5);
  });

  it("clamps to the last page when a recompile removes pages", () => {
    const anchor = {
      pageIndex: 4,
      pageYRatio: 0.5,
      viewportY: 32,
      fallbackYRatio: 0.8
    };
    const after = fakeContainer(
      [fakePage(0, 700), fakePage(720, 700)],
      { clientHeight: 500, scrollHeight: 1420, scrollTop: 0 }
    );

    restoreTypstCanvasScrollAnchor(after, anchor);
    expect(after.scrollTop).toBe(1038);
  });
});
