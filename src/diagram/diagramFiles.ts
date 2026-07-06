export const DIAGRAM_DIRECTORY = "figures";
export const DEFAULT_DIAGRAM_FILE_NAME = "diagram 1.svg";
export const DIAGRAM_COMPILER_ROOT = "/";
const DIAGRAM_BASE_NAME = "diagram";

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
