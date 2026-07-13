import { AUTO_THEME_ID, normalizeThemeId } from "../theme/themes";
import {
  DEFAULT_DIAGRAM_FILE_NAME,
  getDiagramFilePath,
  normalizeDiagramFileName
} from "../diagram/diagramFiles";
import { createPrefixedId } from "../utils/randomId";
import {
  getRelativePathBasename as getWorkspaceBaseName,
  getRelativePathParent as getWorkspaceParentPath,
  joinRelativePaths as joinWorkspacePath,
  moveRelativePath,
  normalizeRelativePath,
  stripRelativePathPrefix
} from "../utils/relativePath";
import {
  DEFAULT_EDITOR_TOOLING_PREFERENCES,
  normalizeEditorToolingPreferences,
  type EditorToolingPreferences
} from "../editor/editorTools";
import {
  DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES,
  normalizeExternalDiagnosticProviderPreferences,
  type ExternalDiagnosticProviderPreferences
} from "../diagnostics/externalDiagnostics";
import { DEFAULT_KEYBINDINGS, normalizeKeybindings, type KeybindingMap } from "./keybindings";

export type ThemePreference = string;
export type MobileKeyboardLanguage = "typst" | "latex" | "markdown";

export interface MobileKeyboardPreferences {
  enabled: boolean;
  keys: Record<MobileKeyboardLanguage, string[]>;
}

export const DEFAULT_MOBILE_KEYBOARD_PREFERENCES: MobileKeyboardPreferences = {
  enabled: true,
  keys: {
    typst: ["#", "$", "[]", "()", "{}", "=", "*", "_", "@", "`", "fn"],
    latex: ["\\", "$", "{}", "[]", "^", "_", "&", "%", "#", "frac", "env"],
    markdown: ["#", "-", "*", "_", "`", "[]", "()", ">", "|", "```", "link"]
  }
};

export interface TypstDocumentFile {
  id: string;
  name: string;
  content: string | Uint8Array;
  updatedAt: string;
}

export interface FileFolder {
  id: string;
  name: string;
  updatedAt: string;
}

export interface TrashedDocumentEntry {
  id: string;
  kind: "document";
  deletedAt: string;
  originalPath: string;
  document: TypstDocumentFile;
}

export interface TrashedFolderEntry {
  id: string;
  kind: "folder";
  deletedAt: string;
  originalPath: string;
  folder: FileFolder;
}

export interface DiagramPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface DiagramCanvasFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DiagramStrokeStyle = "solid" | "dotted" | "fine-dotted" | "dashed";
export type DiagramEndpoint = "none" | "arrow" | "dot" | "open-dot";

export interface DiagramStroke {
  id: string;
  color: string;
  width: number;
  strokeStyle: DiagramStrokeStyle;
  startMarker: DiagramEndpoint;
  endMarker: DiagramEndpoint;
  points: DiagramPoint[];
  updatedAt: string;
}

export interface DiagramRect {
  kind: "rect";
  id: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: DiagramStrokeStyle;
  fillColor: string;
  rotation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  updatedAt: string;
}

export interface DiagramEllipse {
  kind: "ellipse";
  id: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: DiagramStrokeStyle;
  fillColor: string;
  rotation: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  originX: number;
  originY: number;
  updatedAt: string;
}

export interface DiagramLine {
  kind: "line";
  id: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: DiagramStrokeStyle;
  startMarker: DiagramEndpoint;
  endMarker: DiagramEndpoint;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  updatedAt: string;
}

export interface DiagramBezier {
  kind: "bezier";
  id: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: DiagramStrokeStyle;
  startMarker: DiagramEndpoint;
  endMarker: DiagramEndpoint;
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x2: number;
  y2: number;
  updatedAt: string;
}

export interface DiagramPolygon {
  kind: "polygon";
  id: string;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: DiagramStrokeStyle;
  fillColor: string;
  points: DiagramPoint[];
  updatedAt: string;
}

export type DiagramShape =
  | DiagramRect
  | DiagramEllipse
  | DiagramLine
  | DiagramBezier
  | DiagramPolygon;

export interface DiagramAsset {
  id: string;
  name: string;
  updatedAt: string;
  frame: DiagramCanvasFrame | null;
  content?: string;
  strokes: DiagramStroke[];
  shapes: DiagramShape[];
}

export interface TrashedDiagramEntry {
  id: string;
  kind: "diagram";
  deletedAt: string;
  originalPath: string;
  diagram: DiagramAsset;
}

export type WorkspaceTrashEntry =
  | TrashedDocumentEntry
  | TrashedFolderEntry
  | TrashedDiagramEntry;

export interface TypstProject {
  id: string;
  name: string;
  documents: TypstDocumentFile[];
  folders: FileFolder[];
  trash: WorkspaceTrashEntry[];
  activeDocumentId: string;
  createdAt: string;
  updatedAt: string;
  diagram: DiagramAsset;
  figures: DiagramAsset[];
}

export type PastedImageFormat = "png" | "jpeg";

export interface PastedImagePreferences {
  enabled: boolean;
  format: PastedImageFormat;
  fileNamePrefix: string;
  figuresDirectory: string;
  figuresDirectoryRelativeToFile: boolean;
  typstPrefix: string;
  typstSuffix: string;
  latexPrefix: string;
  latexSuffix: string;
  markdownPrefix: string;
  markdownSuffix: string;
}

export interface AppPreferences {
  theme: ThemePreference;
  vimMode: boolean;
  vimClipboardSharing: boolean;
  relativeLineNumbers: boolean;
  cursorSmooth: boolean;
  cursorSmear: number;
  liveCompilation: boolean;
  latexMathPreview: boolean;
  typstMathPreview: boolean;
  autoSyncGitProjects: boolean;
  editorTooling: EditorToolingPreferences;
  externalDiagnostics: ExternalDiagnosticProviderPreferences;
  keybindings: KeybindingMap;
  mobileKeyboard: MobileKeyboardPreferences;
  editorFontSize: number;
  sidebarFontSize: number;
  colorfulFileTreeIcons: boolean;
  showGitignoreInFileTree: boolean;
  pastedImages: PastedImagePreferences;
}

export interface AppSnapshot {
  version: 9;
  project: TypstProject;
  preferences: AppPreferences;
}

export const DEFAULT_DOCUMENT_NAME = "main.typ";

export const DEFAULT_DOCUMENT_CONTENT = `#set document(title: "Complex Bibliography Test for Typst", author: "Typr Test Fixture")
#set page(margin: 1in)
#set text(size: 11pt)

= Complex Bibliography Test for Typst

This document exercises the same BibTeX database as the LaTeX fixture. It mixes
books, journal articles, conference-style entries, manuals, software, web
references, theses, accents, notes, DOIs, URLs, editors, pages, and repeated
citations.

Classic systems papers should appear together in a citation cluster:
@turing1936computable, @church1936unsolvable, and @mccarthy1960recursive.
The TeX lineage is represented by @knuth1984texbook and @lamport1986document.

== Repeated and Mixed Citations

Repeated citations should not duplicate bibliography entries:
@knuth1984texbook and @lamport1986document. Online and software references
should preserve useful access fields when the style supports them:
@typst2026docs, @latexproject2026, and @svgedit2026.

The bibliography also includes a thesis @shannon1940symbolic and an accent-heavy
fictional entry @garcia2024accents to check character handling.

== Bibliography

#bibliography("complex-bibliography.bib", title: "References")
`;

export const DEFAULT_LATEX_DOCUMENT_NAME = "latex-starter.tex";

export const DEFAULT_LATEX_DOCUMENT_CONTENT = `\\documentclass[11pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage{url}

\\title{Complex Bibliography Test for LaTeX}
\\author{Typr Test Fixture}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Narrative citations}
This document exercises a shared BibTeX file with books, articles, proceedings,
manuals, software, web references, thesis entries, accented names, notes, DOIs,
URLs, editors, pages, and repeated citations.

Classic systems papers should appear together when cited in one command:
\\cite{turing1936computable,church1936unsolvable,mccarthy1960recursive}.
The TeX lineage is represented by Knuth's book \\cite{knuth1984texbook} and
Lamport's document preparation article \\cite{lamport1986document}.

\\section{Repeated and mixed citations}
Repeated citations should not duplicate bibliography entries:
\\cite{knuth1984texbook,lamport1986document}. Online and software references
should preserve useful access fields when the style supports them:
\\cite{typst2026docs,latexproject2026,svgedit2026}.

The bibliography also includes a thesis \\cite{shannon1940symbolic} and an
accent-heavy fictional entry \\cite{garcia2024accents} to check character
handling.

\\section{Uncited entry visibility}
The bibliography command below includes only cited works. Uncomment
\\verb|\\nocite{*}| to force every entry in the BibTeX file to appear.

% \\nocite{*}
\\bibliographystyle{plain}
\\bibliography{complex-bibliography}

\\end{document}
`;

