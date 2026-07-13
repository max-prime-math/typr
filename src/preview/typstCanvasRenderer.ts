import { getTypstRenderer } from "./typstRendererSession";

export async function renderTypstArtifactToCanvas(
  container: HTMLElement,
  artifactContent: Uint8Array
): Promise<void> {
  const renderer = await getTypstRenderer();
  container.innerHTML = "";
  await renderer.renderToCanvas({
    container,
    artifactContent,
    format: "vector",
    pixelPerPt: getPreviewPixelPerPt(),
    backgroundColor: "#ffffff",
    dataSelection: {
      body: true,
      semantics: false
    }
  });
  normalizeCanvasPreview(container);
}

export interface TypstCanvasZoomState {
  mode: "fit-width" | "fit-height" | "fit-page" | "percent";
  percent: number;
}

export function applyTypstCanvasZoom(
  container: HTMLElement,
  zoom: TypstCanvasZoomState = { mode: "fit-width", percent: 100 }
): void {
  const style = getComputedStyle(container);
  const availableWidth = Math.max(
    1,
    container.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0")
  );
  const availableHeight = Math.max(
    1,
    container.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0")
  );

  for (const page of Array.from(container.querySelectorAll<HTMLElement>(".typst-page.canvas"))) {
    const naturalWidth = Number.parseFloat(page.dataset.typstNaturalWidth ?? "");
    const naturalHeight = Number.parseFloat(page.dataset.typstNaturalHeight ?? "");

    if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
      continue;
    }

    const fitWidthScale = availableWidth / naturalWidth;
    const fitHeightScale = availableHeight / naturalHeight;
    const scale = zoom.mode === "fit-height"
      ? fitHeightScale
      : zoom.mode === "fit-page"
        ? Math.min(fitWidthScale, fitHeightScale)
        : zoom.mode === "percent"
          ? fitWidthScale * (zoom.percent / 100)
          : fitWidthScale;
    const width = Math.max(1, naturalWidth * scale);
    const height = Math.max(1, naturalHeight * scale);
    const canvas = page.querySelector<HTMLCanvasElement>("canvas");

    page.style.width = `${width}px`;
    page.style.height = `${height}px`;

    if (canvas) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  }
}

function getPreviewPixelPerPt(): number {
  if (typeof window === "undefined") {
    return 6;
  }

  const deviceScale = Math.max(1, window.devicePixelRatio || 1);
  const isChromium =
    typeof navigator !== "undefined" &&
    /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent) &&
    !/Firefox\//.test(navigator.userAgent);

  if (isChromium) {
    return Math.min(10, Math.max(6, deviceScale * 5));
  }

  return Math.min(6, Math.max(4, deviceScale * 3));
}

function normalizeCanvasPreview(container: HTMLElement): void {
  for (const semanticsLayer of Array.from(
    container.querySelectorAll<HTMLElement>(".typst-html-semantics")
  )) {
    semanticsLayer.remove();
  }

  for (const page of Array.from(
    container.querySelectorAll<HTMLElement>(".typst-page.canvas")
  )) {
    const canvas = page.querySelector<HTMLCanvasElement>("canvas");
    const canvasHost = canvas?.parentElement as HTMLElement | null;

    if (!canvas || !canvasHost) {
      continue;
    }

    const containerWidth = container.clientWidth || page.clientWidth || 600;
    const canvasNaturalWidth = canvas.width || 600;
    const canvasNaturalHeight = canvas.height || 842;
    page.dataset.typstNaturalWidth = String(canvasNaturalWidth);
    page.dataset.typstNaturalHeight = String(canvasNaturalHeight);

    if (canvasNaturalWidth <= 0) {
      continue;
    }

    const scale = containerWidth / canvasNaturalWidth;
    const scaledHeight = canvasNaturalHeight * scale;

    page.style.position = "relative";
    page.style.width = `${containerWidth}px`;
    page.style.height = `${scaledHeight}px`;
    page.style.margin = "0 auto";
    page.style.overflow = "hidden";

    canvasHost.style.position = "absolute";
    canvasHost.style.inset = "0";
    canvasHost.style.transform = "none";

    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${scaledHeight}px`;
    canvas.style.imageRendering = "crisp-edges";
  }
}
