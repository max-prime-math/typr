import { AUTO_THEME_ID, normalizeThemeId } from "../theme/themes";
import {
  DEFAULT_DIAGRAM_FILE_NAME,
  getDiagramFilePath,
  normalizeDiagramFileName
} from "../diagram/diagramFiles";
import {
  DEFAULT_GRAPH_FILE_NAME,
  getGraphFilePath,
  normalizeGraphFileName,
  normalizeGraphFileNameForContentType
} from "../graph/graphFiles";
import {
  createSimplePlotGraphAssetContent,
  createDefaultSimplePlotSource,
  parseSimplePlotGraphDocument,
  serializeSimplePlotGraphDocument
} from "../graph/simplePlotGraph";
import { createPrefixedId } from "../utils/randomId";
import {
  DEFAULT_EDITOR_TOOLING_PREFERENCES,
  normalizeEditorToolingPreferences,
  type EditorToolingPreferences
} from "../editor/editorTools";
import { DEFAULT_KEYBINDINGS, normalizeKeybindings, type KeybindingMap } from "./keybindings";

export type ThemePreference = string;
export type GraphProvider = "simple-plot";
export type GraphContentType = "typ";
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

export interface GraphStyle {
  width: number;
  height: number;
  lockAspectRatio: boolean;
  strokeWidth: number;
  xAxisLabel: string;
  yAxisLabel: string;
  axisArrows: boolean;
  xTickStep: number;
  yTickStep: number;
  showGrid: boolean;
  showOnlyGreatestTickLabel: boolean;
}

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

export interface GraphAsset {
  id: string;
  name: string;
  provider: GraphProvider;
  updatedAt: string;
  source: string;
  style: GraphStyle;
  state: string;
  expressions: string;
  viewport: GraphViewport | null;
  renderMode: GraphRenderMode;
  contentType: GraphContentType;
  content: Uint8Array;
}

export interface TrashedGraphEntry {
  id: string;
  kind: "graph";
  deletedAt: string;
  originalPath: string;
  graph: GraphAsset;
}

export type WorkspaceTrashEntry =
  | TrashedDocumentEntry
  | TrashedFolderEntry
  | TrashedDiagramEntry
  | TrashedGraphEntry;

export interface GraphViewport {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type GraphRenderMode = "auto" | "png" | "typst";

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
  graph: GraphAsset;
  graphs: GraphAsset[];
}

export interface AppPreferences {
  theme: ThemePreference;
  vimMode: boolean;
  relativeLineNumbers: boolean;
  cursorSmooth: boolean;
  cursorSmear: number;
  liveCompilation: boolean;
  latexMathPreview: boolean;
  autoSyncGitProjects: boolean;
  editorTooling: EditorToolingPreferences;
  graphProvider: GraphProvider;
  keybindings: KeybindingMap;
  mobileKeyboard: MobileKeyboardPreferences;
  editorFontSize: number;
  sidebarFontSize: number;
  colorfulFileTreeIcons: boolean;
}

export interface AppSnapshot {
  version: 9;
  project: TypstProject;
  preferences: AppPreferences;
}

export const DEFAULT_DOCUMENT_NAME = "main.typ";

export const DEFAULT_DOCUMENT_CONTENT = `#set page(margin: 1.15in)
#set text(font: "New Computer Modern", size: 11pt)

= Typr Starter

This is a Typst starter document. Edit this source and watch the preview update as you write.

== Try it

- Use the files pane to switch between the Typst, LaTeX, and README files.
- Open latex-starter.tex when you want to try a manual LaTeX compile.
- Open README.md for a short workspace overview.
- Keep writing here, or replace this page with your own notes.

== Next steps

Start writing your document here.
`;

export const DEFAULT_LATEX_DOCUMENT_NAME = "latex-starter.tex";

export const DEFAULT_LATEX_DOCUMENT_CONTENT = `\\documentclass{article}
\\usepackage[margin=1in]{geometry}

\\title{Typr LaTeX Starter}
\\author{}
\\date{}

\\begin{document}
\\maketitle

This is a LaTeX starter document. Edit the source, then compile it when you are ready to generate a PDF preview.

\\section{Next steps}

Write your document here.

\\end{document}
`;

export const DEFAULT_MARKDOWN_DOCUMENT_NAME = "README.md";