export const DEFAULT_BIBLIOGRAPHY_DOCUMENT_NAME = "complex-bibliography.bib";

export const DEFAULT_BIBLIOGRAPHY_DOCUMENT_CONTENT = `@book{knuth1984texbook,
  author    = {Knuth, Donald E.},
  title     = {The TeXbook},
  publisher = {Addison-Wesley},
  address   = {Reading, Massachusetts},
  year      = {1984},
  isbn      = {978-0201134483}
}

@article{lamport1986document,
  author  = {Lamport, Leslie},
  title   = {Document Preparation Systems},
  journal = {Software: Practice and Experience},
  volume  = {16},
  number  = {8},
  pages   = {735--742},
  year    = {1986},
  doi     = {10.1002/spe.4380160804}
}

@article{turing1936computable,
  author  = {Turing, Alan M.},
  title   = {On Computable Numbers, with an Application to the Entscheidungsproblem},
  journal = {Proceedings of the London Mathematical Society},
  series  = {2},
  volume  = {42},
  number  = {1},
  pages   = {230--265},
  year    = {1936},
  doi     = {10.1112/plms/s2-42.1.230}
}

@inproceedings{mccarthy1960recursive,
  author    = {McCarthy, John},
  title     = {Recursive Functions of Symbolic Expressions and Their Computation by Machine, Part I},
  booktitle = {Communications of the ACM},
  volume    = {3},
  number    = {4},
  pages     = {184--195},
  year      = {1960},
  doi       = {10.1145/367177.367199}
}

@incollection{church1936unsolvable,
  author    = {Church, Alonzo},
  title     = {An Unsolvable Problem of Elementary Number Theory},
  booktitle = {The Undecidable},
  editor    = {Davis, Martin},
  publisher = {Raven Press},
  address   = {Hewlett, New York},
  pages     = {88--107},
  year      = {1965},
  note      = {Originally published in 1936}
}

@mastersthesis{shannon1940symbolic,
  author = {Shannon, Claude E.},
  title  = {A Symbolic Analysis of Relay and Switching Circuits},
  school = {Massachusetts Institute of Technology},
  year   = {1940}
}

@misc{typst2026docs,
  author       = {{Typst Project}},
  title        = {Typst Documentation},
  year         = {2026},
  howpublished = {https://typst.app/docs/},
  note         = {Accessed 2026-07-06}
}

@manual{latexproject2026,
  author       = {{LaTeX Project Team}},
  title        = {LaTeX Documentation},
  organization = {The LaTeX Project},
  year         = {2026},
  url          = {https://www.latex-project.org/help/documentation/}
}

@misc{svgedit2026,
  author  = {{SVG-Edit Contributors}},
  title   = {SVG-Edit},
  year    = {2026},
  howpublished = {https://github.com/SVG-Edit/svgedit},
  note    = {Version 7.x}
}

@article{garcia2024accents,
  author  = {Garc{\\i}a, Mar{\\i}a-Jos{\\'e} and M{\\o}ller, S{\\o}ren and Dvo{\\v{r}}{\\'a}k, Eli{\\v{s}}ka},
  title   = {Testing Names with Accents in Bibliographies},
  journal = {Journal of Typesetting Edge Cases},
  volume  = {12},
  number  = {3},
  pages   = {101--119},
  year    = {2024},
  note    = {Fictional entry for rendering tests}
}
`;

export const DEFAULT_MARKDOWN_DOCUMENT_NAME = "README.md";

export const DEFAULT_MARKDOWN_DOCUMENT_CONTENT = `# Typr Project

This default project includes matching bibliography stress tests for Typst and LaTeX.

## Files

- main.typ uses Typst citations and #bibliography with complex-bibliography.bib.
- latex-starter.tex uses BibTeX citations with the same complex-bibliography.bib file.
- complex-bibliography.bib contains books, articles, proceedings, chapters, thesis entries, manuals, web/software references, DOIs, URLs, repeated citations, and escaped accented names.

Use the files pane to switch between the Typst, LaTeX, README, and BibTeX files.
`;

const DEFAULT_CURSOR_SMEAR = 25;
export const DEFAULT_EDITOR_FONT_SIZE = 16;
export const DEFAULT_SIDEBAR_FONT_SIZE = 16;
const MIN_EDITOR_FONT_SIZE = 12;
const MAX_EDITOR_FONT_SIZE = 28;
const MIN_SIDEBAR_FONT_SIZE = 11;
const MAX_SIDEBAR_FONT_SIZE = 24;

function createId(prefix: string): string {
  return createPrefixedId(prefix);
}

export function createDefaultDiagram(): DiagramAsset {
  const now = new Date().toISOString();

  return {
    id: createId("diagram"),
    name: DEFAULT_DIAGRAM_FILE_NAME,
    updatedAt: now,
    frame: null,
    content: undefined,
    strokes: [],
    shapes: []
  };
}

export function createDefaultSnapshot(): AppSnapshot {
  const now = new Date().toISOString();
  const typstDocument: TypstDocumentFile = {
    id: createId("doc"),
    name: DEFAULT_DOCUMENT_NAME,
    content: DEFAULT_DOCUMENT_CONTENT,
    updatedAt: now
  };
  const latexDocument: TypstDocumentFile = {
    id: createId("doc"),
    name: DEFAULT_LATEX_DOCUMENT_NAME,
    content: DEFAULT_LATEX_DOCUMENT_CONTENT,
    updatedAt: now
  };
  const bibliographyDocument: TypstDocumentFile = {
    id: createId("doc"),
    name: DEFAULT_BIBLIOGRAPHY_DOCUMENT_NAME,
    content: DEFAULT_BIBLIOGRAPHY_DOCUMENT_CONTENT,
    updatedAt: now
  };
  const markdownDocument: TypstDocumentFile = {
    id: createId("doc"),
    name: DEFAULT_MARKDOWN_DOCUMENT_NAME,
    content: DEFAULT_MARKDOWN_DOCUMENT_CONTENT,
    updatedAt: now
  };

  return {
    version: 9,
    project: {
      id: createId("project"),
      name: "Typr Project",
      documents: [typstDocument, latexDocument, bibliographyDocument, markdownDocument],
      folders: [],
      trash: [],
      activeDocumentId: markdownDocument.id,
      createdAt: now,
      updatedAt: now,
      diagram: createDefaultDiagram(),
      figures: []
    },
    preferences: {
      theme: AUTO_THEME_ID,
      vimMode: false,
      vimClipboardSharing: false,
      relativeLineNumbers: false,
      cursorSmooth: false,
      cursorSmear: DEFAULT_CURSOR_SMEAR,
      liveCompilation: false,
      latexMathPreview: true,
      typstMathPreview: false,
      autoSyncGitProjects: true,
      editorTooling: DEFAULT_EDITOR_TOOLING_PREFERENCES,
      externalDiagnostics: DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES,
      keybindings: DEFAULT_KEYBINDINGS,
      mobileKeyboard: DEFAULT_MOBILE_KEYBOARD_PREFERENCES,
      editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
      sidebarFontSize: DEFAULT_SIDEBAR_FONT_SIZE,
      colorfulFileTreeIcons: false,
      showGitignoreInFileTree: false,
      pastedImages: DEFAULT_PASTED_IMAGE_PREFERENCES
    }
  };
}

interface LegacyGraphAssetSnapshot {
  id?: string;
  name?: string;
  updatedAt?: string;
  source?: string;
  content?: string | Uint8Array;
}

interface LegacyGraphTrashSnapshot {
  id?: string;
  kind: "graph";
  deletedAt?: string;
  originalPath?: string;
  graph?: LegacyGraphAssetSnapshot;
}

