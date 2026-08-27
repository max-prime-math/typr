import { describe, expect, it } from "vitest";
import {
  PDF_MAGNIFIER_GOLDEN_RATIO,
  resolvePdfMagnifierCrop,
  resolvePdfMagnifierDimensions,
  resolvePdfMagnifierPlacement,
  resizePdfMagnifierDiameter
} from "./pdfMagnifier";

describe("PDF magnifier placement", () => {
  it("places the circle tangent to the left edge of an iPad finger contact", () => {
    const placement = resolvePdfMagnifierPlacement({
      bounds: { height: 700, left: 100, top: 40, width: 900 },
      contactWidth: 44,
      lensHeight: 168,
      lensWidth: 168,
      point: { clientX: 600, clientY: 390 },
      pointerType: "touch"
    });

    expect(placement.left).toBe(310);
    expect(placement.left + 168).toBe(600 - 100 - 22);
    expect(placement.top).toBe(266);
  });

  it("uses a minimum finger radius when Safari reports no contact width", () => {
    const placement = resolvePdfMagnifierPlacement({
      bounds: { height: 700, left: 0, top: 0, width: 900 },
      contactWidth: 0,
      lensHeight: 168,
      lensWidth: 168,
      point: { clientX: 500, clientY: 350 },
      pointerType: "touch"
    });

    expect(placement.left + 168).toBe(482);
  });

  it("centers the larger loupe on a desktop pointer", () => {
    const placement = resolvePdfMagnifierPlacement({
      bounds: { height: 700, left: 100, top: 40, width: 900 },
      contactWidth: 1,
      lensHeight: 224,
      lensWidth: 224,
      point: { clientX: 600, clientY: 390 },
      pointerType: "mouse"
    });

    expect(placement.left).toBe(388);
    expect(placement.left + 112).toBe(500);
    expect(placement.top).toBe(238);
  });

  it("keeps the loupe vertically inside the preview", () => {
    expect(resolvePdfMagnifierPlacement({
      bounds: { height: 400, left: 0, top: 0, width: 600 },
      contactWidth: 40,
      lensHeight: 168,
      lensWidth: 168,
      point: { clientX: 400, clientY: 10 },
      pointerType: "touch"
    }).top).toBe(8);

    expect(resolvePdfMagnifierPlacement({
      bounds: { height: 400, left: 0, top: 0, width: 600 },
      contactWidth: 40,
      lensHeight: 168,
      lensWidth: 168,
      point: { clientX: 400, clientY: 395 },
      pointerType: "touch"
    }).top).toBe(224);
  });
});

describe("PDF magnifier shape", () => {
  it("keeps circles square and makes rectangles landscape golden ratios", () => {
    expect(resolvePdfMagnifierDimensions(320, "circle")).toEqual({
      height: 320,
      width: 320
    });
    const rectangle = resolvePdfMagnifierDimensions(320, "rectangle");
    expect(rectangle.width / rectangle.height).toBeCloseTo(PDF_MAGNIFIER_GOLDEN_RATIO);
  });
});

describe("PDF magnifier canvas crop", () => {
  it("centers an interior page point at the requested magnification", () => {
    expect(resolvePdfMagnifierCrop({
      canvasHeight: 1600,
      canvasWidth: 1200,
      destinationHeight: 336,
      destinationWidth: 336,
      lensHeight: 168,
      lensWidth: 168,
      magnification: 2,
      pageHeight: 800,
      pageWidth: 600,
      pointX: 300,
      pointY: 400
    })).toEqual({
      destinationHeight: 336,
      destinationWidth: 336,
      destinationX: 0,
      destinationY: 0,
      sourceHeight: 168,
      sourceWidth: 168,
      sourceX: 516,
      sourceY: 716
    });
  });

  it("leaves correctly positioned blank space at a page edge", () => {
    const crop = resolvePdfMagnifierCrop({
      canvasHeight: 1600,
      canvasWidth: 1200,
      destinationHeight: 336,
      destinationWidth: 336,
      lensHeight: 168,
      lensWidth: 168,
      magnification: 2,
      pageHeight: 800,
      pageWidth: 600,
      pointX: 0,
      pointY: 400
    });

    expect(crop?.sourceX).toBe(0);
    expect(crop?.destinationX).toBe(168);
    expect(crop?.destinationWidth).toBe(168);
  });
});

describe("PDF magnifier wheel resizing", () => {
  it("enlarges on scroll up and shrinks on scroll down", () => {
    expect(resizePdfMagnifierDiameter(288, -80)).toBe(308);
    expect(resizePdfMagnifierDiameter(288, 80)).toBe(268);
  });

  it("clamps the diameter at usable desktop limits", () => {
    expect(resizePdfMagnifierDiameter(550, -200)).toBe(560);
    expect(resizePdfMagnifierDiameter(170, 200)).toBe(160);
  });
});
