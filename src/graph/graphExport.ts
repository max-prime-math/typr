import type { GraphAsset } from "../app/appState";
import { getGraphFilePath } from "./graphFiles";
import { createSimplePlotGraphAssetContent, parseSimplePlotGraphDocument } from "./simplePlotGraph";

export interface GraphInsertResult {
  kind: "typst";
  text: string;
  supported: boolean;
}

export function buildGraphInsertResult(graph: GraphAsset): GraphInsertResult {
  const text = buildGraphTypstReference(graph);

  return {
    kind: "typst",
    text,
    supported: text.trim().length > 0
  };
}

export function buildGraphSourceInsertResult(graph: GraphAsset): GraphInsertResult {
  const text = decodeGraphTypstSource(graph);

  return {
    kind: "typst",
    text,
    supported: text.trim().length > 0
  };
}

export function buildGraphDownloadFilename(graph: GraphAsset): string {
  return graph.name;
}

export function buildGraphDownloadBlob(graph: GraphAsset): Blob {
  return new Blob([decodeGraphTypstSource(graph)], {
    type: "text/plain;charset=utf-8"
  });
}

export function buildGraphTypstFigure(graph: GraphAsset): string | null {
  const text = decodeGraphTypstSource(graph);
  return text.trim().length > 0 ? text : null;
}

function buildGraphTypstReference(graph: GraphAsset): string {
  return `#include "${getGraphFilePath(graph.name)}"`;
}

function decodeGraphTypstSource(graph: GraphAsset): string {
  if (graph.content.length > 0) {
    return new TextDecoder().decode(graph.content);
  }

  // Fallback for migrated legacy graphs before they are resaved.
  return new TextDecoder().decode(
    createSimplePlotGraphAssetContent(parseSimplePlotGraphDocument(graph.source), graph.style)
  );
}
