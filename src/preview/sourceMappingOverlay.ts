import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";

interface TypstRendererModule {
  createTypstRenderer(): TypstRendererDriver;
}

interface TypstRendererDriver {
  init(options: { getModule: () => string }): Promise<void>;
  createModule(artifactContent: Uint8Array): Promise<TypstRenderSession>;
  renderToCanvas(options: {
    container: HTMLElement;
    renderSession: TypstRenderSession;
    pixelPerPt?: number;
    backgroundColor?: string;
    dataSelection?: {
      body?: boolean;
      semantics?: boolean;
    };
  }): Promise<void>;
}

interface TypstRenderSession {
  getSourceLoc(path: Uint32Array): string | undefined;
  free?(): void;
}

let rendererPromise: Promise<TypstRendererDriver> | null = null;

export async function renderSourceMappingOverlay(
  container: HTMLElement,
  artifactContent: Uint8Array,
  paperView = false
): Promise<SourceMappingOverlayHandle> {
  const renderer = await getRenderer();
  const session = await renderer.createModule(artifactContent);

  try {
    container.innerHTML = "";
    await renderer.renderToCanvas({
      container,
      renderSession: session,
      pixelPerPt: getOverlayPixelPerPt(),
      backgroundColor: paperView ? "#fffef9" : "#ffffff",
      dataSelection: {
        body: false,
        semantics: true
      }
    });
    normalizeSourceMappingOverlay(container);
  } catch (error) {
    session.free?.();
    throw error;
  }

  return {
    dispose() {
      container.innerHTML = "";
      session.free?.();
    },
    resolveSourceLocation(target) {
      const path = extractSemanticPath(target, container);

      if (!path) {
        return null;
      }

      return session.getSourceLoc(path) ?? null;
    }
  };
}

export interface SourceMappingOverlayHandle {
  dispose(): void;
  resolveSourceLocation(target: EventTarget | null): string | null;
}

async function getRenderer(): Promise<TypstRendererDriver> {
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

function getOverlayPixelPerPt(): number {
  if (typeof window === "undefined") {
    return 3;
  }

  return Math.min(4, Math.max(2, window.devicePixelRatio || 1));
}

function normalizeSourceMappingOverlay(container: HTMLElement): void {
  for (const page of Array.from(
    container.querySelectorAll<HTMLElement>(".typst-page.canvas")
  )) {
    const canvasHost = page.querySelector<HTMLElement>("canvas")?.parentElement;

    page.style.margin = "0 auto";
    page.style.overflow = "hidden";

    if (canvasHost) {
      canvasHost.style.position = "absolute";
      canvasHost.style.inset = "0";
      canvasHost.style.pointerEvents = "none";
    }
  }
}

function extractSemanticPath(
  target: EventTarget | null,
  container: HTMLElement
): Uint32Array | null {
  let current = target instanceof Element ? target : null;

  while (current && current !== container) {
    const path = extractPathFromElement(current);

    if (path) {
      return path;
    }

    current = current.parentElement;
  }

  return null;
}

function extractPathFromElement(element: Element): Uint32Array | null {
  for (const attribute of Array.from(element.attributes)) {
    if (!isCandidateSourceAttribute(attribute.name, attribute.value)) {
      continue;
    }

    const path = parsePathValue(attribute.value);

    if (path) {
      return path;
    }
  }

  return null;
}

function isCandidateSourceAttribute(name: string, value: string): boolean {
  if (!value) {
    return false;
  }

  return (
    /(?:path|span|loc|source|position)/i.test(name) ||
    (/^\s*\[\s*\d+(?:\s*,\s*\d+)+\s*\]\s*$/.test(value) ||
      /^\s*\d+(?:\s*[,\s/:-]\s*\d+){1,}\s*$/.test(value))
  );
}

function parsePathValue(value: string): Uint32Array | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed) && parsed.every((part) => Number.isInteger(part))) {
        return Uint32Array.from(parsed);
      }
    } catch {
      return null;
    }
  }

  const parts = trimmed
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isInteger(part));

  return parts.length >= 2 ? Uint32Array.from(parts) : null;
}
