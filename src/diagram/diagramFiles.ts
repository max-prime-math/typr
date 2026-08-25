export const DIAGRAM_DIRECTORY = "figures";
export const DEFAULT_DIAGRAM_FILE_NAME = "diagram 1.svg";
export const DIAGRAM_COMPILER_ROOT = "/";
const DIAGRAM_BASE_NAME = "diagram";

export interface DiagramFileLocation {
  name: string;
  workspacePath?: string;
}

export function getDiagramFilePath(fileName: string = DEFAULT_DIAGRAM_FILE_NAME): string {
  return `${DIAGRAM_DIRECTORY}/${fileName}`;
}

export function getDiagramPdfFileName(fileName: string = DEFAULT_DIAGRAM_FILE_NAME): string {
  return `${normalizeDiagramFileName(fileName).replace(/\.svg$/i, "")}.pdf`;
}

export function getDiagramPdfFilePath(fileName: string = DEFAULT_DIAGRAM_FILE_NAME): string {
  return `${DIAGRAM_DIRECTORY}/${getDiagramPdfFileName(fileName)}`;
}

export function getDiagramCompilerPath(fileName: string = DEFAULT_DIAGRAM_FILE_NAME): string {
  return `${DIAGRAM_COMPILER_ROOT}${getDiagramFilePath(fileName)}`;
}

export function getDiagramAssetFilePath(diagram: DiagramFileLocation): string {
  return normalizeDiagramWorkspacePath(diagram.workspacePath) ?? getDiagramFilePath(diagram.name);
}

export function getDiagramAssetPdfFilePath(diagram: DiagramFileLocation): string {
  return getDiagramAssetFilePath(diagram).replace(/\.svg$/i, ".pdf");
}

export function getDiagramAssetCompilerPath(diagram: DiagramFileLocation): string {
  return `${DIAGRAM_COMPILER_ROOT}${getDiagramAssetFilePath(diagram)}`;
}

export function getDiagramCreationDirectory(
  documentPath: string,
  relativeToDocument: boolean
): string {
  if (!relativeToDocument) {
    return DIAGRAM_DIRECTORY;
  }

  const normalizedDocumentPath = normalizeDiagramWorkspacePath(documentPath) ?? "";
  const documentDirectory = normalizedDocumentPath.split("/").slice(0, -1).join("/");
  return [documentDirectory, DIAGRAM_DIRECTORY].filter(Boolean).join("/");
}

export function getDiagramWorkspacePath(
  fileName: string,
  documentPath: string,
  relativeToDocument: boolean
): string {
  return `${getDiagramCreationDirectory(documentPath, relativeToDocument)}/${normalizeDiagramFileName(fileName)}`;
}

export function normalizeDiagramFileName(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return DEFAULT_DIAGRAM_FILE_NAME;
  }

  const withExtension = trimmed.toLowerCase().endsWith(".svg") ? trimmed : `${trimmed}.svg`;
  const baseName = withExtension.replace(/\.svg$/i, "");

  if (/^diagram$/i.test(baseName)) {
    return DEFAULT_DIAGRAM_FILE_NAME;
  }

  return withExtension;
}

export function getNextDiagramFileName(currentName: string = DEFAULT_DIAGRAM_FILE_NAME): string {
  const normalized = normalizeDiagramFileName(currentName);
  const baseName = normalized.replace(/\.svg$/i, "");
  const match = new RegExp(`^${DIAGRAM_BASE_NAME}(?:\\s+(\\d+))?$`, "i").exec(baseName);
  const nextIndex = match ? Number(match[1] ?? "1") + 1 : 1;
  return `${DIAGRAM_BASE_NAME} ${nextIndex}.svg`;
}

function normalizeDiagramWorkspacePath(path: string | undefined): string | null {
  if (!path) {
    return null;
  }

  const normalized = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  return normalized || null;
}
