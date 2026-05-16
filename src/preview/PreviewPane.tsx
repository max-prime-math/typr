import { useEffect, useMemo, useRef, useState } from "react";
import type { CompilerStatus, CompileResult } from "../compiler/typstCompiler";
import { renderTypstArtifactToCanvas } from "./typstCanvasRenderer";

interface PreviewPaneProps {
  result: CompileResult | null;
  isCompiling: boolean;
  compilerStatus: CompilerStatus;
}

export function PreviewPane({
  result,
  isCompiling,
  compilerStatus
}: PreviewPaneProps) {
  const [showDebug, setShowDebug] = useState(false);

  if (result === null) {
    return (
      <div className="preview-state">
        <div className="preview-status">
          <p>{isCompiling ? compilerStatus.label : "Preparing preview..."}</p>
          {compilerStatus.detail ? (
            <p className="preview-status__detail">{compilerStatus.detail}</p>
          ) : null}
        </div>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="preview-layout">
        <div className="diagnostics diagnostics--error">
          <h3>Compile errors</h3>
          <ul>
            {result.errors.map((error, index) => (
              <li key={`${error.message}-${index}`}>
                {formatDiagnostic(error)}
              </li>
            ))}
          </ul>
        </div>
        <div className="preview-state">
          <div className="preview-status">
            <p>The preview could not be generated.</p>
            {compilerStatus.detail ? (
              <p className="preview-status__detail">{compilerStatus.detail}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-layout">
      {result.diagnostics.length > 0 ? (
        <div className="diagnostics diagnostics--warning">
          <h3>Diagnostics</h3>
          <ul>
            {result.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.message}-${index}`}>
                {formatDiagnostic(diagnostic)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="preview-surface">
        <div className="preview-toolbar">
          <div className="preview-engine">Engine: {result.engine}</div>
          <button
            className="preview-debug-toggle"
            onClick={() => setShowDebug((current) => !current)}
            type="button"
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>
        {shouldUseChromiumCanvasPreview(result) ? (
          <ChromiumCanvasPreview artifactData={result.output.artifactData!} />
        ) : (
          <PreviewDocument markup={result.output.content} />
        )}
        {showDebug ? (
          <PreviewDebugPanel markup={result.output.content} />
        ) : null}
      </div>
    </div>
  );
}

function PreviewDocument({ markup }: { markup: string }) {
  const normalizedMarkup = useMemo(() => normalizePreviewSvg(markup), [markup]);
  const displayMarkup = normalizedMarkup;

  const blobUrl = useMemo(() => {
    const blob = new Blob([displayMarkup], { type: "image/svg+xml" });
    return URL.createObjectURL(blob);
  }, [displayMarkup]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return (
    <div className="preview-document">
      <img
        alt="Typst preview document"
        className="preview-document__object"
        draggable={false}
        src={blobUrl}
      />
    </div>
  );
}

function ChromiumCanvasPreview({
  artifactData
}: {
  artifactData: Uint8Array;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let cancelled = false;
    setRenderError(null);

    void renderTypstArtifactToCanvas(container, artifactData).catch((error) => {
      if (!cancelled) {
        setRenderError(
          error instanceof Error ? error.message : "Canvas preview failed."
        );
      }
    });

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [artifactData, containerRef]);

  if (renderError) {
    return (
      <div className="preview-document">
        <div className="preview-canvas-error">{renderError}</div>
      </div>
    );
  }

  return <div className="preview-document preview-document--canvas" ref={containerRef} />;
}

function PreviewDebugPanel({ markup }: { markup: string }) {
  const debugInfo = useMemo(() => analyzePreviewMarkup(markup), [markup]);

  return (
    <section className="preview-debug-panel" aria-label="Preview debug information">
      <h3>Preview Debug</h3>
      <div className="preview-debug-grid">
        <div className="preview-debug-card">
          <h4>Structure</h4>
          <ul>
            <li>SVG tag: {debugInfo.hasSvg ? "yes" : "no"}</li>
            <li>Defs blocks: {debugInfo.defsCount}</li>
            <li>Path tags: {debugInfo.pathCount}</li>
            <li>Outline glyph markers: {debugInfo.outlineGlyphCount}</li>
            <li>Use tags: {debugInfo.useCount}</li>
          </ul>
        </div>
        <div className="preview-debug-card">
          <h4>Embedded Content</h4>
          <ul>
            <li>Images: {debugInfo.imageCount}</li>
            <li>Data image URLs: {debugInfo.dataImageCount}</li>
            <li>foreignObject tags: {debugInfo.foreignObjectCount}</li>
            <li>Text tags: {debugInfo.textCount}</li>
            <li>Script tags: {debugInfo.scriptCount}</li>
          </ul>
        </div>
        <div className="preview-debug-card">
          <h4>SVG Metrics</h4>
          <ul>
            <li>ViewBox: {debugInfo.viewBox ?? "missing"}</li>
            <li>Width: {debugInfo.width ?? "missing"}</li>
            <li>Height: {debugInfo.height ?? "missing"}</li>
            <li>data-width: {debugInfo.dataWidth ?? "missing"}</li>
            <li>data-height: {debugInfo.dataHeight ?? "missing"}</li>
          </ul>
        </div>
      </div>
      <details className="preview-debug-markup">
        <summary>Markup excerpt</summary>
        <pre>{debugInfo.excerpt}</pre>
      </details>
    </section>
  );
}

function formatDiagnostic(diagnostic: {
  message: string;
  path?: string;
  range?: string;
  packageName?: string;
}) {
  const location = [diagnostic.packageName, diagnostic.path, diagnostic.range]
    .filter(Boolean)
    .join(" ");

  return location ? `${location}: ${diagnostic.message}` : diagnostic.message;
}

function analyzePreviewMarkup(markup: string) {
  return {
    hasSvg: /<svg\b/i.test(markup),
    defsCount: countMatches(markup, /<defs\b/gi),
    pathCount: countMatches(markup, /<path\b/gi),
    outlineGlyphCount: countMatches(markup, /outline_glyph/gi),
    useCount: countMatches(markup, /<use\b/gi),
    imageCount: countMatches(markup, /<image\b/gi),
    dataImageCount: countMatches(markup, /data:image\//gi),
    foreignObjectCount: countMatches(markup, /<foreignObject\b/gi),
    textCount: countMatches(markup, /<text\b/gi),
    scriptCount: countMatches(markup, /<script\b/gi),
    viewBox: extractAttribute(markup, "viewBox"),
    width: extractAttribute(markup, "width"),
    height: extractAttribute(markup, "height"),
    dataWidth: extractAttribute(markup, "data-width"),
    dataHeight: extractAttribute(markup, "data-height"),
    excerpt: markup.slice(0, 2500)
  };
}

function shouldUseChromiumCanvasPreview(result: CompileResult): boolean {
  return false;
}

function normalizePreviewSvg(markup: string): string {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return markup;
  }

  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(markup, "image/svg+xml");
    const svg = document.documentElement;

    if (!svg || svg.nodeName.toLowerCase() !== "svg") {
      return markup;
    }

    const glyphDefs = new Map<string, SVGElement>();

    for (const element of Array.from(document.querySelectorAll("defs .outline_glyph[id]"))) {
      glyphDefs.set(element.id, element as SVGElement);
    }

    for (const useElement of Array.from(document.querySelectorAll("use"))) {
      const href =
        useElement.getAttribute("href") ??
        useElement.getAttribute("xlink:href");

      if (!href || !href.startsWith("#")) {
        continue;
      }

      const glyphDefinition = glyphDefs.get(href.slice(1));

      if (!glyphDefinition) {
        continue;
      }

      const replacement = glyphDefinition.cloneNode(true) as SVGElement;
      replacement.removeAttribute("id");

      const x = useElement.getAttribute("x");
      const y = useElement.getAttribute("y");
      const useTransform = useElement.getAttribute("transform");
      const translate = x || y ? `translate(${x ?? "0"} ${y ?? "0"})` : "";
      const mergedTransform = [translate, useTransform].filter(Boolean).join(" ");

      if (mergedTransform) {
        replacement.setAttribute("transform", mergedTransform);
      }

      const useClass = useElement.getAttribute("class");
      if (useClass) {
        replacement.setAttribute(
          "class",
          [replacement.getAttribute("class"), useClass].filter(Boolean).join(" ")
        );
      }

      for (const attributeName of useElement.getAttributeNames()) {
        if (
          attributeName === "href" ||
          attributeName === "xlink:href" ||
          attributeName === "x" ||
          attributeName === "y" ||
          attributeName === "transform" ||
          attributeName === "class"
        ) {
          continue;
        }

        replacement.setAttribute(
          attributeName,
          useElement.getAttribute(attributeName) ?? ""
        );
      }

      useElement.replaceWith(replacement);
    }

    for (const defsUse of Array.from(document.querySelectorAll("defs use"))) {
      defsUse.remove();
    }

    return new XMLSerializer().serializeToString(document);
  } catch {
    return markup;
  }
}

function applyChromiumSupersampling(markup: string): string {
  if (!isChromiumBrowser()) {
    return markup;
  }

  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return markup;
  }

  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(markup, "image/svg+xml");
    const svg = document.documentElement;

    if (!svg || svg.nodeName.toLowerCase() !== "svg") {
      return markup;
    }

    const factor = 2;
    scaleNumericAttribute(svg, "width", factor);
    scaleNumericAttribute(svg, "height", factor);
    scaleNumericAttribute(svg, "data-width", factor);
    scaleNumericAttribute(svg, "data-height", factor);

    const existingStyle = svg.getAttribute("style") ?? "";
    const extraStyle = "shape-rendering:geometricPrecision;text-rendering:geometricPrecision;";
    svg.setAttribute("style", `${existingStyle}${existingStyle ? ";" : ""}${extraStyle}`);

    return new XMLSerializer().serializeToString(document);
  } catch {
    return markup;
  }
}

function scaleNumericAttribute(
  element: Element,
  attributeName: string,
  factor: number
): void {
  const rawValue = element.getAttribute(attributeName);

  if (!rawValue) {
    return;
  }

  const match = rawValue.match(/^([0-9]+(?:\.[0-9]+)?)(.*)$/);

  if (!match) {
    return;
  }

  const numericValue = Number.parseFloat(match[1]);
  const suffix = match[2] ?? "";

  if (Number.isNaN(numericValue)) {
    return;
  }

  element.setAttribute(attributeName, `${(numericValue * factor).toFixed(3)}${suffix}`);
}

function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isEdgeOrChrome =
    userAgent.includes("Edg/") || userAgent.includes("Chrome/");
  const isFirefox = userAgent.includes("Firefox/");
  const isSafari = userAgent.includes("Safari/") && !userAgent.includes("Chrome/");

  return isEdgeOrChrome && !isFirefox && !isSafari;
}

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) || []).length;
}

function extractAttribute(markup: string, attribute: string): string | null {
  const pattern = new RegExp(`${attribute}="([^"]+)"`, "i");
  return markup.match(pattern)?.[1] ?? null;
}
