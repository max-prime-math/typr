import {
  deleteProjectPath,
  ensureProjectFolder,
  normalizeProjectPath,
  renameProjectPath,
  writeProjectFile,
  type TyprProjectRepository
} from "../project/projectState";

export const TIKZ_DIRECTORY = "figures";
export const DEFAULT_TIKZ_SOURCE = String.raw`\begin{tikzpicture}
  \draw[thick, blue] (0,0) circle (1cm);
  \node at (0,0) {TikZ};
\end{tikzpicture}
`;

export interface TikzFigureFile {
  path: string;
  name: string;
  source: string;
  svg: string;
  hasCetz: boolean;
  hasPdf: boolean;
}

export function collectTikzFigureFiles(
  project: TyprProjectRepository | null
): TikzFigureFile[] {
  if (!project) {
    return [];
  }

  return Object.values(project.filesystem.entries)
    .flatMap((entry): TikzFigureFile[] => {
      if (
        entry.kind !== "file" ||
        !entry.path.toLowerCase().endsWith(".tikz")
      ) {
        return [];
      }

      const svgEntry = project.filesystem.entries[getTikzSvgPath(entry.path)];
      const cetzEntry = project.filesystem.entries[getTikzCetzPath(entry.path)];
      const pdfEntry = project.filesystem.entries[getTikzPdfPath(entry.path)];

      return [{
        path: entry.path,
        name: getTikzFileName(entry.path),
        source:
          typeof entry.content === "string"
            ? entry.content
            : new TextDecoder().decode(entry.content),
        svg:
          svgEntry?.kind === "file"
            ? typeof svgEntry.content === "string"
              ? svgEntry.content
              : new TextDecoder().decode(svgEntry.content)
            : "",
        hasCetz: cetzEntry?.kind === "file",
        hasPdf: pdfEntry?.kind === "file"
      }];
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base"
      })
    );
}

export function getTikzSvgPath(tikzPath: string): string {
  const normalizedPath = normalizeProjectPath(tikzPath);
  return normalizedPath.replace(/\.tikz$/i, ".svg");
}

export function getTikzPdfPath(tikzPath: string): string {
  const normalizedPath = normalizeProjectPath(tikzPath);
  return normalizedPath.replace(/\.tikz$/i, ".pdf");
}

export function getTikzCetzPath(tikzPath: string): string {
  const normalizedPath = normalizeProjectPath(tikzPath);
  return normalizedPath.replace(/\.tikz$/i, ".cetz.typ");
}

export function getTikzFileName(path: string): string {
  return normalizeProjectPath(path).split("/").at(-1) ?? "diagram.tikz";
}

export function normalizeTikzFileName(value: string): string {
  const leafName =
    value
      .replace(/\\/g, "/")
      .split("/")
      .at(-1)
      ?.trim() ?? "";
  const withoutExtension = leafName.replace(/\.(?:tikz|tex|pgf|svg|pdf)$/i, "").trim();
  const safeStem =
    withoutExtension
      .replace(/[^a-z0-9 ._-]+/gi, "-")
      .replace(/\s+/g, " ")
      .replace(/^\.+|\.+$/g, "")
      .trim() || "diagram";

  return `${safeStem}.tikz`;
}

export function createNextTikzPath(project: TyprProjectRepository): string {
  let index = 1;

  while (true) {
    const suffix = index === 1 ? "" : ` ${index}`;
    const path = `${TIKZ_DIRECTORY}/diagram${suffix}.tikz`;
    const svgPath = getTikzSvgPath(path);
    const pdfPath = getTikzPdfPath(path);
    const cetzPath = getTikzCetzPath(path);

    if (
      !project.filesystem.entries[path] &&
      !project.filesystem.entries[svgPath] &&
      !project.filesystem.entries[pdfPath] &&
      !project.filesystem.entries[cetzPath]
    ) {
      return path;
    }

    index += 1;
  }
}

