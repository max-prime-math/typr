import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import {
  createDefaultSnapshot,
  DEFAULT_EDITOR_FONT_SIZE,
  createDocument,
  createDocumentFromFile,
  createDefaultDiagram,
  createDefaultGraph,
  createFolder,
  createNextGraphSnapshot,
  type DiagramAsset,
  type DiagramCanvasFrame,
  type DiagramEndpoint,
  type DiagramShape,
  type DiagramStroke,
  type DiagramStrokeStyle,
  type GraphAsset,
  getActiveDocument,
  normalizeSnapshot,
  renameActiveDocument,
  renameProject,
  setActiveDocument,
  saveCurrentDiagram,
  saveCurrentGraph,
  createNextDiagramSnapshot,
  emptyTrash,
  moveDiagramToTrash,
  moveDiagramToFolder,
  moveDocumentToTrash,
  moveDocumentToFolder,
  moveFolderToTrash,
  moveFolderToFolder,
  moveGraphToTrash,
  moveGraphToFolder,
  permanentlyDeleteTrashEntry,
  removeLatestDiagramItem,
  removeDiagramStroke,
  removeDiagramShape,
  renameDiagramById,
  renameDocumentById,
  renameFolderById,
  renameGraphById,
  restoreTrashEntry,
  updateGraph,
  updateDiagram,
  updateActiveDocument,
  updateCursorSmearPreference,
  updateCursorSmoothPreference,
  updateEditorFontSizePreference,
  updateKeybindingsPreference,
  updateLiveCompilationPreference,
  updateRelativeLineNumbersPreference,
  updateThemePreference,
  updateVimPreference,
  type AppSnapshot,
  type ThemePreference
} from "./appState";
import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_DEFINITIONS,
  findKeybindingConflicts,
  formatKeybinding,
  keybindingFromKeyboardEvent,
  matchesKeybinding,
  type KeybindingCommandId
} from "./keybindings";
import {
  createTypstCompiler,
  type CompilerStatus,
  type CompileResult
} from "../compiler/typstCompiler";
import type { CompileAssetFile } from "../compiler/types";
import { exportTypstPdf } from "../compiler/typstRuntime";
import {
  clearTypstPackageCache,
  ensureTypstPackageReferences,
  getTypstPackageCacheSummary,
  removeTypstPackageFromCache,
  type TypstPackageCacheEntry
} from "../compiler/typstPackageRegistry";
import {
  getLatestTypstUniversePackageVersion,
  searchTypstUniversePackages,
  type TypstUniversePackageEntry
} from "../compiler/typstPackageRepository";
import {
  TypstEditor,
  type TypstEditorHandle,
  type TypstSearchQueryState
} from "../editor/TypstEditor";
import {
  createEmptyGitHubRemoteConfig,
  getDefaultGitHubDirectory,
  hasRequiredConfig,
  pushProjectToGitHub,
  pullProjectFromGitHub,
  type GitHubRemoteConfig,
  type GitHubSyncDocument
} from "../github/githubSync";
import {
  detectConflicts,
  applyResolutions,
  buildSyncSnapshot,
  type ConflictSet,
  type ConflictResolution,
  type DocumentConflict
} from "../github/conflict";
import { ConflictModal } from "../github/ConflictModal";
import {
  PreviewPane,
  PreviewDebugPanel,
  PreviewStatusIcon,
  type WorkspacePreviewFile
} from "../preview/PreviewPane";
import {
  DiagramEditor,
  DiagramEditorErrorBoundary,
  serializeDiagramSvg
} from "../diagram/DiagramEditor";
import {
  GraphEditor,
  GraphEditorErrorBoundary
} from "../graph/GraphEditor";
import {
  buildGraphDownloadBlob,
  buildGraphDownloadFilename,
  buildGraphInsertResult,
  buildGraphTypstFigure
} from "../graph/graphExport";
import {
  getDiagramCompilerPath,
  getDiagramFilePath,
  normalizeDiagramFileName
} from "../diagram/diagramFiles";
import {
  getGraphCompilerPath,
  getGraphFilePath,
  normalizeGraphFileNameForContentType
} from "../graph/graphFiles";
import { AUTO_THEME_ID, THEME_IMPORT_TEMPLATE } from "../theme/themes";
import {
  DEFAULT_ZOOM,
  nextZoomStep,
  type PreviewZoomState
} from "../preview/PreviewPane";
import packageJson from "../../package.json";
import {
  loadGitHubConfig,
  loadSnapshot,
  loadCustomSnippets,
  saveGitHubConfig,
  saveSnapshot,
  saveCustomSnippets
} from "../storage/indexedDbStorage";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeDefinition } from "../theme/themes";
import {
  DEFAULT_TYPST_SNIPPETS,
  mergeSnippets,
  parseSnippetImport,
  SNIPPET_IMPORT_TEMPLATE,
  type TypstSnippet
} from "../snippets/snippets";
import { PreviewZoomControls } from "../preview/PreviewPane";
import {
  syncSnapshotToOpfs,
  isOpfsAvailable,
  readWorkspaceFileFromOpfs
} from "../workspace/opfsWorkspace";
import { WorkspaceTree, WORKSPACE_ROOT_PATH } from "../workspace/WorkspaceTree";
import {
  buildProjectWorkspaceEntries,
  buildTrashWorkspaceEntries,
  buildWorkspaceTree,
  canMoveWorkspaceNode,
  flattenVisibleWorkspaceNodes,
  findWorkspaceNodeByPath,
  getWorkspacePathExtension,
  normalizeWorkspacePath,
  isTextWorkspaceFile,
  type WorkspaceTreeNode
} from "../workspace/workspaceTree";

const COMPILE_DEBOUNCE_MS = 60;
const SAVE_DEBOUNCE_MS = 250;
const MENU_CLOSE_DELAY_MS = 140;
const MOVE_HOVER_EXPAND_DELAY_MS = 1000;
const PANEL_LAYOUT_STORAGE_KEY = "typr.panel-layout";
const PANEL_LAYOUT_VERSION = 5;
const MOBILE_WORKSPACE_THRESHOLD = 1080;
const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 460;
const PREVIEW_MIN_WIDTH = 320;
const PANEL_COLLAPSED_WIDTH = 56;
const PANEL_HANDLE_WIDTH = 8;
const SYNC_SNAPSHOT_KEY = "typr.sync-snapshot";
const EDITOR_MIN_WIDTH = 420;
const THEME_TEMPLATE_FILENAME = "typr-theme-template.json";
const SNIPPET_TEMPLATE_FILENAME = "typr-snippets.json";
const APP_VERSION = packageJson.version;
const PREVIEW_POPUP_STORAGE_KEY = "typr.preview-popup";
const SOURCE_TOOLBAR_STORAGE_KEY = "typr.source-toolbar";

function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function getWorkspacePreviewMimeType(path: string): string | null {
  switch (getWorkspacePathExtension(path)) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}

interface SourceSymbolItem {
  label: string;
  template: string;
  glyph: string;
}

const SOURCE_SYMBOL_ITEMS: SourceSymbolItem[] = [
  { label: "Limit", glyph: "lim", template: "lim_(${1:x} -> ${2:3})" },
  { label: "Integral", glyph: "∫", template: "integral_(${1:a})^(${2:b}) ${3:f(x)} dif ${4:x}" },
  { label: "Sum", glyph: "∑", template: "sum_(${1:n=1})^(${2:oo}) ${3:a_n}" },
  { label: "Arrow right", glyph: "→", template: "#sym.arrow.r" },
  { label: "Arrow left", glyph: "←", template: "#sym.arrow.l" },
  { label: "Arrow both", glyph: "↔", template: "#sym.arrow.l.r" },
  { label: "Double arrow", glyph: "⇒", template: "#sym.arrow.r.double" },
  { label: "Check", glyph: "✓", template: "#sym.ballot.check" },
  { label: "Cross", glyph: "✕", template: "#sym.ballot.cross" },
  { label: "Alpha", glyph: "α", template: "#sym.alpha" },
  { label: "Beta", glyph: "β", template: "#sym.beta" },
  { label: "Gamma", glyph: "γ", template: "#sym.gamma" },
  { label: "Pi", glyph: "π", template: "#sym.pi" },
  { label: "Infinity", glyph: "∞", template: "#sym.infinity" },
  { label: "Plus-minus", glyph: "±", template: "#sym.plus.minus" },
  { label: "Star", glyph: "★", template: "#sym.star.filled" },
  { label: "Subset", glyph: "⊂", template: "#sym.subset" },
  { label: "Superset", glyph: "⊃", template: "#sym.supset" }
];

const SIDEBAR_TOOLS: Array<{ id: SidebarTool; label: string }> = [
  { id: "files", label: "Files" },
  { id: "search", label: "Search" },
  { id: "outline", label: "Outline" },
  { id: "diagram", label: "Diagram" },
  { id: "graph", label: "Graph" },
  { id: "sync", label: "Sync" },
  { id: "debug", label: "Debug" }
];

interface SourceSymbolTooltipState {
  item: SourceSymbolItem;
  x: number;
  y: number;
}

type WorkspaceContextMenuState =
  | {
      kind: "project-root";
      x: number;
      y: number;
    }
  | {
      kind: "node";
      node: WorkspaceTreeNode;
      x: number;
      y: number;
    };

const MENU_ITEMS = ["Typr", "File", "Edit", "View", "Help"] as const;
type MenuLabel = (typeof MENU_ITEMS)[number];
type WorkspaceMode = "split" | "sidebar" | "editor" | "preview";
type MobileWorkspaceTab = "files" | "editor" | "preview";
type SidebarTool = "files" | "search" | "outline" | "sync" | "debug" | "diagram" | "graph";
type DiagramPaneMode = "sidebar" | "source" | "preview";
type GraphPaneMode = "sidebar" | "source" | "preview";
type SettingsTab = "github" | "themes" | "keybindings" | "snippets" | "packages" | "graphs";
type MatrixDelimiter = "paren" | "bracket" | "brace" | "bar" | "angle" | "none";
type TableAlignment = "left" | "center" | "right" | "horizon";
type TableGutter = "none" | "small" | "medium";
type TableInset = "none" | "small" | "medium";
type TableStroke = "default" | "none";

interface SyncFeedback {
  tone: "neutral" | "success" | "error";
  text: string;
}

interface StoredPanelLayout {
  version?: number;
  isSidebarCollapsed?: boolean;
  isPreviewCollapsed?: boolean;
  sidebarWidth?: number;
  previewRatio?: number;
}

interface OutlineEntry {
  level: number;
  lineNumber: number;
  title: string;
}

interface OutlineTreeEntry extends OutlineEntry {
  id: string;
  children: OutlineTreeEntry[];
}

interface MatrixSettings {
  rows: number;
  columns: number;
  delimiter: MatrixDelimiter;
}

interface TableSettings {
  rows: number;
  columns: number;
  header: boolean;
  footer: boolean;
  striped: boolean;
  align: TableAlignment;
  gutter: TableGutter;
  inset: TableInset;
  stroke: TableStroke;
}

const MATRIX_ROW_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const MATRIX_COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const MATRIX_DELIMITER_OPTIONS: Array<{
  id: MatrixDelimiter;
  label: string;
  delim: string;
}> = [
  { id: "paren", label: "()", delim: "(" },
  { id: "bracket", label: "[]", delim: "[" },
  { id: "brace", label: "{}", delim: "{" },
  { id: "bar", label: "||", delim: "|" },
  { id: "angle", label: "<>", delim: "<" },
  { id: "none", label: "None", delim: "" }
];

const TABLE_ROW_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TABLE_COLUMN_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const TABLE_ALIGNMENT_OPTIONS: Array<{ id: TableAlignment; label: string }> = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" },
  { id: "horizon", label: "Horizon" }
];
const TABLE_GUTTER_OPTIONS: Array<{ id: TableGutter; label: string; value: string }> = [
  { id: "none", label: "None", value: "0pt" },
  { id: "small", label: "Small", value: "0.2em" },
  { id: "medium", label: "Medium", value: "0.45em" }
];
const TABLE_INSET_OPTIONS: Array<{ id: TableInset; label: string; value: string }> = [
  { id: "none", label: "None", value: "0pt" },
  { id: "small", label: "Small", value: "0.15em" },
  { id: "medium", label: "Medium", value: "0.35em" }
];

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredPanelLayout(): StoredPanelLayout | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return JSON.parse(stored) as StoredPanelLayout;
  } catch {
    return null;
  }
}

function clampPreviewRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getViewportBalancedPreviewRatio() {
  return 0.5;
}

function getPreviewPaneWidth(
  workspaceWidth: number,
  sidebarWidth: number,
  handleWidthTotal: number,
  previewRatio: number
) {
  const availableWidth = Math.max(0, workspaceWidth - sidebarWidth - handleWidthTotal);
  const idealWidth = Math.round(availableWidth * previewRatio);

  return clampPanelWidth(idealWidth, PREVIEW_MIN_WIDTH, availableWidth);
}

function isMobileWorkspaceViewport(width: number) {
  return width > 0 && width <= MOBILE_WORKSPACE_THRESHOLD;
}

function getWorkspaceParentPath(path: string): string | null {
  const segments = normalizeWorkspacePath(path).split("/").filter(Boolean);
  segments.pop();
  return segments.length > 0 ? segments.join("/") : null;
}

function getWorkspaceBaseName(path: string): string {
  return normalizeWorkspacePath(path).split("/").filter(Boolean).at(-1) ?? path;
}

function joinWorkspacePath(path: string | null, name: string): string {
  const normalizedPath = normalizeWorkspacePath(path ?? "");
  return normalizedPath ? `${normalizedPath}/${name}` : name;
}

