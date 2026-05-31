import type { GraphProvider } from "../app/appState";

export const GRAPH_DIRECTORY = "figures";
export const DEFAULT_GRAPH_FILE_NAME = "graph 1.typ";
export const GRAPH_COMPILER_ROOT = "/";
const GRAPH_BASE_NAME = "graph";

export function getGraphFilePath(fileName: string = DEFAULT_GRAPH_FILE_NAME): string {
  return `${GRAPH_DIRECTORY}/${fileName}`;
}

export function getGraphCompilerPath(fileName: string = DEFAULT_GRAPH_FILE_NAME): string {
  return `${GRAPH_COMPILER_ROOT}${getGraphFilePath(fileName)}`;
}

export function normalizeGraphFileName(name: string, provider: GraphProvider = "simple-plot"): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return DEFAULT_GRAPH_FILE_NAME;
  }

  const expectedExtension = ".typ";
  let baseName = trimmed;

  while (/\.(png|svg|typ)$/i.test(baseName)) {
    baseName = baseName.replace(/\.(png|svg|typ)$/i, "");
  }

  const withExtension = `${baseName}${expectedExtension}`;

  if (/^graph$/i.test(baseName)) {
    return DEFAULT_GRAPH_FILE_NAME;
  }

  return withExtension;
}

export function normalizeGraphFileNameForContentType(
  name: string,
  contentType: "typ" = "typ"
): string {
  const trimmed = name.trim();
  const expectedExtension = `.${contentType}`;

  if (!trimmed) {
    return DEFAULT_GRAPH_FILE_NAME;
  }

  let baseName = trimmed;

  while (/\.(png|svg|typ)$/i.test(baseName)) {
    baseName = baseName.replace(/\.(png|svg|typ)$/i, "");
  }

  const withExtension = `${baseName}${expectedExtension}`;

  if (/^graph$/i.test(baseName)) {
    return DEFAULT_GRAPH_FILE_NAME;
  }

  return withExtension;
}

export function getNextGraphFileName(
  currentName: string = DEFAULT_GRAPH_FILE_NAME,
  provider: GraphProvider = "simple-plot"
): string {
  const normalized = normalizeGraphFileName(currentName, provider);
  const baseName = normalized.replace(/\.(png|svg|typ)$/i, "");
  const match = new RegExp(`^${GRAPH_BASE_NAME}(?:\\s+(\\d+))?$`, "i").exec(baseName);
  const nextIndex = match ? Number(match[1] ?? "1") + 1 : 1;
  return `${GRAPH_BASE_NAME} ${nextIndex}.typ`;
}
