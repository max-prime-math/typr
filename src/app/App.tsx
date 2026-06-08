import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  updateAutoSyncGitProjectsPreference,
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
import { InlinePaneExpandControls } from "./InlinePaneExpandControls";
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
import { TerminalDrawer } from "../terminal/TerminalDrawer";
import { isTerminalToggleShortcut } from "../terminal/terminalHotkey";
import {
  PreviewPane,
  PreviewDebugPanel,
  PreviewStatusIcon,
  type WorkspacePreviewFile
} from "../preview/PreviewPane";
import { MitexPanel } from "../mitex/MitexPanel";
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
  buildGraphInsertResult,
  buildGraphSourceInsertResult,
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
  loadGitWorkspace,
  loadGitHubConfig,
  loadProjectStorage,
  loadSnapshot,
  loadCustomSnippets,
  deleteProjectGitFiles,
  saveGitWorkspace,
  saveGitHubConfig,
  saveProjectStorage,
  saveSnapshot,
  saveCustomSnippets
} from "../storage/indexedDbStorage";
import {
  addProjectRepository,
  createEmptyProjectRepository,
  createProjectStorageFromSnapshot,
  deleteProjectPath,
  ensureProjectFolder,
  getSelectedProjectRepository,
  listProjectEntries,
  normalizeProjectStorageState,
  projectRepositoryToLegacyProject,
  readProjectFileBytes,
  removeProjectRepository,
  syncProjectStorageFromSnapshot,
  updateSelectedProjectRepository,
  writeProjectFile,
  type ProjectFilesystemEntry,
  type TyprProjectRepository,
  type TyprProjectStorageState
} from "../project/projectState";
import {
  createEmptyGitManagedProject,
  normalizeGitWorkspaceState,
  parseIgnorePatternsInput,
  stringifyIgnorePatterns,
  type GitManagedProject,
  type GitWorkspaceState
} from "../git/gitState";
import {
  createRepoBackend,
  formatRepoError,
  type RepoBranch,
  type RepoCommit,
  type RepoMergeResolution,
  type RepoStorageStats,
  type RepoStatus,
  type RepoStatusEntry
} from "../git/repoBackend";
import { loadGitCredentialMap, redactGitSecrets, saveGitCredentialMap } from "../git/credentials";
import {
  createRemoteGitService,
  type RemoteGitConfig,
  type RemoteGitAccount,
  type RemoteGitBranchSummary,
  type RemoteGitProgress,
  type RemoteGitRepositorySummary,
  type UpstreamTracking
} from "../git/remoteService";
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
  removeProjectFromOpfs,
  syncProjectToOpfs,
  isOpfsAvailable,
  readWorkspaceFileFromOpfs
} from "../workspace/opfsWorkspace";
import { WorkspaceTree, WORKSPACE_ROOT_PATH } from "../workspace/WorkspaceTree";
import {
  buildProjectWorkspaceEntries,
  buildProjectWorkspaceEntriesFromProject,
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
import { shouldIgnorePath } from "../git/pathFilters";

const COMPILE_DEBOUNCE_MS = 60;
const SAVE_DEBOUNCE_MS = 250;
const SYNC_PROGRESS_UPDATE_INTERVAL_MS = 250;
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
  { id: "mitex", label: "MiTeX" },
  { id: "sync", label: "Git" },
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
type SidebarTool =
  | "files"
  | "search"
  | "outline"
  | "mitex"
  | "sync"
  | "debug"
  | "diagram"
  | "graph";
type DiagramPaneMode = "sidebar" | "source" | "preview";
type GraphPaneMode = "sidebar" | "source" | "preview";
type GitMergePaneMode = "sidebar" | "source" | "preview";
type MergeVersionRole = "base" | "local" | "remote";
type SettingsTab = "git" | "themes" | "keybindings" | "snippets" | "packages" | "graphs";
type MatrixDelimiter = "paren" | "bracket" | "brace" | "bar" | "angle" | "none";
type TableAlignment = "left" | "center" | "right" | "horizon";
type TableGutter = "none" | "small" | "medium";
type TableInset = "none" | "small" | "medium";
type TableStroke = "default" | "none";

interface SyncFeedback {
  tone: "neutral" | "success" | "error";
  text: string;
}

type SyncStatusSnapshot = SyncFeedback & {
  progress: { current: number; total: number } | null;
};

const INITIAL_SYNC_STATUS: SyncStatusSnapshot = {
  tone: "neutral",
  text: "Ready for Git.",
  progress: null
};

let syncStatusSnapshot = INITIAL_SYNC_STATUS;
const syncStatusListeners = new Set<() => void>();

function subscribeSyncStatus(listener: () => void): () => void {
  syncStatusListeners.add(listener);
  return () => {
    syncStatusListeners.delete(listener);
  };
}

function getSyncStatusSnapshot(): SyncStatusSnapshot {
  return syncStatusSnapshot;
}

function setSyncStatusSnapshot(nextStatus: SyncStatusSnapshot): void {
  if (
    syncStatusSnapshot.tone === nextStatus.tone &&
    syncStatusSnapshot.text === nextStatus.text &&
    syncStatusSnapshot.progress?.current === nextStatus.progress?.current &&
    syncStatusSnapshot.progress?.total === nextStatus.progress?.total
  ) {
    return;
  }

  syncStatusSnapshot = nextStatus;
  for (const listener of syncStatusListeners) {
    listener();
  }
}

interface GitFileStatus {
  path: string;
  state: "in-sync" | "local-only" | "remote-only" | "diverged";
}

type GitHubRepoMode = "select" | "create" | "manual";

interface GitHubDiscoveryState {
  status: "idle" | "loading" | "connected" | "error";
  message: string;
  accountLogin: string | null;
  owners: RemoteGitAccount[];
  repos: RemoteGitRepositorySummary[];
  branches: RemoteGitBranchSummary[];
  repoMode: GitHubRepoMode;
  isLoadingRepos: boolean;
  isLoadingBranches: boolean;
}

type MergeResolutionDraft =
  | { kind: "oid"; oid: string | null; label: string }
  | { kind: "content"; content: string };

interface MergeVersionPreview {
  oid: string | null;
  label: string;
  text: string;
}

interface MergeFilePreview {
  path: string;
  base: MergeVersionPreview;
  local: MergeVersionPreview;
  remote: MergeVersionPreview;
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

function formatRepoStatusEntry(entry: RepoStatusEntry): string {
  const parts = [entry.staged ? `staged ${entry.staged}` : null, entry.worktree]
    .filter((part): part is string => Boolean(part));
  return parts.join(", ") || "clean";
}

function hasRepoChanges(status: RepoStatus | null): boolean {
  return Boolean(status?.entries.length);
}

function hasActiveMergeStop(status: RepoStatus | null): boolean {
  return Boolean(status?.mergeState);
}

function isRemoteDivergenceMessage(message: string): boolean {
  return /remote contains work|pull first|diverged|non-fast-forward/i.test(message);
}

function getMergeDiffLines(
  versionText: string,
  baseText: string,
  peerText: string
): Array<{ number: number; text: string; tone: "same" | "changed" | "missing" }> {
  const versionLines = versionText.split("\n");
  const baseLines = baseText.split("\n");
  const peerLines = peerText.split("\n");
  const lineCount = Math.max(versionLines.length, baseLines.length, peerLines.length);

  return Array.from({ length: lineCount }, (_, index) => {
    const text = versionLines[index] ?? "";
    const differsFromBase = versionLines[index] !== baseLines[index];
    const differsFromPeer = versionLines[index] !== peerLines[index];
    const missing = index >= versionLines.length;
    return {
      number: index + 1,
      text: missing ? "" : text,
      tone: missing ? "missing" : differsFromBase || differsFromPeer ? "changed" : "same"
    };
  });
}

function getFirstChangedMergeLineNumber(baseText: string, localText: string, remoteText: string): number {
  const baseLines = baseText.split("\n");
  const localLines = localText.split("\n");
  const remoteLines = remoteText.split("\n");
  const lineCount = Math.max(baseLines.length, localLines.length, remoteLines.length);

  for (let index = 0; index < lineCount; index += 1) {
    if (baseLines[index] !== localLines[index] || baseLines[index] !== remoteLines[index]) {
      return index + 1;
    }
  }

  return 1;
}

function scrollMergeBodyToLine(body: HTMLDivElement, lineNumber: number) {
  const line = body.querySelector<HTMLElement>(`[data-merge-line="${lineNumber}"]`);
  if (!line) {
    return;
  }

  body.scrollTop = Math.max(0, line.offsetTop - body.offsetTop);
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
  const gitStatusRequestRef = useRef(0);
  const mergeVersionBodyRefs = useRef<Record<MergeVersionRole, HTMLDivElement | null>>({
    base: null,
    local: null,
    remote: null
  });
  const isSyncingMergeScrollRef = useRef(false);
  const themeRef = useRef<ThemeDefinition | null>(null);
  const compileResultRef = useRef<CompileResult | null>(null);
  const handleCompileRef = useRef<() => void>(() => {});
  const compileInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const [activeMenu, setActiveMenu] = useState<MenuLabel | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("git");
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
  const [gitMergePaneMode, setGitMergePaneMode] = useState<GitMergePaneMode>("sidebar");
  const [isPreviewDebugVisible, setIsPreviewDebugVisible] = useState(false);
  const [isSourceToolbarVisible, setIsSourceToolbarVisible] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
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
  const defaultSnapshotRef = useRef<AppSnapshot | null>(null);
  if (defaultSnapshotRef.current === null) {
    defaultSnapshotRef.current = createDefaultSnapshot();
  }
  const [rawSnapshot, setRawSnapshot] = useState<AppSnapshot>(defaultSnapshotRef.current);
  const [projectStorage, setProjectStorage] = useState<TyprProjectStorageState>(() =>
    createProjectStorageFromSnapshot(defaultSnapshotRef.current as AppSnapshot)
  );
  const snapshot = rawSnapshot;
  const selectedProjectRepository = useMemo(
    () => getSelectedProjectRepository(projectStorage),
    [projectStorage]
  );
  const setSnapshot = useCallback<Dispatch<SetStateAction<AppSnapshot>>>((snapshotAction) => {
    setRawSnapshot((currentSnapshot) => {
      const nextSnapshot =
        typeof snapshotAction === "function"
          ? (snapshotAction as (snapshot: AppSnapshot) => AppSnapshot)(currentSnapshot)
          : snapshotAction;

      setProjectStorage((currentStorage) =>
        syncProjectStorageFromSnapshot(nextSnapshot, currentStorage, currentSnapshot)
      );

      return nextSnapshot;
    });
  }, []);
  const setProjectRepository = useCallback(
    (updater: (project: TyprProjectRepository) => TyprProjectRepository) => {
      setProjectStorage((currentStorage) => {
        let nextProject: TyprProjectRepository | null = null;
        const nextStorage = updateSelectedProjectRepository(currentStorage, (project) => {
          nextProject = updater(project);
          return nextProject;
        });

        const updatedProject = nextProject;
        if (updatedProject) {
          setRawSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            project: projectRepositoryToLegacyProject(updatedProject, currentSnapshot.project)
          }));
        }

        return nextStorage;
      });
    },
    []
  );
  const [gitWorkspace, setGitWorkspace] = useState<GitWorkspaceState>({
    version: 1,
    selectedProjectId: null,
    selectedProjectIdsByTyprProjectId: {},
    projects: []
  });
  const [isHydrated, setIsHydrated] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<
    Extract<CompileResult, { ok: true }> | null
  >(null);
  const [isErrorSettled, setIsErrorSettled] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncOperationRef = useRef(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [storageStatus, setStorageStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const pendingSyncProgressRef = useRef<RemoteGitProgress | null>(null);
  const syncProgressFlushTimerRef = useRef<number | null>(null);
  const lastSyncProgressFlushAtRef = useRef(0);
  const lastAutoSyncKeyRef = useRef<string | null>(null);
  const setSyncFeedback = useCallback((feedback: SyncFeedback) => {
    setSyncStatusSnapshot({ ...feedback, progress: null });
  }, []);
  const [gitCredentials, setGitCredentials] = useState<Record<string, string>>({});
  const [gitHubDiscovery, setGitHubDiscovery] = useState<GitHubDiscoveryState>({
    status: "idle",
    message: "",
    accountLogin: null,
    owners: [],
    repos: [],
    branches: [],
    repoMode: "select",
    isLoadingRepos: false,
    isLoadingBranches: false
  });
  const [upstreamTracking, setUpstreamTracking] = useState<UpstreamTracking | null>(null);
  const [createGitHubRepoPrivate, setCreateGitHubRepoPrivate] = useState(true);
  const [gitCommitHistory, setGitCommitHistory] = useState<RepoCommit[]>([]);
  const [gitFileStatuses, setGitFileStatuses] = useState<GitFileStatus[]>([]);
  const [gitBranches, setGitBranches] = useState<
    Array<{ name: string; sha: string | null; protected?: boolean; current: boolean }>
  >([]);
  const [isGitStatusLoading, setIsGitStatusLoading] = useState(false);
  const repoBackend = useMemo(() => createRepoBackend(), []);
  const remoteGitService = useMemo(() => createRemoteGitService({ repoBackend }), [repoBackend]);
  const [localRepoStatus, setLocalRepoStatus] = useState<RepoStatus | null>(null);
  const [localRepoCommits, setLocalRepoCommits] = useState<RepoCommit[]>([]);
  const [localRepoBranches, setLocalRepoBranches] = useState<RepoBranch[]>([]);
  const [filesGitConflictNotice, setFilesGitConflictNotice] = useState<string | null>(null);
  const [selectedMergePath, setSelectedMergePath] = useState<string | null>(null);
  const [mergeFilePreview, setMergeFilePreview] = useState<MergeFilePreview | null>(null);
  const [isMergeFilePreviewLoading, setIsMergeFilePreviewLoading] = useState(false);
  const [mergeResolutionDrafts, setMergeResolutionDrafts] = useState<Record<string, MergeResolutionDraft>>({});
  const [mergeCommitMessage, setMergeCommitMessage] = useState("");
  const [gitRefreshToken, setGitRefreshToken] = useState(0);
  const [repoStorageStats, setRepoStorageStats] = useState<RepoStorageStats | null>(null);
  const [isRepoStorageLoading, setIsRepoStorageLoading] = useState(false);
  const [repoStorageFeedback, setRepoStorageFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
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
  const handleAutoSyncGitProjectsToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateAutoSyncGitProjectsPreference(
        currentSnapshot,
        !currentSnapshot.preferences.autoSyncGitProjects
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
  const gitProjectsForSelectedTyprProject = useMemo(
    () =>
      selectedProjectRepository
        ? gitWorkspace.projects.filter((project) => project.projectId === selectedProjectRepository.id)
        : [],
    [gitWorkspace.projects, selectedProjectRepository]
  );
  const githubConnectedProjectOptions = useMemo(
    () =>
      projectStorage.projects.flatMap((project) => {
        const connectedProjects = gitWorkspace.projects.filter(
          (managedProject) =>
            managedProject.projectId === project.id &&
            managedProject.connected &&
            managedProject.owner.trim() &&
            managedProject.repo.trim()
        );
        if (connectedProjects.length === 0) {
          return [];
        }

        const scopedSelection = gitWorkspace.selectedProjectIdsByTyprProjectId[project.id];
        const selectedManagedProject =
          connectedProjects.find((managedProject) => managedProject.id === scopedSelection) ??
          connectedProjects[0];

        return [
          {
            project,
            managedProject: selectedManagedProject
          }
        ];
      }),
    [
      gitWorkspace.projects,
      gitWorkspace.selectedProjectIdsByTyprProjectId,
      projectStorage.projects
    ]
  );
  const selectedGitProject = useMemo(
    () => {
      if (!selectedProjectRepository) {
        return null;
      }

      const scopedSelection =
        gitWorkspace.selectedProjectIdsByTyprProjectId[selectedProjectRepository.id] ??
        gitWorkspace.selectedProjectId;
      return (
        gitProjectsForSelectedTyprProject.find((project) => project.id === scopedSelection) ??
        gitProjectsForSelectedTyprProject[0] ??
        null
      );
    },
    [
      gitProjectsForSelectedTyprProject,
      gitWorkspace.selectedProjectId,
      gitWorkspace.selectedProjectIdsByTyprProjectId,
      selectedProjectRepository
    ]
  );
  const remoteConfig = useMemo<RemoteGitConfig>(
    () =>
      selectedGitProject
        ? {
            owner: selectedGitProject.owner,
            repo: selectedGitProject.repo,
            branch: selectedGitProject.branch,
            remoteName: selectedGitProject.remoteName
          }
        : {
            owner: "",
            repo: "",
            branch: "main",
            remoteName: "origin"
          },
    [selectedGitProject]
  );
  const selectedGitToken = selectedGitProject ? (gitCredentials[selectedGitProject.id] ?? "") : "";
  const selectedGitProjectIsGitHubConnected =
    Boolean(selectedGitProject?.connected && selectedGitProject.owner.trim() && selectedGitProject.repo.trim());
  const selectedProjectGitConnectionLabel = selectedGitProjectIsGitHubConnected
    ? "Connected"
    : "Not connected";
  const selectedGitHubProjectDropdownValue =
    selectedGitProjectIsGitHubConnected && selectedProjectRepository
      ? selectedProjectRepository.id
      : "";
  useEffect(() => {
    if (!isHydrated || !selectedGitProject || !selectedProjectRepository || !selectedGitProject.connected) {
      return;
    }

    const remoteName = selectedGitProject.remoteName.trim();
    const hasRemoteAddress = selectedGitProject.owner.trim() && selectedGitProject.repo.trim();
    if (!remoteName || !hasRemoteAddress) {
      return;
    }

    const remoteUrl = remoteGitService.getRemoteUrl({
      owner: selectedGitProject.owner,
      repo: selectedGitProject.repo,
      branch: selectedGitProject.branch,
      remoteName
    });
    const existingRemote = selectedProjectRepository.git.remotes.find(
      (remote) => remote.name === remoteName
    );
    if (existingRemote?.url === remoteUrl) {
      return;
    }

    setProjectRepository((project) => {
      if (project.id !== selectedProjectRepository.id) {
        return project;
      }

      const nextRemotes = [
        ...project.git.remotes.filter((remote) => remote.name !== remoteName),
        { name: remoteName, url: remoteUrl }
      ].sort((left, right) => left.name.localeCompare(right.name));
      return {
        ...project,
        git: {
          ...project.git,
          remotes: nextRemotes
        }
      };
    });
  }, [
    isHydrated,
    remoteGitService,
    selectedGitProject,
    selectedProjectRepository,
    setProjectRepository
  ]);
  const gitWorkingTreeEntries = useMemo<RepoStatusEntry[]>(
    () =>
      selectedGitProject
        ? (localRepoStatus?.entries ?? []).filter(
            (entry) => !shouldIgnorePath(entry.path, selectedGitProject.ignorePatterns)
          )
        : [],
    [localRepoStatus, selectedGitProject]
  );
  const localGitCommits = useMemo<RepoCommit[]>(
    () => (selectedGitProject ? localRepoCommits : []),
    [localRepoCommits, selectedGitProject]
  );
  const activeMergeState = localRepoStatus?.mergeState ?? null;
  const activeMergeKey = activeMergeState
    ? `${activeMergeState.localSha}:${activeMergeState.remoteSha}:${activeMergeState.startedAt}`
    : "";
  const conflictMergeFiles = useMemo(
    () => activeMergeState?.files.filter((file) => file.state === "conflict") ?? [],
    [activeMergeState]
  );
  const unresolvedMergeConflictCount = conflictMergeFiles.filter(
    (file) => !mergeResolutionDrafts[file.path]
  ).length;
  const selectedMergeDraft = selectedMergePath ? mergeResolutionDrafts[selectedMergePath] : null;
  const mergeResolutionEditorValue = useMemo(() => {
    if (!selectedMergeDraft || !mergeFilePreview) {
      return "";
    }
    if (selectedMergeDraft.kind === "content") {
      return selectedMergeDraft.content;
    }

    const matchingVersion = [
      mergeFilePreview.base,
      mergeFilePreview.local,
      mergeFilePreview.remote
    ].find((version) => version.oid === selectedMergeDraft.oid);
    return matchingVersion?.oid ? matchingVersion.text : "";
  }, [mergeFilePreview, selectedMergeDraft]);
  const updateGitManagedProject = useCallback(
    (projectId: string, updater: (project: GitManagedProject) => GitManagedProject) => {
      setGitWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        projects: currentWorkspace.projects.map((project) =>
          project.id === projectId ? updater(project) : project
        )
      }));
    },
    []
  );
  const updateSelectedGitProject = useCallback(
    (updater: (project: GitManagedProject) => GitManagedProject) => {
      setGitWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        projects: currentWorkspace.projects.map((project) =>
          project.id === selectedGitProject?.id
            ? updater(project)
            : project
        )
      }));
    },
    [selectedGitProject?.id]
  );
  useEffect(() => {
    if (!activeMergeState) {
      setSelectedMergePath(null);
      setMergeFilePreview(null);
      setMergeResolutionDrafts({});
      setMergeCommitMessage("");
      return;
    }

    const firstFile = activeMergeState.files.find((file) => file.state === "conflict") ??
      activeMergeState.files[0] ??
      null;
    setSelectedMergePath(firstFile?.path ?? null);
    setMergeFilePreview(null);
    setMergeResolutionDrafts({});
    setMergeCommitMessage(
      `Merge ${activeMergeState.remoteName}/${activeMergeState.remoteBranch} into ${activeMergeState.branch}`
    );
  }, [activeMergeKey]);

  useEffect(() => {
    if (!activeMergeState || !selectedProjectRepository || !selectedMergePath) {
      setMergeFilePreview(null);
      setIsMergeFilePreviewLoading(false);
      return;
    }

    const file = activeMergeState.files.find((entry) => entry.path === selectedMergePath);
    if (!file) {
      setMergeFilePreview(null);
      return;
    }

    let cancelled = false;
    const readVersion = async (oid: string | null, label: string): Promise<MergeVersionPreview> => {
      if (!oid) {
        return { oid: null, label, text: "(deleted)" };
      }
      const object = await repoBackend.readObject(selectedProjectRepository, oid);
      if (!object.ok) {
        return { oid, label, text: formatRepoError(object.error) };
      }
      if (object.value.type !== "blob") {
        return { oid, label, text: `Unsupported ${object.value.type} object.` };
      }
      return {
        oid,
        label,
        text: new TextDecoder().decode(object.value.content)
      };
    };

    setIsMergeFilePreviewLoading(true);
    void Promise.all([
      readVersion(file.baseOid, "Base"),
      readVersion(file.localOid, "Local"),
      readVersion(file.remoteOid, "Remote")
    ]).then(([base, local, remote]) => {
      if (cancelled) {
        return;
      }
      setMergeFilePreview({ path: file.path, base, local, remote });
      setIsMergeFilePreviewLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeMergeState, repoBackend, selectedMergePath, selectedProjectRepository]);
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

      const bytes = selectedProjectRepository
        ? await readWorkspaceFileFromOpfs(selectedProjectRepository.id, sourceWorkspaceNode.path)
        : null;

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
  }, [selectedProjectRepository, sourceWorkspaceNode]);
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

    const fallbackTree = buildWorkspaceTree(
      selectedProjectRepository
        ? buildProjectWorkspaceEntriesFromProject(selectedProjectRepository)
        : buildProjectWorkspaceEntries(snapshot)
    );
    setWorkspaceTree(fallbackTree);
    setWorkspaceLoadError(null);

    if (!isOpfsAvailable() || !selectedProjectRepository) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      const syncWorkspace = async () => {
        try {
          await syncProjectToOpfs(selectedProjectRepository);
        } catch (error) {
          if (!cancelled) {
            setWorkspaceLoadError(
              error instanceof Error ? error.message : "Unable to load workspace explorer."
            );
          }
        }
      };

      void syncWorkspace();
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isHydrated, selectedProjectRepository, snapshot]);

  const refreshLocalRepoState = useCallback(
    async (project: TyprProjectRepository | null = selectedProjectRepository) => {
      const requestId = gitStatusRequestRef.current + 1;
      gitStatusRequestRef.current = requestId;
      if (!project) {
        setLocalRepoStatus(null);
        setLocalRepoCommits([]);
        setLocalRepoBranches([]);
        return;
      }

      setIsGitStatusLoading(true);
      const initResult = await repoBackend.initRepository(project);
      if (gitStatusRequestRef.current !== requestId) {
        return;
      }
      if (!initResult.ok) {
        setIsGitStatusLoading(false);
        setSyncFeedback({
          tone: "error",
          text: formatRepoError(initResult.error)
        });
        return;
      }

      if (initResult.value !== project) {
        setProjectRepository((currentProject) =>
          currentProject.id === initResult.value.id ? initResult.value : currentProject
        );
      }

      const initializedProject = initResult.value;
      const [statusResult, branchesResult, commitsResult] = await Promise.all([
        repoBackend.status(initializedProject),
        repoBackend.listBranches(initializedProject),
        repoBackend.log(initializedProject, 30)
      ]);

      if (gitStatusRequestRef.current !== requestId) {
        return;
      }
      setIsGitStatusLoading(false);
      if (!statusResult.ok) {
        setSyncFeedback({
          tone: "error",
          text: formatRepoError(statusResult.error)
        });
        return;
      }

      setLocalRepoStatus(statusResult.value);
      setLocalRepoBranches(branchesResult.ok ? branchesResult.value : []);
      setLocalRepoCommits(commitsResult.ok ? commitsResult.value : []);
      setGitBranches(branchesResult.ok ? branchesResult.value : []);
      setGitCommitHistory(commitsResult.ok ? commitsResult.value : []);
      setGitFileStatuses(
        statusResult.value.entries.map((entry) => ({
          path: entry.path,
          state: entry.staged || entry.worktree ? "diverged" : "in-sync"
        }))
      );
      if (selectedGitProject) {
        const upstream = await remoteGitService.inspectUpstream(initializedProject, {
          owner: selectedGitProject.owner,
          repo: selectedGitProject.repo,
          branch: statusResult.value.branch,
          remoteName: selectedGitProject.remoteName
        });
        if (gitStatusRequestRef.current !== requestId) {
          return;
        }
        setUpstreamTracking(upstream.ok ? upstream.value : null);
      } else {
        setUpstreamTracking(null);
      }
    },
    [repoBackend, remoteGitService, selectedGitProject, selectedProjectRepository, setProjectRepository]
  );

  const refreshRepoStorageStats = useCallback(
    async (project: TyprProjectRepository | null = selectedProjectRepository) => {
      if (!project) {
        setRepoStorageStats(null);
        return;
      }

      setIsRepoStorageLoading(true);
      const result = await repoBackend.getStorageStats(project);
      setIsRepoStorageLoading(false);
      if (!result.ok) {
        setRepoStorageStats(null);
        setRepoStorageFeedback({
          tone: "error",
          text: formatRepoError(result.error)
        });
        return;
      }

      setRepoStorageStats(result.value);
    },
    [repoBackend, selectedProjectRepository]
  );

  const handlePruneRepoObjects = useCallback(async () => {
    if (!selectedProjectRepository) {
      return;
    }

    setIsRepoStorageLoading(true);
    const result = await repoBackend.pruneObjects(selectedProjectRepository);
    setIsRepoStorageLoading(false);
    if (!result.ok) {
      setRepoStorageFeedback({
        tone: "error",
        text: formatRepoError(result.error)
      });
      return;
    }

    setRepoStorageFeedback({
      tone: "success",
      text:
        result.value.deletedObjectCount === 0
          ? "No unreachable Git objects found."
          : `Removed ${result.value.deletedObjectCount} unreachable object${
              result.value.deletedObjectCount === 1 ? "" : "s"
            } and freed ${formatByteSize(result.value.deletedBytes)}.`
    });
    await refreshRepoStorageStats(selectedProjectRepository);
    setGitRefreshToken((token) => token + 1);
  }, [refreshRepoStorageStats, repoBackend, selectedProjectRepository]);

  useEffect(() => {
    if (!isHydrated || !selectedProjectRepository) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (!cancelled) {
        void refreshLocalRepoState(selectedProjectRepository);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    gitRefreshToken,
    isHydrated,
    refreshLocalRepoState,
    selectedProjectRepository?.filesystem.updatedAt,
    selectedProjectRepository?.git.headRef,
    selectedProjectRepository?.id
  ]);

  useEffect(() => {
    if (!isHydrated || !selectedProjectRepository) {
      setRepoStorageStats(null);
      return;
    }

    void refreshRepoStorageStats(selectedProjectRepository);
  }, [
    gitRefreshToken,
    isHydrated,
    refreshRepoStorageStats,
    selectedProjectRepository?.git.headRef,
    selectedProjectRepository?.id
  ]);

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
      const [storedSnapshot, storedProjectStorage, storedGitWorkspace, storedGitHubConfig, storedGitCredentials] = await Promise.all([
        loadSnapshot(),
        loadProjectStorage(),
        loadGitWorkspace(),
        loadGitHubConfig(),
        loadGitCredentialMap()
      ]);
      const storedSnippets = await loadCustomSnippets();

      if (cancelled) {
        return;
      }

      const nextSnapshot = storedSnapshot
        ? normalizeSnapshot(storedSnapshot)
        : createDefaultSnapshot();
      const nextProjectStorage = normalizeProjectStorageState(
        storedProjectStorage,
        nextSnapshot
      );
      const selectedProject = getSelectedProjectRepository(nextProjectStorage);
      const hydratedSnapshot = selectedProject
        ? {
            ...nextSnapshot,
            project: projectRepositoryToLegacyProject(selectedProject, nextSnapshot.project)
          }
        : nextSnapshot;
      const migratedWorkspace = normalizeGitWorkspaceState(
        storedGitWorkspace ?? {
          version: 1,
          selectedProjectId: null,
          projects: storedGitHubConfig
            ? [
                {
                  ...createEmptyGitManagedProject({
                    projectId: hydratedSnapshot.project.id,
                    projectName: hydratedSnapshot.project.name
                  }),
                  owner: storedGitHubConfig.owner,
                  repo: storedGitHubConfig.repo,
                  branch: storedGitHubConfig.branch || "main"
                }
              ]
            : [],
          selectedProjectIdsByTyprProjectId: {}
        },
        {
          projectId: hydratedSnapshot.project.id,
          projectName: hydratedSnapshot.project.name
        }
      );
      const migratedCredentials = { ...storedGitCredentials };
      for (const project of storedGitWorkspace?.projects ?? []) {
        const legacyToken = (project as Partial<GitManagedProject> & { token?: string }).token?.trim();
        if (project.id && legacyToken && !migratedCredentials[project.id]) {
          migratedCredentials[project.id] = legacyToken;
        }
      }
      if (storedGitHubConfig?.token?.trim()) {
        const selectedId = migratedWorkspace.selectedProjectId ?? migratedWorkspace.projects[0]?.id;
        if (selectedId && !migratedCredentials[selectedId]) {
          migratedCredentials[selectedId] = storedGitHubConfig.token.trim();
        }
      }
      setRawSnapshot(hydratedSnapshot);
      setProjectStorage(nextProjectStorage);
      setTheme(hydratedSnapshot.preferences.theme);
      setGitWorkspace(migratedWorkspace);
      setGitCredentials(migratedCredentials);
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
      if (isTerminalToggleShortcut(event)) {
        event.preventDefault();
        setIsTerminalOpen((current) => !current);
        return;
      }

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
    if (!selectedGitProject) {
      setGitBranches([]);
      setGitCommitHistory([]);
      setGitFileStatuses([]);
      setUpstreamTracking(null);
      return;
    }

    setGitBranches(localRepoBranches);
    setGitCommitHistory(localRepoCommits);
    setGitFileStatuses(
      gitWorkingTreeEntries.map((entry) => ({
        path: entry.path,
        state: entry.staged || entry.worktree ? "diverged" : "in-sync"
      }))
    );
  }, [
    gitWorkingTreeEntries,
    localRepoBranches,
    localRepoCommits,
    localRepoStatus,
    selectedGitProject
  ]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      setStorageStatus("saving");
      Promise.all([saveSnapshot(snapshot), saveProjectStorage(projectStorage)])
        .then(() => setStorageStatus("saved"))
        .catch(() => setStorageStatus("error"));
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [isHydrated, projectStorage, snapshot]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handle = window.setTimeout(() => {
      const selectedProjectConfig = selectedGitProject
        ? {
            owner: selectedGitProject.owner,
            repo: selectedGitProject.repo,
            branch: selectedGitProject.branch,
            directory: "",
            token: ""
          }
        : { owner: "", repo: "", branch: "main", directory: "", token: "" };

      void Promise.all([
        saveGitWorkspace(gitWorkspace),
        saveGitCredentialMap(gitCredentials),
        saveGitHubConfig(selectedProjectConfig)
      ]).catch(() => {
        setSyncFeedback({
          tone: "error",
          text: "Unable to save Git remote settings locally."
        });
      });
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [gitCredentials, gitWorkspace, isHydrated, selectedGitProject]);

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

      if (result.ok) {
        setCompilerStatus((currentStatus) => ({
          phase: "ready",
          mode: currentStatus.mode,
          label: "Preview ready"
        }));
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

  const handleGitRemoteConfigChange = useCallback((
    field: "owner" | "repo" | "branch" | "remoteName",
    value: string
  ) => {
    updateSelectedGitProject((currentProject) => ({
      ...currentProject,
      [field]: value
    }));
  }, [updateSelectedGitProject]);

  const handleGitCredentialChange = (value: string) => {
    if (!selectedGitProject) {
      return;
    }
    setGitHubDiscovery({
      status: "idle",
      message: "",
      accountLogin: null,
      owners: [],
      repos: [],
      branches: [],
      repoMode: "select",
      isLoadingRepos: false,
      isLoadingBranches: false
    });
    setGitCredentials((current) => ({
      ...current,
      [selectedGitProject.id]: value
    }));
  };

  const handleConnectGitHub = useCallback(async () => {
    if (!selectedGitProject) {
      setSyncFeedback({ tone: "error", text: "Create or select a managed git project first." });
      return { ok: false as const };
    }
    if (!selectedGitToken.trim()) {
      setSyncFeedback({ tone: "error", text: "Add a GitHub token before connecting." });
      return { ok: false as const };
    }

    setGitHubDiscovery((current) => ({
      ...current,
      status: "loading",
      message: "Connecting to GitHub...",
      repos: [],
      branches: [],
      isLoadingRepos: false,
      isLoadingBranches: false
    }));

    const result = await remoteGitService.inspectToken(() => selectedGitToken);
    if (!result.ok) {
      const message = redactGitSecrets(result.message, [selectedGitToken]);
      setGitHubDiscovery((current) => ({
        ...current,
        status: "error",
        message,
        accountLogin: null,
        owners: [],
        repos: [],
        branches: [],
        isLoadingRepos: false,
        isLoadingBranches: false
      }));
      setSyncFeedback({ tone: "error", text: message });
      return { ok: false as const };
    }

    const currentOwner = remoteConfig.owner.trim();
    const nextOwner =
      result.value.owners.find((owner) => owner.login.toLowerCase() === currentOwner.toLowerCase())?.login ??
      (currentOwner || result.value.user.login);
    setGitHubDiscovery((current) => ({
      ...current,
      status: "connected",
      message: result.message,
      accountLogin: result.value.user.login,
      owners: result.value.owners,
      repos: [],
      branches: [],
      isLoadingRepos: false,
      isLoadingBranches: false
    }));
    if (!currentOwner || nextOwner !== currentOwner) {
      handleGitRemoteConfigChange("owner", nextOwner);
    }
    setSyncFeedback({ tone: "success", text: result.message });
    return { ok: true as const };
  }, [handleGitRemoteConfigChange, remoteConfig.owner, remoteGitService, selectedGitProject, selectedGitToken]);

  const handleGitHubRepoModeChange = useCallback((mode: GitHubRepoMode) => {
    setGitHubDiscovery((current) => ({
      ...current,
      repoMode: mode,
      branches: mode === "select" ? current.branches : []
    }));
    if (mode === "create") {
      handleGitRemoteConfigChange("repo", "");
      handleGitRemoteConfigChange("branch", "main");
    }
  }, [handleGitRemoteConfigChange]);

  const handleGitHubOwnerChange = useCallback(
    (owner: string) => {
      handleGitRemoteConfigChange("owner", owner);
      handleGitRemoteConfigChange("repo", "");
      handleGitRemoteConfigChange("branch", "main");
      setGitHubDiscovery((current) => ({
        ...current,
        repos: [],
        branches: []
      }));
    },
    [handleGitRemoteConfigChange]
  );

  const handleGitHubRepoSelection = useCallback(
    (repoName: string) => {
      const selectedRepo = gitHubDiscovery.repos.find((repo) => repo.name === repoName);
      handleGitRemoteConfigChange("repo", repoName);
      if (selectedRepo?.defaultBranch) {
        handleGitRemoteConfigChange("branch", selectedRepo.defaultBranch);
      }
    },
    [gitHubDiscovery.repos, handleGitRemoteConfigChange]
  );

  const handleGitHubUrlPaste = useCallback((value: string) => {
    const match = /github\.com[:/]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#\s]|$)/i.exec(value.trim());
    if (!match) {
      return false;
    }

    handleGitRemoteConfigChange("owner", match[1]);
    handleGitRemoteConfigChange("repo", match[2]);
    setGitHubDiscovery((current) => ({
      ...current,
      repoMode: "manual",
      branches: []
    }));
    return true;
  }, [handleGitRemoteConfigChange]);

  useEffect(() => {
    if (
      gitHubDiscovery.status !== "connected" ||
      !selectedGitToken.trim() ||
      !remoteConfig.owner.trim()
    ) {
      return;
    }

    let cancelled = false;
    setGitHubDiscovery((current) => ({
      ...current,
      repos: [],
      branches: [],
      isLoadingRepos: true,
      isLoadingBranches: false
    }));

    void remoteGitService
      .listRepositories(remoteConfig.owner, () => selectedGitToken)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          const message = redactGitSecrets(result.message, [selectedGitToken]);
          setGitHubDiscovery((current) => ({
            ...current,
            message,
            repos: [],
            branches: [],
            isLoadingRepos: false,
            isLoadingBranches: false
          }));
          return;
        }

        setGitHubDiscovery((current) => ({
          ...current,
          message: result.message,
          repos: result.value,
          branches: [],
          isLoadingRepos: false,
          isLoadingBranches: false
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [gitHubDiscovery.status, remoteConfig.owner, remoteGitService, selectedGitToken]);

  useEffect(() => {
    if (
      gitHubDiscovery.status !== "connected" ||
      !selectedGitToken.trim() ||
      !remoteConfig.owner.trim() ||
      !remoteConfig.repo.trim()
    ) {
      return;
    }

    let cancelled = false;
    setGitHubDiscovery((current) => ({
      ...current,
      branches: [],
      isLoadingBranches: true
    }));

    void remoteGitService
      .listBranches(
        { owner: remoteConfig.owner, repo: remoteConfig.repo },
        () => selectedGitToken
      )
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          const message = redactGitSecrets(result.message, [selectedGitToken]);
          setGitHubDiscovery((current) => ({
            ...current,
            message,
            branches: [],
            isLoadingBranches: false
          }));
          return;
        }
        setGitHubDiscovery((current) => ({
          ...current,
          message: result.message,
          branches: result.value,
          isLoadingBranches: false
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    gitHubDiscovery.status,
    remoteConfig.owner,
    remoteConfig.repo,
    remoteGitService,
    selectedGitToken
  ]);

  const handleGitProjectFieldChange = useCallback(
    (field: keyof GitManagedProject, value: string) => {
      updateSelectedGitProject((currentProject) => ({
        ...currentProject,
        [field]: value
      }));
    },
    [updateSelectedGitProject]
  );

  const handleGitProjectBackendChange = useCallback(
    (backendId: GitManagedProject["backendId"]) => {
      updateSelectedGitProject((currentProject) => ({
        ...currentProject,
        backendId
      }));
    },
    [updateSelectedGitProject]
  );

  const handleGitIgnorePatternsChange = useCallback(
    (value: string) => {
      updateSelectedGitProject((currentProject) => ({
        ...currentProject,
        ignorePatterns: parseIgnorePatternsInput(value)
      }));
    },
    [updateSelectedGitProject]
  );

  const handleStageGitPaths = useCallback(
    async (paths: string[]) => {
      if (!selectedProjectRepository) {
        return;
      }

      const result = await repoBackend.stagePaths(selectedProjectRepository, paths);
      if (!result.ok) {
        setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
        return;
      }
      setLocalRepoStatus(result.value);
      setGitRefreshToken((token) => token + 1);
    },
    [repoBackend, selectedProjectRepository]
  );

  const handleUnstageGitPath = useCallback(
    async (path: string) => {
      if (!selectedProjectRepository) {
        return;
      }

      const result = await repoBackend.resetIndex(selectedProjectRepository, [path]);
      if (!result.ok) {
        setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
        return;
      }
      setLocalRepoStatus(result.value);
      setGitRefreshToken((token) => token + 1);
    },
    [repoBackend, selectedProjectRepository]
  );

  const handleStageAllGitChanges = useCallback(() => {
    const changedPaths = gitWorkingTreeEntries.map((entry) => entry.path);
    if (changedPaths.length === 0) {
      setSyncFeedback({
        tone: "neutral",
        text: "No local changes to stage."
      });
      return;
    }

    void handleStageGitPaths(changedPaths);
    setSyncFeedback({
      tone: "success",
      text: `Staged ${changedPaths.length} path${changedPaths.length === 1 ? "" : "s"}.`
    });
  }, [gitWorkingTreeEntries, handleStageGitPaths]);

  const handleCommitGitChanges = useCallback(async () => {
    if (!selectedGitProject || !selectedProjectRepository) {
      setSyncFeedback({
        tone: "error",
        text: "Create or select a managed git project first."
      });
      return;
    }

    if (!localRepoStatus?.entries.some((entry) => entry.staged !== null)) {
      setSyncFeedback({
        tone: "error",
        text: "Stage one or more files before committing."
      });
      return;
    }

    const message = selectedGitProject.draftCommitMessage.trim();
    if (!message) {
      setSyncFeedback({
        tone: "error",
        text: "Enter a commit message first."
      });
      return;
    }

    const commitResult = await repoBackend.commit(selectedProjectRepository, { message });
    if (!commitResult.ok) {
      setSyncFeedback({
        tone: "error",
        text: formatRepoError(commitResult.error)
      });
      return;
    }

    updateGitManagedProject(selectedGitProject.id, (currentProject) => ({
      ...currentProject,
      draftCommitMessage: "",
      commitMessageTemplate: message
    }));
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Committed ${commitResult.value.shortSha}: ${commitResult.value.message}`
    });
  }, [
    localRepoStatus,
    repoBackend,
    selectedGitProject,
    selectedProjectRepository,
    updateGitManagedProject
  ]);

  const handleAbortGitMerge = useCallback(async () => {
    if (!selectedProjectRepository) {
      return;
    }

    const result = await repoBackend.abortMerge(selectedProjectRepository);
    if (!result.ok) {
      setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
      return;
    }

    setLocalRepoStatus(result.value);
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "neutral",
      text: "Cleared the browser merge stop. Local files and commits were left unchanged."
    });
  }, [repoBackend, selectedProjectRepository]);

  const handleUseMergeVersion = useCallback(
    (path: string, label: string, oid: string | null) => {
      setMergeResolutionDrafts((currentDrafts) => ({
        ...currentDrafts,
        [path]: { kind: "oid", oid, label }
      }));
    },
    []
  );

  const handleEditMergeResolution = useCallback((path: string, content: string) => {
    setMergeResolutionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [path]: { kind: "content", content }
    }));
  }, []);

  const handleContinueGitMerge = useCallback(async () => {
    if (!selectedProjectRepository || !activeMergeState) {
      return;
    }

    const unresolvedFile = conflictMergeFiles.find((file) => !mergeResolutionDrafts[file.path]);
    if (unresolvedFile) {
      setSyncFeedback({
        tone: "error",
        text: `Resolve ${unresolvedFile.path} before continuing the merge.`
      });
      setSelectedMergePath(unresolvedFile.path);
      return;
    }

    const resolutions: RepoMergeResolution[] = conflictMergeFiles.map((file) => {
      const draft = mergeResolutionDrafts[file.path];
      return draft.kind === "content"
        ? { path: file.path, content: draft.content }
        : { path: file.path, oid: draft.oid };
    });
    const result = await repoBackend.continueMerge(selectedProjectRepository, {
      message: mergeCommitMessage.trim() ||
        `Merge ${activeMergeState.remoteName}/${activeMergeState.remoteBranch} into ${activeMergeState.branch}`,
      resolutions
    });
    if (!result.ok) {
      setSyncFeedback({ tone: "error", text: formatRepoError(result.error) });
      return;
    }

    setProjectRepository((project) =>
      project.id === result.value.project.id ? result.value.project : project
    );
    setLocalRepoStatus(result.value.status);
    setMergeResolutionDrafts({});
    setMergeFilePreview(null);
    setSelectedMergePath(null);
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Created merge commit ${result.value.commit.shortSha}. You can push again now.`
    });
  }, [
    activeMergeState,
    conflictMergeFiles,
    mergeCommitMessage,
    mergeResolutionDrafts,
    repoBackend,
    selectedProjectRepository,
    setProjectRepository
  ]);

  const handleAddGitProject = useCallback(() => {
    if (!selectedProjectRepository) {
      return;
    }

    const nextProject = createEmptyGitManagedProject({
      projectId: selectedProjectRepository.id,
      projectName: selectedProjectRepository.displayName
    });

    setGitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      selectedProjectId: nextProject.id,
      selectedProjectIdsByTyprProjectId: {
        ...currentWorkspace.selectedProjectIdsByTyprProjectId,
        [selectedProjectRepository.id]: nextProject.id
      },
      projects: [...currentWorkspace.projects, nextProject]
    }));
  }, [selectedProjectRepository]);

  const handleRemoveSelectedGitProject = useCallback(() => {
    if (!selectedGitProject) {
      return;
    }

    setGitWorkspace((currentWorkspace) => {
      const remainingProjects = currentWorkspace.projects.filter(
        (project) => project.id !== selectedGitProject.id
      );
      const remainingProjectScopedSelection =
        remainingProjects.find((project) => project.projectId === selectedGitProject.projectId)?.id ?? null;
      return normalizeGitWorkspaceState(
        {
          ...currentWorkspace,
          selectedProjectId: remainingProjectScopedSelection,
          selectedProjectIdsByTyprProjectId: {
            ...currentWorkspace.selectedProjectIdsByTyprProjectId,
            [selectedGitProject.projectId]: remainingProjectScopedSelection
          },
          projects: remainingProjects
        },
        {
          projectId: selectedProjectRepository?.id ?? snapshot.project.id,
          projectName: selectedProjectRepository?.displayName ?? snapshot.project.name
        }
      );
    });
  }, [
    selectedGitProject,
    selectedProjectRepository,
    snapshot.project.id,
    snapshot.project.name
  ]);

  const selectProjectRepository = useCallback((project: TyprProjectRepository) => {
    setProjectStorage((currentStorage) => addProjectRepository(currentStorage, project));
    setRawSnapshot((currentSnapshot) => ({
      ...currentSnapshot,
      project: projectRepositoryToLegacyProject(project, currentSnapshot.project)
    }));
  }, []);

  const selectStoredProjectRepository = useCallback((projectId: string) => {
    setProjectStorage((currentStorage) => {
      const nextProject = currentStorage.projects.find((project) => project.id === projectId);
      if (!nextProject) {
        return currentStorage;
      }

      setRawSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        project: projectRepositoryToLegacyProject(nextProject, currentSnapshot.project)
      }));

      return {
        ...currentStorage,
        selectedProjectId: nextProject.id
      };
    });
  }, []);

  const selectGitHubConnectedProject = useCallback(
    (projectId: string) => {
      const option = githubConnectedProjectOptions.find(
        (connectedProject) => connectedProject.project.id === projectId
      );
      if (!option) {
        return;
      }

      setProjectStorage((currentStorage) => {
        const nextProject = currentStorage.projects.find((project) => project.id === projectId);
        if (!nextProject) {
          return currentStorage;
        }

        setRawSnapshot((currentSnapshot) => ({
          ...currentSnapshot,
          project: projectRepositoryToLegacyProject(nextProject, currentSnapshot.project)
        }));

        return {
          ...currentStorage,
          selectedProjectId: nextProject.id
        };
      });

      setGitWorkspace((currentWorkspace) => {
        const selectedManagedProject = currentWorkspace.projects.find(
          (managedProject) =>
            managedProject.id === option.managedProject.id &&
            managedProject.projectId === projectId &&
            managedProject.owner.trim() &&
            managedProject.repo.trim()
        );
        if (!selectedManagedProject) {
          return currentWorkspace;
        }

        return {
          ...currentWorkspace,
          selectedProjectId: selectedManagedProject.id,
          selectedProjectIdsByTyprProjectId: {
            ...currentWorkspace.selectedProjectIdsByTyprProjectId,
            [projectId]: selectedManagedProject.id
          }
        };
      });
    },
    [githubConnectedProjectOptions]
  );

  const addDefaultGitManagedProject = useCallback(
    (project: TyprProjectRepository, projectName = project.displayName) => {
      const nextProject = createEmptyGitManagedProject({
        projectId: project.id,
        projectName
      });

      setGitWorkspace((currentWorkspace) => {
        const existingProjects = currentWorkspace.projects.filter(
          (managedProject) => managedProject.projectId === project.id
        );
        const scopedSelection = currentWorkspace.selectedProjectIdsByTyprProjectId[project.id];
        const existingProject =
          existingProjects.find((managedProject) => managedProject.id === scopedSelection) ??
          existingProjects[0];
        if (existingProject) {
          return {
            ...currentWorkspace,
            selectedProjectId: existingProject.id,
            selectedProjectIdsByTyprProjectId: {
              ...currentWorkspace.selectedProjectIdsByTyprProjectId,
              [project.id]: existingProject.id
            }
          };
        }

        return {
          ...currentWorkspace,
          selectedProjectId: nextProject.id,
          selectedProjectIdsByTyprProjectId: {
            ...currentWorkspace.selectedProjectIdsByTyprProjectId,
            [project.id]: nextProject.id
          },
          projects: [...currentWorkspace.projects, nextProject]
        };
      });

      return nextProject.id;
    },
    []
  );

  const handleSelectGitSettingsProject = useCallback(
    (projectId: string) => {
      const nextProject = projectStorage.projects.find((project) => project.id === projectId);
      selectStoredProjectRepository(projectId);
      if (nextProject) {
        addDefaultGitManagedProject(nextProject, nextProject.displayName);
      }
    },
    [addDefaultGitManagedProject, projectStorage.projects, selectStoredProjectRepository]
  );

  const handleToggleSelectedGitHubConnection = useCallback(() => {
    if (!selectedGitProject) {
      return;
    }

    if (selectedGitProjectIsGitHubConnected) {
      const remoteName = selectedGitProject.remoteName.trim();
      updateSelectedGitProject((project) => ({
        ...project,
        connected: false,
        lastPulledAt: null,
        lastPushedAt: null
      }));
      setGitCredentials((currentCredentials) => {
        const nextCredentials = { ...currentCredentials };
        delete nextCredentials[selectedGitProject.id];
        return nextCredentials;
      });
      if (remoteName) {
        setProjectRepository((project) => ({
          ...project,
          git: {
            ...project.git,
            remotes: project.git.remotes.filter((remote) => remote.name !== remoteName)
          }
        }));
      }
      setSyncFeedback({
        tone: "success",
        text: "Disconnected this project from GitHub. The GitHub repository was not deleted."
      });
      return;
    }

    if (!remoteConfig.owner.trim() || !remoteConfig.repo.trim() || !remoteConfig.branch.trim() || !selectedGitToken.trim()) {
      setSyncFeedback({
        tone: "error",
        text: "Fill in owner, repo, branch, and token before connecting."
      });
      return;
    }

    updateSelectedGitProject((project) => ({
      ...project,
      connected: true
    }));
    setSyncFeedback({
      tone: "success",
      text: `Connected this project to ${remoteConfig.owner}/${remoteConfig.repo}.`
    });
  }, [
    remoteConfig,
    selectedGitProject,
    selectedGitProjectIsGitHubConnected,
    selectedGitToken,
    setProjectRepository,
    updateSelectedGitProject
  ]);

  const handleGitHubTokenConnectionAction = useCallback(async () => {
    if (selectedGitProjectIsGitHubConnected) {
      handleToggleSelectedGitHubConnection();
      return;
    }

    if (!remoteConfig.owner.trim() || !remoteConfig.repo.trim() || !remoteConfig.branch.trim()) {
      const tokenResult = await handleConnectGitHub();
      if (tokenResult.ok) {
        setSyncFeedback({
          tone: "neutral",
          text: "Choose a repository and branch, then click Connect again."
        });
      }
      return;
    }

    const tokenResult = await handleConnectGitHub();
    if (!tokenResult.ok) {
      return;
    }

    updateSelectedGitProject((project) => ({
      ...project,
      connected: true
    }));
    setSyncFeedback({
      tone: "success",
      text: `Connected this project to ${remoteConfig.owner}/${remoteConfig.repo}.`
    });
  }, [
    handleConnectGitHub,
    handleToggleSelectedGitHubConnection,
    remoteConfig,
    selectedGitProjectIsGitHubConnected,
    setSyncFeedback,
    updateSelectedGitProject
  ]);

  const handleCreateLocalProject = useCallback(() => {
    const enteredName = window.prompt("Project name", "Untitled project");
    if (enteredName === null) {
      return;
    }

    const displayName = enteredName.trim() || "Untitled project";
    const nextProject = createEmptyProjectRepository({
      displayName,
      defaultFileName: "main.typ",
      defaultContent: ""
    });

    selectProjectRepository(nextProject);
    addDefaultGitManagedProject(nextProject);
    setIsTrashViewOpen(false);
    setSelectedWorkspacePath(nextProject.selection.activeFilePath);
    setSelectedWorkspacePaths(nextProject.selection.activeFilePath ? [nextProject.selection.activeFilePath] : []);
    setWorkspaceSelectionAnchorPath(nextProject.selection.activeFilePath);
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Created local project "${displayName}".`
    });
  }, [addDefaultGitManagedProject, selectProjectRepository]);

  const handleDeleteSelectedProject = useCallback(async () => {
    if (!selectedProjectRepository) {
      return;
    }

    const projectToDelete = selectedProjectRepository;
    const confirmation = window.prompt(
      [
        `Delete local Typr project "${projectToDelete.displayName}"?`,
        "This removes its local files, browser git repo, managed repo entries, and stored tokens.",
        "It does not delete any GitHub repository.",
        "",
        `Type ${projectToDelete.displayName} to confirm.`
      ].join("\n"),
      ""
    );

    if (confirmation === null) {
      return;
    }

    if (confirmation !== projectToDelete.displayName) {
      setSyncFeedback({
        tone: "error",
        text: "Project deletion canceled because the confirmation text did not match."
      });
      return;
    }

    try {
      await deleteProjectGitFiles(projectToDelete.id);
      await removeProjectFromOpfs(projectToDelete.id);
    } catch (error) {
      setSyncFeedback({
        tone: "error",
        text: error instanceof Error
          ? `Unable to delete local repo data: ${error.message}`
          : "Unable to delete local repo data."
      });
      return;
    }

    const fallbackProject =
      projectStorage.projects.length <= 1
        ? createEmptyProjectRepository({
            displayName: "Untitled project",
            defaultFileName: "main.typ",
            defaultContent: ""
          })
        : undefined;
    const nextProjectStorage = removeProjectRepository(
      projectStorage,
      projectToDelete.id,
      fallbackProject
    );
    const nextProject = getSelectedProjectRepository(nextProjectStorage);
    const deletedManagedProjectIds = gitWorkspace.projects
      .filter((project) => project.projectId === projectToDelete.id)
      .map((project) => project.id);

    setProjectStorage(nextProjectStorage);
    if (nextProject) {
      setRawSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        project: projectRepositoryToLegacyProject(nextProject, currentSnapshot.project)
      }));
      setSelectedWorkspacePath(nextProject.selection.activeFilePath);
      setSelectedWorkspacePaths(nextProject.selection.activeFilePath ? [nextProject.selection.activeFilePath] : []);
      setWorkspaceSelectionAnchorPath(nextProject.selection.activeFilePath);
    }

    setGitWorkspace((currentWorkspace) => {
      let nextManagedProjects = currentWorkspace.projects.filter(
        (project) => project.projectId !== projectToDelete.id
      );
      const nextScopedSelections = { ...currentWorkspace.selectedProjectIdsByTyprProjectId };
      delete nextScopedSelections[projectToDelete.id];

      for (const [typrProjectId, managedProjectId] of Object.entries(nextScopedSelections)) {
        if (!nextManagedProjects.some((project) => project.id === managedProjectId && project.projectId === typrProjectId)) {
          delete nextScopedSelections[typrProjectId];
        }
      }

      let nextSelectedManagedProjectId: string | null = null;
      if (nextProject) {
        const scopedSelection = nextScopedSelections[nextProject.id];
        nextSelectedManagedProjectId =
          nextManagedProjects.find(
            (project) => project.id === scopedSelection && project.projectId === nextProject.id
          )?.id ??
          nextManagedProjects.find((project) => project.projectId === nextProject.id)?.id ??
          null;

        if (!nextSelectedManagedProjectId) {
          const nextManagedProject = createEmptyGitManagedProject({
            projectId: nextProject.id,
            projectName: `${nextProject.displayName} repo`
          });
          nextManagedProjects = [...nextManagedProjects, nextManagedProject];
          nextSelectedManagedProjectId = nextManagedProject.id;
        }

        nextScopedSelections[nextProject.id] = nextSelectedManagedProjectId;
      }

      return {
        ...currentWorkspace,
        selectedProjectId: nextSelectedManagedProjectId,
        selectedProjectIdsByTyprProjectId: nextScopedSelections,
        projects: nextManagedProjects
      };
    });
    setGitCredentials((currentCredentials) => {
      const nextCredentials = { ...currentCredentials };
      for (const managedProjectId of deletedManagedProjectIds) {
        delete nextCredentials[managedProjectId];
      }
      return nextCredentials;
    });
    setGitHubDiscovery({
      status: "idle",
      message: "",
      accountLogin: null,
      owners: [],
      repos: [],
      branches: [],
      repoMode: "select",
      isLoadingRepos: false,
      isLoadingBranches: false
    });
    setIsTrashViewOpen(false);
    setLocalRepoStatus(null);
    setLocalRepoCommits([]);
    setLocalRepoBranches([]);
    setUpstreamTracking(null);
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Deleted local project "${projectToDelete.displayName}". GitHub repositories were not changed.`
    });
  }, [
    gitWorkspace.projects,
    projectStorage,
    selectedProjectRepository
  ]);

  const handleRequestImportGitHubProject = useCallback(() => {
    if (selectedProjectRepository) {
      addDefaultGitManagedProject(selectedProjectRepository);
    }
    setSettingsTab("git");
    setIsSettingsOpen(true);
    setSyncFeedback({
      tone: "neutral",
      text: "Connect GitHub, choose owner/repo/branch, then import the repo as a separate project."
    });
  }, [addDefaultGitManagedProject, selectedProjectRepository]);

  const replaceProjectEntries = useCallback(
    (project: TyprProjectRepository, entries: ProjectFilesystemEntry[]) => {
      let nextProject = project;
      for (const entry of listProjectEntries(nextProject).sort((left, right) => right.path.length - left.path.length)) {
        nextProject = deleteProjectPath(nextProject, entry.path);
      }
      for (const entry of entries.filter((entry) => entry.kind === "folder")) {
        nextProject = ensureProjectFolder(nextProject, entry.path, entry.source);
      }
      for (const entry of entries.filter((entry) => entry.kind === "file")) {
        nextProject = writeProjectFile(nextProject, entry.path, entry.content, entry.source);
      }
      return nextProject;
    },
    []
  );

  const createManagedProjectForRepository = useCallback(
    (project: TyprProjectRepository, name: string) => ({
      ...createEmptyGitManagedProject({
        projectId: project.id,
        projectName: name
      }),
      name,
      owner: remoteConfig.owner,
      repo: remoteConfig.repo,
      connected: true,
      branch: remoteConfig.branch,
      remoteName: remoteConfig.remoteName
    }),
    [remoteConfig]
  );

  const handleCreateGitHubRepoFromCurrentProject = useCallback(async () => {
    if (!selectedProjectRepository || !selectedGitProject) {
      setSyncFeedback({ tone: "error", text: "Create or select a managed git project first." });
      return;
    }
    if (!remoteConfig.owner.trim() || !remoteConfig.repo.trim() || !remoteConfig.branch.trim() || !selectedGitToken.trim()) {
      setSyncFeedback({ tone: "error", text: "Fill in owner, repo, branch, and token first." });
      return;
    }

    const sourceEntries = listProjectEntries(selectedProjectRepository);
    setIsSyncing(true);
    setSyncFeedback({ tone: "neutral", text: `Creating ${remoteConfig.owner}/${remoteConfig.repo}...` });

    const createResult = await remoteGitService.createRepository(
      remoteConfig,
      () => selectedGitToken,
      {
        private: createGitHubRepoPrivate,
        description: `Created from ${selectedProjectRepository.displayName} in Typr`
      },
      { onProgress: (progress) => setSyncFeedback({ tone: "neutral", text: progress.message }) }
    );
    if (!createResult.ok) {
      setIsSyncing(false);
      setSyncFeedback({ tone: "error", text: createResult.message });
      return;
    }

    let remoteProject = createEmptyProjectRepository({
      displayName: selectedProjectRepository.displayName,
      defaultFileName: null
    });
    const initResult = await repoBackend.initRepository(remoteProject);
    if (!initResult.ok) {
      setIsSyncing(false);
      setSyncFeedback({ tone: "error", text: formatRepoError(initResult.error) });
      return;
    }
    remoteProject = initResult.value;

    const pullResult = await remoteGitService.pull(remoteProject, remoteConfig, () => selectedGitToken);
    if (!pullResult.ok || !pullResult.project) {
      setIsSyncing(false);
      setSyncFeedback({ tone: "error", text: pullResult.message });
      return;
    }

    remoteProject = replaceProjectEntries(pullResult.project, sourceEntries);
    const stageResult = await repoBackend.stagePaths(remoteProject, ["."]);
    if (!stageResult.ok) {
      setIsSyncing(false);
      setSyncFeedback({ tone: "error", text: formatRepoError(stageResult.error) });
      return;
    }
    const commitResult = await repoBackend.commit(remoteProject, {
      message: `Import ${selectedProjectRepository.displayName} from Typr`
    });
    if (!commitResult.ok) {
      setIsSyncing(false);
      setSyncFeedback({ tone: "error", text: formatRepoError(commitResult.error) });
      return;
    }

    const pushResult = await remoteGitService.push(remoteProject, remoteConfig, () => selectedGitToken);
    setIsSyncing(false);
    if (!pushResult.ok) {
      setSyncFeedback({ tone: "error", text: pushResult.message });
      return;
    }

    const managedProject = createManagedProjectForRepository(remoteProject, selectedProjectRepository.displayName);
    selectProjectRepository(remoteProject);
    setGitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      selectedProjectId: managedProject.id,
      selectedProjectIdsByTyprProjectId: {
        ...currentWorkspace.selectedProjectIdsByTyprProjectId,
        [remoteProject.id]: managedProject.id
      },
      projects: [...currentWorkspace.projects, managedProject]
    }));
    setGitCredentials((currentCredentials) => ({
      ...currentCredentials,
      [managedProject.id]: selectedGitToken
    }));
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Created ${remoteConfig.owner}/${remoteConfig.repo} and pushed ${commitResult.value.shortSha}.`
    });
  }, [
    createGitHubRepoPrivate,
    createManagedProjectForRepository,
    remoteConfig,
    remoteGitService,
    repoBackend,
    replaceProjectEntries,
    selectProjectRepository,
    selectedGitProject,
    selectedGitToken,
    selectedProjectRepository
  ]);

  const handleImportExistingGitHubRepoAsProject = useCallback(async () => {
    if (!selectedGitProject) {
      setSyncFeedback({ tone: "error", text: "Create or select a managed git project first." });
      return;
    }
    if (!remoteConfig.owner.trim() || !remoteConfig.repo.trim() || !remoteConfig.branch.trim() || !selectedGitToken.trim()) {
      setSyncFeedback({ tone: "error", text: "Fill in owner, repo, branch, and token first." });
      return;
    }

    setIsSyncing(true);
    setSyncFeedback({ tone: "neutral", text: `Importing ${remoteConfig.owner}/${remoteConfig.repo}...` });

    let importedProject = createEmptyProjectRepository({
      displayName: remoteConfig.repo,
      defaultFileName: null
    });
    const initResult = await repoBackend.initRepository(importedProject);
    if (!initResult.ok) {
      setIsSyncing(false);
      setSyncFeedback({ tone: "error", text: formatRepoError(initResult.error) });
      return;
    }
    importedProject = initResult.value;

    const pullResult = await remoteGitService.pull(importedProject, remoteConfig, () => selectedGitToken, {
      onProgress: (progress) => setSyncFeedback({ tone: "neutral", text: progress.message })
    });
    setIsSyncing(false);
    if (!pullResult.ok || !pullResult.project) {
      setSyncFeedback({ tone: "error", text: pullResult.message });
      return;
    }

    importedProject = {
      ...pullResult.project,
      displayName: remoteConfig.repo
    };
    const managedProject = createManagedProjectForRepository(importedProject, remoteConfig.repo);
    selectProjectRepository(importedProject);
    setGitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      selectedProjectId: managedProject.id,
      selectedProjectIdsByTyprProjectId: {
        ...currentWorkspace.selectedProjectIdsByTyprProjectId,
        [importedProject.id]: managedProject.id
      },
      projects: [...currentWorkspace.projects, managedProject]
    }));
    setGitCredentials((currentCredentials) => ({
      ...currentCredentials,
      [managedProject.id]: selectedGitToken
    }));
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Imported ${remoteConfig.owner}/${remoteConfig.repo} as a separate project.`
    });
  }, [
    createManagedProjectForRepository,
    remoteConfig,
    remoteGitService,
    repoBackend,
    selectProjectRepository,
    selectedGitProject,
    selectedGitToken
  ]);

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

  const handleInsertGraphSourceIntoDocument = useCallback((graphAsset: GraphAsset) => {
    const insertResult = buildGraphSourceInsertResult(graphAsset);

    if (!insertResult.supported) {
      window.alert("Add at least one valid function before inserting source.");
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
      "Tutorial: open Files to switch projects and documents, type in Source, use View for layout controls, and use Git settings when you want to connect a remote."
    );
  };

  const handleOpenTypstReference = () => {
    window.open("https://typst.app/docs/", "_blank", "noopener,noreferrer");
  };

  const handleOpenGitRemoteHelp = () => {
    setSettingsTab("git");
    setIsSettingsOpen(true);
  };

  const handleRemoveCustomTheme = (themeId: string) => {
    removeCustomTheme(themeId);

    if (theme.id === themeId) {
      setThemeMode(AUTO_THEME_ID);
    }
  };

  const validateRemoteAction = useCallback(() => {
    if (!selectedGitProject) {
      const message = "Create or select a managed git project first.";
      setSyncFeedback({ tone: "error", text: message });
      setSettingsTab("git");
      setIsSettingsOpen(true);
      return { ok: false as const, message };
    }
    if (selectedGitProject.backendId !== "browser") {
      const message = "Local Agent and Cloud Container git transports are not connected in this build yet.";
      setSyncFeedback({ tone: "error", text: message });
      return { ok: false as const, message };
    }
    if (!isOnline) {
      const message = "This device is offline. Local commits are still available.";
      setSyncFeedback({ tone: "error", text: message });
      return { ok: false as const, message };
    }
    if (!selectedGitProject.connected) {
      const message = "Connect this project to GitHub first.";
      setSyncFeedback({ tone: "error", text: message });
      setSettingsTab("git");
      setIsSettingsOpen(true);
      return { ok: false as const, message };
    }
    if (!remoteConfig.owner.trim() || !remoteConfig.repo.trim() || !remoteConfig.branch.trim() || !selectedGitToken.trim()) {
      const message = "Fill in owner, repo, branch, and token first.";
      setSyncFeedback({ tone: "error", text: message });
      setSettingsTab("git");
      setIsSettingsOpen(true);
      return { ok: false as const, message };
    }
    if (!selectedProjectRepository) {
      const message = "No Typr project repository is open.";
      setSyncFeedback({ tone: "error", text: message });
      return { ok: false as const, message };
    }
    return {
      ok: true as const,
      project: selectedGitProject,
      repository: selectedProjectRepository
    };
  }, [isOnline, remoteConfig, selectedGitProject, selectedGitToken, selectedProjectRepository]);

  const finishRemoteOperation = useCallback(
    async (
      result: Awaited<ReturnType<typeof remoteGitService.push>>,
      updateProject: "pull" | "push" | "fetch" | "sync"
    ) => {
      syncOperationRef.current = false;
      pendingSyncProgressRef.current = null;
      if (syncProgressFlushTimerRef.current !== null) {
        window.clearTimeout(syncProgressFlushTimerRef.current);
        syncProgressFlushTimerRef.current = null;
      }
      setIsSyncing(false);
      const message = redactGitSecrets(result.message, [selectedGitToken]);
      setSyncFeedback({ tone: result.ok ? "success" : "error", text: message });
      if (result.project) {
        setProjectRepository((project) =>
          project.id === result.project?.id ? result.project : project
        );
      }
      if (result.status) {
        setLocalRepoStatus(result.status);
      }
      if (result.ok && selectedGitProject) {
        updateGitManagedProject(selectedGitProject.id, (project) => ({
          ...project,
          lastPulledAt: updateProject === "pull" || updateProject === "sync" || updateProject === "fetch"
            ? new Date().toISOString()
            : project.lastPulledAt,
          lastPushedAt: updateProject === "push" || updateProject === "sync"
            ? new Date().toISOString()
            : project.lastPushedAt
        }));
      }
      setGitRefreshToken((token) => token + 1);
      return result.ok
        ? { ok: true as const, message }
        : { ok: false as const, message };
    },
    [selectedGitProject, selectedGitToken, setProjectRepository, updateGitManagedProject]
  );

  const applyRemoteGitProgress = useCallback((progress: RemoteGitProgress) => {
    if (
      typeof progress.current === "number" &&
      typeof progress.total === "number" &&
      progress.total > 0
    ) {
      setSyncStatusSnapshot({
        tone: "neutral",
        text: progress.message,
        progress: {
          current: Math.max(0, Math.min(progress.current, progress.total)),
          total: progress.total
        }
      });
      return;
    }
    setSyncStatusSnapshot({ tone: "neutral", text: progress.message, progress: null });
  }, []);

  const flushRemoteGitProgress = useCallback(() => {
    const progress = pendingSyncProgressRef.current;
    if (!progress) {
      return;
    }
    pendingSyncProgressRef.current = null;
    if (syncProgressFlushTimerRef.current !== null) {
      window.clearTimeout(syncProgressFlushTimerRef.current);
      syncProgressFlushTimerRef.current = null;
    }
    lastSyncProgressFlushAtRef.current = Date.now();
    applyRemoteGitProgress(progress);
  }, [applyRemoteGitProgress]);

  const handleRemoteGitProgress = useCallback((progress: RemoteGitProgress) => {
    if (
      typeof progress.current === "number" &&
      typeof progress.total === "number" &&
      progress.total > 0
    ) {
      pendingSyncProgressRef.current = progress;
      const now = Date.now();
      const elapsed = now - lastSyncProgressFlushAtRef.current;
      const complete = progress.current >= progress.total;
      if (complete || elapsed >= SYNC_PROGRESS_UPDATE_INTERVAL_MS) {
        flushRemoteGitProgress();
        return;
      }
      if (syncProgressFlushTimerRef.current === null) {
        syncProgressFlushTimerRef.current = window.setTimeout(
          flushRemoteGitProgress,
          SYNC_PROGRESS_UPDATE_INTERVAL_MS - elapsed
        );
      }
      return;
    }
    pendingSyncProgressRef.current = progress;
    flushRemoteGitProgress();
  }, [flushRemoteGitProgress]);

  const beginRemoteOperation = useCallback((message: string) => {
    if (syncOperationRef.current) {
      const busyMessage = "A Git remote operation is already running.";
      setSyncFeedback({ tone: "neutral", text: busyMessage });
      return false;
    }
    syncOperationRef.current = true;
    pendingSyncProgressRef.current = null;
    if (syncProgressFlushTimerRef.current !== null) {
      window.clearTimeout(syncProgressFlushTimerRef.current);
      syncProgressFlushTimerRef.current = null;
    }
    lastSyncProgressFlushAtRef.current = 0;
    setIsSyncing(true);
    setSyncFeedback({ tone: "neutral", text: message });
    return true;
  }, []);

  useEffect(() => {
    return () => {
      if (syncProgressFlushTimerRef.current !== null) {
        window.clearTimeout(syncProgressFlushTimerRef.current);
      }
    };
  }, []);

  const handleFetchRemote = useCallback(async () => {
    const ready = validateRemoteAction();
    if (!ready.ok) return ready;
    if (!beginRemoteOperation(`Fetching ${remoteConfig.remoteName}/${remoteConfig.branch}...`)) {
      return { ok: false as const, message: "A Git remote operation is already running." };
    }
    const result = await remoteGitService.fetch(
      ready.repository,
      remoteConfig,
      () => selectedGitToken,
      { onProgress: handleRemoteGitProgress }
    );
    return finishRemoteOperation(result, "fetch");
  }, [
    beginRemoteOperation,
    finishRemoteOperation,
    handleRemoteGitProgress,
    remoteConfig,
    remoteGitService,
    selectedGitToken,
    validateRemoteAction
  ]);

  const handlePushRemote = useCallback(async () => {
    const ready = validateRemoteAction();
    if (!ready.ok) return ready;
    if (!beginRemoteOperation(`Pushing ${remoteConfig.branch} to ${remoteConfig.remoteName}...`)) {
      return { ok: false as const, message: "A Git remote operation is already running." };
    }
    const result = await remoteGitService.push(
      ready.repository,
      remoteConfig,
      () => selectedGitToken,
      { onProgress: handleRemoteGitProgress }
    );
    return finishRemoteOperation(result, "push");
  }, [
    beginRemoteOperation,
    finishRemoteOperation,
    handleRemoteGitProgress,
    remoteConfig,
    remoteGitService,
    selectedGitToken,
    validateRemoteAction
  ]);

  const handlePullRemote = useCallback(async () => {
    const ready = validateRemoteAction();
    if (!ready.ok) return ready;
    if (hasActiveMergeStop(localRepoStatus)) {
      const message = "A browser merge stop is active. Resolve it with Continue merge, or use git merge --abort before pulling again.";
      setSyncFeedback({ tone: "error", text: message });
      return { ok: false as const, message };
    }
    if (hasRepoChanges(localRepoStatus)) {
      const message = "Commit or reset local changes before pulling.";
      setSyncFeedback({ tone: "error", text: message });
      return { ok: false as const, message };
    }
    if (!beginRemoteOperation(`Pulling ${remoteConfig.remoteName}/${remoteConfig.branch}...`)) {
      return { ok: false as const, message: "A Git remote operation is already running." };
    }
    const result = await remoteGitService.pull(
      ready.repository,
      remoteConfig,
      () => selectedGitToken,
      { onProgress: handleRemoteGitProgress }
    );
    return finishRemoteOperation(result, "pull");
  }, [
    beginRemoteOperation,
    finishRemoteOperation,
    handleRemoteGitProgress,
    localRepoStatus,
    remoteConfig,
    remoteGitService,
    selectedGitToken,
    validateRemoteAction
  ]);

  const handleQuickSaveToGit = useCallback(async () => {
    setFilesGitConflictNotice(null);
    const ready = validateRemoteAction();
    if (!ready.ok) return ready;

    const conflictMessage = "Git conflicts need to be resolved before this project can be saved to Git.";
    if (hasActiveMergeStop(localRepoStatus)) {
      setFilesGitConflictNotice(conflictMessage);
      setSyncFeedback({ tone: "error", text: conflictMessage });
      return { ok: false as const, message: conflictMessage };
    }

    if (!beginRemoteOperation(`Saving ${ready.repository.displayName} to Git...`)) {
      return { ok: false as const, message: "A Git remote operation is already running." };
    }

    try {
      setSyncFeedback({ tone: "neutral", text: "Staging all local changes..." });
      const stageResult = await repoBackend.stagePaths(ready.repository, ["."]);
      if (!stageResult.ok) {
        return finishRemoteOperation(
          { ok: false, message: formatRepoError(stageResult.error) },
          "push"
        );
      }
      setLocalRepoStatus(stageResult.value);

      const hasStagedChanges = stageResult.value.entries.some((entry) => entry.staged !== null);
      if (hasStagedChanges) {
        const message =
          ready.project.commitMessageTemplate.trim() ||
          `Sync ${ready.repository.displayName} from Typr`;
        setSyncFeedback({ tone: "neutral", text: "Committing local changes..." });
        const commitResult = await repoBackend.commit(ready.repository, { message });
        if (!commitResult.ok) {
          return finishRemoteOperation(
            { ok: false, message: formatRepoError(commitResult.error) },
            "push"
          );
        }
        const statusResult = await repoBackend.status(ready.repository);
        if (statusResult.ok) {
          setLocalRepoStatus(statusResult.value);
        }
        setGitRefreshToken((token) => token + 1);
      } else {
        setSyncFeedback({ tone: "neutral", text: "No local changes to commit. Checking remote..." });
      }

      setSyncFeedback({
        tone: "neutral",
        text: `Pushing ${remoteConfig.branch} to ${remoteConfig.remoteName}...`
      });
      const pushResult = await remoteGitService.push(
        ready.repository,
        remoteConfig,
        () => selectedGitToken,
        { onProgress: handleRemoteGitProgress }
      );

      if (!pushResult.ok && isRemoteDivergenceMessage(pushResult.message)) {
        setSyncFeedback({ tone: "neutral", text: "Remote changes found. Checking conflicts..." });
        const pullResult = await remoteGitService.pull(
          ready.repository,
          remoteConfig,
          () => selectedGitToken,
          { onProgress: handleRemoteGitProgress }
        );
        if (!pullResult.status) {
          const statusResult = await repoBackend.status(ready.repository);
          if (statusResult.ok) {
            setLocalRepoStatus(statusResult.value);
          }
        }
        if (!pullResult.ok && isRemoteDivergenceMessage(pullResult.message)) {
          await finishRemoteOperation(pullResult, "pull");
          setFilesGitConflictNotice(conflictMessage);
          setSyncFeedback({ tone: "error", text: conflictMessage });
          return { ok: false as const, message: conflictMessage };
        }
        return finishRemoteOperation(pullResult, "pull");
      }

      return finishRemoteOperation(pushResult, "push");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quick Git sync failed.";
      return finishRemoteOperation({ ok: false, message }, "push");
    }
  }, [
    beginRemoteOperation,
    finishRemoteOperation,
    handleRemoteGitProgress,
    localRepoStatus,
    remoteConfig,
    remoteGitService,
    repoBackend,
    selectedGitToken,
    setSyncFeedback,
    validateRemoteAction
  ]);

  const handleSyncRemote = useCallback(async () => {
    const pullResult = await handlePullRemote();
    if (!pullResult.ok && !/Already up to date/i.test(pullResult.message)) {
      return pullResult;
    }
    const pushResult = await handlePushRemote();
    return pushResult.ok
      ? { ok: true as const, message: "Sync complete." }
      : pushResult;
  }, [handlePullRemote, handlePushRemote]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (!snapshot.preferences.autoSyncGitProjects) {
      lastAutoSyncKeyRef.current = null;
      return;
    }
    if (
      !selectedProjectRepository ||
      !selectedGitProject ||
      selectedGitProject.backendId !== "browser" ||
      !selectedGitProjectIsGitHubConnected ||
      !isOnline ||
      !selectedGitToken.trim() ||
      !localRepoStatus ||
      isGitStatusLoading ||
      isSyncing
    ) {
      return;
    }

    const autoSyncKey = [
      selectedProjectRepository.id,
      selectedGitProject.id
    ].join(":");
    if (lastAutoSyncKeyRef.current === autoSyncKey) {
      return;
    }
    lastAutoSyncKeyRef.current = autoSyncKey;

    const conflictMessage = "Git conflicts need to be resolved before this project can sync.";
    if (hasActiveMergeStop(localRepoStatus)) {
      setFilesGitConflictNotice(conflictMessage);
      setSyncFeedback({ tone: "error", text: conflictMessage });
      return;
    }

    if (hasRepoChanges(localRepoStatus)) {
      setSyncFeedback({
        tone: "neutral",
        text: "Auto-sync skipped because this project has local changes."
      });
      return;
    }

    void handleSyncRemote().then((result) => {
      if (!result.ok && isRemoteDivergenceMessage(result.message)) {
        setFilesGitConflictNotice(conflictMessage);
      }
    });
  }, [
    handleSyncRemote,
    isGitStatusLoading,
    isHydrated,
    isOnline,
    isSyncing,
    localRepoStatus,
    selectedGitProject,
    selectedGitProjectIsGitHubConnected,
    selectedGitToken,
    selectedProjectRepository,
    setSyncFeedback,
    snapshot.preferences.autoSyncGitProjects
  ]);

  const terminalRuntime = useMemo(
    () => ({
      getSnapshot: () => snapshot,
      updateSnapshot: (updater: (current: AppSnapshot) => AppSnapshot) => {
        setSnapshot((current) => updater(current));
      },
      getProjectRepository: () => selectedProjectRepository,
      updateProjectRepository: (updater: (project: TyprProjectRepository) => TyprProjectRepository) => {
        setProjectRepository(updater);
      },
      getCompileResult: () => compileResultRef.current,
      getCompilerStatus: () => compilerStatus,
      getIsOnline: () => isOnline,
      async compileActiveDocument() {
        await runCompile();
        return (
          compileResultRef.current ?? {
            ok: false,
            engine: "typst-ts",
            errors: [
              {
                message: "Compile result unavailable.",
                severity: "error"
              }
            ]
          }
        );
      },
      async exportActiveDocument() {
        try {
          const pdfBytes = await exportTypstPdf(activeDocumentTextContent, [
            ...diagramShadowAssets,
            ...graphShadowAssets
          ]);
          const baseName = activeDocument.name.replace(/\.typ$/i, "");
          const fileName = `${baseName || activeDocument.name}.pdf`;
          downloadBlob(
            fileName,
            new Blob([Uint8Array.from(pdfBytes).buffer], {
              type: "application/pdf"
            })
          );
          return { ok: true as const, fileName };
        } catch (error) {
          return {
            ok: false as const,
            message: error instanceof Error ? error.message : "Unable to export PDF."
          };
        }
      },
      async syncProject() {
        const result = await handleSyncRemote();
        return result.ok
          ? { ok: true as const, message: result.message }
          : { ok: false as const, message: result.message };
      },
      async runGitCommand(args: string[]) {
        const subcommand = args[0] ?? "status";

        if (!selectedGitProject) {
          return {
            stdout: "",
            stderr: "No managed git project is selected.\n",
            exitCode: 1
          };
        }

        if (!selectedProjectRepository) {
          return {
            stdout: "",
            stderr: "No Typr project repository is open.\n",
            exitCode: 1
          };
        }

        if (subcommand === "help") {
          return {
            stdout:
              [
                "Managed git commands",
                "git status",
                "git add <path|.>",
                "git reset <path>",
                "git commit -m <message>",
                "git branch",
                "git switch <branch>",
                "git log",
                "git remote -v",
                "git fetch",
                "git pull",
                "git push",
                "git sync",
                "git merge --abort",
                "git merge --continue -m <message>"
              ].join("\n") + "\n",
            stderr: "",
            exitCode: 0
          };
        }

        if (subcommand === "fetch") {
          const result = await handleFetchRemote();
          return result.ok
            ? { stdout: `${result.message}\n`, stderr: "", exitCode: 0 }
            : { stdout: "", stderr: `${result.message}\n`, exitCode: 1 };
        }

        if (subcommand === "push") {
          const result = await handlePushRemote();
          return result.ok
            ? { stdout: `${result.message}\n`, stderr: "", exitCode: 0 }
            : { stdout: "", stderr: `${result.message}\n`, exitCode: 1 };
        }

        if (subcommand === "pull") {
          const result = await handlePullRemote();
          return result.ok
            ? { stdout: `${result.message}\n`, stderr: "", exitCode: 0 }
            : { stdout: "", stderr: `${result.message}\n`, exitCode: 1 };
        }

        if (subcommand === "sync") {
          const result = await handleSyncRemote();
          return result.ok
            ? { stdout: `${result.message}\n`, stderr: "", exitCode: 0 }
            : { stdout: "", stderr: `${result.message}\n`, exitCode: 1 };
        }

        if (subcommand === "merge") {
          if (args[1] === "--abort") {
            const result = await repoBackend.abortMerge(selectedProjectRepository);
            if (!result.ok) {
              return { stdout: "", stderr: `${formatRepoError(result.error)}\n`, exitCode: 1 };
            }
            setLocalRepoStatus(result.value);
            setGitRefreshToken((token) => token + 1);
            return {
              stdout: "Cleared browser merge stop. Local files and commits were left unchanged.\n",
              stderr: "",
              exitCode: 0
            };
          }
          if (args[1] === "--continue") {
            const messageFlagIndex = args.findIndex((argument) => argument === "-m");
            const message =
              messageFlagIndex >= 0 ? args.slice(messageFlagIndex + 1).join(" ").trim() : "";
            if (!message) {
              return {
                stdout: "",
                stderr: "git merge --continue: use -m with a merge commit message.\n",
                exitCode: 1
              };
            }
            const mergeStateResult = await repoBackend.getMergeState(selectedProjectRepository);
            if (!mergeStateResult.ok) {
              return { stdout: "", stderr: `${formatRepoError(mergeStateResult.error)}\n`, exitCode: 1 };
            }
            if (!mergeStateResult.value) {
              return { stdout: "", stderr: "git merge --continue: no browser merge stop is active.\n", exitCode: 1 };
            }
            const resolutions: RepoMergeResolution[] = mergeStateResult.value.files
              .filter((file) => file.state === "conflict")
              .map((file) => {
                const bytes = readProjectFileBytes(selectedProjectRepository, file.path);
                return bytes === null
                  ? { path: file.path, content: null }
                  : { path: file.path, content: bytes };
              });
            const result = await repoBackend.continueMerge(selectedProjectRepository, {
              message,
              resolutions
            });
            if (!result.ok) {
              return { stdout: "", stderr: `${formatRepoError(result.error)}\n`, exitCode: 1 };
            }
            setProjectRepository((project) =>
              project.id === result.value.project.id ? result.value.project : project
            );
            setLocalRepoStatus(result.value.status);
            setGitRefreshToken((token) => token + 1);
            return {
              stdout: `Created merge commit ${result.value.commit.shortSha}: ${result.value.commit.message}\n`,
              stderr: "",
              exitCode: 0
            };
          }
          return {
            stdout: "",
            stderr: "git merge: only --abort and --continue -m <message> are supported in Browser Shell.\n",
            exitCode: 1
          };
        }

        if (subcommand === "switch") {
          const createIndex = args.findIndex((argument) => argument === "-c");
          const branch = (createIndex >= 0 ? args[createIndex + 1] : args[1])?.trim();
          if (!branch) {
            return {
              stdout: "",
              stderr: "git switch: provide a branch name.\n",
              exitCode: 1
            };
          }

          if (createIndex >= 0) {
            const createResult = await repoBackend.createBranch(selectedProjectRepository, branch);
            if (!createResult.ok) {
              return { stdout: "", stderr: `${formatRepoError(createResult.error)}\n`, exitCode: 1 };
            }
          }

          const result = await repoBackend.switchBranch(selectedProjectRepository, branch);
          if (!result.ok) {
            return { stdout: "", stderr: `${formatRepoError(result.error)}\n`, exitCode: 1 };
          }
          setProjectRepository((project) =>
            project.id === result.value.project.id ? result.value.project : project
          );
          updateSelectedGitProject((project) => ({ ...project, branch }));
          setGitRefreshToken((token) => token + 1);
          return {
            stdout: `Switched to branch '${branch}'.\n`,
            stderr: "",
            exitCode: 0
          };
        }

        if (subcommand === "remote") {
          if (args[1] && args[1] !== "-v") {
            return { stdout: "", stderr: "git remote: only -v is supported in Browser Shell.\n", exitCode: 1 };
          }
          const url = remoteGitService.getRemoteUrl(remoteConfig);
          return {
            stdout:
              `${selectedGitProject.remoteName} ${url} (fetch)\n` +
              `${selectedGitProject.remoteName} ${url} (push)\n`,
            stderr: "",
            exitCode: 0
          };
        }

        if (subcommand === "add") {
          const requestedPath = args[1]?.trim();
          if (!requestedPath) {
            return {
              stdout: "",
              stderr: "git add: provide a file path or '.'.\n",
              exitCode: 1
            };
          }

          const result = await repoBackend.stagePaths(selectedProjectRepository, [requestedPath]);
          if (!result.ok) {
            return {
              stdout: "",
              stderr: `${formatRepoError(result.error)}\n`,
              exitCode: 1
            };
          }

          setLocalRepoStatus(result.value);
          setGitRefreshToken((token) => token + 1);
          return {
            stdout: `Staged ${requestedPath}.\n`,
            stderr: "",
            exitCode: 0
          };
        }

        if (subcommand === "reset") {
          const requestedPath = args[1]?.trim();
          const result = await repoBackend.resetIndex(
            selectedProjectRepository,
            requestedPath ? [requestedPath] : []
          );
          if (!result.ok) {
            return { stdout: "", stderr: `${formatRepoError(result.error)}\n`, exitCode: 1 };
          }
          setLocalRepoStatus(result.value);
          setGitRefreshToken((token) => token + 1);
          return {
            stdout: requestedPath ? `Unstaged ${requestedPath}.\n` : "Reset index to HEAD.\n",
            stderr: "",
            exitCode: 0
          };
        }

        if (subcommand === "commit") {
          const messageFlagIndex = args.findIndex((argument) => argument === "-m");
          const message =
            messageFlagIndex >= 0 ? args.slice(messageFlagIndex + 1).join(" ").trim() : "";

          if (!message) {
            return {
              stdout: "",
              stderr: "git commit: use -m with a commit message.\n",
              exitCode: 1
            };
          }

          const commitResult = await repoBackend.commit(selectedProjectRepository, { message });
          if (!commitResult.ok) {
            return { stdout: "", stderr: `${formatRepoError(commitResult.error)}\n`, exitCode: 1 };
          }

          updateGitManagedProject(selectedGitProject.id, (project) => ({
            ...project,
            draftCommitMessage: "",
            commitMessageTemplate: message
          }));
          setGitRefreshToken((token) => token + 1);

          return {
            stdout:
              `[${localRepoStatus?.branch ?? "main"} ${commitResult.value.shortSha}] ${commitResult.value.message}\n`,
            stderr: "",
            exitCode: 0
          };
        }

        if (subcommand === "status" || subcommand === "branch" || subcommand === "log") {
          if (subcommand === "branch") {
            if (args[1] === "-r" || args[1] === "--remotes") {
              const refs = await repoBackend.listRefs(selectedProjectRepository, "refs/remotes/");
              if (!refs.ok) {
                return { stdout: "", stderr: `${formatRepoError(refs.error)}\n`, exitCode: 1 };
              }
              return {
                stdout: Object.keys(refs.value)
                  .map((ref) => `  ${ref.slice("refs/remotes/".length)}`)
                  .join("\n") + "\n",
                stderr: "",
                exitCode: 0
              };
            }
            if (args[1] && args[1] !== "--list") {
              const createResult = await repoBackend.createBranch(selectedProjectRepository, args[1]);
              if (!createResult.ok) {
                return { stdout: "", stderr: `${formatRepoError(createResult.error)}\n`, exitCode: 1 };
              }
              setGitRefreshToken((token) => token + 1);
              return { stdout: "", stderr: "", exitCode: 0 };
            }
            const branchesResult = await repoBackend.listBranches(selectedProjectRepository);
            if (!branchesResult.ok) {
              return { stdout: "", stderr: `${formatRepoError(branchesResult.error)}\n`, exitCode: 1 };
            }
            const branchNames = branchesResult.value.map((branch) => `${branch.current ? "*" : " "} ${branch.name}`);
            return {
              stdout: branchNames.join("\n") + "\n",
              stderr: "",
              exitCode: 0
            };
          }

          if (subcommand === "log") {
            const logResult = await repoBackend.log(selectedProjectRepository, 20);
            if (!logResult.ok) {
              return { stdout: "", stderr: `${formatRepoError(logResult.error)}\n`, exitCode: 1 };
            }
            if (logResult.value.length === 0) {
              return {
                stdout: "",
                stderr: "No local commits yet.\n",
                exitCode: 1
              };
            }
            return {
              stdout:
                logResult.value
                  .map(
                    (commit) =>
                      `${commit.shortSha} ${commit.authoredAt} ${commit.message}`
                  )
                  .join("\n") + "\n",
              stderr: "",
              exitCode: 0
            };
          }

          const statusResult = await repoBackend.status(selectedProjectRepository);
          if (!statusResult.ok) {
            return { stdout: "", stderr: `${formatRepoError(statusResult.error)}\n`, exitCode: 1 };
          }
          setLocalRepoStatus(statusResult.value);
          return {
            stdout:
              [
                `On branch ${statusResult.value.branch}`,
                statusResult.value.mergeState
                  ? `Browser merge stop active for ${statusResult.value.mergeState.remoteName}/${statusResult.value.mergeState.remoteBranch}: ${statusResult.value.mergeState.conflictCount} conflict(s), ${statusResult.value.mergeState.files.length} changed path(s).`
                  : "",
                upstreamTracking
                  ? `Your branch is ${upstreamTracking.ahead} ahead and ${upstreamTracking.behind} behind ${upstreamTracking.remoteName}/${upstreamTracking.branch}.`
                  : "",
                statusResult.value.headSha ? `HEAD ${statusResult.value.headSha.slice(0, 7)}` : "No commits yet",
                statusResult.value.entries.length === 0 ? "nothing to commit, working tree clean" : "",
                ...statusResult.value.entries.map(
                  (entry) => `${formatRepoStatusEntry(entry).padEnd(18)} ${entry.path}`
                )
              ].join("\n") + "\n",
            stderr: "",
            exitCode: 0
          };
        }

        return {
          stdout: "",
          stderr: `git ${subcommand}: unsupported in Browser Shell.\n`,
          exitCode: 1
        };
      }
    }),
    [
      activeDocument.name,
      activeDocumentTextContent,
      compilerStatus,
      diagramShadowAssets,
      graphShadowAssets,
      handleFetchRemote,
      handleSyncRemote,
      handlePullRemote,
      handlePushRemote,
      handleStageGitPaths,
      handleUnstageGitPath,
      gitWorkingTreeEntries,
      isOnline,
      localRepoStatus,
      repoBackend,
      remoteConfig,
      remoteGitService,
      runCompile,
      selectedGitProject,
      selectedProjectRepository,
      setProjectRepository,
      snapshot,
      upstreamTracking,
      updateGitManagedProject,
      updateSelectedGitProject
    ]
  );

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

  function expandGitMergePaneForward() {
    setWorkspaceMode("split");
    setIsSidebarCollapsed(false);
    setGitMergePaneMode((currentMode) => {
      if (currentMode === "sidebar") {
        return "source";
      }

      if (currentMode === "source") {
        return "preview";
      }

      return currentMode;
    });
  }

  function expandGitMergePaneBackward() {
    setGitMergePaneMode((currentMode) => {
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

  const canPullRemote =
    isOnline &&
    Boolean(selectedGitProject) &&
    selectedGitProject?.backendId === "browser" &&
    selectedGitProjectIsGitHubConnected &&
    Boolean(remoteConfig.owner.trim() && remoteConfig.repo.trim() && remoteConfig.branch.trim() && selectedGitToken.trim()) &&
    !hasRepoChanges(localRepoStatus) &&
    !hasActiveMergeStop(localRepoStatus) &&
    !isSyncing;
  const canPushRemote =
    isOnline &&
    Boolean(selectedGitProject) &&
    selectedGitProject?.backendId === "browser" &&
    selectedGitProjectIsGitHubConnected &&
    Boolean(localRepoStatus?.headSha) &&
    Boolean(remoteConfig.owner.trim() && remoteConfig.repo.trim() && remoteConfig.branch.trim() && selectedGitToken.trim()) &&
    !hasActiveMergeStop(localRepoStatus) &&
    !isSyncing;
  const canQuickSaveToGit =
    isOnline &&
    Boolean(selectedProjectRepository) &&
    Boolean(selectedGitProject) &&
    selectedGitProject?.backendId === "browser" &&
    selectedGitProjectIsGitHubConnected &&
    Boolean(remoteConfig.owner.trim() && remoteConfig.repo.trim() && remoteConfig.branch.trim() && selectedGitToken.trim()) &&
    !isSyncing;
  const handleMergeVersionBodyScroll = useCallback((role: MergeVersionRole) => {
    const sourceBody = mergeVersionBodyRefs.current[role];
    if (!sourceBody || isSyncingMergeScrollRef.current) {
      return;
    }

    const lines = Array.from(
      sourceBody.querySelectorAll<HTMLElement>("[data-merge-line]")
    );
    const scrollTop = sourceBody.scrollTop;
    const currentLine =
      lines.find((line) => line.offsetTop - sourceBody.offsetTop >= scrollTop) ??
      lines[lines.length - 1];
    const lineNumber = Number(currentLine?.dataset.mergeLine ?? 1);

    isSyncingMergeScrollRef.current = true;
    (Object.keys(mergeVersionBodyRefs.current) as MergeVersionRole[]).forEach((targetRole) => {
      if (targetRole === role) {
        return;
      }

      const targetBody = mergeVersionBodyRefs.current[targetRole];
      if (targetBody) {
        scrollMergeBodyToLine(targetBody, lineNumber);
      }
    });
    window.requestAnimationFrame(() => {
      isSyncingMergeScrollRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (!mergeFilePreview) {
      return;
    }

    const firstChangedLine = getFirstChangedMergeLineNumber(
      mergeFilePreview.base.text,
      mergeFilePreview.local.text,
      mergeFilePreview.remote.text
    );

    window.requestAnimationFrame(() => {
      isSyncingMergeScrollRef.current = true;
      (Object.keys(mergeVersionBodyRefs.current) as MergeVersionRole[]).forEach((role) => {
        const body = mergeVersionBodyRefs.current[role];
        if (body) {
          scrollMergeBodyToLine(body, firstChangedLine);
        }
      });
      window.requestAnimationFrame(() => {
        isSyncingMergeScrollRef.current = false;
      });
    });
  }, [gitMergePaneMode, mergeFilePreview, selectedMergePath]);

  const renderMergeVersionPanel = (
    version: MergeVersionPreview,
    options: {
      baseText: string;
      peerText: string;
      role: MergeVersionRole;
      action?: {
        disabled?: boolean;
        label: string;
        onClick: () => void;
      };
    }
  ): ReactNode => {
    const lines = getMergeDiffLines(version.text, options.baseText, options.peerText);
    return (
      <div className={`merge-version merge-version--${options.role}`} key={version.label}>
        <div className="sidebar-card__row">
          <span>{version.label}</span>
          <span className="pane__meta">
            {version.oid ? version.oid.slice(0, 7) : "deleted"}
          </span>
        </div>
        <div
          className="merge-version__body"
          onScroll={() => handleMergeVersionBodyScroll(options.role)}
          ref={(element) => {
            mergeVersionBodyRefs.current[options.role] = element;
          }}
          role="table"
          aria-label={`${version.label} version`}
        >
          {lines.map((line) => (
            <div
              className={`merge-version__line merge-version__line--${line.tone}`}
              data-merge-line={line.number}
              key={`${version.label}-${line.number}`}
              role="row"
            >
              <span className="merge-version__line-number" role="cell">{line.number}</span>
              <code role="cell">{line.text || " "}</code>
            </div>
          ))}
        </div>
        {options.action ? (
          <div className="merge-version__actions">
            <button
              className="pane__button pane__button--compact"
              disabled={options.action.disabled}
              onClick={options.action.onClick}
              type="button"
            >
              {options.action.label}
            </button>
          </div>
        ) : null}
      </div>
    );
  };
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
  const syncStatusMeta =
    `${isOnline ? "Network available" : "Network unavailable"} · ${storageLabel}` +
    (selectedGitProject?.lastPulledAt
      ? ` · last pull ${new Date(selectedGitProject.lastPulledAt).toLocaleString()}`
      : "") +
    (selectedGitProject?.lastPushedAt
      ? ` · last push ${new Date(selectedGitProject.lastPushedAt).toLocaleString()}`
      : "");
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
  const isGitMergeInlineExpanded =
    showDesktopSidebar &&
    workspaceMode === "split" &&
    activeSidebarTool === "sync" &&
    Boolean(activeMergeState) &&
    gitMergePaneMode !== "sidebar";
  const isDiagramPreviewExpanded = isDiagramInlineExpanded && diagramPaneMode === "preview";
  const isGraphPreviewExpanded = isGraphInlineExpanded && graphPaneMode === "preview";
  const isGitMergePreviewExpanded = isGitMergeInlineExpanded && gitMergePaneMode === "preview";
  const isSidebarInlineExpanded = isDiagramInlineExpanded || isGraphInlineExpanded || isGitMergeInlineExpanded;
  const showSourcePane = !isSidebarInlineExpanded && isSourceFileEditable;
  const showPreviewPane = !isDiagramPreviewExpanded && !isGraphPreviewExpanded && !isGitMergePreviewExpanded;
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
      : workspaceMode === "split" && (isDiagramPreviewExpanded || isGraphPreviewExpanded || isGitMergePreviewExpanded)
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

  useEffect(() => {
    if (
      !isMobileWorkspace &&
      workspaceMode === "split" &&
      activeSidebarTool === "sync" &&
      !isSidebarCollapsed &&
      activeMergeState
    ) {
      return;
    }

    setGitMergePaneMode("sidebar");
  }, [activeMergeState, activeSidebarTool, isMobileWorkspace, isSidebarCollapsed, workspaceMode]);

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

      if (tool !== "sync") {
        setGitMergePaneMode("sidebar");
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
                setSettingsTab("git");
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
            <button className="menu-action" onClick={() => handleOpenSidebarTool("mitex")} type="button">
              MiTeX
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
            <button className="menu-action" onClick={handleOpenGitRemoteHelp} type="button">
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
          <>
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
            <div className="activity-bar activity-bar--mobile" aria-label="Sidebar tools">
              {SIDEBAR_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  aria-label={tool.label}
                  aria-pressed={activeSidebarTool === tool.id}
                  className={`activity-bar__button ${
                    activeSidebarTool === tool.id
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
            </div>
          </>
        ) : null}

        {showDesktopSidebar || isMobileWorkspace ? (
          <aside
            className={`pane pane--sidebar ${sidebarVisibilityClass}`}
            aria-label="Files and git"
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
                        aria-label="Sync project to Git"
                        className="pane__button pane__button--compact pane__icon-button"
                        disabled={!canQuickSaveToGit}
                        onClick={() => {
                          void handleQuickSaveToGit();
                        }}
                        title="Stage all changes, commit with the default message, and push to GitHub."
                        type="button"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--sync" />
                      </button>
                      <button
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={handleNewDocument}
                        type="button"
                        aria-label="New file"
                        title="New file"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--new-file" />
                      </button>
                      <button
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={handleAddFolder}
                        type="button"
                        aria-label="New folder"
                        title="New folder"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--new-folder" />
                      </button>
                      <button
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={() => documentUploadInputRef.current?.click()}
                        type="button"
                        aria-label="Upload .typ"
                        title="Upload .typ"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--upload" />
                      </button>
                      <button
                        aria-label={isTrashViewOpen ? "Close trash" : "Open trash"}
                        aria-pressed={isTrashViewOpen}
                        className="pane__button pane__button--compact pane__icon-button"
                        onClick={handleToggleTrashView}
                        title={isTrashViewOpen ? "Close trash" : "Open trash"}
                        type="button"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--trash" />
                      </button>
                    </>
                  ) : activeSidebarTool === "sync" && activeMergeState ? (
                      <InlinePaneExpandControls
                        collapseLabel={
                          gitMergePaneMode === "preview"
                            ? "Show two-way conflict view"
                            : "Collapse conflict view"
                        }
                        expandLabel={
                          gitMergePaneMode === "source"
                            ? "Show three-way conflict view"
                            : "Expand conflict view"
                        }
                        onExpandLeft={
                          gitMergePaneMode !== "sidebar"
                            ? expandGitMergePaneBackward
                            : undefined
                        }
                        onExpandRight={
                          !isMobileWorkspace && gitMergePaneMode !== "preview"
                            ? expandGitMergePaneForward
                            : undefined
                        }
                      />
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
                  {!isTrashViewOpen ? (
                    <div className="project-switcher" aria-label="Typr projects">
                      <label className="project-switcher__field">
                        <span>Project</span>
                        <select
                          onChange={(event) => {
                            const nextProject = projectStorage.projects.find(
                              (project) => project.id === event.target.value
                            );
                            selectStoredProjectRepository(event.target.value);
                            if (nextProject) {
                              addDefaultGitManagedProject(nextProject);
                            }
                          }}
                          value={selectedProjectRepository?.id ?? ""}
                        >
                          {projectStorage.projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="project-switcher__actions">
                        <button
                          className="pane__button pane__button--compact"
                          onClick={handleCreateLocalProject}
                          type="button"
                        >
                          New local project
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!isTrashViewOpen && filesGitConflictNotice ? (
                    <div className="files-git-notice">
                      <div className="files-git-notice__body">
                        <strong>Git conflicts</strong>
                        <span>{filesGitConflictNotice}</span>
                      </div>
                      <button
                        className="pane__button pane__button--compact"
                        onClick={() => {
                          setActiveSidebarTool("sync");
                          setIsSidebarCollapsed(false);
                          if (isMobileWorkspace) {
                            setMobileWorkspaceTab("files");
                          } else if (workspaceMode === "editor" || workspaceMode === "preview") {
                            setWorkspaceMode("split");
                          }
                          setGitMergePaneMode("sidebar");
                        }}
                        type="button"
                      >
                        Open Git view
                      </button>
                    </div>
                  ) : null}
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

              {activeSidebarTool === "mitex" ? (
                <section className="sidebar-section sidebar-section--scrollable sidebar-section--mitex">
                  <MitexPanel
                    canInsert={isSourceFileEditable}
                    compiler={compiler}
                    compilerStatus={compilerStatus}
                    onInsert={handleInsertEditorText}
                  />
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
                      onInsertSourceIntoDocument={handleInsertGraphSourceIntoDocument}
                      onNew={handleNewGraph}
                      onRename={handleRenameGraph}
                      onSave={handleSaveGraph}
                      paperView={isPaperView}
                    />
                  </GraphEditorErrorBoundary>
                </section>
              ) : null}

              {activeSidebarTool === "sync" ? (
                <section
                  className={`sidebar-section sidebar-section--scrollable sidebar-section--sync ${
                    activeMergeState ? "sidebar-section--git-merge" : ""
                  } ${
                    isGitMergeInlineExpanded ? "sidebar-section--pane-expanded" : ""
                  }`}
                >
                  <div className="sync-stack">
                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>GitHub projects</span>
                        <span className="pane__meta">
                          {selectedGitProjectIsGitHubConnected && selectedGitProject
                            ? selectedGitProject.backendId
                            : `${githubConnectedProjectOptions.length} connected`}
                        </span>
                      </div>
                      <div className="sidebar-card__actions">
                        <select
                          className="pane__button pane__button--compact"
                          disabled={githubConnectedProjectOptions.length === 0}
                          onChange={(event) => selectGitHubConnectedProject(event.target.value)}
                          value={selectedGitHubProjectDropdownValue}
                        >
                          <option disabled value="">
                            {githubConnectedProjectOptions.length === 0
                              ? "No GitHub projects"
                              : "Choose GitHub project"}
                          </option>
                          {githubConnectedProjectOptions.map(({ project }) => (
                            <option key={project.id} value={project.id}>
                              {project.displayName}
                            </option>
                          ))}
                        </select>
                        <button
                          aria-label="Add repo"
                          className="pane__button pane__button--compact pane__icon-button"
                          onClick={handleAddGitProject}
                          title="Add repo"
                          type="button"
                        >
                          <span aria-hidden="true" className="toolbar-icon toolbar-icon--new-folder" />
                        </button>
                        <button
                          aria-label="Remove repo"
                          className="pane__button pane__button--compact pane__icon-button"
                          disabled={!selectedGitProject}
                          onClick={handleRemoveSelectedGitProject}
                          title="Remove repo"
                          type="button"
                        >
                          <span aria-hidden="true" className="toolbar-icon toolbar-icon--trash" />
                        </button>
                      </div>
                      {selectedGitProject ? (
                        <div className="pane__meta">
                          {selectedGitProject.owner && selectedGitProject.repo
                            ? `${selectedGitProject.owner}/${selectedGitProject.repo}`
                            : "Configure owner and repo in Settings"}
                        </div>
                      ) : null}
                      <div className="sidebar-card__actions">
                        <button
                          className="pane__button pane__button--compact"
                          onClick={() => {
                            setSettingsTab("git");
                            setIsSettingsOpen(true);
                          }}
                          type="button"
                        >
                          Settings
                        </button>
                        <button
                          className="pane__button pane__button--compact"
                          disabled={!canPullRemote}
                          onClick={() => {
                            void handlePullRemote();
                          }}
                          type="button"
                        >
                          {isSyncing ? "Pulling..." : "Pull"}
                        </button>
                        <button
                          className="pane__button pane__button--compact"
                          disabled={!canPushRemote}
                          onClick={() => {
                            void handlePushRemote();
                          }}
                          type="button"
                        >
                          {isSyncing ? "Pushing..." : "Push"}
                        </button>
                      </div>
                      <SyncStatusBar
                        active={isSyncing}
                        meta={syncStatusMeta}
                      />
                    </div>

                    {activeMergeState ? (
                      <div className="sidebar-card">
                        <div className="sidebar-card__row">
                          <span>Merge stopped</span>
                          <span className="pane__meta">
                            {activeMergeState.conflictCount} conflict
                            {activeMergeState.conflictCount === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p className="sidebar-card__copy">
                          Pull fetched {activeMergeState.remoteName}/
                          {activeMergeState.remoteBranch}, but local and remote history diverged.
                          Choose a resolution for each conflict, then create a merge commit.
                        </p>
                        <div className="pane__meta">
                          Local {activeMergeState.localSha.slice(0, 7)} · Remote{" "}
                          {activeMergeState.remoteSha.slice(0, 7)} · Base{" "}
                          {activeMergeState.baseSha?.slice(0, 7) ?? "none"}
                        </div>
                        <div className="sidebar-card__actions">
                          {gitMergePaneMode !== "sidebar" ? (
                            <button
                              className="pane__button pane__button--compact"
                              onClick={expandGitMergePaneBackward}
                              type="button"
                            >
                              {gitMergePaneMode === "preview" ? "Two-way view" : "Collapse view"}
                            </button>
                          ) : null}
                          {!isMobileWorkspace && gitMergePaneMode !== "preview" ? (
                            <button
                              className="pane__button pane__button--compact"
                              onClick={expandGitMergePaneForward}
                              type="button"
                            >
                              {gitMergePaneMode === "source" ? "Three-way view" : "Expand view"}
                            </button>
                          ) : null}
                          {isMobileWorkspace ? (
                            <span className="pane__meta">Wide views need a larger screen</span>
                          ) : null}
                        </div>
                        <div className="merge-file-list" role="list">
                          {activeMergeState.files.map((file) => (
                            <button
                              key={file.path}
                              aria-pressed={selectedMergePath === file.path}
                              className="merge-file-row"
                              onClick={() => setSelectedMergePath(file.path)}
                              type="button"
                            >
                              <span>{file.path}</span>
                              <span className="pane__meta">
                                {file.state === "conflict" && mergeResolutionDrafts[file.path]
                                  ? "resolved"
                                  : file.state}
                              </span>
                            </button>
                          ))}
                        </div>

                        {selectedMergePath ? (
                          <div className="merge-resolver">
                            <div className="sidebar-card__row">
                              <span>{selectedMergePath}</span>
                              <span className="pane__meta">
                                {mergeResolutionDrafts[selectedMergePath]
                                  ? mergeResolutionDrafts[selectedMergePath].kind === "content"
                                    ? "edited"
                                    : mergeResolutionDrafts[selectedMergePath].label
                                  : "needs resolution"}
                              </span>
                            </div>
                            {isMergeFilePreviewLoading ? (
                              <p className="sidebar-card__copy">Loading preserved versions...</p>
                            ) : mergeFilePreview ? (
                              <>
                                <div
                                  className={`merge-version-grid merge-version-grid--${gitMergePaneMode}`}
                                >
                                  {gitMergePaneMode === "preview" ? (
                                    <>
                                      {renderMergeVersionPanel(mergeFilePreview.base, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.local.text,
                                        role: "base",
                                        action: {
                                          disabled: !mergeFilePreview.base.oid,
                                          label: "Use base",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Base", mergeFilePreview.base.oid)
                                        }
                                      })}
                                      {renderMergeVersionPanel(mergeFilePreview.local, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.remote.text,
                                        role: "local",
                                        action: {
                                          disabled: !mergeFilePreview.local.oid,
                                          label: "Use local",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Local", mergeFilePreview.local.oid)
                                        }
                                      })}
                                      {renderMergeVersionPanel(mergeFilePreview.remote, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.local.text,
                                        role: "remote",
                                        action: {
                                          disabled: !mergeFilePreview.remote.oid,
                                          label: "Use remote",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Remote", mergeFilePreview.remote.oid)
                                        }
                                      })}
                                    </>
                                  ) : gitMergePaneMode === "source" ? (
                                    <>
                                      {renderMergeVersionPanel(mergeFilePreview.base, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.local.text,
                                        role: "base",
                                        action: {
                                          disabled: !mergeFilePreview.base.oid,
                                          label: "Use base",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Base", mergeFilePreview.base.oid)
                                        }
                                      })}
                                      {renderMergeVersionPanel(mergeFilePreview.local, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.remote.text,
                                        role: "local",
                                        action: {
                                          disabled: !mergeFilePreview.local.oid,
                                          label: "Use local",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Local", mergeFilePreview.local.oid)
                                        }
                                      })}
                                      {renderMergeVersionPanel(mergeFilePreview.remote, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.local.text,
                                        role: "remote",
                                        action: {
                                          disabled: !mergeFilePreview.remote.oid,
                                          label: "Use remote",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Remote", mergeFilePreview.remote.oid)
                                        }
                                      })}
                                    </>
                                  ) : (
                                    <>
                                      {renderMergeVersionPanel(mergeFilePreview.base, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.local.text,
                                        role: "base",
                                        action: {
                                          disabled: !mergeFilePreview.base.oid,
                                          label: "Use base",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Base", mergeFilePreview.base.oid)
                                        }
                                      })}
                                      {renderMergeVersionPanel(mergeFilePreview.local, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.remote.text,
                                        role: "local",
                                        action: {
                                          disabled: !mergeFilePreview.local.oid,
                                          label: "Use local",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Local", mergeFilePreview.local.oid)
                                        }
                                      })}
                                      {renderMergeVersionPanel(mergeFilePreview.remote, {
                                        baseText: mergeFilePreview.base.text,
                                        peerText: mergeFilePreview.local.text,
                                        role: "remote",
                                        action: {
                                          disabled: !mergeFilePreview.remote.oid,
                                          label: "Use remote",
                                          onClick: () =>
                                            handleUseMergeVersion(selectedMergePath, "Remote", mergeFilePreview.remote.oid)
                                        }
                                      })}
                                    </>
                                  )}
                                </div>
                                <div className="sidebar-card__actions">
                                  <button
                                    className="pane__button pane__button--compact pane__button--danger"
                                    onClick={() => handleUseMergeVersion(selectedMergePath, "Delete", null)}
                                    type="button"
                                  >
                                    Delete
                                  </button>
                                </div>
                                <textarea
                                  className="merge-resolution-editor"
                                  onChange={(event) =>
                                    handleEditMergeResolution(selectedMergePath, event.target.value)
                                  }
                                  placeholder="Edit a resolved version here, or choose local/remote/base."
                                  rows={8}
                                  value={
                                    mergeResolutionEditorValue
                                  }
                                />
                              </>
                            ) : null}
                          </div>
                        ) : null}

                        <label className="sync-field">
                          <span>Merge commit message</span>
                          <input
                            onChange={(event) => setMergeCommitMessage(event.target.value)}
                            type="text"
                            value={mergeCommitMessage}
                          />
                        </label>
                        <div className="sidebar-card__actions">
                          <button
                            className="pane__button pane__button--compact"
                            onClick={() => {
                              void handleAbortGitMerge();
                            }}
                            type="button"
                          >
                            Abort merge
                          </button>
                          <button
                            className="pane__button pane__button--compact"
                            disabled={unresolvedMergeConflictCount > 0}
                            onClick={() => {
                              void handleContinueGitMerge();
                            }}
                            type="button"
                          >
                            {unresolvedMergeConflictCount > 0
                              ? `Resolve ${unresolvedMergeConflictCount}`
                              : "Continue merge"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Working tree</span>
                        <span className="pane__meta">
                          {gitWorkingTreeEntries.length > 0
                            ? `${gitWorkingTreeEntries.length} changed`
                            : "Empty"}
                        </span>
                      </div>
                      <div className="sidebar-card__actions">
                        <button
                          className="pane__button pane__button--compact"
                          onClick={handleStageAllGitChanges}
                          type="button"
                        >
                          Stage all
                        </button>
                        <button
                          className="pane__button pane__button--compact"
                          disabled={
                            !selectedGitProject ||
                            !localRepoStatus?.entries.some((entry) => entry.staged !== null) ||
                            !selectedGitProject.draftCommitMessage.trim()
                          }
                          onClick={() => {
                            void handleCommitGitChanges();
                          }}
                          type="button"
                        >
                          Commit
                        </button>
                      </div>
                      <label className="sync-field">
                        <span>Commit message</span>
                        <input
                          autoCapitalize="sentences"
                          autoCorrect="off"
                          onChange={(event) =>
                            handleGitProjectFieldChange("draftCommitMessage", event.target.value)
                          }
                          placeholder="Add a commit message"
                          type="text"
                          value={selectedGitProject?.draftCommitMessage ?? ""}
                        />
                      </label>
                      {gitWorkingTreeEntries.length > 0 ? (
                        <div className="outline-list" role="list">
                          {gitWorkingTreeEntries.slice(0, 16).map((entry) => (
                            <div key={entry.path} className="sidebar-card__row">
                              <span>{entry.path}</span>
                              <span className="pane__meta">{formatRepoStatusEntry(entry)}</span>
                              <button
                                className="pane__button pane__button--compact"
                                onClick={() => {
                                  void (entry.staged
                                    ? handleUnstageGitPath(entry.path)
                                    : handleStageGitPaths([entry.path]));
                                }}
                                type="button"
                              >
                                {entry.staged ? "Unstage" : "Stage"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="snippet-empty">
                          No files are in scope for this managed repo yet.
                        </div>
                      )}
                    </div>

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Local commits</span>
                        <span className="pane__meta">
                          {localGitCommits.length > 0 ? `${localGitCommits.length} stored` : "Empty"}
                        </span>
                      </div>
                      {localGitCommits.length > 0 ? (
                        <div className="outline-list" role="list">
                          {localGitCommits.slice(0, 8).map((commit) => (
                            <div key={commit.sha} className="sidebar-card__row">
                              <span>{commit.message}</span>
                              <span className="pane__meta">
                                {commit.shortSha} · {new Date(commit.authoredAt).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="snippet-empty">
                          Stage files and commit them to build local history.
                        </div>
                      )}
                    </div>

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Branches</span>
                        <span className="pane__meta">
                          {isGitStatusLoading
                            ? "Loading"
                            : gitBranches.length > 0
                              ? `${gitBranches.length} tracked`
                              : "None"}
                        </span>
                      </div>
                      {gitBranches.length > 0 ? (
                        <div className="outline-list" role="list">
                          {gitBranches.map((branch) => (
                            <div key={branch.name} className="sidebar-card__row">
                              <span>{branch.current ? `* ${branch.name}` : branch.name}</span>
                              <span className="pane__meta">{branch.sha?.slice(0, 7) ?? "unborn"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="snippet-empty">
                          Branch data appears here after the repo is configured.
                        </div>
                      )}
                    </div>

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Commit history</span>
                        <span className="pane__meta">
                          {gitCommitHistory.length > 0 ? `${gitCommitHistory.length} shown` : "Empty"}
                        </span>
                      </div>
                      {gitCommitHistory.length > 0 ? (
                        <div className="outline-list" role="list">
                          {gitCommitHistory.slice(0, 8).map((commit) => (
                            <div key={commit.sha} className="sidebar-card__row">
                              <span>{commit.message}</span>
                              <span className="pane__meta">{commit.sha.slice(0, 7)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="snippet-empty">
                          No local commit history loaded yet.
                        </div>
                      )}
                    </div>

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>File status</span>
                        <span className="pane__meta">
                          {gitFileStatuses.length > 0 ? `${gitFileStatuses.length} files` : "Empty"}
                        </span>
                      </div>
                      {gitFileStatuses.length > 0 ? (
                        <div className="outline-list" role="list">
                          {gitFileStatuses.slice(0, 12).map((file) => (
                            <div key={file.path} className="sidebar-card__row">
                              <span>{file.path}</span>
                              <span className="pane__meta">{file.state}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="snippet-empty">
                          File status appears here after the repo is configured.
                        </div>
                      )}
                    </div>

                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>Storage</span>
                        <span className="pane__meta">
                          {isRepoStorageLoading
                            ? "Measuring"
                            : repoStorageStats
                              ? formatByteSize(repoStorageStats.objectBytes)
                              : "Unknown"}
                        </span>
                      </div>
                      {repoStorageStats ? (
                        <p className="sidebar-card__copy">
                          {repoStorageStats.objectCount} loose objects:{" "}
                          {repoStorageStats.objectCounts.commit} commits,{" "}
                          {repoStorageStats.objectCounts.tree} trees,{" "}
                          {repoStorageStats.objectCounts.blob} blobs.
                        </p>
                      ) : null}
                      {repoStorageFeedback.text ? (
                        <p className="sidebar-card__copy">{repoStorageFeedback.text}</p>
                      ) : null}
                      <div className="sidebar-card__actions">
                        <button
                          className="pane__button pane__button--compact"
                          disabled={isRepoStorageLoading || !selectedProjectRepository}
                          onClick={() => {
                            void refreshRepoStorageStats();
                          }}
                          type="button"
                        >
                          Refresh
                        </button>
                        <button
                          className="pane__button pane__button--compact"
                          disabled={isRepoStorageLoading || !selectedProjectRepository}
                          onClick={() => {
                            void handlePruneRepoObjects();
                          }}
                          type="button"
                        >
                          Clean up
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
                  title={isSourceToolbarVisible ? "Hide source toolbar" : "Show source toolbar"}
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
                    title="Bold"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--bold" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleItalic}
                    type="button"
                    aria-label="Italic"
                    title="Italic"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--italic" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleUnderline}
                    type="button"
                    aria-label="Underline"
                    title="Underline"
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
                    title="Bulleted list"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--bullet-list" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleNumberedList}
                    type="button"
                    aria-label="Numbered list"
                    title="Numbered list"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--numbered-list" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleMathMode}
                    type="button"
                    aria-label="Math mode"
                    title="Math mode"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--math" />
                  </button>
                  <button
                    className="pane__button pane__button--compact pane__icon-button"
                    onClick={handleCycleHeading}
                    type="button"
                    aria-label="Cycle heading level"
                    title="Cycle heading level"
                  >
                    <span aria-hidden="true" className="toolbar-icon toolbar-icon--heading" />
                  </button>
                  <div className={`matrix-menu ${openToolbarMenu === "matrix" ? "matrix-menu--open" : ""}`}>
                    <button
                      aria-expanded={openToolbarMenu === "matrix"}
                      aria-label="Matrix options"
                      className="pane__button pane__button--compact pane__icon-button"
                      onClick={() => toggleToolbarMenu("matrix")}
                      title="Matrix options"
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
                      title="Table options"
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
                    title="Symbols"
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
                        title={item.label}
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
                  title="Snippets"
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
              <TerminalDrawer
                isOpen={isTerminalOpen}
                onClose={() => setIsTerminalOpen(false)}
                runtime={terminalRuntime}
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
                  aria-selected={settingsTab === "git"}
                  className={`settings-tab ${settingsTab === "git" ? "settings-tab--active" : ""}`}
                  onClick={() => setSettingsTab("git")}
                  role="tab"
                  type="button"
                >
                  Git
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

              {settingsTab === "git" ? (
                <div className="settings-panel" role="tabpanel">
                  <div className="settings-section">
                    <div className="settings-section__header">
                      <h3>Project connection</h3>
                      <span className="pane__meta">{projectStorage.projects.length}</span>
                    </div>
                    <div className="sidebar-card">
                      <div className="git-project-connection-row">
                        <label className="sync-field git-project-connection-row__select">
                          <span>Project</span>
                          <select
                            onChange={(event) => handleSelectGitSettingsProject(event.target.value)}
                            value={selectedProjectRepository?.id ?? ""}
                          >
                            {projectStorage.projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="git-project-connection-row__actions">
                          <span className="git-project-status">
                            <span
                              aria-hidden="true"
                              className={`git-project-status__dot ${
                                selectedGitProjectIsGitHubConnected
                                  ? "git-project-status__dot--connected"
                                  : "git-project-status__dot--disconnected"
                              }`}
                            />
                            {selectedProjectGitConnectionLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="sidebar-card">
                    <div className="sidebar-card__row">
                      <span>Fine-grained token</span>
                      <a
                        className="pane__meta"
                        href="https://github.com/settings/personal-access-tokens/new"
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open GitHub
                      </a>
                    </div>
                    <div className="sync-token-row">
                      <label className="sync-field sync-token-row__field">
                        <span>Token</span>
                        <input
                          autoCapitalize="none"
                          autoCorrect="off"
                          onChange={(event) => handleGitCredentialChange(event.target.value)}
                          placeholder="Paste token"
                          type="password"
                          value={selectedGitToken}
                        />
                      </label>
                      <button
                        className={`pane__button pane__button--compact ${
                          selectedGitProjectIsGitHubConnected ? "pane__button--danger" : ""
                        }`}
                        disabled={
                          !selectedGitProject ||
                          gitHubDiscovery.status === "loading" ||
                          (!selectedGitProjectIsGitHubConnected && !selectedGitToken.trim())
                        }
                        onClick={() => {
                          void handleGitHubTokenConnectionAction();
                        }}
                        title={
                          selectedGitProjectIsGitHubConnected
                            ? "Disconnect this project from GitHub"
                            : "Connect this project to GitHub"
                        }
                        type="button"
                      >
                        {selectedGitProjectIsGitHubConnected
                          ? "Disconnect"
                          : gitHubDiscovery.status === "loading"
                            ? "Connecting..."
                            : "Connect"}
                      </button>
                    </div>
                    <ul className="sidebar-card__copy sidebar-card__list">
                      <li>
                        Existing repo: select only that repo and grant <strong>Contents</strong>{" "}
                        read/write.
                      </li>
                      <li>
                        Creating repos from Typr: choose All repositories and also grant{" "}
                        <strong>Administration</strong> read/write. Use an expiring token, and
                        turn this broader access off when you are not creating repos.
                      </li>
                    </ul>
                  </div>

                  <div className="sync-grid">
                    <label className="sync-field">
                      <span>Name</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) => handleGitProjectFieldChange("name", event.target.value)}
                        placeholder="Algebra notes repo"
                        type="text"
                        value={selectedGitProject?.name ?? ""}
                      />
                    </label>
                    <label className="sync-field">
                      <span>Owner</span>
                      <input
                        list="github-owner-options"
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) =>
                          handleGitHubOwnerChange(event.target.value)
                        }
                        placeholder={
                          gitHubDiscovery.status === "connected"
                            ? "Choose or enter an owner"
                            : "Connect token, then choose owner"
                        }
                        type="text"
                        value={remoteConfig.owner}
                      />
                      <datalist id="github-owner-options">
                        {gitHubDiscovery.owners.map((owner) => (
                          <option key={owner.login} value={owner.login}>
                            {owner.type}
                          </option>
                        ))}
                      </datalist>
                    </label>
                    <label className="sync-field">
                      <span>Repo</span>
                      {gitHubDiscovery.repoMode === "select" ? (
                        <select
                          disabled={!remoteConfig.owner.trim() || gitHubDiscovery.isLoadingRepos}
                          onChange={(event) => {
                            if (event.target.value === "__create__") {
                              handleGitHubRepoModeChange("create");
                              return;
                            }
                            if (event.target.value === "__manual__") {
                              handleGitHubRepoModeChange("manual");
                              return;
                            }
                            handleGitHubRepoSelection(event.target.value);
                          }}
                          value={
                            gitHubDiscovery.repos.some((repo) => repo.name === remoteConfig.repo)
                              ? remoteConfig.repo
                              : ""
                          }
                        >
                          <option value="">
                            {gitHubDiscovery.isLoadingRepos
                              ? "Loading repositories..."
                              : "Choose repository"}
                          </option>
                          {gitHubDiscovery.repos.map((repo) => (
                            <option key={repo.fullName} value={repo.name}>
                              {repo.name}{repo.private ? " (private)" : ""}
                            </option>
                          ))}
                          <option value="__create__">Create new repository...</option>
                          <option value="__manual__">Enter manually...</option>
                        </select>
                      ) : (
                        <input
                          autoCapitalize="none"
                          autoCorrect="off"
                          onChange={(event) =>
                            handleGitRemoteConfigChange("repo", event.target.value)
                          }
                          onPaste={(event) => {
                            if (handleGitHubUrlPaste(event.clipboardData.getData("text"))) {
                              event.preventDefault();
                            }
                          }}
                          placeholder={
                            gitHubDiscovery.repoMode === "create"
                              ? "New repository name"
                              : "Repository name or GitHub URL"
                          }
                          type="text"
                          value={remoteConfig.repo}
                        />
                      )}
                      {gitHubDiscovery.repoMode !== "select" ? (
                        <button
                          className="pane__button pane__button--compact"
                          onClick={() => handleGitHubRepoModeChange("select")}
                          type="button"
                        >
                          Choose existing
                        </button>
                      ) : null}
                    </label>
                    <label className="sync-field">
                      <span>Branch</span>
                      {gitHubDiscovery.branches.length > 0 ? (
                        <select
                          onChange={(event) =>
                            handleGitRemoteConfigChange("branch", event.target.value)
                          }
                          value={
                            gitHubDiscovery.branches.some((branch) => branch.name === remoteConfig.branch)
                              ? remoteConfig.branch
                              : ""
                          }
                        >
                          <option value="">
                            {gitHubDiscovery.isLoadingBranches ? "Loading branches..." : "Choose branch"}
                          </option>
                          {gitHubDiscovery.branches.map((branch) => (
                            <option key={branch.name} value={branch.name}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          autoCapitalize="none"
                          autoCorrect="off"
                          onChange={(event) =>
                            handleGitRemoteConfigChange("branch", event.target.value)
                          }
                          placeholder={gitHubDiscovery.isLoadingBranches ? "Loading branches..." : "main"}
                          type="text"
                          value={remoteConfig.branch}
                        />
                      )}
                    </label>
                    <label className="sync-field">
                      <span>Remote</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(event) =>
                          handleGitRemoteConfigChange("remoteName", event.target.value)
                        }
                        placeholder="origin"
                        type="text"
                        value={remoteConfig.remoteName}
                      />
                    </label>
                    <label className="sync-field">
                      <span>Backend</span>
                      <select
                        onChange={(event) =>
                          handleGitProjectBackendChange(
                            event.target.value as GitManagedProject["backendId"]
                          )
                        }
                        value={selectedGitProject?.backendId ?? "browser"}
                      >
                        <option value="browser">Browser</option>
                        <option value="local-agent">Local Agent</option>
                        <option value="cloud-container">Cloud Container</option>
                      </select>
                    </label>
                  </div>

                  <label className="settings-toggle">
                    <span>
                      <strong>Create new repos as private</strong>
                      <small>
                        Applies only when Typr creates a GitHub repository from the current project.
                      </small>
                    </span>
                    <input
                      checked={createGitHubRepoPrivate}
                      onChange={(event) => setCreateGitHubRepoPrivate(event.target.checked)}
                      type="checkbox"
                    />
                  </label>

                  <label className="settings-toggle">
                    <span>
                      <strong>Auto-sync GitHub projects</strong>
                      <small>
                        Pulls and pushes a connected project when Typr opens it or switches to it.
                        Local uncommitted changes are left alone.
                      </small>
                    </span>
                    <input
                      checked={snapshot.preferences.autoSyncGitProjects}
                      onChange={handleAutoSyncGitProjectsToggle}
                      type="checkbox"
                    />
                  </label>

                  <div className="sidebar-card">
                    <div className="sidebar-card__row">
                      <span>Connect to GitHub</span>
                      <span className="pane__meta">Project-safe</span>
                    </div>
                    <p className="sidebar-card__copy">
                      Create a GitHub-backed copy of this project, or import an existing GitHub repo as a separate Typr project.
                    </p>
                    <div className="sidebar-card__actions">
                      <button
                        className="pane__button pane__button--compact"
                        disabled={isSyncing || !selectedGitProject || !selectedGitToken.trim()}
                        onClick={() => {
                          void handleCreateGitHubRepoFromCurrentProject();
                        }}
                        type="button"
                      >
                        Create repo from current project
                      </button>
                      <button
                        className="pane__button pane__button--compact"
                        disabled={isSyncing || !selectedGitProject || !selectedGitToken.trim()}
                        onClick={() => {
                          void handleImportExistingGitHubRepoAsProject();
                        }}
                        type="button"
                      >
                        Import existing repo
                      </button>
                    </div>
                  </div>

                  <label className="sync-field">
                    <span>Ignore patterns</span>
                    <textarea
                      onChange={(event) => handleGitIgnorePatternsChange(event.target.value)}
                      placeholder={"figures/\n*.pdf\nnotes/private/**"}
                      rows={4}
                      value={stringifyIgnorePatterns(selectedGitProject?.ignorePatterns ?? [])}
                    />
                  </label>

                  <label className="sync-field">
                    <span>Default push message</span>
                    <input
                      autoCapitalize="off"
                      autoCorrect="off"
                      onChange={(event) =>
                        handleGitProjectFieldChange("commitMessageTemplate", event.target.value)
                      }
                      placeholder="Sync project from Typr"
                      type="text"
                      value={selectedGitProject?.commitMessageTemplate ?? ""}
                    />
                  </label>

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
              <SyncStatusBar
                active={isSyncing}
                className="sync-status-bar--footer"
                meta={syncStatusMeta}
              />
              <div className="settings-sheet__footer-actions">
                <button
                  className="control-button"
                  disabled={!canPullRemote}
                  onClick={() => {
                    void handlePullRemote();
                  }}
                  type="button"
                >
                  {isSyncing ? "Pulling..." : "Pull"}
                </button>
                <button
                  className="control-button"
                  disabled={!canPushRemote}
                  onClick={() => {
                    void handlePushRemote();
                  }}
                  type="button"
                >
                  {isSyncing ? "Pushing..." : "Push"}
                </button>
              </div>
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

function SyncStatusBar({
  active,
  className = "",
  meta
}: {
  active: boolean;
  className?: string;
  meta: string;
}) {
  const { progress, text, tone } = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatusSnapshot,
    getSyncStatusSnapshot
  );
  const toneClass =
    tone === "success"
      ? "sync-status-bar--success"
      : tone === "error"
        ? "sync-status-bar--error"
        : "";
  const progressPercent = progress && progress.total > 0
    ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100))
    : null;

  return (
    <div
      aria-live="polite"
      className={`sync-status-bar ${toneClass} ${active ? "sync-status-bar--active" : ""} ${className}`}
      role="status"
    >
      <div className="sync-status-bar__body">
        <span className="sync-status-bar__text">{text}</span>
        <span className="sync-status-bar__meta">{meta}</span>
      </div>
      {active && progressPercent !== null ? (
        <span
          aria-label="Git operation progress"
          aria-valuemax={progress?.total}
          aria-valuemin={0}
          aria-valuenow={progress?.current}
          className="sync-status-bar__activity"
          role="progressbar"
          style={
            {
              "--sync-status-progress": `${progressPercent}%`
            } as CSSProperties
          }
        />
      ) : null}
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
    case "mitex":
      return "MiTeX";
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
    case "mitex":
      return "LaTeX to Typst";
    case "diagram":
      return "Freehand SVG sketch";
    case "graph":
      return "Desmos graph editor";
    case "sync":
      return "Managed git repos";
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
              title={isCollapsed ? `Expand ${entry.title}` : `Collapse ${entry.title}`}
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
