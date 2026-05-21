import type { GraphProvider } from "../app/appState";

export const GRAPH_DIRECTORY = "figures";
export const DEFAULT_GRAPH_FILE_NAME = "graph 1.png";
export const DEFAULT_GRAPH_SVG_FILE_NAME = "graph 1.svg";
export const GRAPH_COMPILER_ROOT = "/";
const GRAPH_BASE_NAME = "graph";

export function getGraphFilePath(fileName: string = DEFAULT_GRAPH_FILE_NAME): string {
  return `${GRAPH_DIRECTORY}/${fileName}`;
}

export function getGraphCompilerPath(fileName: string = DEFAULT_GRAPH_FILE_NAME): string {
  return `${GRAPH_COMPILER_ROOT}${getGraphFilePath(fileName)}`;
}

export function normalizeGraphFileName(name: string, provider: GraphProvider = "desmos"): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return provider === "desmos" ? DEFAULT_GRAPH_FILE_NAME : DEFAULT_GRAPH_SVG_FILE_NAME;
  }

  const expectedExtension = provider === "desmos" ? ".png" : ".svg";
  let baseName = trimmed;

  while (/\.(png|svg)$/i.test(baseName)) {
    baseName = baseName.replace(/\.(png|svg)$/i, "");
  }

  const withExtension = `${baseName}${expectedExtension}`;

  if (/^graph$/i.test(baseName)) {
    return provider === "desmos" ? DEFAULT_GRAPH_FILE_NAME : DEFAULT_GRAPH_SVG_FILE_NAME;
  }

  return withExtension;
}

export function normalizeGraphFileNameForContentType(
  name: string,
  contentType: "png" | "svg" = "png"
): string {
  const trimmed = name.trim();
  const expectedExtension = `.${contentType}`;

  if (!trimmed) {
    return contentType === "png" ? DEFAULT_GRAPH_FILE_NAME : DEFAULT_GRAPH_SVG_FILE_NAME;
  }

  let baseName = trimmed;

  while (/\.(png|svg)$/i.test(baseName)) {
    baseName = baseName.replace(/\.(png|svg)$/i, "");
  }

  const withExtension = `${baseName}${expectedExtension}`;

  if (/^graph$/i.test(baseName)) {
    return contentType === "png" ? DEFAULT_GRAPH_FILE_NAME : DEFAULT_GRAPH_SVG_FILE_NAME;
  }

  return withExtension;
}

export function getNextGraphFileName(
  currentName: string = DEFAULT_GRAPH_FILE_NAME,
  provider: GraphProvider = "desmos"
): string {
  const normalized = normalizeGraphFileName(currentName, provider);
  const baseName = normalized.replace(/\.(png|svg)$/i, "");
  const match = new RegExp(`^${GRAPH_BASE_NAME}(?:\\s+(\\d+))?$`, "i").exec(baseName);
  const nextIndex = match ? Number(match[1] ?? "1") + 1 : 1;
  return `${GRAPH_BASE_NAME} ${nextIndex}.${provider === "desmos" ? "png" : "svg"}`;
}