type LegacyGraphProjectSnapshot = Omit<TypstProject, "trash"> & {
  trash?: Array<WorkspaceTrashEntry | LegacyGraphTrashSnapshot>;
  graph?: LegacyGraphAssetSnapshot;
  graphs?: LegacyGraphAssetSnapshot[];
};

export function normalizeSnapshot(snapshot: AppSnapshot): AppSnapshot {
  const storedCursorSmear = snapshot.preferences.cursorSmear;
  const legacyProject = snapshot.project as unknown as LegacyGraphProjectSnapshot;
  const diagram = legacyProject.diagram ?? createDefaultDiagram();
  const figures = Array.isArray(legacyProject.figures) ? legacyProject.figures : [];
  const folders = Array.isArray(legacyProject.folders) ? legacyProject.folders : [];
  const trash = Array.isArray(legacyProject.trash) ? legacyProject.trash : [];
  const legacyGraphs = Array.isArray(legacyProject.graphs) ? legacyProject.graphs : [];
  const { graph: _legacyGraph, graphs: _legacyGraphs, ...projectWithoutGraphState } = legacyProject;
  const now = new Date().toISOString();
  const normalizedDiagramName = normalizeDiagramFileName(
    diagram.name ?? DEFAULT_DIAGRAM_FILE_NAME
  );
  const currentDiagram = {
    ...diagram,
    id: diagram.id ?? createDefaultDiagram().id,
    name: normalizedDiagramName,
    updatedAt: diagram.updatedAt ?? now,
    frame: normalizeDiagramCanvasFrame(diagram.frame),
    content: normalizeDiagramSvgContent((diagram as Partial<DiagramAsset>).content),
    strokes: Array.isArray(diagram.strokes)
      ? diagram.strokes.map(normalizeDiagramStroke)
      : [],
    shapes: Array.isArray((diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes)
      ? (diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes.map(normalizeDiagramShape)
      : []
  };

  return {
    ...snapshot,
    version: 9,
    preferences: {
      theme: normalizeThemeId(snapshot.preferences.theme ?? AUTO_THEME_ID),
      vimMode: snapshot.preferences.vimMode ?? false,
      vimClipboardSharing:
        (snapshot.preferences as Partial<AppPreferences>).vimClipboardSharing ??
        ((snapshot.preferences as Partial<AppPreferences>).pastedImages as
          | (Partial<PastedImagePreferences> & { clipboardSharing?: boolean })
          | undefined)?.clipboardSharing ??
        false,
      relativeLineNumbers: snapshot.preferences.relativeLineNumbers ?? false,
      cursorSmooth: snapshot.preferences.cursorSmooth ?? false,
      cursorSmear:
        typeof storedCursorSmear === "number"
          ? clampCursorSmear(storedCursorSmear)
          : storedCursorSmear === false
            ? 0
            : DEFAULT_CURSOR_SMEAR,
      liveCompilation: snapshot.preferences.liveCompilation ?? false,
      latexMathPreview:
        (snapshot.preferences as Partial<AppPreferences>).latexMathPreview ?? true,
      typstMathPreview:
        (snapshot.preferences as Partial<AppPreferences>).typstMathPreview ?? false,
      autoSyncGitProjects:
        (snapshot.preferences as Partial<AppPreferences>).autoSyncGitProjects ?? true,
      editorTooling: normalizeEditorToolingPreferences(
        (snapshot.preferences as Partial<AppPreferences>).editorTooling
      ),
      externalDiagnostics: normalizeExternalDiagnosticProviderPreferences(
        (snapshot.preferences as Partial<AppPreferences>).externalDiagnostics
      ),
      keybindings: normalizeKeybindings(
        (snapshot.preferences as Partial<AppPreferences>).keybindings
      ),
      mobileKeyboard: normalizeMobileKeyboardPreferences(
        (snapshot.preferences as Partial<AppPreferences>).mobileKeyboard
      ),
      editorFontSize: clampEditorFontSize(
        (snapshot.preferences as Partial<AppPreferences>).editorFontSize
      ),
      sidebarFontSize: clampSidebarFontSize(
        (snapshot.preferences as Partial<AppPreferences>).sidebarFontSize
      ),
      colorfulFileTreeIcons:
        (snapshot.preferences as Partial<AppPreferences>).colorfulFileTreeIcons ?? false,
      showGitignoreInFileTree:
        (snapshot.preferences as Partial<AppPreferences>).showGitignoreInFileTree ?? false,
      pastedImages: normalizePastedImagePreferences(
        (snapshot.preferences as Partial<AppPreferences>).pastedImages
      )
    },
    project: {
      ...projectWithoutGraphState,
      documents: migrateLegacyGraphDocuments(legacyProject.documents, legacyGraphs),
      updatedAt: legacyProject.updatedAt,
      diagram: currentDiagram,
      folders: folders.map(normalizeFolderAsset),
      trash: trash.map(normalizeTrashEntry),
      figures: figures.map(normalizeDiagramAsset)
    }
  };
}

function migrateLegacyGraphDocuments(
  documents: TypstDocumentFile[],
  legacyGraphs: LegacyGraphAssetSnapshot[]
): TypstDocumentFile[] {
  const nextDocuments = [...documents];
  const existingPaths = new Set(documents.map((document) => normalizeWorkspaceFolderPath(document.name)));

  for (const graph of legacyGraphs) {
    const name = normalizeLegacyGraphDocumentPath(graph.name);

    if (existingPaths.has(name)) {
      continue;
    }

    nextDocuments.push({
      id: graph.id ?? createId("doc"),
      name,
      content:
        typeof graph.content === "string" || graph.content instanceof Uint8Array
          ? graph.content
          : graph.source ?? "",
      updatedAt: graph.updatedAt ?? new Date().toISOString()
    });
    existingPaths.add(name);
  }

  return nextDocuments;
}

function normalizeLegacyGraphDocumentPath(name: string | undefined): string {
  const normalizedName = normalizeWorkspaceFolderPath(name ?? "graph.typ") ?? "graph.typ";
  const withExtension = /\.typ$/i.test(normalizedName)
    ? normalizedName
    : `${normalizedName.replace(/\.[^/.]+$/, "")}.typ`;

  return withExtension === "figures" || withExtension.startsWith("figures/")
    ? withExtension
    : `figures/${withExtension}`;
}

export const DEFAULT_PASTED_IMAGE_PREFERENCES: PastedImagePreferences = {
  enabled: true,
  format: "png",
  fileNamePrefix: "pasted-image",
  figuresDirectory: "figures",
  figuresDirectoryRelativeToFile: true,
  typstPrefix: '#figure(image("',
  typstSuffix: '", width: 80%))',
  latexPrefix: "\\includegraphics[width=0.8\\linewidth]{",
  latexSuffix: "}",
  markdownPrefix: '<img src="',
  markdownSuffix: '" alt="" width="80%">'
};

function normalizePastedImagePreferences(
  preferences: Partial<PastedImagePreferences> | undefined
): PastedImagePreferences {
  const fileNamePrefix = sanitizePastedImagePrefix(preferences?.fileNamePrefix);
  const figuresDirectory = sanitizePastedImageDirectory(preferences?.figuresDirectory);

  return {
    enabled: preferences?.enabled ?? true,
    format: preferences?.format === "jpeg" ? "jpeg" : "png",
    fileNamePrefix,
    figuresDirectory,
    figuresDirectoryRelativeToFile: preferences?.figuresDirectoryRelativeToFile ?? true,
    typstPrefix: normalizePastedImageWrapperSetting(preferences?.typstPrefix, DEFAULT_PASTED_IMAGE_PREFERENCES.typstPrefix),
    typstSuffix: normalizePastedImageWrapperSetting(preferences?.typstSuffix, DEFAULT_PASTED_IMAGE_PREFERENCES.typstSuffix),
    latexPrefix: normalizePastedImageWrapperSetting(preferences?.latexPrefix, DEFAULT_PASTED_IMAGE_PREFERENCES.latexPrefix),
    latexSuffix: normalizePastedImageWrapperSetting(preferences?.latexSuffix, DEFAULT_PASTED_IMAGE_PREFERENCES.latexSuffix),
    markdownPrefix: normalizePastedImageWrapperSetting(preferences?.markdownPrefix, DEFAULT_PASTED_IMAGE_PREFERENCES.markdownPrefix),
    markdownSuffix: normalizePastedImageWrapperSetting(preferences?.markdownSuffix, DEFAULT_PASTED_IMAGE_PREFERENCES.markdownSuffix)
  };
}

function sanitizePastedImagePrefix(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_PASTED_IMAGE_PREFERENCES.fileNamePrefix)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_PASTED_IMAGE_PREFERENCES.fileNamePrefix;
}

function sanitizePastedImageDirectory(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_PASTED_IMAGE_PREFERENCES.figuresDirectory)
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");

  return normalized || DEFAULT_PASTED_IMAGE_PREFERENCES.figuresDirectory;
}