export function writeTikzFigureFiles(
  project: TyprProjectRepository,
  tikzPath: string,
  source: string,
  svg?: string,
  pdf?: Uint8Array,
  cetz?: string
): TyprProjectRepository {
  const normalizedPath = normalizeProjectPath(tikzPath);
  const svgPath = getTikzSvgPath(normalizedPath);
  const pdfPath = getTikzPdfPath(normalizedPath);
  const cetzPath = getTikzCetzPath(normalizedPath);
  const previousSourceEntry = project.filesystem.entries[normalizedPath];
  const previousSvgEntry = project.filesystem.entries[svgPath];
  const previousSource =
    previousSourceEntry?.kind === "file"
      ? decodeProjectFileContent(previousSourceEntry.content)
      : null;
  const previousSvg =
    previousSvgEntry?.kind === "file"
      ? decodeProjectFileContent(previousSvgEntry.content)
      : null;
  const invalidatesDerivedArtifacts =
    previousSource !== source ||
    (svg !== undefined && svg.trim() !== "" && previousSvg !== svg);
  const existingSource = project.filesystem.entries[normalizedPath]?.source;
  const sourceId =
    existingSource?.kind === "document"
      ? existingSource.id
      : `tikz-source:${normalizedPath}`;
  const parentPath = normalizedPath.split("/").slice(0, -1).join("/");
  const withFolder = parentPath
    ? ensureProjectFolder(project, parentPath, {
        kind: "folder",
        id: parentPath === TIKZ_DIRECTORY ? "tikz-figures" : `tikz-folder:${parentPath}`
      })
    : project;
  const withSource = writeProjectFile(withFolder, normalizedPath, source, {
    kind: "document",
    id: sourceId
  });

  const withSvg =
    svg === undefined || !svg.trim()
      ? withSource
      : writeProjectFile(withSource, svgPath, svg, {
          kind: "document",
          id:
            previousSvgEntry?.source.kind === "document"
              ? previousSvgEntry.source.id
              : `tikz-svg:${sourceId}`
        });
  const withoutStalePdf =
    pdf === undefined && invalidatesDerivedArtifacts && withSvg.filesystem.entries[pdfPath]
      ? deleteProjectPath(withSvg, pdfPath)
      : withSvg;
  const withPdf =
    pdf === undefined
      ? withoutStalePdf
      : writeProjectFile(withoutStalePdf, pdfPath, pdf, {
          kind: "virtual",
          id: `tikz-pdf:${sourceId}`
        });
  const withoutStaleCetz =
    cetz === undefined &&
    invalidatesDerivedArtifacts &&
    withPdf.filesystem.entries[cetzPath]
      ? deleteProjectPath(withPdf, cetzPath)
      : withPdf;

  return cetz === undefined || !cetz.trim()
    ? withoutStaleCetz
    : writeProjectFile(withoutStaleCetz, cetzPath, cetz, {
        kind: "document",
        id: `tikz-cetz:${sourceId}`
      });
}

export function renameTikzFigureFiles(
  project: TyprProjectRepository,
  fromPath: string,
  nextName: string
): { path: string; project: TyprProjectRepository } {
  const normalizedFromPath = normalizeProjectPath(fromPath);
  const parentPath = normalizedFromPath.split("/").slice(0, -1).join("/");
  const nextPath = [parentPath, normalizeTikzFileName(nextName)].filter(Boolean).join("/");

  if (nextPath === normalizedFromPath) {
    return { path: normalizedFromPath, project };
  }

  const nextSvgPath = getTikzSvgPath(nextPath);
  const nextPdfPath = getTikzPdfPath(nextPath);
  const nextCetzPath = getTikzCetzPath(nextPath);
  if (
    project.filesystem.entries[nextPath] ||
    project.filesystem.entries[nextSvgPath] ||
    project.filesystem.entries[nextPdfPath] ||
    project.filesystem.entries[nextCetzPath]
  ) {
    throw new Error(`A figure named "${getTikzFileName(nextPath)}" already exists.`);
  }

  let nextProject = renameProjectPath(project, normalizedFromPath, nextPath);
  const currentSvgPath = getTikzSvgPath(normalizedFromPath);
  const currentPdfPath = getTikzPdfPath(normalizedFromPath);
  const currentCetzPath = getTikzCetzPath(normalizedFromPath);

  if (nextProject.filesystem.entries[currentSvgPath]) {
    nextProject = renameProjectPath(nextProject, currentSvgPath, nextSvgPath);
  }

  if (nextProject.filesystem.entries[currentPdfPath]) {
    nextProject = renameProjectPath(nextProject, currentPdfPath, nextPdfPath);
  }

  if (nextProject.filesystem.entries[currentCetzPath]) {
    nextProject = renameProjectPath(nextProject, currentCetzPath, nextCetzPath);
  }

  nextProject = {
    ...nextProject,
    selection: {
      activeFilePath:
        nextProject.selection.activeFilePath === normalizedFromPath
          ? nextPath
          : nextProject.selection.activeFilePath === currentSvgPath
            ? nextSvgPath
            : nextProject.selection.activeFilePath === currentPdfPath
              ? nextPdfPath
              : nextProject.selection.activeFilePath === currentCetzPath
                ? nextCetzPath
                : nextProject.selection.activeFilePath,
      openFilePaths: nextProject.selection.openFilePaths.map((path) =>
        path === normalizedFromPath
          ? nextPath
          : path === currentSvgPath
            ? nextSvgPath
            : path === currentPdfPath
              ? nextPdfPath
              : path === currentCetzPath
                ? nextCetzPath
                : path
      )
    },
    editor: {
      ...nextProject.editor,
      previewPath:
        nextProject.editor.previewPath === normalizedFromPath
          ? nextPath
          : nextProject.editor.previewPath === currentSvgPath
            ? nextSvgPath
            : nextProject.editor.previewPath === currentPdfPath
              ? nextPdfPath
              : nextProject.editor.previewPath === currentCetzPath
                ? nextCetzPath
                : nextProject.editor.previewPath,
      previewTabPaths: nextProject.editor.previewTabPaths.map((path) =>
        path === normalizedFromPath
          ? nextPath
          : path === currentSvgPath
            ? nextSvgPath
            : path === currentPdfPath
              ? nextPdfPath
              : path === currentCetzPath
                ? nextCetzPath
                : path
      )
    }
  };

  return { path: nextPath, project: nextProject };
}

function decodeProjectFileContent(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder().decode(content);
}
