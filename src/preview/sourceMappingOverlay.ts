import { parseSourceLocation, sourcePositionIntersectsRange, type SourcePosition } from "./sourceLinks";
import {
  createTypstRendererSession,
  type TypstRenderSession
} from "./typstRendererSession";

export async function renderSourceMappingOverlay(
  container: HTMLElement,
  artifactContent: Uint8Array
): Promise<SourceMappingOverlayHandle> {
  const rendererSession = await createTypstRendererSession(artifactContent);
  const { renderer, session } = rendererSession;

  try {
    container.innerHTML = "";
    await renderer.renderToCanvas({
      container,
      renderSession: session,
      pixelPerPt: getOverlayPixelPerPt(),
      backgroundColor: "#ffffff",
      dataSelection: {
        body: true,
        semantics: true
      }
    });
    normalizeSourceMappingOverlay(container);
  } catch (error) {
    rendererSession.dispose();
    throw error;
  }

  return {
    dispose() {
      container.innerHTML = "";
      rendererSession.dispose();
    },
    resolveSourceLocation(target) {
      return resolveSourceLocationForTarget(target, container, session);
    },
    resolveSourceLocationAt(point) {
      return resolveSourceLocationAtPoint(point, container, session);
    },
    resolveElementForSource(position) {
      return findElementForSourcePosition(container, session, position);
    }
  };
}

export interface SourceMappingOverlayHandle {
  dispose(): void;
  resolveSourceLocation(target: EventTarget | null): string | null;
  resolveSourceLocationAt(point: { x: number; y: number }): string | null;
  resolveElementForSource(position: SourcePosition): HTMLElement | null;
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
      canvasHost.style.opacity = "0";
      canvasHost.style.pointerEvents = "none";
    }
  }
}

function findElementForSourcePosition(
  container: HTMLElement,
  session: TypstRenderSession,
  position: SourcePosition
): HTMLElement | null {
  let bestElement: HTMLElement | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const element of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
    const location = resolveSourceLocationForElement(element, session, container);
    const range = location ? parseSourceLocation(location) : null;

    if (!range || !sourcePositionIntersectsRange(position, range)) {
      continue;
    }

    const rect = element.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const area = rect.width * rect.height;
    const distance = Math.abs(range.line - position.line);

    if (distance < bestDistance || (distance === bestDistance && area < bestArea)) {
      bestElement = element;
      bestArea = area;
      bestDistance = distance;
    }
  }

  return bestElement;
}

function resolveSourceLocationForTarget(
  target: EventTarget | null,
  container: HTMLElement,
  session: TypstRenderSession
): string | null {
  let current = target instanceof Element ? target : null;

  while (current && current !== container) {
    const sourceLocation = resolveSourceLocationForElement(current, session, container);

    if (sourceLocation) {
      return sourceLocation;
    }

    current = current.parentElement;
  }

  return null;
}

function resolveSourceLocationAtPoint(
  point: { x: number; y: number },
  container: HTMLElement,
  session: TypstRenderSession
): string | null {
  let bestSourceLocation: string | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  let bestDepth = -1;
  const elements = Array.from(container.querySelectorAll<Element>("*"));

  elements.forEach((element, depth) => {
    const sourceLocation = resolveSourceLocationForElement(element, session, container);

    if (!sourceLocation) {
      return;
    }

    const rect = element.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      point.x < rect.left ||
      point.x > rect.right ||
      point.y < rect.top ||
      point.y > rect.bottom
    ) {
      return;
    }

    const area = rect.width * rect.height;

    if (area < bestArea || (area === bestArea && depth > bestDepth)) {
      bestSourceLocation = sourceLocation;
      bestArea = area;
      bestDepth = depth;
    }
  });

  return bestSourceLocation;
}

function resolveSourceLocationForElement(
  element: Element,
  session: TypstRenderSession,
  container: HTMLElement
): string | null {
  for (const path of extractPathCandidatesFromElement(element, container)) {
    const sourceLocation = safeGetSourceLoc(session, path);

    if (sourceLocation) {
      return sourceLocation;
    }
  }

  return null;
}

function safeGetSourceLoc(session: TypstRenderSession, path: Uint32Array): string | null {
  try {
    return session.getSourceLoc(path) ?? null;
  } catch {
    return null;
  }
}

function extractPathCandidatesFromElement(element: Element, container: HTMLElement): Uint32Array[] {
  const candidates: Uint32Array[] = [];
  const attributes = Array.from(element.attributes);
  const textId = getTypstTextId(element);

  if (textId !== null) {
    const pageIndex = getTypstPageIndex(element, container);

    if (pageIndex !== null) {
      candidates.push(Uint32Array.from([pageIndex, textId]));
      candidates.push(Uint32Array.from([pageIndex + 1, textId]));
    }
  }

  for (const attribute of attributes) {
    if (!isNamedSourceAttribute(attribute.name, attribute.value)) {
      continue;
    }

    const path = parsePathValue(attribute.value);

    if (path) {
      candidates.push(path);
    }
  }

  for (const attribute of attributes) {
    if (
      isNamedSourceAttribute(attribute.name, attribute.value) ||
      !isNumericSourcePathValue(attribute.value)
    ) {
      continue;
    }

    const path = parsePathValue(attribute.value);

    if (path) {
      candidates.push(path);
    }
  }

  return candidates;
}

function isNamedSourceAttribute(name: string, value: string): boolean {
  if (!value) {
    return false;
  }

  return /(?:path|span|loc|source|position|tid)/i.test(name);
}

function isNumericSourcePathValue(value: string): boolean {
  return (
    /^\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]\s*$/.test(value) ||
    /^\s*\d+(?:\s*[,\s/:-]\s*\d+)*\s*$/.test(value)
  );
}

function getTypstTextId(element: Element): number | null {
  const value = element.getAttribute("data-text-id");

  if (value === null) {
    return null;
  }

  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

function getTypstPageIndex(element: Element, container: HTMLElement): number | null {
  const page = element.closest(".typst-page");

  if (!page) {
    return null;
  }

  const pages = Array.from(container.querySelectorAll(".typst-page"));
  const index = pages.indexOf(page);
  return index >= 0 ? index : null;
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

  return parts.length >= 1 ? Uint32Array.from(parts) : null;
}