function normalizePastedImageWrapperSetting(value: string | undefined, fallback: string): string {
  return value ?? fallback;
}

function normalizeDiagramAsset(diagram: DiagramAsset): DiagramAsset {
  const normalizedName = normalizeDiagramFileName(diagram.name ?? DEFAULT_DIAGRAM_FILE_NAME);

  return {
    ...diagram,
    id: diagram.id ?? createDefaultDiagram().id,
    name: normalizedName,
    updatedAt: diagram.updatedAt ?? new Date().toISOString(),
    frame: normalizeDiagramCanvasFrame(diagram.frame),
    content: normalizeDiagramSvgContent((diagram as Partial<DiagramAsset>).content),
    strokes: Array.isArray(diagram.strokes)
      ? diagram.strokes.map(normalizeDiagramStroke)
      : [],
    shapes: Array.isArray((diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes)
      ? (diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes.map(normalizeDiagramShape)
      : []
  };
}

function normalizeDiagramSvgContent(content: string | undefined): string | undefined {
  if (typeof content !== "string") {
    return undefined;
  }

  const trimmed = content.trim();
  return /<svg[\s>]/i.test(trimmed) ? content : undefined;
}

function normalizeFolderAsset(folder: FileFolder): FileFolder {
  return {
    ...folder,
    id: folder.id ?? createId("folder"),
    name: typeof folder.name === "string" ? folder.name.trim() || "folder" : "folder",
    updatedAt: folder.updatedAt ?? new Date().toISOString()
  };
}

function normalizeTrashEntry(
  entry: WorkspaceTrashEntry | LegacyGraphTrashSnapshot
): WorkspaceTrashEntry {
  const deletedAt = entry.deletedAt ?? new Date().toISOString();

  if (entry.kind === "graph") {
    const graph = entry.graph ?? {};
    const originalPath =
      normalizeWorkspaceFolderPath(entry.originalPath ?? normalizeLegacyGraphDocumentPath(graph.name)) ??
      normalizeLegacyGraphDocumentPath(graph.name);

    return {
      id: entry.id ?? createId("trash"),
      kind: "document",
      deletedAt,
      originalPath,
      document: {
        id: graph.id ?? createId("doc"),
        name: originalPath,
        content:
          typeof graph.content === "string" || graph.content instanceof Uint8Array
            ? graph.content
            : graph.source ?? "",
        updatedAt: graph.updatedAt ?? deletedAt
      }
    };
  }

  if (entry.kind === "document") {
    return {
      ...entry,
      id: entry.id ?? createId("trash"),
      deletedAt,
      originalPath:
        normalizeWorkspaceFolderPath(entry.originalPath ?? entry.document?.name ?? DEFAULT_DOCUMENT_NAME) ??
        DEFAULT_DOCUMENT_NAME,
      document: {
        id: entry.document?.id ?? createId("doc"),
        name: entry.document?.name?.trim() || DEFAULT_DOCUMENT_NAME,
        content: entry.document?.content ?? "",
        updatedAt: entry.document?.updatedAt ?? deletedAt
      }
    };
  }

  if (entry.kind === "folder") {
    return {
      ...entry,
      id: entry.id ?? createId("trash"),
      deletedAt,
      originalPath: normalizeWorkspaceFolderPath(entry.originalPath ?? entry.folder?.name ?? "folder") ?? "folder",
      folder: normalizeFolderAsset(entry.folder)
    };
  }

  if (entry.kind === "diagram") {
    return {
      ...entry,
      id: entry.id ?? createId("trash"),
      deletedAt,
      originalPath:
        normalizeWorkspaceFolderPath(
        entry.originalPath ?? getDiagramFilePath(entry.diagram?.name ?? DEFAULT_DIAGRAM_FILE_NAME)
        ) ?? getDiagramFilePath(DEFAULT_DIAGRAM_FILE_NAME),
      diagram: normalizeDiagramAsset(entry.diagram)
    };
  }

  return entry;
}

function normalizeDiagramStrokeStyle(value: DiagramStrokeStyle | undefined): DiagramStrokeStyle {
  return value === "dotted" ||
    value === "fine-dotted" ||
    value === "dashed" ||
    value === "solid"
    ? value
    : "solid";
}

function normalizeDiagramEndpoint(value: DiagramEndpoint | undefined): DiagramEndpoint {
  return value === "arrow" || value === "dot" || value === "open-dot" || value === "none"
    ? value
    : "none";
}

function normalizeDiagramCanvasFrame(
  frame: DiagramCanvasFrame | null | undefined
): DiagramCanvasFrame | null {
  if (!frame) {
    return null;
  }

  if (
    typeof frame.x !== "number" ||
    typeof frame.y !== "number" ||
    typeof frame.width !== "number" ||
    typeof frame.height !== "number"
  ) {
    return null;
  }

  return {
    x: frame.x,
    y: frame.y,
    width: Math.max(24, frame.width),
    height: Math.max(24, frame.height)
  };
}

function normalizeDiagramStroke(stroke: DiagramStroke): DiagramStroke {
  return {
    ...stroke,
    id: stroke.id ?? createId("stroke"),
    color: stroke.color ?? "#000000",
    width: typeof stroke.width === "number" ? stroke.width : 4.5,
    strokeStyle: normalizeDiagramStrokeStyle(stroke.strokeStyle),
    startMarker: normalizeDiagramEndpoint(stroke.startMarker),
    endMarker: normalizeDiagramEndpoint(stroke.endMarker),
    points: Array.isArray(stroke.points) ? stroke.points : [],
    updatedAt: stroke.updatedAt ?? new Date().toISOString()
  };
}

function normalizeDiagramShape(shape: DiagramShape): DiagramShape {
  const updatedAt = shape.updatedAt ?? new Date().toISOString();

  if (shape.kind === "rect") {
    return {
      ...shape,
      id: shape.id ?? createId("shape"),
      strokeColor: shape.strokeColor ?? "#000000",
      strokeWidth: typeof shape.strokeWidth === "number" ? shape.strokeWidth : 2.5,
      strokeStyle: normalizeDiagramStrokeStyle(shape.strokeStyle),
      fillColor: shape.fillColor ?? "transparent",
      rotation: typeof shape.rotation === "number" ? shape.rotation : 0,
      x: typeof shape.x === "number" ? shape.x : 0,
      y: typeof shape.y === "number" ? shape.y : 0,
      width: typeof shape.width === "number" ? shape.width : 0,
      height: typeof shape.height === "number" ? shape.height : 0,
      originX: typeof shape.originX === "number" ? shape.originX : (typeof shape.x === "number" ? shape.x : 0),
      originY: typeof shape.originY === "number" ? shape.originY : (typeof shape.y === "number" ? shape.y : 0),
      updatedAt
    };
  }

  if (shape.kind === "ellipse") {
    return {
      ...shape,
      id: shape.id ?? createId("shape"),
      strokeColor: shape.strokeColor ?? "#000000",
      strokeWidth: typeof shape.strokeWidth === "number" ? shape.strokeWidth : 2.5,
      strokeStyle: normalizeDiagramStrokeStyle(shape.strokeStyle),
      fillColor: shape.fillColor ?? "transparent",
      rotation: typeof shape.rotation === "number" ? shape.rotation : 0,
      cx: typeof shape.cx === "number" ? shape.cx : 0,
      cy: typeof shape.cy === "number" ? shape.cy : 0,
      rx: typeof shape.rx === "number" ? shape.rx : 0,
      ry: typeof shape.ry === "number" ? shape.ry : 0,
      originX: typeof shape.originX === "number" ? shape.originX : (typeof shape.cx === "number" ? shape.cx : 0),
      originY: typeof shape.originY === "number" ? shape.originY : (typeof shape.cy === "number" ? shape.cy : 0),
      updatedAt
    };
  }

  if (shape.kind === "polygon") {
    return {
      ...shape,
      id: shape.id ?? createId("shape"),
      strokeColor: shape.strokeColor ?? "#000000",
      strokeWidth: typeof shape.strokeWidth === "number" ? shape.strokeWidth : 2.5,
      strokeStyle: normalizeDiagramStrokeStyle(shape.strokeStyle),
      fillColor: shape.fillColor ?? "transparent",
      points: Array.isArray(shape.points) ? shape.points : [],
      updatedAt
    };
  }

  if (shape.kind === "bezier") {
    return {
      ...shape,
      id: shape.id ?? createId("shape"),
      strokeColor: shape.strokeColor ?? "#000000",
      strokeWidth: typeof shape.strokeWidth === "number" ? shape.strokeWidth : 2.5,
      strokeStyle: normalizeDiagramStrokeStyle(shape.strokeStyle),
      startMarker: normalizeDiagramEndpoint(shape.startMarker),
      endMarker: normalizeDiagramEndpoint(shape.endMarker),
      x1: typeof shape.x1 === "number" ? shape.x1 : 0,
      y1: typeof shape.y1 === "number" ? shape.y1 : 0,
      cx1: typeof shape.cx1 === "number" ? shape.cx1 : 0,
      cy1: typeof shape.cy1 === "number" ? shape.cy1 : 0,
      cx2: typeof shape.cx2 === "number" ? shape.cx2 : 0,
      cy2: typeof shape.cy2 === "number" ? shape.cy2 : 0,
      x2: typeof shape.x2 === "number" ? shape.x2 : 0,
      y2: typeof shape.y2 === "number" ? shape.y2 : 0,
      updatedAt
    };
  }

  return {
    ...shape,
    id: shape.id ?? createId("shape"),
    strokeColor: shape.strokeColor ?? "#000000",
    strokeWidth: typeof shape.strokeWidth === "number" ? shape.strokeWidth : 2.5,
    strokeStyle: normalizeDiagramStrokeStyle(shape.strokeStyle),
    startMarker: normalizeDiagramEndpoint(shape.startMarker),
    endMarker: normalizeDiagramEndpoint(shape.endMarker),
    x1: typeof shape.x1 === "number" ? shape.x1 : 0,
    y1: typeof shape.y1 === "number" ? shape.y1 : 0,
    x2: typeof shape.x2 === "number" ? shape.x2 : 0,
    y2: typeof shape.y2 === "number" ? shape.y2 : 0,
    updatedAt
  };
}

function clampCursorSmear(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampEditorFontSize(value: unknown): number {
  return typeof value === "number"
    ? Math.max(MIN_EDITOR_FONT_SIZE, Math.min(MAX_EDITOR_FONT_SIZE, Math.round(value)))
    : DEFAULT_EDITOR_FONT_SIZE;
}

function clampSidebarFontSize(value: unknown): number {
  return typeof value === "number"
    ? Math.max(MIN_SIDEBAR_FONT_SIZE, Math.min(MAX_SIDEBAR_FONT_SIZE, Math.round(value)))
    : DEFAULT_SIDEBAR_FONT_SIZE;
}

export function getActiveDocument(project: TypstProject): TypstDocumentFile {
  return (
    project.documents.find((document) => document.id === project.activeDocumentId) ??
    project.documents[0]
  );
}

export function updateActiveDocument(
  snapshot: AppSnapshot,
  content: string
): AppSnapshot {
  const activeDocument = getActiveDocument(snapshot.project);

  if (activeDocument.content === content) {
    return snapshot;
  }

  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      updatedAt: now,
      documents: snapshot.project.documents.map((document) =>
        document.id === snapshot.project.activeDocumentId
          ? { ...document, content, updatedAt: now }
          : document
      )
    }
  };
}

export function setActiveDocument(
  snapshot: AppSnapshot,
  documentId: string
): AppSnapshot {
  if (snapshot.project.activeDocumentId === documentId) {
    return snapshot;
  }

  if (!snapshot.project.documents.some((document) => document.id === documentId)) {
    return snapshot;
  }

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      activeDocumentId: documentId
    }
  };
}

