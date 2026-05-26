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
  type ReactNode
} from "react";
import {
  createDefaultSnapshot,
  createDocument,
  createDocumentFromFile,
  createDefaultDiagram,
  createDefaultGraph,
  createFolder,
  createNextGraphSnapshot,
  type GraphProvider,
  type DiagramAsset,
  type DiagramShape,
  type DiagramStroke,
  type GraphAsset,
  getActiveDocument,
  normalizeSnapshot,
  renameActiveDocument,
  renameDiagramById,
  renameDocumentById,
  renameGraphById,
  renameProject,
  setActiveDocument,
  saveCurrentDiagram,
  saveCurrentGraph,
  createNextDiagramSnapshot,
  removeLatestDiagramItem,
  removeDiagramStroke,
  removeDiagramShape,
  getDefaultGraphSource,
  updateGraphProviderPreference,
  updateGraph,
  updateDiagram,
  updateActiveDocument,
  updateCursorSmearPreference,
  updateCursorSmoothPreference,
  updateLiveCompilationPreference,
  updateThemePreference,
  updateVimPreference,
  type AppSnapshot,
  type ThemePreference
} from "./appState";
import {
  createTypstCompiler,
  type CompilerStatus,
  type CompileResult
} from "../compiler/typstCompiler";
import type { CompileAssetFile } from "../compiler/types";
import { exportTypstPdf } from "../compiler/typstRuntime";
import {
  TypstEditor,
  type TypstEditorHandle,
  type TypstSearchQueryState
} from "../editor/TypstEditor";
import {
  createEmptyGitHubRemoteConfig,
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
  PreviewStatusIcon
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
  buildGraphInsertResult
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
  loadDesmosApiKey,
  loadSnapshot,
  loadCustomSnippets,
  saveGitHubConfig,
  saveDesmosApiKey,
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

const COMPILE_DEBOUNCE_MS = 60;
const SAVE_DEBOUNCE_MS = 250;
const MENU_CLOSE_DELAY_MS = 140;
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

function getGraphProviderLabel(provider: GraphProvider): string {
  if (provider === "plotly") {
    return "Plotly";
  }

  if (provider === "gnuplot") {
    return "gnuplot";
  }

  return "Desmos";
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

const MENU_ITEMS = ["Typr", "File", "Edit", "View", "Help"] as const;
type MenuLabel = (typeof MENU_ITEMS)[number];
type WorkspaceMode = "split" | "sidebar" | "editor" | "preview";
type MobileWorkspaceTab = "files" | "editor" | "preview";
type SidebarTool = "files" | "search" | "outline" | "sync" | "debug" | "diagram" | "graph";
type SettingsTab = "github" | "themes" | "snippets" | "graphs";
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

function isPrimaryShortcut(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey;
}

function isResizeShortcut(event: KeyboardEvent) {
  return isPrimaryShortcut(event) && event.altKey && !event.shiftKey;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
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
  const [isDiagramExpanded, setIsDiagramExpanded] = useState(false);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [isPreviewDebugVisible, setIsPreviewDebugVisible] = useState(false);
  const [isSourceToolbarVisible, setIsSourceToolbarVisible] = useState(true);
  const [isPaperView, setIsPaperView] = useState(false);
  const [diagramInkColor, setDiagramInkColor] = useState("#000000");
  const [collapsedFileFolders, setCollapsedFileFolders] = useState<Record<string, boolean>>({
    documents: false,
    figures: false,
    graphs: false
  });
  const [hoveredSourceSymbol, setHoveredSourceSymbol] = useState<SourceSymbolTooltipState | null>(
    null
  );
  const [previewZoom, setPreviewZoom] = useState<PreviewZoomState>(DEFAULT_ZOOM);
  const [customSnippets, setCustomSnippets] = useState<TypstSnippet[]>([]);
  const [snippetImportText, setSnippetImportText] = useState(
    JSON.stringify(SNIPPET_IMPORT_TEMPLATE, null, 2)
  );
  const [snippetImportFeedback, setSnippetImportFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [isGraphProviderMenuOpen, setIsGraphProviderMenuOpen] = useState(false);
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
  const [desmosApiKey, setDesmosApiKey] = useState("");
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
  const compileShortcutLabel = isApplePlatform() ? "Cmd+Return" : "Ctrl+Enter";
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
  const togglePreviewDebug = useCallback(() => {
    setIsPreviewDebugVisible((current) => !current);
  }, []);
  const togglePaperView = useCallback(() => {
    setIsPaperView((current) => !current);
  }, []);
  const openDiagramExpanded = useCallback(() => {
    setIsDiagramExpanded(true);
  }, []);
  const closeDiagramExpanded = useCallback(() => {
    setIsDiagramExpanded(false);
  }, []);
  const openGraphExpanded = useCallback(() => {
    setIsGraphExpanded(true);
  }, []);
  const closeGraphExpanded = useCallback(() => {
    setIsGraphExpanded(false);
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
  const customFolders = useMemo(
    () => snapshot.project.folders ?? [],
    [snapshot.project.folders]
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
    diagramAssetsRef.current = diagramShadowAssets;
    diagramAssetsRevisionRef.current = diagramAssetsRevision;
  }, [diagramAssetsRevision, diagramShadowAssets]);

  useEffect(() => {
    graphAssetsRef.current = graphShadowAssets;
    graphAssetsRevisionRef.current = graphAssetsRevision;
  }, [graphAssetsRevision, graphShadowAssets]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (compileTimerRef.current !== null) {
        window.clearTimeout(compileTimerRef.current);
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
      const [storedSnippets, storedDesmosApiKey] = await Promise.all([
        loadCustomSnippets(),
        loadDesmosApiKey()
      ]);

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
      setDesmosApiKey(storedDesmosApiKey ?? "");
      setIsHydrated(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [setTheme]);

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
      if (event.key === "Escape") {
        cancelPendingMenuClose();
        cancelPendingMenuOpen();
        setActiveMenu(null);
        setIsSettingsOpen(false);
        setIsDiagramExpanded(false);
        setIsGraphExpanded(false);
        setWorkspaceMode("split");
        return;
      }

      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        handleVimToggle();
        return;
      }

      const isCompileShortcut = isApplePlatform()
        ? event.metaKey && !event.ctrlKey && !event.altKey && event.key === "Enter"
        : event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Enter";

      if (isCompileShortcut) {
        event.preventDefault();
        handleCompileRef.current();
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (!isResizeShortcut(event)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "b") {
        event.preventDefault();
        handlePanelToggle("sidebar");
        return;
      }

      if (key === "p") {
        event.preventDefault();
        handlePanelToggle("preview");
        return;
      }

      if (key === "0") {
        event.preventDefault();
        resetPanelWidths();
        return;
      }

      if (key === "1") {
        event.preventDefault();
        setFullscreenMode("sidebar");
        return;
      }

      if (key === "2") {
        event.preventDefault();
        setFullscreenMode("editor");
        return;
      }

      if (key === "3") {
        event.preventDefault();
        setFullscreenMode("preview");
        return;
      }

      if (key === "4") {
        event.preventDefault();
        setFullscreenMode("split");
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
    handlePanelToggle,
    handleVimToggle,
    resetPanelWidths,
    setFullscreenMode
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
      void saveDesmosApiKey(desmosApiKey).catch(() => {});
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [desmosApiKey, isHydrated]);

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

    previewSourceDraftRef.current = activeDocument.content;
    if (compileResult === null || snapshot.preferences.liveCompilation) {
      queueCompile(compileResult !== null);
    }
  }, [
    activeDocument.content,
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
    setSnapshot((currentSnapshot) => updateActiveDocument(currentSnapshot, content));
  }, []);

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
    setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, documentId));
  };

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

  const downloadFile = (name: string, content: string, type = "text/plain") => {
    downloadBlob(name, new Blob([content], { type }));
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

    const content = await file.text();
    setSnapshot((currentSnapshot) =>
      createDocumentFromFile(currentSnapshot, file.name, content)
    );
  };

  const handleDownloadDocument = () => {
    downloadFile(activeDocument.name, activeDocument.content, "text/plain");
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

  const handleRenameDocumentFromTree = useCallback((documentId: string, currentName: string) => {
    const nextName = window.prompt("File name", currentName);

    if (nextName === null) {
      return;
    }

    setSnapshot((currentSnapshot) => renameDocumentById(currentSnapshot, documentId, nextName));
  }, []);

  const handleRenameFigureFromTree = useCallback((figureId: string, currentName: string) => {
    const nextName = window.prompt("Figure name", currentName);

    if (nextName === null) {
      return;
    }

    setSnapshot((currentSnapshot) => renameDiagramById(currentSnapshot, figureId, nextName));
  }, []);

  const handleRenameGraphFromTree = useCallback((graphId: string, currentName: string) => {
    const nextName = window.prompt("Graph name", currentName);

    if (nextName === null) {
      return;
    }

    setSnapshot((currentSnapshot) => renameGraphById(currentSnapshot, graphId, nextName));
  }, []);

  const handleNewDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) => createNextDiagramSnapshot(currentSnapshot));
  }, []);

  const handleSaveDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) => saveCurrentDiagram(currentSnapshot));
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

  const handleOpenDiagramFigure = useCallback((figureId: string) => {
    setSnapshot((currentSnapshot) => {
      const figure = currentSnapshot.project.figures?.find((entry) => entry.id === figureId);

      if (!figure) {
        return currentSnapshot;
      }

      const savedSnapshot = saveCurrentDiagram(currentSnapshot);

      return {
        ...savedSnapshot,
        project: {
          ...savedSnapshot.project,
          diagram: {
            ...figure,
            strokes: figure.strokes.map((stroke) => ({
              ...stroke,
              points: stroke.points.map((point) => ({ ...point }))
            }))
          },
          updatedAt: new Date().toISOString()
        }
      };
    });
    setActiveSidebarTool("diagram");
  }, []);

  const handleOpenGraphFigure = useCallback((figureId: string) => {
    setSnapshot((currentSnapshot) => {
      const figure = currentSnapshot.project.graphs?.find((entry) => entry.id === figureId);

      if (!figure) {
        return currentSnapshot;
      }

      const savedSnapshot = saveCurrentGraph(currentSnapshot);

      return {
        ...savedSnapshot,
        project: {
          ...savedSnapshot.project,
          graph: {
            ...figure,
            content: new Uint8Array(figure.content)
          },
          updatedAt: new Date().toISOString()
        }
      };
    });
    setActiveSidebarTool("graph");
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
  }, []);

  const handleGraphRenderModeChange = useCallback((mode: GraphAsset["renderMode"]) => {
    setSnapshot((currentSnapshot) =>
      updateGraph(currentSnapshot, (graphAsset) => ({
        ...graphAsset,
        renderMode: mode
      }))
    );
  }, []);

  const handleGraphProviderChange = useCallback((provider: GraphProvider) => {
    setSnapshot((currentSnapshot) => {
      const updated = updateGraphProviderPreference(currentSnapshot, provider);
      const currentGraph = updated.project.graph ?? createDefaultGraph(provider);
      const defaultGraph = createDefaultGraph(provider);
      const nextGraph = {
        ...defaultGraph,
        id: currentGraph.id,
        name: normalizeGraphFileNameForContentType(currentGraph.name, defaultGraph.contentType),
        source: getDefaultGraphSource(provider),
        updatedAt: new Date().toISOString()
      };

      return updateGraph(updated, () => nextGraph);
    });
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
  }, [diagram.name]);

  const handleExportPdf = useCallback(async () => {
    if (isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);

    try {
      const pdfBytes = await exportTypstPdf(activeDocument.content, [
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
    activeDocument.content,
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
    setActiveSidebarTool("search");
    setIsSidebarCollapsed(false);

    if (workspaceMode === "editor" || workspaceMode === "preview") {
      setWorkspaceMode("split");
    }
  }, [workspaceMode]);

  const updateSearchQuery = useCallback(
    (patch: Partial<TypstSearchQueryState>) => {
      setSearchQuery((currentQuery) => {
        const nextQuery = {
          ...currentQuery,
          ...patch
        };
        editorRef.current?.setSearchQuery(nextQuery);
        return nextQuery;
      });
    },
    []
  );

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
        text: "Fill in owner, repo, branch, directory, and token first."
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
        text: "Fill in owner, repo, branch, directory, and token first."
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
        text: "Fill in owner, repo, branch, directory, and token first."
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
  const outlineEntries = useMemo(
    () => collectOutlineEntries(activeDocument.content),
    [activeDocument.content]
  );
  const lightThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "light");
  const darkThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "dark");
  const effectiveWorkspaceWidth =
    workspaceWidth > 0 ? workspaceWidth : typeof window !== "undefined" ? window.innerWidth : 0;
  const isMobileWorkspace =
    effectiveWorkspaceWidth > 0 && effectiveWorkspaceWidth <= MOBILE_WORKSPACE_THRESHOLD;
  const showDesktopSidebar = !isMobileWorkspace && !isSidebarCollapsed;
  const sidebarHandleWidth = showDesktopSidebar ? PANEL_HANDLE_WIDTH : 0;
  const previewHandleWidth = isMobileWorkspace ? 0 : PANEL_HANDLE_WIDTH;
  const sidebarPaneWidth = showDesktopSidebar ? sidebarWidth : 0;
  const handleWidthTotal = sidebarHandleWidth + previewHandleWidth;
  const previewPaneWidth = isPreviewCollapsed
    ? PANEL_COLLAPSED_WIDTH
    : getPreviewPaneWidth(effectiveWorkspaceWidth, sidebarPaneWidth, handleWidthTotal, previewRatio);
  const sourcePaneWidth =
    workspaceMode === "split" && effectiveWorkspaceWidth > 0
      ? Math.max(
          0,
          effectiveWorkspaceWidth - sidebarPaneWidth - previewPaneWidth - handleWidthTotal
        )
      : 0;
  const workspaceGridStyle: CSSProperties =
    isMobileWorkspace
      ? {
          display: "flex",
          flexDirection: "column"
        }
      : workspaceMode === "split"
      ? {
          gridTemplateColumns: showDesktopSidebar
            ? `${sidebarPaneWidth}px ${sidebarHandleWidth}px ${sourcePaneWidth}px ${previewHandleWidth}px ${previewPaneWidth}px`
            : `${sourcePaneWidth}px ${previewHandleWidth}px ${previewPaneWidth}px`
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
  const previewPaneCollapsed = isPreviewCollapsed && !isMobileWorkspace;
  const sidebarToolTitle = getSidebarToolTitle(activeSidebarTool);
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

      if (shouldOpenSearchPane) {
        window.requestAnimationFrame(() => {
          openSearchPane();
        });
      }
    },
    [activeSidebarTool, isMobileWorkspace, isSidebarCollapsed, openSearchPane, workspaceMode]
  );
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
                  <h2>{sidebarToolTitle}</h2>
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
                  ) : null}
                </div>
              </div>

              {activeSidebarTool === "files" ? (
                <section className="sidebar-section sidebar-section--scrollable">
                  <div className="file-tree" role="tree" aria-label="Files">

                    <div className="file-tree__branch">
                      <button
                        className="file-tree__branch-header file-tree__branch-header--button"
                        onClick={() => handleToggleFolder("documents")}
                        type="button"
                        aria-expanded={!collapsedFileFolders.documents}
                        aria-label={`${collapsedFileFolders.documents ? "Expand" : "Collapse"} Documents`}
                      >
                        <span aria-hidden="true" className="file-tree__chevron-text">
                          {collapsedFileFolders.documents ? "▸" : "▾"}
                        </span>
                        <span className="file-tree__folder-icon" aria-hidden="true" />
                        <span className="file-tree__branch-label">Documents</span>
                        <span className="file-row__meta">{snapshot.project.documents.length}</span>
                      </button>
                      {!collapsedFileFolders.documents ? (
                        <div className="file-list file-tree__items" role="group">
                          {snapshot.project.documents.map((document) => (
                            <button
                              key={document.id}
                              className={`file-row file-tree__entry-row ${
                                document.id === activeDocument.id ? "file-row--active" : ""
                              }`}
                              onClick={(event) => {
                                if (
                                  (event.target as HTMLElement).closest(".file-tree__rename-target")
                                ) {
                                  return;
                                }
                                handleSelectDocument(document.id);
                              }}
                              role="treeitem"
                              type="button"
                            >
                              <span
                                className="file-row__name file-tree__rename-target"
                                onDoubleClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleRenameDocumentFromTree(document.id, document.name);
                                }}
                              >
                                {document.name}
                              </span>
                              <span className="file-row__meta">
                                {document.id === activeDocument.id ? "Open" : "Switch"}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="file-tree__branch">
                      <button
                        className="file-tree__branch-header file-tree__branch-header--button"
                        onClick={() => handleToggleFolder("figures")}
                        type="button"
                        aria-expanded={!collapsedFileFolders.figures}
                        aria-label={`${collapsedFileFolders.figures ? "Expand" : "Collapse"} figures`}
                      >
                        <span aria-hidden="true" className="file-tree__chevron-text">
                          {collapsedFileFolders.figures ? "▸" : "▾"}
                        </span>
                        <span className="file-tree__folder-icon" aria-hidden="true" />
                        <span className="file-tree__branch-label">figures</span>
                        <span className="file-row__meta">{savedFigures.length}</span>
                      </button>
                      {!collapsedFileFolders.figures ? (
                        <div className="file-list file-tree__items" role="group">
                          {savedFigures.length > 0 ? (
                            savedFigures.map((figure) => (
                              <button
                                key={figure.id}
                                className="file-row file-tree__entry-row"
                                onClick={(event) => {
                                  if (
                                    (event.target as HTMLElement).closest(".file-tree__rename-target")
                                  ) {
                                    return;
                                  }
                                  handleOpenDiagramFigure(figure.id);
                                }}
                                role="treeitem"
                                type="button"
                              >
                                <span
                                  className="file-row__name file-tree__rename-target"
                                  onDoubleClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleRenameFigureFromTree(figure.id, figure.name);
                                  }}
                                >
                                  {figure.name}
                                </span>
                                <span className="file-row__meta">Open</span>
                              </button>
                            ))
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="file-tree__branch">
                      <button
                        className="file-tree__branch-header file-tree__branch-header--button"
                        onClick={() => handleToggleFolder("graphs")}
                        type="button"
                        aria-expanded={!collapsedFileFolders.graphs}
                        aria-label={`${collapsedFileFolders.graphs ? "Expand" : "Collapse"} graphs`}
                      >
                        <span aria-hidden="true" className="file-tree__chevron-text">
                          {collapsedFileFolders.graphs ? "▸" : "▾"}
                        </span>
                        <span className="file-tree__folder-icon" aria-hidden="true" />
                        <span className="file-tree__branch-label">graphs</span>
                        <span className="file-row__meta">{savedGraphs.length}</span>
                      </button>
                      {!collapsedFileFolders.graphs ? (
                        <div className="file-list file-tree__items" role="group">
                          {savedGraphs.length > 0 ? (
                            savedGraphs.map((graphFigure) => (
                              <button
                                key={graphFigure.id}
                                className="file-row file-tree__entry-row"
                                onClick={(event) => {
                                  if (
                                    (event.target as HTMLElement).closest(".file-tree__rename-target")
                                  ) {
                                    return;
                                  }
                                  handleOpenGraphFigure(graphFigure.id);
                                }}
                                role="treeitem"
                                type="button"
                              >
                                <span
                                  className="file-row__name file-tree__rename-target"
                                  onDoubleClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleRenameGraphFromTree(graphFigure.id, graphFigure.name);
                                  }}
                                >
                                  {graphFigure.name}
                                </span>
                                <span className="file-row__meta">Open</span>
                              </button>
                            ))
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {customFolders.map((folder) => (
                      <div className="file-tree__branch" key={folder.id}>
                        <button
                          className="file-tree__branch-header file-tree__branch-header--button"
                          onClick={() => handleToggleFolder(folder.id)}
                          type="button"
                          aria-expanded={!collapsedFileFolders[folder.id]}
                          aria-label={`${collapsedFileFolders[folder.id] ? "Expand" : "Collapse"} ${folder.name}`}
                        >
                          <span aria-hidden="true" className="file-tree__chevron-text">
                            {collapsedFileFolders[folder.id] ? "▸" : "▾"}
                          </span>
                          <span className="file-tree__folder-icon" aria-hidden="true" />
                          <span className="file-tree__branch-label">{folder.name}</span>
                          <span className="file-row__meta">0</span>
                        </button>
                      </div>
                    ))}
                  </div>
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
                                editorRef.current?.findPrevious();
                              } else {
                                editorRef.current?.findNext();
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
                        onClick={() => editorRef.current?.findPrevious()}
                        type="button"
                      >
                        Previous
                      </button>
                      <button
                        className="pane__button pane__button--compact"
                        onClick={() => editorRef.current?.findNext()}
                        type="button"
                      >
                        Next
                      </button>
                    </div>

                    <div className="sidebar-search-panel__actions sidebar-search-panel__actions--full">
                      <button
                        className="pane__button pane__button--compact"
                        onClick={() => editorRef.current?.selectMatches()}
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
                              editorRef.current?.replaceNext();
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
                        onClick={() => editorRef.current?.replaceNext()}
                        type="button"
                      >
                        Replace
                      </button>
                      <button
                        className="pane__button pane__button--compact"
                        onClick={() => editorRef.current?.replaceAll()}
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
                      {outlineEntries.map((entry) => (
                        <button
                          key={`${entry.lineNumber}:${entry.title}`}
                          className="outline-row"
                          onClick={() =>
                            focusDocumentLocation(activeDocument.id, entry.lineNumber, 1)
                          }
                          style={
                            {
                              "--outline-level": entry.level
                            } as CSSProperties
                          }
                          type="button"
                        >
                          <span className="outline-row__title">{entry.title}</span>
                          <span className="outline-row__meta">{`H${entry.level}`}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="snippet-empty">
                      Add Typst headings like <code>= Section</code> to build an outline.
                    </div>
                  )}
                </section>
              ) : null}

              {activeSidebarTool === "diagram" ? (
                <section className="sidebar-section sidebar-section--scrollable">
                  <DiagramEditorErrorBoundary>
                    <DiagramEditor
                      diagram={diagram}
                      inkColor={diagramInkColor}
                      onAddStroke={handleAddDiagramStroke}
                      onAddShape={handleAddDiagramShape}
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
                      onExpand={openDiagramExpanded}
                      paperView={isPaperView}
                    />
                  </DiagramEditorErrorBoundary>
                </section>
              ) : null}

              {activeSidebarTool === "graph" ? (
                <section className="sidebar-section sidebar-section--scrollable">
                  <GraphEditorErrorBoundary>
                    <GraphEditor
                      apiKey={desmosApiKey}
                      graph={graph}
                      isExpanded={false}
                      onExpand={openGraphExpanded}
                      onInsertIntoDocument={handleInsertGraphIntoDocument}
                      onDownloadGraph={handleDownloadGraph}
                      onNew={handleNewGraph}
                      onRename={handleRenameGraph}
                      onSave={handleSaveGraph}
                      onProviderChange={handleGraphProviderChange}
                      onRenderModeChange={handleGraphRenderModeChange}
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

        {showDesktopSidebar ? (
          <button
            aria-label="Resize sidebar"
            className="workspace-handle workspace-handle--left"
            onPointerDown={beginPanelResize("sidebar")}
            type="button"
          />
        ) : null}

        <section
          className={`pane pane--editor ${editorVisibilityClass}`}
          aria-label="Typst source editor"
        >
          <div className="pane__header">
            <div className="pane__header-group">
              <h2>Source</h2>
            </div>
            <div className="pane__header-actions">
              {snapshot.preferences.liveCompilation ? null : (
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
          {isSourceToolbarVisible ? (
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
                  title={snapshot.preferences.vimMode ? "Vim mode on" : "Vim mode off"}
                >
                  <span aria-hidden="true" className="toolbar-icon toolbar-icon--vim" />
                </button>
              </div>
            </div>
          ) : null}
          <TypstEditor
            ref={editorRef}
            diagnostics={editorDiagnostics}
            highlightErrors={isErrorSettled}
            snippets={allSnippets}
            onCompileRequested={handleCompile}
            onSearchRequested={openSearchPane}
            value={activeDocument.content}
            vimMode={snapshot.preferences.vimMode}
            cursorSmooth={snapshot.preferences.cursorSmooth}
            cursorSmear={snapshot.preferences.cursorSmear}
            theme={theme}
            onChange={handleDocumentChange}
          />
          {compileResult && !compileResult.ok ? (
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

        {isMobileWorkspace ? null : (
          <button
            aria-label="Resize preview"
            className="workspace-handle workspace-handle--right"
            onPointerDown={beginPanelResize("preview")}
            type="button"
          />
        )}

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
                zoom={previewZoom}
              />
            </>
          )}
        </section>
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
              zoom={previewZoom}
            />
          </section>
        </div>
      ) : null}

      {isDiagramExpanded ? (
        <div
          className="sheet-backdrop diagram-popup-backdrop"
          onClick={closeDiagramExpanded}
          role="presentation"
        >
          <section
            aria-label="Expanded diagram editor"
            className="diagram-popup"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="diagram-popup__header">
              <div>
                <h2>Diagram</h2>
              </div>
              <button className="pane__button" onClick={closeDiagramExpanded} type="button">
                Close
              </button>
            </div>
            <div className="diagram-popup__body">
              <DiagramEditorErrorBoundary>
                <DiagramEditor
                  diagram={diagram}
                  inkColor={diagramInkColor}
                  isExpanded
                  onAddStroke={handleAddDiagramStroke}
                  onAddShape={handleAddDiagramShape}
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
                  paperView={isPaperView}
                />
              </DiagramEditorErrorBoundary>
            </div>
          </section>
        </div>
      ) : null}

      {isGraphExpanded ? (
        <div
          className="sheet-backdrop diagram-popup-backdrop"
          onClick={closeGraphExpanded}
          role="presentation"
        >
          <section
            aria-label="Expanded graph editor"
            className="diagram-popup graph-popup"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="diagram-popup__header">
              <div>
                <h2>Graph</h2>
              </div>
              <button className="pane__button" onClick={closeGraphExpanded} type="button">
                Close
              </button>
            </div>
            <div className="diagram-popup__body">
              <GraphEditorErrorBoundary>
                <GraphEditor
                  apiKey={desmosApiKey}
                  graph={graph}
                  isExpanded
                  onDownloadGraph={handleDownloadGraph}
                  onInsertIntoDocument={handleInsertGraphIntoDocument}
                  onNew={handleNewGraph}
                  onRename={handleRenameGraph}
                  onSave={handleSaveGraph}
                  onProviderChange={handleGraphProviderChange}
                  onRenderModeChange={handleGraphRenderModeChange}
                  paperView={isPaperView}
                />
              </GraphEditorErrorBoundary>
            </div>
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
                  Configure sync, themes, snippets, and graph tools from one place.
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
                  aria-selected={settingsTab === "snippets"}
                  className={`settings-tab ${settingsTab === "snippets" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("snippets")}
                  role="tab"
                  type="button"
                >
                  Snippets
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
                        placeholder="docs"
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
                          <strong>Live compilation</strong>
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
              ) : (
                <div className="settings-panel" role="tabpanel">
                  <div className="settings-section">
                    <div className="settings-section__header">
                      <h3>Graph default</h3>
                      <span className="pane__meta">
                        {getGraphProviderLabel(snapshot.preferences.graphProvider)}
                      </span>
                    </div>
                    <div className="sync-field">
                      <span>Graph engine</span>
                      <div
                        className={`menu-dropdown settings-graph-provider ${
                          isGraphProviderMenuOpen ? "menu-dropdown--open" : ""
                        }`}
                        onMouseEnter={() => setIsGraphProviderMenuOpen(true)}
                        onMouseLeave={() => setIsGraphProviderMenuOpen(false)}
                      >
                        <button
                          aria-expanded={isGraphProviderMenuOpen}
                          aria-haspopup="menu"
                          className="menu-dropdown__trigger settings-graph-provider__trigger"
                          onClick={() =>
                            setIsGraphProviderMenuOpen((current) => !current)
                          }
                          type="button"
                        >
                          <span>{getGraphProviderLabel(snapshot.preferences.graphProvider)}</span>
                          <span aria-hidden="true" className="settings-graph-provider__chevron">
                            ▾
                          </span>
                        </button>
                        {isGraphProviderMenuOpen ? (
                          <div className="menu-dropdown__panel settings-graph-provider__panel" role="menu">
                            {(["desmos", "plotly", "gnuplot"] as const).map((provider) => (
                              <button
                                className="menu-action"
                                key={provider}
                                onClick={() => {
                                  handleGraphProviderChange(provider);
                                  setIsGraphProviderMenuOpen(false);
                                }}
                                role="menuitem"
                                type="button"
                              >
                                {getGraphProviderLabel(provider)}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="sidebar-card">
                      <p className="sidebar-card__copy">
                        New graphs will start in the selected provider. Existing graphs keep the
                        provider they were created with.
                      </p>
                    </div>
                  </div>

                  <div className="settings-section">
                    <div className="settings-section__header">
                      <h3>Desmos</h3>
                      <span className="pane__meta">
                        {desmosApiKey.trim() ? "Configured" : "Required"}
                      </span>
                    </div>
                    <label className="sync-field">
                      <span>API key</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) => setDesmosApiKey(event.target.value)}
                        placeholder="desmos_api_key..."
                        type="password"
                        value={desmosApiKey}
                      />
                    </label>
                    <div className="sidebar-card">
                      <p className="sidebar-card__copy">
                        The key is stored locally so the graph editor can load Desmos and render
                        graph exports.
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
