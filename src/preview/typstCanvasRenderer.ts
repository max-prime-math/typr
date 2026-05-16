import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";

interface TypstRendererModule {
  createTypstRenderer(): {
    init(options: { getModule: () => string }): Promise<void>;
    renderToCanvas(options: {
      container: HTMLElement;
      artifactContent: Uint8Array;
      format: "vector";
      pixelPerPt?: number;
      backgroundColor?: string;
      dataSelection?: {
        body?: boolean;
        semantics?: boolean;
      };
    }): Promise<void>;
  };
}

let rendererPromise:
  | Promise<ReturnType<TypstRendererModule["createTypstRenderer"]>>
  | null = null;

export async function renderTypstArtifactToCanvas(
  container: HTMLElement,
  artifactContent: Uint8Array
): Promise<void> {
  const renderer = await getRenderer();
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

async function getRenderer() {
  if (!rendererPromise) {
    rendererPromise = import("@myriaddreamin/typst.ts/renderer")
      .then((module) => module as unknown as TypstRendererModule)
      .then(async (module) => {
        const renderer = module.createTypstRenderer();
        await renderer.init({
          getModule: () => typstRendererWasmUrl
        });
        return renderer;
      });
  }

  return rendererPromise;
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