export function createDocument(
  snapshot: AppSnapshot,
  name?: string
): AppSnapshot {
  const now = new Date().toISOString();
  const nextName = createUniqueDocumentName(snapshot.project.documents, name);

  const document: TypstDocumentFile = {
    id: createId("doc"),
    name: nextName,
    content: "",
    updatedAt: now
  };

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      documents: [...snapshot.project.documents, document],
      activeDocumentId: document.id,
      updatedAt: now
    }
  };
}

export function createDocumentFromFile(
  snapshot: AppSnapshot,
  name: string,
  content: string | Uint8Array
): AppSnapshot {
  const now = new Date().toISOString();
  const document: TypstDocumentFile = {
    id: createId("doc"),
    name: createUniqueDocumentName(snapshot.project.documents, name),
    content,
    updatedAt: now
  };

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      documents: [...snapshot.project.documents, document],
      activeDocumentId: document.id,
      updatedAt: now
    }
  };
}

export function createFolder(snapshot: AppSnapshot, name?: string): AppSnapshot {
  const now = new Date().toISOString();
  const nextName = createUniqueFolderName(snapshot.project.folders, name);

  const folder: FileFolder = {
    id: createId("folder"),
    name: nextName,
    updatedAt: now
  };

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      folders: [...snapshot.project.folders, folder],
      updatedAt: now
    }
  };
}

export function renameDocumentById(
  snapshot: AppSnapshot,
  documentId: string,
  name: string
): AppSnapshot {
  const nextName = name.trim();
  const targetDocument = snapshot.project.documents.find((document) => document.id === documentId);

  if (!targetDocument || !nextName || nextName === targetDocument.name) {
    return snapshot;
  }

  const parentPath = getWorkspaceParentPath(targetDocument.name);
  const requestedName = nextName.includes("/") ? nextName : joinWorkspacePath(parentPath, nextName);

  if (requestedName === targetDocument.name) {
    return snapshot;
  }

  const existingNames = new Set(
    snapshot.project.documents
      .filter((document) => document.id !== documentId)
      .map((document) => document.name)
  );
  const finalName = createUniqueWorkspacePath(requestedName, existingNames);

  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      updatedAt: now,
      activeDocumentId:
        snapshot.project.activeDocumentId === documentId
          ? documentId
          : snapshot.project.activeDocumentId,
      documents: snapshot.project.documents.map((document) =>
        document.id === documentId
          ? { ...document, name: finalName, updatedAt: now }
          : document
      )
    }
  };
}

export function renameFolderById(
  snapshot: AppSnapshot,
  folderId: string,
  name: string
): AppSnapshot {
  const nextName = name.trim();
  const targetFolder = snapshot.project.folders.find((folder) => folder.id === folderId);

  if (!targetFolder || !nextName || nextName === targetFolder.name) {
    return snapshot;
  }

  const parentPath = getWorkspaceParentPath(targetFolder.name);
  const requestedName = nextName.includes("/") ? nextName : joinWorkspacePath(parentPath, nextName);

  if (requestedName === targetFolder.name || requestedName.startsWith(`${targetFolder.name}/`)) {
    return snapshot;
  }

  const existingNames = new Set(
    snapshot.project.folders.filter((folder) => folder.id !== folderId).map((folder) => folder.name)
  );
  const finalName = createUniqueWorkspacePath(requestedName, existingNames);
  const renamePath = (path: string) => moveRelativePath(path, targetFolder.name, finalName);

  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      folders: snapshot.project.folders.map((folder) =>
        folder.name === targetFolder.name || folder.name.startsWith(`${targetFolder.name}/`)
          ? { ...folder, name: renamePath(folder.name), updatedAt: now }
          : folder
      ),
      documents: snapshot.project.documents.map((document) =>
        document.name.startsWith(`${targetFolder.name}/`)
          ? { ...document, name: renamePath(document.name), updatedAt: now }
          : document
      ),
      updatedAt: now
    }
  };
}