function getWorkspaceMovePromptLabel(node: WorkspaceTreeNode): string {
  if (node.source.kind === "diagram" || node.source.kind === "graph") {
    return "Move to folder inside figures (blank for figures root)";
  }

  return "Move to folder (blank for root)";
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function clampTooltipPosition(x: number, y: number) {
  const offset = 16;
  const width = 240;
  const height = 88;

  return {
    x: Math.max(12, Math.min(x + offset, window.innerWidth - width - 12)),
    y: Math.max(12, Math.min(y + offset, window.innerHeight - height - 12))
  };
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildDiagramShadowFiles(diagrams: DiagramAsset[]): CompileAssetFile[] {
  const assets = new Map<string, CompileAssetFile>();

  for (const diagram of diagrams) {
    const path = getDiagramCompilerPath(diagram.name);
    assets.set(path, {
      path,
      content: new TextEncoder().encode(serializeDiagramSvg(diagram))
    });
  }

  return [...assets.values()];
}

function buildGraphShadowFiles(graphs: GraphAsset[]): CompileAssetFile[] {
  const assets = new Map<string, CompileAssetFile>();

  for (const graph of graphs) {
    const path = getGraphCompilerPath(graph.name);
    if (graph.content.length === 0) {
      continue;
    }

    assets.set(path, {
      path,
      content: graph.content
    });
  }

  return [...assets.values()];
}

export function App() {
  const [storedPanelLayout] = useState(readStoredPanelLayout);
  const menuStripRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<TypstEditorHandle | null>(null);
  const shouldFocusEditorAfterVimToggleRef = useRef(false);
  const themeImportInputRef = useRef<HTMLInputElement | null>(null);
  const snippetImportInputRef = useRef<HTMLInputElement | null>(null);
  const documentUploadInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filesSectionRef = useRef<HTMLElement | null>(null);
  const openMenuTimerRef = useRef<number | null>(null);
  const closeMenuTimerRef = useRef<number | null>(null);
  const compileTimerRef = useRef<number | null>(null);
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const panelResizeRef = useRef<{
    edge: "sidebar" | "preview";
    startX: number;
    startWidth: number;
  } | null>(null);
  const compileRequestRef = useRef(0);
  const pendingSourceRef = useRef("");
  const previewSourceDraftRef = useRef("");
  const diagramAssetsRevisionRef = useRef("");
  const diagramAssetsRef = useRef<CompileAssetFile[]>([]);
  const graphAssetsRevisionRef = useRef("");
  const graphAssetsRef = useRef<CompileAssetFile[]>([]);
  const themeRef = useRef<ThemeDefinition | null>(null);
  const compileResultRef = useRef<CompileResult | null>(null);
  const handleCompileRef = useRef<() => void>(() => {});
  const compileInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const [activeMenu, setActiveMenu] = useState<MenuLabel | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("github");
  const [activeSidebarTool, setActiveSidebarTool] = useState<SidebarTool>("files");
  const [searchQuery, setSearchQuery] = useState<TypstSearchQueryState>({
    search: "",
    replace: "",
    caseSensitive: false,
    regexp: false,
    wholeWord: false
  });
  const [matrixSettings, setMatrixSettings] = useState<MatrixSettings>({
    rows: 2,
    columns: 2,
    delimiter: "paren"
  });
  const [tableSettings, setTableSettings] = useState<TableSettings>({
    rows: 3,
    columns: 3,
    header: true,
    footer: false,
    striped: true,
    align: "left",
    gutter: "small",
    inset: "small",
    stroke: "default"
  });
  const [openToolbarMenu, setOpenToolbarMenu] = useState<"matrix" | "table" | null>(null);
  const [themeImportFeedback, setThemeImportFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [isPreviewPopupOpen, setIsPreviewPopupOpen] = useState(false);
  const [diagramPaneMode, setDiagramPaneMode] = useState<DiagramPaneMode>("sidebar");
  const [graphPaneMode, setGraphPaneMode] = useState<GraphPaneMode>("sidebar");
  const [isPreviewDebugVisible, setIsPreviewDebugVisible] = useState(false);
  const [isSourceToolbarVisible, setIsSourceToolbarVisible] = useState(true);
  const [isPaperView, setIsPaperView] = useState(false);
  const [recordingKeybindingId, setRecordingKeybindingId] =
    useState<KeybindingCommandId | null>(null);
  const [diagramInkColor, setDiagramInkColor] = useState("#000000");
  const [diagramFillColor, setDiagramFillColor] = useState("transparent");
  const [diagramStrokeStyle, setDiagramStrokeStyle] = useState<DiagramStrokeStyle>("solid");
  const [diagramStrokeWidth, setDiagramStrokeWidth] = useState(2.5);
  const [diagramStartMarker, setDiagramStartMarker] = useState<DiagramEndpoint>("none");
  const [diagramEndMarker, setDiagramEndMarker] = useState<DiagramEndpoint>("none");
  const [collapsedFileFolders, setCollapsedFileFolders] = useState<Record<string, boolean>>({});
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([]);
  const [isTrashViewOpen, setIsTrashViewOpen] = useState(false);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null);
  const [selectedWorkspacePaths, setSelectedWorkspacePaths] = useState<string[]>([]);
  const [workspaceSelectionAnchorPath, setWorkspaceSelectionAnchorPath] = useState<string | null>(null);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<WorkspaceContextMenuState | null>(null);
  const [renamingWorkspacePath, setRenamingWorkspacePath] = useState<string | null>(null);
  const [workspaceRenameDraft, setWorkspaceRenameDraft] = useState("");
  const [draggedWorkspacePath, setDraggedWorkspacePath] = useState<string | null>(null);
  const [workspaceDropTargetPath, setWorkspaceDropTargetPath] = useState<string | null>(null);
  const [hoveredSourceSymbol, setHoveredSourceSymbol] = useState<SourceSymbolTooltipState | null>(
    null
  );
  const [collapsedOutlineEntries, setCollapsedOutlineEntries] = useState<Record<string, boolean>>(
    {}
  );
  const [currentEditorLineNumber, setCurrentEditorLineNumber] = useState(1);
  const [previewZoom, setPreviewZoom] = useState<PreviewZoomState>(DEFAULT_ZOOM);
  const [customSnippets, setCustomSnippets] = useState<TypstSnippet[]>([]);
  const [snippetImportText, setSnippetImportText] = useState(
    JSON.stringify(SNIPPET_IMPORT_TEMPLATE, null, 2)
  );
  const [snippetImportFeedback, setSnippetImportFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [packageCacheEntries, setPackageCacheEntries] = useState<TypstPackageCacheEntry[]>([]);
  const [packageCacheTotalBytes, setPackageCacheTotalBytes] = useState(0);
  const [isPackageCacheLoading, setIsPackageCacheLoading] = useState(false);
  const [isPackageCacheClearing, setIsPackageCacheClearing] = useState(false);
  const [packageCacheFeedback, setPackageCacheFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [packageSearchQuery, setPackageSearchQuery] = useState("");
  const [packageSearchResults, setPackageSearchResults] = useState<TypstUniversePackageEntry[]>([]);
  const [isPackageSearchLoading, setIsPackageSearchLoading] = useState(false);
  const [installingPackageName, setInstallingPackageName] = useState<string | null>(null);
  const [packageSearchVisibleCount, setPackageSearchVisibleCount] = useState(5);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("split");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => storedPanelLayout?.version === PANEL_LAYOUT_VERSION && storedPanelLayout.isSidebarCollapsed
      ? storedPanelLayout.isSidebarCollapsed
      : false
  );
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(
    () => storedPanelLayout?.version === PANEL_LAYOUT_VERSION && storedPanelLayout.isPreviewCollapsed
      ? storedPanelLayout.isPreviewCollapsed
      : false
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    () =>
      storedPanelLayout?.version === PANEL_LAYOUT_VERSION &&
      typeof storedPanelLayout.sidebarWidth === "number"
        ? clampPanelWidth(storedPanelLayout.sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
        : SIDEBAR_DEFAULT_WIDTH
  );
  const [previewRatio, setPreviewRatio] = useState(
    () =>
      storedPanelLayout?.version === PANEL_LAYOUT_VERSION &&
      typeof storedPanelLayout.previewRatio === "number"
        ? clampPreviewRatio(storedPanelLayout.previewRatio)
        : getViewportBalancedPreviewRatio()
  );
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<MobileWorkspaceTab>("editor");
  const [compilerStatus, setCompilerStatus] = useState<CompilerStatus>({
    phase: "idle",
    mode: "worker",
    label: "Waiting to compile"
  });
  const symbolHoverTimerRef = useRef<number | null>(null);
  const workspaceHoverExpandTimerRef = useRef<number | null>(null);
  const symbolHoverItemRef = useRef<SourceSymbolItem | null>(null);
  const symbolHoverPointRef = useRef({ x: 0, y: 0 });
  const compiler = useMemo(
    () =>
      createTypstCompiler({
        onStatusChange: setCompilerStatus
      }),
    []
  );
  const [snapshot, setSnapshot] = useState<AppSnapshot>(createDefaultSnapshot);
  const [githubConfig, setGitHubConfig] = useState<GitHubRemoteConfig>(
    createEmptyGitHubRemoteConfig
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<
    Extract<CompileResult, { ok: true }> | null
  >(null);
  const [isErrorSettled, setIsErrorSettled] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [storageStatus, setStorageStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: "Documents stay on this device. Pull, push, or sync with GitHub when you are online."
  });
  const [conflictSet, setConflictSet] = useState<ConflictSet | null>(null);
  const [pendingRemoteDocuments, setPendingRemoteDocuments] = useState<GitHubSyncDocument[] | null>(null);
  const [pendingRemoteProjectName, setPendingRemoteProjectName] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const isAppleShortcutPlatform = isApplePlatform();
  const keybindings = snapshot.preferences.keybindings;
  const compileShortcutLabel = formatKeybinding(
    keybindings.compile,
    isAppleShortcutPlatform
  );
  const vimToggleShortcutLabel = formatKeybinding(
    keybindings.toggleVim,
    isAppleShortcutPlatform
  );
  const handleVimToggle = useCallback(() => {
    setSnapshot((currentSnapshot) => {
      const nextVimMode = !currentSnapshot.preferences.vimMode;
      shouldFocusEditorAfterVimToggleRef.current = nextVimMode;
      return updateVimPreference(currentSnapshot, nextVimMode);
    });
  }, []);

  const handleCursorSmearChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSnapshot((currentSnapshot) =>
        updateCursorSmearPreference(
          currentSnapshot,
          Number(event.target.value)
        )
      );
    },
    []
  );

  const handleKeybindingChange = useCallback(
    (commandId: KeybindingCommandId, binding: string) => {
      setSnapshot((currentSnapshot) =>
        updateKeybindingsPreference(currentSnapshot, {
          ...currentSnapshot.preferences.keybindings,
          [commandId]: binding
        })
      );
    },
    []
  );

  const handleKeybindingReset = useCallback((commandId: KeybindingCommandId) => {
    setSnapshot((currentSnapshot) =>
      updateKeybindingsPreference(currentSnapshot, {
        ...currentSnapshot.preferences.keybindings,
        [commandId]: DEFAULT_KEYBINDINGS[commandId]
      })
    );
    setRecordingKeybindingId(null);
  }, []);

  const handleResetAllKeybindings = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateKeybindingsPreference(currentSnapshot, DEFAULT_KEYBINDINGS)
    );
    setRecordingKeybindingId(null);
  }, []);

  const setEditorFontSize = useCallback((editorFontSize: number) => {
    setSnapshot((currentSnapshot) =>
      updateEditorFontSizePreference(currentSnapshot, editorFontSize)
    );
  }, []);

  const handleCursorSmoothToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateCursorSmoothPreference(
        currentSnapshot,
        !currentSnapshot.preferences.cursorSmooth
      )
    );
  }, []);
  const handleLiveCompilationToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateLiveCompilationPreference(
        currentSnapshot,
        !currentSnapshot.preferences.liveCompilation
      )
    );
  }, []);
  const handleRelativeLineNumbersToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateRelativeLineNumbersPreference(
        currentSnapshot,
        !currentSnapshot.preferences.relativeLineNumbers
      )
    );
  }, []);
  const togglePreviewDebug = useCallback(() => {
    setIsPreviewDebugVisible((current) => !current);
  }, []);
  const togglePaperView = useCallback(() => {
    setIsPaperView((current) => !current);
  }, []);
  const {
    theme,
    builtinThemes,
    customThemes,
    setTheme,
    importThemeFile,
    removeCustomTheme
  } = useTheme();

  const activeDocument = getActiveDocument(snapshot.project);
  const activeDocumentTextContent =
    typeof activeDocument.content === "string" ? activeDocument.content : "";
  const defaultGitHubDirectory = useMemo(
    () => getDefaultGitHubDirectory(snapshot.project.name),
    [snapshot.project.name]
  );
  const trashWorkspaceTree = useMemo(
    () => buildWorkspaceTree(buildTrashWorkspaceEntries(snapshot.project.trash ?? [])),
    [snapshot.project.trash]
  );
  const visibleWorkspaceTree = isTrashViewOpen ? trashWorkspaceTree : workspaceTree;
  const [inspectedWorkspacePath, setInspectedWorkspacePath] = useState<string | null>(null);
  const normalizedSelectedWorkspacePath = selectedWorkspacePath
    ? normalizeWorkspacePath(selectedWorkspacePath)
    : null;
  const selectedWorkspaceNode = useMemo(
    () =>
      normalizedSelectedWorkspacePath
        ? findWorkspaceNodeByPath(visibleWorkspaceTree, normalizedSelectedWorkspacePath)
        : null,
    [normalizedSelectedWorkspacePath, visibleWorkspaceTree]
  );
  const sourceWorkspaceNode = isTrashViewOpen ? null : selectedWorkspaceNode;
  const inspectedGraph = useMemo(() => {
    if (
      !sourceWorkspaceNode ||
      sourceWorkspaceNode.kind !== "file" ||
      sourceWorkspaceNode.source.kind !== "graph" ||
      normalizeWorkspacePath(sourceWorkspaceNode.path) !== inspectedWorkspacePath
    ) {
      return null;
    }

    return (snapshot.project.graphs ?? []).find(
      (graphAsset) => graphAsset.id === sourceWorkspaceNode.source.id
    ) ?? null;
  }, [inspectedWorkspacePath, snapshot.project.graphs, sourceWorkspaceNode]);
  const inspectedGraphSource = useMemo(
    () => (inspectedGraph ? buildGraphTypstFigure(inspectedGraph) ?? "" : ""),
    [inspectedGraph]
  );
  const isInspectingGraphSource = inspectedGraph !== null;
  const sourceEditorValue = isInspectingGraphSource ? inspectedGraphSource : activeDocumentTextContent;
  const [selectedWorkspacePreview, setSelectedWorkspacePreview] = useState<WorkspacePreviewFile | null>(null);
  useEffect(() => {
    let cancelled = false;

    async function loadWorkspacePreview() {
      if (!sourceWorkspaceNode || sourceWorkspaceNode.kind !== "file") {
        setSelectedWorkspacePreview(null);
        return;
      }

      if (isTextWorkspaceFile(sourceWorkspaceNode.path)) {
        setSelectedWorkspacePreview(null);
        return;
      }

      setSelectedWorkspacePreview(null);

      const mimeType = getWorkspacePreviewMimeType(sourceWorkspaceNode.path);

      if (!mimeType) {
        setSelectedWorkspacePreview(null);
        return;
      }

      if (sourceWorkspaceNode.content instanceof Uint8Array) {
        setSelectedWorkspacePreview({
          name: sourceWorkspaceNode.name,
          path: sourceWorkspaceNode.path,
          content: sourceWorkspaceNode.content,
          mimeType
        });
        return;
      }

      const bytes = await readWorkspaceFileFromOpfs(sourceWorkspaceNode.path);

      if (cancelled) {
        return;
      }

      if (bytes) {
        setSelectedWorkspacePreview({
          name: sourceWorkspaceNode.name,
          path: sourceWorkspaceNode.path,
          content: bytes,
          mimeType
        });
        return;
      }

      setSelectedWorkspacePreview(null);
    }

    void loadWorkspacePreview();

    return () => {
      cancelled = true;
    };
  }, [sourceWorkspaceNode]);
  useEffect(() => {
    if (
      sourceWorkspaceNode &&
      sourceWorkspaceNode.kind === "file" &&
      sourceWorkspaceNode.source.kind === "graph" &&
      normalizeWorkspacePath(sourceWorkspaceNode.path) === inspectedWorkspacePath
    ) {
      return;
    }

    if (inspectedWorkspacePath !== null) {
      setInspectedWorkspacePath(null);
    }
  }, [inspectedWorkspacePath, sourceWorkspaceNode]);
  const workspaceContextMenuPosition = useMemo(() => {
    if (!workspaceContextMenu || !filesSectionRef.current) {
      return null;
    }

    const rect = filesSectionRef.current.getBoundingClientRect();

    return {
      left: workspaceContextMenu.x - rect.left + filesSectionRef.current.scrollLeft,
      top: workspaceContextMenu.y - rect.top + filesSectionRef.current.scrollTop
    };
  }, [workspaceContextMenu]);
  const isSourceFileEditable =
    sourceWorkspaceNode === null ||
    isInspectingGraphSource ||
    (sourceWorkspaceNode.source.kind === "document" && isTextWorkspaceFile(sourceWorkspaceNode.path));
  const showGraphInspectWarning = isInspectingGraphSource;
  const diagram = useMemo(
    () => snapshot.project.diagram ?? createDefaultDiagram(),
    [snapshot.project.diagram]
  );
  const graph = useMemo(
    () => snapshot.project.graph ?? createDefaultGraph(snapshot.preferences.graphProvider),
    [snapshot.preferences.graphProvider, snapshot.project.graph]
  );
  const savedFigures = useMemo(
    () => snapshot.project.figures ?? [],
    [snapshot.project.figures]
  );
  const savedGraphs = useMemo(
    () => snapshot.project.graphs ?? [],
    [snapshot.project.graphs]
  );
  useEffect(() => {
    const normalizedName = normalizeGraphFileNameForContentType(graph.name, graph.contentType);

    if (normalizedName === graph.name) {
      return;
    }

    setSnapshot((currentSnapshot) =>
      updateGraph(currentSnapshot, (currentGraph) => ({
        ...currentGraph,
        name: normalizedName
      }))
    );
  }, [graph.contentType, graph.name]);

  useEffect(() => {
    if (!workspaceContextMenu) {
      return;
    }

    const handlePointerDown = () => {
      setWorkspaceContextMenu(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [workspaceContextMenu]);
  const diagramShadowAssets = useMemo(
    () => buildDiagramShadowFiles([...savedFigures, diagram]),
    [diagram, savedFigures]
  );
  const graphShadowAssets = useMemo(
    () => buildGraphShadowFiles([...savedGraphs, graph]),
    [graph, savedGraphs]
  );
  const diagramAssetsRevision = useMemo(
    () =>
      [diagram, ...savedFigures].map((asset) => `${asset.id}:${asset.updatedAt}`)
        .join("|"),
    [diagram, savedFigures]
  );
  const graphAssetsRevision = useMemo(
    () => [graph, ...savedGraphs].map((asset) => `${asset.id}:${asset.updatedAt}`).join("|"),
    [graph, savedGraphs]
  );

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    compileResultRef.current = compileResult;
  }, [compileResult]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      const loadWorkspace = async () => {
        try {
          if (isOpfsAvailable()) {
            await syncSnapshotToOpfs(snapshot);
          }

          const fallbackTree = buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot));

          if (!cancelled) {
            setWorkspaceTree(fallbackTree);
            setWorkspaceLoadError(null);
          }
        } catch (error) {
          const fallbackTree = buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot));

          if (!cancelled) {
            setWorkspaceTree(fallbackTree);
            setWorkspaceLoadError(
              error instanceof Error ? error.message : "Unable to load workspace explorer."
            );
          }
        }
      };

      void loadWorkspace();
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isHydrated, snapshot]);

  useEffect(() => {
    setSelectedWorkspacePath((currentPath) => {
      if (currentPath && findWorkspaceNodeByPath(visibleWorkspaceTree, currentPath)) {
        return currentPath;
      }

      if (isTrashViewOpen) {
        return null;
      }

      return normalizeWorkspacePath(activeDocument.name);
    });
  }, [activeDocument.name, isTrashViewOpen, visibleWorkspaceTree]);

  useEffect(() => {
    setSelectedWorkspacePaths((currentPaths) => {
      const nextPaths = currentPaths.filter((path) => findWorkspaceNodeByPath(visibleWorkspaceTree, path));

      if (nextPaths.length > 0) {
        return nextPaths;
      }

      if (isTrashViewOpen) {
        return [];
      }

      return [normalizeWorkspacePath(activeDocument.name)];
    });
  }, [activeDocument.name, isTrashViewOpen, visibleWorkspaceTree]);

  useEffect(() => {
    setWorkspaceSelectionAnchorPath((currentPath) => {
      if (currentPath && findWorkspaceNodeByPath(visibleWorkspaceTree, currentPath)) {
        return currentPath;
      }

      if (isTrashViewOpen) {
        return null;
      }

      return normalizeWorkspacePath(activeDocument.name);
    });
  }, [activeDocument.name, isTrashViewOpen, visibleWorkspaceTree]);

  useEffect(() => {
    diagramAssetsRef.current = diagramShadowAssets;
    diagramAssetsRevisionRef.current = diagramAssetsRevision;
  }, [diagramAssetsRevision, diagramShadowAssets]);

  useEffect(() => {
    graphAssetsRef.current = graphShadowAssets;
    graphAssetsRevisionRef.current = graphAssetsRevision;
  }, [graphAssetsRevision, graphShadowAssets]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    handleCompileRef.current();
  }, [diagramAssetsRevision, graphAssetsRevision, isHydrated]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (compileTimerRef.current !== null) {
        window.clearTimeout(compileTimerRef.current);
      }
      if (workspaceHoverExpandTimerRef.current !== null) {
        window.clearTimeout(workspaceHoverExpandTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (symbolHoverTimerRef.current !== null) {
        window.clearTimeout(symbolHoverTimerRef.current);
        symbolHoverTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      compiler.dispose();
    };
  }, [compiler]);

  useEffect(() => {
    return () => {
      panelResizeCleanupRef.current?.();
      panelResizeCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (openMenuTimerRef.current !== null) {
        window.clearTimeout(openMenuTimerRef.current);
      }

      if (closeMenuTimerRef.current !== null) {
        window.clearTimeout(closeMenuTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const workspace = workspaceRef.current;
    if (!workspace || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateWorkspaceWidth = () => {
      const nextWidth = workspace.getBoundingClientRect().width;
      setWorkspaceWidth(nextWidth);
    };

    updateWorkspaceWidth();

    const observer = new ResizeObserver(updateWorkspaceWidth);
    observer.observe(workspace);

    return () => observer.disconnect();
  }, []);

  const cancelPendingMenuClose = useCallback(() => {
    if (closeMenuTimerRef.current !== null) {
      window.clearTimeout(closeMenuTimerRef.current);
      closeMenuTimerRef.current = null;
    }
  }, []);

  const cancelPendingMenuOpen = useCallback(() => {
    if (openMenuTimerRef.current !== null) {
      window.clearTimeout(openMenuTimerRef.current);
      openMenuTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const [storedSnapshot, storedGitHubConfig] = await Promise.all([
        loadSnapshot(),
        loadGitHubConfig()
      ]);
      const storedSnippets = await loadCustomSnippets();

      if (cancelled) {
        return;
      }

      const nextSnapshot = storedSnapshot
        ? normalizeSnapshot(storedSnapshot)
        : createDefaultSnapshot();
      setSnapshot(nextSnapshot);
      setTheme(nextSnapshot.preferences.theme);
      setGitHubConfig(storedGitHubConfig ?? createEmptyGitHubRemoteConfig());
      setCustomSnippets(storedSnippets ?? []);
      setIsHydrated(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [setTheme]);

  const refreshTypstPackageCache = useCallback(async () => {
    setIsPackageCacheLoading(true);

    try {
      const summary = await getTypstPackageCacheSummary();
      setPackageCacheEntries(summary.packages);
      setPackageCacheTotalBytes(summary.totalBytes);
    } catch {
      setPackageCacheFeedback({
        tone: "error",
        text: "Unable to load Typst package cache."
      });
    } finally {
      setIsPackageCacheLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSettingsOpen || settingsTab !== "packages") {
      return;
    }

    void refreshTypstPackageCache();
  }, [isSettingsOpen, refreshTypstPackageCache, settingsTab]);

  useEffect(() => {
    if (!isSettingsOpen || settingsTab !== "packages") {
      return;
    }

    const normalizedQuery = packageSearchQuery.trim();

    if (!isOnline) {
      setPackageSearchResults([]);
      setIsPackageSearchLoading(false);
      return;
    }

    if (!normalizedQuery) {
      setPackageSearchResults([]);
      setIsPackageSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsPackageSearchLoading(true);

      void searchTypstUniversePackages(normalizedQuery)
        .then((entries) => {
          if (cancelled) {
            return;
          }

          setPackageSearchResults(entries);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setPackageCacheFeedback({
            tone: "error",
            text: "Unable to search Typst Universe right now."
          });
        })
        .finally(() => {
          if (!cancelled) {
            setIsPackageSearchLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOnline, isSettingsOpen, packageSearchQuery, settingsTab]);

  useEffect(() => {
    setPackageSearchVisibleCount(5);
  }, [packageSearchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedPopup = window.localStorage.getItem(PREVIEW_POPUP_STORAGE_KEY);
    setIsPreviewPopupOpen(storedPopup === "true");

    const storedToolbar = window.localStorage.getItem(SOURCE_TOOLBAR_STORAGE_KEY);
    setIsSourceToolbarVisible(storedToolbar !== "false");
  }, []);

  useEffect(() => {
    if (!isMobileWorkspaceViewport(workspaceWidth)) {
      return;
    }

    if (workspaceMode === "sidebar") {
      setMobileWorkspaceTab("files");
      return;
    }

    if (workspaceMode === "preview") {
      setMobileWorkspaceTab("preview");
      return;
    }

    if (workspaceMode === "editor") {
      setMobileWorkspaceTab("editor");
    }
  }, [workspaceMode, workspaceWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: PANEL_LAYOUT_VERSION,
        isSidebarCollapsed,
        isPreviewCollapsed,
        sidebarWidth,
        previewRatio
      })
    );
  }, [isPreviewCollapsed, isSidebarCollapsed, previewRatio, sidebarWidth]);

  const runAppKeybindingCommand = useCallback(
    (commandId: KeybindingCommandId): boolean => {
      switch (commandId) {
        case "compile":
          handleCompileRef.current();
          return true;
        case "toggleVim":
          handleVimToggle();
          return true;
        case "openSearch":
          setActiveSidebarTool("search");
          setIsSidebarCollapsed(false);
          if (workspaceMode === "editor" || workspaceMode === "preview") {
            setWorkspaceMode("split");
          }
          return true;
        case "toggleSidebar":
          handlePanelToggle("sidebar");
          return true;
        case "togglePreview":
          handlePanelToggle("preview");
          return true;
        case "resetPanels":
          resetPanelWidths();
          return true;
        case "showSidebarOnly":
          setFullscreenMode("sidebar");
          return true;
        case "showEditorOnly":
          setFullscreenMode("editor");
          return true;
        case "showPreviewOnly":
          setFullscreenMode("preview");
          return true;
        case "showSplit":
          setFullscreenMode("split");
          return true;
        case "previousSidebarTool":
          cycleSidebarTool(-1);
          return true;
        case "nextSidebarTool":
          cycleSidebarTool(1);
          return true;
        case "increaseEditorFont":
          setEditorFontSize(snapshot.preferences.editorFontSize + 1);
          return true;
        case "decreaseEditorFont":
          setEditorFontSize(snapshot.preferences.editorFontSize - 1);
          return true;
        case "resetEditorFont":
          setEditorFontSize(DEFAULT_EDITOR_FONT_SIZE);
          return true;
        case "increasePreviewZoom":
          setPreviewZoom((current) => nextZoomStep(current, 1));
          return true;
        case "decreasePreviewZoom":
          setPreviewZoom((current) => nextZoomStep(current, -1));
          return true;
        case "resetPreviewZoom":
          setPreviewZoom(DEFAULT_ZOOM);
          return true;
        default:
          return false;
      }
    },
    [
      handleVimToggle,
      setEditorFontSize,
      snapshot.preferences.editorFontSize,
      workspaceMode
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuStripRef.current?.contains(event.target as Node)) {
        cancelPendingMenuClose();
        cancelPendingMenuOpen();
        setActiveMenu(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (recordingKeybindingId) {
        return;
      }

      if (event.key === "Escape") {
        cancelPendingMenuClose();
        cancelPendingMenuOpen();
        setActiveMenu(null);
        setIsSettingsOpen(false);
        setDiagramPaneMode("sidebar");
        setGraphPaneMode("sidebar");
        setWorkspaceMode("split");
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      for (const definition of KEYBINDING_DEFINITIONS) {
        if (
          matchesKeybinding(
            event,
            snapshot.preferences.keybindings[definition.id],
            isAppleShortcutPlatform
          ) &&
          runAppKeybindingCommand(definition.id)
        ) {
          event.preventDefault();
          return;
        }
      }
    }

    function updateOnlineStatus() {
      setIsOnline(window.navigator.onLine);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [
    cancelPendingMenuClose,
    cancelPendingMenuOpen,
    isAppleShortcutPlatform,
    recordingKeybindingId,
    runAppKeybindingCommand,
    snapshot.preferences.keybindings
  ]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      setStorageStatus("saving");
      saveSnapshot(snapshot)
        .then(() => setStorageStatus("saved"))
        .catch(() => setStorageStatus("error"));
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [isHydrated, snapshot]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      void saveGitHubConfig(githubConfig).catch(() => {
        setSyncFeedback({
          tone: "error",
          text: "Unable to save GitHub sync settings locally."
        });
      });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [githubConfig, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      void saveCustomSnippets(customSnippets).catch(() => {
        setSnippetImportFeedback({
          tone: "error",
          text: "Unable to save snippets locally."
        });
      });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [customSnippets, isHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(PREVIEW_POPUP_STORAGE_KEY, String(isPreviewPopupOpen));
  }, [isPreviewPopupOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      SOURCE_TOOLBAR_STORAGE_KEY,
      String(isSourceToolbarVisible)
    );
  }, [isSourceToolbarVisible]);

  const runCompile = useCallback(async () => {
    if (compileInFlightRef.current || !isHydrated) {
      return;
    }

    const source = pendingSourceRef.current;
    const diagramRevision = diagramAssetsRevisionRef.current;
    const diagramAssets = diagramAssetsRef.current;
    const graphRevision = graphAssetsRevisionRef.current;
    const graphAssets = graphAssetsRef.current;
    const requestId = compileRequestRef.current + 1;
    compileRequestRef.current = requestId;
    compileInFlightRef.current = true;
    const compileStartedAt =
      typeof performance === "undefined" ? 0 : performance.now();

    try {
      const result = await compiler.compileDocument(source, [...diagramAssets, ...graphAssets]);

      if (!isMountedRef.current || requestId !== compileRequestRef.current) {
        return;
      }

      const compileDurationMs =
        typeof performance === "undefined"
          ? 0
          : performance.now() - compileStartedAt;
      const currentCompileResult = compileResultRef.current;
      const nextResult = shouldReuseCompileResult(currentCompileResult, result)
        ? currentCompileResult
        : result;

      if (nextResult === result) {
        setCompileResult(result);
      }

      if (result.ok && nextResult === result) {
        setLastSuccessfulResult(result);
      }

      logCompileTiming({
        durationMs: compileDurationMs,
        changed: nextResult === result,
        ok: result.ok,
        diagnosticsCount: result.ok ? result.diagnostics.length : result.errors.length
      });
    } catch (error) {
      if (!isMountedRef.current || requestId !== compileRequestRef.current) {
        return;
      }

      setCompileResult({
        ok: false,
        engine: "typst-ts",
        errors: [
          {
            message:
              error instanceof Error
                ? error.message
                : "Typst compiler worker failed.",
            severity: "error"
          }
        ]
      } satisfies CompileResult);
    } finally {
      compileInFlightRef.current = false;

      if (!isMountedRef.current) {
        return;
      }

      if (
        pendingSourceRef.current !== source ||
        diagramAssetsRevisionRef.current !== diagramRevision ||
        graphAssetsRevisionRef.current !== graphRevision
      ) {
        void runCompile();
      } else {
        setIsCompiling(false);
      }
    }
  }, [compiler, isHydrated]);

  const queueCompile = useCallback((debounced: boolean) => {
    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
      compileTimerRef.current = null;
    }

    pendingSourceRef.current = createThemedPreviewSource(
      previewSourceDraftRef.current,
      themeRef.current ?? theme,
      isPaperView
    );
    setIsCompiling(true);

    if (compileInFlightRef.current) {
      return;
    }

    if (!debounced) {
      void runCompile();
      return;
    }

    compileTimerRef.current = window.setTimeout(() => {
      compileTimerRef.current = null;
      void runCompile();
    }, COMPILE_DEBOUNCE_MS);
  }, [isPaperView, runCompile]);

  const handleCompile = useCallback(() => {
    queueCompile(false);
  }, [queueCompile]);

  useEffect(() => {
    handleCompileRef.current = handleCompile;
  }, [handleCompile]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    previewSourceDraftRef.current = sourceEditorValue;
    if (compileResult === null || snapshot.preferences.liveCompilation) {
      queueCompile(compileResult !== null);
    }
  }, [
    sourceEditorValue,
    diagramAssetsRevision,
    compileResult,
    graphAssetsRevision,
    isHydrated,
    queueCompile,
    snapshot.preferences.liveCompilation
  ]);

  useEffect(() => {
    if (!isHydrated || compileResultRef.current === null) {
      return;
    }

    queueCompile(false);
  }, [
    isHydrated,
    isPaperView,
    queueCompile,
    theme
  ]);

  useEffect(() => {
    if (!snapshot.preferences.vimMode || !shouldFocusEditorAfterVimToggleRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      shouldFocusEditorAfterVimToggleRef.current = false;
      editorRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [snapshot.preferences.vimMode]);

  useEffect(() => {
    if (!compileResult || compileResult.ok) {
      setIsErrorSettled(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsErrorSettled(true);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
      setIsErrorSettled(false);
    };
  }, [compileResult]);

  const handleDocumentChange = useCallback((content: string) => {
    if (isInspectingGraphSource && inspectedGraph) {
      const encodedContent = new TextEncoder().encode(content);
      setSnapshot((currentSnapshot) => {
        const now = new Date().toISOString();
        const currentGraph = currentSnapshot.project.graph ?? createDefaultGraph(currentSnapshot.preferences.graphProvider);
        const nextGraph =
          currentGraph.id === inspectedGraph.id
            ? { ...currentGraph, content: encodedContent, updatedAt: now }
            : currentGraph;
        const nextGraphs = (currentSnapshot.project.graphs ?? []).map((graphEntry) =>
          graphEntry.id === inspectedGraph.id
            ? { ...graphEntry, content: encodedContent, updatedAt: now }
            : graphEntry
        );

        return {
          ...currentSnapshot,
          project: {
            ...currentSnapshot.project,
            graph: nextGraph,
            graphs: nextGraphs,
            updatedAt: now
          }
        };
      });
      return;
    }

    setSnapshot((currentSnapshot) => updateActiveDocument(currentSnapshot, content));
  }, [inspectedGraph, isInspectingGraphSource]);

  const handleInsertEditorText = useCallback((text: string) => {
    editorRef.current?.insertText(text);
  }, []);

  const handleInsertEditorTemplate = useCallback((template: string) => {
    editorRef.current?.insertTemplate(template);
  }, []);

  const handleInsertSymbol = useCallback((template: string) => {
    editorRef.current?.insertSymbol(template);
  }, []);

  const handleWrapEditorSelection = useCallback(
    (before: string, after?: string) => {
      editorRef.current?.surroundSelection(before, after);
    },
    []
  );

  const handleToggleCurrentLines = useCallback((prefix: string, alternatePrefix?: string) => {
    editorRef.current?.toggleCurrentLines(prefix, alternatePrefix);
  }, []);

  const handleBold = useCallback(() => {
    handleWrapEditorSelection("*");
  }, [handleWrapEditorSelection]);

  const handleItalic = useCallback(() => {
    handleWrapEditorSelection("_");
  }, [handleWrapEditorSelection]);

  const clearSourceSymbolPreview = useCallback(() => {
    if (symbolHoverTimerRef.current !== null) {
      window.clearTimeout(symbolHoverTimerRef.current);
      symbolHoverTimerRef.current = null;
    }

    symbolHoverItemRef.current = null;
    setHoveredSourceSymbol(null);
  }, []);

  const positionSourceSymbolTooltip = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    symbolHoverPointRef.current = clampTooltipPosition(event.clientX, event.clientY);

    setHoveredSourceSymbol((current) =>
      current && symbolHoverItemRef.current === current.item
        ? {
            item: current.item,
            x: symbolHoverPointRef.current.x,
            y: symbolHoverPointRef.current.y
          }
        : current
    );
  }, []);

  const showSourceSymbolPreview = useCallback(
    (symbol: SourceSymbolItem, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (symbolHoverTimerRef.current !== null) {
        window.clearTimeout(symbolHoverTimerRef.current);
      }

      symbolHoverItemRef.current = symbol;
      symbolHoverPointRef.current = clampTooltipPosition(event.clientX, event.clientY);
      symbolHoverTimerRef.current = window.setTimeout(() => {
        if (symbolHoverItemRef.current !== symbol) {
          return;
        }

        setHoveredSourceSymbol({
          item: symbol,
          x: symbolHoverPointRef.current.x,
          y: symbolHoverPointRef.current.y
        });
      }, 1100);
    },
    []
  );

  const handleBulletList = useCallback(() => {
    handleToggleCurrentLines("- ", "+ ");
  }, [handleToggleCurrentLines]);

  const handleNumberedList = useCallback(() => {
    handleToggleCurrentLines("+ ", "- ");
  }, [handleToggleCurrentLines]);

  const handleMathMode = useCallback(() => {
    editorRef.current?.toggleMathMode();
  }, []);

  const handleUnderline = useCallback(() => {
    handleWrapEditorSelection("#underline[", "]");
  }, [handleWrapEditorSelection]);

  const handleCycleHeading = useCallback(() => {
    editorRef.current?.cycleCurrentLinesHeading();
  }, []);

  const handleInsertMatrix = useCallback(() => {
    editorRef.current?.insertMathTemplate(buildMatrixTemplate(matrixSettings));
  }, [matrixSettings]);

  const handleInsertTable = useCallback(() => {
    handleInsertEditorTemplate(buildTableTemplate(tableSettings));
  }, [handleInsertEditorTemplate, tableSettings]);

  const toggleToolbarMenu = useCallback((menu: "matrix" | "table") => {
    setOpenToolbarMenu((current) => (current === menu ? null : menu));
  }, []);

  const handlePreviewSourceJump = useCallback((sourceLocation: string) => {
    const sourceRange = parseSourceLocation(sourceLocation);

    if (!sourceRange) {
      return;
    }

    editorRef.current?.focusRange(sourceRange);
  }, []);

  const handleSelectDocument = (documentId: string) => {
    const nextDocument = snapshot.project.documents.find((document) => document.id === documentId);

    if (nextDocument) {
      const nextPath = normalizeWorkspacePath(nextDocument.name);
      setSelectedWorkspacePath(nextPath);
      setSelectedWorkspacePaths([nextPath]);
      setWorkspaceSelectionAnchorPath(nextPath);
    }

    setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, documentId));
  };

  const handleActivateWorkspaceNode = useCallback(
    (
      node: WorkspaceTreeNode,
      modifiers: {
        additive: boolean;
        range: boolean;
      }
    ) => {
      const normalizedPath = normalizeWorkspacePath(node.path);

      if (modifiers.range) {
        const visibleNodes = flattenVisibleWorkspaceNodes(visibleWorkspaceTree, collapsedFileFolders);
        const selectablePaths = visibleNodes.map((entry) => entry.path);
        const anchorPath = workspaceSelectionAnchorPath ?? selectedWorkspacePath ?? normalizedPath;
        const anchorIndex = selectablePaths.indexOf(anchorPath);
        const targetIndex = selectablePaths.indexOf(normalizedPath);

        if (anchorIndex >= 0 && targetIndex >= 0) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          setSelectedWorkspacePaths(selectablePaths.slice(start, end + 1));
        } else {
          setSelectedWorkspacePaths([normalizedPath]);
        }

        return;
      }

      if (modifiers.additive) {
        setSelectedWorkspacePaths((currentPaths) => {
          if (currentPaths.includes(normalizedPath)) {
            return currentPaths.filter((path) => path !== normalizedPath);
          }

          return [...currentPaths, normalizedPath];
        });
        setWorkspaceSelectionAnchorPath(normalizedPath);
        return;
      }

      setSelectedWorkspacePaths([normalizedPath]);
      setWorkspaceSelectionAnchorPath(normalizedPath);
    },
    [collapsedFileFolders, selectedWorkspacePath, visibleWorkspaceTree, workspaceSelectionAnchorPath]
  );

  const handleRequestWorkspaceRename = useCallback((node: WorkspaceTreeNode) => {
    setWorkspaceContextMenu(null);
    setRenamingWorkspacePath(node.path);
    setWorkspaceRenameDraft(node.name);
  }, []);

  const handleCancelWorkspaceRename = useCallback(() => {
    setRenamingWorkspacePath(null);
    setWorkspaceRenameDraft("");
  }, []);

  const handleCommitWorkspaceRename = useCallback(() => {
    if (!renamingWorkspacePath) {
      return;
    }

    if (renamingWorkspacePath === WORKSPACE_ROOT_PATH) {
      setSnapshot((currentSnapshot) => renameProject(currentSnapshot, workspaceRenameDraft));
      handleCancelWorkspaceRename();
      return;
    }

    const targetNode = findWorkspaceNodeByPath(visibleWorkspaceTree, renamingWorkspacePath);
    const nextName = workspaceRenameDraft.trim();

    if (!targetNode || !nextName) {
      handleCancelWorkspaceRename();
      return;
    }

    setSnapshot((currentSnapshot) => {
      if (targetNode.source.kind === "document") {
        return renameDocumentById(currentSnapshot, targetNode.source.id, nextName);
      }

      if (targetNode.source.kind === "folder") {
        return renameFolderById(currentSnapshot, targetNode.source.id, nextName);
      }

      if (targetNode.source.kind === "diagram") {
        return renameDiagramById(currentSnapshot, targetNode.source.id, nextName);
      }

      if (targetNode.source.kind === "graph") {
        return renameGraphById(currentSnapshot, targetNode.source.id, nextName);
      }

      return currentSnapshot;
    });

    setSelectedWorkspacePath(null);
    handleCancelWorkspaceRename();
  }, [handleCancelWorkspaceRename, renamingWorkspacePath, visibleWorkspaceTree, workspaceRenameDraft]);

  const handleRequestWorkspaceRootRename = useCallback(() => {
    if (isTrashViewOpen) {
      return;
    }

    setWorkspaceContextMenu(null);
    setRenamingWorkspacePath(WORKSPACE_ROOT_PATH);
    setWorkspaceRenameDraft(snapshot.project.name);
  }, [isTrashViewOpen, snapshot.project.name]);

  const handleRequestWorkspaceContextMenu = useCallback(
    (node: WorkspaceTreeNode, x: number, y: number) => {
      setSelectedWorkspacePaths((currentPaths) =>
        currentPaths.includes(node.path) ? currentPaths : [node.path]
      );
      setWorkspaceSelectionAnchorPath(node.path);
      setWorkspaceContextMenu({
        kind: "node",
        node,
        x,
        y
      });
    },
    []
  );

  const handleRequestWorkspaceRootContextMenu = useCallback(
    (x: number, y: number) => {
      if (isTrashViewOpen) {
        return;
      }

      setWorkspaceContextMenu({
        kind: "project-root",
        x,
        y
      });
    },
    [isTrashViewOpen]
  );

  const handleDeleteWorkspaceNode = useCallback(
    (node: WorkspaceTreeNode) => {
      setSnapshot((currentSnapshot) => {
        if (node.source.kind === "document") {
          return moveDocumentToTrash(currentSnapshot, node.source.id);
        }

        if (node.source.kind === "folder") {
          return moveFolderToTrash(currentSnapshot, node.source.id);
        }

        if (node.source.kind === "diagram") {
          return moveDiagramToTrash(currentSnapshot, node.source.id);
        }

        if (node.source.kind === "graph") {
          return moveGraphToTrash(currentSnapshot, node.source.id);
        }

        if (node.source.kind === "trash-item") {
          return permanentlyDeleteTrashEntry(currentSnapshot, node.source.id);
        }

        return currentSnapshot;
      });

      if (selectedWorkspacePath === node.path) {
        setSelectedWorkspacePath(null);
      }
      setSelectedWorkspacePaths((currentPaths) =>
        currentPaths.filter((path) => path !== node.path && !path.startsWith(`${node.path}/`))
      );

      handleCancelWorkspaceRename();
      setWorkspaceContextMenu(null);
    },
    [handleCancelWorkspaceRename, selectedWorkspacePath]
  );

  const handleRestoreWorkspaceTrashEntry = useCallback((trashEntryId: string) => {
    setSnapshot((currentSnapshot) => restoreTrashEntry(currentSnapshot, trashEntryId));
    setWorkspaceContextMenu(null);
    setSelectedWorkspacePath(null);
    setSelectedWorkspacePaths([]);
    setWorkspaceSelectionAnchorPath(null);
  }, []);

  const handleEmptyWorkspaceTrash = useCallback(() => {
    if (!window.confirm("Empty trash permanently?")) {
      return;
    }

    setSnapshot((currentSnapshot) => emptyTrash(currentSnapshot));
    setWorkspaceContextMenu(null);
    setSelectedWorkspacePath(null);
  }, []);

  const handleMoveWorkspaceNode = useCallback(
    (node: WorkspaceTreeNode, destinationFolderPath: string | null) => {
      const normalizedDestination = normalizeWorkspacePath(destinationFolderPath ?? "");
      const nextDestination = normalizedDestination || null;
      const movedBaseName = getWorkspaceBaseName(node.path);
      const nextPath =
        node.source.kind === "diagram" || node.source.kind === "graph"
          ? joinWorkspacePath(nextDestination === "figures" ? null : nextDestination?.replace(/^figures\/?/, "") ?? null, movedBaseName)
          : joinWorkspacePath(nextDestination, movedBaseName);
      const displayNextPath =
        node.source.kind === "diagram" || node.source.kind === "graph"
          ? joinWorkspacePath("figures", nextPath)
          : nextPath;
      const nextSelectedPath =
        selectedWorkspacePath === node.path
          ? displayNextPath
          : selectedWorkspacePath && node.source.kind === "folder" && selectedWorkspacePath.startsWith(`${node.path}/`)
            ? `${displayNextPath}${selectedWorkspacePath.slice(node.path.length)}`
            : selectedWorkspacePath;
      const nextSelectedPaths = selectedWorkspacePaths.map((path) =>
        path === node.path
          ? displayNextPath
          : node.source.kind === "folder" && path.startsWith(`${node.path}/`)
            ? `${displayNextPath}${path.slice(node.path.length)}`
            : path
      );

      setSnapshot((currentSnapshot) => {
        if (node.source.kind === "document") {
          return moveDocumentToFolder(currentSnapshot, node.source.id, nextDestination);
        }

        if (node.source.kind === "folder") {
          return moveFolderToFolder(currentSnapshot, node.source.id, nextDestination);
        }

        if (node.source.kind === "diagram") {
          const figureDestination =
            nextDestination === null
              ? null
              : nextDestination === "figures"
                ? null
                : nextDestination.startsWith("figures/")
                  ? nextDestination.slice("figures/".length)
                  : null;
          return moveDiagramToFolder(currentSnapshot, node.source.id, figureDestination);
        }

        if (node.source.kind === "graph") {
          const figureDestination =
            nextDestination === null
              ? null
              : nextDestination === "figures"
                ? null
                : nextDestination.startsWith("figures/")
                  ? nextDestination.slice("figures/".length)
                  : null;
          return moveGraphToFolder(currentSnapshot, node.source.id, figureDestination);
        }

        return currentSnapshot;
      });

      setWorkspaceContextMenu(null);
      setDraggedWorkspacePath(null);
      setWorkspaceDropTargetPath(null);
      setSelectedWorkspacePaths(nextSelectedPaths);
      if (nextSelectedPath) {
        setSelectedWorkspacePath(nextSelectedPath);
      }
    },
    [selectedWorkspacePath, selectedWorkspacePaths]
  );

  const handleRequestWorkspaceMove = useCallback(
    (node: WorkspaceTreeNode) => {
      const currentParentPath = getWorkspaceParentPath(node.path);
      const nextValue = window.prompt(
        getWorkspaceMovePromptLabel(node),
        currentParentPath ?? ""
      );

      if (nextValue === null) {
        setWorkspaceContextMenu(null);
        return;
      }

      const requestedPath = normalizeWorkspacePath(nextValue);

      if (node.source.kind === "diagram" || node.source.kind === "graph") {
        if (requestedPath && requestedPath !== "figures" && !requestedPath.startsWith("figures/")) {
          window.alert("Figures can only be moved inside the figures folder.");
          return;
        }
      } else if (requestedPath === "figures" || requestedPath.startsWith("figures/")) {
        window.alert("That destination is reserved.");
        return;
      }

      handleMoveWorkspaceNode(node, requestedPath || null);
    },
    [handleMoveWorkspaceNode]
  );

  const handleWorkspaceDragStart = useCallback((node: WorkspaceTreeNode) => {
    setDraggedWorkspacePath(node.path);
    setWorkspaceContextMenu(null);
    setWorkspaceDropTargetPath(null);
  }, []);

  const handleWorkspaceDragEnd = useCallback(() => {
    setDraggedWorkspacePath(null);
    setWorkspaceDropTargetPath(null);
    if (workspaceHoverExpandTimerRef.current !== null) {
      window.clearTimeout(workspaceHoverExpandTimerRef.current);
      workspaceHoverExpandTimerRef.current = null;
    }
  }, []);

  const handleWorkspaceFolderDragHover = useCallback(
    (path: string) => {
      setWorkspaceDropTargetPath(path);

      if (workspaceHoverExpandTimerRef.current !== null) {
        window.clearTimeout(workspaceHoverExpandTimerRef.current);
        workspaceHoverExpandTimerRef.current = null;
      }

      if (path === "figures" || path === WORKSPACE_ROOT_PATH) {
        return;
      }

      if (!collapsedFileFolders[path]) {
        return;
      }

      workspaceHoverExpandTimerRef.current = window.setTimeout(() => {
        setCollapsedFileFolders((current) => ({
          ...current,
          [path]: false
        }));
        workspaceHoverExpandTimerRef.current = null;
      }, MOVE_HOVER_EXPAND_DELAY_MS);
    },
    [collapsedFileFolders]
  );

  const handleWorkspaceDropAtRoot = useCallback(() => {
    if (!draggedWorkspacePath) {
      return;
    }

    const draggedNode = findWorkspaceNodeByPath(workspaceTree, draggedWorkspacePath);

    if (!draggedNode || !canMoveWorkspaceNode(draggedNode)) {
      handleWorkspaceDragEnd();
      return;
    }

    if (draggedNode.source.kind === "diagram" || draggedNode.source.kind === "graph") {
      handleMoveWorkspaceNode(draggedNode, "figures");
      return;
    }

    handleMoveWorkspaceNode(draggedNode, null);
  }, [draggedWorkspacePath, handleMoveWorkspaceNode, handleWorkspaceDragEnd, workspaceTree]);

  const handleWorkspaceDropIntoFolder = useCallback(
    (targetNode: WorkspaceTreeNode) => {
      if (!draggedWorkspacePath) {
        return;
      }

      const draggedNode = findWorkspaceNodeByPath(workspaceTree, draggedWorkspacePath);

      if (!draggedNode || !canMoveWorkspaceNode(draggedNode)) {
        handleWorkspaceDragEnd();
        return;
      }

      if (draggedNode.source.kind === "diagram" || draggedNode.source.kind === "graph") {
        if (targetNode.path !== "figures" && !targetNode.path.startsWith("figures/")) {
          handleWorkspaceDragEnd();
          return;
        }

        handleMoveWorkspaceNode(draggedNode, targetNode.path);
        return;
      }

      if (targetNode.path === "figures" || targetNode.path.startsWith("figures/")) {
        handleWorkspaceDragEnd();
        return;
      }

      handleMoveWorkspaceNode(draggedNode, targetNode.path);
    },
    [
      draggedWorkspacePath,
      handleDeleteWorkspaceNode,
      handleMoveWorkspaceNode,
      handleWorkspaceDragEnd,
      workspaceTree
    ]
  );

  const handleNewDocument = () => {
    setSnapshot((currentSnapshot) => createDocument(currentSnapshot));
  };

  const setThemeMode = (nextTheme: ThemePreference) => {
    setTheme(nextTheme);
    setSnapshot((currentSnapshot) =>
      updateThemePreference(currentSnapshot, nextTheme)
    );
  };

  const handleGitHubConfigChange = (
    field: keyof GitHubRemoteConfig,
    value: string
  ) => {
    setGitHubConfig((currentConfig) => ({
      ...currentConfig,
      [field]: value
    }));
  };

  const handleThemeImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const result = await importThemeFile(file);

    if (!result.ok) {
      setThemeImportFeedback({
        tone: "error",
        text: result.message
      });
      return;
    }

    setThemeMode(result.theme.id);
    setThemeImportFeedback({
      tone: "success",
      text: `Imported ${result.theme.name}.`
    });
    setSettingsTab("themes");
    setIsSettingsOpen(true);
  };

  const handleSnippetImport = useCallback((nextSnippets: TypstSnippet[]) => {
    setCustomSnippets((currentSnippets) =>
      mergeSnippets([...currentSnippets, ...nextSnippets])
    );
    setSnippetImportFeedback({
      tone: "success",
      text: `Imported ${nextSnippets.length} snippet${nextSnippets.length === 1 ? "" : "s"}.`
    });
    setSettingsTab("snippets");
    setIsSettingsOpen(true);
  }, []);

  const handleSnippetImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const result = parseSnippetImport(await file.text());

    if (!result.ok) {
      setSnippetImportFeedback({
        tone: "error",
        text: result.message
      });
      return;
    }

    handleSnippetImport(result.snippets);
  };

  const handleImportPastedSnippets = () => {
    const result = parseSnippetImport(snippetImportText);

    if (!result.ok) {
      setSnippetImportFeedback({
        tone: "error",
        text: result.message
      });
      return;
    }

    handleSnippetImport(result.snippets);
  };

  const handleSnippetImportTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setSnippetImportText(event.target.value);
  };

  const handleRemoveTypstPackage = useCallback(
    async (entry: TypstPackageCacheEntry) => {
      try {
        await removeTypstPackageFromCache(entry.reference);
        await refreshTypstPackageCache();
        setPackageCacheFeedback({
          tone: "neutral",
          text: `Removed ${entry.reference.key} from the package cache.`
        });
      } catch {
        setPackageCacheFeedback({
          tone: "error",
          text: `Unable to remove ${entry.reference.key} from the package cache.`
        });
      }
    },
    [refreshTypstPackageCache]
  );

  const handleClearTypstPackages = useCallback(async () => {
    setIsPackageCacheClearing(true);

    try {
      await clearTypstPackageCache();
      await refreshTypstPackageCache();
      setPackageCacheFeedback({
        tone: "neutral",
        text: "Cleared cached Typst packages."
      });
    } catch {
      setPackageCacheFeedback({
        tone: "error",
        text: "Unable to clear the Typst package cache."
      });
    } finally {
      setIsPackageCacheClearing(false);
    }
  }, [refreshTypstPackageCache]);

  const handleInstallTypstPackage = useCallback(
    async (entry: TypstUniversePackageEntry) => {
      setInstallingPackageName(entry.name);

      try {
        const version = await getLatestTypstUniversePackageVersion(entry.name);
        await ensureTypstPackageReferences([
          {
            namespace: entry.namespace,
            name: entry.name,
            version,
            key: `${entry.namespace}/${entry.name}:${version}`
          }
        ]);
        await refreshTypstPackageCache();
        setPackageCacheFeedback({
          tone: "success",
          text: `Installed @${entry.namespace}/${entry.name}:${version}.`
        });
      } catch (error) {
        setPackageCacheFeedback({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : `Unable to install @${entry.namespace}/${entry.name}.`
        });
      } finally {
        setInstallingPackageName(null);
      }
    },
    [refreshTypstPackageCache]
  );

  const handleClearCustomSnippets = () => {
    setCustomSnippets([]);
    setSnippetImportFeedback({
      tone: "neutral",
      text: "Cleared custom snippets."
    });
  };

  const handleRemoveCustomSnippet = (prefix: string) => {
    setCustomSnippets((currentSnippets) =>
      currentSnippets.filter((snippet) => snippet.prefix !== prefix)
    );
    setSnippetImportFeedback({
      tone: "neutral",
      text: `Removed ${prefix}.`
    });
  };

  const handleDownloadThemeTemplate = () => {
    const blob = new Blob([JSON.stringify(THEME_IMPORT_TEMPLATE, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = THEME_TEMPLATE_FILENAME;
    anchor.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  const handleDownloadSnippetTemplate = () => {
    const blob = new Blob([JSON.stringify(SNIPPET_IMPORT_TEMPLATE, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = SNIPPET_TEMPLATE_FILENAME;
    anchor.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  const handleDownloadCustomSnippets = () => {
    const blob = new Blob([JSON.stringify({ snippets: customSnippets }, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "typr-snippets.json";
    anchor.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  const downloadBlob = (name: string, blob: Blob) => {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  const downloadFile = (name: string, content: string | Uint8Array, type = "text/plain") => {
    downloadBlob(name, new Blob([content as BlobPart], { type }));
  };

  const handleRenameProject = () => {
    const nextName = window.prompt("Project name", snapshot.project.name);

    if (nextName === null) {
      return;
    }

    setSnapshot((currentSnapshot) => renameProject(currentSnapshot, nextName));
  };

  const handleRenameDocument = () => {
    const nextName = window.prompt("File name", activeDocument.name);

    if (nextName === null) {
      return;
    }

    setSnapshot((currentSnapshot) => renameActiveDocument(currentSnapshot, nextName));
  };

  const handleUploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const content = isTextWorkspaceFile(file.name)
      ? await file.text()
      : new Uint8Array(await file.arrayBuffer());
    setSnapshot((currentSnapshot) =>
      createDocumentFromFile(currentSnapshot, file.name, content)
    );
  };

  const handleDownloadDocument = () => {
    downloadFile(
      activeDocument.name,
      activeDocument.content,
      typeof activeDocument.content === "string"
        ? "text/plain"
        : getWorkspacePreviewMimeType(activeDocument.name) ?? "application/octet-stream"
    );
  };

  const handleDownloadProject = () => {
    downloadFile(
      `${snapshot.project.name}.json`,
      JSON.stringify(snapshot, null, 2),
      "application/json"
    );
  };

  const handleAddDiagramStroke = useCallback(
    (stroke: DiagramStroke) => {
      setSnapshot((currentSnapshot) =>
        updateDiagram(currentSnapshot, (diagramAsset) => ({
          ...diagramAsset,
          strokes: [...diagramAsset.strokes, stroke]
        }))
      );
    },
    []
  );

  const handleAddDiagramShape = useCallback((shape: DiagramShape) => {
    setSnapshot((currentSnapshot) =>
      updateDiagram(currentSnapshot, (diagramAsset) => ({
        ...diagramAsset,
        shapes: [...diagramAsset.shapes, shape]
      }))
    );
  }, []);

  const handleUndoDiagramStroke = useCallback(() => {
    setSnapshot((currentSnapshot) => removeLatestDiagramItem(currentSnapshot));
  }, []);

  const handleRemoveDiagramStroke = useCallback((strokeId: string) => {
    setSnapshot((currentSnapshot) => removeDiagramStroke(currentSnapshot, strokeId));
  }, []);

  const handleRemoveDiagramShape = useCallback((shapeId: string) => {
    setSnapshot((currentSnapshot) => removeDiagramShape(currentSnapshot, shapeId));
  }, []);

  const handleUpdateDiagramStroke = useCallback((nextStroke: DiagramStroke) => {
    setSnapshot((currentSnapshot) =>
      updateDiagram(currentSnapshot, (diagramAsset) => ({
        ...diagramAsset,
        strokes: diagramAsset.strokes.map((stroke) =>
          stroke.id === nextStroke.id ? nextStroke : stroke
        )
      }))
    );
  }, []);

  const handleUpdateDiagramShape = useCallback((nextShape: DiagramShape) => {
    setSnapshot((currentSnapshot) =>
      updateDiagram(currentSnapshot, (diagramAsset) => ({
        ...diagramAsset,
        shapes: diagramAsset.shapes.map((shape) =>
          shape.id === nextShape.id ? nextShape : shape
        )
      }))
    );
  }, []);

  const handleUpdateDiagramFrame = useCallback((nextFrame: DiagramCanvasFrame | null) => {
    setSnapshot((currentSnapshot) =>
      updateDiagram(currentSnapshot, (diagramAsset) => ({
        ...diagramAsset,
        frame: nextFrame
      }))
    );
  }, []);

  const handleClearDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateDiagram(currentSnapshot, (diagramAsset) => ({
        ...diagramAsset,
        strokes: [],
        shapes: []
      }))
    );
  }, []);

  const handleRenameDiagram = useCallback((nextName: string) => {
    const normalizedName = normalizeDiagramFileName(nextName);

    setSnapshot((currentSnapshot) => {
      const currentDiagram = currentSnapshot.project.diagram ?? createDefaultDiagram();

      if (currentDiagram.name === normalizedName) {
        return currentSnapshot;
      }

      const renamedDiagram = {
        ...currentDiagram,
        name: normalizedName
      };

      const now = new Date().toISOString();
      const nextFigures = (currentSnapshot.project.figures ?? []).map((figure) =>
        figure.id === currentDiagram.id ? renamedDiagram : figure
      );

      return {
        ...currentSnapshot,
        project: {
          ...currentSnapshot.project,
          diagram: {
            ...renamedDiagram,
            updatedAt: now
          },
          figures: nextFigures,
          updatedAt: now
        }
      };
    });
  }, []);

  const handleAddFolder = useCallback(() => {
    const nextName = window.prompt("Folder name", "folder");

    if (nextName === null) {
      return;
    }

    setSnapshot((currentSnapshot) => createFolder(currentSnapshot, nextName));
  }, []);

  const handleToggleFolder = useCallback((folderId: string) => {
    setCollapsedFileFolders((current) => ({
      ...current,
      [folderId]: !current[folderId]
    }));
  }, []);

  const handleNewDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) => createNextDiagramSnapshot(currentSnapshot));
  }, []);

  const handleSaveDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) => saveCurrentDiagram(currentSnapshot));
    handleCompileRef.current();
  }, []);

  const handleSaveGraph = useCallback((nextGraph: GraphAsset) => {
    setSnapshot((currentSnapshot) => saveCurrentGraph(updateGraph(currentSnapshot, () => nextGraph)));
  }, []);

  const handleNewGraph = useCallback((nextGraph: GraphAsset) => {
    setSnapshot((currentSnapshot) =>
      createNextGraphSnapshot(
        updateGraph(currentSnapshot, () => nextGraph),
        currentSnapshot.preferences.graphProvider
      )
    );
  }, []);

  const handleRenameGraph = useCallback((nextName: string) => {
    setSnapshot((currentSnapshot) => {
      const currentGraph = currentSnapshot.project.graph ?? createDefaultGraph();
      const normalizedName = normalizeGraphFileNameForContentType(
        nextName,
        currentGraph.contentType
      );

      if (currentGraph.name === normalizedName) {
        return currentSnapshot;
      }

      const renamedGraph = {
        ...currentGraph,
        name: normalizedName
      };

      const now = new Date().toISOString();
      const nextGraphs = (currentSnapshot.project.graphs ?? []).map((graphEntry) =>
        graphEntry.id === currentGraph.id ? renamedGraph : graphEntry
      );

      return {
        ...currentSnapshot,
        project: {
          ...currentSnapshot.project,
          graph: {
            ...renamedGraph,
            updatedAt: now
          },
          graphs: nextGraphs,
          updatedAt: now
        }
      };
    });
  }, []);

  const handleDownloadGraph = useCallback((graphAsset: GraphAsset) => {
    downloadBlob(buildGraphDownloadFilename(graphAsset), buildGraphDownloadBlob(graphAsset));
  }, []);

  const handleInsertGraphIntoDocument = useCallback((graphAsset: GraphAsset) => {
    setSnapshot((currentSnapshot) => {
      return saveCurrentGraph(updateGraph(currentSnapshot, () => graphAsset));
    });
    const insertResult = buildGraphInsertResult(graphAsset);

    if (!insertResult.supported) {
      window.alert("Save the graph before inserting it into the document.");
      return;
    }

    editorRef.current?.insertTextAndSelect(`\n${insertResult.text}\n`);
    window.setTimeout(() => {
      handleCompileRef.current();
    }, 0);
  }, []);

  const handleDownloadDiagramSvg = useCallback((svgMarkup: string) => {
    const baseName = diagram.name.replace(/\.svg$/i, "");
    const svgName = `${baseName || diagram.name}.svg`;
    downloadBlob(
      svgName,
      new Blob([svgMarkup], {
        type: "image/svg+xml"
      })
    );
  }, [diagram]);

  const handleInsertDiagramIntoDocument = useCallback(() => {
    editorRef.current?.insertTextAndSelect(
      `\n#figure(image("${getDiagramFilePath(diagram.name)}"))\n`
    );
    window.setTimeout(() => {
      handleCompileRef.current();
    }, 0);
  }, [diagram.name]);

  const handleExportPdf = useCallback(async () => {
    if (isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);

    try {
      const pdfBytes = await exportTypstPdf(activeDocumentTextContent, [
        ...diagramShadowAssets,
        ...graphShadowAssets
      ]);
      const baseName = activeDocument.name.replace(/\.typ$/i, "");
      const pdfName = `${baseName || activeDocument.name}.pdf`;
      const pdfBuffer = Uint8Array.from(pdfBytes).buffer;
      downloadBlob(
        pdfName,
        new Blob([pdfBuffer], {
          type: "application/pdf"
        })
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `Unable to export PDF: ${error.message}`
          : "Unable to export PDF."
      );
    } finally {
      setIsExportingPdf(false);
    }
  }, [
    activeDocumentTextContent,
    activeDocument.name,
    diagramShadowAssets,
    graphShadowAssets,
    isExportingPdf
  ]);

  const handleUndo = () => editorRef.current?.undo();
  const handleRedo = () => editorRef.current?.redo();
  const handleGoToLine = () => editorRef.current?.goToLine();
  const handleSelectAll = () => editorRef.current?.selectAll();
  const openSearchPane = useCallback(() => {
    const editorSearchQuery = editorRef.current?.getSearchQuery();
    if (editorSearchQuery) {
      setSearchQuery(editorSearchQuery);
    }

    setActiveSidebarTool("search");
    setIsSidebarCollapsed(false);

    if (workspaceMode === "editor" || workspaceMode === "preview") {
      setWorkspaceMode("split");
    }
  }, [workspaceMode]);

  const updateSearchQuery = useCallback(
    (patch: Partial<TypstSearchQueryState>) => {
      setSearchQuery((currentQuery) => ({
        ...currentQuery,
        ...patch
      }));
    },
    []
  );

  const applySearchQuery = useCallback(() => {
    editorRef.current?.setSearchQuery(searchQuery);
  }, [searchQuery]);

  const handleFindPrevious = useCallback(() => {
    applySearchQuery();
    editorRef.current?.findPrevious();
  }, [applySearchQuery]);

  const handleFindNext = useCallback(() => {
    applySearchQuery();
    editorRef.current?.findNext();
  }, [applySearchQuery]);

  const handleSelectMatches = useCallback(() => {
    applySearchQuery();
    editorRef.current?.selectMatches();
  }, [applySearchQuery]);

  const handleReplaceNext = useCallback(() => {
    applySearchQuery();
    editorRef.current?.replaceNext();
  }, [applySearchQuery]);

  const handleReplaceAll = useCallback(() => {
    applySearchQuery();
    editorRef.current?.replaceAll();
  }, [applySearchQuery]);

  useEffect(() => {
    if (activeSidebarTool !== "search" || isSidebarCollapsed) {
      return;
    }

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [activeSidebarTool, isSidebarCollapsed]);

  const togglePreviewPopup = () => {
    setIsPreviewPopupOpen((current) => !current);
  };

  const setPreviewZoomStep = (direction: -1 | 1) => {
    setPreviewZoom((current) => nextZoomStep(current, direction));
  };

  const handleShowVersion = () => {
    window.alert(`Typr version ${APP_VERSION}`);
  };

  const handleShowAbout = () => {
    window.alert(
      "Typr is a local-first Typst editor for writing, previewing, and syncing projects."
    );
  };

  const handleShowTutorial = () => {
    window.alert(
      "Tutorial: open Files to switch documents, type in Source, use View for layout controls, and use GitHub settings when you want to sync."
    );
  };

  const handleOpenTypstReference = () => {
    window.open("https://typst.app/docs/", "_blank", "noopener,noreferrer");
  };

  const handleOpenGitHubHelp = () => {
    setSettingsTab("github");
    setIsSettingsOpen(true);
  };

  const handleRemoveCustomTheme = (themeId: string) => {
    removeCustomTheme(themeId);

    if (theme.id === themeId) {
      setThemeMode(AUTO_THEME_ID);
    }
  };

  const saveSyncSnapshot = useCallback(() => {
    const snap = buildSyncSnapshot(snapshot.project.documents);
    try {
      localStorage.setItem(SYNC_SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {
      // storage full or unavailable
    }
  }, [snapshot.project.documents]);

  const loadSyncSnapshot = useCallback((): Record<string, string> => {
    try {
      const raw = localStorage.getItem(SYNC_SNAPSHOT_KEY);
      if (raw) {
        return JSON.parse(raw) as Record<string, string>;
      }
    } catch {
      // corrupted or unavailable
    }
    return {};
  }, []);

  const handlePushToGitHub = async () => {
    if (!isOnline) {
      setSyncFeedback({
        tone: "error",
        text: "This device is offline. Local documents are still available."
      });
      return;
    }

    if (!hasRequiredConfig(githubConfig)) {
      setSyncFeedback({
        tone: "error",
        text: "Fill in owner, repo, branch, and token first. Leave directory blank to use the project name."
      });
      setSettingsTab("github");
      setIsSettingsOpen(true);
      return;
    }

    setIsSyncing(true);
    setSyncFeedback({
      tone: "neutral",
      text: `Pushing ${snapshot.project.documents.length} document${
        snapshot.project.documents.length === 1 ? "" : "s"
      } to GitHub...`
    });

    const result = await pushProjectToGitHub(githubConfig, {
      projectName: snapshot.project.name,
      documents: snapshot.project.documents.map((document) => ({
        name: document.name,
        content: document.content
      })),
      commitMessage: `Sync ${snapshot.project.name} from typr`
    });

    setIsSyncing(false);
    setSyncFeedback({
      tone: result.ok ? "success" : "error",
      text: result.message
    });

    if (result.ok) {
      saveSyncSnapshot();
    }
  };

  const handlePullFromGitHub = async () => {
    if (!isOnline) {
      setSyncFeedback({
        tone: "error",
        text: "This device is offline. Local documents are still available."
      });
      return;
    }

    if (!hasRequiredConfig(githubConfig)) {
      setSyncFeedback({
        tone: "error",
        text: "Fill in owner, repo, branch, and token first. Leave directory blank to use the project name."
      });
      setSettingsTab("github");
      setIsSettingsOpen(true);
      return;
    }

    setIsSyncing(true);
    setSyncFeedback({
      tone: "neutral",
      text: "Pulling from GitHub..."
    });

    const result = await pullProjectFromGitHub(githubConfig, {
      projectName: snapshot.project.name
    });

    setIsSyncing(false);

    if (!result.ok || !result.documents) {
      setSyncFeedback({
        tone: result.ok ? "error" : "error",
        text: result.message
      });
      return;
    }

    const lastSnapshot = loadSyncSnapshot();
    const localDocs = snapshot.project.documents.map((d) => ({
      id: d.id,
      name: d.name,
      content: d.content,
      updatedAt: d.updatedAt
    }));
    const remoteDocs = result.documents.map((d) => ({
      name: d.name,
      content: d.content
    }));

    const conflicts = detectConflicts(localDocs, remoteDocs, lastSnapshot);

    if (conflicts.conflicts.length > 0) {
      setPendingRemoteDocuments(result.documents);
      setPendingRemoteProjectName(result.projectName ?? null);
      setConflictSet(conflicts);
      setSyncFeedback({
        tone: "neutral",
        text: `${conflicts.conflicts.length} conflict${conflicts.conflicts.length !== 1 ? "s" : ""} found. Resolve to continue.`
      });
      return;
    }

    applyPullResult(conflicts, result.documents, result.projectName ?? null);
  };

  const applyPullResult = (
    conflicts: ConflictSet,
    remoteDocuments: GitHubSyncDocument[],
    projectName: string | null
  ) => {
    const now = new Date().toISOString();
    const localDocs = snapshot.project.documents.map((d) => ({
      id: d.id,
      name: d.name,
      content: d.content,
      updatedAt: d.updatedAt
    }));
    const remoteDocs = remoteDocuments.map((d) => ({
      name: d.name,
      content: d.content
    }));

    const merged = applyResolutions(localDocs, remoteDocs, []);

    const addedNames = new Set(conflicts.addedRemotely.map((d) => d.name));
    let newActiveId = snapshot.project.activeDocumentId;
    if (!newActiveId || !merged.find((d) => d.id === newActiveId)) {
      const firstAdded = merged.find((d) => addedNames.has(d.name));
      if (firstAdded) {
        newActiveId = firstAdded.id;
      }
    }

    setSnapshot((current) => ({
      ...current,
      project: {
        ...current.project,
        name: projectName ?? current.project.name,
        documents: merged.map((d) => ({
          id: d.id,
          name: d.name,
          content: d.content,
          updatedAt: d.updatedAt
        })),
        activeDocumentId: newActiveId,
        updatedAt: now
      }
    }));

    saveSyncSnapshot();

    const totalAdded = conflicts.addedRemotely.length;
    const totalAuto = conflicts.autoResolved.length;
    let msg = "Pull complete";
    if (totalAdded > 0 || totalAuto > 0) {
      const parts: string[] = [];
      if (totalAdded > 0) parts.push(`${totalAdded} added`);
      if (totalAuto > 0) parts.push(`${totalAuto} updated`);
      msg += ` (${parts.join(", ")})`;
    }
    setSyncFeedback({ tone: "success", text: msg });
  };

  const handleConflictResolve = (resolutions: ConflictResolution[]) => {
    if (!pendingRemoteDocuments) return;

    const now = new Date().toISOString();
    const localDocs = snapshot.project.documents.map((d) => ({
      id: d.id,
      name: d.name,
      content: d.content,
      updatedAt: d.updatedAt
    }));
    const remoteDocs = pendingRemoteDocuments.map((d) => ({
      name: d.name,
      content: d.content
    }));

    const merged = applyResolutions(localDocs, remoteDocs, resolutions);

    setSnapshot((current) => ({
      ...current,
      project: {
        ...current.project,
        name: pendingRemoteProjectName ?? current.project.name,
        documents: merged.map((d) => ({
          id: d.id,
          name: d.name,
          content: d.content,
          updatedAt: d.updatedAt
        })),
        activeDocumentId: current.project.activeDocumentId,
        updatedAt: now
      }
    }));

    saveSyncSnapshot();
    setConflictSet(null);
    setPendingRemoteDocuments(null);
    setPendingRemoteProjectName(null);

    const resolvedCount = resolutions.length;
    setSyncFeedback({
      tone: "success",
      text: `Resolved ${resolvedCount} conflict${resolvedCount !== 1 ? "s" : ""}. Pull complete.`
    });
  };

  const handleSyncGitHub = async () => {
    if (!isOnline) {
      setSyncFeedback({
        tone: "error",
        text: "This device is offline. Local documents are still available."
      });
      return;
    }

    if (!hasRequiredConfig(githubConfig)) {
      setSyncFeedback({
        tone: "error",
        text: "Fill in owner, repo, branch, and token first. Leave directory blank to use the project name."
      });
      setSettingsTab("github");
      setIsSettingsOpen(true);
      return;
    }

    setIsSyncing(true);
    setSyncFeedback({
      tone: "neutral",
      text: `Syncing ${snapshot.project.documents.length} document${
        snapshot.project.documents.length === 1 ? "" : "s"
      } with GitHub...`
    });

    const pushResult = await pushProjectToGitHub(githubConfig, {
      projectName: snapshot.project.name,
      documents: snapshot.project.documents.map((document) => ({
        name: document.name,
        content: document.content
      })),
      commitMessage: `Sync ${snapshot.project.name} from typr`
    });

    if (!pushResult.ok) {
      setIsSyncing(false);
      setSyncFeedback({
        tone: "error",
        text: pushResult.message
      });
      return;
    }

    const pullResult = await pullProjectFromGitHub(githubConfig, {
      projectName: snapshot.project.name
    });

    setIsSyncing(false);

    if (!pullResult.ok || !pullResult.documents) {
      setSyncFeedback({
        tone: "error",
        text: `Pushed, but pull failed: ${pullResult.message}`
      });
      return;
    }

    const lastSnapshot = loadSyncSnapshot();
    const localDocs = snapshot.project.documents.map((d) => ({
      id: d.id,
      name: d.name,
      content: d.content,
      updatedAt: d.updatedAt
    }));
    const remoteDocs = pullResult.documents.map((d) => ({
      name: d.name,
      content: d.content
    }));

    const conflicts = detectConflicts(localDocs, remoteDocs, lastSnapshot);

    if (conflicts.conflicts.length > 0) {
      setPendingRemoteDocuments(pullResult.documents);
      setPendingRemoteProjectName(pullResult.projectName ?? null);
      setConflictSet(conflicts);
      setSyncFeedback({
        tone: "neutral",
        text: `Pushed. ${conflicts.conflicts.length} conflict${conflicts.conflicts.length !== 1 ? "s" : ""} found on pull.`
      });
      return;
    }

    applyPullResult(conflicts, pullResult.documents, pullResult.projectName ?? null);
  };

  const closeMenusWithDelay = useCallback(() => {
    cancelPendingMenuOpen();
    cancelPendingMenuClose();

    closeMenuTimerRef.current = window.setTimeout(() => {
      setActiveMenu(null);
      closeMenuTimerRef.current = null;
    }, MENU_CLOSE_DELAY_MS);
  }, [cancelPendingMenuClose, cancelPendingMenuOpen]);

  const openMenuWithDelay = useCallback(
    (menuLabel: MenuLabel) => {
      cancelPendingMenuClose();
      cancelPendingMenuOpen();

      if (activeMenu === null || activeMenu === menuLabel) {
        return;
      }

      openMenuTimerRef.current = window.setTimeout(() => {
        setActiveMenu(menuLabel);
        openMenuTimerRef.current = null;
      }, 1);
    },
    [activeMenu, cancelPendingMenuClose, cancelPendingMenuOpen]
  );

  const openMenuImmediately = useCallback(
    (menuLabel: MenuLabel) => {
      cancelPendingMenuClose();
      cancelPendingMenuOpen();
      setActiveMenu(menuLabel);
    },
    [cancelPendingMenuClose, cancelPendingMenuOpen]
  );

  const closeMenusImmediately = useCallback(() => {
    cancelPendingMenuClose();
    cancelPendingMenuOpen();
    setActiveMenu(null);
  }, [cancelPendingMenuClose, cancelPendingMenuOpen]);

  const handleMenuNavigate = useCallback(
    (currentLabel: MenuLabel, direction: -1 | 1) => {
      const currentIndex = MENU_ITEMS.indexOf(currentLabel);
      const nextIndex =
        (currentIndex + direction + MENU_ITEMS.length) % MENU_ITEMS.length;
      openMenuImmediately(MENU_ITEMS[nextIndex]);
    },
    [openMenuImmediately]
  );

  function handlePanelToggle(panel: "sidebar" | "preview") {
    if (panel === "sidebar") {
      setIsSidebarCollapsed((current) => !current);
      return;
    }

    setIsPreviewCollapsed((current) => !current);
  }

  function resetPanelWidths() {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    setPreviewRatio(0.5);
  }

  function setFullscreenMode(mode: WorkspaceMode) {
    setWorkspaceMode(mode);
  }

  function expandDiagramPaneForward() {
    setWorkspaceMode("split");
    setIsSidebarCollapsed(false);
    setDiagramPaneMode((currentMode) => {
      if (currentMode === "sidebar") {
        return "source";
      }

      if (currentMode === "source") {
        return "preview";
      }

      return currentMode;
    });
  }

  function expandDiagramPaneBackward() {
    setDiagramPaneMode((currentMode) => {
      if (currentMode === "preview") {
        return "source";
      }

      if (currentMode === "source") {
        return "sidebar";
      }

      return currentMode;
    });
  }

  function expandGraphPaneForward() {
    setWorkspaceMode("split");
    setIsSidebarCollapsed(false);
    setGraphPaneMode((currentMode) => {
      if (currentMode === "sidebar") {
        return "source";
      }

      if (currentMode === "source") {
        return "preview";
      }

      return currentMode;
    });
  }

  function expandGraphPaneBackward() {
    setGraphPaneMode((currentMode) => {
      if (currentMode === "preview") {
        return "source";
      }

      if (currentMode === "source") {
        return "sidebar";
      }

      return currentMode;
    });
  }

  function cycleSidebarTool(direction: -1 | 1) {
    setIsSidebarCollapsed(false);
    setActiveSidebarTool((currentTool) => {
      const currentIndex = SIDEBAR_TOOLS.findIndex((tool) => tool.id === currentTool);
      const nextIndex =
        (currentIndex + direction + SIDEBAR_TOOLS.length) % SIDEBAR_TOOLS.length;
      return SIDEBAR_TOOLS[nextIndex].id;
    });

    if (workspaceMode === "editor" || workspaceMode === "preview") {
      setWorkspaceMode("split");
    }
  }

  function describeWorkspaceMode(mode: WorkspaceMode) {
    if (mode === "split") {
      return "Split";
    }

    if (mode === "sidebar") {
      return "Sidebar only";
    }

    if (mode === "editor") {
      return "Editor only";
    }

    return "Preview only";
  }

  function createThemedPreviewSource(
    source: string,
    themeDefinition: ThemeDefinition,
    paperView: boolean
  ) {
    const previewTextFill = paperView ? "#000000" : themeDefinition.palette.editorForeground;
    return `#set text(fill: rgb("${previewTextFill}"))\n${source}`;
  }

  const beginPanelResize = useCallback(
    (edge: "sidebar" | "preview") => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (workspaceMode !== "split") {
        return;
      }

      const workspace = workspaceRef.current;
      if (!workspace) {
        return;
      }

      if (isMobileWorkspaceViewport(workspace.getBoundingClientRect().width)) {
        return;
      }

      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1080px)").matches) {
        return;
      }

      event.preventDefault();

      const workspaceWidth = workspace.getBoundingClientRect().width;
      const sidebarPaneWidth = isSidebarCollapsed ? 0 : sidebarWidth;
      const handleWidthTotal =
        (isSidebarCollapsed ? 0 : PANEL_HANDLE_WIDTH) + PANEL_HANDLE_WIDTH;
      const remainingWidth = Math.max(0, workspaceWidth - sidebarPaneWidth - handleWidthTotal);
      const startWidth =
        edge === "sidebar"
          ? sidebarWidth
          : getPreviewPaneWidth(workspaceWidth, sidebarPaneWidth, handleWidthTotal, previewRatio);
      panelResizeRef.current = {
        edge,
        startX: event.clientX,
        startWidth
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const resizeState = panelResizeRef.current;
        if (!resizeState || resizeState.edge !== edge) {
          return;
        }

        const delta = moveEvent.clientX - resizeState.startX;
        const nextWidth =
          edge === "sidebar"
            ? resizeState.startWidth + delta
            : resizeState.startWidth - delta;

        if (edge === "sidebar") {
          const maxWidth = Math.max(
            SIDEBAR_MIN_WIDTH,
            workspaceWidth - PANEL_HANDLE_WIDTH * 2 - PREVIEW_MIN_WIDTH
          );
          const clampedWidth = clampPanelWidth(
            nextWidth,
            SIDEBAR_MIN_WIDTH,
            Math.min(SIDEBAR_MAX_WIDTH, maxWidth)
          );
          setSidebarWidth(clampedWidth);
          if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
          }
        } else {
          const clampedWidth = clampPanelWidth(nextWidth, PREVIEW_MIN_WIDTH, Math.max(PREVIEW_MIN_WIDTH, remainingWidth));
          setPreviewRatio(remainingWidth > 0 ? clampPreviewRatio(clampedWidth / remainingWidth) : previewRatio);
          if (isPreviewCollapsed) {
            setIsPreviewCollapsed(false);
          }
        }
      };

      const stopResize = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
        panelResizeRef.current = null;
        panelResizeCleanupRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      panelResizeCleanupRef.current = stopResize;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [isPreviewCollapsed, isSidebarCollapsed, previewRatio, sidebarWidth, workspaceMode]
  );

  const canPushToGitHub = isOnline && hasRequiredConfig(githubConfig) && !isSyncing;
  const editorDiagnostics =
    compileResult === null
      ? []
      : compileResult.ok
        ? compileResult.diagnostics
        : compileResult.errors;
  const storageLabel =
    storageStatus === "saved"
      ? "Saved locally"
      : storageStatus === "saving"
        ? "Saving..."
        : storageStatus === "error"
          ? "Save failed"
          : "Local-first";
  const workspaceModeLabel = describeWorkspaceMode(workspaceMode);
  const allThemes = [...builtinThemes, ...customThemes];
  const allSnippets = useMemo(
    () => mergeSnippets([...DEFAULT_TYPST_SNIPPETS, ...customSnippets]),
    [customSnippets]
  );
  const filteredRepositoryPackages = useMemo(() => {
    return packageSearchResults;
  }, [packageSearchResults]);
  const installedPackageKeys = useMemo(
    () => new Set(packageCacheEntries.map((entry) => entry.reference.key)),
    [packageCacheEntries]
  );
  const visibleRepositoryPackages = useMemo(
    () => filteredRepositoryPackages.slice(0, packageSearchVisibleCount),
    [filteredRepositoryPackages, packageSearchVisibleCount]
  );
  const flatOutlineEntries = useMemo(
    () => collectOutlineEntries(activeDocumentTextContent),
    [activeDocumentTextContent]
  );
  const outlineEntries = useMemo(
    () => buildOutlineTree(flatOutlineEntries),
    [flatOutlineEntries]
  );
  const activeOutlineEntryId = useMemo(() => {
    const activeEntry = findActiveOutlineEntry(flatOutlineEntries, currentEditorLineNumber);
    return activeEntry ? `${activeEntry.lineNumber}:${activeEntry.level}:${activeEntry.title}` : null;
  }, [currentEditorLineNumber, flatOutlineEntries]);
  const lightThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "light");
  const darkThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "dark");
  const effectiveWorkspaceWidth =
    workspaceWidth > 0 ? workspaceWidth : typeof window !== "undefined" ? window.innerWidth : 0;
  const isMobileWorkspace =
    effectiveWorkspaceWidth > 0 && effectiveWorkspaceWidth <= MOBILE_WORKSPACE_THRESHOLD;
  const showDesktopSidebar = !isMobileWorkspace && !isSidebarCollapsed;
  const isDiagramInlineExpanded =
    showDesktopSidebar &&
    workspaceMode === "split" &&
    activeSidebarTool === "diagram" &&
    diagramPaneMode !== "sidebar";
  const isGraphInlineExpanded =
    showDesktopSidebar &&
    workspaceMode === "split" &&
    activeSidebarTool === "graph" &&
    graphPaneMode !== "sidebar";
  const isDiagramPreviewExpanded = isDiagramInlineExpanded && diagramPaneMode === "preview";
  const isGraphPreviewExpanded = isGraphInlineExpanded && graphPaneMode === "preview";
  const isSidebarInlineExpanded = isDiagramInlineExpanded || isGraphInlineExpanded;
  const showSourcePane = !isSidebarInlineExpanded && isSourceFileEditable;
  const showPreviewPane = !isDiagramPreviewExpanded && !isGraphPreviewExpanded;
  const sidebarPaneWidth = showDesktopSidebar ? sidebarWidth : 0;
  const baseSidebarHandleWidth = showDesktopSidebar ? PANEL_HANDLE_WIDTH : 0;
  const basePreviewHandleWidth = isMobileWorkspace ? 0 : PANEL_HANDLE_WIDTH;
  const baseHandleWidthTotal = baseSidebarHandleWidth + basePreviewHandleWidth;
  const sidebarPreviewGapWidth = showDesktopSidebar && !showSourcePane ? PANEL_HANDLE_WIDTH : 0;
  const previewPaneWidth = isPreviewCollapsed
    ? PANEL_COLLAPSED_WIDTH
    : showSourcePane || isSidebarInlineExpanded
    ? getPreviewPaneWidth(
        effectiveWorkspaceWidth,
        sidebarPaneWidth,
        baseHandleWidthTotal,
        previewRatio
      )
    : Math.max(0, effectiveWorkspaceWidth - sidebarPaneWidth - sidebarPreviewGapWidth - baseSidebarHandleWidth);
  const sidebarHandleWidth = showDesktopSidebar && showSourcePane ? PANEL_HANDLE_WIDTH : 0;
  const previewHandleWidth = !isMobileWorkspace && showPreviewPane && showSourcePane ? PANEL_HANDLE_WIDTH : 0;
  const handleWidthTotal = sidebarHandleWidth + previewHandleWidth;
  const sourcePaneWidth =
    showSourcePane && workspaceMode === "split" && effectiveWorkspaceWidth > 0
      ? Math.max(
          0,
          effectiveWorkspaceWidth - sidebarPaneWidth - previewPaneWidth - handleWidthTotal
        )
      : 0;
  const expandedSidebarPaneWidth = isSidebarInlineExpanded
    ? Math.max(0, effectiveWorkspaceWidth - previewPaneWidth - previewHandleWidth)
    : sidebarPaneWidth;
  const workspaceGridStyle: CSSProperties =
    isMobileWorkspace
      ? {
          display: "flex",
          flexDirection: "column"
        }
      : workspaceMode === "split" && (isDiagramPreviewExpanded || isGraphPreviewExpanded)
      ? {
          gridTemplateColumns: "minmax(0, 1fr)"
        }
      : workspaceMode === "split" && isSidebarInlineExpanded
      ? {
          gridTemplateColumns: `${expandedSidebarPaneWidth}px ${previewHandleWidth}px ${previewPaneWidth}px`
        }
      : workspaceMode === "split"
      ? {
          gridTemplateColumns: showDesktopSidebar
            ? showSourcePane
              ? `${sidebarPaneWidth}px ${sidebarHandleWidth}px ${sourcePaneWidth}px ${previewHandleWidth}px ${previewPaneWidth}px`
              : `${sidebarPaneWidth}px ${sidebarPreviewGapWidth}px ${previewPaneWidth}px`
            : showSourcePane
            ? `${sourcePaneWidth}px ${previewHandleWidth}px ${previewPaneWidth}px`
            : `${previewPaneWidth}px`
        }
      : {
          gridTemplateColumns: "minmax(0, 1fr)"
        };
  const sidebarVisibilityClass = isMobileWorkspace
    ? mobileWorkspaceTab === "files"
      ? "pane--mobile-active"
      : "pane--mobile-hidden"
    : "";
  const editorVisibilityClass = isMobileWorkspace
    ? mobileWorkspaceTab === "editor"
      ? "pane--mobile-active"
      : "pane--mobile-hidden"
    : "";
  const previewVisibilityClass = isMobileWorkspace
    ? mobileWorkspaceTab === "preview"
      ? "pane--mobile-active"
      : "pane--mobile-hidden"
    : "";
  const sidebarPaneCollapsed = !isMobileWorkspace && !showDesktopSidebar;
  const previewPaneCollapsed = isPreviewCollapsed && !isMobileWorkspace && showPreviewPane;
  const sidebarToolTitle = getSidebarToolTitle(activeSidebarTool);
  const filesPanelTitle = activeSidebarTool === "files" && isTrashViewOpen ? "Trash" : sidebarToolTitle;

  useEffect(() => {
    if (
      !isMobileWorkspace &&
      workspaceMode === "split" &&
      activeSidebarTool === "diagram" &&
      !isSidebarCollapsed
    ) {
      return;
    }

    setDiagramPaneMode("sidebar");
  }, [activeSidebarTool, isMobileWorkspace, isSidebarCollapsed, workspaceMode]);

  useEffect(() => {
    if (
      !isMobileWorkspace &&
      workspaceMode === "split" &&
      activeSidebarTool === "graph" &&
      !isSidebarCollapsed
    ) {
      return;
    }

    setGraphPaneMode("sidebar");
  }, [activeSidebarTool, isMobileWorkspace, isSidebarCollapsed, workspaceMode]);

  const handleOpenSidebarTool = useCallback(
    (tool: SidebarTool) => {
      const shouldOpenSearchPane = tool === "search" && (isSidebarCollapsed || activeSidebarTool !== tool);

      if (!isMobileWorkspace && activeSidebarTool === tool && !isSidebarCollapsed) {
        setIsSidebarCollapsed(true);
      } else {
        setActiveSidebarTool(tool);
        setIsSidebarCollapsed(false);
      }

      if (isMobileWorkspace) {
        setMobileWorkspaceTab("files");
      } else if (workspaceMode === "editor" || workspaceMode === "preview") {
        setWorkspaceMode("split");
      }

      if (tool !== "diagram") {
        setDiagramPaneMode("sidebar");
      }

      if (tool !== "graph") {
        setGraphPaneMode("sidebar");
      }

      if (shouldOpenSearchPane) {
        window.requestAnimationFrame(() => {
          openSearchPane();
        });
      }
    },
    [activeSidebarTool, isMobileWorkspace, isSidebarCollapsed, openSearchPane, workspaceMode]
  );

  const handleOpenWorkspaceDiagram = useCallback(
    (node: WorkspaceTreeNode) => {
      if (node.source.kind !== "diagram") {
        return;
      }

      setWorkspaceContextMenu(null);
      setInspectedWorkspacePath(null);
      const sourceDocument = snapshot.project.documents.find(
        (document) => typeof document.content === "string" && document.content.includes(node.path)
      );

      setSnapshot((currentSnapshot) => {
        const savedSnapshot = saveCurrentDiagram(currentSnapshot);
        const targetDiagram = savedSnapshot.project.figures.find((figure) => figure.id === node.source.id);

        if (!targetDiagram) {
          return savedSnapshot;
        }

        const withActiveDocument = sourceDocument
          ? setActiveDocument(savedSnapshot, sourceDocument.id)
          : savedSnapshot;

        return {
          ...withActiveDocument,
          project: {
            ...withActiveDocument.project,
            diagram: targetDiagram,
            updatedAt: new Date().toISOString()
          }
        };
      });

      if (sourceDocument) {
        const selectedPath = normalizeWorkspacePath(sourceDocument.name);
        setSelectedWorkspacePath(selectedPath);
        setSelectedWorkspacePaths([selectedPath]);
        setWorkspaceSelectionAnchorPath(selectedPath);
      } else {
        setSelectedWorkspacePath(node.path);
        setSelectedWorkspacePaths([node.path]);
        setWorkspaceSelectionAnchorPath(node.path);
      }

      if (sourceDocument) {
        setWorkspaceMode("split");
        setDiagramPaneMode("sidebar");
        if (isMobileWorkspace) {
          setMobileWorkspaceTab("editor");
        }
      }

      setActiveSidebarTool("diagram");
      setIsSidebarCollapsed(false);
      setWorkspaceMode("split");
      setDiagramPaneMode("sidebar");
      if (isMobileWorkspace) {
        setMobileWorkspaceTab("files");
      }
    },
    [isMobileWorkspace, snapshot.project.documents]
  );

  const handleOpenWorkspaceGraph = useCallback(
    (node: WorkspaceTreeNode) => {
      if (node.source.kind !== "graph") {
        return;
      }

      setWorkspaceContextMenu(null);
      setInspectedWorkspacePath(null);
      const sourceDocument = snapshot.project.documents.find(
        (document) => typeof document.content === "string" && document.content.includes(node.path)
      );

      setSnapshot((currentSnapshot) => {
        const savedSnapshot = saveCurrentGraph(currentSnapshot);
        const targetGraph = savedSnapshot.project.graphs.find((graphEntry) => graphEntry.id === node.source.id);

        if (!targetGraph) {
          return savedSnapshot;
        }

        const withActiveDocument = sourceDocument
          ? setActiveDocument(savedSnapshot, sourceDocument.id)
          : savedSnapshot;

        return {
          ...withActiveDocument,
          project: {
            ...withActiveDocument.project,
            graph: targetGraph,
            updatedAt: new Date().toISOString()
          }
        };
      });

      if (sourceDocument) {
        const selectedPath = normalizeWorkspacePath(sourceDocument.name);
        setSelectedWorkspacePath(selectedPath);
        setSelectedWorkspacePaths([selectedPath]);
        setWorkspaceSelectionAnchorPath(selectedPath);
      } else {
        setSelectedWorkspacePath(node.path);
        setSelectedWorkspacePaths([node.path]);
        setWorkspaceSelectionAnchorPath(node.path);
      }

      if (sourceDocument) {
        setWorkspaceMode("split");
        setGraphPaneMode("sidebar");
        if (isMobileWorkspace) {
          setMobileWorkspaceTab("editor");
        }
      }

      setActiveSidebarTool("graph");
      setIsSidebarCollapsed(false);
      setWorkspaceMode("split");
      setGraphPaneMode("sidebar");
      if (isMobileWorkspace) {
        setMobileWorkspaceTab("files");
      }
    },
    [isMobileWorkspace, snapshot.project.documents]
  );

  const handleInspectWorkspaceGraph = useCallback(
    (node: WorkspaceTreeNode) => {
      if (node.source.kind !== "graph") {
        return;
      }

      setWorkspaceContextMenu(null);
      setSelectedWorkspacePath(node.path);
      setSelectedWorkspacePaths([node.path]);
      setWorkspaceSelectionAnchorPath(node.path);
      setInspectedWorkspacePath(normalizeWorkspacePath(node.path));
      setWorkspaceMode("split");
      setIsPreviewCollapsed(false);
      if (isMobileWorkspace) {
        setMobileWorkspaceTab("editor");
      }
    },
    [isMobileWorkspace]
  );

  const handleOpenWorkspaceFile = useCallback(
    (path: string) => {
      const normalizedPath = normalizeWorkspacePath(path);
      setSelectedWorkspacePath(normalizedPath);
      setSelectedWorkspacePaths([normalizedPath]);
      setWorkspaceSelectionAnchorPath(normalizedPath);
      setWorkspaceContextMenu(null);

      if (isTrashViewOpen) {
        return;
      }

      const matchingDocument = snapshot.project.documents.find(
        (document) =>
          normalizeWorkspacePath(document.name) === normalizedPath &&
          isTextWorkspaceFile(document.name)
      );

      if (matchingDocument) {
        setInspectedWorkspacePath(null);
        handleSelectDocument(matchingDocument.id);
        return;
      }

      const matchingNode = findWorkspaceNodeByPath(visibleWorkspaceTree, normalizedPath);

      if (matchingNode && matchingNode.kind === "file") {
        if (matchingNode.source.kind === "diagram") {
          handleOpenWorkspaceDiagram(matchingNode);
          return;
        }

        if (matchingNode.source.kind === "graph") {
          handleOpenWorkspaceGraph(matchingNode);
          return;
        }

        setInspectedWorkspacePath(null);
        setWorkspaceMode("split");
        setIsPreviewCollapsed(false);
      }
    },
    [
      handleOpenWorkspaceDiagram,
      handleOpenWorkspaceGraph,
      isTrashViewOpen,
      snapshot.project.documents,
      visibleWorkspaceTree
    ]
  );

  const handleToggleTrashView = useCallback(() => {
    setIsTrashViewOpen((current) => !current);
    setWorkspaceContextMenu(null);
    setRenamingWorkspacePath(null);
    setWorkspaceRenameDraft("");
    setDraggedWorkspacePath(null);
    setWorkspaceDropTargetPath(null);
  }, []);
  const focusDocumentLocation = useCallback(
    (documentId: string, line: number, column = 1) => {
      setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, documentId));
      setWorkspaceMode("split");
      if (isMobileWorkspace) {
        setMobileWorkspaceTab("editor");
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          editorRef.current?.focusRange({ line, column });
        });
      });
    },
    [isMobileWorkspace]
  );

  return (
    <div className="app-shell">
      <header className="menubar">
        <nav
          aria-label="Workspace menus"
          className="menu-strip"
          onMouseEnter={cancelPendingMenuClose}
          onMouseLeave={closeMenusWithDelay}
          ref={menuStripRef}
        >
          <MenuDropdown
            activeMenu={activeMenu}
            onCloseImmediately={closeMenusImmediately}
            label="Typr"
            onClose={closeMenusWithDelay}
            onNavigate={handleMenuNavigate}
            onOpen={() => openMenuWithDelay("Typr")}
            onOpenImmediately={() => openMenuImmediately("Typr")}
          >
            <button
              className="menu-action"
              onClick={() => {
                setSettingsTab("github");
                setIsSettingsOpen(true);
                setActiveMenu(null);
              }}
              type="button"
            >
              Settings
            </button>
            <button className="menu-action" onClick={handleShowVersion} type="button">
              Version {APP_VERSION}
            </button>
            <button className="menu-action" onClick={handleShowAbout} type="button">
              About
            </button>
          </MenuDropdown>

          <MenuDropdown
            activeMenu={activeMenu}
            onCloseImmediately={closeMenusImmediately}
            label="File"
            onClose={closeMenusWithDelay}
            onNavigate={handleMenuNavigate}
            onOpen={() => openMenuWithDelay("File")}
            onOpenImmediately={() => openMenuImmediately("File")}
          >
            <button className="menu-action" onClick={handleNewDocument} type="button">
              New
            </button>
            <button
              className="menu-action"
              onClick={() => {
                handleRenameDocument();
                setActiveMenu(null);
              }}
              type="button"
            >
              Rename file
            </button>
            <button
              className="menu-action"
              onClick={() => {
                handleRenameProject();
                setActiveMenu(null);
              }}
              type="button"
            >
              Rename project
            </button>
            <button
              className="menu-action"
              onClick={() => documentUploadInputRef.current?.click()}
              type="button"
            >
              Upload .typ
            </button>
            <button className="menu-action" onClick={handleDownloadDocument} type="button">
              Download .typ
            </button>
            <button className="menu-action" onClick={handleDownloadProject} type="button">
              Download project
            </button>
            <button
              className="menu-action"
              disabled={isExportingPdf}
              onClick={handleExportPdf}
              type="button"
            >
              {isExportingPdf ? "Exporting PDF..." : "Export PDF"}
            </button>
          </MenuDropdown>

          <MenuDropdown
            activeMenu={activeMenu}
            onCloseImmediately={closeMenusImmediately}
            label="Edit"
            onClose={closeMenusWithDelay}
            onNavigate={handleMenuNavigate}
            onOpen={() => openMenuWithDelay("Edit")}
            onOpenImmediately={() => openMenuImmediately("Edit")}
          >
            <button
              className="menu-action"
              onClick={handleUndo}
              type="button"
            >
              Undo
            </button>
            <button
              className="menu-action"
              onClick={handleRedo}
              type="button"
            >
              Redo
            </button>
            <button
              className="menu-action"
              onClick={openSearchPane}
              type="button"
            >
              Search
            </button>
            <button
              className="menu-action"
              onClick={handleGoToLine}
              type="button"
            >
              Go to line
            </button>
            <button className="menu-action" onClick={handleSelectAll} type="button">
              Select all
            </button>
          </MenuDropdown>

          <MenuDropdown
            activeMenu={activeMenu}
            onCloseImmediately={closeMenusImmediately}
            label="View"
            onClose={closeMenusWithDelay}
            onNavigate={handleMenuNavigate}
            onOpen={() => openMenuWithDelay("View")}
            onOpenImmediately={() => openMenuImmediately("View")}
          >
              <button className="menu-action" onClick={() => handleOpenSidebarTool("files")} type="button">
                Files
              </button>
            <button className="menu-action" onClick={() => handleOpenSidebarTool("diagram")} type="button">
              Diagram
            </button>
            <button className="menu-action" onClick={() => handleOpenSidebarTool("graph")} type="button">
              Graph
            </button>
            <button className="menu-action" onClick={() => setFullscreenMode("editor")} type="button">
              Editor
            </button>
            <button className="menu-action" onClick={() => setFullscreenMode("preview")} type="button">
              Preview
            </button>
            <button className="menu-action" onClick={openSearchPane} type="button">
              Search
            </button>
            <button className="menu-action" onClick={togglePreviewPopup} type="button">
              {isPreviewPopupOpen ? "Hide preview in popup" : "Show preview in popup"}
            </button>
            <button className="menu-action" onClick={() => setPreviewZoomStep(-1)} type="button">
              Zoom out
            </button>
            <button className="menu-action" onClick={() => setPreviewZoomStep(1)} type="button">
              Zoom in
            </button>
          </MenuDropdown>

          <MenuDropdown
            activeMenu={activeMenu}
            onCloseImmediately={closeMenusImmediately}
            label="Help"
            onClose={closeMenusWithDelay}
            onNavigate={handleMenuNavigate}
            onOpen={() => openMenuWithDelay("Help")}
            onOpenImmediately={() => openMenuImmediately("Help")}
          >
            <button className="menu-action" onClick={handleShowTutorial} type="button">
              Tutorial
            </button>
            <button className="menu-action" onClick={handleOpenTypstReference} type="button">
              Reference (typst)
            </button>
            <button className="menu-action" onClick={handleOpenGitHubHelp} type="button">
              How to connect to Github
            </button>
          </MenuDropdown>
        </nav>

        <div className="menubar__cluster menubar__cluster--right">
          <span
            aria-label={isOnline ? "Online" : "Offline"}
            className={`status-pill status-pill--icon ${
              isOnline ? "status-pill--online" : "status-pill--offline"
            }`}
            title={isOnline ? "Online" : "Offline"}
          >
            <span
              aria-hidden="true"
              className={`status-pill__icon ${
                isOnline
                  ? "status-pill__icon--online"
                  : "status-pill__icon--offline"
              }`}
            />
          </span>
        </div>
      </header>

      <div className={`workspace-shell ${isMobileWorkspace ? "workspace-shell--mobile" : ""}`}>
      {isMobileWorkspace ? null : (
        <aside className="activity-bar" aria-label="Sidebar tools">
          {SIDEBAR_TOOLS.map((tool) => (
            <button
              key={tool.id}
              aria-label={tool.label}
              aria-pressed={activeSidebarTool === tool.id && !sidebarPaneCollapsed}
              className={`activity-bar__button ${
                activeSidebarTool === tool.id && !sidebarPaneCollapsed
                  ? "activity-bar__button--active"
                  : ""
              }`}
              onClick={() => handleOpenSidebarTool(tool.id)}
              title={tool.label}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`activity-icon activity-icon--${tool.id}`}
              />
              <span className="visually-hidden">{tool.label}</span>
            </button>
          ))}
        </aside>
      )}

      <div className="workspace-main">

      <main
        className={`workspace workspace--triple workspace--${workspaceMode} ${
          isMobileWorkspace ? "workspace--mobile" : ""
        }`}
        ref={workspaceRef}
        style={workspaceGridStyle}
      >
        {isMobileWorkspace ? (
          <div className="workspace-mobile-switcher" role="tablist" aria-label="Workspace panes">
            <button
              aria-selected={mobileWorkspaceTab === "files"}
              className={`workspace-mobile-tab ${
                mobileWorkspaceTab === "files" ? "workspace-mobile-tab--active" : ""
              }`}
              onClick={() => setMobileWorkspaceTab("files")}
              role="tab"
              type="button"
            >
              Files
            </button>
            <button
              aria-selected={mobileWorkspaceTab === "editor"}
              className={`workspace-mobile-tab ${
                mobileWorkspaceTab === "editor" ? "workspace-mobile-tab--active" : ""
              }`}
              onClick={() => setMobileWorkspaceTab("editor")}
              role="tab"
              type="button"
            >
              Source
            </button>
            <button
              aria-selected={mobileWorkspaceTab === "preview"}
              className={`workspace-mobile-tab ${
                mobileWorkspaceTab === "preview" ? "workspace-mobile-tab--active" : ""
              }`}
              onClick={() => setMobileWorkspaceTab("preview")}
              role="tab"
              type="button"
            >
              Preview
            </button>
          </div>
        ) : null}

        {showDesktopSidebar || isMobileWorkspace ? (
          <aside
            className={`pane pane--sidebar ${sidebarVisibilityClass}`}
            aria-label="Files and sync"
          >
            <>
              <div className="pane__header">
                <div className="pane__header-group">
                  <h2>{filesPanelTitle}</h2>
                </div>
                <div className="pane__header-actions">
                  {activeSidebarTool === "files" ? (
                    <>
                      <button
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={handleNewDocument}
                        type="button"
                        aria-label="New file"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--new-file" />
                      </button>
                      <button
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={handleAddFolder}
                        type="button"
                        aria-label="New folder"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--new-folder" />
                      </button>
                      <button
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={() => documentUploadInputRef.current?.click()}
                        type="button"
                        aria-label="Upload .typ"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--upload" />
                      </button>
                      <button
                        aria-label={isTrashViewOpen ? "Close trash" : "Open trash"}
                        aria-pressed={isTrashViewOpen}
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={handleToggleTrashView}
                        type="button"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--trash" />
                      </button>
                    </>
                  ) : activeSidebarTool === "sync" ? (
                    <button
                      className="pane__button"
                      disabled={!canPushToGitHub}
                      onClick={() => {
                        void handlePushToGitHub();
                      }}
                      type="button"
                    >
                      {isSyncing ? "Pushing..." : "Push"}
                    </button>
                  ) : activeSidebarTool === "diagram" &&
                    isDiagramInlineExpanded &&
                    !snapshot.preferences.liveCompilation ? (
                    <button
                      className="pane__button"
                      onClick={handleCompile}
                      title={`Compile (${compileShortcutLabel})`}
                      type="button"
                    >
                      Compile
                    </button>
                  ) : null}
                </div>
              </div>

              {activeSidebarTool === "files" ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable sidebar-section--files"
                >
                  {isTrashViewOpen ? (
                    <div className="sidebar-section__actions">
                      <button
                        className="pane__button pane__button--danger"
                        disabled={snapshot.project.trash.length === 0}
                        onClick={handleEmptyWorkspaceTrash}
                        type="button"
                      >
                        Empty Trash
                      </button>
                    </div>
                  ) : null}
                  <WorkspaceTree
                    collapsedPaths={collapsedFileFolders}
                    dropTargetPath={workspaceDropTargetPath}
                    nodes={visibleWorkspaceTree}
                    rootLabel={isTrashViewOpen ? "Trash" : snapshot.project.name}
                    rootIsRenameable={!isTrashViewOpen}
                    renamingPath={renamingWorkspacePath}
                    renameDraft={workspaceRenameDraft}
                    selectedPaths={selectedWorkspacePaths}
                    selectedPath={normalizedSelectedWorkspacePath}
                    onActivateNode={handleActivateWorkspaceNode}
                    onDragEnd={handleWorkspaceDragEnd}
                    onDragStart={handleWorkspaceDragStart}
                    onDropAtRoot={handleWorkspaceDropAtRoot}
                    onDropIntoFolder={handleWorkspaceDropIntoFolder}
                    onFolderDragHover={handleWorkspaceFolderDragHover}
                    onOpenFile={handleOpenWorkspaceFile}
                    onToggleFolder={handleToggleFolder}
                    onRenameDraftChange={setWorkspaceRenameDraft}
                    onRenameCancel={handleCancelWorkspaceRename}
                    onRenameCommit={handleCommitWorkspaceRename}
                    onRequestRootContextMenu={handleRequestWorkspaceRootContextMenu}
                    onRequestRootRename={handleRequestWorkspaceRootRename}
                    onRequestRename={handleRequestWorkspaceRename}
                    onRequestContextMenu={handleRequestWorkspaceContextMenu}
                  />
                  {workspaceLoadError ? (
                    <p className="sidebar-card__copy">{workspaceLoadError}</p>
                  ) : null}
                  {workspaceContextMenu && workspaceContextMenuPosition ? (
                    <div
                      className="workspace-context-menu"
                      onPointerDown={(event) => event.stopPropagation()}
                      role="menu"
                      style={
                        {
                          left: `${workspaceContextMenuPosition.left}px`,
                          top: `${workspaceContextMenuPosition.top}px`
                        } as CSSProperties
                      }
                    >
                      {workspaceContextMenu.kind === "project-root" ? (
                        <button
                          className="workspace-context-menu__item"
                          onClick={handleRequestWorkspaceRootRename}
                          type="button"
                        >
                          Rename
                        </button>
                      ) : null}
                      {workspaceContextMenu.kind === "node" &&
                      workspaceContextMenu.node.source.kind === "graph" ? (
                        <button
                          className="workspace-context-menu__item"
                          onClick={() => handleInspectWorkspaceGraph(workspaceContextMenu.node)}
                          type="button"
                        >
                          Inspect
                        </button>
                      ) : null}
                      {workspaceContextMenu.kind === "node" &&
                      (workspaceContextMenu.node.source.kind === "document" ||
                        workspaceContextMenu.node.source.kind === "diagram" ||
                        workspaceContextMenu.node.source.kind === "graph") ? (
                        <button
                          className="workspace-context-menu__item"
                          onClick={() =>
                            workspaceContextMenu.node.source.kind === "diagram"
                              ? handleOpenWorkspaceDiagram(workspaceContextMenu.node)
                              : workspaceContextMenu.node.source.kind === "graph"
                                ? handleOpenWorkspaceGraph(workspaceContextMenu.node)
                              : handleOpenWorkspaceFile(workspaceContextMenu.node.path)
                          }
                          type="button"
                        >
                          {workspaceContextMenu.node.source.kind === "document" ? "Open" : "Edit"}
                        </button>
                      ) : null}
                      {workspaceContextMenu.kind === "node" &&
                      (workspaceContextMenu.node.source.kind === "document" ||
                        workspaceContextMenu.node.source.kind === "folder" ||
                        workspaceContextMenu.node.source.kind === "diagram" ||
                        workspaceContextMenu.node.source.kind === "graph") ? (
                        <button
                          className="workspace-context-menu__item"
                          onClick={() => handleRequestWorkspaceRename(workspaceContextMenu.node)}
                          type="button"
                        >
                          Rename
                        </button>
                      ) : null}
                      {workspaceContextMenu.kind === "node" &&
                      (workspaceContextMenu.node.source.kind === "document" ||
                        workspaceContextMenu.node.source.kind === "folder" ||
                        workspaceContextMenu.node.source.kind === "diagram" ||
                        workspaceContextMenu.node.source.kind === "graph") ? (
                        <button
                          className="workspace-context-menu__item"
                          onClick={() => handleRequestWorkspaceMove(workspaceContextMenu.node)}
                          type="button"
                        >
                          Move
                        </button>
                      ) : null}
                      {workspaceContextMenu.kind === "node" &&
                      (workspaceContextMenu.node.source.kind === "document" ||
                        workspaceContextMenu.node.source.kind === "folder" ||
                        workspaceContextMenu.node.source.kind === "diagram" ||
                        workspaceContextMenu.node.source.kind === "graph") ? (
                        <button
                          className="workspace-context-menu__item workspace-context-menu__item--danger"
                          onClick={() => handleDeleteWorkspaceNode(workspaceContextMenu.node)}
                          type="button"
                        >
                          Delete
                        </button>
                      ) : null}
                      {workspaceContextMenu.kind === "node" && workspaceContextMenu.node.source.kind === "trash-item" ? (
                        (() => {
                          const trashSource = workspaceContextMenu.node.source;

                          return (
                            <>
                              <button
                                className="workspace-context-menu__item"
                                onClick={() => handleRestoreWorkspaceTrashEntry(trashSource.id)}
                                type="button"
                              >
                                Restore
                              </button>
                              <button
                                className="workspace-context-menu__item workspace-context-menu__item--danger"
                                onClick={() => handleDeleteWorkspaceNode(workspaceContextMenu.node)}
                                type="button"
                              >
                                Delete Permanently
                              </button>
                            </>
                          );
                        })()
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {activeSidebarTool === "search" ? (
                <section className="sidebar-section sidebar-section--scrollable">
                  <div className="sidebar-search-panel">
                    <div className="sidebar-search-panel__row">
                      <label className="sync-field sidebar-search-panel__field">
                        <input
                          ref={searchInputRef}
                          onChange={(event) => updateSearchQuery({ search: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              if (event.shiftKey) {
                                handleFindPrevious();
                              } else {
                                handleFindNext();
                              }
                            }
                          }}
                          placeholder="Search"
                          type="text"
                          value={searchQuery.search}
                        />
                      </label>
                    </div>

                    <div className="sidebar-search-panel__actions sidebar-search-panel__actions--pair">
                      <button
                        className="pane__button pane__button--compact"
                        onClick={handleFindPrevious}
                        type="button"
                      >
                        Previous
                      </button>
                      <button
                        className="pane__button pane__button--compact"
                        onClick={handleFindNext}
                        type="button"
                      >
                        Next
                      </button>
                    </div>

                    <div className="sidebar-search-panel__actions sidebar-search-panel__actions--full">
                      <button
                        className="pane__button pane__button--compact"
                        onClick={handleSelectMatches}
                        type="button"
                      >
                        All
                      </button>
                    </div>

                    <div className="sidebar-search-panel__toggles">
                      <label className="sidebar-search-toggle">
                        <input
                          checked={searchQuery.caseSensitive}
                          onChange={(event) =>
                            updateSearchQuery({ caseSensitive: event.target.checked })
                          }
                          type="checkbox"
                        />
                        <span>Match case</span>
                      </label>
                      <label className="sidebar-search-toggle">
                        <input
                          checked={searchQuery.regexp}
                          onChange={(event) => updateSearchQuery({ regexp: event.target.checked })}
                          type="checkbox"
                        />
                        <span>Regexp</span>
                      </label>
                      <label className="sidebar-search-toggle">
                        <input
                          checked={searchQuery.wholeWord}
                          onChange={(event) =>
                            updateSearchQuery({ wholeWord: event.target.checked })
                          }
                          type="checkbox"
                        />
                        <span>By word</span>
                      </label>
                    </div>

                    <div className="sidebar-search-panel__row">
                      <label className="sync-field sidebar-search-panel__field">
                        <input
                          onChange={(event) => updateSearchQuery({ replace: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleReplaceNext();
                            }
                          }}
                          placeholder="Replace"
                          type="text"
                          value={searchQuery.replace}
                        />
                      </label>
                    </div>

                    <div className="sidebar-search-panel__actions sidebar-search-panel__actions--pair">
                      <button
                        className="pane__button pane__button--compact"
                        onClick={handleReplaceNext}
                        type="button"
                      >
                        Replace
                      </button>
                      <button
                        className="pane__button pane__button--compact"
                        onClick={handleReplaceAll}
                        type="button"
                      >
                        Replace all
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeSidebarTool === "outline" ? (
                <section className="sidebar-section sidebar-section--scrollable">
                  {outlineEntries.length > 0 ? (
                    <div className="outline-list" role="list">
                      {renderOutlineEntries(
                        outlineEntries,
                        activeDocument.id,
                        activeOutlineEntryId,
                        collapsedOutlineEntries,
                        setCollapsedOutlineEntries,
                        focusDocumentLocation
                      )}
                    </div>
                  ) : (
                    <div className="snippet-empty">
                      Add Typst headings like <code>= Section</code> to build an outline.
                    </div>
                  )}
                </section>
              ) : null}

              {activeSidebarTool === "diagram" ? (
                <section
                  className={`sidebar-section sidebar-section--scrollable sidebar-section--pane-editor ${
                    isDiagramInlineExpanded ? "sidebar-section--pane-expanded" : ""
                  }`}
                >
                  <DiagramEditorErrorBoundary>
                    <DiagramEditor
                      diagram={diagram}
                      inkColor={diagramInkColor}
                      fillColor={diagramFillColor}
                      strokeStyle={diagramStrokeStyle}
                      strokeWidth={diagramStrokeWidth}
                      startMarker={diagramStartMarker}
                      endMarker={diagramEndMarker}
                      isExpanded={isDiagramInlineExpanded}
                      onAddStroke={handleAddDiagramStroke}
                      onAddShape={handleAddDiagramShape}
                      onUpdateStroke={handleUpdateDiagramStroke}
                      onUpdateShape={handleUpdateDiagramShape}
                      onUpdateFrame={handleUpdateDiagramFrame}
                      onRemoveStroke={handleRemoveDiagramStroke}
                      onRemoveShape={handleRemoveDiagramShape}
                      onClear={handleClearDiagram}
                      onNew={handleNewDiagram}
                      onSave={handleSaveDiagram}
                      onInsertIntoDocument={handleInsertDiagramIntoDocument}
                      onRename={handleRenameDiagram}
                      onDownloadSvg={handleDownloadDiagramSvg}
                      onUndo={handleUndoDiagramStroke}
                      onInkColorChange={setDiagramInkColor}
                      onFillColorChange={setDiagramFillColor}
                      onStrokeStyleChange={setDiagramStrokeStyle}
                      onStrokeWidthChange={setDiagramStrokeWidth}
                      onStartMarkerChange={setDiagramStartMarker}
                      onEndMarkerChange={setDiagramEndMarker}
                      onExpandLeft={
                        isDiagramInlineExpanded ? expandDiagramPaneBackward : undefined
                      }
                      onExpandRight={
                        !isMobileWorkspace && diagramPaneMode !== "preview"
                          ? expandDiagramPaneForward
                          : undefined
                      }
                      paperView={isPaperView}
                    />
                  </DiagramEditorErrorBoundary>
                </section>
              ) : null}

              {activeSidebarTool === "graph" ? (
                <section
                  className={`sidebar-section sidebar-section--scrollable sidebar-section--pane-editor ${
                    isGraphInlineExpanded ? "sidebar-section--pane-expanded" : ""
                  }`}
                >
                  <GraphEditorErrorBoundary>
                    <GraphEditor
                      graph={graph}
                      isExpanded={isGraphInlineExpanded}
                      previewLayoutKey={graphPaneMode}
                      onExpandLeft={
                        isGraphInlineExpanded ? expandGraphPaneBackward : undefined
                      }
                      onExpandRight={
                        !isMobileWorkspace && graphPaneMode !== "preview"
                          ? expandGraphPaneForward
                          : undefined
                      }
                      onInsertIntoDocument={handleInsertGraphIntoDocument}
                      onDownloadGraph={handleDownloadGraph}
                      onNew={handleNewGraph}
                      onRename={handleRenameGraph}
                      onSave={handleSaveGraph}
                      paperView={isPaperView}
                    />
                  </GraphEditorErrorBoundary>
                </section>
              ) : null}

              {activeSidebarTool === "sync" ? (
                <section className="sidebar-section sidebar-section--scrollable">
                  <div className="sync-stack">
                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>GitHub sync</span>
                        <span className="pane__meta">{isOnline ? "Ready" : "Offline"}</span>
                      </div>
                      <p className="sidebar-card__copy">{syncFeedback.text}</p>
                      <div className="sidebar-card__actions">
                        <button
                          className="pane__button"
                          onClick={() => {
                            setSettingsTab("github");
                            setIsSettingsOpen(true);
                          }}
                          type="button"
                        >
                          Settings
                        </button>
                        <button
                          className="pane__button"
                          disabled={!canPushToGitHub}
                          onClick={() => {
                            void handlePullFromGitHub();
                          }}
                          type="button"
                        >
                          {isSyncing ? "Pulling..." : "Pull"}
                        </button>
                        <button
                          className="pane__button"
                          disabled={!canPushToGitHub}
                          onClick={() => {
                            void handlePushToGitHub();
                          }}
                          type="button"
                        >
                          {isSyncing ? "Pushing..." : "Push"}
                        </button>
                        <button
                          className="pane__button"
                          disabled={!canPushToGitHub}
                          onClick={() => {
                            void handleSyncGitHub();
                          }}
                          type="button"
                        >
                          {isSyncing ? "Syncing..." : "Sync"}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeSidebarTool === "debug" ? (
                <section className="sidebar-section sidebar-section--scrollable">
                  <div className="sync-stack">
                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Preview debug</span>
                        <span className="pane__meta">
                          {isPreviewDebugVisible ? "Visible" : "Hidden"}
                        </span>
                      </div>
                      <p className="sidebar-card__copy">
                        Show the debug panel beneath the preview when you need it.
                      </p>
                      <div className="sidebar-card__actions">
                        <button
                          className="pane__button pane__button--compact"
                          onClick={togglePreviewDebug}
                          type="button"
                        >
                          {isPreviewDebugVisible ? "Hide debug" : "Show debug"}
                        </button>
                      </div>
                    </div>

                    {isPreviewDebugVisible ? (
                      <div className="sidebar-preview-debug">
                        <PreviewDebugPanel
                          markup={
                            compileResult?.ok
                              ? compileResult.output.content
                              : lastSuccessfulResult?.output.content ?? ""
                          }
                        />
                      </div>
                    ) : null}

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Compiler</span>
                        <span className="pane__meta">{compilerStatus.label}</span>
                      </div>
                      <p className="sidebar-card__copy">
                        {compilerStatus.detail ?? "Live preview pipeline is active."}
                      </p>
                    </div>

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Diagnostics</span>
                        <span className="pane__meta">{editorDiagnostics.length}</span>
                      </div>
                      {editorDiagnostics.length > 0 ? (
                        <div className="sidebar-diagnostics" role="list">
                          {editorDiagnostics.map((diagnostic, index) => (
                            <div className="sidebar-diagnostic" key={`${diagnostic.message}:${index}`}>
                              <strong>{diagnostic.severity}</strong>
                              <span>{diagnostic.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="sidebar-card__copy">No compiler diagnostics right now.</p>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          </aside>
        ) : null}

        {showDesktopSidebar && showSourcePane ? (
          <button
            aria-label="Resize sidebar"
            className="workspace-handle workspace-handle--left"
            onPointerDown={beginPanelResize("sidebar")}
            type="button"
          />
        ) : showDesktopSidebar && !showSourcePane ? (
          <div aria-hidden="true" className="workspace-gap workspace-gap--sidebar-preview" />
        ) : null}

        {showSourcePane ? (
        <section
          className={`pane pane--editor ${editorVisibilityClass}`}
          aria-label="Typst source editor"
        >
          <div className="pane__header">
            <div className="pane__header-group">
              <h2>Source</h2>
            </div>
            <div className="pane__header-actions">
              {snapshot.preferences.liveCompilation || !isSourceFileEditable ? null : (
                <button
                  className="pane__button"
                  onClick={handleCompile}
                  title={`Compile (${compileShortcutLabel})`}
                  type="button"
                >
                  Compile
                </button>
              )}
                <button
                  className="pane__button pane__button--quiet"
                  onClick={() => setIsSourceToolbarVisible((current) => !current)}
                  type="button"
                  disabled={!isSourceFileEditable}
                  aria-pressed={isSourceToolbarVisible}
                  aria-label={isSourceToolbarVisible ? "Hide source toolbar" : "Show source toolbar"}
                >
                <span
                  aria-hidden="true"
                  className={`toolbar-icon toolbar-icon--toggle ${
                    isSourceToolbarVisible ? "toolbar-icon--toggle-open" : "toolbar-icon--toggle-closed"
                  }`}
                />
              </button>
            </div>
          </div>
          {isSourceToolbarVisible && isSourceFileEditable ? (
            <div className="pane__toolbar pane__toolbar--source" aria-label="Source toolbar">
              <div className="pane__toolbar-section">
                <div className="pane__toolbar-group">
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleBold}
                    type="button"
                    aria-label="Bold"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--bold" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleItalic}
                    type="button"
                    aria-label="Italic"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--italic" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleUnderline}
                    type="button"
                    aria-label="Underline"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--underline" />
                  </button>
                </div>
              </div>

              <div className="pane__toolbar-section">
                <div className="pane__toolbar-group">
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleBulletList}
                    type="button"
                    aria-label="Bulleted list"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--bullet-list" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleNumberedList}
                    type="button"
                    aria-label="Numbered list"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--numbered-list" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleMathMode}
                    type="button"
                    aria-label="Math mode"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--math" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleCycleHeading}
                    type="button"
                    aria-label="Cycle heading level"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--heading" />
                  </button>
                  <div className={`matrix-menu ${openToolbarMenu === "matrix" ? "matrix-menu--open" : ""}`}>
                    <button
                      aria-expanded={openToolbarMenu === "matrix"}
                      aria-label="Matrix options"
                      className="pane__button pane__button--compact pane__icon-button"
                      onClick={() => toggleToolbarMenu("matrix")}
                      type="button"
                    >
                      <span aria-hidden="true" className="toolbar-icon toolbar-icon--matrix" />
                    </button>
                    {openToolbarMenu === "matrix" ? (
                    <div className="matrix-menu__panel" role="menu" aria-label="Matrix options">
                      <label className="matrix-menu__field">
                        <span>Rows</span>
                        <select
                          onChange={(event) =>
                            setMatrixSettings((current) => ({
                              ...current,
                              rows: Number(event.target.value)
                            }))
                          }
                          value={matrixSettings.rows}
                        >
                          {MATRIX_ROW_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="matrix-menu__field">
                        <span>Columns</span>
                        <select
                          onChange={(event) =>
                            setMatrixSettings((current) => ({
                              ...current,
                              columns: Number(event.target.value)
                            }))
                          }
                          value={matrixSettings.columns}
                        >
                          {MATRIX_COLUMN_OPTIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="matrix-menu__delimiters" role="group" aria-label="Brackets">
                        {MATRIX_DELIMITER_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            className={`matrix-menu__delimiter ${
                              matrixSettings.delimiter === option.id
                                ? "matrix-menu__delimiter--active"
                                : ""
                            }`}
                            onClick={() =>
                              setMatrixSettings((current) => ({
                                ...current,
                                delimiter: option.id
                              }))
                            }
                            type="button"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <button
                        className="pane__button matrix-menu__insert"
                        onClick={() => {
                          handleInsertMatrix();
                          setOpenToolbarMenu(null);
                        }}
                        type="button"
                      >
                        Insert matrix
                      </button>
                    </div>
                    ) : null}
                  </div>
                  <div className={`table-menu ${openToolbarMenu === "table" ? "table-menu--open" : ""}`}>
                    <button
                      aria-expanded={openToolbarMenu === "table"}
                      aria-label="Table options"
                      className="pane__button pane__button--compact pane__icon-button"
                      onClick={() => toggleToolbarMenu("table")}
                      type="button"
                    >
                      <span aria-hidden="true" className="toolbar-icon toolbar-icon--table" />
                    </button>
                    {openToolbarMenu === "table" ? (
                    <div className="table-menu__panel" role="menu" aria-label="Table options">
                      <div className="table-menu__grid">
                        <label className="table-menu__field">
                          <span>Rows</span>
                          <select
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                rows: Number(event.target.value)
                              }))
                            }
                            value={tableSettings.rows}
                          >
                            {TABLE_ROW_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="table-menu__field">
                          <span>Columns</span>
                          <select
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                columns: Number(event.target.value)
                              }))
                            }
                            value={tableSettings.columns}
                          >
                            {TABLE_COLUMN_OPTIONS.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="table-menu__field">
                          <span>Alignment</span>
                          <select
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                align: event.target.value as TableAlignment
                              }))
                            }
                            value={tableSettings.align}
                          >
                            {TABLE_ALIGNMENT_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="table-menu__field">
                          <span>Gutter</span>
                          <select
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                gutter: event.target.value as TableGutter
                              }))
                            }
                            value={tableSettings.gutter}
                          >
                            {TABLE_GUTTER_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="table-menu__field">
                          <span>Inset</span>
                          <select
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                inset: event.target.value as TableInset
                              }))
                            }
                            value={tableSettings.inset}
                          >
                            {TABLE_INSET_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="table-menu__field">
                          <span>Stroke</span>
                          <select
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                stroke: event.target.value as TableStroke
                              }))
                            }
                            value={tableSettings.stroke}
                          >
                            <option value="default">Default</option>
                            <option value="none">None</option>
                          </select>
                        </label>
                      </div>
                      <div className="table-menu__toggles">
                        <label className="table-menu__toggle">
                          <input
                            checked={tableSettings.header}
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                header: event.target.checked
                              }))
                            }
                            type="checkbox"
                          />
                          <span>Header row</span>
                        </label>
                        <label className="table-menu__toggle">
                          <input
                            checked={tableSettings.footer}
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                footer: event.target.checked
                              }))
                            }
                            type="checkbox"
                          />
                          <span>Footer row</span>
                        </label>
                        <label className="table-menu__toggle">
                          <input
                            checked={tableSettings.striped}
                            onChange={(event) =>
                              setTableSettings((current) => ({
                                ...current,
                                striped: event.target.checked
                              }))
                            }
                            type="checkbox"
                          />
                          <span>Striped fill</span>
                        </label>
                      </div>
                      <button
                        className="pane__button table-menu__insert"
                        onClick={() => {
                          handleInsertTable();
                          setOpenToolbarMenu(null);
                        }}
                        type="button"
                      >
                        Insert table
                      </button>
                    </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="pane__toolbar-section">
                <details className="source-symbol-menu">
                  <summary
                    className="pane__button pane__button--compact pane__icon-button"
                    aria-label="Symbols"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--symbols" />
                  </summary>
                  <div className="source-symbol-menu__panel" role="menu" aria-label="Typst symbols">
                    {SOURCE_SYMBOL_ITEMS.map((item) => (
                      <button
                        key={item.template}
                        className="source-symbol-menu__item"
                        onBlur={clearSourceSymbolPreview}
                        onClick={(event) => {
                          handleInsertSymbol(item.template);
                          clearSourceSymbolPreview();
                          const details = event.currentTarget.closest("details");
                          if (details instanceof HTMLDetailsElement) {
                            details.open = false;
                          }
                        }}
                        onPointerEnter={(event) => showSourceSymbolPreview(item, event)}
                        onPointerMove={positionSourceSymbolTooltip}
                        onPointerLeave={clearSourceSymbolPreview}
                        type="button"
                      >
                        <span aria-hidden="true" className="source-symbol-menu__glyph">
                          {item.glyph}
                        </span>
                      <span className="visually-hidden">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </details>
                <button
                  className="pane__button pane__button--compact pane__icon-button"
                  onClick={() => {
                    setSettingsTab("snippets");
                    setIsSettingsOpen(true);
                  }}
                  type="button"
                  aria-label="Snippets"
                >
                  <span aria-hidden="true" className="toolbar-icon toolbar-icon--snippets" />
                </button>
                <button
                  className="pane__button pane__button--compact pane__icon-button"
                  onClick={handleVimToggle}
                  type="button"
                  aria-label={snapshot.preferences.vimMode ? "Disable Vim mode" : "Enable Vim mode"}
                  aria-pressed={snapshot.preferences.vimMode}
                  title={
                    snapshot.preferences.vimMode
                      ? `Vim mode on (${vimToggleShortcutLabel})`
                      : `Vim mode off (${vimToggleShortcutLabel})`
                  }
                >
                  <span aria-hidden="true" className="toolbar-icon toolbar-icon--vim" />
                </button>
              </div>
            </div>
          ) : null}
          {isSourceFileEditable ? (
            <>
              {showGraphInspectWarning ? (
                <div className="source-inline-status source-inline-status--warning">
                  Editing this graph file changes the saved Typst source, but it will no longer round-trip through the graph editor tab.
                </div>
              ) : null}
              <TypstEditor
                ref={editorRef}
                diagnostics={editorDiagnostics}
                highlightErrors={isErrorSettled}
                snippets={allSnippets}
                onCompileRequested={handleCompile}
                onSearchRequested={openSearchPane}
                onSelectionChange={setCurrentEditorLineNumber}
                value={sourceEditorValue}
                vimMode={snapshot.preferences.vimMode}
                editorFontSize={snapshot.preferences.editorFontSize}
                keybindings={keybindings}
                relativeLineNumbers={snapshot.preferences.relativeLineNumbers}
                cursorSmooth={snapshot.preferences.cursorSmooth}
                cursorSmear={snapshot.preferences.cursorSmear}
                theme={theme}
                onChange={handleDocumentChange}
              />
            </>
          ) : (
            <div className="source-empty-state">
              <div className="source-empty-state__title">cannot open this filetype</div>
              {normalizedSelectedWorkspacePath ? (
                <div className="source-empty-state__path">{normalizedSelectedWorkspacePath}</div>
              ) : null}
            </div>
          )}
          {isSourceFileEditable && compileResult && !compileResult.ok ? (
            <div className="source-inline-status source-inline-status--error">
              {formatSourceError(compileResult)}
            </div>
          ) : null}
          {hoveredSourceSymbol ? (
            <div
              className="source-symbol-tooltip"
              style={
                {
                  left: `${hoveredSourceSymbol.x}px`,
                  top: `${hoveredSourceSymbol.y}px`
                } as CSSProperties
              }
            >
              <div className="source-symbol-tooltip__label">{hoveredSourceSymbol.item.label}</div>
              <code className="source-symbol-tooltip__code">
                {hoveredSourceSymbol.item.template}
              </code>
              {hoveredSourceSymbol.item.template.includes("${") ? (
                <span className="source-symbol-tooltip__hint">Tab moves through fields</span>
              ) : null}
            </div>
          ) : null}
        </section>
        ) : null}

        {!isMobileWorkspace && showPreviewPane && showSourcePane ? (
          <button
            aria-label="Resize preview"
            className="workspace-handle workspace-handle--right"
            onPointerDown={beginPanelResize("preview")}
            type="button"
          />
        ) : null}

        {showPreviewPane ? (
        <section
          className={`pane pane--preview ${
            previewPaneCollapsed ? "pane--collapsed" : ""
          } ${previewVisibilityClass}`}
          aria-label="Typst preview"
        >
          {previewPaneCollapsed ? (
            <button
              className="pane__collapsed-toggle"
              onClick={() => handlePanelToggle("preview")}
              type="button"
            >
              Preview
            </button>
          ) : (
            <>
              <div className="pane__header pane__header--preview">
                <div className="pane__header-group">
                  <h2>Preview</h2>
                </div>
                <div className="pane__header-center">
                  <PreviewZoomControls
                    onZoomChange={setPreviewZoom}
                    zoom={previewZoom}
                  />
                </div>
                <div className="pane__header-actions">
                  <span className="pane__meta pane__meta--status">
                    <PreviewStatusIcon
                      kind={isCompiling ? "compiling" : "live"}
                      label={isCompiling ? compilerStatus.label : "Live"}
                    />
                  </span>
                  <button
                    aria-pressed={isPaperView}
                    className="pane__button pane__button--quiet"
                    onClick={togglePaperView}
                    type="button"
                  >
                    Paper
                  </button>
                </div>
              </div>
              <PreviewPane
                compilerStatus={compilerStatus}
                isErrorSettled={isErrorSettled}
                isCompiling={isCompiling}
                lastSuccessfulResult={lastSuccessfulResult}
                paperView={isPaperView}
                showToolbar={false}
                onZoomChange={setPreviewZoom}
                result={compileResult}
                workspacePreview={selectedWorkspacePreview}
                zoom={previewZoom}
              />
            </>
          )}
        </section>
        ) : null}
      </main>
      </div>
      </div>

      {isPreviewPopupOpen ? (
        <div
          className="sheet-backdrop preview-popup-backdrop"
          onClick={() => setIsPreviewPopupOpen(false)}
          role="presentation"
        >
          <section
            aria-label="Preview popup"
            className="preview-popup"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preview-popup__header">
              <div>
                <h2>Preview</h2>
                <p className="settings-sheet__copy">Floating preview window.</p>
              </div>
              <button
                className="pane__button"
                onClick={() => setIsPreviewPopupOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <PreviewPane
              compilerStatus={compilerStatus}
              isErrorSettled={isErrorSettled}
              isCompiling={isCompiling}
              lastSuccessfulResult={lastSuccessfulResult}
              paperView={isPaperView}
              showToolbar={true}
              onZoomChange={setPreviewZoom}
              result={compileResult}
              workspacePreview={selectedWorkspacePreview}
              zoom={previewZoom}
            />
          </section>
        </div>
      ) : null}

      {conflictSet && pendingRemoteDocuments ? (
        <ConflictModal
          addedRemotely={conflictSet.addedRemotely.map((d) => ({ name: d.name }))}
          conflicts={conflictSet.conflicts}
          onClose={() => {
            setConflictSet(null);
            setPendingRemoteDocuments(null);
            setPendingRemoteProjectName(null);
          }}
          onResolve={handleConflictResolve}
        />
      ) : null}

      {isSettingsOpen ? (
        <div
          className="sheet-backdrop"
          onClick={() => setIsSettingsOpen(false)}
          role="presentation"
        >
          <section
            aria-label="Typr settings"
            className="settings-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-sheet__header">
              <div>
                <h2>Typr Settings</h2>
                <p className="settings-sheet__copy">
                  Configure sync, themes, keybindings, snippets, and graph tools from one place.
                </p>
              </div>
              <button
                className="pane__button"
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="settings-sheet__body">
              <div className="settings-tabs" role="tablist" aria-label="Settings tabs">
                <button
                  aria-selected={settingsTab === "github"}
                  className={`settings-tab ${settingsTab === "github" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("github")}
                  role="tab"
                  type="button"
                >
                  GitHub
                </button>
                <button
                  aria-selected={settingsTab === "themes"}
                  className={`settings-tab ${settingsTab === "themes" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("themes")}
                  role="tab"
                  type="button"
                >
                  Themes
                </button>
                <button
                  aria-selected={settingsTab === "keybindings"}
                  className={`settings-tab ${settingsTab === "keybindings" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("keybindings")}
                  role="tab"
                  type="button"
                >
                  Keybindings
                </button>
                <button
                  aria-selected={settingsTab === "snippets"}
                  className={`settings-tab ${settingsTab === "snippets" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("snippets")}
                  role="tab"
                  type="button"
                >
                  Snippets
                </button>
                <button
                  aria-selected={settingsTab === "packages"}
                  className={`settings-tab ${settingsTab === "packages" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("packages")}
                  role="tab"
                  type="button"
                >
                  Packages
                </button>
                <button
                  aria-selected={settingsTab === "graphs"}
                  className={`settings-tab ${settingsTab === "graphs" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("graphs")}
                  role="tab"
                  type="button"
                >
                  Graphs
                </button>
              </div>

              {settingsTab === "github" ? (
                <div className="settings-panel" role="tabpanel">
                  <div className="sync-grid">
                    <label className="sync-field">
                      <span>Owner</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) =>
                          handleGitHubConfigChange("owner", event.target.value)
                        }
                        placeholder="GitHub username or org"
                        type="text"
                        value={githubConfig.owner}
                      />
                    </label>
                    <label className="sync-field">
                      <span>Repo</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) =>
                          handleGitHubConfigChange("repo", event.target.value)
                        }
                        placeholder="Repository name"
                        type="text"
                        value={githubConfig.repo}
                      />
                    </label>
                    <label className="sync-field">
                      <span>Branch</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) =>
                          handleGitHubConfigChange("branch", event.target.value)
                        }
                        placeholder="main"
                        type="text"
                        value={githubConfig.branch}
                      />
                    </label>
                    <label className="sync-field">
                      <span>Directory</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) =>
                          handleGitHubConfigChange("directory", event.target.value)
                        }
                        placeholder={defaultGitHubDirectory}
                        type="text"
                        value={githubConfig.directory}
                      />
                    </label>
                  </div>

                  <label className="sync-field">
                    <span>Token</span>
                    <input
                      autoCapitalize="none"
                      autoCorrect="off"
                      onChange={(event) => handleGitHubConfigChange("token", event.target.value)}
                      placeholder="Create a Fine-grained token at github.com/settings/tokens"
                      type="password"
                      value={githubConfig.token}
                    />
                  </label>

                  <div
                    className={`sync-feedback ${
                      syncFeedback.tone === "success"
                        ? "sync-feedback--success"
                        : syncFeedback.tone === "error"
                          ? "sync-feedback--error"
                          : ""
                    }`}
                  >
                    <span>{syncFeedback.text}</span>
                    <span className="sync-feedback__meta">
                      {isOnline ? "Network available" : "Network unavailable"} · {storageLabel}
                    </span>
                  </div>
                </div>
              ) : settingsTab === "themes" ? (
                <div className="settings-panel" role="tabpanel">
                  <div className="settings-section">
                    <div className="settings-section__header">
                      <h3>Theme</h3>
                      <span className="pane__meta">
                        {snapshot.preferences.theme === AUTO_THEME_ID ? "Auto" : "Manual"} ·{" "}
                        {theme.name}
                      </span>
                    </div>

                    <div className="theme-auto-row">
                      <button
                        className={`pane__button theme-auto-button ${
                          snapshot.preferences.theme === AUTO_THEME_ID ? "theme-auto-button--active" : ""
                        }`}
                        onClick={() => setThemeMode(AUTO_THEME_ID)}
                        type="button"
                      >
                        Follow system default
                      </button>
                      <span className="theme-auto-row__copy">
                        Uses a random theme from your system light or dark mode and keeps it stable.
                      </span>
                    </div>

                    <div className="settings-toggle-stack">
                      <label className="settings-toggle">
                        <span>
                          <strong>Live compilation (experimental)</strong>
                          <small>
                            Recompile the active document automatically while you edit.
                          </small>
                        </span>
                        <input
                          checked={snapshot.preferences.liveCompilation}
                          onChange={handleLiveCompilationToggle}
                          type="checkbox"
                        />
                      </label>

                      <label className="settings-toggle">
                        <span>
                          <strong>Relative line numbers</strong>
                          <small>
                            Show line numbers relative to the cursor line.
                          </small>
                        </span>
                        <input
                          checked={snapshot.preferences.relativeLineNumbers}
                          onChange={handleRelativeLineNumbersToggle}
                          type="checkbox"
                        />
                      </label>

                      <label className="settings-toggle">
                        <span>
                          <strong>Smooth cursor</strong>
                          <small>Animate the source cursor as it moves through text.</small>
                        </span>
                        <input
                          checked={snapshot.preferences.cursorSmooth}
                          onChange={handleCursorSmoothToggle}
                          type="checkbox"
                        />
                      </label>

                      {snapshot.preferences.cursorSmooth ? (
                        <label className="settings-slider settings-slider--nested">
                          <span>
                            <strong>Smear cursor</strong>
                            <small>
                              Control how much trail the smooth cursor leaves behind.
                            </small>
                          </span>
                          <div className="settings-slider__control">
                            <input
                              max="100"
                              min="0"
                              onChange={handleCursorSmearChange}
                              type="range"
                              value={snapshot.preferences.cursorSmear}
                            />
                            <output>{snapshot.preferences.cursorSmear}%</output>
                          </div>
                        </label>
                      ) : null}
                    </div>

                    <div className="theme-columns">
                      <section className="theme-column">
                        <div className="theme-column__header">
                          <h4>Light</h4>
                          <span className="pane__meta">{lightThemes.length}</span>
                        </div>
                        <div className="theme-column__list">
                          {lightThemes.map((themeDefinition) => (
                            <ThemeCard
                              key={themeDefinition.id}
                              active={themeDefinition.id === theme.id}
                              themeDefinition={themeDefinition}
                              onClick={() => setThemeMode(themeDefinition.id)}
                            />
                          ))}
                        </div>
                      </section>

                      <section className="theme-column">
                        <div className="theme-column__header">
                          <h4>Dark</h4>
                          <span className="pane__meta">{darkThemes.length}</span>
                        </div>
                        <div className="theme-column__list">
                          {darkThemes.map((themeDefinition) => (
                            <ThemeCard
                              key={themeDefinition.id}
                              active={themeDefinition.id === theme.id}
                              themeDefinition={themeDefinition}
                              onClick={() => setThemeMode(themeDefinition.id)}
                            />
                          ))}
                        </div>
                      </section>
                    </div>

                    {customThemes.length > 0 ? (
                      <section className="settings-section settings-section--nested">
                        <div className="settings-section__header">
                          <h3>Imported themes</h3>
                          <span className="pane__meta">{customThemes.length}</span>
                        </div>
                        <div className="theme-column__list">
                          {customThemes.map((themeDefinition) => (
                            <div className="theme-card-shell" key={themeDefinition.id}>
                              <ThemeCard
                                active={themeDefinition.id === theme.id}
                                themeDefinition={themeDefinition}
                                onClick={() => setThemeMode(themeDefinition.id)}
                              />
                              <button
                                className="theme-card__remove"
                                onClick={() => handleRemoveCustomTheme(themeDefinition.id)}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    <section className="theme-import-card">
                      <div className="theme-import-card__copy">
                        <h4>Import a theme</h4>
                        <p>
                          Upload a JSON file with <code>name</code>, <code>mode</code>, and a full
                          <code>colors</code> palette.
                        </p>
                      </div>
                      <div className="theme-import-card__actions">
                        <button
                          className="pane__button"
                          onClick={() => themeImportInputRef.current?.click()}
                          type="button"
                        >
                          Import JSON
                        </button>
                        <button
                          className="pane__button pane__button--quiet"
                          onClick={handleDownloadThemeTemplate}
                          type="button"
                        >
                          Download template
                        </button>
                      </div>
                      {themeImportFeedback.text ? (
                        <div
                          className={`sync-feedback theme-import-card__feedback ${
                            themeImportFeedback.tone === "success"
                              ? "sync-feedback--success"
                              : themeImportFeedback.tone === "error"
                                ? "sync-feedback--error"
                                : ""
                          }`}
                        >
                          <span>{themeImportFeedback.text}</span>
                        </div>
                      ) : null}
                    </section>
                  </div>
                </div>
              ) : settingsTab === "keybindings" ? (
                <div className="settings-panel" role="tabpanel">
                  <div className="settings-section">
                    <div className="keybindings-table" role="table" aria-label="Keyboard shortcuts">
                      <div className="keybindings-table__row keybindings-table__row--head" role="row">
                        <span role="columnheader">Action</span>
                        <span role="columnheader">Binding</span>
                        <span role="columnheader">Default</span>
                        <span role="columnheader">Edit</span>
                      </div>
                      {KEYBINDING_DEFINITIONS.map((definition) => {
                        const binding = keybindings[definition.id];
                        const conflicts = findKeybindingConflicts(keybindings, definition.id);
                        const isRecording = recordingKeybindingId === definition.id;

                        return (
                          <div className="keybindings-table__row" key={definition.id} role="row">
                            <span role="cell">
                              <strong>{definition.label}</strong>
                              <small>{definition.group}</small>
                              {conflicts.length > 0 ? (
                                <em>
                                  Also assigned to{" "}
                                  {conflicts
                                    .map(
                                      (conflictId) =>
                                        KEYBINDING_DEFINITIONS.find(
                                          (candidate) => candidate.id === conflictId
                                        )?.label ?? conflictId
                                    )
                                    .join(", ")}
                                </em>
                              ) : null}
                            </span>
                            <button
                              className={`keybinding-recorder ${
                                isRecording ? "keybinding-recorder--active" : ""
                              }`}
                              onClick={() => setRecordingKeybindingId(definition.id)}
                              onKeyDown={(event) => {
                                if (!isRecording) {
                                  return;
                                }

                                event.preventDefault();
                                event.stopPropagation();

                                if (event.key === "Escape") {
                                  setRecordingKeybindingId(null);
                                  return;
                                }

                                const nextBinding = keybindingFromKeyboardEvent(
                                  event.nativeEvent,
                                  isAppleShortcutPlatform
                                );
                                if (!nextBinding) {
                                  return;
                                }

                                handleKeybindingChange(definition.id, nextBinding);
                                setRecordingKeybindingId(null);
                              }}
                              role="cell"
                              type="button"
                            >
                              {isRecording
                                ? "Press keys"
                                : formatKeybinding(binding, isAppleShortcutPlatform)}
                            </button>
                            <kbd role="cell">
                              {formatKeybinding(
                                definition.defaultBinding,
                                isAppleShortcutPlatform
                              )}
                            </kbd>
                            <span className="keybindings-table__actions" role="cell">
                              <button
                                aria-label={`Reset ${definition.label}`}
                                className="pane__button pane__button--compact pane__icon-button"
                                onClick={() => handleKeybindingReset(definition.id)}
                                title={`Reset ${definition.label}`}
                                type="button"
                              >
                                <span aria-hidden="true" className="toolbar-icon toolbar-icon--reset" />
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <section className="keybindings-card">
                      <div className="keybindings-card__header">
                        <h4>Mouse gestures</h4>
                        <span className="pane__meta">Fixed</span>
                      </div>
                      <div className="keybindings-gesture-list">
                        <div>
                          <span>Insert cursor</span>
                          <kbd>{isAppleShortcutPlatform ? "Option+Click" : "Alt+Click"}</kbd>
                        </div>
                        <div>
                          <span>Column selection</span>
                          <kbd>
                            {isAppleShortcutPlatform
                              ? "Shift+Option+Drag"
                              : "Shift+Alt+Drag"}
                          </kbd>
                        </div>
                      </div>
                    </section>

                    <div className="keybindings-footer">
                      <button
                        className="pane__button pane__button--quiet"
                        onClick={handleResetAllKeybindings}
                        type="button"
                      >
                        Reset all
                      </button>
                    </div>
                  </div>
                </div>
              ) : settingsTab === "snippets" ? (
                <div className="settings-panel" role="tabpanel">
                  <div className="settings-section">
                    <div className="settings-section__header">
                      <h3>Snippets</h3>
                      <span className="pane__meta">
                        {allSnippets.length} total · {customSnippets.length} custom
                      </span>
                    </div>

                    <div className="snippet-columns">
                      <section className="snippet-column">
                        <div className="snippet-column__header">
                          <h4>Built in</h4>
                          <span className="pane__meta">{DEFAULT_TYPST_SNIPPETS.length}</span>
                        </div>
                        <div className="snippet-list">
                          {DEFAULT_TYPST_SNIPPETS.map((snippet) => (
                            <article className="snippet-card" key={snippet.prefix}>
                              <div className="snippet-card__top">
                                <strong>{snippet.prefix}</strong>
                                <span className="snippet-card__detail">{snippet.description}</span>
                              </div>
                              <code className="snippet-card__body">{snippet.body}</code>
                            </article>
                          ))}
                        </div>
                      </section>

                      <section className="snippet-column">
                        <div className="snippet-column__header">
                          <h4>Custom</h4>
                          <span className="pane__meta">{customSnippets.length}</span>
                        </div>
                        {customSnippets.length > 0 ? (
                          <div className="snippet-list">
                            {customSnippets.map((snippet) => (
                              <article className="snippet-card" key={snippet.prefix}>
                                <div className="snippet-card__top">
                                  <strong>{snippet.prefix}</strong>
                                  <button
                                    className="snippet-card__remove"
                                    onClick={() => handleRemoveCustomSnippet(snippet.prefix)}
                                    type="button"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <code className="snippet-card__body">{snippet.body}</code>
                                {snippet.description ? (
                                  <span className="snippet-card__detail">{snippet.description}</span>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="snippet-empty">
                            Import your own snippets to extend the autocomplete list.
                          </div>
                        )}
                      </section>
                    </div>

                    <section className="snippet-import-card">
                      <div className="snippet-import-card__copy">
                        <h4>Import snippets</h4>
                        <p>
                          Paste JSON here or upload a file. Accepted shapes include a
                          <code>snippets</code> array or a simple object map of <code>prefix</code> to
                          snippet body.
                        </p>
                      </div>
                      <textarea
                        className="snippet-import-card__textarea"
                        onChange={handleSnippetImportTextChange}
                        placeholder={JSON.stringify(SNIPPET_IMPORT_TEMPLATE, null, 2)}
                        value={snippetImportText}
                      />
                      <div className="snippet-import-card__actions">
                        <button
                          className="pane__button"
                          onClick={() => snippetImportInputRef.current?.click()}
                          type="button"
                        >
                          Import JSON
                        </button>
                        <button
                          className="pane__button"
                          onClick={handleImportPastedSnippets}
                          type="button"
                        >
                          Import pasted JSON
                        </button>
                        <button
                          className="pane__button pane__button--quiet"
                          onClick={handleDownloadSnippetTemplate}
                          type="button"
                        >
                          Download template
                        </button>
                        <button
                          className="pane__button pane__button--quiet"
                          onClick={handleDownloadCustomSnippets}
                          type="button"
                        >
                          Download current
                        </button>
                        <button
                          className="pane__button pane__button--quiet"
                          onClick={handleClearCustomSnippets}
                          type="button"
                        >
                          Clear custom
                        </button>
                      </div>
                      {snippetImportFeedback.text ? (
                        <div
                          className={`sync-feedback snippet-import-card__feedback ${
                            snippetImportFeedback.tone === "success"
                              ? "sync-feedback--success"
                              : snippetImportFeedback.tone === "error"
                                ? "sync-feedback--error"
                                : ""
                          }`}
                        >
                          <span>{snippetImportFeedback.text}</span>
                        </div>
                      ) : null}
                    </section>
                  </div>
                </div>
              ) : settingsTab === "packages" ? (
                <div className="settings-panel" role="tabpanel">
                  <div className="settings-section">
                    <div className="settings-section__header">
                      <h3>Typst package cache</h3>
                      <span className="pane__meta">
                        {packageCacheEntries.length} installed · {formatByteSize(packageCacheTotalBytes)}
                      </span>
                    </div>

                    <section className="package-cache-card">
                      <div className="package-cache-card__copy">
                        <h4>Add from Universe</h4>
                        <p>
                          Search Typst Universe for packages while online, then download them now so
                          they stay available offline later.
                        </p>
                      </div>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="package-search-input"
                        disabled={!isOnline}
                        onChange={(event) => setPackageSearchQuery(event.target.value)}
                        placeholder={
                          isOnline
                            ? "Search Universe packages like cetz or oxifmt"
                            : "Go online to search Typst Universe"
                        }
                        type="search"
                        value={packageSearchQuery}
                      />
                      {!isOnline ? (
                        <div className="snippet-empty">
                          Universe search is only available while you are online.
                        </div>
                      ) : isPackageSearchLoading ? (
                        <div className="snippet-empty">Searching Typst Universe...</div>
                      ) : filteredRepositoryPackages.length > 0 ? (
                        <div className="package-repository-list" role="list">
                          {visibleRepositoryPackages.map((entry) => (
                            <article className="package-cache-row" key={entry.name} role="listitem">
                              <div className="package-cache-row__main">
                                <strong>
                                  <a
                                    className="package-cache-row__link"
                                    href={`https://typst.app/universe/package/${entry.name}/`}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    @{entry.namespace}/{entry.name}
                                  </a>
                                </strong>
                                <span>
                                  v{entry.version}
                                  {entry.description ? ` · ${entry.description}` : ""}
                                </span>
                              </div>
                              <button
                                className="pane__button"
                                disabled={
                                  !isOnline ||
                                  installingPackageName === entry.name ||
                                  installedPackageKeys.has(`${entry.namespace}/${entry.name}:${entry.version}`)
                                }
                                onClick={() => {
                                  void handleInstallTypstPackage(entry);
                                }}
                                type="button"
                              >
                                {installingPackageName === entry.name
                                  ? "Installing..."
                                  : installedPackageKeys.has(
                                        `${entry.namespace}/${entry.name}:${entry.version}`
                                      )
                                    ? "Installed"
                                    : "Install"}
                              </button>
                            </article>
                          ))}
                          {filteredRepositoryPackages.length > visibleRepositoryPackages.length ? (
                            <button
                              className="pane__button pane__button--quiet package-repository-list__more"
                              onClick={() =>
                                setPackageSearchVisibleCount((currentCount) => currentCount + 5)
                              }
                              type="button"
                            >
                              Show more...
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="snippet-empty">
                          {packageSearchQuery.trim()
                            ? "No matching packages found on Typst Universe."
                            : "Start typing to search Typst Universe packages."}
                        </div>
                      )}
                    </section>

                    <section className="package-cache-card">
                      <div className="package-cache-card__copy">
                        <h4>Offline package storage</h4>
                        <p>
                          Cached Typst packages stay available offline and are reused until you
                          remove them here.
                        </p>
                      </div>
                      <div className="package-cache-card__actions">
                        <button
                          className="pane__button"
                          onClick={() => {
                            void refreshTypstPackageCache();
                          }}
                          type="button"
                        >
                          {isPackageCacheLoading ? "Refreshing..." : "Refresh"}
                        </button>
                        <button
                          className="pane__button pane__button--quiet"
                          disabled={packageCacheEntries.length === 0 || isPackageCacheClearing}
                          onClick={() => {
                            void handleClearTypstPackages();
                          }}
                          type="button"
                        >
                          {isPackageCacheClearing ? "Clearing..." : "Clear cache"}
                        </button>
                      </div>
                      {packageCacheFeedback.text ? (
                        <div
                          className={`sync-feedback package-cache-card__feedback ${
                            packageCacheFeedback.tone === "success"
                              ? "sync-feedback--success"
                              : packageCacheFeedback.tone === "error"
                                ? "sync-feedback--error"
                                : ""
                          }`}
                        >
                          <span>{packageCacheFeedback.text}</span>
                        </div>
                      ) : null}
                    </section>

                    {isPackageCacheLoading && packageCacheEntries.length === 0 ? (
                      <div className="snippet-empty">Loading cached packages...</div>
                    ) : packageCacheEntries.length > 0 ? (
                      <div className="package-cache-list" role="list">
                        {packageCacheEntries.map((entry) => (
                          <article className="package-cache-row" key={entry.reference.key} role="listitem">
                            <div className="package-cache-row__main">
                              <strong>{entry.reference.key}</strong>
                              <span>{formatByteSize(entry.sizeBytes)}</span>
                            </div>
                            <button
                              className="pane__button pane__button--quiet"
                              onClick={() => {
                                void handleRemoveTypstPackage(entry);
                              }}
                              type="button"
                            >
                              Remove
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="snippet-empty">
                        No Typst packages are cached yet. Import a package in a document to install
                        it here.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="settings-panel" role="tabpanel">
                  <div className="settings-section">
                    <div className="settings-section__header">
                      <h3>Graphing</h3>
                      <span className="pane__meta">simple-plot</span>
                    </div>
                    <div className="sidebar-card">
                      <p className="sidebar-card__copy">
                        Graphs now use a Typst `simple-plot` prototype with a Desmos-style
                        function list, a TI-84 style window editor, and direct Typst insertion.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="settings-sheet__footer">
              <button
                className="control-button"
                disabled={!canPushToGitHub}
                onClick={() => {
                  void handlePullFromGitHub();
                }}
                type="button"
              >
                {isSyncing ? "Pulling..." : "Pull"}
              </button>
              <button
                className="control-button"
                disabled={!canPushToGitHub}
                onClick={() => {
                  void handlePushToGitHub();
                }}
                type="button"
              >
                {isSyncing ? "Pushing..." : "Push"}
              </button>
              <button
                className="control-button"
                disabled={!canPushToGitHub}
                onClick={() => {
                  void handleSyncGitHub();
                }}
                type="button"
              >
                {isSyncing ? "Syncing..." : "Sync"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <input
        ref={documentUploadInputRef}
        accept=".typ,text/plain"
        className="visually-hidden"
        onChange={handleUploadDocument}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={themeImportInputRef}
        accept=".json,application/json"
        className="visually-hidden"
        onChange={handleThemeImport}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={snippetImportInputRef}
        accept=".json,application/json"
        className="visually-hidden"
        onChange={handleSnippetImportFile}
        tabIndex={-1}
        type="file"
      />
    </div>
  );
}

function ThemeCard({
  active,
  themeDefinition,
  onClick
}: {
  active: boolean;
  themeDefinition: ThemeDefinition;
  onClick: () => void;
}) {
  return (
    <button
      className={`theme-card ${active ? "theme-card--active" : ""}`}
      onClick={onClick}
      type="button"
      style={
        {
          "--theme-card-background": themeDefinition.palette.surfaceStrong,
          "--theme-card-background-wash": themeDefinition.palette.backgroundWash,
          "--theme-card-accent": themeDefinition.palette.accent,
          "--theme-card-text": themeDefinition.palette.editorForeground,
          "--theme-card-border": themeDefinition.palette.border,
          "--theme-card-muted": themeDefinition.palette.textMuted
        } as CSSProperties
      }
    >
      <span className="theme-card__swatches" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <strong>{themeDefinition.name}</strong>
      <span>{themeDefinition.description}</span>
    </button>
  );
}

function MenuDropdown({
  activeMenu,
  children,
  label,
  onClose,
  onCloseImmediately,
  onNavigate,
  onOpen,
  onOpenImmediately
}: {
  activeMenu: MenuLabel | null;
  children: ReactNode;
  label: MenuLabel;
  onClose: () => void;
  onCloseImmediately: () => void;
  onNavigate: (currentLabel: MenuLabel, direction: -1 | 1) => void;
  onOpen: () => void;
  onOpenImmediately: () => void;
}) {
  const panelId = useId();
  const isOpen = activeMenu === label;

  function focusMenuItem(
    container: HTMLDivElement | null,
    direction: 1 | -1,
    currentTarget?: EventTarget | null
  ) {
    if (!container) {
      return;
    }

    const items = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".menu-action:not(:disabled)")
    );

    if (items.length === 0) {
      return;
    }

    const currentIndex = currentTarget
      ? items.findIndex((item) => item === currentTarget)
      : -1;
    const fallbackIndex = direction === 1 ? 0 : items.length - 1;
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : (currentIndex + direction + items.length) % items.length;

    items[nextIndex]?.focus();
  }

  return (
    <div
      className={`menu-dropdown ${isOpen ? "menu-dropdown--open" : ""}`}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="menu-dropdown__trigger"
        onClick={() => {
          if (isOpen) {
            onCloseImmediately();
            return;
          }

          onOpenImmediately();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onNavigate(label, 1);
          }

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onNavigate(label, -1);
          }

          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenImmediately();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        type="button"
      >
        {label}
      </button>
      {isOpen ? (
        <div
          className="menu-dropdown__panel"
          id={panelId}
          onKeyDown={(event) => {
            const container = event.currentTarget;

            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusMenuItem(container, 1, event.target);
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              focusMenuItem(container, -1, event.target);
            }

            if (event.key === "Home") {
              event.preventDefault();
              focusMenuItem(container, 1);
            }

            if (event.key === "End") {
              event.preventDefault();
              focusMenuItem(container, -1);
            }

            if (event.key === "ArrowRight") {
              event.preventDefault();
              onNavigate(label, 1);
            }

            if (event.key === "ArrowLeft") {
              event.preventDefault();
              onNavigate(label, -1);
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          role="menu"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function shouldReuseCompileResult(
  current: CompileResult | null,
  next: CompileResult
): current is CompileResult {
  if (!current || current.ok !== next.ok || current.engine !== next.engine) {
    return false;
  }

  if (current.ok && next.ok) {
    return (
      current.output.kind === next.output.kind &&
      current.output.content === next.output.content &&
      areDiagnosticsEqual(current.diagnostics, next.diagnostics)
    );
  }

  if (!current.ok && !next.ok) {
    return areDiagnosticsEqual(current.errors, next.errors);
  }

  return false;
}

function areDiagnosticsEqual(
  current: {
    message: string;
    severity: "error" | "warning";
    path?: string;
    range?: string;
    packageName?: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
  }[],
  next: {
    message: string;
    severity: "error" | "warning";
    path?: string;
    range?: string;
    packageName?: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
  }[]
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((currentDiagnostic, index) => {
    const nextDiagnostic = next[index];

    return (
      currentDiagnostic.message === nextDiagnostic.message &&
      currentDiagnostic.severity === nextDiagnostic.severity &&
      currentDiagnostic.path === nextDiagnostic.path &&
      currentDiagnostic.range === nextDiagnostic.range &&
      currentDiagnostic.packageName === nextDiagnostic.packageName &&
      currentDiagnostic.line === nextDiagnostic.line &&
      currentDiagnostic.column === nextDiagnostic.column &&
      currentDiagnostic.endLine === nextDiagnostic.endLine &&
      currentDiagnostic.endColumn === nextDiagnostic.endColumn
    );
  });
}

function logCompileTiming({
  durationMs,
  changed,
  ok,
  diagnosticsCount
}: {
  durationMs: number;
  changed: boolean;
  ok: boolean;
  diagnosticsCount: number;
}): void {
  if (typeof console === "undefined") {
    return;
  }

  console.debug(
    `[typr] compile ${ok ? "ok" : "error"} in ${durationMs.toFixed(1)}ms` +
      ` (${changed ? "updated preview" : "unchanged output"}, ${diagnosticsCount} diagnostics)`
  );
}

function parseSourceLocation(sourceLocation: string) {
  const normalizedLocation = sourceLocation.trim();
  const locationMatch = normalizedLocation.match(
    /(\d+):(\d+)(?:-(\d+):(\d+))?$/
  );

  if (!locationMatch) {
    return null;
  }

  const line = Number.parseInt(locationMatch[1], 10);
  const column = Number.parseInt(locationMatch[2], 10);
  const endLine = locationMatch[3]
    ? Number.parseInt(locationMatch[3], 10)
    : undefined;
  const endColumn = locationMatch[4]
    ? Number.parseInt(locationMatch[4], 10)
    : undefined;

  if (!Number.isFinite(line) || !Number.isFinite(column)) {
    return null;
  }

  return {
    line,
    column,
    endLine,
    endColumn
  };
}

function formatSourceError(result: Extract<CompileResult, { ok: false }>) {
  const [firstError] = result.errors;

  if (!firstError) {
    return "Compile error.";
  }

  const range = formatDiagnosticRange(firstError);
  const location = [firstError.packageName, firstError.path, range]
    .filter(Boolean)
    .join(" ");
  const prefix = location ? `${location}: ` : "";
  const suffix =
    result.errors.length > 1 ? ` (+${result.errors.length - 1} more)` : "";

  return `Compile error: ${prefix}${firstError.message}${suffix}`;
}

function getSidebarToolTitle(tool: SidebarTool): string {
  switch (tool) {
    case "files":
      return "Files";
    case "search":
      return "Search";
    case "outline":
      return "Outline";
    case "diagram":
      return "Diagram";
    case "graph":
      return "Graph";
    case "sync":
      return "Sync";
    case "debug":
      return "Debug";
  }
}

function getSidebarToolSubtitle(tool: SidebarTool): string {
  switch (tool) {
    case "files":
      return "Project documents";
    case "search":
      return "";
    case "outline":
      return "Document structure";
    case "diagram":
      return "Freehand SVG sketch";
    case "graph":
      return "Desmos graph editor";
    case "sync":
      return "GitHub publishing";
    case "debug":
      return "Compiler and diagnostics";
  }
}

function buildMatrixTemplate(settings: MatrixSettings): string {
  const delimiter = MATRIX_DELIMITER_OPTIONS.find((option) => option.id === settings.delimiter);
  const rows = Math.max(1, Math.min(6, Math.floor(settings.rows)));
  const columns = Math.max(1, Math.min(6, Math.floor(settings.columns)));
  let cellIndex = 1;
  const rowStrings = Array.from({ length: rows }, (_unused, rowIndex) => {
    const cells = Array.from({ length: columns }, (_unusedCell, columnIndex) => {
      const placeholder = `\${${cellIndex}:*}`;
      cellIndex += 1;
      return placeholder;
    });

    return `  ${cells.join(", ")};`;
  });
  const delimiterLine = delimiter && delimiter.id !== "none" ? `  delim: "${delimiter.delim}"` : "";
  const body = delimiterLine ? `${rowStrings.join("\n")}\n${delimiterLine}` : rowStrings.join("\n");

  return `mat(
${body}
)`;
}

function buildTableTemplate(settings: TableSettings): string {
  const rows = Math.max(1, Math.min(8, Math.floor(settings.rows)));
  const columns = Math.max(1, Math.min(6, Math.floor(settings.columns)));
  let cellIndex = 1;

  const buildRow = () =>
    Array.from({ length: columns }, (_unusedCell, columnIndex) => {
      const placeholder = `\${${cellIndex}:*}`;
      cellIndex += 1;
      return `[${placeholder}]`;
    }).join(", ");

  const headerRow = settings.header ? `  table.header(\n    ${buildRow()},\n  ),` : "";
  const bodyRows = Array.from({ length: rows }, () => {
    return `  ${buildRow()},`;
  }).join("\n");
  const footerRow = settings.footer ? `  table.footer(\n    ${buildRow()},\n  ),` : "";
  const gutter = TABLE_GUTTER_OPTIONS.find((option) => option.id === settings.gutter)?.value ?? "0pt";
  const inset = TABLE_INSET_OPTIONS.find((option) => option.id === settings.inset)?.value ?? "0pt";
  const stroke = settings.stroke === "none" ? "none" : "1pt + black";
  const align = settings.align;
  const fillLine = settings.striped
    ? "  fill: (x, y) => if y == 0 { luma(232) } else if calc.odd(y) { luma(246) } else { white },"
    : "";

  return `#table(
  columns: ${columns},
  align: ${align},
  gutter: ${gutter},
  inset: ${inset},
  stroke: ${stroke},
${fillLine}
${headerRow}
${bodyRows}
${footerRow}
)`;
}

function collectOutlineEntries(content: string): OutlineEntry[] {
  return content
    .split("\n")
    .flatMap((lineText, index) => {
      const match = lineText.match(/^(=+)\s+(.*)$/);

      if (!match) {
        return [];
      }

      return [
        {
          level: match[1].length,
          lineNumber: index + 1,
          title: match[2].trim()
        } satisfies OutlineEntry
      ];
    });
}

function buildOutlineTree(entries: OutlineEntry[]): OutlineTreeEntry[] {
  const root: OutlineTreeEntry[] = [];
  const stack: OutlineTreeEntry[] = [];

  for (const entry of entries) {
    const node: OutlineTreeEntry = {
      ...entry,
      id: `${entry.lineNumber}:${entry.level}:${entry.title}`,
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return root;
}

function findActiveOutlineEntry(
  entries: OutlineEntry[],
  currentLineNumber: number
): OutlineEntry | null {
  let activeEntry: OutlineEntry | null = null;

  for (const entry of entries) {
    if (entry.lineNumber > currentLineNumber) {
      break;
    }

    activeEntry = entry;
  }

  return activeEntry;
}

function renderOutlineEntries(
  entries: OutlineTreeEntry[],
  documentId: string,
  activeEntryId: string | null,
  collapsedEntries: Record<string, boolean>,
  setCollapsedEntries: Dispatch<SetStateAction<Record<string, boolean>>>,
  focusDocumentLocation: (
    documentId: string,
    line: number,
    column: number,
    endLine?: number,
    endColumn?: number
  ) => void,
  depth = 0
): ReactNode {
  return entries.map((entry) => {
    const isCollapsed = collapsedEntries[entry.id] ?? false;
    const hasChildren = entry.children.length > 0;

    return (
      <div
        className="outline-node"
        key={entry.id}
        role="listitem"
        style={
          {
            "--outline-depth": depth
          } as CSSProperties
        }
      >
        <div
          className={`outline-row ${entry.id === activeEntryId ? "outline-row--selected" : ""}`}
        >
          {hasChildren ? (
            <button
              aria-label={isCollapsed ? `Expand ${entry.title}` : `Collapse ${entry.title}`}
              className="outline-row__toggle"
              onClick={(event) => {
                event.stopPropagation();
                setCollapsedEntries((current) => ({
                  ...current,
                  [entry.id]: !isCollapsed
                }));
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`tree-disclosure-icon ${
                  isCollapsed ? "tree-disclosure-icon--collapsed" : ""
                }`}
              />
            </button>
          ) : (
            <span aria-hidden="true" className="outline-row__spacer" />
          )}

          <button
            className="outline-row__link"
            onClick={() => focusDocumentLocation(documentId, entry.lineNumber, 1)}
            type="button"
          >
            <span className="outline-row__title">{entry.title}</span>
          </button>
        </div>

        {hasChildren && !isCollapsed ? (
          <div className="outline-children" role="list">
            {renderOutlineEntries(
              entry.children,
              documentId,
              activeEntryId,
              collapsedEntries,
              setCollapsedEntries,
              focusDocumentLocation,
              depth + 1
            )}
          </div>
        ) : null}
      </div>
    );
  });
}

function formatDiagnosticRange(diagnostic: {
  range?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}): string | undefined {
  if (diagnostic.line && diagnostic.column) {
    const start = `${diagnostic.line}:${diagnostic.column}`;

    if (diagnostic.endLine && diagnostic.endColumn) {
      if (
        diagnostic.endLine === diagnostic.line &&
        diagnostic.endColumn === diagnostic.column
      ) {
        return start;
      }

      return `${start}-${diagnostic.endLine}:${diagnostic.endColumn}`;
    }

    return start;
  }

  return diagnostic.range;
}
