import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfCanvasRenderOptions {
  paperView?: boolean;
  darkMode?: boolean;
}

export async function renderPdfArtifactToCanvas(
  container: HTMLElement,
  artifactContent: Uint8Array,
  options: PdfCanvasRenderOptions = {}
): Promise<void> {
  const pdfDocument = await getDocument({
    data: copyBytes(artifactContent)
  }).promise;

  try {
    container.innerHTML = "";
    container.classList.toggle("preview-document--pdf-canvas-dark", Boolean(options.darkMode && !options.paperView));

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const scale = getPdfRenderScale();
      const viewport = page.getViewport({ scale });
      const cssViewport = page.getViewport({ scale: 1 });
      const pageElement = document.createElement("div");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", {
        alpha: false
      });

      if (!context) {
        throw new Error("Unable to create PDF canvas context.");
      }

      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;

      pageElement.className = "pdf-page canvas";
      pageElement.style.width = `${cssViewport.width}px`;
      pageElement.style.height = `${cssViewport.height}px`;
      pageElement.appendChild(canvas);
      container.appendChild(pageElement);

      await page.render({
        canvas,
        canvasContext: context,
        viewport
      }).promise;
    }

    normalizePdfCanvasPreview(container);
  } finally {
    await destroyPdfDocument(pdfDocument);
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function getPdfRenderScale(): number {
  if (typeof window === "undefined") {
    return 2;
  }

  const deviceScale = Math.max(1, window.devicePixelRatio || 1);
  return Math.min(4, Math.max(2, deviceScale * 2));
}

function normalizePdfCanvasPreview(container: HTMLElement): void {
  for (const page of Array.from(container.querySelectorAll<HTMLElement>(".pdf-page.canvas"))) {
    const canvas = page.querySelector<HTMLCanvasElement>("canvas");

    if (!canvas) {
      continue;
    }

    const containerWidth = container.clientWidth || page.clientWidth || 600;
    const pageNaturalWidth = Number.parseFloat(page.style.width) || canvas.width || 600;
    const pageNaturalHeight = Number.parseFloat(page.style.height) || canvas.height || 842;

    if (pageNaturalWidth <= 0) {
      continue;
    }

    const scale = containerWidth / pageNaturalWidth;
    const scaledHeight = pageNaturalHeight * scale;

    page.style.position = "relative";
    page.style.width = `${containerWidth}px`;
    page.style.height = `${scaledHeight}px`;
    page.style.margin = "0 auto";
    page.style.overflow = "hidden";

    canvas.style.display = "block";
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${scaledHeight}px`;
    canvas.style.imageRendering = "auto";
  }
}

async function destroyPdfDocument(document: PDFDocumentProxy): Promise<void> {
  try {
    await document.cleanup();
  } catch {
    // Best-effort cleanup only.
  }
}