export function moveDocumentToTrash(snapshot: AppSnapshot, documentId: string): AppSnapshot {
  const targetDocument = snapshot.project.documents.find((document) => document.id === documentId);

  if (!targetDocument) {
    return snapshot;
  }

  const now = new Date().toISOString();
  const remainingDocuments = snapshot.project.documents.filter((document) => document.id !== documentId);
  const fallbackDocument =
    remainingDocuments.length > 0
      ? null
      : {
          id: createId("doc"),
          name: createUniqueDocumentName(remainingDocuments, DEFAULT_DOCUMENT_NAME),
          content: "",
          updatedAt: now
        };
  const nextDocuments = fallbackDocument ? [...remainingDocuments, fallbackDocument] : remainingDocuments;
  const nextActiveDocumentId =
    snapshot.project.activeDocumentId === documentId
      ? nextDocuments[0]?.id ?? snapshot.project.activeDocumentId
      : snapshot.project.activeDocumentId;

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      documents: nextDocuments,
      activeDocumentId: nextActiveDocumentId,
      trash: [
        ...snapshot.project.trash,
        {
          id: createId("trash"),
          kind: "document",
          deletedAt: now,
          originalPath: targetDocument.name,
          document: targetDocument
        }
      ],
      updatedAt: now
    }
  };
}

export function moveFolderToTrash(snapshot: AppSnapshot, folderId: string): AppSnapshot {
  const targetFolder = snapshot.project.folders.find((folder) => folder.id === folderId);

  if (!targetFolder) {
    return snapshot;
  }

  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      folders: snapshot.project.folders.filter((folder) => folder.id !== folderId),
      trash: [
        ...snapshot.project.trash,
        {
          id: createId("trash"),
          kind: "folder",
          deletedAt: now,
          originalPath: targetFolder.name,
          folder: targetFolder
        }
      ],
      updatedAt: now
    }
  };
}

export function moveDocumentToFolder(
  snapshot: AppSnapshot,
  documentId: string,
  destinationFolderPath: string | null
): AppSnapshot {
  const targetDocument = snapshot.project.documents.find((document) => document.id === documentId);

  if (!targetDocument) {
    return snapshot;
  }

  const nextName = createMovedDocumentName(
    targetDocument.name,
    destinationFolderPath,
    snapshot.project.documents,
    documentId
  );

  if (nextName === targetDocument.name) {
    return snapshot;
  }

  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      documents: snapshot.project.documents.map((document) =>
        document.id === documentId
          ? { ...document, name: nextName, updatedAt: now }
          : document
      ),
      updatedAt: now
    }
  };
}

export function moveFolderToFolder(
  snapshot: AppSnapshot,
  folderId: string,
  destinationFolderPath: string | null
): AppSnapshot {
  const targetFolder = snapshot.project.folders.find((folder) => folder.id === folderId);

  if (!targetFolder) {
    return snapshot;
  }

  const baseName = getWorkspaceBaseName(targetFolder.name);
  const nextFolderPath = joinWorkspacePath(destinationFolderPath, baseName);

  if (
    nextFolderPath === targetFolder.name ||
    nextFolderPath.startsWith(`${targetFolder.name}/`)
  ) {
    return snapshot;
  }

  const existingFolderPaths = new Set(
    snapshot.project.folders
      .filter((folder) => folder.id !== folderId)
      .map((folder) => folder.name)
  );
  let finalFolderPath = nextFolderPath;
  let suffix = 2;

  while (existingFolderPaths.has(finalFolderPath)) {
    finalFolderPath = joinWorkspacePath(destinationFolderPath, `${baseName}-${suffix}`);
    suffix += 1;
  }

  const now = new Date().toISOString();
  const renamePath = (path: string) =>
    moveRelativePath(path, targetFolder.name, finalFolderPath);

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      folders: snapshot.project.folders.map((folder) =>
        folder.name === targetFolder.name || folder.name.startsWith(`${targetFolder.name}/`)
          ? { ...folder, name: renamePath(folder.name), updatedAt: now }
          : folder
      ),
      documents: snapshot.project.documents.map((document) =>
        document.name.startsWith(`${targetFolder.name}/`)
          ? { ...document, name: renamePath(document.name), updatedAt: now }
          : document
      ),
      updatedAt: now
    }
  };
}

export function renameDiagramById(
  snapshot: AppSnapshot,
  diagramId: string,
  name: string
): AppSnapshot {
  const nextName = normalizeDiagramFileName(name);
  const diagram = snapshot.project.diagram ?? createDefaultDiagram();
  const figures = snapshot.project.figures ?? [];
  const targetFigure = figures.find((figure) => figure.id === diagramId) ?? null;
  const targetName = diagram.id === diagramId ? diagram.name : targetFigure?.name ?? "";

  if (!targetName || nextName === targetName) {
    return snapshot;
  }

  const existingNames = new Set(
    figures.filter((figure) => figure.id !== diagramId).map((figure) => figure.name)
  );
  if (diagram.id !== diagramId) {
    existingNames.add(diagram.name);
  }

  let finalName = nextName;
  let suffix = 2;
  while (existingNames.has(finalName)) {
    finalName = `${nextName.replace(/\.svg$/i, "")}-${suffix}.svg`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  const nextDiagram = {
    ...diagram,
    name: diagram.id === diagramId ? finalName : diagram.name,
    updatedAt: diagram.id === diagramId ? now : diagram.updatedAt
  };
  const nextFigures = figures.map((figure) =>
    figure.id === diagramId ? { ...figure, name: finalName, updatedAt: now } : figure
  );

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram: nextDiagram,
      figures: nextFigures,
      updatedAt: now
    }
  };
}

export function moveDiagramToTrash(snapshot: AppSnapshot, diagramId: string): AppSnapshot {
  const figures = snapshot.project.figures ?? [];
  const targetFigure = figures.find((figure) => figure.id === diagramId);

  if (!targetFigure) {
    return snapshot;
  }

  const now = new Date().toISOString();
  const currentDiagram = snapshot.project.diagram ?? createDefaultDiagram();
  const nextDiagram =
    currentDiagram.id === diagramId
      ? {
          ...createDefaultDiagram(),
          updatedAt: now
        }
      : currentDiagram;

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram: nextDiagram,
      figures: figures.filter((figure) => figure.id !== diagramId),
      trash: [
        ...snapshot.project.trash,
        {
          id: createId("trash"),
          kind: "diagram",
          deletedAt: now,
          originalPath: getDiagramFilePath(targetFigure.name),
          diagram: targetFigure
        }
      ],
      updatedAt: now
    }
  };
}

export function moveDiagramToFolder(
  snapshot: AppSnapshot,
  diagramId: string,
  destinationFolderPath: string | null
): AppSnapshot {
  const figures = snapshot.project.figures ?? [];
  const targetFigure = figures.find((figure) => figure.id === diagramId);

  if (!targetFigure) {
    return snapshot;
  }

  const nextName = createMovedFigureName(
    targetFigure.name,
    destinationFolderPath,
    diagramId,
    figures
  );

  if (nextName === targetFigure.name) {
    return snapshot;
  }

  const now = new Date().toISOString();
  const currentDiagram = snapshot.project.diagram ?? createDefaultDiagram();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram:
        currentDiagram.id === diagramId
          ? { ...currentDiagram, name: nextName, updatedAt: now }
          : currentDiagram,
      figures: figures.map((figure) =>
        figure.id === diagramId ? { ...figure, name: nextName, updatedAt: now } : figure
      ),
      updatedAt: now
    }
  };
}

export function renameProject(
  snapshot: AppSnapshot,
  name: string
): AppSnapshot {
  const nextName = name.trim();

  if (!nextName || nextName === snapshot.project.name) {
    return snapshot;
  }

  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      name: nextName,
      updatedAt: now
    }
  };
}