export const DEFAULT_MARKDOWN_DOCUMENT_CONTENT = `# Typr Project

Typr is a local-first writing workspace for Typst, LaTeX, and Markdown. Projects live in your browser, can be edited offline, and can be synced with a GitHub repository when you are ready.

## Getting started

- Edit main.typ to try Typst preview.
- Edit latex-starter.tex and compile when you want a LaTeX PDF.
- Check Settings before you settle in, especially editor, preview, and package options.
- Explore the left pane tabs for files, sync, search, diagrams, graphs, and project tools.
- Use the files pane to add your own source files, folders, figures, and notes.
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

export function getDefaultGraphSource(provider: GraphProvider): string {
  return createDefaultSimplePlotSource();
}

export function createDefaultGraphStyle(): GraphStyle {
  return {
    width: 6.8,
    height: 4.8,
    lockAspectRatio: false,
    strokeWidth: 1.5,
    xAxisLabel: "$x$",
    yAxisLabel: "$y$",
    axisArrows: true,
    xTickStep: 1,
    yTickStep: 1,
    showGrid: true,
    showOnlyGreatestTickLabel: false
  };
}

export function createDefaultDiagram(): DiagramAsset {
  const now = new Date().toISOString();

  return {
    id: createId("diagram"),
    name: DEFAULT_DIAGRAM_FILE_NAME,
    updatedAt: now,
    frame: null,
    strokes: [],
    shapes: []
  };
}

export function createDefaultGraph(provider: GraphProvider = "simple-plot"): GraphAsset {
  const now = new Date().toISOString();
  const source = getDefaultGraphSource(provider);
  const style = createDefaultGraphStyle();

  return {
    id: createId("graph"),
    name: DEFAULT_GRAPH_FILE_NAME,
    provider,
    updatedAt: now,
    source,
    style,
    state: "",
    expressions: "[]",
    viewport: null,
    renderMode: "typst",
    contentType: "typ",
    content: createSimplePlotGraphAssetContent(parseSimplePlotGraphDocument(source), style)
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
      documents: [typstDocument, latexDocument, markdownDocument],
      folders: [],
      trash: [],
      activeDocumentId: typstDocument.id,
      createdAt: now,
      updatedAt: now,
      diagram: createDefaultDiagram(),
      figures: [],
      graph: createDefaultGraph(),
      graphs: []
    },
    preferences: {
      theme: AUTO_THEME_ID,
      vimMode: false,
      relativeLineNumbers: false,
      cursorSmooth: true,
      cursorSmear: DEFAULT_CURSOR_SMEAR,
      liveCompilation: false,
      latexMathPreview: true,
      autoSyncGitProjects: true,
      editorTooling: DEFAULT_EDITOR_TOOLING_PREFERENCES,
      graphProvider: "simple-plot",
      keybindings: DEFAULT_KEYBINDINGS,
      mobileKeyboard: DEFAULT_MOBILE_KEYBOARD_PREFERENCES,
      editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
      sidebarFontSize: DEFAULT_SIDEBAR_FONT_SIZE,
      colorfulFileTreeIcons: false
    }
  };
}

export function normalizeSnapshot(snapshot: AppSnapshot): AppSnapshot {
  const storedCursorSmear = snapshot.preferences.cursorSmear;
  const storedGraphProvider = snapshot.preferences.graphProvider;
  const diagram = snapshot.project.diagram ?? createDefaultDiagram();
  const figures = Array.isArray(snapshot.project.figures) ? snapshot.project.figures : [];
  const folders = Array.isArray(snapshot.project.folders) ? snapshot.project.folders : [];
  const trash = Array.isArray(snapshot.project.trash) ? snapshot.project.trash : [];
  const graph = snapshot.project.graph ?? createDefaultGraph();
  const graphs = Array.isArray(snapshot.project.graphs) ? snapshot.project.graphs : [];
  const now = new Date().toISOString();
  const normalizedDiagramName = normalizeDiagramFileName(
    diagram.name ?? DEFAULT_DIAGRAM_FILE_NAME
  );
  const normalizedGraphName = normalizeGraphFileName(graph.name ?? DEFAULT_GRAPH_FILE_NAME);
  const currentDiagram = {
    ...diagram,
    id: diagram.id ?? createDefaultDiagram().id,
    name: normalizedDiagramName,
    updatedAt: diagram.updatedAt ?? now,
    frame: normalizeDiagramCanvasFrame(diagram.frame),
    strokes: Array.isArray(diagram.strokes)
      ? diagram.strokes.map(normalizeDiagramStroke)
      : [],
    shapes: Array.isArray((diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes)
      ? (diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes.map(normalizeDiagramShape)
      : []
  };
  const currentGraph = normalizeGraphAsset({
    ...graph,
    name: normalizedGraphName
  });

  return {
    ...snapshot,
    version: 9,
    preferences: {
      theme: normalizeThemeId(snapshot.preferences.theme ?? AUTO_THEME_ID),
      vimMode: snapshot.preferences.vimMode ?? false,
      relativeLineNumbers: snapshot.preferences.relativeLineNumbers ?? false,
      cursorSmooth: snapshot.preferences.cursorSmooth ?? true,
      cursorSmear:
        typeof storedCursorSmear === "number"
          ? clampCursorSmear(storedCursorSmear)
          : storedCursorSmear === false
            ? 0
            : DEFAULT_CURSOR_SMEAR,
      liveCompilation: snapshot.preferences.liveCompilation ?? false,
      latexMathPreview:
        (snapshot.preferences as Partial<AppPreferences>).latexMathPreview ?? true,
      autoSyncGitProjects:
        (snapshot.preferences as Partial<AppPreferences>).autoSyncGitProjects ?? true,
      editorTooling: normalizeEditorToolingPreferences(
        (snapshot.preferences as Partial<AppPreferences>).editorTooling
      ),
      graphProvider: normalizeGraphProvider(storedGraphProvider),
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
        (snapshot.preferences as Partial<AppPreferences>).colorfulFileTreeIcons ?? false
    },
    project: {
      ...snapshot.project,
      documents: snapshot.project.documents,
      updatedAt: snapshot.project.updatedAt,
      diagram: currentDiagram,
      folders: folders.map(normalizeFolderAsset),
      trash: trash.map(normalizeTrashEntry),
      figures: figures.map(normalizeDiagramAsset),
      graph: currentGraph,
      graphs: graphs.map(normalizeGraphAsset)
    }
  };
}

function normalizeDiagramAsset(diagram: DiagramAsset): DiagramAsset {
  const normalizedName = normalizeDiagramFileName(diagram.name ?? DEFAULT_DIAGRAM_FILE_NAME);

  return {
    ...diagram,
    id: diagram.id ?? createDefaultDiagram().id,
    name: normalizedName,
    updatedAt: diagram.updatedAt ?? new Date().toISOString(),
    frame: normalizeDiagramCanvasFrame(diagram.frame),
    strokes: Array.isArray(diagram.strokes)
      ? diagram.strokes.map(normalizeDiagramStroke)
      : [],
    shapes: Array.isArray((diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes)
      ? (diagram as DiagramAsset & { shapes?: DiagramShape[] }).shapes.map(normalizeDiagramShape)
      : []
  };
}

function normalizeFolderAsset(folder: FileFolder): FileFolder {
  return {
    ...folder,
    id: folder.id ?? createId("folder"),
    name: typeof folder.name === "string" ? folder.name.trim() || "folder" : "folder",
    updatedAt: folder.updatedAt ?? new Date().toISOString()
  };
}

function normalizeTrashEntry(entry: WorkspaceTrashEntry): WorkspaceTrashEntry {
  const deletedAt = entry.deletedAt ?? new Date().toISOString();

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

  return {
    ...entry,
    id: entry.id ?? createId("trash"),
    deletedAt,
    originalPath:
      normalizeWorkspaceFolderPath(
        entry.originalPath ?? getGraphFilePath(entry.graph?.name ?? DEFAULT_GRAPH_FILE_NAME)
      ) ?? getGraphFilePath(DEFAULT_GRAPH_FILE_NAME),
    graph: normalizeGraphAsset(entry.graph)
  };
}

function normalizeGraphAsset(graph: GraphAsset): GraphAsset {
  const rawContentType = (graph as GraphAsset & { contentType?: GraphContentType | "png" | "svg" }).contentType;
  const normalizedProvider = normalizeGraphProvider(
    (graph as GraphAsset & { provider?: GraphProvider }).provider
  );
  const normalizedViewport = normalizeGraphViewport(
    (graph as GraphAsset & { viewport?: GraphViewport | null }).viewport ?? null
  );
  const normalizedRenderMode = normalizeGraphRenderMode(
    (graph as GraphAsset & { renderMode?: GraphRenderMode }).renderMode
  );
  const normalizedContentType = normalizeGraphContentType(
    (graph as GraphAsset & { contentType?: GraphContentType }).contentType,
    normalizedProvider
  );
  const normalizedName = normalizeGraphFileNameForContentType(
    graph.name ?? DEFAULT_GRAPH_FILE_NAME,
    normalizedContentType
  );
  const normalizedSource = serializeSimplePlotGraphDocument(
    parseSimplePlotGraphDocument(
      typeof (graph as GraphAsset & { source?: string }).source === "string"
        ? (graph as GraphAsset & { source?: string }).source
        : createDefaultSimplePlotSource()
    )
  );

  return {
    ...graph,
    id: graph.id ?? createId("graph"),
    name: normalizedName,
    provider: normalizedProvider,
    updatedAt: graph.updatedAt ?? new Date().toISOString(),
    source: normalizedSource,
    style: normalizeGraphStyle((graph as GraphAsset & { style?: Partial<GraphStyle> }).style),
    state: typeof graph.state === "string" ? graph.state : "",
    expressions: typeof graph.expressions === "string" ? graph.expressions : "[]",
    viewport: normalizedViewport,
    renderMode: normalizedRenderMode,
    contentType: normalizedContentType,
    content:
      rawContentType === "typ" && graph.content instanceof Uint8Array && graph.content.length > 0
        ? graph.content
        : createSimplePlotGraphAssetContent(
            parseSimplePlotGraphDocument(normalizedSource),
            normalizeGraphStyle((graph as GraphAsset & { style?: Partial<GraphStyle> }).style)
          )
  };
}

function normalizeGraphProvider(value: GraphProvider | undefined): GraphProvider {
  return "simple-plot";
}

function normalizeGraphContentType(
  value: GraphContentType | undefined,
  provider: GraphProvider
): GraphContentType {
  if (value === "typ") {
    return value;
  }

  return "typ";
}

function normalizeGraphStyle(style: Partial<GraphStyle> | undefined): GraphStyle {
  const defaultStyle = createDefaultGraphStyle();
  const legacyWidth = typeof style?.width === "number" && style.width > 50 ? style.width / 96 * 2.54 : style?.width;
  const legacyHeight = typeof style?.height === "number" && style.height > 50 ? style.height / 96 * 2.54 : style?.height;
  return {
    width: typeof legacyWidth === "number" && legacyWidth > 0 ? legacyWidth : defaultStyle.width,
    height:
      typeof legacyHeight === "number" && legacyHeight > 0 ? legacyHeight : defaultStyle.height,
    lockAspectRatio:
      typeof style?.lockAspectRatio === "boolean"
        ? style.lockAspectRatio
        : defaultStyle.lockAspectRatio,
    strokeWidth:
      typeof style?.strokeWidth === "number" && style.strokeWidth > 0
        ? style.strokeWidth
        : defaultStyle.strokeWidth,
    xAxisLabel: typeof style?.xAxisLabel === "string" ? style.xAxisLabel : defaultStyle.xAxisLabel,
    yAxisLabel: typeof style?.yAxisLabel === "string" ? style.yAxisLabel : defaultStyle.yAxisLabel,
    axisArrows: typeof style?.axisArrows === "boolean" ? style.axisArrows : defaultStyle.axisArrows,
    xTickStep:
      typeof style?.xTickStep === "number" && style.xTickStep > 0
        ? style.xTickStep
        : defaultStyle.xTickStep,
    yTickStep:
      typeof style?.yTickStep === "number" && style.yTickStep > 0
        ? style.yTickStep
        : defaultStyle.yTickStep,
    showGrid: typeof style?.showGrid === "boolean" ? style.showGrid : defaultStyle.showGrid,
    showOnlyGreatestTickLabel:
      typeof style?.showOnlyGreatestTickLabel === "boolean"
        ? style.showOnlyGreatestTickLabel
        : defaultStyle.showOnlyGreatestTickLabel
  };
}

function normalizeGraphViewport(viewport: GraphViewport | null | undefined): GraphViewport | null {
  if (!viewport) {
    return null;
  }

  if (
    typeof viewport.left !== "number" ||
    typeof viewport.right !== "number" ||
    typeof viewport.top !== "number" ||
    typeof viewport.bottom !== "number"
  ) {
    return null;
  }

  return {
    left: viewport.left,
    right: viewport.right,
    top: viewport.top,
    bottom: viewport.bottom
  };
}

function normalizeGraphRenderMode(value: GraphRenderMode | undefined): GraphRenderMode {
  return value === "png" || value === "typst" ? value : "auto";
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

  const existingNames = new Set(
    snapshot.project.documents
      .filter((document) => document.id !== documentId)
      .map((document) => document.name)
  );
  let finalName = nextName;
  let suffix = 2;

  while (existingNames.has(finalName)) {
    finalName = `${nextName}-${suffix}`;
    suffix += 1;
  }

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

  const existingNames = new Set(
    snapshot.project.folders.filter((folder) => folder.id !== folderId).map((folder) => folder.name)
  );
  let finalName = nextName;
  let suffix = 2;

  while (existingNames.has(finalName)) {
    finalName = `${nextName}-${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      folders: snapshot.project.folders.map((folder) =>
        folder.id === folderId ? { ...folder, name: finalName, updatedAt: now } : folder
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
    path === targetFolder.name || path.startsWith(`${targetFolder.name}/`)
      ? `${finalFolderPath}${path.slice(targetFolder.name.length)}`
      : path;

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

export function renameGraphById(snapshot: AppSnapshot, graphId: string, name: string): AppSnapshot {
  const currentGraph = snapshot.project.graph ?? createDefaultGraph();
  const nextName = normalizeGraphFileNameForContentType(name, currentGraph.contentType);
  const graphs = snapshot.project.graphs ?? [];
  const targetGraph = graphs.find((graph) => graph.id === graphId) ?? null;
  const targetName = currentGraph.id === graphId ? currentGraph.name : targetGraph?.name ?? "";

  if (!targetName || nextName === targetName) {
    return snapshot;
  }

  const existingNames = new Set(graphs.filter((graph) => graph.id !== graphId).map((graph) => graph.name));
  if (currentGraph.id !== graphId) {
    existingNames.add(currentGraph.name);
  }

  let finalName = nextName;
  let suffix = 2;
  while (existingNames.has(finalName)) {
    const baseName = nextName.replace(/\.(png|svg|typ)$/i, "");
    finalName = `${baseName}-${suffix}.${currentGraph.contentType}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  const nextGraph = {
    ...currentGraph,
    name: currentGraph.id === graphId ? finalName : currentGraph.name,
    updatedAt: currentGraph.id === graphId ? now : currentGraph.updatedAt
  };
  const nextGraphs = graphs.map((graph) =>
    graph.id === graphId ? { ...graph, name: finalName, updatedAt: now } : graph
  );

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      graph: nextGraph,
      graphs: nextGraphs,
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

export function moveGraphToTrash(snapshot: AppSnapshot, graphId: string): AppSnapshot {
  const graphs = snapshot.project.graphs ?? [];
  const targetGraph = graphs.find((graph) => graph.id === graphId);

  if (!targetGraph) {
    return snapshot;
  }

  const now = new Date().toISOString();
  const currentGraph = snapshot.project.graph ?? createDefaultGraph(snapshot.preferences.graphProvider);
  const nextGraph =
    currentGraph.id === graphId
      ? {
          ...createDefaultGraph(snapshot.preferences.graphProvider),
          updatedAt: now
        }
      : currentGraph;

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      graph: nextGraph,
      graphs: graphs.filter((graph) => graph.id !== graphId),
      trash: [
        ...snapshot.project.trash,
        {
          id: createId("trash"),
          kind: "graph",
          deletedAt: now,
          originalPath: getGraphFilePath(targetGraph.name),
          graph: targetGraph
        }
      ],
      updatedAt: now
    }
  };
}

export function moveGraphToFolder(
  snapshot: AppSnapshot,
  graphId: string,
  destinationFolderPath: string | null
): AppSnapshot {
  const graphs = snapshot.project.graphs ?? [];
  const targetGraph = graphs.find((graph) => graph.id === graphId);

  if (!targetGraph) {
    return snapshot;
  }

  const nextName = createMovedGraphName(
    targetGraph.name,
    destinationFolderPath,
    graphs,
    graphId,
    targetGraph.contentType
  );

  if (nextName === targetGraph.name) {
    return snapshot;
  }

  const now = new Date().toISOString();
  const currentGraph = snapshot.project.graph ?? createDefaultGraph(snapshot.preferences.graphProvider);

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      graph:
        currentGraph.id === graphId
          ? { ...currentGraph, name: nextName, updatedAt: now }
          : currentGraph,
      graphs: graphs.map((graph) =>
        graph.id === graphId ? { ...graph, name: nextName, updatedAt: now } : graph
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

  const requestedPath = stripFiguresWorkspacePath(targetEntry.originalPath);
  const restoredGraph = {
    ...targetEntry.graph,
    id: createId("graph"),
    name: createUniqueGraphName(
      requestedPath,
      snapshot.project.graphs,
      snapshot.project.graph?.id === targetEntry.graph.id ? snapshot.project.graph.name : null,
      targetEntry.graph.contentType
    ),
    updatedAt: now
  };

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      graphs: [...snapshot.project.graphs, restoredGraph],
      trash: remainingTrash,
      updatedAt: now
    }
  };
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

export function updateGraph(
  snapshot: AppSnapshot,
  update: (graph: GraphAsset) => GraphAsset
): AppSnapshot {
  const now = new Date().toISOString();
  const nextGraph = update(snapshot.project.graph ?? createDefaultGraph());

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      graph: {
        ...nextGraph,
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

export function saveCurrentGraph(snapshot: AppSnapshot): AppSnapshot {
  const now = new Date().toISOString();
  const graph = normalizeGraphAsset(snapshot.project.graph ?? createDefaultGraph());
  const graphs = snapshot.project.graphs ?? [];
  const existingIndex = graphs.findIndex((figure) => figure.id === graph.id);
  const nextGraphs =
    existingIndex >= 0
      ? graphs.map((figure, index) => (index === existingIndex ? graph : figure))
      : [...graphs, graph];

  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      graph: {
        ...graph,
        updatedAt: now
      },
      graphs: nextGraphs,
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

export function createNextGraphSnapshot(
  snapshot: AppSnapshot,
  provider: GraphProvider = snapshot.preferences.graphProvider
): AppSnapshot {
  const now = new Date().toISOString();
  const savedSnapshot = saveCurrentGraph(snapshot);
  const currentGraph = savedSnapshot.project.graph;
  const nextName = createNextGraphName(currentGraph.name, provider);

  return {
    ...savedSnapshot,
    project: {
      ...savedSnapshot.project,
      graph: {
        ...createDefaultGraph(provider),
        name: nextName,
        renderMode: currentGraph.renderMode,
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

function createNextGraphName(currentName: string, provider: GraphProvider): string {
  const baseName = normalizeGraphFileName(currentName, provider).replace(/\.(png|svg|typ)$/i, "");
  const match = /^graph(?:\s+(\d+))?$/i.exec(baseName);
  const nextIndex = match ? Number(match[1] ?? "1") + 1 : 1;
  return `graph ${nextIndex}.typ`;
}

function normalizeWorkspaceFolderPath(path: string | null): string | null {
  const normalized = path?.split("/").map((segment) => segment.trim()).filter(Boolean).join("/") ?? "";
  return normalized || null;
}

function joinWorkspacePath(folderPath: string | null, name: string): string {
  const normalizedFolderPath = normalizeWorkspaceFolderPath(folderPath);
  return normalizedFolderPath ? `${normalizedFolderPath}/${name}` : name;
}

function stripFiguresWorkspacePath(path: string): string {
  const normalizedPath = normalizeWorkspaceFolderPath(path) ?? "";

  if (normalizedPath === "figures") {
    return "";
  }

  if (normalizedPath.startsWith("figures/")) {
    return normalizedPath.slice("figures/".length);
  }

  return normalizedPath;
}

function getWorkspaceBaseName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function getWorkspaceParentPath(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments.length > 0 ? segments.join("/") : null;
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

function createMovedGraphName(
  currentName: string,
  destinationFolderPath: string | null,
  graphs: GraphAsset[],
  graphId: string,
  contentType: "typ"
): string {
  const baseName = getWorkspaceBaseName(currentName);
  const requestedName = joinWorkspacePath(destinationFolderPath, baseName);
  const existingGraphs = graphs.filter((graph) => graph.id !== graphId);
  return createUniqueGraphName(requestedName, existingGraphs, null, contentType);
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

function createUniqueGraphName(
  requestedName: string,
  graphs: GraphAsset[],
  currentGraphName: string | null = null,
  contentType: "typ" = "typ"
): string {
  const nextName = normalizeGraphFileNameForContentType(requestedName, contentType);
  const existingNames = new Set(graphs.map((graph) => graph.name));

  if (currentGraphName) {
    existingNames.add(currentGraphName);
  }

  let finalName = nextName;
  let suffix = 2;

  while (existingNames.has(finalName)) {
    const baseName = nextName.replace(/\.(png|svg|typ)$/i, "");
    finalName = `${baseName}-${suffix}.${contentType}`;
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

export function updateGraphProviderPreference(
  snapshot: AppSnapshot,
  graphProvider: GraphProvider
): AppSnapshot {
  return {
    ...snapshot,
    preferences: {
      ...snapshot.preferences,
      graphProvider: normalizeGraphProvider(graphProvider)
    }
  };
}
