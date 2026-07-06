import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

const DEFAULT_PDF_WIDTH = 640;
const DEFAULT_PDF_HEIGHT = 480;

export async function exportSvgToVectorPdfBytes(svgMarkup: string): Promise<Uint8Array<ArrayBuffer>> {
  const svgElement = parseSvgElement(svgMarkup);
  const size = getSvgSize(svgElement);
  const pdf = new jsPDF({
    compress: true,
    format: [size.width, size.height],
    orientation: size.width > size.height ? "landscape" : "portrait",
    unit: "pt"
  });

  await svg2pdf(svgElement, pdf, {
    height: size.height,
    loadExternalStyleSheets: false,
    width: size.width,
    x: 0,
    y: 0
  });

  return new Uint8Array(pdf.output("arraybuffer"));
}

function parseSvgElement(svgMarkup: string): SVGSVGElement {
  const document = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    throw new Error("Unable to export diagram PDF because the SVG markup is invalid.");
  }

  const svgElement = document.documentElement;

  if (!(svgElement instanceof SVGSVGElement) && svgElement.localName.toLowerCase() !== "svg") {
    throw new Error("Unable to export diagram PDF because the document is not an SVG.");
  }

  return svgElement as unknown as SVGSVGElement;
}

function getSvgSize(svgElement: SVGSVGElement): { width: number; height: number } {
  const width = parseSvgLength(svgElement.getAttribute("width"));
  const height = parseSvgLength(svgElement.getAttribute("height"));

  if (width > 0 && height > 0) {
    return { width, height };
  }

  const viewBox = svgElement.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number) ?? [];
  const viewBoxWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : 0;
  const viewBoxHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : 0;

  return {
    width: viewBoxWidth > 0 ? viewBoxWidth : DEFAULT_PDF_WIDTH,
    height: viewBoxHeight > 0 ? viewBoxHeight : DEFAULT_PDF_HEIGHT
  };
}

function parseSvgLength(value: string | null): number {
  if (!value) {
    return 0;
  }

  const match = /^([+-]?(?:\d+|\d*\.\d+))(px|pt|in|cm|mm)?$/i.exec(value.trim());

  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  switch (match[2]?.toLowerCase()) {
    case "in":
      return amount * 72;
    case "cm":
      return (amount * 72) / 2.54;
    case "mm":
      return (amount * 72) / 25.4;
    case "pt":
    case "px":
    default:
      return amount;
  }
}