export function restoreTrashEntry(snapshot: AppSnapshot, trashEntryId: string): AppSnapshot {
  const targetEntry = snapshot.project.trash.find((entry) => entry.id === trashEntryId);

  if (!targetEntry) {
    return snapshot;
  }

  const now = new Date().toISOString();
  const remainingTrash = snapshot.project.trash.filter((entry) => entry.id !== trashEntryId);

  if (targetEntry.kind === "document") {
    const restoredDocument = {
      ...targetEntry.document,
      id: createId("doc"),
      name: createUniqueDocumentName(snapshot.project.documents, targetEntry.originalPath),
      updatedAt: now
    };

    return {
      ...snapshot,
      project: {
        ...snapshot.project,
        documents: [...snapshot.project.documents, restoredDocument],
        activeDocumentId: restoredDocument.id,
        trash: remainingTrash,
        updatedAt: now
      }
    };
  }

  if (targetEntry.kind === "folder") {
    const restoredFolder = {
      ...targetEntry.folder,
      id: createId("folder"),
      name: createUniqueFolderName(snapshot.project.folders, targetEntry.originalPath),
      updatedAt: now
    };

    return {
      ...snapshot,
      project: {
        ...snapshot.project,
        folders: [...snapshot.project.folders, restoredFolder],
        trash: remainingTrash,
        updatedAt: now
      }
    };
  }

  if (targetEntry.kind === "diagram") {
    const requestedPath = stripFiguresWorkspacePath(targetEntry.originalPath);
    const restoredDiagram = {
      ...targetEntry.diagram,
      id: createId("diagram"),
      name: createUniqueDiagramName(
        requestedPath,
        snapshot.project.figures,
        snapshot.project.diagram?.id === targetEntry.diagram.id ? snapshot.project.diagram.name : null
      ),
      updatedAt: now
    };

    return {
      ...snapshot,
      project: {
        ...snapshot.project,
        figures: [...snapshot.project.figures, restoredDiagram],
        trash: remainingTrash,
        updatedAt: now
      }
    };
  }

  return snapshot;
}

export function permanentlyDeleteTrashEntry(snapshot: AppSnapshot, trashEntryId: string): AppSnapshot {
  const nextTrash = snapshot.project.trash.filter((entry) => entry.id !== trashEntryId);

  if (nextTrash.length === snapshot.project.trash.length) {
    return snapshot;
  }

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      trash: nextTrash,
      updatedAt: new Date().toISOString()
    }
  };
}

export function emptyTrash(snapshot: AppSnapshot): AppSnapshot {
  if (snapshot.project.trash.length === 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      trash: [],
      updatedAt: new Date().toISOString()
    }
  };
}

export function renameActiveDocument(
  snapshot: AppSnapshot,
  name: string
): AppSnapshot {
  const nextName = name.trim();
  const activeDocument = getActiveDocument(snapshot.project);

  if (!nextName || nextName === activeDocument.name) {
    return snapshot;
  }

  const now = new Date().toISOString();
  const existingNames = new Set(
    snapshot.project.documents
      .filter((document) => document.id !== activeDocument.id)
      .map((document) => document.name)
  );
  let finalName = nextName;
  let suffix = 2;

  while (existingNames.has(finalName)) {
    finalName = `${nextName}-${suffix}`;
    suffix += 1;
  }

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      updatedAt: now,
      documents: snapshot.project.documents.map((document) =>
        document.id === activeDocument.id
          ? { ...document, name: finalName, updatedAt: now }
          : document
      )
    }
  };
}

export function updateDiagram(
  snapshot: AppSnapshot,
  update: (diagram: DiagramAsset) => DiagramAsset
): AppSnapshot {
  const now = new Date().toISOString();
  const nextDiagram = update(snapshot.project.diagram ?? createDefaultDiagram());

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram: {
        ...nextDiagram,
        updatedAt: now
      },
      updatedAt: now
    }
  };
}

export function removeLatestDiagramItem(snapshot: AppSnapshot): AppSnapshot {
  const now = new Date().toISOString();
  const diagram = snapshot.project.diagram ?? createDefaultDiagram();
  const latestStroke = diagram.strokes[diagram.strokes.length - 1];
  const latestShape = diagram.shapes[diagram.shapes.length - 1];
  const latestStrokeTime = latestStroke?.updatedAt ? Date.parse(latestStroke.updatedAt) : -1;
  const latestShapeTime = latestShape?.updatedAt ? Date.parse(latestShape.updatedAt) : -1;

  if (latestStrokeTime < 0 && latestShapeTime < 0) {
    return snapshot;
  }

  if (latestStrokeTime >= latestShapeTime) {
    return {
      ...snapshot,
      project: {
        ...snapshot.project,
        diagram: {
          ...diagram,
          strokes: diagram.strokes.slice(0, -1),
          updatedAt: now
        },
        updatedAt: now
      }
    };
  }

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram: {
        ...diagram,
        shapes: diagram.shapes.slice(0, -1),
        updatedAt: now
      },
      updatedAt: now
    }
  };
}

export function removeDiagramStroke(snapshot: AppSnapshot, strokeId: string): AppSnapshot {
  const now = new Date().toISOString();
  const diagram = snapshot.project.diagram ?? createDefaultDiagram();
  const filtered = diagram.strokes.filter((s) => s.id !== strokeId);
  if (filtered.length === diagram.strokes.length) return snapshot;
  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram: {
        ...diagram,
        strokes: filtered,
        updatedAt: now
      },
      updatedAt: now
    }
  };
}

export function removeDiagramShape(snapshot: AppSnapshot, shapeId: string): AppSnapshot {
  const now = new Date().toISOString();
  const diagram = snapshot.project.diagram ?? createDefaultDiagram();
  const filtered = diagram.shapes.filter((s) => s.id !== shapeId);
  if (filtered.length === diagram.shapes.length) return snapshot;
  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram: {
        ...diagram,
        shapes: filtered,
        updatedAt: now
      },
      updatedAt: now
    }
  };
}

export function saveCurrentDiagram(snapshot: AppSnapshot): AppSnapshot {
  const now = new Date().toISOString();
  const diagram = normalizeDiagramAsset(snapshot.project.diagram ?? createDefaultDiagram());
  const figures = snapshot.project.figures ?? [];
  const existingIndex = figures.findIndex((figure) => figure.id === diagram.id);
  const nextFigures =
    existingIndex >= 0
      ? figures.map((figure, index) => (index === existingIndex ? diagram : figure))
      : [...figures, diagram];

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      diagram: {
        ...diagram,
        updatedAt: now
      },
      figures: nextFigures,
      updatedAt: now
    }
  };
}

export function createNextDiagramSnapshot(snapshot: AppSnapshot): AppSnapshot {
  const now = new Date().toISOString();
  const savedSnapshot = saveCurrentDiagram(snapshot);
  const currentDiagram = savedSnapshot.project.diagram;
  const nextName = createNextDiagramName(currentDiagram.name);

  return {
    ...savedSnapshot,
    project: {
      ...savedSnapshot.project,
      diagram: {
        ...createDefaultDiagram(),
        name: nextName,
        updatedAt: now
      },
      updatedAt: now
    }
  };
}

function createNextDiagramName(currentName: string): string {
  const baseName = normalizeDiagramFileName(currentName).replace(/\.svg$/i, "");
  const match = /^diagram(?:\s+(\d+))?$/i.exec(baseName);
  const nextIndex = match ? Number(match[1] ?? "1") + 1 : 1;
  return `diagram ${nextIndex}.svg`;
}

function normalizeWorkspaceFolderPath(path: string | null): string | null {
  const normalized = normalizeRelativePath(path ?? "");
  return normalized || null;
}


function stripFiguresWorkspacePath(path: string): string {
  const normalizedPath = normalizeWorkspaceFolderPath(path) ?? "";
  return stripRelativePathPrefix(normalizedPath, "figures") ?? normalizedPath;
}



function createMovedDocumentName(
  currentName: string,
  destinationFolderPath: string | null,
  documents: TypstDocumentFile[],
  documentId: string
): string {
  const baseName = getWorkspaceBaseName(currentName);
  const targetPath = joinWorkspacePath(destinationFolderPath, baseName);
  const existingNames = new Set(
    documents.filter((document) => document.id !== documentId).map((document) => document.name)
  );

  if (!existingNames.has(targetPath)) {
    return targetPath;
  }

  const extensionMatch = /\.([^.]+)$/i.exec(baseName);
  const extension = extensionMatch ? `.${extensionMatch[1]}` : "";
  const stem = extension ? baseName.slice(0, -extension.length) : baseName;
  let suffix = 2;
  let nextPath = joinWorkspacePath(destinationFolderPath, `${stem}-${suffix}${extension}`);

  while (existingNames.has(nextPath)) {
    suffix += 1;
    nextPath = joinWorkspacePath(destinationFolderPath, `${stem}-${suffix}${extension}`);
  }

  return nextPath;
}

function createMovedFigureName(
  currentName: string,
  destinationFolderPath: string | null,
  diagramId: string,
  figures: DiagramAsset[]
): string {
  const baseName = getWorkspaceBaseName(currentName);
  const requestedName = joinWorkspacePath(destinationFolderPath, baseName);
  const existingFigures = figures.filter((figure) => figure.id !== diagramId);
  return createUniqueDiagramName(requestedName, existingFigures);
}

function createUniqueDiagramName(
  requestedName: string,
  figures: DiagramAsset[],
  currentDiagramName: string | null = null
): string {
  const nextName = normalizeDiagramFileName(requestedName);
  const existingNames = new Set(figures.map((figure) => figure.name));

  if (currentDiagramName) {
    existingNames.add(currentDiagramName);
  }

  let finalName = nextName;
  let suffix = 2;

  while (existingNames.has(finalName)) {
    finalName = `${nextName.replace(/\.svg$/i, "")}-${suffix}.svg`;
    suffix += 1;
  }

  return finalName;
}

function createUniqueDocumentName(
  documents: TypstDocumentFile[],
  requestedName?: string
): string {
  const existingNames = new Set(documents.map((document) => document.name));
  const normalizedRequestedName = normalizeWorkspaceFolderPath(requestedName ?? "");

  if (normalizedRequestedName) {
    const parentPath = getWorkspaceParentPath(normalizedRequestedName);
    const baseName = getWorkspaceBaseName(normalizedRequestedName);

    if (/^new-file-\d+$/i.test(baseName)) {
      return createUniqueNewFileName(existingNames, parentPath);
    }

    return createUniqueWorkspacePath(normalizedRequestedName, existingNames);
  }

  return createUniqueNewFileName(existingNames, null);
}

function createUniqueNewFileName(existingNames: Set<string>, parentPath: string | null): string {
  let nextIndex = 1;
  let nextName = joinWorkspacePath(parentPath, `new-file-${nextIndex}`);

  while (existingNames.has(nextName)) {
    nextIndex += 1;
    nextName = joinWorkspacePath(parentPath, `new-file-${nextIndex}`);
  }

  return nextName;
}

function createUniqueFolderName(
  folders: FileFolder[],
  requestedName?: string
): string {
  const existingNames = new Set(folders.map((folder) => folder.name));
  const normalizedRequestedName = normalizeWorkspaceFolderPath(requestedName ?? "");

  if (normalizedRequestedName) {
    return createUniqueWorkspacePath(normalizedRequestedName, existingNames);
  }

  let nextIndex = folders.length + 1;
  let nextName = `folder ${nextIndex}`;

  while (existingNames.has(nextName)) {
    nextIndex += 1;
    nextName = `folder ${nextIndex}`;
  }

  return nextName;
}

function createUniqueWorkspacePath(requestedPath: string, existingPaths: Set<string>): string {
  if (!existingPaths.has(requestedPath)) {
    return requestedPath;
  }

  const parentPath = getWorkspaceParentPath(requestedPath);
  const baseName = getWorkspaceBaseName(requestedPath);
  const extensionMatch = /\.([^.]+)$/i.exec(baseName);
  const extension = extensionMatch ? `.${extensionMatch[1]}` : "";
  const stem = extension ? baseName.slice(0, -extension.length) : baseName;
  let suffix = 2;
  let nextPath = joinWorkspacePath(parentPath, `${stem}-${suffix}${extension}`);

  while (existingPaths.has(nextPath)) {
    suffix += 1;
    nextPath = joinWorkspacePath(parentPath, `${stem}-${suffix}${extension}`);
  }

  return nextPath;
}

function normalizeMobileKeyboardPreferences(value: unknown): MobileKeyboardPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_MOBILE_KEYBOARD_PREFERENCES;
  }

  const candidate = value as Partial<MobileKeyboardPreferences>;
  const keys = candidate.keys && typeof candidate.keys === "object" && !Array.isArray(candidate.keys)
    ? candidate.keys as Partial<Record<MobileKeyboardLanguage, unknown>>
    : {};

  return {
    enabled: candidate.enabled ?? DEFAULT_MOBILE_KEYBOARD_PREFERENCES.enabled,
    keys: {
      typst: normalizeMobileKeyboardKeyLabels(keys.typst, DEFAULT_MOBILE_KEYBOARD_PREFERENCES.keys.typst),
      latex: normalizeMobileKeyboardKeyLabels(keys.latex, DEFAULT_MOBILE_KEYBOARD_PREFERENCES.keys.latex),
      markdown: normalizeMobileKeyboardKeyLabels(keys.markdown, DEFAULT_MOBILE_KEYBOARD_PREFERENCES.keys.markdown)
    }
  };
}

function normalizeMobileKeyboardKeyLabels(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const labels = value
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.slice(0, 18) : fallback;
}

export function updateThemePreference(
  snapshot: AppSnapshot,
  theme: ThemePreference
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      theme
    }
  };
}

export function updateVimPreference(
  snapshot: AppSnapshot,
  vimMode: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      vimMode
    }
  };
}

export function updateVimClipboardSharingPreference(
  snapshot: AppSnapshot,
  vimClipboardSharing: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      vimClipboardSharing
    }
  };
}

export function updateRelativeLineNumbersPreference(
  snapshot: AppSnapshot,
  relativeLineNumbers: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      relativeLineNumbers
    }
  };
}

export function updateCursorSmearPreference(
  snapshot: AppSnapshot,
  cursorSmear: number
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      cursorSmear: clampCursorSmear(cursorSmear)
    }
  };
}

export function updateCursorSmoothPreference(
  snapshot: AppSnapshot,
  cursorSmooth: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      cursorSmooth
    }
  };
}

export function updateKeybindingsPreference(
  snapshot: AppSnapshot,
  keybindings: KeybindingMap
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      keybindings: normalizeKeybindings(keybindings)
    }
  };
}

export function updateEditorFontSizePreference(
  snapshot: AppSnapshot,
  editorFontSize: number
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      editorFontSize: clampEditorFontSize(editorFontSize)
    }
  };
}

export function updateSidebarFontSizePreference(
  snapshot: AppSnapshot,
  sidebarFontSize: number
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      sidebarFontSize: clampSidebarFontSize(sidebarFontSize)
    }
  };
}

export function updateColorfulFileTreeIconsPreference(
  snapshot: AppSnapshot,
  colorfulFileTreeIcons: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      colorfulFileTreeIcons
    }
  };
}

export function updateShowGitignoreInFileTreePreference(
  snapshot: AppSnapshot,
  showGitignoreInFileTree: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      showGitignoreInFileTree
    }
  };
}

export function updateLiveCompilationPreference(
  snapshot: AppSnapshot,
  liveCompilation: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      liveCompilation
    }
  };
}

export function updateLatexMathPreviewPreference(
  snapshot: AppSnapshot,
  latexMathPreview: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      latexMathPreview
    }
  };
}

export function updateTypstMathPreviewPreference(
  snapshot: AppSnapshot,
  typstMathPreview: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      typstMathPreview
    }
  };
}

export function updateAutoSyncGitProjectsPreference(
  snapshot: AppSnapshot,
  autoSyncGitProjects: boolean
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      autoSyncGitProjects
    }
  };
}

export function updateEditorToolingPreference(
  snapshot: AppSnapshot,
  editorTooling: EditorToolingPreferences
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      editorTooling: normalizeEditorToolingPreferences(editorTooling)
    }
  };
}

export function updateExternalDiagnosticsPreference(
  snapshot: AppSnapshot,
  externalDiagnostics: ExternalDiagnosticProviderPreferences
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      externalDiagnostics: normalizeExternalDiagnosticProviderPreferences(externalDiagnostics)
    }
  };
}

export function updatePastedImagePreference(
  snapshot: AppSnapshot,
  pastedImages: Partial<PastedImagePreferences>
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      pastedImages: normalizePastedImagePreferences({
        ...snapshot.preferences.pastedImages,
        ...pastedImages
      })
    }
  };
}

export function updateMobileKeyboardPreference(
  snapshot: AppSnapshot,
  mobileKeyboard: MobileKeyboardPreferences
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      mobileKeyboard: normalizeMobileKeyboardPreferences(mobileKeyboard)
    }
  };
}
