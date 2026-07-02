import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import { zipSync } from "fflate";
import { DocsModal, DocsPanel } from "./DocsModal";
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
  updateEditorToolingPreference,
  updateKeybindingsPreference,
  updateLatexMathPreviewPreference,
  updateLiveCompilationPreference,
  updateMobileKeyboardPreference,
  updateRelativeLineNumbersPreference,
  updateSidebarFontSizePreference,
  updateThemePreference,
  updateVimPreference,
  type AppSnapshot,
  type MobileKeyboardLanguage,
  type ThemePreference
} from "./appState";
import {
  formatSourceWithEditorTooling,
  getEditorToolLanguage,
  lintSourceWithEditorTooling,
  type EditorFormatterId,
  type EditorLinterId,
  type EditorToolLanguage
} from "../editor/editorTools";
import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_DEFINITIONS,
  formatKeybinding,
  keybindingFromKeyboardEvent,
  matchesKeybinding,
  type KeybindingMap,
  type KeybindingCommandId
} from "./keybindings";
import {
  createCompletedPreviewCompilerStatus,
  shouldRunPendingCompileAfterCompletion
} from "./compilePreviewState";
import { InlinePaneExpandControls } from "./InlinePaneExpandControls";
import {
  createTypstCompiler,
  type CompilerStatus,
  type CompileResult
} from "../compiler/typstCompiler";
import {
  cancelLatexCompile,
  compileLatexDocument,
  type LatexCompileMode
} from "../compiler/latexCompiler";
import {
  cacheLatexPackageBundle,
  clearLatexPackageBundleCache,
  extractLatexPackageNames,
  extractLatexPackageNamesFromProject,
  formatLatexPackageBundleLabel,
  getLatexPackageBundleCacheSummary,
  getLatexPackageCatalog,
  removeLatexPackageBundleFromCache,
  resolveLatexPackages,
  searchLatexPackageCatalog,
  type LatexPackageBundleCacheEntry,
  type LatexPackageBundleId,
  type LatexPackageCatalog,
  type LatexPackageResolution
} from "../compiler/latexPackages";
import {
  getSourceLanguage,
  isCompilableSourceFile,
  isLatexMainSourceFile,
  isTypstSourceFile,
  normalizeCompilerPath,
  type SourceLanguage
} from "../compiler/sourceFileTypes";
import type { CompileAssetFile, CompileDiagnostic, CompileMetadata } from "../compiler/types";
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
import {
  AUTO_THEME_ID,
  compareThemesByDisplayOrder,
  THEME_IMPORT_TEMPLATE
} from "../theme/themes";
import {
  DEFAULT_ZOOM,
  nextZoomStep,
  type PreviewZoomState
} from "../preview/PreviewPane";
import {
  createSourceRange,
  type PreviewSourceLink,
  type SourcePosition
} from "../preview/sourceLinks";
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
  DEFAULT_PROJECT_GITIGNORE_CONTENT,
  DEFAULT_PROJECT_GITIGNORE_PATH,
  createProjectStorageFromSnapshot,
  deleteProjectPath,
  ensureProjectFolder,
  GENERATED_LATEX_PDF_SOURCE_ID,
  GENERATED_LATEX_SYNCTEX_SOURCE_ID,
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
  DEFAULT_SNIPPETS_BY_LANGUAGE,
  SNIPPET_LANGUAGES,
  SNIPPET_LANGUAGE_LABELS,
  createEmptySnippetCollections,
  getSnippetImportTemplate,
  isSnippetLanguage,
  mergeSnippets,
  parseSnippetImport,
  SNIPPET_IMPORT_TEMPLATE,
  type SnippetCollections,
  type SnippetDefinition,
  type SnippetLanguage
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
  canDeleteWorkspaceNode,
  canMoveWorkspaceNode,
  canRenameWorkspaceNode,
  flattenVisibleWorkspaceNodes,
  findWorkspaceNodeByPath,
  getWorkspacePathExtension,
  normalizeWorkspacePath,
  isTextWorkspaceFile,
  type WorkspaceTreeNode
} from "../workspace/workspaceTree";
import { shouldIgnorePath } from "../git/pathFilters";
import { createPrefixedId } from "../utils/randomId";

const COMPILE_DEBOUNCE_MS = 60;
const SAVE_DEBOUNCE_MS = 250;
const OUTLINE_DEBOUNCE_MS = 180;
const SYNC_PROGRESS_UPDATE_INTERVAL_MS = 250;
const MENU_CLOSE_DELAY_MS = 140;
const MOVE_HOVER_EXPAND_DELAY_MS = 1000;
const PANEL_LAYOUT_STORAGE_KEY = "typr.panel-layout";
const PANEL_LAYOUT_VERSION = 6;
const MOBILE_WORKSPACE_THRESHOLD = 1080;
const SIDEBAR_DEFAULT_WIDTH = 300;
const SIDEBAR_MIN_WIDTH = 240;
const PREVIEW_MIN_WIDTH = 320;
const PANEL_HANDLE_WIDTH = 14;
const EDITOR_MIN_WIDTH = 420;
const ZEN_DEFAULT_WIDTH = 760;
const ZEN_DEFAULT_HEIGHT = 640;
const ZEN_DEFAULT_HEIGHT_RATIO = 0.8;
const ZEN_MIN_WIDTH = 420;
const ZEN_MAX_WIDTH = 980;
const ZEN_MIN_HEIGHT = 320;
const THEME_TEMPLATE_FILENAME = "typr-theme-template.json";
const APP_VERSION = packageJson.version;
const PREVIEW_POPUP_STORAGE_KEY = "typr.preview-popup";
const WORKSPACE_OPEN_FOLDERS_STORAGE_KEY = "typr.workspace-open-folders.v1";
const LATEX_PACKAGE_SELECTIONS_STORAGE_KEY = "typr.latex-package-selections.v1";
const SETTINGS_MENU_STORAGE_KEY = "typr.settings-menu.v1";
const RECENT_WORKSPACE_STORAGE_KEY = "typr.recent-workspace.v1";
const LEFT_PANE_STORAGE_KEY = "typr.left-pane.v1";
const BUILD_LOG_STORAGE_KEY = "typr.build-log.v1";
const PROJECT_EXPORT_INPUT_ACCEPT = ".json,application/json";
const WORKSPACE_UPLOAD_ACCEPT = [
  ".typ",
  ".tex",
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "image/*"
].join(",");
const TEXT_DECODER = new TextDecoder();
const TEXT_ENCODER = new TextEncoder();
const WORKSPACE_PREVIEW_FILE_CACHE_LIMIT = 8;
const GRAPHIC_REFERENCE_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "webp",
  "gif",
  "avif"
];
const TEXT_REFERENCE_EXTENSIONS = [
  "typ",
  "tex",
  "md",
  "markdown",
  "txt",
  "csv",
  "json",
  "yaml",
  "yml",
  "xml",
  "bib"
];
const RECENT_PROJECT_LIMIT = 6;
const RECENT_FILE_LIMIT = 10;
const EMPTY_COMPILE_DIAGNOSTICS: CompileDiagnostic[] = [];

type WorkspaceOpenFolderStorage = Record<string, string[]>;

function reportBootProgress(progress: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("typr:boot-progress", { detail: { progress } }));
}

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
    case "md":
    case "markdown":
      return "text/markdown";
    default:
      return null;
  }
}

function getWorkspacePreviewFileCacheKey(
  project: TyprProjectRepository,
  path: string
): string {
  const normalizedPath = normalizeWorkspacePath(path);
  const entryVersion = normalizedPath
    ? project.filesystem.entries[normalizedPath]?.updatedAt ?? "unknown"
    : "unknown";

  return `${project.id}:${normalizedPath}:${entryVersion}`;
}

function rememberWorkspacePreviewFile(
  cache: Map<string, WorkspacePreviewFile>,
  key: string,
  file: WorkspacePreviewFile
): void {
  cache.delete(key);
  cache.set(key, file);

  while (cache.size > WORKSPACE_PREVIEW_FILE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;

    if (!oldestKey) {
      return;
    }

    cache.delete(oldestKey);
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
  { id: "projects", label: "Projects" },
  { id: "files", label: "Files" },
  { id: "source-tools", label: "Tools" },
  { id: "search", label: "Search" },
  { id: "outline", label: "Outline" },
  { id: "diagram", label: "Diagram" },
  { id: "graph", label: "Graph" },
  { id: "mitex", label: "MiTeX" },
  { id: "sync", label: "Git" },
  { id: "debug", label: "Debug" }
];

const MOBILE_SIDEBAR_TOOLS: Array<{ id: SidebarTool; label: string }> = [
  ...SIDEBAR_TOOLS,
  { id: "docs", label: "Docs" },
  { id: "settings", label: "Settings" }
];

interface SourceSymbolTooltipState {
  item: SourceSymbolItem;
  x: number;
  y: number;
}

type MobileKeyboardKeyAction =
  | { type: "text"; value: string }
  | { type: "template"; value: string }
  | { type: "wrap"; before: string; after?: string }
  | { type: "lineToggle"; prefix: string; alternatePrefix?: string };

interface MobileKeyboardKey {
  label: string;
  title: string;
  action: MobileKeyboardKeyAction;
}

const MOBILE_KEYBOARD_KEYS_BY_LANGUAGE: Record<MobileKeyboardLanguage, MobileKeyboardKey[]> = {
  typst: [
    { label: "#", title: "Insert #", action: { type: "text", value: "#" } },
    { label: "$", title: "Insert math delimiters", action: { type: "template", value: "$${1:x}$" } },
    { label: "[]", title: "Insert brackets", action: { type: "template", value: "[${1:text}]" } },
    { label: "()", title: "Insert parentheses", action: { type: "template", value: "(${1})" } },
    { label: "{}", title: "Insert braces", action: { type: "template", value: "{${1}}" } },
    { label: "=", title: "Toggle heading", action: { type: "lineToggle", prefix: "= ", alternatePrefix: "" } },
    { label: "*", title: "Wrap selection in bold", action: { type: "wrap", before: "*", after: "*" } },
    { label: "_", title: "Wrap selection in italic", action: { type: "wrap", before: "_", after: "_" } },
    { label: "@", title: "Insert reference marker", action: { type: "text", value: "@" } },
    { label: "`", title: "Wrap selection in raw text", action: { type: "wrap", before: "`", after: "`" } },
    { label: "fn", title: "Insert Typst function call", action: { type: "template", value: "#${1:name}(${2})" } }
  ],
  latex: [
    { label: "\\", title: "Insert backslash", action: { type: "text", value: "\\" } },
    { label: "$", title: "Insert math delimiters", action: { type: "template", value: "$${1:x}$" } },
    { label: "{}", title: "Insert braces", action: { type: "template", value: "{${1}}" } },
    { label: "[]", title: "Insert brackets", action: { type: "template", value: "[${1}]" } },
    { label: "^", title: "Insert superscript", action: { type: "template", value: "^{${1}}" } },
    { label: "_", title: "Insert subscript", action: { type: "template", value: "_{${1}}" } },
    { label: "&", title: "Insert alignment marker", action: { type: "text", value: "&" } },
    { label: "%", title: "Insert comment marker", action: { type: "text", value: "%" } },
    { label: "#", title: "Insert parameter marker", action: { type: "text", value: "#" } },
    { label: "frac", title: "Insert fraction", action: { type: "template", value: "\\frac{${1:numerator}}{${2:denominator}}" } },
    { label: "env", title: "Insert environment", action: { type: "template", value: "\\begin{${1:environment}}\n  ${2}\n\\end{${1:environment}}" } }
  ],
  markdown: [
    { label: "#", title: "Toggle heading", action: { type: "lineToggle", prefix: "# ", alternatePrefix: "" } },
    { label: "-", title: "Toggle bullet list", action: { type: "lineToggle", prefix: "- ", alternatePrefix: "" } },
    { label: "*", title: "Wrap selection in bold", action: { type: "wrap", before: "**", after: "**" } },
    { label: "_", title: "Wrap selection in italic", action: { type: "wrap", before: "_", after: "_" } },
    { label: "`", title: "Wrap selection in code", action: { type: "wrap", before: "`", after: "`" } },
    { label: "[]", title: "Insert link text brackets", action: { type: "template", value: "[${1:text}]" } },
    { label: "()", title: "Insert link URL parentheses", action: { type: "template", value: "(${1:url})" } },
    { label: ">", title: "Toggle quote", action: { type: "lineToggle", prefix: "> ", alternatePrefix: "" } },
    { label: "|", title: "Insert table separator", action: { type: "text", value: "|" } },
    { label: "```", title: "Insert fenced code block", action: { type: "template", value: "```${1:language}\n${2:code}\n```" } },
    { label: "link", title: "Insert Markdown link", action: { type: "template", value: "[${1:text}](${2:url})" } }
  ]
};

function parseMobileKeyboardLabels(value: string): string[] {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, 18);
}

function formatMobileKeyboardLabels(labels: string[]): string {
  return labels.join(", ");
}

function resolveMobileKeyboardKeys(language: SourceLanguage, labels: string[]): MobileKeyboardKey[] {
  if (language !== "typst" && language !== "latex" && language !== "markdown") {
    return [];
  }

  const builtInKeys = new Map(
    MOBILE_KEYBOARD_KEYS_BY_LANGUAGE[language].map((key) => [key.label, key])
  );

  return labels.map((label) => builtInKeys.get(label) ?? {
    label,
    title: `Insert ${label}`,
    action: { type: "text", value: label }
  });
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
type WorkspaceMode = "split" | "sidebar" | "editor" | "preview" | "zen";
type ZenResizeEdge = "zen-left" | "zen-right" | "zen-top" | "zen-bottom";
type ZoomPaneTarget = "sidebar" | "source" | "preview";
type VimPaneFocusTarget = "files" | "source" | "preview";
type PreviewScrollAction =
  | "left"
  | "down"
  | "up"
  | "right"
  | "next-page"
  | "previous-page"
  | "top"
  | "bottom";
type MobileWorkspaceTab = "files" | "editor" | "preview";
type WorkspaceTabKind = "source" | "preview";
type SidebarTool =
  | "projects"
  | "files"
  | "source-tools"
  | "search"
  | "outline"
  | "mitex"
  | "sync"
  | "debug"
  | "diagram"
  | "graph"
  | "docs"
  | "settings";
type DiagramPaneMode = "sidebar" | "source" | "preview";
type GraphPaneMode = "sidebar" | "source" | "preview";
type GitMergePaneMode = "sidebar" | "source" | "preview";
type MergeVersionRole = "base" | "local" | "remote";
type SettingsTab = "git" | "themes" | "editor" | "keybindings" | "snippets" | "packages";
type PackageSettingsScope = "typst" | "latex";
type SettingsScrollPositions = Partial<Record<SettingsTab, number>>;
type WorkspaceClipboardMode = "copy" | "cut";
type MatrixDelimiter = "paren" | "bracket" | "brace" | "bar" | "angle" | "none";
type TableAlignment = "left" | "center" | "right" | "horizon";
type TableGutter = "none" | "small" | "medium";
type TableInset = "none" | "small" | "medium";
type TableStroke = "default" | "none";
type BuildLogTrigger = "manual" | "auto" | "preview" | "export" | "agent" | "rerun";
type BuildLogFilter = "all" | "errors" | "warnings" | "current-file" | "latex";

interface WorkspaceClipboardState {
  mode: WorkspaceClipboardMode;
  paths: string[];
}

interface SyncFeedback {
  tone: "neutral" | "success" | "error";
  text: string;
}

interface CompilePreviewState {
  result: CompileResult | null;
  lastSuccessfulResult: Extract<CompileResult, { ok: true }> | null;
  compilerStatus: CompilerStatus;
  isCompiling: boolean;
}

interface BuildLogEntry {
  id: string;
  sourcePath: string;
  language: SourceLanguage;
  engine: CompileResult["engine"];
  ok: boolean;
  startedAt: string;
  durationMs: number;
  diagnostics: CompileDiagnostic[];
  metadata?: CompileMetadata;
  trigger: BuildLogTrigger;
  compileMode: "quick" | "full" | "none";
  cached: boolean;
  outputChanged: boolean;
  rawLog?: string;
  packageDetails: string[];
  shellEscapeUnavailable: boolean;
}

interface WorkspaceReference {
  path: string;
  defaultExtensions: string[];
}

interface WorkspaceDownloadFile {
  path: string;
  content: string | Uint8Array;
}

interface WorkspaceMissingReference {
  sourcePath: string;
  reference: string;
  candidates: string[];
}

interface WorkspaceDownloadBundle {
  files: WorkspaceDownloadFile[];
  missingReferences: WorkspaceMissingReference[];
}

interface RecentProjectEntry {
  id: string;
  displayName: string;
  touchedAt: string;
}

interface RecentFileEntry {
  projectId: string;
  projectName: string;
  path: string;
  touchedAt: string;
}

type PreviewDownloadMode = "output" | "source";
type WorkspaceGitBadgeKind = "modified" | "added" | "deleted" | "conflict";

interface StoredSettingsMenuState {
  tab: SettingsTab;
  scrollByTab: SettingsScrollPositions;
}

interface StoredLeftPaneState {
  activeSidebarTool: SidebarTool;
  mobileWorkspaceTab: MobileWorkspaceTab;
  isTrashViewOpen: boolean;
  scrollByPane: Record<string, number>;
}

const SETTINGS_TABS: readonly SettingsTab[] = [
  "git",
  "themes",
  "editor",
  "keybindings",
  "snippets",
  "packages"
];

const SETTINGS_SEARCH_INDEX: Record<SettingsTab, string[]> = {
  git: [
    "git",
    "github",
    "token",
    "remote",
    "owner",
    "repo",
    "repository",
    "branch",
    "gitignore",
    "status",
    "push",
    "sync",
    "commit"
  ],
  themes: [
    "theme",
    "themes",
    "light",
    "dark",
    "system",
    "import",
    "palette",
    "follow system default"
  ],
  editor: [
    "editor",
    "vim",
    "cursor",
    "smooth",
    "smear",
    "format",
    "formatter",
    "lint",
    "linter",
    "compile",
    "live"
  ],
  keybindings: [
    "keybindings",
    "keys",
    "shortcuts",
    "hotkeys",
    "vim",
    "layout",
    "preview",
    "multi cursor",
    ...KEYBINDING_DEFINITIONS.flatMap((definition) => [
      definition.label,
      definition.group,
      definition.defaultBinding
    ])
  ],
  snippets: [
    "snippets",
    "typst",
    "latex",
    "markdown",
    "autocomplete",
    "import",
    "json",
    "template"
  ],
  packages: [
    "packages",
    "package",
    "typst universe",
    "latex",
    "cache",
    "offline",
    "bundle",
    "manual",
    "recommended",
    "basic"
  ]
};

interface PendingKeybindingConflict {
  commandId: KeybindingCommandId;
  binding: string;
  conflictIds: KeybindingCommandId[];
}

type SyncStatusSnapshot = SyncFeedback & {
  progress: { current: number; total: number } | null;
};

const INITIAL_SYNC_STATUS: SyncStatusSnapshot = {
  tone: "neutral",
  text: "",
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

interface GitHubCloneState {
  isOpen: boolean;
  mode: "clone" | "create";
  status: "idle" | "loading" | "connected" | "error";
  token: string;
  owner: string;
  repo: string;
  branch: string;
  projectName: string;
  repositoryUrl: string;
  message: string;
  accountLogin: string | null;
  owners: RemoteGitAccount[];
  repos: RemoteGitRepositorySummary[];
  branches: RemoteGitBranchSummary[];
  isLoadingRepos: boolean;
  isLoadingBranches: boolean;
  progress: { current: number; total: number } | null;
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
  isSourcePaneHidden?: boolean;
  isPreviewCollapsed?: boolean;
  sidebarWidth?: number;
  previewRatio?: number;
  zenWidth?: number;
  zenHeight?: number;
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

function readStoredWorkspaceOpenFolders(): WorkspaceOpenFolderStorage {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(WORKSPACE_OPEN_FOLDERS_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<WorkspaceOpenFolderStorage>((next, [key, value]) => {
      if (Array.isArray(value)) {
        next[key] = normalizeWorkspaceOpenFolderPaths(value);
      }

      return next;
    }, {});
  } catch {
    return {};
  }
}

function normalizeWorkspaceOpenFolderPaths(paths: readonly unknown[]): string[] {
  return Array.from(
    new Set(
      paths
        .filter((path): path is string => typeof path === "string")
        .map((path) => (path === WORKSPACE_ROOT_PATH ? WORKSPACE_ROOT_PATH : normalizeWorkspacePath(path)))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && SETTINGS_TABS.includes(value as SettingsTab);
}

function normalizeSettingsScrollPositions(value: unknown): SettingsScrollPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return SETTINGS_TABS.reduce<SettingsScrollPositions>((positions, tab) => {
    const scrollTop = (value as Partial<Record<SettingsTab, unknown>>)[tab];

    if (typeof scrollTop === "number" && Number.isFinite(scrollTop) && scrollTop > 0) {
      positions[tab] = Math.round(scrollTop);
    }

    return positions;
  }, {});
}

function readStoredSettingsMenuState(): StoredSettingsMenuState {
  if (typeof window === "undefined") {
    return { tab: "git", scrollByTab: {} };
  }

  try {
    const stored = window.localStorage.getItem(SETTINGS_MENU_STORAGE_KEY);

    if (!stored) {
      return { tab: "git", scrollByTab: {} };
    }

    const parsed = JSON.parse(stored);

    return {
      tab: isSettingsTab(parsed?.tab) ? parsed.tab : "git",
      scrollByTab: normalizeSettingsScrollPositions(parsed?.scrollByTab)
    };
  } catch {
    return { tab: "git", scrollByTab: {} };
  }
}

function writeStoredSettingsMenuState(
  tab: SettingsTab,
  scrollByTab: SettingsScrollPositions
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SETTINGS_MENU_STORAGE_KEY,
    JSON.stringify({
      tab,
      scrollByTab
    })
  );
}

function isSidebarTool(value: unknown): value is SidebarTool {
  return (
    value === "files" ||
    value === "source-tools" ||
    value === "projects" ||
    value === "search" ||
    value === "outline" ||
    value === "mitex" ||
    value === "sync" ||
    value === "debug" ||
    value === "diagram" ||
    value === "graph" ||
    value === "docs" ||
    value === "settings"
  );
}

function isMobileWorkspaceTab(value: unknown): value is MobileWorkspaceTab {
  return value === "files" || value === "editor" || value === "preview";
}

function normalizeLeftPaneScrollPositions(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((positions, [key, scrollTop]) => {
    if (typeof scrollTop === "number" && Number.isFinite(scrollTop) && scrollTop > 0) {
      positions[key] = Math.round(scrollTop);
    }

    return positions;
  }, {});
}

function readStoredLeftPaneState(): StoredLeftPaneState {
  const fallback: StoredLeftPaneState = {
    activeSidebarTool: "files",
    mobileWorkspaceTab: "editor",
    isTrashViewOpen: false,
    scrollByPane: {}
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(LEFT_PANE_STORAGE_KEY);
    if (!stored) {
      return fallback;
    }

    const parsed = JSON.parse(stored);

    return {
      activeSidebarTool: isSidebarTool(parsed?.activeSidebarTool)
        ? parsed.activeSidebarTool
        : fallback.activeSidebarTool,
      mobileWorkspaceTab: isMobileWorkspaceTab(parsed?.mobileWorkspaceTab)
        ? parsed.mobileWorkspaceTab
        : fallback.mobileWorkspaceTab,
      isTrashViewOpen: Boolean(parsed?.isTrashViewOpen),
      scrollByPane: normalizeLeftPaneScrollPositions(parsed?.scrollByPane)
    };
  } catch {
    return fallback;
  }
}

function writeStoredLeftPaneState(state: StoredLeftPaneState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LEFT_PANE_STORAGE_KEY, JSON.stringify(state));
}

function readRecentWorkspaceState(): {
  projects: RecentProjectEntry[];
  files: RecentFileEntry[];
} {
  if (typeof window === "undefined") {
    return { projects: [], files: [] };
  }

  try {
    const stored = window.localStorage.getItem(RECENT_WORKSPACE_STORAGE_KEY);

    if (!stored) {
      return { projects: [], files: [] };
    }

    const parsed = JSON.parse(stored);

    return {
      projects: normalizeRecentProjects(parsed?.projects),
      files: normalizeRecentFiles(parsed?.files)
    };
  } catch {
    return { projects: [], files: [] };
  }
}

function writeRecentWorkspaceState(
  projects: RecentProjectEntry[],
  files: RecentFileEntry[]
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RECENT_WORKSPACE_STORAGE_KEY,
    JSON.stringify({ projects, files })
  );
}

function normalizeRecentProjects(value: unknown): RecentProjectEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): RecentProjectEntry | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const candidate = entry as Partial<Record<keyof RecentProjectEntry, unknown>>;
      if (typeof candidate.id !== "string" || typeof candidate.displayName !== "string") {
        return null;
      }

      return {
        id: candidate.id,
        displayName: candidate.displayName,
        touchedAt:
          typeof candidate.touchedAt === "string"
            ? candidate.touchedAt
            : new Date(0).toISOString()
      };
    })
    .filter((entry): entry is RecentProjectEntry => Boolean(entry))
    .sort((left, right) => right.touchedAt.localeCompare(left.touchedAt))
    .slice(0, RECENT_PROJECT_LIMIT);
}

function normalizeRecentFiles(value: unknown): RecentFileEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): RecentFileEntry | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const candidate = entry as Partial<Record<keyof RecentFileEntry, unknown>>;
      if (
        typeof candidate.projectId !== "string" ||
        typeof candidate.projectName !== "string" ||
        typeof candidate.path !== "string"
      ) {
        return null;
      }

      const normalizedPath = normalizeWorkspacePath(candidate.path);
      if (!normalizedPath) {
        return null;
      }

      return {
        projectId: candidate.projectId,
        projectName: candidate.projectName,
        path: normalizedPath,
        touchedAt:
          typeof candidate.touchedAt === "string"
            ? candidate.touchedAt
            : new Date(0).toISOString()
      };
    })
    .filter((entry): entry is RecentFileEntry => Boolean(entry))
    .sort((left, right) => right.touchedAt.localeCompare(left.touchedAt))
    .slice(0, RECENT_FILE_LIMIT);
}

function touchRecentProject(
  entries: RecentProjectEntry[],
  project: TyprProjectRepository
): RecentProjectEntry[] {
  const touchedAt = new Date().toISOString();
  return [
    {
      id: project.id,
      displayName: project.displayName,
      touchedAt
    },
    ...entries.filter((entry) => entry.id !== project.id)
  ].slice(0, RECENT_PROJECT_LIMIT);
}

function touchRecentFile(
  entries: RecentFileEntry[],
  project: TyprProjectRepository,
  path: string
): RecentFileEntry[] {
  const normalizedPath = normalizeWorkspacePath(path);
  if (!normalizedPath) {
    return entries;
  }

  const touchedAt = new Date().toISOString();
  return [
    {
      projectId: project.id,
      projectName: project.displayName,
      path: normalizedPath,
      touchedAt
    },
    ...entries.filter(
      (entry) => entry.projectId !== project.id || entry.path !== normalizedPath
    )
  ].slice(0, RECENT_FILE_LIMIT);
}

function normalizeLatexPackageSelectionName(packageName: string): string {
  return packageName.trim().toLowerCase();
}

function readStoredLatexPackageSelections(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(LATEX_PACKAGE_SELECTIONS_STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed
          .filter((packageName): packageName is string => typeof packageName === "string")
          .map(normalizeLatexPackageSelectionName)
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function createInitialGitHubCloneState(): GitHubCloneState {
  return {
    isOpen: false,
    mode: "clone",
    status: "idle",
    token: "",
    owner: "",
    repo: "",
    branch: "main",
    projectName: "",
    repositoryUrl: "",
    message: "",
    accountLogin: null,
    owners: [],
    repos: [],
    branches: [],
    isLoadingRepos: false,
    isLoadingBranches: false,
    progress: null
  };
}

function parseGitHubRepositoryUrl(value: string): { owner: string; repo: string } | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#\s]|$)/i.exec(value.trim());

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2]
  };
}

function renameProjectRepositoryDisplayName(
  project: TyprProjectRepository,
  displayName: string
): TyprProjectRepository {
  const nextName = displayName.trim();

  if (!nextName || nextName === project.displayName) {
    return project;
  }

  const now = new Date().toISOString();

  return {
    ...project,
    displayName: nextName,
    legacyRecovery: {
      ...project.legacyRecovery,
      project: {
        ...project.legacyRecovery.project,
        name: nextName,
        updatedAt: now
      }
    },
    updatedAt: now
  };
}

function collectWorkspaceFolderPaths(nodes: WorkspaceTreeNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.kind !== "folder") {
      continue;
    }

    paths.push(node.path);
    paths.push(...collectWorkspaceFolderPaths(node.children));
  }

  return paths;
}

function arePathListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((path, index) => path === right[index]);
}

function clampPreviewRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampZenWidth(value: number, workspaceWidth = Number.POSITIVE_INFINITY) {
  const maxViewportWidth = Number.isFinite(workspaceWidth)
    ? Math.max(280, workspaceWidth - PANEL_HANDLE_WIDTH * 2)
    : ZEN_MAX_WIDTH;
  const maxWidth = Math.min(ZEN_MAX_WIDTH, maxViewportWidth);
  const minWidth = Math.min(ZEN_MIN_WIDTH, maxWidth);

  return clampPanelWidth(value, minWidth, maxWidth);
}

function getCurrentViewportHeight() {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.visualViewport?.height ?? window.innerHeight;
}

function clampZenHeight(value: number, viewportHeight = getCurrentViewportHeight()) {
  const maxViewportHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? Math.max(240, viewportHeight - PANEL_HANDLE_WIDTH * 2)
      : Number.POSITIVE_INFINITY;
  const minHeight = Math.min(ZEN_MIN_HEIGHT, maxViewportHeight);

  return clampPanelWidth(value, minHeight, maxViewportHeight);
}

function getDefaultZenHeight(viewportHeight = getCurrentViewportHeight()) {
  const defaultHeight =
    viewportHeight > 0 ? viewportHeight * ZEN_DEFAULT_HEIGHT_RATIO : ZEN_DEFAULT_HEIGHT;

  return clampZenHeight(defaultHeight, viewportHeight);
}

function getViewportBalancedPreviewRatio() {
  return 0.5;
}

function getPreviewPaneWidth(
  workspaceWidth: number,
  sidebarWidth: number,
  handleWidthTotal: number,
  previewRatio: number,
  sourceMinWidth: number
) {
  const availableWidth = Math.max(0, workspaceWidth - sidebarWidth - handleWidthTotal);
  const maxWidth = Math.max(0, availableWidth - sourceMinWidth);
  const minWidth = Math.min(PREVIEW_MIN_WIDTH, maxWidth);
  const idealWidth = Math.round(availableWidth * previewRatio);

  return clampPanelWidth(idealWidth, minWidth, maxWidth);
}

function isMobileWorkspaceViewport(width: number) {
  return width > 0 && width <= MOBILE_WORKSPACE_THRESHOLD;
}

function getCurrentViewportWidth() {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.visualViewport?.width ?? window.innerWidth;
}

function getWorkspaceParentPath(path: string): string | null {
  const segments = normalizeWorkspacePath(path).split("/").filter(Boolean);
  segments.pop();
  return segments.length > 0 ? segments.join("/") : null;
}

function getWorkspaceBaseName(path: string): string {
  return normalizeWorkspacePath(path).split("/").filter(Boolean).at(-1) ?? path;
}

function getSafeDownloadName(name: string, fallback = "download"): string {
  const normalizedName = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  return normalizedName || fallback;
}

function getWorkspacePathDirectory(path: string): string {
  const segments = normalizeWorkspacePath(path).split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

function hasWorkspacePathExtension(path: string): boolean {
  return Boolean(getWorkspacePathExtension(path));
}

function isExternalReference(reference: string): boolean {
  const value = reference.trim();
  return (
    !value ||
    value.startsWith("#") ||
    value.startsWith("@") ||
    value.startsWith("data:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

function normalizeWorkspaceReferencePath(reference: string, sourcePath: string): string | null {
  const [withoutHash] = reference.trim().split("#");
  const [withoutQuery] = withoutHash.split("?");
  const cleanedReference = withoutQuery.trim().replace(/^['"]|['"]$/g, "");

  if (isExternalReference(cleanedReference)) {
    return null;
  }

  const baseDirectory = getWorkspacePathDirectory(sourcePath);
  const rawSegments = [
    ...(cleanedReference.startsWith("/") ? [] : baseDirectory.split("/").filter(Boolean)),
    ...cleanedReference.replace(/^\/+/, "").split("/")
  ];
  const normalizedSegments: string[] = [];

  for (const segment of rawSegments) {
    const trimmedSegment = segment.trim();

    if (!trimmedSegment || trimmedSegment === ".") {
      continue;
    }

    if (trimmedSegment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(trimmedSegment);
  }

  return normalizeWorkspacePath(normalizedSegments.join("/")) || null;
}

function getWorkspaceReferenceCandidatePaths(
  reference: string,
  sourcePath: string,
  defaultExtensions: string[]
): string[] {
  const normalizedReference = normalizeWorkspaceReferencePath(reference, sourcePath);

  if (!normalizedReference) {
    return [];
  }

  const candidates = hasWorkspacePathExtension(normalizedReference)
    ? [normalizedReference]
    : [
        normalizedReference,
        ...defaultExtensions.map((extension) => `${normalizedReference}.${extension}`)
      ];

  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

function resolveWorkspaceReferenceCandidates(
  reference: string,
  sourcePath: string,
  fileMap: Map<string, WorkspaceDownloadFile>,
  defaultExtensions: string[]
): string[] {
  return getWorkspaceReferenceCandidatePaths(reference, sourcePath, defaultExtensions).filter(
    (candidate) => fileMap.has(candidate)
  );
}

function extractLocalWorkspaceReferences(sourcePath: string, content: string): WorkspaceReference[] {
  const references: WorkspaceReference[] = [];
  const addReference = (value: string, extensions: string[] = TEXT_REFERENCE_EXTENSIONS) => {
    const reference = value.trim();

    if (reference) {
      references.push({ path: reference, defaultExtensions: extensions });
    }
  };

  for (const match of content.matchAll(/\\(?:input|include|subfile)\s*\{([^}]+)\}/gi)) {
    addReference(match[1], ["tex"]);
  }

  for (const match of content.matchAll(/\\includegraphics(?:\s*\[[^\]]*])?\s*\{([^}]+)\}/gi)) {
    addReference(match[1], GRAPHIC_REFERENCE_EXTENSIONS);
  }

  for (const match of content.matchAll(/\\(?:bibliography|addbibresource)\s*\{([^}]+)\}/gi)) {
    for (const reference of match[1].split(",")) {
      addReference(reference, ["bib"]);
    }
  }

  for (const match of content.matchAll(/#?\s*(?:import|include)\s+"([^"]+)"/gi)) {
    addReference(match[1], ["typ"]);
  }

  for (const match of content.matchAll(
    /#?\s*(?:image|read|csv|json|yaml|xml|raw)\s*\(\s*"([^"]+)"/gi
  )) {
    addReference(match[1], TEXT_REFERENCE_EXTENSIONS.concat(GRAPHIC_REFERENCE_EXTENSIONS));
  }

  for (const match of content.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    addReference(match[1], GRAPHIC_REFERENCE_EXTENSIONS);
  }

  for (const match of content.matchAll(/(?<!!)\[[^\]]+]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    addReference(match[1], TEXT_REFERENCE_EXTENSIONS.concat(GRAPHIC_REFERENCE_EXTENSIONS));
  }

  for (const match of content.matchAll(/\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    addReference(match[1], GRAPHIC_REFERENCE_EXTENSIONS);
  }

  return references.filter((reference) => normalizeWorkspaceReferencePath(reference.path, sourcePath));
}

function getWorkspaceDownloadFileText(file: WorkspaceDownloadFile): string | null {
  if (typeof file.content === "string") {
    return file.content;
  }

  if (!isTextWorkspaceFile(file.path)) {
    return null;
  }

  try {
    return TEXT_DECODER.decode(file.content);
  } catch {
    return null;
  }
}

function createWorkspaceFileMap(project: TyprProjectRepository): Map<string, WorkspaceDownloadFile> {
  const fileMap = new Map<string, WorkspaceDownloadFile>();

  for (const entry of buildProjectWorkspaceEntriesFromProject(project)) {
    if (entry.kind !== "file") {
      continue;
    }

    const path = normalizeWorkspacePath(entry.path);
    if (!path) {
      continue;
    }

    fileMap.set(path, {
      path,
      content: entry.content ?? ""
    });
  }

  return fileMap;
}

function getWorkspaceDownloadBundleForPaths(
  project: TyprProjectRepository,
  selectedPaths: string[]
): WorkspaceDownloadBundle {
  const fileMap = createWorkspaceFileMap(project);
  const normalizedSelectedPaths = normalizeUniqueWorkspacePaths(selectedPaths);
  const queuedPaths: string[] = [];
  const includedPaths = new Set<string>();
  const missingReferencesByKey = new Map<string, WorkspaceMissingReference>();

  const includeFilePath = (path: string) => {
    const normalizedPath = normalizeWorkspacePath(path);
    if (!normalizedPath || includedPaths.has(normalizedPath) || !fileMap.has(normalizedPath)) {
      return;
    }

    includedPaths.add(normalizedPath);
    queuedPaths.push(normalizedPath);
  };

  for (const selectedPath of normalizedSelectedPaths) {
    const file = fileMap.get(selectedPath);
    if (file) {
      includeFilePath(file.path);
      continue;
    }

    const folderPrefix = selectedPath ? `${selectedPath}/` : "";
    for (const path of fileMap.keys()) {
      if (path.startsWith(folderPrefix)) {
        includeFilePath(path);
      }
    }
  }

  for (let index = 0; index < queuedPaths.length; index += 1) {
    const path = queuedPaths[index];
    const file = fileMap.get(path);

    if (!file) {
      continue;
    }

    const text = getWorkspaceDownloadFileText(file);
    if (text === null) {
      continue;
    }

    for (const reference of extractLocalWorkspaceReferences(path, text)) {
      const referencedPaths = resolveWorkspaceReferenceCandidates(
        reference.path,
        path,
        fileMap,
        reference.defaultExtensions
      );

      if (referencedPaths.length === 0) {
        const candidates = getWorkspaceReferenceCandidatePaths(
          reference.path,
          path,
          reference.defaultExtensions
        );
        const key = `${path}\0${reference.path}`;

        if (candidates.length > 0 && !missingReferencesByKey.has(key)) {
          missingReferencesByKey.set(key, {
            sourcePath: path,
            reference: reference.path,
            candidates
          });
        }
      }

      for (const referencedPath of referencedPaths) {
        includeFilePath(referencedPath);
      }
    }
  }

  return {
    files: [...includedPaths]
      .sort((left, right) => left.localeCompare(right))
      .map((path) => fileMap.get(path))
      .filter((file): file is WorkspaceDownloadFile => Boolean(file)),
    missingReferences: [...missingReferencesByKey.values()].sort((left, right) =>
      `${left.sourcePath}:${left.reference}`.localeCompare(`${right.sourcePath}:${right.reference}`)
    )
  };
}

function getWorkspaceDownloadFilesForPaths(
  project: TyprProjectRepository,
  selectedPaths: string[]
): WorkspaceDownloadFile[] {
  return getWorkspaceDownloadBundleForPaths(project, selectedPaths).files;
}

function formatMissingWorkspaceReferences(missingReferences: WorkspaceMissingReference[]): string {
  if (missingReferences.length === 0) {
    return "";
  }

  const sample = missingReferences
    .slice(0, 3)
    .map((reference) => `${reference.reference} in ${reference.sourcePath}`)
    .join(", ");
  const extraCount = missingReferences.length - 3;

  return ` Missing ${missingReferences.length} referenced file${
    missingReferences.length === 1 ? "" : "s"
  }: ${sample}${extraCount > 0 ? `, +${extraCount} more` : ""}.`;
}

function createWorkspaceZip(files: WorkspaceDownloadFile[]): Uint8Array {
  return zipSync(
    files.reduce<Record<string, Uint8Array>>((entries, file) => {
      entries[file.path] =
        typeof file.content === "string" ? TEXT_ENCODER.encode(file.content) : file.content;
      return entries;
    }, {})
  );
}

function getRenderedOutputBaseName(path: string): string {
  return getSafeDownloadName(getWorkspaceBaseName(path).replace(/\.[^.]+$/, ""), "preview");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdownInlineHtml(value: string): string {
  const placeholders: string[] = [];
  const stash = (html: string) => {
    const token = `\u0000${placeholders.length}\u0000`;
    placeholders.push(html);
    return token;
  };

  let rendered = escapeHtml(value);
  rendered = rendered.replace(/`([^`]+)`/g, (_match, code: string) =>
    stash(`<code>${escapeHtml(code)}</code>`)
  );
  rendered = rendered.replace(/!\[([^\]]*)]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, alt: string, href: string) =>
    stash(`<img alt="${escapeHtml(alt)}" src="${escapeHtml(href)}">`)
  );
  rendered = rendered.replace(/\[([^\]]+)]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, label: string, href: string) =>
    stash(`<a href="${escapeHtml(href)}">${renderMarkdownInlineHtml(label)}</a>`)
  );
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  rendered = rendered.replace(/\+\+([^+]+)\+\+/g, "<u>$1</u>");

  return rendered.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => placeholders[Number(index)] ?? "");
}

function renderMarkdownDocumentHtml(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(```+|~~~+)\s*(.*)$/);
    if (fence) {
      const fenceMarker = fence[1];
      const language = fence[2]?.trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trimStart().startsWith(fenceMarker)) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      html.push(
        `<pre><code${language ? ` data-language="${escapeHtml(language)}"` : ""}>${escapeHtml(
          codeLines.join("\n")
        )}</code></pre>`
      );
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderMarkdownInlineHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    const listMatch = line.match(/^\s{0,3}([-*+]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items: string[] = [];

      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s{0,3}([-*+]|\d+[.)])\s+(.+)$/);
        if (!itemMatch || /\d/.test(itemMatch[1]) !== ordered) {
          break;
        }
        items.push(`<li>${renderMarkdownInlineHtml(itemMatch[2])}</li>`);
        index += 1;
      }

      html.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteMatch = lines[index].match(/^\s{0,3}>\s?(.*)$/);
        if (!quoteMatch) {
          break;
        }
        quoteLines.push(quoteMatch[1]);
        index += 1;
      }
      html.push(`<blockquote><p>${renderMarkdownInlineHtml(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*(```+|~~~+)/.test(lines[index]) &&
      !/^\s{0,3}(#{1,6})\s+/.test(lines[index]) &&
      !/^\s{0,3}([-*+]|\d+[.)])\s+/.test(lines[index]) &&
      !/^\s{0,3}>\s?/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    html.push(`<p>${renderMarkdownInlineHtml(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function createRenderedMarkdownHtml(source: string, title: string): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    "body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2328;background:#fff}",
    "img{max-width:100%;height:auto}pre{overflow:auto;padding:12px;background:#f6f8fa;border-radius:6px}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}blockquote{margin-left:0;padding-left:16px;border-left:3px solid #d0d7de;color:#57606a}",
    "</style>",
    "</head>",
    "<body>",
    renderMarkdownDocumentHtml(source),
    "</body>",
    "</html>"
  ].join("\n");
}

function areWorkspacePathListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function normalizeUniqueWorkspacePaths(paths: readonly string[]): string[] {
  const seenPaths = new Set<string>();
  const normalizedPaths: string[] = [];

  for (const path of paths) {
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath || seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    normalizedPaths.push(normalizedPath);
  }

  return normalizedPaths;
}

function appendUniqueWorkspacePath(paths: string[], path: string): string[] {
  const normalizedPaths = normalizeUniqueWorkspacePaths(paths);
  const normalizedPath = normalizeWorkspacePath(path);

  if (!normalizedPath || normalizedPaths.includes(normalizedPath)) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  return [...normalizedPaths, normalizedPath];
}

function insertWorkspacePathAfterActive(
  paths: string[],
  path: string,
  activePath: string | null
): string[] {
  const normalizedPaths = normalizeUniqueWorkspacePaths(paths);
  const normalizedPath = normalizeWorkspacePath(path);

  if (!normalizedPath || normalizedPaths.includes(normalizedPath)) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  const normalizedActivePath = activePath ? normalizeWorkspacePath(activePath) : null;
  const activeIndex = normalizedActivePath ? normalizedPaths.indexOf(normalizedActivePath) : -1;

  if (activeIndex < 0) {
    return [...normalizedPaths, normalizedPath];
  }

  return [
    ...normalizedPaths.slice(0, activeIndex + 1),
    normalizedPath,
    ...normalizedPaths.slice(activeIndex + 1)
  ];
}

function reorderWorkspacePaths(
  paths: string[],
  draggedPath: string,
  targetPath: string,
  insertAfterTarget: boolean
): string[] {
  const normalizedPaths = normalizeUniqueWorkspacePaths(paths);
  const normalizedDraggedPath = normalizeWorkspacePath(draggedPath);
  const normalizedTargetPath = normalizeWorkspacePath(targetPath);
  const draggedIndex = normalizedPaths.indexOf(normalizedDraggedPath);
  const targetIndex = normalizedPaths.indexOf(normalizedTargetPath);

  if (
    !normalizedDraggedPath ||
    !normalizedTargetPath ||
    draggedIndex === -1 ||
    targetIndex === -1 ||
    draggedIndex === targetIndex
  ) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  const nextPaths = normalizedPaths.filter((path) => path !== normalizedDraggedPath);
  const targetInsertIndex = nextPaths.indexOf(normalizedTargetPath);

  if (targetInsertIndex === -1) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  nextPaths.splice(targetInsertIndex + (insertAfterTarget ? 1 : 0), 0, normalizedDraggedPath);
  return nextPaths;
}

function createIdleCompilerStatusForSource(path: string): CompilerStatus {
  const language = getSourceLanguage(path);
  const isCompilable = isCompilableSourceFile(path);

  return {
    phase: "idle",
    mode: "worker",
    label: isCompilable
      ? language === "latex"
        ? "LaTeX ready"
        : "Typst ready"
      : "No compiler for active file",
    detail:
      language === "latex"
        ? "Press Compile or Ctrl+Enter to update the PDF preview."
        : undefined
  };
}

function createCompilePreviewState(
  path: string,
  overrides: Partial<CompilePreviewState> = {}
): CompilePreviewState {
  return {
    result: null,
    lastSuccessfulResult: null,
    compilerStatus: createIdleCompilerStatusForSource(path),
    isCompiling: false,
    ...overrides
  };
}

function collectWorkspaceFilePaths(nodes: WorkspaceTreeNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.kind === "file") {
      paths.push(node.path);
      continue;
    }

    paths.push(...collectWorkspaceFilePaths(node.children));
  }

  return paths;
}

function getProjectWorkspaceStructureKey(project: TyprProjectRepository): string {
  return [
    project.id,
    ...Object.values(project.filesystem.entries)
      .map((entry) => {
        const source = entry.source;
        return `${entry.kind}:${entry.path}:${source.kind}:${source.id}`;
      })
      .sort()
  ].join("|");
}

function getSnapshotWorkspaceStructureKey(snapshot: AppSnapshot): string {
  return [
    snapshot.project.id,
    ...buildProjectWorkspaceEntries(snapshot)
      .map((entry) => {
        const source = entry.source;
        return `${entry.kind}:${entry.path}:${source.kind}:${source.id}`;
      })
      .sort()
  ].join("|");
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

function isFigureWorkspacePath(path: string | null): boolean {
  const normalizedPath = normalizeWorkspacePath(path ?? "");
  return normalizedPath === "figures" || normalizedPath.startsWith("figures/");
}

function stripFiguresWorkspaceRoot(path: string): string {
  const normalizedPath = normalizeWorkspacePath(path);

  if (normalizedPath === "figures") {
    return "";
  }

  return normalizedPath.startsWith("figures/")
    ? normalizedPath.slice("figures/".length)
    : normalizedPath;
}

function cloneWorkspaceContent(content: string | Uint8Array): string | Uint8Array {
  return typeof content === "string" ? content : new Uint8Array(content);
}

function clonePlainValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneDiagramAssetForWorkspacePath(
  diagram: DiagramAsset,
  path: string,
  now: string
): DiagramAsset {
  return {
    ...diagram,
    id: createPrefixedId("diagram"),
    name: normalizeDiagramFileName(stripFiguresWorkspaceRoot(path)),
    updatedAt: now,
    frame: diagram.frame ? { ...diagram.frame } : null,
    strokes: clonePlainValue(diagram.strokes),
    shapes: clonePlainValue(diagram.shapes)
  };
}

function cloneGraphAssetForWorkspacePath(
  graph: GraphAsset,
  path: string,
  now: string
): GraphAsset {
  return {
    ...graph,
    id: createPrefixedId("graph"),
    name: normalizeGraphFileNameForContentType(stripFiguresWorkspaceRoot(path), graph.contentType),
    updatedAt: now,
    style: clonePlainValue(graph.style),
    viewport: graph.viewport ? { ...graph.viewport } : null,
    content: new Uint8Array(graph.content)
  };
}

function collectWorkspaceNodePaths(nodes: WorkspaceTreeNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    paths.push(node.path);
    paths.push(...collectWorkspaceNodePaths(node.children));
  }

  return paths;
}

function flattenWorkspaceNodeSubtree(node: WorkspaceTreeNode): WorkspaceTreeNode[] {
  return [node, ...node.children.flatMap((child) => flattenWorkspaceNodeSubtree(child))];
}

function removeDescendantWorkspaceNodes(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  const sortedNodes = [...nodes].sort((left, right) => left.path.length - right.path.length);
  const rootNodes: WorkspaceTreeNode[] = [];

  for (const node of sortedNodes) {
    if (rootNodes.some((rootNode) => node.path.startsWith(`${rootNode.path}/`))) {
      continue;
    }

    rootNodes.push(node);
  }

  return rootNodes;
}

function createWorkspacePathSet(snapshot: AppSnapshot): Set<string> {
  return new Set(
    collectWorkspaceNodePaths(buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot)))
  );
}

function createWorkspaceCopyPath(
  requestedPath: string,
  existingPaths: Set<string>,
  isFolder: boolean
): string {
  const normalizedPath = normalizeWorkspacePath(requestedPath);

  if (!existingPaths.has(normalizedPath)) {
    return normalizedPath;
  }

  const parentPath = getWorkspaceParentPath(normalizedPath);
  const baseName = getWorkspaceBaseName(normalizedPath);
  const extensionMatch = isFolder ? null : /\.([^.]+)$/i.exec(baseName);
  const extension = extensionMatch ? `.${extensionMatch[1]}` : "";
  const stem = extension ? baseName.slice(0, -extension.length) : baseName;
  let copyIndex = 1;

  while (true) {
    const copySuffix = copyIndex === 1 ? " copy" : ` copy ${copyIndex}`;
    const candidate = joinWorkspacePath(parentPath, `${stem}${copySuffix}${extension}`);

    if (!existingPaths.has(candidate)) {
      return candidate;
    }

    copyIndex += 1;
  }
}

function isWorkspaceNodeCopyable(node: WorkspaceTreeNode): boolean {
  return (
    node.source.kind === "document" ||
    node.source.kind === "diagram" ||
    node.source.kind === "graph" ||
    node.source.kind === "folder"
  );
}

function getWorkspaceNodeCopyDomain(node: WorkspaceTreeNode): "regular" | "figure" | null {
  if (!isWorkspaceNodeCopyable(node)) {
    return null;
  }

  return isFigureWorkspacePath(node.path) ? "figure" : "regular";
}

function getWorkspaceClipboardDomain(nodes: WorkspaceTreeNode[]): "regular" | "figure" | null {
  let domain: "regular" | "figure" | null = null;

  for (const node of nodes) {
    const nodeDomain = getWorkspaceNodeCopyDomain(node);

    if (!nodeDomain) {
      return null;
    }

    if (!domain) {
      domain = nodeDomain;
      continue;
    }

    if (domain !== nodeDomain) {
      return null;
    }
  }

  return domain;
}

function normalizeWorkspacePasteDestination(
  domain: "regular" | "figure",
  destinationFolderPath: string | null
): { destinationFolderPath: string | null; error: string | null } {
  const normalizedDestination = normalizeWorkspacePath(destinationFolderPath ?? "");

  if (domain === "figure") {
    return {
      destinationFolderPath:
        normalizedDestination && isFigureWorkspacePath(normalizedDestination)
          ? normalizedDestination
          : "figures",
      error: null
    };
  }

  if (normalizedDestination && isFigureWorkspacePath(normalizedDestination)) {
    return {
      destinationFolderPath: null,
      error: "Documents cannot be pasted inside figures."
    };
  }

  return {
    destinationFolderPath: normalizedDestination || null,
    error: null
  };
}

function copyWorkspaceNodesToSnapshot(
  snapshot: AppSnapshot,
  nodes: WorkspaceTreeNode[],
  destinationFolderPath: string | null
): { snapshot: AppSnapshot; copiedPaths: string[] } {
  const rootNodes = removeDescendantWorkspaceNodes(nodes).filter(isWorkspaceNodeCopyable);

  if (rootNodes.length === 0) {
    return { snapshot, copiedPaths: [] };
  }

  const now = new Date().toISOString();
  const existingPaths = createWorkspacePathSet(snapshot);
  const copiedPaths: string[] = [];
  const copiedRootPaths: string[] = [];
  let nextDocuments = [...snapshot.project.documents];
  let nextFolders = [...snapshot.project.folders];
  let nextFigures = [...snapshot.project.figures];
  let nextGraphs = [...snapshot.project.graphs];
  let activeDocumentId = snapshot.project.activeDocumentId;

  for (const rootNode of rootNodes) {
    const domain = getWorkspaceNodeCopyDomain(rootNode);
    const requestedRootPath = joinWorkspacePath(
      destinationFolderPath,
      getWorkspaceBaseName(rootNode.path)
    );
    const rootTargetPath = createWorkspaceCopyPath(
      requestedRootPath,
      existingPaths,
      rootNode.kind === "folder"
    );
    let didCopyRoot = false;

    existingPaths.add(rootTargetPath);

    for (const sourceNode of flattenWorkspaceNodeSubtree(rootNode)) {
      const relativePath =
        sourceNode.path === rootNode.path
          ? ""
          : sourceNode.path.slice(rootNode.path.length + 1);
      const targetPath = relativePath
        ? joinWorkspacePath(rootTargetPath, relativePath)
        : rootTargetPath;

      if (sourceNode.kind === "folder") {
        if (domain === "regular" && sourceNode.source.kind === "folder") {
          nextFolders = [
            ...nextFolders,
            {
              id: createPrefixedId("folder"),
              name: targetPath,
              updatedAt: now
            }
          ];
          didCopyRoot = didCopyRoot || sourceNode.path === rootNode.path;
        }

        existingPaths.add(targetPath);
        continue;
      }

      if (sourceNode.source.kind === "document" && domain === "regular") {
        const sourceDocument = snapshot.project.documents.find(
          (document) => document.id === sourceNode.source.id
        );

        if (!sourceDocument) {
          continue;
        }

        const copiedDocument = {
          ...sourceDocument,
          id: createPrefixedId("doc"),
          name: targetPath,
          content: cloneWorkspaceContent(sourceDocument.content),
          updatedAt: now
        };

        nextDocuments = [...nextDocuments, copiedDocument];
        activeDocumentId = copiedDocument.id;
        copiedPaths.push(targetPath);
        didCopyRoot = didCopyRoot || sourceNode.path === rootNode.path;
        existingPaths.add(targetPath);
        continue;
      }

      if (sourceNode.source.kind === "diagram" && domain === "figure") {
        const sourceDiagram = snapshot.project.figures.find(
          (figure) => figure.id === sourceNode.source.id
        );

        if (!sourceDiagram) {
          continue;
        }

        nextFigures = [
          ...nextFigures,
          cloneDiagramAssetForWorkspacePath(sourceDiagram, targetPath, now)
        ];
        copiedPaths.push(targetPath);
        didCopyRoot = didCopyRoot || sourceNode.path === rootNode.path;
        existingPaths.add(targetPath);
        continue;
      }

      if (sourceNode.source.kind === "graph" && domain === "figure") {
        const sourceGraph = snapshot.project.graphs.find(
          (graph) => graph.id === sourceNode.source.id
        );

        if (!sourceGraph) {
          continue;
        }

        nextGraphs = [
          ...nextGraphs,
          cloneGraphAssetForWorkspacePath(sourceGraph, targetPath, now)
        ];
        copiedPaths.push(targetPath);
        didCopyRoot = didCopyRoot || sourceNode.path === rootNode.path;
        existingPaths.add(targetPath);
      }
    }

    if (didCopyRoot) {
      copiedRootPaths.push(rootTargetPath);
    }
  }

  if (copiedPaths.length === 0 && copiedRootPaths.length === 0) {
    return { snapshot, copiedPaths: [] };
  }

  return {
    snapshot: {
      ...snapshot,
      project: {
        ...snapshot.project,
        documents: nextDocuments,
        folders: nextFolders,
        figures: nextFigures,
        graphs: nextGraphs,
        activeDocumentId,
        updatedAt: now
      }
    },
    copiedPaths: copiedRootPaths.length > 0 ? copiedRootPaths : copiedPaths
  };
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function resolveZoomPaneTarget(target: EventTarget | null): ZoomPaneTarget | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const pane = target.closest<HTMLElement>("[data-zoom-pane]");
  const zoomPane = pane?.dataset.zoomPane;
  return zoomPane === "sidebar" || zoomPane === "source" || zoomPane === "preview"
    ? zoomPane
    : null;
}

function getKeyboardZoomDirection(
  event: KeyboardEvent,
  keybindings: KeybindingMap,
  apple: boolean
): -1 | 1 | null {
  if (matchesKeybinding(event, keybindings.increaseActivePaneZoom, apple)) {
    return 1;
  }

  if (matchesKeybinding(event, keybindings.decreaseActivePaneZoom, apple)) {
    return -1;
  }

  return null;
}

function getVimPaneFocusDirection(
  event: KeyboardEvent,
  keybindings: KeybindingMap,
  apple: boolean
): -1 | 1 | null {
  if (matchesKeybinding(event, keybindings.focusSourcePane, apple)) {
    return -1;
  }

  if (matchesKeybinding(event, keybindings.focusPreviewPane, apple)) {
    return 1;
  }

  return null;
}

function getKeybindingDefinition(commandId: KeybindingCommandId) {
  return KEYBINDING_DEFINITIONS.find((definition) => definition.id === commandId) ?? null;
}

function getKeybindingLabel(commandId: KeybindingCommandId): string {
  return getKeybindingDefinition(commandId)?.label ?? commandId;
}

function getKeybindingConflictsForBinding(
  keybindings: KeybindingMap,
  commandId: KeybindingCommandId,
  binding: string
): KeybindingCommandId[] {
  if (!binding) {
    return [];
  }

  return KEYBINDING_DEFINITIONS
    .filter((definition) => definition.id !== commandId && keybindings[definition.id] === binding)
    .map((definition) => definition.id);
}

function getPreviewScrollContainer(previewPane: HTMLElement | null): HTMLElement | null {
  return (
    previewPane?.querySelector<HTMLElement>(".preview-document") ??
    previewPane?.querySelector<HTMLElement>(".preview-file-preview") ??
    null
  );
}

function getPreviewPageTops(scroller: HTMLElement): number[] {
  const scrollerRect = scroller.getBoundingClientRect();
  const pages = Array.from(
    scroller.querySelectorAll<HTMLElement>(".typst-page.canvas, .pdf-page.canvas")
  );

  return pages
    .map((page) => scroller.scrollTop + page.getBoundingClientRect().top - scrollerRect.top)
    .filter((top) => Number.isFinite(top))
    .sort((left, right) => left - right);
}

function scrollPreviewToAdjacentPage(scroller: HTMLElement, direction: -1 | 1): boolean {
  const pageTops = getPreviewPageTops(scroller);
  if (pageTops.length === 0) {
    return false;
  }

  const currentTop = scroller.scrollTop;
  const threshold = 2;
  const targetTop = direction > 0
    ? pageTops.find((top) => top > currentTop + threshold)
    : findPreviousPreviewPageTop(pageTops, currentTop - threshold);

  if (targetTop === undefined) {
    return true;
  }

  scroller.scrollTo({ top: Math.max(0, targetTop), behavior: "auto" });
  return true;
}

function findPreviousPreviewPageTop(pageTops: number[], beforeTop: number): number | undefined {
  for (let index = pageTops.length - 1; index >= 0; index -= 1) {
    const top = pageTops[index];
    if (top !== undefined && top < beforeTop) {
      return top;
    }
  }

  return undefined;
}

function getKeybindingSequenceParts(binding: string): string[] {
  return binding.trim().split(/\s+/).filter(Boolean);
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
  const [storedSettingsMenu] = useState(readStoredSettingsMenuState);
  const [storedLeftPane] = useState(readStoredLeftPaneState);
  const menuStripRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const settingsBodyRef = useRef<HTMLDivElement | null>(null);
  const settingsScrollByTabRef = useRef<SettingsScrollPositions>(storedSettingsMenu.scrollByTab);
  const settingsTabRef = useRef<SettingsTab>(storedSettingsMenu.tab);
  const settingsScrollRestoreFrameRef = useRef<number | null>(null);
  const leftPaneScrollByPaneRef = useRef<Record<string, number>>(storedLeftPane.scrollByPane);
  const leftPaneScrollRestoreFrameRef = useRef<number | null>(null);
  const editorRef = useRef<TypstEditorHandle | null>(null);
  const previewPaneRef = useRef<HTMLElement | null>(null);
  const sidebarPaneRef = useRef<HTMLElement | null>(null);
  const shouldFocusEditorAfterVimToggleRef = useRef(false);
  const sourceTabsInitializedProjectRef = useRef<string | null>(null);
  const previewTabsInitializedProjectRef = useRef<string | null>(null);
  const workspaceTabDragRef = useRef<{ kind: WorkspaceTabKind; path: string } | null>(null);
  const activeSourceTabRef = useRef<HTMLDivElement | null>(null);
  const activePreviewTabRef = useRef<HTMLDivElement | null>(null);
  const themeImportInputRef = useRef<HTMLInputElement | null>(null);
  const snippetImportInputRef = useRef<HTMLInputElement | null>(null);
  const projectImportInputRef = useRef<HTMLInputElement | null>(null);
  const documentUploadInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filesSectionRef = useRef<HTMLElement | null>(null);
  const lastZoomPaneTargetRef = useRef<ZoomPaneTarget>("source");
  const openMenuTimerRef = useRef<number | null>(null);
  const closeMenuTimerRef = useRef<number | null>(null);
  const compileTimerRef = useRef<number | null>(null);
  const compileFrameRef = useRef<number | null>(null);
  const previewPendingGTimerRef = useRef<number | null>(null);
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const panelResizeRef = useRef<{
    edge: "sidebar" | "preview" | ZenResizeEdge;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const preZenLayoutRef = useRef<{
    workspaceMode: Exclude<WorkspaceMode, "zen">;
    isSourcePaneHidden: boolean;
  } | null>(null);
  const compileRequestRef = useRef(0);
  const pendingSourceRef = useRef("");
  const pendingSourcePathRef = useRef("main.typ");
  const activeSourcePathRef = useRef("main.typ");
  const activeSourceLanguageRef = useRef<SourceLanguage>("typst");
  const isActiveSourceCompilableRef = useRef(true);
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
  const handleFormatDocumentRef = useRef<() => void>(() => {});
  const previewDownloadMenuRef = useRef<HTMLDivElement | null>(null);
  const activateWorkspaceTabRef = useRef<(direction: -1 | 1) => boolean>(() => false);
  const compileInFlightRef = useRef(false);
  const compileInFlightLanguageRef = useRef<SourceLanguage | null>(null);
  const compileInFlightSourceRef = useRef("");
  const compileInFlightSourcePathRef = useRef("");
  const compileInFlightDiagramRevisionRef = useRef("");
  const compileInFlightGraphRevisionRef = useRef("");
  const pendingCompileTriggerRef = useRef<BuildLogTrigger>("auto");
  const isMountedRef = useRef(true);
  const [activeMenu, setActiveMenu] = useState<MenuLabel | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(
    () => storedLeftPane.activeSidebarTool === "settings"
  );
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(storedSettingsMenu.tab);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [isMobileSettingsNavOpen, setIsMobileSettingsNavOpen] = useState(false);
  const [keybindingSearchQuery, setKeybindingSearchQuery] = useState("");
  const [previewDownloadMode, setPreviewDownloadMode] = useState<PreviewDownloadMode>("output");
  const [isPreviewDownloadMenuOpen, setIsPreviewDownloadMenuOpen] = useState(false);
  const [recentWorkspaceState, setRecentWorkspaceState] = useState(readRecentWorkspaceState);
  const [activeSidebarTool, setActiveSidebarTool] = useState<SidebarTool>(
    storedLeftPane.activeSidebarTool
  );
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
  const [openToolbarMenu, setOpenToolbarMenu] = useState<"matrix" | "table" | "symbols" | null>(null);
  const [themeImportFeedback, setThemeImportFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [isPreviewPopupOpen, setIsPreviewPopupOpen] = useState(false);
  const [diagramPaneMode, setDiagramPaneMode] = useState<DiagramPaneMode>("sidebar");
  const [graphPaneMode, setGraphPaneMode] = useState<GraphPaneMode>("sidebar");
  const [gitMergePaneMode, setGitMergePaneMode] = useState<GitMergePaneMode>("sidebar");
  const [isPreviewDebugVisible, setIsPreviewDebugVisible] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isPaperView, setIsPaperView] = useState(false);
  const [recordingKeybindingId, setRecordingKeybindingId] =
    useState<KeybindingCommandId | null>(null);
  const [pendingKeybindingConflict, setPendingKeybindingConflict] =
    useState<PendingKeybindingConflict | null>(null);
  const [diagramInkColor, setDiagramInkColor] = useState("#000000");
  const [diagramFillColor, setDiagramFillColor] = useState("transparent");
  const [diagramStrokeStyle, setDiagramStrokeStyle] = useState<DiagramStrokeStyle>("solid");
  const [diagramStrokeWidth, setDiagramStrokeWidth] = useState(2.5);
  const [diagramStartMarker, setDiagramStartMarker] = useState<DiagramEndpoint>("none");
  const [diagramEndMarker, setDiagramEndMarker] = useState<DiagramEndpoint>("none");
  const [workspaceOpenFoldersByProject, setWorkspaceOpenFoldersByProject] =
    useState<WorkspaceOpenFolderStorage>(() => readStoredWorkspaceOpenFolders());
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([]);
  const [isTrashViewOpen, setIsTrashViewOpen] = useState(storedLeftPane.isTrashViewOpen);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null);
  const [selectedWorkspacePaths, setSelectedWorkspacePaths] = useState<string[]>([]);
  const [sourceTabPaths, setSourceTabPaths] = useState<string[]>([]);
  const [transientSourceTabPath, setTransientSourceTabPath] = useState<string | null>(null);
  const [previewTabPaths, setPreviewTabPaths] = useState<string[]>([]);
  const [activePreviewPath, setActivePreviewPath] = useState<string | null>(null);
  const [draggingWorkspaceTab, setDraggingWorkspaceTab] =
    useState<{ kind: WorkspaceTabKind; path: string } | null>(null);
  const [workspaceTabDropTarget, setWorkspaceTabDropTarget] =
    useState<{ kind: WorkspaceTabKind; path: string; side: "before" | "after" } | null>(null);
  const [workspaceSelectionAnchorPath, setWorkspaceSelectionAnchorPath] = useState<string | null>(null);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<WorkspaceContextMenuState | null>(null);
  const [renamingWorkspacePath, setRenamingWorkspacePath] = useState<string | null>(null);
  const [workspaceRenameDraft, setWorkspaceRenameDraft] = useState("");
  const [workspaceClipboard, setWorkspaceClipboard] = useState<WorkspaceClipboardState | null>(null);
  const [pendingWorkspaceDeletePath, setPendingWorkspaceDeletePath] = useState<string | null>(null);
  const [draggedWorkspacePath, setDraggedWorkspacePath] = useState<string | null>(null);
  const [workspaceDropTargetPath, setWorkspaceDropTargetPath] = useState<string | null>(null);
  const [hoveredSourceSymbol, setHoveredSourceSymbol] = useState<SourceSymbolTooltipState | null>(
    null
  );
  const [collapsedOutlineEntries, setCollapsedOutlineEntries] = useState<Record<string, boolean>>(
    {}
  );
  const [currentEditorLineNumber, setCurrentEditorLineNumber] = useState(1);
  const [outlineSourceContent, setOutlineSourceContent] = useState("");
  const [previewZoom, setPreviewZoom] = useState<PreviewZoomState>(DEFAULT_ZOOM);
  const [activeSnippetLanguage, setActiveSnippetLanguage] =
    useState<SnippetLanguage>("typst");
  const [customSnippets, setCustomSnippets] =
    useState<SnippetCollections>(() => createEmptySnippetCollections());
  const [snippetImportText, setSnippetImportText] = useState(
    JSON.stringify(SNIPPET_IMPORT_TEMPLATE, null, 2)
  );
  const [snippetImportFeedback, setSnippetImportFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [packageSettingsScope, setPackageSettingsScope] =
    useState<PackageSettingsScope>("typst");
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
  const [latexPackageCatalog, setLatexPackageCatalog] = useState<LatexPackageCatalog | null>(null);
  const [latexPackageBundleEntries, setLatexPackageBundleEntries] = useState<
    LatexPackageBundleCacheEntry[]
  >([]);
  const [isLatexPackageCacheLoading, setIsLatexPackageCacheLoading] = useState(false);
  const [isLatexPackageCacheClearing, setIsLatexPackageCacheClearing] = useState(false);
  const [latexPackageFeedback, setLatexPackageFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [latexPackageSearchQuery, setLatexPackageSearchQuery] = useState("");
  const [cachedLatexPackageNames, setCachedLatexPackageNames] = useState(
    readStoredLatexPackageSelections
  );
  const [installingLatexPackageName, setInstallingLatexPackageName] = useState<string | null>(null);
  const [installingLatexBundleId, setInstallingLatexBundleId] =
    useState<LatexPackageBundleId | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("split");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => storedPanelLayout?.version === PANEL_LAYOUT_VERSION && storedPanelLayout.isSidebarCollapsed
      ? storedPanelLayout.isSidebarCollapsed
      : false
  );
  const [isSourcePaneHidden, setIsSourcePaneHidden] = useState(
    () =>
      storedPanelLayout?.version === PANEL_LAYOUT_VERSION &&
      Boolean(storedPanelLayout.isSourcePaneHidden)
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
        ? Math.max(SIDEBAR_MIN_WIDTH, storedPanelLayout.sidebarWidth)
        : SIDEBAR_DEFAULT_WIDTH
  );
  const [previewRatio, setPreviewRatio] = useState(
    () =>
      storedPanelLayout?.version === PANEL_LAYOUT_VERSION &&
      typeof storedPanelLayout.previewRatio === "number"
        ? clampPreviewRatio(storedPanelLayout.previewRatio)
        : getViewportBalancedPreviewRatio()
  );
  const [zenWidth, setZenWidth] = useState(
    () =>
      storedPanelLayout?.version === PANEL_LAYOUT_VERSION &&
      typeof storedPanelLayout.zenWidth === "number"
        ? clampZenWidth(storedPanelLayout.zenWidth)
        : ZEN_DEFAULT_WIDTH
  );
  const [zenHeight, setZenHeight] = useState(
    () =>
      storedPanelLayout?.version === PANEL_LAYOUT_VERSION &&
      typeof storedPanelLayout.zenHeight === "number"
        ? clampZenHeight(storedPanelLayout.zenHeight)
        : getDefaultZenHeight()
  );
  const [viewportWidth, setViewportWidth] = useState(getCurrentViewportWidth);
  const [viewportHeight, setViewportHeight] = useState(getCurrentViewportHeight);
  const isMobileWorkspace = isMobileWorkspaceViewport(viewportWidth);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [previewForwardSearchSource, setPreviewForwardSearchSource] = useState<SourcePosition | null>(null);
  const isMobileEditorFullscreen = isMobileWorkspace && isEditorFullscreen;
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<MobileWorkspaceTab>(
    storedLeftPane.mobileWorkspaceTab
  );
  const [compilerStatus, setCompilerStatus] = useState<CompilerStatus>({
    phase: "idle",
    mode: "worker",
    label: "Waiting to compile"
  });
  const [liveBuildOutput, setLiveBuildOutput] = useState("");
  const handleCompilerStatusChange = useCallback((status: CompilerStatus) => {
    setCompilerStatus(status);
    setLiveBuildOutput((currentOutput) => {
      const timestamp = new Date().toLocaleTimeString();
      const detail = status.detail ? ` — ${status.detail}` : "";
      const progress = status.progress ? ` (${status.progress.current}/${status.progress.total}${status.progress.label ? ` ${status.progress.label}` : ""})` : "";
      const nextLine = `[${timestamp}] ${status.label}${detail}${progress}`;
      return currentOutput ? `${currentOutput}
${nextLine}` : nextLine;
    });
  }, []);
  const symbolHoverTimerRef = useRef<number | null>(null);
  const workspaceHoverExpandTimerRef = useRef<number | null>(null);
  const symbolHoverItemRef = useRef<SourceSymbolItem | null>(null);
  const symbolHoverPointRef = useRef({ x: 0, y: 0 });
  const compiler = useMemo(
    () =>
      createTypstCompiler({
        onStatusChange: handleCompilerStatusChange
      }),
    [handleCompilerStatusChange]
  );
  const defaultSnapshotRef = useRef<AppSnapshot | null>(null);
  if (defaultSnapshotRef.current === null) {
    defaultSnapshotRef.current = createDefaultSnapshot();
  }
  const [rawSnapshot, setRawSnapshot] = useState<AppSnapshot>(defaultSnapshotRef.current);
  const [projectStorage, setProjectStorage] = useState<TyprProjectStorageState>(() =>
    createProjectStorageFromSnapshot(defaultSnapshotRef.current as AppSnapshot)
  );
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [projectDragOverId, setProjectDragOverId] = useState<string | null>(null);
  const snapshot = rawSnapshot;
  const selectedProjectRepository = useMemo(
    () => getSelectedProjectRepository(projectStorage),
    [projectStorage]
  );
  const selectedProjectRepositoryRef = useRef<TyprProjectRepository | null>(selectedProjectRepository);
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
  const [hasHydrationError, setHasHydrationError] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [buildLogEntries, setBuildLogEntries] = useState<BuildLogEntry[]>([]);
  const [buildLogFilter, setBuildLogFilter] = useState<BuildLogFilter>("all");
  const [buildLogSearchQuery, setBuildLogSearchQuery] = useState("");
  const [buildLogFeedback, setBuildLogFeedback] = useState("");
  const [hideRepeatedBuildWarnings, setHideRepeatedBuildWarnings] = useState(true);
  const [isBuildLogHydrated, setIsBuildLogHydrated] = useState(false);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<
    Extract<CompileResult, { ok: true }> | null
  >(null);
  const [compilePreviewsByPath, setCompilePreviewsByPath] = useState<Record<string, CompilePreviewState>>({});
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
  const [gitHubClone, setGitHubClone] = useState<GitHubCloneState>(
    createInitialGitHubCloneState
  );
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
  const formatDocumentShortcutLabel = formatKeybinding(
    keybindings.formatDocument,
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

  const saveCurrentSettingsScrollPosition = useCallback(() => {
    const element = settingsBodyRef.current;

    if (!element) {
      return;
    }

    const tab = settingsTabRef.current;
    settingsScrollByTabRef.current = {
      ...settingsScrollByTabRef.current,
      [tab]: Math.max(0, Math.round(element.scrollTop))
    };
    writeStoredSettingsMenuState(tab, settingsScrollByTabRef.current);
  }, []);

  const handleSettingsBodyScroll = useCallback(() => {
    saveCurrentSettingsScrollPosition();
  }, [saveCurrentSettingsScrollPosition]);

  const handleSettingsTabChange = useCallback(
    (tab: SettingsTab) => {
      if (settingsTabRef.current === tab) {
        return;
      }

      saveCurrentSettingsScrollPosition();
      setSettingsTab(tab);
    },
    [saveCurrentSettingsScrollPosition]
  );

  const handleSettingsTabSelect = useCallback(
    (tab: SettingsTab) => {
      handleSettingsTabChange(tab);
      setIsMobileSettingsNavOpen(false);
    },
    [handleSettingsTabChange]
  );

  const settingsSearchMatchingTabs = useMemo(() => {
    const query = settingsSearchQuery.trim().toLowerCase();

    if (!query) {
      return SETTINGS_TABS;
    }

    return SETTINGS_TABS.filter((tab) =>
      SETTINGS_SEARCH_INDEX[tab].some((term) => term.toLowerCase().includes(query))
    );
  }, [settingsSearchQuery]);

  useEffect(() => {
    const query = settingsSearchQuery.trim();

    if (!isSettingsOpen || !query || settingsSearchMatchingTabs.includes(settingsTab)) {
      return;
    }

    const [firstMatch] = settingsSearchMatchingTabs;
    if (firstMatch) {
      handleSettingsTabChange(firstMatch);
    }
  }, [
    handleSettingsTabChange,
    isSettingsOpen,
    settingsSearchMatchingTabs,
    settingsSearchQuery,
    settingsTab
  ]);

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
    (
      commandId: KeybindingCommandId,
      binding: string,
      options: { clearConflicts?: boolean } = {}
    ) => {
      setSnapshot((currentSnapshot) => {
        const nextKeybindings = { ...currentSnapshot.preferences.keybindings };

        if (options.clearConflicts) {
          for (const definition of KEYBINDING_DEFINITIONS) {
            if (definition.id !== commandId && nextKeybindings[definition.id] === binding) {
              nextKeybindings[definition.id] = "";
            }
          }
        }

        nextKeybindings[commandId] = binding;
        return updateKeybindingsPreference(currentSnapshot, nextKeybindings);
      });
      setPendingKeybindingConflict(null);
    },
    []
  );

  const handleRecordedKeybinding = useCallback(
    (commandId: KeybindingCommandId, binding: string) => {
      const conflictIds = getKeybindingConflictsForBinding(keybindings, commandId, binding);

      if (conflictIds.length > 0) {
        setPendingKeybindingConflict({ commandId, binding, conflictIds });
        return;
      }

      handleKeybindingChange(commandId, binding);
    },
    [handleKeybindingChange, keybindings]
  );

  const handleResolvePendingKeybindingConflict = useCallback(() => {
    if (!pendingKeybindingConflict) {
      return;
    }

    const nextRecordingId = pendingKeybindingConflict.conflictIds[0] ?? null;
    handleKeybindingChange(
      pendingKeybindingConflict.commandId,
      pendingKeybindingConflict.binding,
      { clearConflicts: true }
    );
    setRecordingKeybindingId(nextRecordingId);
  }, [handleKeybindingChange, pendingKeybindingConflict]);

  const handleWhackKeybindingConflicts = useCallback(
    (commandId: KeybindingCommandId, binding: string) => {
      const conflictIds = getKeybindingConflictsForBinding(keybindings, commandId, binding);
      handleKeybindingChange(commandId, binding, { clearConflicts: true });
      setRecordingKeybindingId(conflictIds[0] ?? null);
    },
    [handleKeybindingChange, keybindings]
  );

  const handleCancelPendingKeybindingConflict = useCallback(() => {
    setPendingKeybindingConflict(null);
  }, []);

  const handleKeybindingReset = useCallback((commandId: KeybindingCommandId) => {
    setSnapshot((currentSnapshot) =>
      updateKeybindingsPreference(currentSnapshot, {
        ...currentSnapshot.preferences.keybindings,
        [commandId]: DEFAULT_KEYBINDINGS[commandId]
      })
    );
    setRecordingKeybindingId(null);
    setPendingKeybindingConflict(null);
  }, []);

  const handleResetAllKeybindings = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateKeybindingsPreference(currentSnapshot, DEFAULT_KEYBINDINGS)
    );
    setRecordingKeybindingId(null);
    setPendingKeybindingConflict(null);
  }, []);

  useEffect(() => {
    settingsTabRef.current = settingsTab;
    writeStoredSettingsMenuState(settingsTab, settingsScrollByTabRef.current);
  }, [settingsTab]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    if (settingsScrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(settingsScrollRestoreFrameRef.current);
    }

    settingsScrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
      const element = settingsBodyRef.current;

      if (element) {
        element.scrollTop = settingsScrollByTabRef.current[settingsTab] ?? 0;
      }

      settingsScrollRestoreFrameRef.current = null;
    });

    return () => {
      if (settingsScrollRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(settingsScrollRestoreFrameRef.current);
        settingsScrollRestoreFrameRef.current = null;
      }
    };
  }, [isSettingsOpen, settingsTab]);

  useEffect(() => {
    if (!isSettingsOpen || settingsTab !== "keybindings" || !recordingKeybindingId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-keybinding-recorder="${recordingKeybindingId}"]`
        )
        ?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isSettingsOpen, recordingKeybindingId, settingsTab]);

  const setEditorFontSize = useCallback((editorFontSize: number) => {
    setSnapshot((currentSnapshot) =>
      updateEditorFontSizePreference(currentSnapshot, editorFontSize)
    );
  }, []);

  const adjustZoomPaneTarget = useCallback((pane: ZoomPaneTarget, direction: -1 | 1) => {
    if (pane === "preview") {
      setPreviewZoom((currentZoom) => nextZoomStep(currentZoom, direction));
      return;
    }

    if (pane === "sidebar") {
      setSnapshot((currentSnapshot) =>
        updateSidebarFontSizePreference(
          currentSnapshot,
          currentSnapshot.preferences.sidebarFontSize + direction
        )
      );
      return;
    }

    setSnapshot((currentSnapshot) =>
      updateEditorFontSizePreference(
        currentSnapshot,
        currentSnapshot.preferences.editorFontSize + direction
      )
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
  const handleLatexMathPreviewToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateLatexMathPreviewPreference(
        currentSnapshot,
        !currentSnapshot.preferences.latexMathPreview
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
  const handleLintOnEditToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateEditorToolingPreference(currentSnapshot, {
        ...currentSnapshot.preferences.editorTooling,
        lintOnEdit: !currentSnapshot.preferences.editorTooling.lintOnEdit
      })
    );
  }, []);
  const handleFormatOnCompileToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateEditorToolingPreference(currentSnapshot, {
        ...currentSnapshot.preferences.editorTooling,
        formatOnCompile: !currentSnapshot.preferences.editorTooling.formatOnCompile
      })
    );
  }, []);
  const handleMobileKeyboardEnabledToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateMobileKeyboardPreference(currentSnapshot, {
        ...currentSnapshot.preferences.mobileKeyboard,
        enabled: !currentSnapshot.preferences.mobileKeyboard.enabled
      })
    );
  }, []);

  const handleMobileKeyboardLabelsChange = useCallback((
    language: MobileKeyboardLanguage,
    value: string
  ) => {
    setSnapshot((currentSnapshot) =>
      updateMobileKeyboardPreference(currentSnapshot, {
        ...currentSnapshot.preferences.mobileKeyboard,
        keys: {
          ...currentSnapshot.preferences.mobileKeyboard.keys,
          [language]: parseMobileKeyboardLabels(value)
        }
      })
    );
  }, []);
  const handleFormatterChange = useCallback((language: EditorToolLanguage, formatter: EditorFormatterId) => {
    setSnapshot((currentSnapshot) =>
      updateEditorToolingPreference(currentSnapshot, {
        ...currentSnapshot.preferences.editorTooling,
        languages: {
          ...currentSnapshot.preferences.editorTooling.languages,
          [language]: {
            ...currentSnapshot.preferences.editorTooling.languages[language],
            formatter
          }
        }
      })
    );
  }, []);
  const handleLinterChange = useCallback((language: EditorToolLanguage, linter: EditorLinterId) => {
    setSnapshot((currentSnapshot) =>
      updateEditorToolingPreference(currentSnapshot, {
        ...currentSnapshot.preferences.editorTooling,
        languages: {
          ...currentSnapshot.preferences.editorTooling.languages,
          [language]: {
            ...currentSnapshot.preferences.editorTooling.languages[language],
            linter
          }
        }
      })
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
  const workspaceFolderStorageKey = `${selectedProjectRepository?.id ?? snapshot.project.id}:${
    isTrashViewOpen ? "trash" : "files"
  }`;
  const workspaceFolderPaths = useMemo(
    () => collectWorkspaceFolderPaths(visibleWorkspaceTree),
    [visibleWorkspaceTree]
  );
  const openFileFolders = useMemo(() => {
    const storedPaths = workspaceOpenFoldersByProject[workspaceFolderStorageKey];
    return new Set(normalizeWorkspaceOpenFolderPaths(storedPaths ?? [WORKSPACE_ROOT_PATH]));
  }, [workspaceFolderStorageKey, workspaceOpenFoldersByProject]);
  const collapsedFileFolders = useMemo(() => {
    const nextCollapsedFolders: Record<string, boolean> = {
      [WORKSPACE_ROOT_PATH]: !openFileFolders.has(WORKSPACE_ROOT_PATH)
    };

    for (const path of workspaceFolderPaths) {
      nextCollapsedFolders[path] = !openFileFolders.has(path);
    }

    return nextCollapsedFolders;
  }, [openFileFolders, workspaceFolderPaths]);
  const visibleWorkspaceNodes = useMemo(
    () => flattenVisibleWorkspaceNodes(visibleWorkspaceTree, collapsedFileFolders),
    [collapsedFileFolders, visibleWorkspaceTree]
  );
  const updateWorkspaceOpenFolders = useCallback(
    (updater: (currentPaths: Set<string>) => Set<string>) => {
      setWorkspaceOpenFoldersByProject((current) => {
        const currentPaths = normalizeWorkspaceOpenFolderPaths(
          current[workspaceFolderStorageKey] ?? [WORKSPACE_ROOT_PATH]
        );
        const nextPaths = normalizeWorkspaceOpenFolderPaths(Array.from(updater(new Set(currentPaths))));

        if (arePathListsEqual(currentPaths, nextPaths)) {
          return current;
        }

        return {
          ...current,
          [workspaceFolderStorageKey]: nextPaths
        };
      });
    },
    [workspaceFolderStorageKey]
  );
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
  const workspaceTreeCursorPath = useMemo(() => {
    const candidatePath =
      workspaceSelectionAnchorPath ??
      selectedWorkspacePaths[0] ??
      normalizedSelectedWorkspacePath;
    const normalizedPath = candidatePath ? normalizeWorkspacePath(candidatePath) : null;

    return normalizedPath && findWorkspaceNodeByPath(visibleWorkspaceTree, normalizedPath)
      ? normalizedPath
      : null;
  }, [
    normalizedSelectedWorkspacePath,
    selectedWorkspacePaths,
    visibleWorkspaceTree,
    workspaceSelectionAnchorPath
  ]);
  useEffect(() => {
    if (activeSidebarTool !== "files" || !workspaceTreeCursorPath) {
      return;
    }

    const selectedRow = Array.from(
      sidebarPaneRef.current?.querySelectorAll<HTMLElement>("[data-workspace-path]") ?? []
    ).find((row) => row.dataset.workspacePath === workspaceTreeCursorPath);

    selectedRow?.scrollIntoView({ block: "nearest" });
  }, [activeSidebarTool, workspaceTreeCursorPath]);
  const sourceWorkspaceNode = isTrashViewOpen ? null : selectedWorkspaceNode;
  const workspaceStructureKey = selectedProjectRepository
    ? getProjectWorkspaceStructureKey(selectedProjectRepository)
    : getSnapshotWorkspaceStructureKey(snapshot);
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
  const workspacePreviewFileCacheRef = useRef(new Map<string, WorkspacePreviewFile>());
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setOutlineSourceContent(activeDocumentTextContent);
    }, OUTLINE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [activeDocumentTextContent]);
  const [selectedWorkspacePreview, setSelectedWorkspacePreview] = useState<WorkspacePreviewFile | null>(null);
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
  const activeSourcePath = sourceWorkspaceNode?.path ?? activeDocument.name;
  const activeSourceLanguage = getSourceLanguage(activeSourcePath);
  const activeSourceToolLanguage = getEditorToolLanguage(activeSourceLanguage);
  const isActiveSourceFormatterEnabled =
    isSourceFileEditable &&
    !isInspectingGraphSource &&
    activeSourceToolLanguage !== null &&
    snapshot.preferences.editorTooling.languages[activeSourceToolLanguage].formatter !== "disabled";
  const isActiveSourceCompilable = isCompilableSourceFile(activeSourcePath);
  const showSourceCompileButton =
    isSourceFileEditable &&
    isActiveSourceCompilable &&
    activeSourceLanguage !== "markdown";
  const normalizedActiveSourcePath = normalizeWorkspacePath(activeSourcePath);
  const isDocumentSourceTab =
    sourceWorkspaceNode === null || sourceWorkspaceNode.source.kind === "document";
  const canPreviewActiveSource =
    isActiveSourceCompilable || activeSourceLanguage === "markdown";
  const activeProjectTabKey = selectedProjectRepository?.id ?? snapshot.project.id;
  const buildLogStorageKey = `${BUILD_LOG_STORAGE_KEY}:${activeProjectTabKey}`;

  useEffect(() => {
    setIsBuildLogHydrated(false);
    setBuildLogEntries(loadPersistedBuildLogEntries(buildLogStorageKey));
    setIsBuildLogHydrated(true);
  }, [buildLogStorageKey]);

  useEffect(() => {
    if (!isBuildLogHydrated) {
      return;
    }

    persistBuildLogEntries(buildLogStorageKey, buildLogEntries);
  }, [buildLogEntries, buildLogStorageKey, isBuildLogHydrated]);
  const workspaceFilePathSet = useMemo(
    () => new Set(collectWorkspaceFilePaths(workspaceTree)),
    [workspaceTree]
  );
  const getExistingLatexPdfPreviewPath = useCallback(
    (sourcePath: string) => {
      if (!selectedProjectRepository || getSourceLanguage(sourcePath) !== "latex") {
        return null;
      }

      return getExistingLatexPdfPath(selectedProjectRepository, sourcePath);
    },
    [selectedProjectRepository]
  );
  useEffect(() => {
    writeRecentWorkspaceState(recentWorkspaceState.projects, recentWorkspaceState.files);
  }, [recentWorkspaceState]);
  useEffect(() => {
    if (!isHydrated || !selectedProjectRepository) {
      return;
    }

    setRecentWorkspaceState((current) => ({
      ...current,
      projects: touchRecentProject(current.projects, selectedProjectRepository)
    }));
  }, [
    isHydrated,
    selectedProjectRepository?.displayName,
    selectedProjectRepository?.id
  ]);
  useEffect(() => {
    if (
      !isHydrated ||
      !selectedProjectRepository ||
      !normalizedActiveSourcePath ||
      !workspaceFilePathSet.has(normalizedActiveSourcePath)
    ) {
      return;
    }

    setRecentWorkspaceState((current) => ({
      ...current,
      files: touchRecentFile(current.files, selectedProjectRepository, normalizedActiveSourcePath)
    }));
  }, [
    isHydrated,
    normalizedActiveSourcePath,
    selectedProjectRepository?.displayName,
    selectedProjectRepository?.id,
    workspaceFilePathSet
  ]);
  const activePreviewWorkspaceNode = useMemo(
    () =>
      activePreviewPath
        ? findWorkspaceNodeByPath(workspaceTree, activePreviewPath)
        : null,
    [activePreviewPath, workspaceTree]
  );
  const activePreviewTextContent =
    activePreviewPath && activePreviewPath === normalizedActiveSourcePath
      ? sourceEditorValue
      : typeof activePreviewWorkspaceNode?.content === "string"
        ? activePreviewWorkspaceNode.content
        : "";
  const activePreviewCompileSourcePath = activePreviewPath
    ? resolveLatexSourcePathForPdfPreview(
        activePreviewPath,
        selectedProjectRepository,
        activeSourcePathRef.current
      ) ?? activePreviewPath
    : null;
  const activePreviewCompileState = activePreviewCompileSourcePath
    ? compilePreviewsByPath[activePreviewCompileSourcePath] ?? null
    : null;
  const activePreviewCompileSourceDocument = activePreviewCompileSourcePath
    ? snapshot.project.documents.find(
        (document) => normalizeWorkspacePath(document.name) === normalizeWorkspacePath(activePreviewCompileSourcePath)
      ) ?? null
    : null;
  const activePreviewCompileSourceTextContent = activePreviewCompileSourcePath === normalizedActiveSourcePath
    ? sourceEditorValue
    : typeof activePreviewCompileSourceDocument?.content === "string"
      ? activePreviewCompileSourceDocument.content
      : activePreviewTextContent;
  const activePreviewHasCompiledPdfResult = Boolean(
    activePreviewCompileState?.result?.ok &&
      activePreviewCompileState.result.output.kind === "pdf" &&
      activePreviewCompileState.result.output.artifactData
  );
  const activePreviewSourcePosition = useMemo<SourcePosition | null>(
    () =>
      activePreviewPath === normalizedActiveSourcePath
        ? createSourceRange({
            path: normalizedActiveSourcePath,
            line: currentEditorLineNumber,
            column: 0
          })
        : null,
    [activePreviewPath, currentEditorLineNumber, normalizedActiveSourcePath]
  );
  const activePreviewSourceLineCount = useMemo(
    () => countSourceTextLines(activePreviewCompileSourceTextContent),
    [activePreviewCompileSourceTextContent]
  );
  useEffect(() => {
    let cancelled = false;

    async function loadWorkspacePreview() {
      if (!activePreviewWorkspaceNode || activePreviewWorkspaceNode.kind !== "file") {
        setSelectedWorkspacePreview(null);
        return;
      }

      const mimeType = getWorkspacePreviewMimeType(activePreviewWorkspaceNode.path);

      if (mimeType === "text/markdown") {
        setSelectedWorkspacePreview({
          name: activePreviewWorkspaceNode.name,
          path: activePreviewWorkspaceNode.path,
          content: activePreviewTextContent,
          mimeType
        });
        return;
      }

      if (isTextWorkspaceFile(activePreviewWorkspaceNode.path)) {
        setSelectedWorkspacePreview(null);
        return;
      }

      if (!mimeType) {
        setSelectedWorkspacePreview(null);
        return;
      }

      const previewCacheKey = selectedProjectRepository
        ? getWorkspacePreviewFileCacheKey(
            selectedProjectRepository,
            activePreviewWorkspaceNode.path
          )
        : null;
      const cachedPreview = previewCacheKey
        ? workspacePreviewFileCacheRef.current.get(previewCacheKey) ?? null
        : null;

      if (cachedPreview) {
        setSelectedWorkspacePreview(cachedPreview);
      } else {
        setSelectedWorkspacePreview(null);
      }

      if (activePreviewWorkspaceNode.content instanceof Uint8Array) {
        const previewFile = {
          name: activePreviewWorkspaceNode.name,
          path: activePreviewWorkspaceNode.path,
          content: activePreviewWorkspaceNode.content,
          mimeType
        };

        if (previewCacheKey) {
          rememberWorkspacePreviewFile(
            workspacePreviewFileCacheRef.current,
            previewCacheKey,
            previewFile
          );
        }

        setSelectedWorkspacePreview(previewFile);
        return;
      }

      const bytes = selectedProjectRepository
        ? await readWorkspaceFileFromOpfs(selectedProjectRepository.id, activePreviewWorkspaceNode.path)
        : null;

      if (cancelled) {
        return;
      }

      if (bytes) {
        const previewFile = {
          name: activePreviewWorkspaceNode.name,
          path: activePreviewWorkspaceNode.path,
          content: bytes,
          mimeType
        };

        if (previewCacheKey) {
          rememberWorkspacePreviewFile(
            workspacePreviewFileCacheRef.current,
            previewCacheKey,
            previewFile
          );
        }

        setSelectedWorkspacePreview(previewFile);
        return;
      }

      setSelectedWorkspacePreview(null);
    }

    void loadWorkspacePreview();

    return () => {
      cancelled = true;
    };
  }, [activePreviewTextContent, activePreviewWorkspaceNode, selectedProjectRepository]);
  const activePreviewCompilePath = activePreviewCompileSourcePath
    ? normalizeWorkspacePath(activePreviewCompileSourcePath)
    : null;
  const activeCompileTargetPath = normalizeWorkspacePath(
    compileInFlightSourcePathRef.current || pendingSourcePathRef.current
  );
  const activePreviewIsCompileTarget = Boolean(
    activePreviewCompilePath &&
      activeCompileTargetPath &&
      activePreviewCompilePath === activeCompileTargetPath
  );
  const visiblePreviewIsCompiling = Boolean(activePreviewCompileState?.isCompiling);
  const visibleWorkspacePreview =
    activePreviewPath && selectedWorkspacePreview?.path === activePreviewPath && !activePreviewHasCompiledPdfResult
      ? selectedWorkspacePreview
      : null;
  const visiblePreviewResult =
    activePreviewPath && !visibleWorkspacePreview
      ? activePreviewCompileState?.result ?? null
      : null;
  const visibleLastSuccessfulResult =
    activePreviewPath && !visibleWorkspacePreview
      ? activePreviewCompileState?.lastSuccessfulResult ?? null
      : null;
  const rawVisiblePreviewCompilerStatus = activePreviewPath
    ? activePreviewCompileState?.isCompiling && activePreviewIsCompileTarget
      ? compilerStatus
      : activePreviewCompileState?.compilerStatus ??
        createIdleCompilerStatusForSource(activePreviewCompileSourcePath ?? activePreviewPath)
    : compilerStatus;
  const visiblePreviewCompilerStatus =
    rawVisiblePreviewCompilerStatus.phase === "compiling" && !visiblePreviewIsCompiling
      ? activePreviewCompileSourcePath
        ? createIdleCompilerStatusForSource(activePreviewCompileSourcePath)
        : compilerStatus
      : rawVisiblePreviewCompilerStatus;
  const compiledLatexPdfPreviewPathSet = useMemo(() => {
    const pdfPaths = new Set<string>();

    for (const [sourcePath, preview] of Object.entries(compilePreviewsByPath)) {
      const result = preview.result;
      if (result?.ok && result.output.kind === "pdf" && result.output.artifactData) {
        pdfPaths.add(getLatexPdfOutputPath(getLatexPdfSourcePathForResult(sourcePath, result)));
      }
    }

    const currentResult = compileResultRef.current;
    const currentSourcePath = compileInFlightSourcePathRef.current || activeSourcePathRef.current;
    if (currentResult?.ok && currentResult.output.kind === "pdf" && currentResult.output.artifactData) {
      pdfPaths.add(getLatexPdfOutputPath(getLatexPdfSourcePathForResult(currentSourcePath, currentResult)));
    }

    return pdfPaths;
  }, [compilePreviewsByPath]);
  const openSourceTab = useCallback((path: string) => {
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      return;
    }

    setSourceTabPaths((currentPaths) =>
      insertWorkspacePathAfterActive(currentPaths, normalizedPath, normalizedActiveSourcePath)
    );
    setTransientSourceTabPath((currentPath) =>
      currentPath === normalizedPath ? null : currentPath
    );
    setProjectRepository((project) => ({
      ...project,
      selection: {
        ...project.selection,
        openFilePaths: insertWorkspacePathAfterActive(
          project.selection.openFilePaths,
          normalizedPath,
          normalizedActiveSourcePath
        )
      }
    }));
  }, [normalizedActiveSourcePath, setProjectRepository]);
  const previewSourceTab = useCallback((path: string) => {
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      return;
    }

    setTransientSourceTabPath(normalizedPath);
  }, []);
  const openPreviewTab = useCallback((path: string, options: { activate?: boolean } = {}) => {
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath) {
      return;
    }

    setPreviewTabPaths((currentPaths) =>
      insertWorkspacePathAfterActive(currentPaths, normalizedPath, activePreviewPath)
    );

    if (options.activate ?? true) {
      setActivePreviewPath(normalizedPath);
    }
  }, [activePreviewPath]);
  const isAvailablePreviewTabPath = useCallback(
    (path: string) => {
      const normalizedPath = normalizeWorkspacePath(path);

      return (
        !!normalizedPath &&
        getSourceLanguage(normalizedPath) !== "latex" &&
        (workspaceFilePathSet.has(normalizedPath) ||
          compiledLatexPdfPreviewPathSet.has(normalizedPath))
      );
    },
    [compiledLatexPdfPreviewPathSet, workspaceFilePathSet]
  );
  useEffect(() => {
    if (
      isTrashViewOpen ||
      workspaceFilePathSet.size === 0 ||
      sourceTabsInitializedProjectRef.current === activeProjectTabKey
    ) {
      return;
    }

    const storedSourceTabs = normalizeUniqueWorkspacePaths(
      selectedProjectRepository?.selection.openFilePaths ?? []
    ).filter(
      (path) =>
        workspaceFilePathSet.has(path) &&
        isTextWorkspaceFile(path)
    );

    setSourceTabPaths(storedSourceTabs);
    if (
      selectedProjectRepository &&
      !areWorkspacePathListsEqual(
        selectedProjectRepository.selection.openFilePaths,
        storedSourceTabs
      )
    ) {
      setProjectRepository((project) => ({
        ...project,
        selection: {
          ...project.selection,
          openFilePaths: storedSourceTabs
        }
      }));
    }
    sourceTabsInitializedProjectRef.current = activeProjectTabKey;
  }, [
    activeProjectTabKey,
    isTrashViewOpen,
    selectedProjectRepository?.selection.openFilePaths,
    selectedProjectRepository,
    setProjectRepository,
    workspaceFilePathSet
  ]);
  useEffect(() => {
    if (isTrashViewOpen || previewTabsInitializedProjectRef.current === activeProjectTabKey) {
      return;
    }

    const storedPreviewTabs = normalizeUniqueWorkspacePaths([
      ...(selectedProjectRepository?.editor.previewTabPaths ?? []),
      selectedProjectRepository?.editor.previewPath ?? ""
    ]).filter(isAvailablePreviewTabPath);
    const storedActivePreviewPath = normalizeWorkspacePath(
      selectedProjectRepository?.editor.previewPath ?? ""
    );

    setPreviewTabPaths(storedPreviewTabs);
    setActivePreviewPath(
      storedActivePreviewPath && storedPreviewTabs.includes(storedActivePreviewPath)
        ? storedActivePreviewPath
        : storedPreviewTabs[0] ?? null
    );
    previewTabsInitializedProjectRef.current = activeProjectTabKey;
  }, [
    activeProjectTabKey,
    isAvailablePreviewTabPath,
    isTrashViewOpen,
    selectedProjectRepository
  ]);
  useEffect(() => {
    const nextSourceTabs = normalizeUniqueWorkspacePaths(sourceTabPaths).filter(
      (path) => workspaceFilePathSet.has(path) && isTextWorkspaceFile(path)
    );

    if (
      nextSourceTabs.length !== sourceTabPaths.length ||
      nextSourceTabs.some((path, index) => path !== sourceTabPaths[index])
    ) {
      setSourceTabPaths(nextSourceTabs);
    }
  }, [sourceTabPaths, workspaceFilePathSet]);
  useEffect(() => {
    const normalizedCurrentTabs = normalizeUniqueWorkspacePaths(sourceTabPaths);
    const storedSourceTabs = normalizeUniqueWorkspacePaths(
      selectedProjectRepository?.selection.openFilePaths ?? []
    ).filter(
      (path) =>
        workspaceFilePathSet.has(path) &&
        isTextWorkspaceFile(path)
    );

    const nextSourceTabs = storedSourceTabs.filter((path) => !normalizedCurrentTabs.includes(path));

    if (nextSourceTabs.length > 0) {
      setSourceTabPaths((currentPaths) =>
        normalizeUniqueWorkspacePaths([...currentPaths, ...nextSourceTabs])
      );
    }
  }, [
    selectedProjectRepository?.selection.openFilePaths,
    sourceTabPaths,
    workspaceFilePathSet
  ]);
  useEffect(() => {
    if (!transientSourceTabPath) {
      return;
    }

    const normalizedPath = normalizeWorkspacePath(transientSourceTabPath);

    if (
      !normalizedPath ||
      !workspaceFilePathSet.has(normalizedPath) ||
      sourceTabPaths.includes(normalizedPath)
    ) {
      setTransientSourceTabPath(null);
    }
  }, [sourceTabPaths, transientSourceTabPath, workspaceFilePathSet]);
  useEffect(() => {
    const nextPreviewTabs = normalizeUniqueWorkspacePaths(previewTabPaths).filter(
      isAvailablePreviewTabPath
    );

    if (
      nextPreviewTabs.length !== previewTabPaths.length ||
      nextPreviewTabs.some((path, index) => path !== previewTabPaths[index])
    ) {
      setPreviewTabPaths(nextPreviewTabs);
    }

    const normalizedActivePreviewPath = activePreviewPath
      ? normalizeWorkspacePath(activePreviewPath)
      : "";

    if (
      normalizedActivePreviewPath &&
      !nextPreviewTabs.includes(normalizedActivePreviewPath)
    ) {
      setActivePreviewPath(nextPreviewTabs[0] ?? null);
    }
  }, [activePreviewPath, isAvailablePreviewTabPath, previewTabPaths]);
  useEffect(() => {
    if (
      !selectedProjectRepository ||
      isTrashViewOpen ||
      previewTabsInitializedProjectRef.current !== activeProjectTabKey
    ) {
      return;
    }

    const nextPreviewTabs = normalizeUniqueWorkspacePaths(previewTabPaths).filter(
      isAvailablePreviewTabPath
    );
    const normalizedActivePreviewPath = activePreviewPath
      ? normalizeWorkspacePath(activePreviewPath)
      : "";
    const nextPreviewPath =
      normalizedActivePreviewPath && nextPreviewTabs.includes(normalizedActivePreviewPath)
        ? normalizedActivePreviewPath
        : null;
    const storedPreviewTabs = normalizeUniqueWorkspacePaths(
      selectedProjectRepository.editor.previewTabPaths ?? []
    ).filter(isAvailablePreviewTabPath);
    const storedPreviewPath = normalizeWorkspacePath(
      selectedProjectRepository.editor.previewPath ?? ""
    ) || null;

    if (
      areWorkspacePathListsEqual(nextPreviewTabs, storedPreviewTabs) &&
      nextPreviewPath === storedPreviewPath
    ) {
      return;
    }

    setProjectRepository((project) =>
      project.id === selectedProjectRepository.id
        ? {
            ...project,
            editor: {
              ...project.editor,
              previewPath: nextPreviewPath,
              previewTabPaths: nextPreviewTabs
            }
          }
        : project
    );
  }, [
    activePreviewPath,
    activeProjectTabKey,
    isAvailablePreviewTabPath,
    isTrashViewOpen,
    previewTabPaths,
    selectedProjectRepository,
    setProjectRepository
  ]);
  useEffect(() => {
    if (!selectedProjectRepository) {
      return;
    }

    const pdfPreviewTabs = normalizeUniqueWorkspacePaths(previewTabPaths).filter(
      (path) => path.toLowerCase().endsWith(".pdf")
    );

    if (pdfPreviewTabs.length === 0) {
      return;
    }

    setCompilePreviewsByPath((currentPreviews) => {
      let nextPreviews = currentPreviews;

      for (const previewPath of pdfPreviewTabs) {
        const sourcePath = resolveLatexSourcePathForPdfPreview(
          previewPath,
          selectedProjectRepository,
          activeSourcePathRef.current
        );
        const sourcePathKey = sourcePath ? normalizeWorkspacePath(sourcePath) : "";

        if (!sourcePathKey) {
          continue;
        }

        const currentPreview = currentPreviews[sourcePathKey];

        if (currentPreview?.isCompiling || currentPreview?.lastSuccessfulResult?.ok) {
          continue;
        }

        const savedResult = loadSavedLatexPdfCompileResult({
          allowStale: true,
          project: selectedProjectRepository,
          source: readProjectTextFileOrDefault(selectedProjectRepository, sourcePathKey, ""),
          sourcePath: sourcePathKey
        });

        if (!savedResult?.ok || savedResult.output.kind !== "pdf") {
          continue;
        }

        if (nextPreviews === currentPreviews) {
          nextPreviews = { ...currentPreviews };
        }

        nextPreviews[sourcePathKey] = createCompilePreviewState(sourcePathKey, {
          result: savedResult,
          lastSuccessfulResult: savedResult
        });
      }

      return nextPreviews;
    });
  }, [previewTabPaths, selectedProjectRepository]);
  const projectGitignoreContent = useMemo(
    () =>
      selectedProjectRepository
        ? readProjectTextFileOrDefault(
            selectedProjectRepository,
            DEFAULT_PROJECT_GITIGNORE_PATH,
            ""
          )
        : DEFAULT_PROJECT_GITIGNORE_CONTENT,
    [selectedProjectRepository]
  );
  useEffect(() => {
    selectedProjectRepositoryRef.current = selectedProjectRepository;
  }, [selectedProjectRepository]);
  useEffect(() => {
    activeSourcePathRef.current = activeSourcePath;
    activeSourceLanguageRef.current = activeSourceLanguage;
    isActiveSourceCompilableRef.current = isActiveSourceCompilable;
  }, [activeSourceLanguage, activeSourcePath, isActiveSourceCompilable]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const normalizedSourcePath = normalizeWorkspacePath(activeSourcePath);
    const scheduledCompilePath = normalizeWorkspacePath(
      compileInFlightSourcePathRef.current || pendingSourcePathRef.current
    );
    const sourceHasScheduledCompile = Boolean(
      normalizedSourcePath &&
        scheduledCompilePath === normalizedSourcePath &&
        (compileInFlightRef.current || compileFrameRef.current !== null || compileTimerRef.current !== null)
    );

    if (sourceHasScheduledCompile) {
      return;
    }

    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
      compileTimerRef.current = null;
    }
    if (compileFrameRef.current !== null) {
      window.cancelAnimationFrame(compileFrameRef.current);
      compileFrameRef.current = null;
    }

    compileRequestRef.current += 1;
    setIsCompiling(false);
    setCompileResult(null);
    setLastSuccessfulResult(null);
    setCompilerStatus({
      phase: "idle",
      mode: "worker",
      label: isActiveSourceCompilable
        ? activeSourceLanguage === "latex"
          ? "LaTeX ready"
          : "Typst ready"
        : "No compiler for active file",
      detail:
        activeSourceLanguage === "latex"
          ? "Press Compile or Ctrl+Enter to update the PDF preview."
          : undefined
    });
  }, [activeSourceLanguage, activeSourcePath, isActiveSourceCompilable, isHydrated]);
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

  const appendBuildLogEntry = useCallback((entry: Omit<BuildLogEntry, "id">) => {
    setBuildLogEntries((currentEntries) => [
      {
        ...entry,
        id: entry.startedAt + ":" + entry.sourcePath + ":" + currentEntries.length
      },
      ...currentEntries
    ].slice(0, 20));
  }, []);

  useEffect(() => {
    if (!compileInFlightRef.current && !isCompiling) {
      return;
    }

    const statusPath = normalizeWorkspacePath(
      compileInFlightSourcePathRef.current || pendingSourcePathRef.current
    );

    if (!statusPath) {
      return;
    }

    setCompilePreviewsByPath((currentPreviews) => {
      const currentPreview = currentPreviews[statusPath] ?? createCompilePreviewState(statusPath);

      if (currentPreview.compilerStatus === compilerStatus) {
        return currentPreviews;
      }

      return {
        ...currentPreviews,
        [statusPath]: {
          ...currentPreview,
          compilerStatus
        }
      };
    });
  }, [compilerStatus, isCompiling]);

  useEffect(() => {
    if (
      !isHydrated ||
      compileResult !== null ||
      isCompiling ||
      compileInFlightRef.current ||
      activeSourceLanguage !== "latex" ||
      !isActiveSourceCompilable ||
      !selectedProjectRepository
    ) {
      return;
    }

    const savedResult = loadSavedLatexPdfCompileResult({
      allowStale: true,
      project: selectedProjectRepository,
      source: sourceEditorValue,
      sourcePath: activeSourcePath
    });

    if (!savedResult || !savedResult.ok) {
      return;
    }

    setCompileResult(savedResult);
    setLastSuccessfulResult(savedResult);
    setCompilerStatus({
      phase: "ready",
      mode: "worker",
      label: "Saved PDF preview ready"
    });
    setCompilePreviewsByPath((currentPreviews) => ({
      ...currentPreviews,
      [normalizedActiveSourcePath]: createCompilePreviewState(normalizedActiveSourcePath, {
        result: savedResult,
        lastSuccessfulResult: savedResult,
        compilerStatus: {
          phase: "ready",
          mode: "worker",
          label: "Saved PDF preview ready"
        },
        isCompiling: false
      })
    }));
  }, [
    activeSourceLanguage,
    activeSourcePath,
    compileResult,
    isActiveSourceCompilable,
    isHydrated,
    isCompiling,
    normalizedActiveSourcePath,
    selectedProjectRepository,
    sourceEditorValue
  ]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const currentProjectRepository = selectedProjectRepositoryRef.current;
    const fallbackTree = buildWorkspaceTree(
      currentProjectRepository
        ? buildProjectWorkspaceEntriesFromProject(currentProjectRepository)
        : buildProjectWorkspaceEntries(snapshot)
    );
    setWorkspaceTree(fallbackTree);
    setWorkspaceLoadError(null);

    if (!isOpfsAvailable() || !currentProjectRepository) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      const syncWorkspace = async () => {
        try {
          await syncProjectToOpfs(currentProjectRepository);
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
  }, [isHydrated, workspaceStructureKey]);

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
      if (compileFrameRef.current !== null) {
        window.cancelAnimationFrame(compileFrameRef.current);
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

    const updateViewportSize = () => {
      const nextWidth = getCurrentViewportWidth();
      const nextHeight = getCurrentViewportHeight();

      setViewportWidth(nextWidth);
      setViewportHeight(nextHeight);
      document.documentElement.style.setProperty("--app-viewport-height", `${Math.round(nextHeight)}px`);
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    window.visualViewport?.addEventListener("resize", updateViewportSize);
    window.visualViewport?.addEventListener("scroll", updateViewportSize);

    return () => {
      window.removeEventListener("resize", updateViewportSize);
      window.visualViewport?.removeEventListener("resize", updateViewportSize);
      window.visualViewport?.removeEventListener("scroll", updateViewportSize);
      document.documentElement.style.removeProperty("--app-viewport-height");
    };
  }, []);

  useEffect(() => {
    if (!isMobileWorkspace && isEditorFullscreen) {
      setIsEditorFullscreen(false);
    }
  }, [isEditorFullscreen, isMobileWorkspace]);

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
      try {
        reportBootProgress(0.34);
        const [storedSnapshot, storedProjectStorage, storedGitWorkspace, storedGitHubConfig, storedGitCredentials] = await Promise.all([
          loadSnapshot(),
          loadProjectStorage(),
          loadGitWorkspace(),
          loadGitHubConfig(),
          loadGitCredentialMap()
        ]);
        reportBootProgress(0.58);
        const storedSnippets = await loadCustomSnippets();
        reportBootProgress(0.68);

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
        reportBootProgress(0.76);
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
        setCustomSnippets(storedSnippets ?? createEmptySnippetCollections());
        reportBootProgress(0.9);
      } catch (error) {
        console.error("Unable to hydrate Typr workspace.", error);
        if (cancelled) {
          return;
        }
        setHasHydrationError(true);
        setStorageStatus("error");
        reportBootProgress(0.9);
      }
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

  const refreshLatexPackageCache = useCallback(async () => {
    setIsLatexPackageCacheLoading(true);

    try {
      const [catalog, bundles] = await Promise.all([
        getLatexPackageCatalog(),
        getLatexPackageBundleCacheSummary()
      ]);
      setLatexPackageCatalog(catalog);
      setLatexPackageBundleEntries(bundles);
    } catch {
      setLatexPackageFeedback({
        tone: "error",
        text: "Unable to load LaTeX package cache."
      });
    } finally {
      setIsLatexPackageCacheLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSettingsOpen || settingsTab !== "packages") {
      return;
    }

    void refreshTypstPackageCache();
    void refreshLatexPackageCache();
  }, [isSettingsOpen, refreshLatexPackageCache, refreshTypstPackageCache, settingsTab]);

  useEffect(() => {
    if (
      !isSettingsOpen ||
      settingsTab !== "packages" ||
      packageSettingsScope !== "latex" ||
      compileResult?.engine !== "busytex"
    ) {
      return;
    }

    void refreshLatexPackageCache();
  }, [
    compileResult,
    isSettingsOpen,
    packageSettingsScope,
    refreshLatexPackageCache,
    settingsTab
  ]);

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
  }, []);

  useEffect(() => {
    if (!isMobileWorkspaceViewport(viewportWidth)) {
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
  }, [viewportWidth, workspaceMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: PANEL_LAYOUT_VERSION,
        isSidebarCollapsed,
        isSourcePaneHidden,
        isPreviewCollapsed,
        sidebarWidth,
        previewRatio,
        zenWidth,
        zenHeight
      })
    );
  }, [
    isPreviewCollapsed,
    isSidebarCollapsed,
    isSourcePaneHidden,
    previewRatio,
    sidebarWidth,
    zenHeight,
    zenWidth
  ]);

  const runAppKeybindingCommand = useCallback(
    (commandId: KeybindingCommandId): boolean => {
      switch (commandId) {
        case "compile":
          handleCompileRef.current();
          return true;
        case "formatDocument":
          handleFormatDocumentRef.current();
          return true;
        case "toggleVim":
          handleVimToggle();
          return true;
        case "openSearch":
          setActiveSidebarTool("search");
          setIsSidebarCollapsed(false);
          if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
            setWorkspaceMode("split");
          }
          return true;
        case "toggleSidebar":
          handlePanelToggle("sidebar");
          return true;
        case "toggleSource":
          handlePanelToggle("source");
          return true;
        case "togglePreview":
          handlePanelToggle("preview");
          return true;
        case "toggleZen":
          toggleZenMode();
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
        case "previousWorkspaceTab":
          return activateWorkspaceTabRef.current(-1);
        case "nextWorkspaceTab":
          return activateWorkspaceTabRef.current(1);
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
      isPreviewCollapsed,
      isSidebarCollapsed,
      isSourceFileEditable,
      isSourcePaneHidden,
      setEditorFontSize,
      snapshot.preferences.editorFontSize,
      viewportWidth,
      workspaceMode
    ]
  );

  const handleGlobalZoomWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.deltaY === 0) {
        return;
      }

      const zoomPaneTarget = resolveZoomPaneTarget(event.target);
      if (!zoomPaneTarget) {
        return;
      }

      event.preventDefault();
      lastZoomPaneTargetRef.current = zoomPaneTarget;
      adjustZoomPaneTarget(zoomPaneTarget, event.deltaY < 0 ? 1 : -1);
    },
    [adjustZoomPaneTarget]
  );

  const focusSourcePane = useCallback(() => {
    lastZoomPaneTargetRef.current = "source";

    if (isMobileWorkspaceViewport(viewportWidth)) {
      setMobileWorkspaceTab("editor");
    } else if (workspaceMode !== "zen") {
      setWorkspaceMode("split");
      setIsSourcePaneHidden(false);
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    });
  }, [viewportWidth, workspaceMode]);

  const focusPreviewPane = useCallback(() => {
    lastZoomPaneTargetRef.current = "preview";

    if (isMobileWorkspaceViewport(viewportWidth)) {
      setMobileWorkspaceTab("preview");
    } else {
      if (workspaceMode === "zen") {
        exitZenMode();
      } else if (workspaceMode !== "split") {
        setWorkspaceMode("split");
      }
      setIsPreviewCollapsed(false);
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        previewPaneRef.current?.focus({ preventScroll: true });
      });
    });
  }, [viewportWidth, workspaceMode]);

  const focusFilesPane = useCallback(() => {
    lastZoomPaneTargetRef.current = "sidebar";
    setActiveSidebarTool("files");
    setIsSidebarCollapsed(false);

    if (isMobileWorkspaceViewport(viewportWidth)) {
      setMobileWorkspaceTab("files");
    } else if (workspaceMode === "zen") {
      exitZenMode();
    } else if (workspaceMode !== "split") {
      setWorkspaceMode("split");
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        sidebarPaneRef.current?.focus({ preventScroll: true });
      });
    });
  }, [viewportWidth, workspaceMode]);

  const clearPreviewPendingG = useCallback(() => {
    if (previewPendingGTimerRef.current !== null) {
      window.clearTimeout(previewPendingGTimerRef.current);
      previewPendingGTimerRef.current = null;
    }
  }, []);

  const scrollPreviewPane = useCallback(
    (action: PreviewScrollAction) => {
      const scroller = getPreviewScrollContainer(previewPaneRef.current);
      if (!scroller) {
        return;
      }

      const lineDelta = Math.max(48, Math.round(scroller.clientHeight * 0.08));
      const horizontalDelta = Math.max(48, Math.round(scroller.clientWidth * 0.08));
      const pageDelta = Math.max(120, Math.round(scroller.clientHeight * 0.88));

      if (action === "top") {
        scroller.scrollTo({ top: 0, behavior: "auto" });
        return;
      }

      if (action === "bottom") {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
        return;
      }

      if (action === "next-page" && scrollPreviewToAdjacentPage(scroller, 1)) {
        return;
      }

      if (action === "previous-page" && scrollPreviewToAdjacentPage(scroller, -1)) {
        return;
      }

      const top =
        action === "down"
          ? lineDelta
          : action === "up"
            ? -lineDelta
            : action === "next-page"
              ? pageDelta
              : action === "previous-page"
                ? -pageDelta
                : 0;
      const left =
        action === "right"
          ? horizontalDelta
          : action === "left"
            ? -horizontalDelta
            : 0;

      scroller.scrollBy({ left, top, behavior: "auto" });
    },
    []
  );

  const handlePreviewPaneKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (
        !snapshot.preferences.vimMode ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTypingTarget(event.target) ||
        (
          event.target instanceof HTMLElement &&
          Boolean(event.target.closest("button, a, input, textarea, select"))
        )
      ) {
        return;
      }

      const nativeEvent = event.nativeEvent;
      const previewKeybindings = snapshot.preferences.keybindings;
      const goTopParts = getKeybindingSequenceParts(previewKeybindings.previewGoTop);
      const pendingTopSequence = previewPendingGTimerRef.current !== null;

      if (pendingTopSequence) {
        clearPreviewPendingG();

        if (
          goTopParts.length > 1 &&
          goTopParts[1] &&
          matchesKeybinding(nativeEvent, goTopParts[1], isAppleShortcutPlatform)
        ) {
          event.preventDefault();
          scrollPreviewPane("top");
          return;
        }
      }

      if (
        goTopParts.length === 1 &&
        goTopParts[0] &&
        matchesKeybinding(nativeEvent, goTopParts[0], isAppleShortcutPlatform)
      ) {
        event.preventDefault();
        scrollPreviewPane("top");
        return;
      }

      if (
        goTopParts.length > 1 &&
        goTopParts[0] &&
        matchesKeybinding(nativeEvent, goTopParts[0], isAppleShortcutPlatform)
      ) {
        event.preventDefault();
        previewPendingGTimerRef.current = window.setTimeout(() => {
          previewPendingGTimerRef.current = null;
        }, 700);
        return;
      }

      const scrollBindings: Array<[KeybindingCommandId, PreviewScrollAction]> = [
        ["previewScrollLeft", "left"],
        ["previewScrollDown", "down"],
        ["previewScrollUp", "up"],
        ["previewScrollRight", "right"],
        ["previewNextPage", "next-page"],
        ["previewPreviousPage", "previous-page"],
        ["previewGoBottom", "bottom"]
      ];

      for (const [commandId, action] of scrollBindings) {
        if (matchesKeybinding(nativeEvent, previewKeybindings[commandId], isAppleShortcutPlatform)) {
          event.preventDefault();
          scrollPreviewPane(action);
          return;
        }
      }
    },
    [
      clearPreviewPendingG,
      isAppleShortcutPlatform,
      scrollPreviewPane,
      snapshot.preferences.keybindings,
      snapshot.preferences.vimMode
    ]
  );

  useEffect(() => clearPreviewPendingG, [clearPreviewPendingG]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const zoomPaneTarget = resolveZoomPaneTarget(event.target);
      if (zoomPaneTarget) {
        lastZoomPaneTargetRef.current = zoomPaneTarget;
      }

      if (!menuStripRef.current?.contains(event.target as Node)) {
        cancelPendingMenuClose();
        cancelPendingMenuOpen();
        setActiveMenu(null);
      }

      if (!previewDownloadMenuRef.current?.contains(event.target as Node)) {
        setIsPreviewDownloadMenuOpen(false);
      }
    }

    function handleVimShortcutCapture(event: KeyboardEvent) {
      if (event.defaultPrevented || recordingKeybindingId || isTypingTarget(event.target)) {
        return;
      }

      if (
        matchesKeybinding(
          event,
          snapshot.preferences.keybindings.toggleVim,
          isAppleShortcutPlatform
        )
      ) {
        event.preventDefault();
        handleVimToggle();
        return;
      }

      if (!snapshot.preferences.vimMode) {
        return;
      }

      const paneFocusDirection = getVimPaneFocusDirection(
        event,
        snapshot.preferences.keybindings,
        isAppleShortcutPlatform
      );
      if (paneFocusDirection === null) {
        return;
      }

      event.preventDefault();

      const activeZoomPaneTarget =
        resolveZoomPaneTarget(event.target) ??
        resolveZoomPaneTarget(document.activeElement) ??
        lastZoomPaneTargetRef.current;
      const activeVimPane: VimPaneFocusTarget =
        activeZoomPaneTarget === "sidebar" ? "files" : activeZoomPaneTarget;

      if (activeVimPane === "files" && activeSidebarTool !== "files") {
        focusFilesPane();
        return;
      }

      const panes: VimPaneFocusTarget[] = ["files", "source", "preview"];
      const activePaneIndex = Math.max(0, panes.indexOf(activeVimPane));
      const nextPane =
        panes[Math.min(panes.length - 1, Math.max(0, activePaneIndex + paneFocusDirection))];

      if (nextPane === "files") {
        focusFilesPane();
        return;
      }

      if (nextPane === "source") {
        focusSourcePane();
        return;
      }

      focusPreviewPane();
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

      const keyboardZoomDirection = getKeyboardZoomDirection(
        event,
        snapshot.preferences.keybindings,
        isAppleShortcutPlatform
      );
      if (keyboardZoomDirection !== null) {
        event.preventDefault();
        adjustZoomPaneTarget(lastZoomPaneTargetRef.current, keyboardZoomDirection);
        return;
      }

      if (event.key === "Escape") {
        cancelPendingMenuClose();
        cancelPendingMenuOpen();
        setActiveMenu(null);
        setIsPreviewDownloadMenuOpen(false);
        setIsSettingsOpen(false);
        setDiagramPaneMode("sidebar");
        setGraphPaneMode("sidebar");
        if (workspaceMode === "zen") {
          exitZenMode();
        } else {
          setWorkspaceMode("split");
        }
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      if (
        matchesKeybinding(
          event,
          snapshot.preferences.keybindings.formatDocument,
          isAppleShortcutPlatform
        ) &&
        runAppKeybindingCommand("formatDocument")
      ) {
        event.preventDefault();
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
    window.addEventListener("keydown", handleVimShortcutCapture, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleGlobalZoomWheel, { passive: false });
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleVimShortcutCapture, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleGlobalZoomWheel);
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [
    adjustZoomPaneTarget,
    cancelPendingMenuClose,
    cancelPendingMenuOpen,
    activeSidebarTool,
    focusFilesPane,
    focusPreviewPane,
    focusSourcePane,
    handleVimToggle,
    handleGlobalZoomWheel,
    isAppleShortcutPlatform,
    recordingKeybindingId,
    runAppKeybindingCommand,
    snapshot.preferences.vimMode,
    snapshot.preferences.keybindings,
    workspaceMode
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

    window.dispatchEvent(new Event("typr:app-ready"));
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || hasHydrationError) {
      return;
    }

    const handle = window.setTimeout(() => {
      setStorageStatus("saving");
      Promise.all([saveSnapshot(snapshot), saveProjectStorage(projectStorage)])
        .then(() => setStorageStatus("saved"))
        .catch(() => setStorageStatus("error"));
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [hasHydrationError, isHydrated, projectStorage, snapshot]);

  useEffect(() => {
    if (!isHydrated || hasHydrationError) {
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
  }, [gitCredentials, gitWorkspace, hasHydrationError, isHydrated, selectedGitProject]);

  useEffect(() => {
    if (!isHydrated || hasHydrationError) {
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
  }, [customSnippets, hasHydrationError, isHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      LATEX_PACKAGE_SELECTIONS_STORAGE_KEY,
      JSON.stringify(cachedLatexPackageNames)
    );
  }, [cachedLatexPackageNames]);

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
      WORKSPACE_OPEN_FOLDERS_STORAGE_KEY,
      JSON.stringify(workspaceOpenFoldersByProject)
    );
  }, [workspaceOpenFoldersByProject]);

  const saveGeneratedLatexPdfToProject = useCallback(
    ({
      projectId,
      result,
      sourcePath
    }: {
      projectId: string;
      result: Extract<CompileResult, { ok: true }>;
      sourcePath: string;
    }) => {
      setProjectRepository((project) =>
        project.id === projectId
          ? writeGeneratedLatexPdfFile(project, sourcePath, result)
          : project
      );
    },
    [setProjectRepository]
  );

  const runCompile = useCallback(async () => {
    if (compileInFlightRef.current || !isHydrated) {
      return;
    }

    const source = pendingSourceRef.current;
    const sourcePath = pendingSourcePathRef.current;
    const sourceLanguage = getSourceLanguage(sourcePath);
    const diagramRevision = diagramAssetsRevisionRef.current;
    const diagramAssets = diagramAssetsRef.current;
    const graphRevision = graphAssetsRevisionRef.current;
    const graphAssets = graphAssetsRef.current;
    const requestId = compileRequestRef.current + 1;
    compileRequestRef.current = requestId;
    compileInFlightRef.current = true;
    compileInFlightLanguageRef.current = sourceLanguage;
    compileInFlightSourceRef.current = source;
    compileInFlightSourcePathRef.current = sourcePath;
    compileInFlightDiagramRevisionRef.current = diagramRevision;
    compileInFlightGraphRevisionRef.current = graphRevision;
    const compileStartedAtIso = new Date().toISOString();
    setLiveBuildOutput(`[${new Date(compileStartedAtIso).toLocaleTimeString()}] Starting ${formatSourceLanguageLabel(sourceLanguage)} compile for ${sourcePath}`);
    const compileStartedAt =
      typeof performance === "undefined" ? 0 : performance.now();

    try {
      const compileAssets = [...diagramAssets, ...graphAssets];
      let result: CompileResult;
      let compileUsedCachedOutput = false;
      let generatedLatexPdf: {
        activatePreview: boolean;
        projectId: string;
        result: Extract<CompileResult, { ok: true }>;
        sourcePath: string;
      } | null = null;

      if (sourceLanguage === "latex") {
        const project = selectedProjectRepositoryRef.current;

        if (project) {
          const savedResult = loadSavedLatexPdfCompileResult({
            allowStale: false,
            project,
            source,
            sourcePath
          });

          if (savedResult) {
            result = savedResult;
            compileUsedCachedOutput = true;
          } else {
            result = await compileLatexDocument({
              mainFilePath: sourcePath,
              source,
              project,
              assets: compileAssets,
              compileMode: "quick",
              onStatusChange: handleCompilerStatusChange
            });

            if (result.ok && result.output.kind === "pdf") {
              generatedLatexPdf = {
                activatePreview: true,
                projectId: project.id,
                result,
                sourcePath
              };
            }
          }
        } else {
          result = {
            ok: false,
            engine: "busytex",
            errors: [
              {
                message: "Project filesystem is unavailable for LaTeX compilation.",
                severity: "error",
                path: sourcePath
              }
            ]
          } satisfies CompileResult;
        }
      } else if (sourceLanguage === "typst") {
        result = await compiler.compileDocument(source, compileAssets);
      } else {
        result = {
          ok: false,
          engine: "mock",
          errors: [
            {
              message: "This file type does not have a compiler.",
              severity: "error",
              path: sourcePath
            }
          ]
        } satisfies CompileResult;
      }

      if (!isMountedRef.current || requestId !== compileRequestRef.current) {
        return;
      }

      if (generatedLatexPdf) {
        saveGeneratedLatexPdfToProject(generatedLatexPdf);

        if (generatedLatexPdf.activatePreview) {
          openPreviewTab(
            getLatexPdfOutputPath(
              getLatexPdfSourcePathForResult(generatedLatexPdf.sourcePath, generatedLatexPdf.result)
            ),
            { activate: true }
          );
        }
      }

      const compileDurationMs =
        typeof performance === "undefined"
          ? 0
          : performance.now() - compileStartedAt;
      const currentCompileResult = compileResultRef.current;
      const nextResult = reuseCompileOutputIfUnchanged(currentCompileResult, result);
      const changedPreview = nextResult === result && didCompileOutputChange(currentCompileResult, result);

      if (!shouldReuseCompileResult(currentCompileResult, nextResult)) {
        setCompileResult(nextResult);
      }

      if (nextResult.ok) {
        setLastSuccessfulResult(nextResult);
      }

      setCompilePreviewsByPath((currentPreviews) => {
        const sourcePathKey = normalizeWorkspacePath(sourcePath);
        const currentPreview = currentPreviews[sourcePathKey] ?? createCompilePreviewState(sourcePathKey);
        const nextCompilerStatus = createCompletedPreviewCompilerStatus(
          result,
          currentPreview.compilerStatus
        );

        return {
          ...currentPreviews,
          [sourcePathKey]: {
            ...currentPreview,
            result: nextResult,
            lastSuccessfulResult: nextResult.ok
              ? nextResult
              : currentPreview.lastSuccessfulResult,
            compilerStatus: nextCompilerStatus,
            isCompiling: false
          }
        };
      });

      setCompilerStatus((currentStatus) =>
        createCompletedPreviewCompilerStatus(result, currentStatus)
      );

      logCompileTiming({
        durationMs: compileDurationMs,
        changed: changedPreview,
        ok: result.ok,
        diagnosticsCount: result.ok ? result.diagnostics.length : result.errors.length,
        metadata: result.metadata
      });
      appendBuildLogEntry({
        sourcePath,
        language: sourceLanguage,
        engine: result.engine,
        ok: result.ok,
        startedAt: compileStartedAtIso,
        durationMs: compileDurationMs,
        diagnostics: result.ok ? result.diagnostics : result.errors,
        metadata: result.metadata,
        trigger: pendingCompileTriggerRef.current,
        compileMode: sourceLanguage === "latex" ? "quick" : "none",
        cached: compileUsedCachedOutput,
        outputChanged: changedPreview,
        rawLog: sourceLanguage === "latex" ? result.output?.content : undefined,
        packageDetails: sourceLanguage === "latex" ? extractBuildLogPackageDetails(result.output?.content ?? "") : [],
        shellEscapeUnavailable: sourceLanguage === "latex" && hasShellEscapeConstraint(result.output?.content ?? "")
      });
    } catch (error) {
      if (!isMountedRef.current || requestId !== compileRequestRef.current) {
        return;
      }

      const failedResult: CompileResult = {
        ok: false,
        engine: sourceLanguage === "latex" ? "busytex" : "typst-ts",
        errors: [
          {
            message:
              error instanceof Error
                ? error.message
                : sourceLanguage === "latex"
                  ? "LaTeX compiler failed."
                  : "Typst compiler worker failed.",
            severity: "error"
          }
        ]
      } satisfies CompileResult;
      setCompileResult(failedResult);
      setCompilePreviewsByPath((currentPreviews) => {
        const sourcePathKey = normalizeWorkspacePath(sourcePath);
        const currentPreview = currentPreviews[sourcePathKey] ?? createCompilePreviewState(sourcePathKey);
        const nextCompilerStatus = createCompletedPreviewCompilerStatus(
          failedResult,
          currentPreview.compilerStatus
        );

        return {
          ...currentPreviews,
          [sourcePathKey]: {
            ...currentPreview,
            result: failedResult,
            compilerStatus: nextCompilerStatus,
            isCompiling: false
          }
        };
      });
      setCompilerStatus((currentStatus) =>
        createCompletedPreviewCompilerStatus(failedResult, currentStatus)
      );
      appendBuildLogEntry({
        sourcePath,
        language: sourceLanguage,
        engine: failedResult.engine,
        ok: false,
        startedAt: compileStartedAtIso,
        durationMs: typeof performance === "undefined" ? 0 : performance.now() - compileStartedAt,
        diagnostics: failedResult.errors,
        metadata: failedResult.metadata,
        trigger: pendingCompileTriggerRef.current,
        compileMode: sourceLanguage === "latex" ? "quick" : "none",
        cached: false,
        outputChanged: false,
        rawLog: sourceLanguage === "latex" ? failedResult.output?.content : undefined,
        packageDetails: sourceLanguage === "latex" ? extractBuildLogPackageDetails(failedResult.output?.content ?? "") : [],
        shellEscapeUnavailable: sourceLanguage === "latex" && hasShellEscapeConstraint(failedResult.output?.content ?? "")
      });
    } finally {
      compileInFlightRef.current = false;
      compileInFlightLanguageRef.current = null;
      compileInFlightSourceRef.current = "";
      compileInFlightSourcePathRef.current = "";
      compileInFlightDiagramRevisionRef.current = "";
      compileInFlightGraphRevisionRef.current = "";

      if (!isMountedRef.current) {
        return;
      }

      if (
        shouldRunPendingCompileAfterCompletion({
          completedDiagramRevision: diagramRevision,
          completedGraphRevision: graphRevision,
          completedSource: source,
          completedSourcePath: sourcePath,
          pendingDiagramRevision: diagramAssetsRevisionRef.current,
          pendingGraphRevision: graphAssetsRevisionRef.current,
          pendingSource: pendingSourceRef.current,
          pendingSourcePath: pendingSourcePathRef.current
        })
      ) {
        void runCompile();
      } else {
        setIsCompiling(false);
        setCompilePreviewsByPath((currentPreviews) => {
          const sourcePathKey = normalizeWorkspacePath(sourcePath);
          const currentPreview = currentPreviews[sourcePathKey];

          if (!currentPreview || !currentPreview.isCompiling) {
            return currentPreviews;
          }

          return {
            ...currentPreviews,
            [sourcePathKey]: {
              ...currentPreview,
              isCompiling: false
            }
          };
        });
      }
    }
  }, [appendBuildLogEntry, compiler, isHydrated, openPreviewTab, saveGeneratedLatexPdfToProject]);

  const shouldCancelInFlightLatexCompile = useCallback(
    ({
      source,
      sourcePath,
      diagramRevision,
      graphRevision
    }: {
      source: string;
      sourcePath: string;
      diagramRevision: string;
      graphRevision: string;
    }) => {
      return (
        compileInFlightLanguageRef.current === "latex" &&
        compileInFlightSourcePathRef.current === sourcePath &&
        (compileInFlightSourceRef.current !== source ||
          compileInFlightDiagramRevisionRef.current !== diagramRevision ||
          compileInFlightGraphRevisionRef.current !== graphRevision)
      );
    },
    []
  );

  const clearScheduledCompile = useCallback(() => {
    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
      compileTimerRef.current = null;
    }
    if (compileFrameRef.current !== null) {
      window.cancelAnimationFrame(compileFrameRef.current);
      compileFrameRef.current = null;
    }
  }, []);

  const scheduleCompileAfterPaint = useCallback((delayMs: number) => {
    clearScheduledCompile();
    compileFrameRef.current = window.requestAnimationFrame(() => {
      compileFrameRef.current = null;
      compileTimerRef.current = window.setTimeout(() => {
        compileTimerRef.current = null;
        void runCompile();
      }, delayMs);
    });
  }, [clearScheduledCompile, runCompile]);

  const queueCompile = useCallback((debounced: boolean) => {
    clearScheduledCompile();

    const sourcePath = activeSourcePathRef.current;
    const sourceLanguage = getSourceLanguage(sourcePath);
    const sourcePathKey = normalizeWorkspacePath(sourcePath);
    const inFlightSourcePathKey = normalizeWorkspacePath(compileInFlightSourcePathRef.current);
    const isQueuedBehindAnotherCompile = Boolean(
      compileInFlightRef.current &&
        sourcePathKey &&
        inFlightSourcePathKey &&
        sourcePathKey !== inFlightSourcePathKey
    );

    pendingSourcePathRef.current = sourcePath;
    pendingSourceRef.current =
      sourceLanguage === "typst"
        ? createThemedPreviewSource(
            previewSourceDraftRef.current,
            themeRef.current ?? theme,
            isPaperView
          )
        : previewSourceDraftRef.current;
    const nextCompilerStatus: CompilerStatus = {
      phase: "compiling",
      mode: "worker",
      label: isQueuedBehindAnotherCompile
        ? sourceLanguage === "latex"
          ? "Queued LaTeX compile"
          : "Queued compile"
        : sourceLanguage === "latex"
          ? "Compiling LaTeX"
          : "Compiling"
    };
    setIsCompiling(true);
    if (!isQueuedBehindAnotherCompile) {
      setCompilerStatus(nextCompilerStatus);
    }
    setCompilePreviewsByPath((currentPreviews) => {
      const currentPreview = currentPreviews[sourcePathKey] ?? createCompilePreviewState(sourcePathKey);

      return {
        ...currentPreviews,
        [sourcePathKey]: {
          ...currentPreview,
          compilerStatus: {
            ...nextCompilerStatus,
            mode: currentPreview.compilerStatus.mode
          },
          isCompiling: true
        }
      };
    });

    if (compileInFlightRef.current) {
      if (shouldCancelInFlightLatexCompile({
        source: pendingSourceRef.current,
        sourcePath,
        diagramRevision: diagramAssetsRevisionRef.current,
        graphRevision: graphAssetsRevisionRef.current
      })) {
        compileRequestRef.current += 1;
        setCompilerStatus({
          phase: "compiling",
          mode: "worker",
          label: "Cancelling stale LaTeX compile",
          detail: "A newer edit is ready; stopping the current BusyTeX worker"
        });
        cancelLatexCompile();
      }

      return;
    }

    scheduleCompileAfterPaint(debounced ? COMPILE_DEBOUNCE_MS : 0);
  }, [clearScheduledCompile, isPaperView, scheduleCompileAfterPaint, shouldCancelInFlightLatexCompile]);

  const formatActiveSource = useCallback((reason: "compile" | "manual") => {
    if (!isSourceFileEditable || isInspectingGraphSource) {
      return sourceEditorValue;
    }

    const sourcePath = activeSourcePathRef.current;
    const language = getSourceLanguage(sourcePath);
    const toolLanguage = getEditorToolLanguage(language);
    const formatter = toolLanguage
      ? snapshot.preferences.editorTooling.languages[toolLanguage].formatter
      : "disabled";

    if (
      formatter === "disabled" ||
      (reason === "compile" && !snapshot.preferences.editorTooling.formatOnCompile)
    ) {
      if (reason === "manual") {
        setCompilerStatus({
          phase: "ready",
          mode: "worker",
          label: "No formatter enabled",
          detail: `${formatSourceLanguageLabel(language)} formatting is disabled for ${sourcePath}`
        });
      }

      return sourceEditorValue;
    }

    const result = formatSourceWithEditorTooling({
      language,
      path: sourcePath,
      preferences: snapshot.preferences.editorTooling,
      source: sourceEditorValue
    });

    if (result.changed) {
      previewSourceDraftRef.current = result.source;
      setSnapshot((currentSnapshot) => updateActiveDocument(currentSnapshot, result.source));
      setCompilerStatus({
        phase: "ready",
        mode: "worker",
        label: "Source formatted",
        detail: `${formatSourceLanguageLabel(language)} formatter updated ${sourcePath}`
      });
    } else if (reason === "manual") {
      setCompilerStatus({
        phase: "ready",
        mode: "worker",
        label: "Source already formatted",
        detail: `${formatSourceLanguageLabel(language)} formatter made no changes to ${sourcePath}`
      });
    }

    return result.source;
  }, [
    isInspectingGraphSource,
    isSourceFileEditable,
    snapshot.preferences.editorTooling,
    sourceEditorValue
  ]);

  const formatActiveSourceForCompile = useCallback(
    () => formatActiveSource("compile"),
    [formatActiveSource]
  );

  const handleFormatDocument = useCallback(() => {
    formatActiveSource("manual");
    editorRef.current?.focus();
  }, [formatActiveSource]);

  useEffect(() => {
    handleFormatDocumentRef.current = handleFormatDocument;
  }, [handleFormatDocument]);

  const handleCompile = useCallback(() => {
    const sourcePath = activeSourcePathRef.current;
    const sourceLanguage = getSourceLanguage(sourcePath);
    const normalizedSourcePath = normalizeWorkspacePath(sourcePath);
    const latexPdfOutputPath = sourceLanguage === "latex" ? getLatexPdfOutputPath(sourcePath) : null;
    const activePreviewCompileSourcePath = activePreviewPath
      ? resolveLatexSourcePathForPdfPreview(
          activePreviewPath,
          selectedProjectRepository,
          sourcePath
        )
      : null;
    const activePreviewBelongsToSource = Boolean(
      activePreviewPath &&
        normalizedSourcePath &&
        (normalizeWorkspacePath(activePreviewPath) === normalizedSourcePath ||
          normalizeWorkspacePath(activePreviewPath) === latexPdfOutputPath ||
          normalizeWorkspacePath(activePreviewCompileSourcePath ?? "") === normalizedSourcePath)
    );
    const shouldActivateCompilePreview = !activePreviewPath || activePreviewBelongsToSource;
    const openCompilePreviewTab = (path: string, options: { forceActivate?: boolean } = {}) => {
      openPreviewTab(path, { activate: options.forceActivate ?? shouldActivateCompilePreview });
    };

    if (!isActiveSourceCompilableRef.current && sourceLanguage !== "markdown") {
      return;
    }

    const nextSource = formatActiveSourceForCompile();
    previewSourceDraftRef.current = nextSource;

    if (sourceLanguage === "markdown") {
      openCompilePreviewTab(sourcePath);
      setCompileResult(null);
      setCompilerStatus({
        phase: "ready",
        mode: "worker",
        label: "Markdown preview ready"
      });
      return;
    }

    if (sourceLanguage === "latex" && selectedProjectRepository) {
      const savedResult = loadSavedLatexPdfCompileResult({
        allowStale: false,
        project: selectedProjectRepository,
        source: nextSource,
        sourcePath
      });

      if (savedResult?.ok) {
        openCompilePreviewTab(getLatexPdfOutputPath(getLatexPdfSourcePathForResult(sourcePath, savedResult)), { forceActivate: true });

        clearScheduledCompile();

        if (compileInFlightRef.current && compileInFlightLanguageRef.current === "latex") {
          compileRequestRef.current += 1;
          cancelLatexCompile("LaTeX compile was skipped because a matching PDF already exists.");
        }

        const sourcePathKey = normalizeWorkspacePath(sourcePath);
        const readyStatus: CompilerStatus = {
          phase: "ready",
          mode: "worker",
          label: "Saved PDF preview ready"
        };

        setIsCompiling(false);
        setCompileResult(savedResult);
        setLastSuccessfulResult(savedResult);
        setCompilerStatus(readyStatus);
        setCompilePreviewsByPath((currentPreviews) => ({
          ...currentPreviews,
          [sourcePathKey]: createCompilePreviewState(sourcePathKey, {
            result: savedResult,
            lastSuccessfulResult: savedResult,
            compilerStatus: readyStatus,
            isCompiling: false
          })
        }));
        appendBuildLogEntry({
          sourcePath,
          language: "latex",
          engine: savedResult.engine,
          ok: true,
          startedAt: new Date().toISOString(),
          durationMs: 0,
          diagnostics: savedResult.diagnostics,
          metadata: savedResult.metadata,
          trigger: "manual",
          compileMode: "quick",
          cached: true,
          outputChanged: false,
          rawLog: savedResult.output.content,
          packageDetails: extractBuildLogPackageDetails(savedResult.output.content),
          shellEscapeUnavailable: hasShellEscapeConstraint(savedResult.output.content)
        });
        return;
      }
    }

    if (sourceLanguage !== "latex") {
      openCompilePreviewTab(sourcePath);
    }

    pendingCompileTriggerRef.current = "manual";
    queueCompile(false);
  }, [
    activePreviewPath,
    appendBuildLogEntry,
    clearScheduledCompile,
    formatActiveSourceForCompile,
    openPreviewTab,
    queueCompile,
    selectedProjectRepository
  ]);

  useEffect(() => {
    handleCompileRef.current = handleCompile;
  }, [handleCompile]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    previewSourceDraftRef.current = sourceEditorValue;
    if (!isActiveSourceCompilable) {
      clearScheduledCompile();
      compileRequestRef.current += 1;
      setIsCompiling(false);
      setCompileResult(null);
      setCompilerStatus({
        phase: "idle",
        mode: "worker",
        label: "No compiler for active file"
      });
      return;
    }

    if (activeSourceLanguage !== "typst") {
      if (activeSourceLanguage !== "latex") {
        clearScheduledCompile();
        setIsCompiling(false);
      }
      return;
    }

    if (activePreviewPath !== normalizedActiveSourcePath) {
      return;
    }

    if (compileResult === null || snapshot.preferences.liveCompilation) {
      pendingCompileTriggerRef.current = "auto";
      queueCompile(compileResult !== null);
    }
  }, [
    activePreviewPath,
    activeSourceLanguage,
    activeSourcePath,
    clearScheduledCompile,
    sourceEditorValue,
    diagramAssetsRevision,
    compileResult,
    graphAssetsRevision,
    isHydrated,
    isActiveSourceCompilable,
    normalizedActiveSourcePath,
    queueCompile,
    snapshot.preferences.liveCompilation
  ]);

  useEffect(() => {
    if (!isHydrated || compileResultRef.current === null) {
      return;
    }

    if (activeSourceLanguage !== "typst") {
      return;
    }

    if (activePreviewPath !== normalizedActiveSourcePath) {
      return;
    }

    pendingCompileTriggerRef.current = "preview";
    queueCompile(false);
  }, [
    activePreviewPath,
    activeSourceLanguage,
    isHydrated,
    isPaperView,
    normalizedActiveSourcePath,
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
    editorRef.current?.toggleTextFormat("bold");
  }, []);

  const handleItalic = useCallback(() => {
    editorRef.current?.toggleTextFormat("italic");
  }, []);

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
    editorRef.current?.toggleTextFormat("underline");
  }, []);

  const handleCycleHeading = useCallback(() => {
    editorRef.current?.cycleCurrentLinesHeading();
  }, []);

  const handleInsertMatrix = useCallback(() => {
    editorRef.current?.insertMathTemplate(buildMatrixTemplate(matrixSettings));
  }, [matrixSettings]);

  const handleInsertTable = useCallback(() => {
    handleInsertEditorTemplate(buildTableTemplate(tableSettings));
  }, [handleInsertEditorTemplate, tableSettings]);

  const toggleToolbarMenu = useCallback((menu: "matrix" | "table" | "symbols") => {
    setOpenToolbarMenu((current) => (current === menu ? null : menu));
  }, []);

  const mobileKeyboardLabels = activeSourceLanguage === "typst" || activeSourceLanguage === "latex" || activeSourceLanguage === "markdown"
    ? snapshot.preferences.mobileKeyboard.keys[activeSourceLanguage]
    : [];
  const mobileKeyboardKeys = resolveMobileKeyboardKeys(activeSourceLanguage, mobileKeyboardLabels);

  const handleMobileKeyboardKey = useCallback((key: MobileKeyboardKey) => {
    switch (key.action.type) {
      case "text":
        editorRef.current?.insertText(key.action.value);
        break;
      case "template":
        editorRef.current?.insertTemplate(key.action.value);
        break;
      case "wrap":
        editorRef.current?.surroundSelection(key.action.before, key.action.after);
        break;
      case "lineToggle":
        editorRef.current?.toggleCurrentLines(key.action.prefix, key.action.alternatePrefix);
        break;
    }
  }, []);

  const handleEditorSourceDoubleClick = useCallback((position: { line: number; column: number }) => {
    setPreviewForwardSearchSource({
      path: normalizedActiveSourcePath,
      line: position.line,
      column: position.column
    });

    if (isMobileWorkspace) {
      setMobileWorkspaceTab("preview");
    } else if (isPreviewCollapsed) {
      setIsPreviewCollapsed(false);
    }
  }, [isMobileWorkspace, isPreviewCollapsed, normalizedActiveSourcePath]);

  const handlePreviewSourceJump = useCallback((sourceLink: PreviewSourceLink) => {
    const sourceRange = sourceLink.source;
    const sourcePath = resolvePreviewSourcePath(
      sourceRange.path,
      normalizedActiveSourcePath,
      activePreviewPath,
      activeSourceLanguageRef.current
    );

    if (!sourcePath) {
      editorRef.current?.focusRange(sourceRange);
      resetDocumentScrollPosition();
      return;
    }

    if (sourcePath !== normalizedActiveSourcePath) {
      openSourceTab(sourcePath);
      setSelectedWorkspacePath(sourcePath);
      setSelectedWorkspacePaths([sourcePath]);
      setWorkspaceSelectionAnchorPath(sourcePath);
      const targetDocument = snapshot.project.documents.find(
        (document) => normalizeWorkspacePath(document.name) === sourcePath
      );

      if (targetDocument) {
        setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, targetDocument.id));
      }
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        editorRef.current?.focusRange(sourceRange);
        resetDocumentScrollPosition();
      });
    });
  }, [activePreviewPath, normalizedActiveSourcePath, openSourceTab, snapshot.project.documents]);

  const handleSelectDocument = useCallback((
    documentId: string,
    options: { sourceTabMode?: "pin" | "preview" | "preserve" } = {}
  ) => {
    const nextDocument = snapshot.project.documents.find((document) => document.id === documentId);

    if (nextDocument) {
      const nextPath = normalizeWorkspacePath(nextDocument.name);

      if (options.sourceTabMode === "pin") {
        openSourceTab(nextPath);
      } else if (options.sourceTabMode !== "preserve") {
        previewSourceTab(nextPath);
      }

      setSelectedWorkspacePath(nextPath);
      setSelectedWorkspacePaths([nextPath]);
      setWorkspaceSelectionAnchorPath(nextPath);
    }

    setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, documentId));
  }, [openSourceTab, previewSourceTab, snapshot.project.documents]);

  const handleActivateSourceTab = useCallback(
    (path: string) => {
      const normalizedPath = normalizeWorkspacePath(path);
      const targetDocument = snapshot.project.documents.find(
        (document) => normalizeWorkspacePath(document.name) === normalizedPath
      );

      if (!targetDocument) {
        return;
      }

      setInspectedWorkspacePath(null);
      handleSelectDocument(targetDocument.id, { sourceTabMode: "preserve" });

      if (isMobileWorkspace) {
        setMobileWorkspaceTab("editor");
      }
    },
    [handleSelectDocument, isMobileWorkspace, snapshot.project.documents]
  );

  const handleCloseSourceTab = useCallback(
    (path: string) => {
      const normalizedPath = normalizeWorkspacePath(path);
      const normalizedSourceTabs = normalizeUniqueWorkspacePaths(sourceTabPaths);
      const normalizedTransientPath = transientSourceTabPath
        ? normalizeWorkspacePath(transientSourceTabPath)
        : null;
      const isPinnedTab = normalizedSourceTabs.includes(normalizedPath);

      if (!isPinnedTab) {
        if (normalizedPath === normalizedTransientPath) {
          setTransientSourceTabPath(null);
        }

        if (normalizedPath === normalizedActiveSourcePath) {
          const nextPath = normalizedSourceTabs[0];

          if (nextPath) {
            handleActivateSourceTab(nextPath);
          }
        }

        return;
      }

      const closingIndex = normalizedSourceTabs.indexOf(normalizedPath);
      const nextTabs = normalizedSourceTabs.filter((tabPath) => tabPath !== normalizedPath);
      const nextActivePath =
        normalizedPath === normalizedActiveSourcePath
          ? nextTabs[Math.min(Math.max(closingIndex, 0), nextTabs.length - 1)] ??
            (normalizedTransientPath && normalizedTransientPath !== normalizedPath
              ? normalizedTransientPath
              : null)
          : normalizedActiveSourcePath;

      if (normalizedPath === normalizedActiveSourcePath) {
        if (nextActivePath) {
          handleActivateSourceTab(nextActivePath);
        }
      }

      setProjectRepository((project) => ({
        ...project,
        selection: {
          ...project.selection,
          activeFilePath: nextActivePath ?? project.selection.activeFilePath,
          openFilePaths: nextTabs
        }
      }));
      setSourceTabPaths(nextTabs);
    },
    [
      handleActivateSourceTab,
      normalizedActiveSourcePath,
      setProjectRepository,
      sourceTabPaths,
      transientSourceTabPath
    ]
  );

  const closeSourceTabRef = useRef(handleCloseSourceTab);
  closeSourceTabRef.current = handleCloseSourceTab;

  const handleCloseActiveSourceTab = useCallback(() => {
    const activePath = activeSourcePathRef.current;

    if (activePath) {
      closeSourceTabRef.current(activePath);
    }
  }, []);

  const handleActivatePreviewTab = useCallback(
    (path: string) => {
      openPreviewTab(path);
      if (isMobileWorkspace) {
        setMobileWorkspaceTab("preview");
      }
    },
    [isMobileWorkspace, openPreviewTab]
  );

  const handleClosePreviewTab = useCallback(
    (path: string) => {
      const normalizedPath = normalizeWorkspacePath(path);
      const normalizedPreviewTabs = normalizeUniqueWorkspacePaths(previewTabPaths);
      const closingIndex = normalizedPreviewTabs.indexOf(normalizedPath);
      const nextTabs = normalizedPreviewTabs.filter((tabPath) => tabPath !== normalizedPath);

      if (activePreviewPath === normalizedPath) {
        setActivePreviewPath(
          nextTabs[Math.min(Math.max(closingIndex, 0), nextTabs.length - 1)] ?? null
        );
      }

      setPreviewTabPaths(nextTabs);
    },
    [activePreviewPath, previewTabPaths]
  );

  const handleWorkspaceTabWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY;
  }, []);

  const handleWorkspaceTabDragStart = useCallback(
    (kind: WorkspaceTabKind, path: string) => (event: ReactDragEvent<HTMLDivElement>) => {
      const normalizedPath = normalizeWorkspacePath(path);

      workspaceTabDragRef.current = { kind, path: normalizedPath };
      setDraggingWorkspaceTab({ kind, path: normalizedPath });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", normalizedPath);
      event.dataTransfer.setData("application/x-typr-tab-kind", kind);
    },
    []
  );

  const handleWorkspaceTabDragOver = useCallback(
    (kind: WorkspaceTabKind, path: string) => (event: ReactDragEvent<HTMLDivElement>) => {
      const draggingTab = workspaceTabDragRef.current;
      const normalizedPath = normalizeWorkspacePath(path);

      if (
        !draggingTab ||
        draggingTab.kind !== kind ||
        draggingTab.path === normalizedPath
      ) {
        setWorkspaceTabDropTarget(null);
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const tabBounds = event.currentTarget.getBoundingClientRect();
      const side = event.clientX > tabBounds.left + tabBounds.width / 2 ? "after" : "before";

      setWorkspaceTabDropTarget((currentTarget) =>
        currentTarget?.kind === kind &&
        currentTarget.path === normalizedPath &&
        currentTarget.side === side
          ? currentTarget
          : { kind, path: normalizedPath, side }
      );
    },
    []
  );

  const handleWorkspaceTabDrop = useCallback(
    (kind: WorkspaceTabKind, targetPath: string) => (event: ReactDragEvent<HTMLDivElement>) => {
      const draggingTab = workspaceTabDragRef.current;

      if (!draggingTab || draggingTab.kind !== kind) {
        return;
      }

      event.preventDefault();

      const tabBounds = event.currentTarget.getBoundingClientRect();
      const insertAfterTarget = event.clientX > tabBounds.left + tabBounds.width / 2;

      if (kind === "source") {
        const normalizedSourceTabs = normalizeUniqueWorkspacePaths(sourceTabPaths);
        const nextTabs = reorderWorkspacePaths(
          normalizedSourceTabs,
          draggingTab.path,
          targetPath,
          insertAfterTarget
        );

        if (!areWorkspacePathListsEqual(normalizedSourceTabs, nextTabs)) {
          setSourceTabPaths(nextTabs);
          setProjectRepository((project) => ({
            ...project,
            selection: {
              ...project.selection,
              openFilePaths: nextTabs
            }
          }));
        }
      } else {
        const normalizedPreviewTabs = normalizeUniqueWorkspacePaths(previewTabPaths);
        const nextTabs = reorderWorkspacePaths(
          normalizedPreviewTabs,
          draggingTab.path,
          targetPath,
          insertAfterTarget
        );

        if (!areWorkspacePathListsEqual(normalizedPreviewTabs, nextTabs)) {
          setPreviewTabPaths(nextTabs);
        }
      }

      workspaceTabDragRef.current = null;
      setDraggingWorkspaceTab(null);
      setWorkspaceTabDropTarget(null);
    },
    [previewTabPaths, setProjectRepository, sourceTabPaths]
  );

  const handleWorkspaceTabDragEnd = useCallback(() => {
    workspaceTabDragRef.current = null;
    setDraggingWorkspaceTab(null);
    setWorkspaceTabDropTarget(null);
  }, []);

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
        const selectablePaths = visibleWorkspaceNodes.map((entry) => entry.path);
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
    [selectedWorkspacePath, visibleWorkspaceNodes, workspaceSelectionAnchorPath]
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
      setProjectRepository((project) =>
        renameProjectRepositoryDisplayName(project, workspaceRenameDraft)
      );
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
  }, [handleCancelWorkspaceRename, renamingWorkspacePath, setProjectRepository, visibleWorkspaceTree, workspaceRenameDraft]);

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

  const handleDownloadWorkspaceNode = useCallback(
    (node: WorkspaceTreeNode) => {
      const downloadPaths =
        selectedWorkspacePaths.includes(node.path) && selectedWorkspacePaths.length > 1
          ? selectedWorkspacePaths
          : [node.path];
      const baseName =
        downloadPaths.length === 1 ? getWorkspaceBaseName(node.path) : selectedProjectRepository?.displayName;

      downloadWorkspaceFiles(downloadPaths, {
        zipName: `${getSafeDownloadName(baseName ?? "typr-files", "typr-files")}.zip`,
        preferSingleFile: downloadPaths.length === 1 && node.kind === "file"
      });
    },
    [downloadWorkspaceFiles, selectedProjectRepository?.displayName, selectedWorkspacePaths]
  );

  const handleDownloadWorkspaceProjectFiles = useCallback(() => {
    if (!selectedProjectRepository) {
      return;
    }

    downloadWorkspaceFiles(
      listProjectEntries(selectedProjectRepository).map((entry) => entry.path),
      {
        zipName: `${getSafeDownloadName(selectedProjectRepository.displayName, "typr-project")}-files.zip`,
        preferSingleFile: false
      }
    );
  }, [downloadWorkspaceFiles, selectedProjectRepository]);

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
        updateWorkspaceOpenFolders((currentPaths) => {
          const nextPaths = new Set(currentPaths);
          nextPaths.add(path);
          return nextPaths;
        });
        workspaceHoverExpandTimerRef.current = null;
      }, MOVE_HOVER_EXPAND_DELAY_MS);
    },
    [collapsedFileFolders, updateWorkspaceOpenFolders]
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
    const targetNode = selectedWorkspacePath
      ? findWorkspaceNodeByPath(workspaceTree, selectedWorkspacePath)
      : null;
    const targetFolderPath = targetNode?.kind === "folder"
      ? targetNode.path
      : selectedWorkspacePath
        ? getWorkspaceParentPath(selectedWorkspacePath)
        : null;
    const requestedName = targetFolderPath ? joinWorkspacePath(targetFolderPath, "new-file-1") : undefined;

    setSnapshot((currentSnapshot) => createDocument(currentSnapshot, requestedName));
    window.alert(
      "Created an extensionless file. Typst and LaTeX compilation is only possible after .typ or .tex has been added to the filename."
    );
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
    const parsedUrl = parseGitHubRepositoryUrl(value);
    if (!parsedUrl) {
      return false;
    }

    handleGitRemoteConfigChange("owner", parsedUrl.owner);
    handleGitRemoteConfigChange("repo", parsedUrl.repo);
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

  const handleToggleGitHubCloneFlow = useCallback(() => {
    setGitHubClone((current) => {
      if (current.isOpen && current.mode === "clone") {
        return {
          ...current,
          isOpen: false
        };
      }

      return {
        ...createInitialGitHubCloneState(),
        isOpen: true,
        mode: "clone",
        status: gitHubDiscovery.status === "connected" ? "connected" : "idle",
        token: selectedGitToken,
        accountLogin: gitHubDiscovery.accountLogin,
        owners: gitHubDiscovery.owners,
        owner: gitHubDiscovery.accountLogin ?? "",
        repos: gitHubDiscovery.repos,
        isLoadingRepos: gitHubDiscovery.isLoadingRepos
      };
    });
  }, [
    gitHubDiscovery.accountLogin,
    gitHubDiscovery.owners,
    gitHubDiscovery.repos,
    gitHubDiscovery.isLoadingRepos,
    gitHubDiscovery.status,
    selectedGitToken
  ]);

  const handleToggleGitHubCreateFlow = useCallback(() => {
    setGitHubClone((current) => {
      if (current.isOpen && current.mode === "create") {
        return {
          ...current,
          isOpen: false
        };
      }

      return {
        ...createInitialGitHubCloneState(),
        isOpen: true,
        mode: "create",
        status: gitHubDiscovery.status === "connected" ? "connected" : "idle",
        token: selectedGitToken,
        accountLogin: gitHubDiscovery.accountLogin,
        owners: gitHubDiscovery.owners,
        owner: gitHubDiscovery.accountLogin ?? "",
        repos: gitHubDiscovery.repos,
        isLoadingRepos: gitHubDiscovery.isLoadingRepos,
        branch: "main",
        projectName: selectedProjectRepository?.displayName ?? ""
      };
    });
  }, [
    gitHubDiscovery.accountLogin,
    gitHubDiscovery.owners,
    gitHubDiscovery.repos,
    gitHubDiscovery.isLoadingRepos,
    gitHubDiscovery.status,
    selectedGitToken,
    selectedProjectRepository?.displayName
  ]);

  useEffect(() => {
    if (!gitHubClone.isOpen || gitHubDiscovery.status !== "connected") {
      return;
    }

    setGitHubClone((current) => ({
      ...current,
      status: "connected",
      token: selectedGitToken,
      accountLogin: gitHubDiscovery.accountLogin,
      owners: gitHubDiscovery.owners,
      owner: current.owner || gitHubDiscovery.accountLogin || "",
      repos: current.repos.length > 0 ? current.repos : gitHubDiscovery.repos,
      isLoadingRepos: gitHubDiscovery.isLoadingRepos
    }));
  }, [
    gitHubClone.isOpen,
    gitHubDiscovery.accountLogin,
    gitHubDiscovery.owners,
    gitHubDiscovery.repos,
    gitHubDiscovery.isLoadingRepos,
    gitHubDiscovery.status,
    selectedGitToken
  ]);

  const handleGitHubCloneOwnerChange = useCallback((owner: string) => {
    setGitHubClone((current) => ({
      ...current,
      owner,
      repo: "",
      branch: "main",
      projectName: "",
      repos: [],
      branches: [],
      message: ""
    }));
  }, []);

  const handleGitHubCloneRepoSelection = useCallback((repoName: string) => {
    setGitHubClone((current) => {
      const selectedRepo = current.repos.find((repo) => repo.name === repoName);
      const nextBranch = selectedRepo?.defaultBranch ?? "main";

      return {
        ...current,
        repo: repoName,
        branch: nextBranch,
        projectName:
          !current.projectName || current.projectName === current.repo
            ? repoName
            : current.projectName,
        branches: []
      };
    });
  }, []);

  useEffect(() => {
    if (
      gitHubClone.status !== "connected" ||
      !gitHubClone.token.trim() ||
      !gitHubClone.owner.trim()
    ) {
      return;
    }

    let cancelled = false;
    const token = gitHubClone.token.trim();
    const owner = gitHubClone.owner.trim();

    setGitHubClone((current) => ({
      ...current,
      repos: [],
      isLoadingRepos: true
    }));

    void remoteGitService
      .listRepositories(owner, () => token)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setGitHubClone((current) => ({
            ...current,
            message: redactGitSecrets(result.message, [token]),
            repos: [],
            isLoadingRepos: false
          }));
          return;
        }

        setGitHubClone((current) => ({
          ...current,
          message: result.message,
          repos: result.value,
          isLoadingRepos: false
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [gitHubClone.owner, gitHubClone.status, gitHubClone.token, remoteGitService]);

  useEffect(() => {
    if (
      gitHubClone.status !== "connected" ||
      !gitHubClone.token.trim() ||
      !gitHubClone.owner.trim() ||
      !gitHubClone.repo.trim()
    ) {
      return;
    }

    let cancelled = false;
    const token = gitHubClone.token.trim();
    const owner = gitHubClone.owner.trim();
    const repo = gitHubClone.repo.trim();

    setGitHubClone((current) => ({
      ...current,
      branches: [],
      isLoadingBranches: true
    }));

    void remoteGitService
      .listBranches({ owner, repo }, () => token)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setGitHubClone((current) => ({
            ...current,
            message: redactGitSecrets(result.message, [token]),
            branches: [],
            isLoadingBranches: false
          }));
          return;
        }

        setGitHubClone((current) => ({
          ...current,
          message: result.message,
          branches: result.value,
          branch:
            result.value.some((branch) => branch.name === current.branch)
              ? current.branch
              : result.value[0]?.name ?? current.branch,
          isLoadingBranches: false
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    gitHubClone.owner,
    gitHubClone.repo,
    gitHubClone.status,
    gitHubClone.token,
    remoteGitService
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

  const handleProjectGitignoreChange = useCallback(
    (value: string) => {
      setProjectRepository((project) =>
        writeProjectFile(project, DEFAULT_PROJECT_GITIGNORE_PATH, value)
      );
    },
    [setProjectRepository]
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

  const handleSelectLocalProject = useCallback(
    (projectId: string) => {
      const nextProject = projectStorage.projects.find((project) => project.id === projectId);
      selectStoredProjectRepository(projectId);
      if (nextProject) {
        addDefaultGitManagedProject(nextProject, nextProject.displayName);
        setIsTrashViewOpen(false);
        setSelectedWorkspacePath(nextProject.selection.activeFilePath);
        setSelectedWorkspacePaths(nextProject.selection.activeFilePath ? [nextProject.selection.activeFilePath] : []);
        setWorkspaceSelectionAnchorPath(nextProject.selection.activeFilePath);
        setWorkspaceContextMenu(null);
        setGitRefreshToken((token) => token + 1);
      }
    },
    [addDefaultGitManagedProject, projectStorage.projects, selectStoredProjectRepository]
  );

  const handleProjectDragStart = useCallback((event: ReactDragEvent<HTMLElement>, projectId: string) => {
    setDraggedProjectId(projectId);
    setProjectDragOverId(projectId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", projectId);
  }, []);

  const handleProjectDragOver = useCallback((event: ReactDragEvent<HTMLElement>, projectId: string) => {
    if (!draggedProjectId || draggedProjectId === projectId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setProjectDragOverId(projectId);
  }, [draggedProjectId]);

  const handleProjectDrop = useCallback((event: ReactDragEvent<HTMLElement>, targetProjectId: string) => {
    event.preventDefault();
    const sourceProjectId = draggedProjectId ?? event.dataTransfer.getData("text/plain");
    setDraggedProjectId(null);
    setProjectDragOverId(null);

    if (!sourceProjectId || sourceProjectId === targetProjectId) {
      return;
    }

    setProjectStorage((currentStorage) => {
      const sourceIndex = currentStorage.projects.findIndex((project) => project.id === sourceProjectId);
      const targetIndex = currentStorage.projects.findIndex((project) => project.id === targetProjectId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return currentStorage;
      }

      const projects = [...currentStorage.projects];
      const [movedProject] = projects.splice(sourceIndex, 1);
      projects.splice(targetIndex, 0, movedProject);

      return {
        ...currentStorage,
        projects
      };
    });
  }, [draggedProjectId]);

  const handleProjectDragEnd = useCallback(() => {
    setDraggedProjectId(null);
    setProjectDragOverId(null);
  }, []);

  const handleOpenRecentFile = useCallback(
    (entry: RecentFileEntry) => {
      const normalizedPath = normalizeWorkspacePath(entry.path);
      const project = projectStorage.projects.find((candidate) => candidate.id === entry.projectId);
      const projectFile = project
        ? listProjectEntries(project).find(
            (candidate) =>
              candidate.kind === "file" &&
              normalizeWorkspacePath(candidate.path) === normalizedPath
          )
        : null;

      if (!project || !projectFile || !normalizedPath) {
        setRecentWorkspaceState((current) => ({
          ...current,
          files: current.files.filter(
            (recentFile) =>
              recentFile.projectId !== entry.projectId || recentFile.path !== entry.path
          )
        }));
        setSyncFeedback({ tone: "error", text: "That recent file is no longer available." });
        return;
      }

      const nextOpenFilePaths = isTextWorkspaceFile(normalizedPath)
        ? appendUniqueWorkspacePath(project.selection.openFilePaths ?? [], normalizedPath)
        : project.selection.openFilePaths ?? [];
      const nextProject: TyprProjectRepository = {
        ...project,
        selection: {
          activeFilePath: normalizedPath,
          openFilePaths: nextOpenFilePaths
        },
        editor: {
          ...project.editor,
          previewPath:
            getSourceLanguage(normalizedPath) === "markdown" || getWorkspacePreviewMimeType(normalizedPath)
              ? normalizedPath
              : project.editor.previewPath
        }
      };

      setProjectStorage((currentStorage) => ({
        ...currentStorage,
        selectedProjectId: nextProject.id,
        projects: currentStorage.projects.map((candidate) =>
          candidate.id === nextProject.id ? nextProject : candidate
        )
      }));
      setRawSnapshot((currentSnapshot) => ({
        ...currentSnapshot,
        project: projectRepositoryToLegacyProject(nextProject, currentSnapshot.project)
      }));
      addDefaultGitManagedProject(nextProject, nextProject.displayName);
      setIsTrashViewOpen(false);
      setSelectedWorkspacePath(normalizedPath);
      setSelectedWorkspacePaths([normalizedPath]);
      setWorkspaceSelectionAnchorPath(normalizedPath);
      setWorkspaceContextMenu(null);
      setInspectedWorkspacePath(null);
      setGitRefreshToken((token) => token + 1);

      if (isTextWorkspaceFile(normalizedPath)) {
        setSourceTabPaths(nextOpenFilePaths);
        setTransientSourceTabPath(null);
      } else {
        setSourceTabPaths([]);
      }

      if (getSourceLanguage(normalizedPath) === "markdown" || getWorkspacePreviewMimeType(normalizedPath)) {
        setPreviewTabPaths([normalizedPath]);
        setActivePreviewPath(normalizedPath);
        setIsPreviewCollapsed(false);
      } else {
        setPreviewTabPaths([]);
        setActivePreviewPath(null);
      }

      if (isMobileWorkspace) {
        setMobileWorkspaceTab(isTextWorkspaceFile(normalizedPath) ? "editor" : "preview");
      }
    },
    [addDefaultGitManagedProject, isMobileWorkspace, projectStorage.projects, setSyncFeedback]
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
        text: "Disconnected GitHub. The GitHub repository was not deleted."
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
      text: `Connected GitHub to ${remoteConfig.owner}/${remoteConfig.repo}.`
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
    await handleConnectGitHub();
  }, [handleConnectGitHub]);

  const handleCreateLocalProject = useCallback(() => {
    const enteredName = window.prompt("Project name", "Untitled project");
    if (enteredName === null) {
      return;
    }

    const displayName = enteredName.trim() || "Untitled project";
    const nextProject = createEmptyProjectRepository({
      displayName,
      defaultFileName: null
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

  const handleRenameLocalProject = useCallback(
    (projectId: string) => {
      const projectToRename = projectStorage.projects.find((project) => project.id === projectId);

      if (!projectToRename) {
        return;
      }

      const nextName = window.prompt("Project name", projectToRename.displayName);

      if (nextName === null) {
        return;
      }

      const renamedProject = renameProjectRepositoryDisplayName(projectToRename, nextName);

      if (renamedProject === projectToRename) {
        return;
      }

      if (selectedProjectRepository?.id === projectId) {
        setProjectRepository((project) =>
          project.id === projectId ? renameProjectRepositoryDisplayName(project, nextName) : project
        );
      } else {
        setProjectStorage((currentStorage) => ({
          ...currentStorage,
          projects: currentStorage.projects.map((project) =>
            project.id === projectId ? renamedProject : project
          )
        }));
      }

      setSyncFeedback({
        tone: "success",
        text: `Renamed local project to "${renamedProject.displayName}".`
      });
    },
    [projectStorage.projects, selectedProjectRepository?.id, setProjectRepository]
  );

  const handleDeleteSelectedProject = useCallback(async (projectId?: string) => {
    const projectToDelete = projectStorage.projects.find(
      (project) => project.id === (projectId ?? selectedProjectRepository?.id)
    );

    if (!projectToDelete) {
      return;
    }

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
            defaultFileName: null
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
    (project: TyprProjectRepository, name: string, config: RemoteGitConfig) => ({
      ...createEmptyGitManagedProject({
        projectId: project.id,
        projectName: name
      }),
      name,
      owner: config.owner,
      repo: config.repo,
      connected: true,
      branch: config.branch,
      remoteName: config.remoteName
    }),
    []
  );

  const handleCreateGitHubRepoFromCurrentProject = useCallback(async () => {
    const token = gitHubClone.token.trim();
    const owner = gitHubClone.owner.trim();
    const repo = gitHubClone.repo.trim();
    const branch = gitHubClone.branch.trim() || "main";

    if (!selectedProjectRepository) {
      setSyncFeedback({ tone: "error", text: "Select a local project first." });
      return;
    }
    if (!token || !owner || !repo || !branch) {
      setGitHubClone((current) => ({
        ...current,
        status: current.status === "connected" ? current.status : "error",
        message: "Connect GitHub, then choose owner, repo, and branch."
      }));
      setSyncFeedback({ tone: "error", text: "Connect GitHub, then choose owner, repo, and branch." });
      return;
    }

    const createConfig: RemoteGitConfig = {
      owner,
      repo,
      branch,
      remoteName: "origin"
    };
    const sourceEntries = listProjectEntries(selectedProjectRepository);
    setIsSyncing(true);
    setSyncFeedback({ tone: "neutral", text: `Creating ${owner}/${repo}...` });
    setGitHubClone((current) => ({
      ...current,
      message: `Creating ${owner}/${repo}...`,
      progress: null
    }));

    const createResult = await remoteGitService.createRepository(
      createConfig,
      () => token,
      {
        private: createGitHubRepoPrivate,
        description: `Created from ${selectedProjectRepository.displayName} in Typr`
      },
      { onProgress: (progress) => setSyncFeedback({ tone: "neutral", text: progress.message }) }
    );
    if (!createResult.ok) {
      const message = redactGitSecrets(createResult.message, [token]);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    let remoteProject = createEmptyProjectRepository({
      displayName: selectedProjectRepository.displayName,
      defaultFileName: null
    });
    const initResult = await repoBackend.initRepository(remoteProject);
    if (!initResult.ok) {
      const message = formatRepoError(initResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }
    remoteProject = initResult.value;

    const pullResult = await remoteGitService.pull(remoteProject, createConfig, () => token);
    if (!pullResult.ok || !pullResult.project) {
      const message = redactGitSecrets(pullResult.message, [token]);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    remoteProject = replaceProjectEntries(pullResult.project, sourceEntries);
    const stageResult = await repoBackend.stagePaths(remoteProject, ["."]);
    if (!stageResult.ok) {
      const message = formatRepoError(stageResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }
    const commitResult = await repoBackend.commit(remoteProject, {
      message: `Import ${selectedProjectRepository.displayName} from Typr`
    });
    if (!commitResult.ok) {
      const message = formatRepoError(commitResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    const pushResult = await remoteGitService.push(remoteProject, createConfig, () => token);
    setIsSyncing(false);
    if (!pushResult.ok) {
      const message = redactGitSecrets(pushResult.message, [token]);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    const managedProject = createManagedProjectForRepository(
      remoteProject,
      selectedProjectRepository.displayName,
      createConfig
    );
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
      [managedProject.id]: token
    }));
    setGitHubClone((current) => ({
      ...current,
      status: "connected",
      message: `Created ${owner}/${repo} and pushed ${commitResult.value.shortSha}.`,
      progress: null
    }));
    setGitRefreshToken((current) => current + 1);
    setSyncFeedback({
      tone: "success",
      text: `Created ${owner}/${repo} and pushed ${commitResult.value.shortSha}.`
    });
  }, [
    createGitHubRepoPrivate,
    createManagedProjectForRepository,
    gitHubClone.branch,
    gitHubClone.owner,
    gitHubClone.repo,
    gitHubClone.token,
    remoteGitService,
    repoBackend,
    replaceProjectEntries,
    selectProjectRepository,
    selectedProjectRepository
  ]);

  const handleCloneGitHubRepository = useCallback(async () => {
    const token = gitHubClone.token.trim();
    const owner = gitHubClone.owner.trim();
    const repo = gitHubClone.repo.trim();
    const branch = gitHubClone.branch.trim();
    const projectName = gitHubClone.projectName.trim() || repo;

    if (!token || !owner || !repo || !branch) {
      setGitHubClone((current) => ({
        ...current,
        status: current.status === "connected" ? current.status : "error",
        message: "Connect GitHub, then choose owner, repo, and branch."
      }));
      return;
    }

    const cloneConfig: RemoteGitConfig = {
      owner,
      repo,
      branch,
      remoteName: "origin"
    };

    setIsSyncing(true);
    setSyncFeedback({ tone: "neutral", text: `Cloning ${owner}/${repo}...` });
    setGitHubClone((current) => ({
      ...current,
      message: `Cloning ${owner}/${repo}...`,
      progress: null
    }));

    let importedProject = createEmptyProjectRepository({
      displayName: projectName,
      defaultFileName: null
    });
    const initResult = await repoBackend.initRepository(importedProject);

    if (!initResult.ok) {
      setIsSyncing(false);
      setGitHubClone((current) => ({
        ...current,
        status: "error",
        message: formatRepoError(initResult.error),
        progress: null
      }));
      setSyncFeedback({ tone: "error", text: formatRepoError(initResult.error) });
      return;
    }

    importedProject = initResult.value;

    const pullResult = await remoteGitService.pull(importedProject, cloneConfig, () => token, {
      onProgress: (progress) => {
        const nextProgress =
          typeof progress.current === "number" &&
          typeof progress.total === "number" &&
          progress.total > 0
            ? {
                current: Math.max(0, Math.min(progress.current, progress.total)),
                total: progress.total
              }
            : null;
        setSyncFeedback({ tone: "neutral", text: progress.message });
        setGitHubClone((current) => ({
          ...current,
          message: progress.message,
          progress: nextProgress ?? current.progress
        }));
      }
    });
    setIsSyncing(false);

    if (!pullResult.ok || !pullResult.project) {
      const message = redactGitSecrets(pullResult.message, [token]);
      setGitHubClone((current) => ({
        ...current,
        status: "error",
        message,
        progress: null
      }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    importedProject = renameProjectRepositoryDisplayName(pullResult.project, projectName);
    const managedProject = {
      ...createEmptyGitManagedProject({
        projectId: importedProject.id,
        projectName
      }),
      name: projectName,
      owner,
      repo,
      connected: true,
      branch,
      remoteName: cloneConfig.remoteName
    };

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
      [managedProject.id]: token
    }));
    setIsTrashViewOpen(false);
    setSelectedWorkspacePath(importedProject.selection.activeFilePath);
    setSelectedWorkspacePaths(importedProject.selection.activeFilePath ? [importedProject.selection.activeFilePath] : []);
    setWorkspaceSelectionAnchorPath(importedProject.selection.activeFilePath);
    setGitRefreshToken((current) => current + 1);
    setGitHubClone(createInitialGitHubCloneState());
    setSyncFeedback({
      tone: "success",
      text: `Cloned ${owner}/${repo}.`
    });
  }, [
    gitHubClone.branch,
    gitHubClone.owner,
    gitHubClone.projectName,
    gitHubClone.repo,
    gitHubClone.token,
    remoteGitService,
    repoBackend,
    selectProjectRepository
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

  const handleSnippetImport = useCallback((
    language: SnippetLanguage,
    nextSnippets: SnippetDefinition[]
  ) => {
    setCustomSnippets((currentSnippets) => ({
      ...currentSnippets,
      [language]: mergeSnippets([...currentSnippets[language], ...nextSnippets])
    }));
    setSnippetImportFeedback({
      tone: "success",
      text: `Imported ${nextSnippets.length} ${SNIPPET_LANGUAGE_LABELS[language]} snippet${nextSnippets.length === 1 ? "" : "s"}.`
    });
    setActiveSnippetLanguage(language);
    setSettingsTab("snippets");
    setIsSettingsOpen(true);
  }, []);

  const handleSnippetImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const result = parseSnippetImport(await file.text(), activeSnippetLanguage);

    if (!result.ok) {
      setSnippetImportFeedback({
        tone: "error",
        text: result.message
      });
      return;
    }

    handleSnippetImport(result.language, result.snippets);
  };

  const handleImportPastedSnippets = () => {
    const result = parseSnippetImport(snippetImportText, activeSnippetLanguage);

    if (!result.ok) {
      setSnippetImportFeedback({
        tone: "error",
        text: result.message
      });
      return;
    }

    handleSnippetImport(result.language, result.snippets);
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

  const handleCacheLatexBundle = useCallback(
    async (bundleId: LatexPackageBundleId) => {
      setInstallingLatexBundleId(bundleId);

      try {
        await cacheLatexPackageBundle(bundleId);
        await refreshLatexPackageCache();
        setLatexPackageFeedback({
          tone: "success",
          text: `Cached ${formatLatexPackageBundleLabel(bundleId)} LaTeX packages.`
        });
      } catch (error) {
        setLatexPackageFeedback({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : `Unable to cache ${formatLatexPackageBundleLabel(bundleId)} LaTeX packages.`
        });
      } finally {
        setInstallingLatexBundleId(null);
      }
    },
    [refreshLatexPackageCache]
  );

  const handleCacheLatexPackage = useCallback(
    async (entry: LatexPackageResolution, bundleAlreadyCached: boolean) => {
      if (!entry.bundleId) {
        return;
      }

      setInstallingLatexPackageName(entry.name);

      try {
        if (!bundleAlreadyCached) {
          await cacheLatexPackageBundle(entry.bundleId);
        }

        setCachedLatexPackageNames((currentNames) => {
          const nextNames = new Set(currentNames.map(normalizeLatexPackageSelectionName));
          const nextName = normalizeLatexPackageSelectionName(entry.name);

          if (nextName) {
            nextNames.add(nextName);
          }

          return [...nextNames].sort((left, right) => left.localeCompare(right));
        });
        await refreshLatexPackageCache();
        setLatexPackageFeedback({
          tone: "success",
          text: `Cached ${entry.name}.`
        });
      } catch (error) {
        setLatexPackageFeedback({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : `Unable to cache ${entry.name}.`
        });
      } finally {
        setInstallingLatexPackageName(null);
      }
    },
    [refreshLatexPackageCache]
  );

  const handleRemoveCachedLatexPackage = useCallback((packageName: string) => {
    const packageKey = normalizeLatexPackageSelectionName(packageName);

    setCachedLatexPackageNames((currentNames) =>
      currentNames.filter((currentName) => normalizeLatexPackageSelectionName(currentName) !== packageKey)
    );
    setLatexPackageFeedback({
      tone: "neutral",
      text: `Removed ${packageName}.`
    });
  }, []);

  const handleRemoveLatexBundle = useCallback(
    async (bundleId: LatexPackageBundleId) => {
      try {
        await removeLatexPackageBundleFromCache(bundleId);
        await refreshLatexPackageCache();
        setLatexPackageFeedback({
          tone: "neutral",
          text: `Removed ${formatLatexPackageBundleLabel(bundleId)} LaTeX packages.`
        });
      } catch {
        setLatexPackageFeedback({
          tone: "error",
          text: `Unable to remove ${formatLatexPackageBundleLabel(bundleId)} LaTeX packages.`
        });
      }
    },
    [refreshLatexPackageCache]
  );

  const handleClearLatexBundles = useCallback(async () => {
    setIsLatexPackageCacheClearing(true);

    try {
      await clearLatexPackageBundleCache();
      await refreshLatexPackageCache();
      setLatexPackageFeedback({
        tone: "neutral",
        text: "Cleared cached LaTeX package bundles."
      });
    } catch {
      setLatexPackageFeedback({
        tone: "error",
        text: "Unable to clear cached LaTeX package bundles."
      });
    } finally {
      setIsLatexPackageCacheClearing(false);
    }
  }, [refreshLatexPackageCache]);

  const handleSnippetLanguageChange = (language: SnippetLanguage) => {
    setActiveSnippetLanguage(language);
    setSnippetImportText(JSON.stringify(getSnippetImportTemplate(language), null, 2));
    setSnippetImportFeedback({
      tone: "neutral",
      text: ""
    });
  };

  const handleClearCustomSnippets = () => {
    setCustomSnippets((currentSnippets) => ({
      ...currentSnippets,
      [activeSnippetLanguage]: []
    }));
    setSnippetImportFeedback({
      tone: "neutral",
      text: `Cleared custom ${SNIPPET_LANGUAGE_LABELS[activeSnippetLanguage]} snippets.`
    });
  };

  const handleRemoveCustomSnippet = (prefix: string) => {
    setCustomSnippets((currentSnippets) => ({
      ...currentSnippets,
      [activeSnippetLanguage]: currentSnippets[activeSnippetLanguage].filter(
        (snippet) => snippet.prefix !== prefix
      )
    }));
    setSnippetImportFeedback({
      tone: "neutral",
      text: `Removed ${prefix} from ${SNIPPET_LANGUAGE_LABELS[activeSnippetLanguage]}.`
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
    const blob = new Blob([JSON.stringify(getSnippetImportTemplate(activeSnippetLanguage), null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `typr-${activeSnippetLanguage}-snippets-template.json`;
    anchor.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
  };

  const handleDownloadCustomSnippets = () => {
    const blob = new Blob([JSON.stringify({
      language: activeSnippetLanguage,
      snippets: customSnippets[activeSnippetLanguage]
    }, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `typr-${activeSnippetLanguage}-snippets.json`;
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

  function downloadWorkspaceFiles(
    paths: string[],
    options: { zipName?: string; preferSingleFile?: boolean } = {}
  ) {
    if (!selectedProjectRepository) {
      return;
    }

    const { files, missingReferences } = getWorkspaceDownloadBundleForPaths(
      selectedProjectRepository,
      paths
    );

    if (files.length === 0) {
      setSyncFeedback({ tone: "error", text: "No downloadable files were found." });
      setWorkspaceContextMenu(null);
      return;
    }

    if (files.length === 1 && options.preferSingleFile !== false) {
      const [file] = files;
      downloadFile(
        getWorkspaceBaseName(file.path),
        file.content,
        typeof file.content === "string"
          ? "text/plain"
          : getWorkspacePreviewMimeType(file.path) ?? "application/octet-stream"
      );
    } else {
      const zipName = getSafeDownloadName(
        options.zipName ?? `${selectedProjectRepository.displayName}.zip`,
        "typr-files.zip"
      );
      downloadBlob(
        zipName.endsWith(".zip") ? zipName : `${zipName}.zip`,
        new Blob([new Uint8Array(createWorkspaceZip(files))], { type: "application/zip" })
      );
    }

    const missingMessage = formatMissingWorkspaceReferences(missingReferences);
    setSyncFeedback({
      tone: missingReferences.length > 0 ? "neutral" : "success",
      text: `${
        files.length === 1 ? `Downloaded ${files[0].path}.` : `Downloaded ${files.length} files.`
      }${missingMessage}`
    });
    setWorkspaceContextMenu(null);
  }

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
    if (selectedProjectRepository) {
      downloadWorkspaceFiles([activeDocument.name], {
        zipName: `${getWorkspaceBaseName(activeDocument.name).replace(/\.[^.]+$/, "")}-bundle.zip`
      });
      return;
    }

    downloadFile(
      activeDocument.name,
      activeDocument.content,
      typeof activeDocument.content === "string"
        ? "text/plain"
        : getWorkspacePreviewMimeType(activeDocument.name) ?? "application/octet-stream"
    );
  };

  const handleDownloadActivePreview = useCallback(async (mode: PreviewDownloadMode = previewDownloadMode) => {
    const sourcePath = activePreviewPath ?? normalizedActiveSourcePath;

    if (!sourcePath) {
      setSyncFeedback({ tone: "error", text: "No preview source is selected." });
      return;
    }

    if (mode === "output") {
      const baseName = getRenderedOutputBaseName(sourcePath);

      if (visibleWorkspacePreview) {
        if (visibleWorkspacePreview.mimeType === "text/markdown") {
          const markdownSource =
            typeof visibleWorkspacePreview.content === "string"
              ? visibleWorkspacePreview.content
              : TEXT_DECODER.decode(visibleWorkspacePreview.content);
          downloadFile(
            `${baseName}.html`,
            createRenderedMarkdownHtml(
              markdownSource || activePreviewTextContent,
              visibleWorkspacePreview.name
            ),
            "text/html"
          );
          setSyncFeedback({ tone: "success", text: `Downloaded ${baseName}.html.` });
          return;
        }

        downloadFile(
          getWorkspaceBaseName(visibleWorkspacePreview.path),
          visibleWorkspacePreview.content,
          visibleWorkspacePreview.mimeType
        );
        setSyncFeedback({ tone: "success", text: `Downloaded ${visibleWorkspacePreview.path}.` });
        return;
      }

      const renderedResult = visiblePreviewResult?.ok
        ? visiblePreviewResult
        : visibleLastSuccessfulResult;

      if (!renderedResult) {
        setSyncFeedback({ tone: "error", text: "No rendered preview is available yet." });
        return;
      }

      if (renderedResult.output.kind === "pdf" && renderedResult.output.artifactData) {
        downloadFile(`${baseName}.pdf`, renderedResult.output.artifactData, "application/pdf");
        setSyncFeedback({ tone: "success", text: `Downloaded ${baseName}.pdf.` });
        return;
      }

      if (renderedResult.output.kind === "svg") {
        if (isTypstSourceFile(activePreviewCompileSourcePath ?? sourcePath)) {
          try {
            const pdfBytes = await exportTypstPdf(activePreviewTextContent, [
              ...diagramShadowAssets,
              ...graphShadowAssets
            ]);
            downloadFile(`${baseName}.pdf`, pdfBytes, "application/pdf");
            setSyncFeedback({ tone: "success", text: `Downloaded ${baseName}.pdf.` });
          } catch (error) {
            setSyncFeedback({
              tone: "error",
              text: error instanceof Error
                ? `Unable to export Typst PDF: ${error.message}`
                : "Unable to export Typst PDF."
            });
          }
          return;
        }

        downloadFile(`${baseName}.svg`, renderedResult.output.content, "image/svg+xml");
        setSyncFeedback({ tone: "success", text: `Downloaded ${baseName}.svg.` });
        return;
      }

      if (renderedResult.output.kind === "html" || renderedResult.output.kind === "placeholder") {
        downloadFile(`${baseName}.html`, renderedResult.output.content, "text/html");
        setSyncFeedback({ tone: "success", text: `Downloaded ${baseName}.html.` });
        return;
      }

      setSyncFeedback({ tone: "error", text: "No downloadable rendered output is available." });
      return;
    }

    downloadWorkspaceFiles([sourcePath], {
      zipName: `${getWorkspaceBaseName(sourcePath).replace(/\.[^.]+$/, "")}-bundle.zip`
    });
  }, [
    activePreviewCompileSourcePath,
    activePreviewPath,
    activePreviewTextContent,
    diagramShadowAssets,
    downloadWorkspaceFiles,
    graphShadowAssets,
    normalizedActiveSourcePath,
    previewDownloadMode,
    visibleWorkspacePreview,
    visibleLastSuccessfulResult,
    visiblePreviewResult
  ]);

  const handleDownloadProject = () => {
    downloadFile(
      `${snapshot.project.name}.json`,
      JSON.stringify(snapshot, null, 2),
      "application/json"
    );
  };

  const handleImportProjectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    try {
      const importedSnapshot = normalizeSnapshot(JSON.parse(await file.text()) as AppSnapshot);
      const importSeed = createEmptyProjectRepository({
        displayName: importedSnapshot.project.name || "Imported project",
        defaultFileName: null
      });
      const isolatedStorage = createProjectStorageFromSnapshot({
        ...importedSnapshot,
        project: {
          ...importedSnapshot.project,
          id: importSeed.id,
          name: importSeed.displayName
        }
      });
      const importedProject = getSelectedProjectRepository(isolatedStorage);

      if (!importedProject) {
        throw new Error("The file did not contain a Typr project.");
      }

      selectProjectRepository(importedProject);
      addDefaultGitManagedProject(importedProject, importedProject.displayName);
      setIsTrashViewOpen(false);
      setSelectedWorkspacePath(importedProject.selection.activeFilePath);
      setSelectedWorkspacePaths(importedProject.selection.activeFilePath ? [importedProject.selection.activeFilePath] : []);
      setWorkspaceSelectionAnchorPath(importedProject.selection.activeFilePath);
      setSyncFeedback({
        tone: "success",
        text: `Imported project "${importedProject.displayName}".`
      });
    } catch (error) {
      setSyncFeedback({
        tone: "error",
        text: error instanceof Error ? `Unable to import project: ${error.message}` : "Unable to import project."
      });
    }
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
    const normalizedFolderId =
      folderId === WORKSPACE_ROOT_PATH ? WORKSPACE_ROOT_PATH : normalizeWorkspacePath(folderId);

    updateWorkspaceOpenFolders((currentPaths) => {
      const nextPaths = new Set(currentPaths);

      if (nextPaths.has(normalizedFolderId)) {
        nextPaths.delete(normalizedFolderId);
        return nextPaths;
      }

      nextPaths.add(normalizedFolderId);
      return nextPaths;
    });
  }, [updateWorkspaceOpenFolders]);

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
      const baseName = activeSourcePath.replace(/\.(typ|typst|tex|ltx|latex)$/i, "");
      const pdfName = `${baseName || activeDocument.name}.pdf`;
      let pdfBytes: Uint8Array;

      if (isLatexMainSourceFile(activeSourcePath)) {
        const exportStartedAtIso = new Date().toISOString();
        const exportStartedAt = typeof performance === "undefined" ? 0 : performance.now();

        if (!selectedProjectRepository) {
          throw new Error("Project filesystem is unavailable for LaTeX export.");
        }

        const result = await compileLatexDocument({
          mainFilePath: activeSourcePath,
          source: sourceEditorValue,
          project: selectedProjectRepository,
          assets: [...diagramShadowAssets, ...graphShadowAssets],
          compileMode: "full",
          onStatusChange: handleCompilerStatusChange
        });
        const exportDurationMs = typeof performance === "undefined" ? 0 : performance.now() - exportStartedAt;
        appendBuildLogEntry({
          sourcePath: activeSourcePath,
          language: "latex",
          engine: result.engine,
          ok: result.ok,
          startedAt: exportStartedAtIso,
          durationMs: exportDurationMs,
          diagnostics: result.ok ? result.diagnostics : result.errors,
          metadata: result.metadata,
          trigger: "export",
          compileMode: "full",
          cached: false,
          outputChanged: true,
          rawLog: result.output?.content,
          packageDetails: extractBuildLogPackageDetails(result.output?.content ?? ""),
          shellEscapeUnavailable: hasShellEscapeConstraint(result.output?.content ?? "")
        });

        if (!result.ok || result.output.kind !== "pdf" || !result.output.artifactData) {
          throw new Error(result.ok ? "LaTeX export produced no PDF." : formatSourceError(result));
        }

        pdfBytes = result.output.artifactData;
      } else if (isTypstSourceFile(activeSourcePath)) {
        pdfBytes = await exportTypstPdf(sourceEditorValue, [
          ...diagramShadowAssets,
          ...graphShadowAssets
        ]);
      } else {
        throw new Error("The active file cannot be exported as PDF.");
      }

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
    activeSourcePath,
    activeDocumentTextContent,
    appendBuildLogEntry,
    activeDocument.name,
    diagramShadowAssets,
    graphShadowAssets,
    isExportingPdf,
    selectedProjectRepository,
    sourceEditorValue
  ]);

  const compileProjectFile = useCallback(async (
    requestedPath?: string,
    options: { latexMode?: LatexCompileMode } = {}
  ): Promise<CompileResult> => {
    const sourcePath = normalizeCompilerPath(requestedPath ?? activeSourcePathRef.current);
    const sourceLanguage = getSourceLanguage(sourcePath);
    const project = selectedProjectRepositoryRef.current;

    if (!isCompilableSourceFile(sourcePath)) {
      const result = {
        ok: false,
        engine: "mock",
        errors: [
          {
            message: "This file type does not have a compiler.",
            severity: "error",
            path: sourcePath
          }
        ]
      } satisfies CompileResult;
      setCompileResult(result);
      return result;
    }

    if (!project) {
      const result = {
        ok: false,
        engine: sourceLanguage === "latex" ? "busytex" : "typst-ts",
        errors: [
          {
            message: "Project filesystem is unavailable.",
            severity: "error",
            path: sourcePath
          }
        ]
      } satisfies CompileResult;
      setCompileResult(result);
      return result;
    }

    const activePath = normalizeCompilerPath(activeSourcePathRef.current);
    const source =
      sourcePath === activePath
        ? sourceEditorValue
        : decodeProjectTextFile(project, sourcePath);
    const compileAssets = [...diagramShadowAssets, ...graphShadowAssets];
    setIsCompiling(true);

    try {
      const result =
        sourceLanguage === "latex"
          ? await compileLatexDocument({
              mainFilePath: sourcePath,
              source,
              project,
              assets: compileAssets,
              compileMode: options.latexMode ?? "full",
              onStatusChange: handleCompilerStatusChange
            })
          : await compiler.compileDocument(
              createThemedPreviewSource(source, themeRef.current ?? theme, isPaperView),
              compileAssets
            );

      setCompileResult(result);

      if (result.ok) {
        setLastSuccessfulResult(result);
        setCompilerStatus((currentStatus) => ({
          phase: "ready",
          mode: currentStatus.mode,
          label: result.output.kind === "pdf" ? "PDF preview ready" : "Preview ready"
        }));
      }

      return result;
    } finally {
      setIsCompiling(false);
    }
  }, [
    compiler,
    diagramShadowAssets,
    graphShadowAssets,
    isPaperView,
    sourceEditorValue,
    theme
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

    if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
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
      "Tutorial: open Projects to switch workspaces, use Files for documents, type in Source, use View for layout controls, and use Git settings when you want to connect a remote."
    );
  };

  const handleOpenTypstReference = () => {
    window.open("https://typst.app/docs/", "_blank", "noopener,noreferrer");
  };

  const handleOpenTyprDocs = () => {
    saveCurrentSettingsScrollPosition();
    setIsSettingsOpen(false);

    if (isMobileWorkspace) {
      setIsDocsOpen(false);
      setActiveSidebarTool("docs");
      setMobileWorkspaceTab("files");
      return;
    }

    setIsDocsOpen(true);
  };

  const handleOpenSettings = () => {
    setActiveMenu(null);
    setIsDocsOpen(false);
    setIsMobileSettingsNavOpen(false);
    setIsSettingsOpen(true);

    if (isMobileWorkspace) {
      setActiveSidebarTool("settings");
      setMobileWorkspaceTab("files");
    }
  };

  const handleOpenSettingsTab = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setActiveMenu(null);
    setIsDocsOpen(false);
    setIsMobileSettingsNavOpen(false);
    setIsSettingsOpen(true);

    if (isMobileWorkspace) {
      setActiveSidebarTool("settings");
      setMobileWorkspaceTab("files");
    }
  };

  const handleOpenGitRemoteHelp = () => {
    handleOpenSettingsTab("git");
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
      handleOpenSettingsTab("git");
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
      const message = "Connect GitHub first.";
      setSyncFeedback({ tone: "error", text: message });
      handleOpenSettingsTab("git");
      return { ok: false as const, message };
    }
    if (!remoteConfig.owner.trim() || !remoteConfig.repo.trim() || !remoteConfig.branch.trim() || !selectedGitToken.trim()) {
      const message = "Fill in owner, repo, branch, and token first.";
      setSyncFeedback({ tone: "error", text: message });
      handleOpenSettingsTab("git");
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

    const conflictMessage = "Git conflicts need to be resolved before saving to Git.";
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
      compileProjectFile,
      async compileActiveDocument() {
        pendingCompileTriggerRef.current = "agent";
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
          const sourcePath = activeSourcePathRef.current;
          const baseName = sourcePath.replace(/\.(typ|typst|tex|ltx|latex)$/i, "");
          let pdfBytes: Uint8Array;

          if (isLatexMainSourceFile(sourcePath)) {
            const result = await compileProjectFile(sourcePath);

            if (!result.ok || result.output.kind !== "pdf" || !result.output.artifactData) {
              return {
                ok: false as const,
                message: result.ok ? "LaTeX export produced no PDF." : formatSourceError(result)
              };
            }

            pdfBytes = result.output.artifactData;
          } else if (isTypstSourceFile(sourcePath)) {
            pdfBytes = await exportTypstPdf(sourceEditorValue, [
              ...diagramShadowAssets,
              ...graphShadowAssets
            ]);
          } else {
            return {
              ok: false as const,
              message: "The active file cannot be exported as PDF."
            };
          }

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
      compileProjectFile,
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
      sourceEditorValue,
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

  function getVisibleDesktopPaneCount() {
    return [showDesktopSidebar, showSourcePane, showPreviewPane].filter(Boolean).length;
  }

  function restoreWorkspacePane(panel: "sidebar" | "source" | "preview") {
    setWorkspaceMode("split");

    if (panel === "sidebar") {
      setIsSidebarCollapsed(false);
      return;
    }

    if (panel === "source") {
      setIsSourcePaneHidden(false);
      return;
    }

    setIsPreviewCollapsed(false);
  }

  function hideWorkspacePane(panel: "sidebar" | "source" | "preview") {
    if (getVisibleDesktopPaneCount() <= 1) {
      return;
    }

    if (panel === "sidebar") {
      setIsSidebarCollapsed(true);
      return;
    }

    if (panel === "source") {
      setIsSourcePaneHidden(true);
      return;
    }

    setIsPreviewCollapsed(true);
  }

  function handlePanelToggle(panel: "sidebar" | "source" | "preview") {
    if (panel === "sidebar") {
      if (isSidebarCollapsed) {
        restoreWorkspacePane("sidebar");
      } else {
        hideWorkspacePane("sidebar");
      }

      return;
    }

    if (panel === "source") {
      if (workspaceMode === "zen") {
        exitZenMode();
        return;
      }

      if (isSourcePaneHidden) {
        restoreWorkspacePane("source");
      } else {
        hideWorkspacePane("source");
      }

      return;
    }

    if (workspaceMode === "zen") {
      exitZenMode();
      setIsPreviewCollapsed(false);
      return;
    }

    if (isPreviewCollapsed) {
      restoreWorkspacePane("preview");
    } else {
      hideWorkspacePane("preview");
    }
  }

  function toggleZenMode() {
    if (isMobileWorkspaceViewport(viewportWidth)) {
      setFullscreenMode("editor");
      return;
    }

    if (workspaceMode === "zen") {
      exitZenMode();
      return;
    }

    preZenLayoutRef.current = {
      workspaceMode,
      isSourcePaneHidden
    };
    setActiveMenu(null);
    setIsSourcePaneHidden(false);
    setWorkspaceMode("zen");
  }

  function exitZenMode() {
    const previousLayout = preZenLayoutRef.current;
    preZenLayoutRef.current = null;
    setWorkspaceMode(previousLayout?.workspaceMode ?? "split");
    if (previousLayout) {
      setIsSourcePaneHidden(previousLayout.isSourcePaneHidden);
    }
  }

  function resetPanelWidths() {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    setPreviewRatio(0.5);
    setZenWidth(ZEN_DEFAULT_WIDTH);
    setZenHeight(getDefaultZenHeight(viewportHeight));
  }

  function setFullscreenMode(mode: WorkspaceMode) {
    if (mode !== "zen") {
      preZenLayoutRef.current = null;
    }

    if (mode === "sidebar") {
      setIsSidebarCollapsed(false);
    } else if (mode === "editor" || mode === "zen") {
      setIsSourcePaneHidden(false);
    } else if (mode === "preview") {
      setIsPreviewCollapsed(false);
    }

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

    if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
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

    if (mode === "zen") {
      return "Zen";
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

      if (isMobileWorkspaceViewport(viewportWidth)) {
        return;
      }

      event.preventDefault();

      const workspaceWidth = workspace.getBoundingClientRect().width;
      const sidebarPaneWidth = isSidebarCollapsed ? 0 : sidebarWidth;
      const sidebarInlineExpandedDuringResize =
        !isSidebarCollapsed &&
        workspaceMode === "split" &&
        (
          (activeSidebarTool === "diagram" && diagramPaneMode !== "sidebar") ||
          (activeSidebarTool === "graph" && graphPaneMode !== "sidebar") ||
          (activeSidebarTool === "sync" && Boolean(activeMergeState) && gitMergePaneMode !== "sidebar")
        );
      const previewExpandedDuringResize =
        sidebarInlineExpandedDuringResize &&
        (
          (activeSidebarTool === "diagram" && diagramPaneMode === "preview") ||
          (activeSidebarTool === "graph" && graphPaneMode === "preview") ||
          (activeSidebarTool === "sync" && gitMergePaneMode === "preview")
        );
      const sourcePaneVisibleDuringResize =
        !sidebarInlineExpandedDuringResize && isSourceFileEditable && !isSourcePaneHidden;
      const previewPaneVisibleDuringResize = !previewExpandedDuringResize && !isPreviewCollapsed;
      const openPaneCount = [!isSidebarCollapsed, sourcePaneVisibleDuringResize, previewPaneVisibleDuringResize].filter(Boolean).length;
      const handleWidthTotal = Math.max(0, openPaneCount - 1) * PANEL_HANDLE_WIDTH;
      const remainingWidth = Math.max(0, workspaceWidth - sidebarPaneWidth - handleWidthTotal);
      const sourceMinWidth = sourcePaneVisibleDuringResize ? EDITOR_MIN_WIDTH : 0;
      const startWidth =
        edge === "sidebar"
          ? sidebarWidth
          : getPreviewPaneWidth(workspaceWidth, sidebarPaneWidth, handleWidthTotal, previewRatio, sourceMinWidth);
      panelResizeRef.current = {
        edge,
        startX: event.clientX,
        startY: event.clientY,
        startWidth,
        startHeight: 0
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
          const otherMinimumWidth =
            (sourcePaneVisibleDuringResize ? EDITOR_MIN_WIDTH : 0) +
            (previewPaneVisibleDuringResize ? PREVIEW_MIN_WIDTH : 0);
          const maxWidth = Math.max(
            SIDEBAR_MIN_WIDTH,
            workspaceWidth - handleWidthTotal - otherMinimumWidth
          );
          const clampedWidth = clampPanelWidth(
            nextWidth,
            SIDEBAR_MIN_WIDTH,
            maxWidth
          );
          setSidebarWidth(clampedWidth);
          if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
          }
        } else {
          const maxWidth = Math.max(0, remainingWidth - sourceMinWidth);
          const minWidth = Math.min(PREVIEW_MIN_WIDTH, maxWidth);
          const clampedWidth = clampPanelWidth(nextWidth, minWidth, maxWidth);
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
    [
      activeMergeState,
      activeSidebarTool,
      diagramPaneMode,
      gitMergePaneMode,
      graphPaneMode,
      isPreviewCollapsed,
      isSidebarCollapsed,
      isSourceFileEditable,
      isSourcePaneHidden,
      previewRatio,
      sidebarWidth,
      viewportWidth,
      workspaceMode
    ]
  );

  const beginZenResize = useCallback(
    (edge: ZenResizeEdge) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (workspaceMode !== "zen") {
        return;
      }

      const workspace = workspaceRef.current;
      if (!workspace || isMobileWorkspaceViewport(viewportWidth)) {
        return;
      }

      event.preventDefault();

      const workspaceWidth = workspace.getBoundingClientRect().width;
      const effectiveViewportHeight = viewportHeight > 0 ? viewportHeight : getCurrentViewportHeight();
      const isHorizontalResize = edge === "zen-left" || edge === "zen-right";
      panelResizeRef.current = {
        edge,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: clampZenWidth(zenWidth, workspaceWidth),
        startHeight: clampZenHeight(zenHeight, effectiveViewportHeight)
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const resizeState = panelResizeRef.current;
        if (!resizeState || resizeState.edge !== edge) {
          return;
        }

        if (isHorizontalResize) {
          const delta = moveEvent.clientX - resizeState.startX;
          const nextWidth =
            edge === "zen-left"
              ? resizeState.startWidth - delta * 2
              : resizeState.startWidth + delta * 2;
          setZenWidth(clampZenWidth(nextWidth, workspaceWidth));
          return;
        }

        const delta = moveEvent.clientY - resizeState.startY;
        const nextHeight =
          edge === "zen-top"
            ? resizeState.startHeight - delta * 2
            : resizeState.startHeight + delta * 2;
        setZenHeight(clampZenHeight(nextHeight, effectiveViewportHeight));
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
      document.body.style.cursor = isHorizontalResize ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [viewportHeight, viewportWidth, workspaceMode, zenHeight, zenWidth]
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
  const canCreateGitHubRepository =
    isOnline &&
    gitHubClone.status === "connected" &&
    Boolean(selectedProjectRepository) &&
    Boolean(gitHubClone.token.trim()) &&
    Boolean(gitHubClone.owner.trim()) &&
    Boolean(gitHubClone.repo.trim()) &&
    Boolean(gitHubClone.branch.trim()) &&
    !isSyncing;
  const gitHubCloneBranchGuidance =
    gitHubClone.status === "connected" &&
    gitHubClone.repo.trim() &&
    !gitHubClone.isLoadingBranches &&
    gitHubClone.branches.length === 0
      ? "No branches found. Initialize the repo on GitHub first, for example with a README."
      : gitHubClone.status === "connected" &&
          gitHubClone.branches.length > 0 &&
          gitHubClone.branch.trim() &&
          !gitHubClone.branches.some((branch) => branch.name === gitHubClone.branch.trim())
        ? "Choose an existing branch. Browser clone cannot create a missing remote branch."
        : "";
  const gitHubCloneBranchReady =
    !gitHubCloneBranchGuidance &&
    (gitHubClone.branches.length === 0 ||
      gitHubClone.branches.some((branch) => branch.name === gitHubClone.branch.trim()));
  const canCloneGitHubRepository =
    isOnline &&
    gitHubClone.status === "connected" &&
    Boolean(gitHubClone.token.trim()) &&
    Boolean(gitHubClone.owner.trim()) &&
    Boolean(gitHubClone.repo.trim()) &&
    Boolean(gitHubClone.branch.trim()) &&
    !gitHubClone.isLoadingBranches &&
    gitHubCloneBranchReady &&
    !isSyncing;
  const gitHubCloneProgressPercent =
    gitHubClone.progress && gitHubClone.progress.total > 0
      ? Math.max(0, Math.min(100, (gitHubClone.progress.current / gitHubClone.progress.total) * 100))
      : null;
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
  const lintSourceEditorValue = useDebouncedValue(sourceEditorValue, 180);
  const lintDiagnostics = useMemo(
    () =>
      lintSourceWithEditorTooling({
        language: activeSourceLanguage,
        path: activeSourcePath,
        preferences: snapshot.preferences.editorTooling,
        source: lintSourceEditorValue
      }),
    [
      activeSourceLanguage,
      activeSourcePath,
      snapshot.preferences.editorTooling,
      lintSourceEditorValue
    ]
  );
  const compilerDiagnostics =
    compileResult === null
      ? EMPTY_COMPILE_DIAGNOSTICS
      : compileResult.ok
        ? compileResult.diagnostics
        : compileResult.errors;
  const editorDiagnostics = useMemo(
    () => [...lintDiagnostics, ...compilerDiagnostics],
    [compilerDiagnostics, lintDiagnostics]
  );
  const debugOutputResult = compileResult?.ok ? compileResult : lastSuccessfulResult;
  const debugOutputContent = isCompiling && liveBuildOutput
    ? liveBuildOutput
    : activeSourceLanguage === "markdown"
      ? sourceEditorValue
      : debugOutputResult?.output.content ?? "";
  const debugOutputExcerpt = formatDebugOutputExcerpt(debugOutputContent);
  const debugOutputKind = activeSourceLanguage === "markdown"
    ? "source"
    : isCompiling && liveBuildOutput
      ? "live log"
      : debugOutputResult?.output.kind ?? "none";
  const debugSourceLanguageLabel = formatSourceLanguageLabel(activeSourceLanguage);
  const shouldShowPreviewInternals = activeSourceLanguage === "typst" && debugOutputContent.length > 0;
  const filteredBuildLogEntries = useMemo(
    () => filterBuildLogEntries(buildLogEntries, buildLogFilter, activeSourcePath, buildLogSearchQuery),
    [activeSourcePath, buildLogEntries, buildLogFilter, buildLogSearchQuery]
  );
  const lastBuildFailed = buildLogEntries[0]?.ok === false;
  const buildLogTimelineMaxMs = Math.max(...filteredBuildLogEntries.map((entry) => entry.durationMs), 1);

  const handleCopyText = useCallback(async (text: string, feedback: string) => {
    if (!text.trim()) {
      setBuildLogFeedback("Nothing to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setBuildLogFeedback(feedback);
    } catch {
      setBuildLogFeedback("Clipboard access is unavailable.");
    }
  }, []);

  const handleCopyBuildLog = useCallback(() => {
    void handleCopyText(formatBuildLogEntriesText(filteredBuildLogEntries), "Build log copied.");
  }, [filteredBuildLogEntries, handleCopyText]);

  const handleCopyDiagnostics = useCallback(() => {
    void handleCopyText(
      filteredBuildLogEntries
        .flatMap((entry) => entry.diagnostics.map((diagnostic) => `${entry.sourcePath}: ${diagnostic.severity}: ${diagnostic.message}`))
        .join("\n"),
      "Diagnostics copied."
    );
  }, [filteredBuildLogEntries, handleCopyText]);

  const handleExportBuildLogJson = useCallback(() => {
    downloadFile(
      `typr-build-log-${activeProjectTabKey}.json`,
      JSON.stringify(filteredBuildLogEntries, null, 2),
      "application/json"
    );
    setBuildLogFeedback("Build log exported.");
  }, [activeProjectTabKey, downloadFile, filteredBuildLogEntries]);

  const handleExportBuildLogText = useCallback(() => {
    downloadFile(
      `typr-build-log-${activeProjectTabKey}.txt`,
      formatBuildLogEntriesText(filteredBuildLogEntries),
      "text/plain"
    );
    setBuildLogFeedback("Build log text exported.");
  }, [activeProjectTabKey, downloadFile, filteredBuildLogEntries]);

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
  const allSnippetsByLanguage = useMemo<SnippetCollections>(
    () => ({
      typst: mergeSnippets([...DEFAULT_SNIPPETS_BY_LANGUAGE.typst, ...customSnippets.typst]),
      latex: mergeSnippets([...DEFAULT_SNIPPETS_BY_LANGUAGE.latex, ...customSnippets.latex]),
      markdown: mergeSnippets([
        ...DEFAULT_SNIPPETS_BY_LANGUAGE.markdown,
        ...customSnippets.markdown
      ])
    }),
    [customSnippets]
  );
  const activeDefaultSnippets = DEFAULT_SNIPPETS_BY_LANGUAGE[activeSnippetLanguage];
  const activeCustomSnippets = customSnippets[activeSnippetLanguage];
  const activeAllSnippets = allSnippetsByLanguage[activeSnippetLanguage];
  const activeSnippetLanguageLabel = SNIPPET_LANGUAGE_LABELS[activeSnippetLanguage];
  const activeEditorSnippetLanguage = isSnippetLanguage(activeSourceLanguage)
    ? activeSourceLanguage
    : null;
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
  const latexBundleCacheById = useMemo(
    () => new Map(latexPackageBundleEntries.map((entry) => [entry.id, entry])),
    [latexPackageBundleEntries]
  );
  const cachedLatexPackageKeys = useMemo(
    () => new Set(cachedLatexPackageNames.map(normalizeLatexPackageSelectionName)),
    [cachedLatexPackageNames]
  );
  const detectedLatexPackageNames = useMemo(() => {
    const packageNames = new Set<string>();

    if (selectedProjectRepository) {
      for (const packageName of extractLatexPackageNamesFromProject(selectedProjectRepository)) {
        packageNames.add(packageName);
      }
    }

    if (activeSourceLanguage === "latex") {
      for (const packageName of extractLatexPackageNames(sourceEditorValue)) {
        packageNames.add(packageName);
      }
    }

    return [...packageNames].sort((left, right) => left.localeCompare(right));
  }, [activeSourceLanguage, selectedProjectRepository, sourceEditorValue]);
  const detectedLatexPackages = useMemo(
    () =>
      latexPackageCatalog
        ? resolveLatexPackages(detectedLatexPackageNames, latexPackageCatalog)
        : detectedLatexPackageNames.map((name) => ({ name, bundleId: null })),
    [detectedLatexPackageNames, latexPackageCatalog]
  );
  const uncachedDetectedLatexPackages = useMemo(
    () =>
      detectedLatexPackages.filter((entry) => {
        if (!entry.bundleId) {
          return true;
        }

        const bundle = latexBundleCacheById.get(entry.bundleId);

        if (bundle?.defaultLoaded) {
          return false;
        }

        return !(
          cachedLatexPackageKeys.has(normalizeLatexPackageSelectionName(entry.name)) &&
          bundle?.cached
        );
      }),
    [cachedLatexPackageKeys, detectedLatexPackages, latexBundleCacheById]
  );
  const latexPackageSearchResults = useMemo(
    () =>
      latexPackageCatalog
        ? searchLatexPackageCatalog(latexPackageCatalog, latexPackageSearchQuery)
        : [],
    [latexPackageCatalog, latexPackageSearchQuery]
  );
  const manualExtraLatexPackages = useMemo<LatexPackageResolution[]>(() => {
    if (!latexPackageCatalog || !latexBundleCacheById.get("texlive-extra")?.cached) {
      return [];
    }

    return cachedLatexPackageNames
      .map((name) => ({
        name,
        bundleId: latexPackageCatalog.packages.get(normalizeLatexPackageSelectionName(name)) ?? null
      }))
      .filter((entry): entry is LatexPackageResolution & { bundleId: "texlive-extra" } =>
        entry.bundleId === "texlive-extra"
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [cachedLatexPackageNames, latexBundleCacheById, latexPackageCatalog]);
  const flatOutlineEntries = useMemo(
    () => collectOutlineEntries(outlineSourceContent, activeSourceLanguage),
    [activeSourceLanguage, outlineSourceContent]
  );
  const outlineEntries = useMemo(
    () => buildOutlineTree(flatOutlineEntries),
    [flatOutlineEntries]
  );
  const activeOutlineEntryId = useMemo(() => {
    const activeEntry = findActiveOutlineEntry(flatOutlineEntries, currentEditorLineNumber);
    return activeEntry ? `${activeEntry.lineNumber}:${activeEntry.level}:${activeEntry.title}` : null;
  }, [currentEditorLineNumber, flatOutlineEntries]);
  const lightThemes = builtinThemes
    .filter((themeDefinition) => themeDefinition.mode === "light")
    .sort(compareThemesByDisplayOrder);
  const darkThemes = builtinThemes
    .filter((themeDefinition) => themeDefinition.mode === "dark")
    .sort(compareThemesByDisplayOrder);
  const effectiveWorkspaceWidth =
    workspaceWidth > 0 ? workspaceWidth : viewportWidth;
  const isZenMode = !isMobileWorkspace && workspaceMode === "zen";
  const zenPaneWidth = isZenMode
    ? clampZenWidth(zenWidth, effectiveWorkspaceWidth)
    : 0;
  const zenPaneHeight = isZenMode
    ? clampZenHeight(zenHeight, viewportHeight)
    : 0;
  const showDesktopSidebar = !isMobileWorkspace && !isZenMode && !isSidebarCollapsed;
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
  const showSourcePane =
    !isSidebarInlineExpanded &&
    (isZenMode || (isSourceFileEditable && (isMobileWorkspace || !isSourcePaneHidden)));
  const showPreviewPane =
    !isZenMode &&
    !isDiagramPreviewExpanded &&
    !isGraphPreviewExpanded &&
    !isGitMergePreviewExpanded &&
    (isMobileWorkspace || !isPreviewCollapsed);
  const sidebarPaneWidth = showDesktopSidebar ? sidebarWidth : 0;
  const sidebarHandleWidth =
    !isMobileWorkspace && showDesktopSidebar && (showSourcePane || showPreviewPane)
      ? PANEL_HANDLE_WIDTH
      : 0;
  const previewHandleWidth = !isMobileWorkspace && showPreviewPane && showSourcePane ? PANEL_HANDLE_WIDTH : 0;
  const handleWidthTotal = sidebarHandleWidth + previewHandleWidth;
  const previewPaneWidth = !showPreviewPane
    ? 0
    : showSourcePane || isSidebarInlineExpanded
    ? getPreviewPaneWidth(
        effectiveWorkspaceWidth,
        sidebarPaneWidth,
        handleWidthTotal,
        previewRatio,
        showSourcePane ? EDITOR_MIN_WIDTH : 0
      )
    : Math.max(0, effectiveWorkspaceWidth - sidebarPaneWidth - sidebarHandleWidth);
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
      : isZenMode
      ? {
          gridTemplateColumns: `${PANEL_HANDLE_WIDTH}px ${zenPaneWidth}px ${PANEL_HANDLE_WIDTH}px`,
          gridTemplateRows: `${PANEL_HANDLE_WIDTH}px ${zenPaneHeight}px ${PANEL_HANDLE_WIDTH}px`
        }
      : workspaceMode === "split"
      ? {
          gridTemplateColumns: [
            showDesktopSidebar ? `${sidebarPaneWidth}px` : null,
            showDesktopSidebar && (showSourcePane || showPreviewPane) ? `${sidebarHandleWidth}px` : null,
            showSourcePane ? `${sourcePaneWidth}px` : null,
            showSourcePane && showPreviewPane ? `${previewHandleWidth}px` : null,
            showPreviewPane ? `${previewPaneWidth}px` : null
          ].filter(Boolean).join(" ") || "minmax(0, 1fr)"
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
  const visibleDesktopPaneCount = getVisibleDesktopPaneCount();
  const sidebarToolTitle = getSidebarToolTitle(activeSidebarTool);
  const filesPanelTitle = activeSidebarTool === "files" && isTrashViewOpen ? "Trash" : sidebarToolTitle;
  const mobileSidebarTabLabel = filesPanelTitle;
  const sidebarPaneStyle = {
    "--sidebar-font-size": `${snapshot.preferences.sidebarFontSize}px`
  } as CSSProperties;

  const leftPaneScrollKey = activeSidebarTool === "files"
    ? isTrashViewOpen
      ? "files:trash"
      : "files"
    : activeSidebarTool;

  const saveCurrentLeftPaneScrollPosition = useCallback(() => {
    const element = filesSectionRef.current;
    if (!element) {
      return;
    }

    leftPaneScrollByPaneRef.current = {
      ...leftPaneScrollByPaneRef.current,
      [leftPaneScrollKey]: Math.max(0, Math.round(element.scrollTop))
    };

    writeStoredLeftPaneState({
      activeSidebarTool,
      mobileWorkspaceTab,
      isTrashViewOpen,
      scrollByPane: leftPaneScrollByPaneRef.current
    });
  }, [activeSidebarTool, isTrashViewOpen, leftPaneScrollKey, mobileWorkspaceTab]);

  const handleLeftPaneScroll = useCallback(() => {
    saveCurrentLeftPaneScrollPosition();
  }, [saveCurrentLeftPaneScrollPosition]);

  useEffect(() => {
    if (leftPaneScrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(leftPaneScrollRestoreFrameRef.current);
    }

    leftPaneScrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
      const element = filesSectionRef.current;
      if (element) {
        element.scrollTop = leftPaneScrollByPaneRef.current[leftPaneScrollKey] ?? 0;
      }
      leftPaneScrollRestoreFrameRef.current = null;
    });

    return () => {
      if (leftPaneScrollRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(leftPaneScrollRestoreFrameRef.current);
        leftPaneScrollRestoreFrameRef.current = null;
      }
    };
  }, [leftPaneScrollKey]);

  useEffect(() => {
    writeStoredLeftPaneState({
      activeSidebarTool,
      mobileWorkspaceTab,
      isTrashViewOpen,
      scrollByPane: leftPaneScrollByPaneRef.current
    });
  }, [activeSidebarTool, isTrashViewOpen, mobileWorkspaceTab]);

  useEffect(() => {
    if (isMobileWorkspace || workspaceMode !== "split" || visibleDesktopPaneCount > 0) {
      return;
    }

    if (isSourceFileEditable) {
      setIsSourcePaneHidden(false);
      return;
    }

    setIsPreviewCollapsed(false);
  }, [isMobileWorkspace, isSourceFileEditable, visibleDesktopPaneCount, workspaceMode]);

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

  const openDebugSidebar = useCallback(() => {
    setActiveSidebarTool("debug");
    setIsSidebarCollapsed(false);

    if (isMobileWorkspace) {
      setMobileWorkspaceTab("files");
    } else if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
      setWorkspaceMode("split");
    }
  }, [isMobileWorkspace, workspaceMode]);

  const handleOpenSidebarTool = useCallback(
    (tool: SidebarTool) => {
      const shouldOpenSearchPane = tool === "search" && (isSidebarCollapsed || activeSidebarTool !== tool);

      if (isMobileWorkspace && activeSidebarTool === "settings" && isSettingsOpen) {
        saveCurrentSettingsScrollPosition();
        setIsSettingsOpen(false);
      }

      if (
        !isMobileWorkspace &&
        activeSidebarTool === tool &&
        !isSidebarCollapsed &&
        visibleDesktopPaneCount > 1
      ) {
        setIsSidebarCollapsed(true);
      } else {
        setActiveSidebarTool(tool);
        setIsSidebarCollapsed(false);
      }

      if (isMobileWorkspace) {
        setMobileWorkspaceTab("files");
      } else if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
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
    [
      activeSidebarTool,
      isMobileWorkspace,
      isSettingsOpen,
      isSidebarCollapsed,
      openSearchPane,
      saveCurrentSettingsScrollPosition,
      visibleDesktopPaneCount,
      workspaceMode
    ]
  );

  const handleMobileWorkspaceTabChange = useCallback(
    (tab: MobileWorkspaceTab) => {
      if (isMobileWorkspace && tab !== "files" && activeSidebarTool === "settings" && isSettingsOpen) {
        saveCurrentSettingsScrollPosition();
      }

      setMobileWorkspaceTab(tab);
    },
    [activeSidebarTool, isMobileWorkspace, isSettingsOpen, saveCurrentSettingsScrollPosition]
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
    (path: string, options: { pinSourceTab?: boolean } = {}) => {
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
        handleSelectDocument(matchingDocument.id, {
          sourceTabMode: options.pinSourceTab ? "pin" : "preview"
        });
        const sourceLanguage = getSourceLanguage(normalizedPath);
        const existingLatexPdfPath = getExistingLatexPdfPreviewPath(normalizedPath);

        if (sourceLanguage === "markdown") {
          openPreviewTab(normalizedPath);
          setIsPreviewCollapsed(false);
        } else if (existingLatexPdfPath) {
          openPreviewTab(existingLatexPdfPath);
          setIsPreviewCollapsed(false);
        } else if (sourceLanguage !== "latex" && isCompilableSourceFile(normalizedPath)) {
          openPreviewTab(normalizedPath, { activate: true });
          setIsPreviewCollapsed(false);
        }
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
        if (getWorkspacePreviewMimeType(normalizedPath)) {
          openPreviewTab(normalizedPath);
        }
        setWorkspaceMode("split");
        setIsPreviewCollapsed(false);
      }
    },
    [
      handleOpenWorkspaceDiagram,
      handleOpenWorkspaceGraph,
      handleSelectDocument,
      getExistingLatexPdfPreviewPath,
      isTrashViewOpen,
      openPreviewTab,
      previewTabPaths.length,
      snapshot.project.documents,
      visibleWorkspaceTree
    ]
  );

  const handlePinWorkspaceFile = useCallback(
    (path: string) => {
      handleOpenWorkspaceFile(path, { pinSourceTab: true });
    },
    [handleOpenWorkspaceFile]
  );

  const getWorkspaceKeyboardNode = useCallback(() => {
    const selectedPath = workspaceTreeCursorPath ?? visibleWorkspaceNodes[0]?.path ?? null;

    return selectedPath ? findWorkspaceNodeByPath(visibleWorkspaceTree, selectedPath) : null;
  }, [
    visibleWorkspaceNodes,
    visibleWorkspaceTree,
    workspaceTreeCursorPath
  ]);

  const selectWorkspaceKeyboardNode = useCallback((node: WorkspaceTreeNode) => {
    setPendingWorkspaceDeletePath(null);
    setSelectedWorkspacePaths([node.path]);
    setWorkspaceSelectionAnchorPath(node.path);
  }, []);

  const getWorkspaceKeyboardSelection = useCallback(
    (node: WorkspaceTreeNode) => {
      const selectionPaths =
        selectedWorkspacePaths.includes(node.path) && selectedWorkspacePaths.length > 1
          ? selectedWorkspacePaths
          : [node.path];

      return selectionPaths
        .map((path) => findWorkspaceNodeByPath(visibleWorkspaceTree, path))
        .filter((entry): entry is WorkspaceTreeNode => Boolean(entry));
    },
    [selectedWorkspacePaths, visibleWorkspaceTree]
  );

  const getWorkspacePasteDestination = useCallback((node: WorkspaceTreeNode | null) => {
    if (!node) {
      return null;
    }

    return node.kind === "folder" ? node.path : getWorkspaceParentPath(node.path);
  }, []);

  const moveWorkspaceKeyboardSelection = useCallback(
    (direction: -1 | 1) => {
      if (visibleWorkspaceNodes.length === 0) {
        return;
      }

      const selectedPath = workspaceTreeCursorPath;
      const selectedIndex = selectedPath
        ? visibleWorkspaceNodes.findIndex((node) => node.path === selectedPath)
        : -1;
      const nextIndex =
        selectedIndex === -1
          ? direction > 0
            ? 0
            : visibleWorkspaceNodes.length - 1
          : Math.min(visibleWorkspaceNodes.length - 1, Math.max(0, selectedIndex + direction));

      selectWorkspaceKeyboardNode(visibleWorkspaceNodes[nextIndex]);
    },
    [
      selectWorkspaceKeyboardNode,
      visibleWorkspaceNodes,
      workspaceTreeCursorPath
    ]
  );

  const handleWorkspaceKeyboardCopy = useCallback(
    (node: WorkspaceTreeNode, mode: WorkspaceClipboardMode) => {
      if (isTrashViewOpen) {
        setSyncFeedback({ tone: "error", text: "Leave Trash before copying files." });
        return;
      }

      const commandNodes = getWorkspaceKeyboardSelection(node).filter((entry) =>
        mode === "cut" ? canMoveWorkspaceNode(entry) : isWorkspaceNodeCopyable(entry)
      );
      const rootNodes = removeDescendantWorkspaceNodes(commandNodes);
      const domain = getWorkspaceClipboardDomain(rootNodes);

      if (rootNodes.length === 0 || !domain) {
        setSyncFeedback({
          tone: "error",
          text: mode === "cut" ? "No movable file selected." : "No copyable file selected."
        });
        return;
      }

      setWorkspaceClipboard({
        mode,
        paths: rootNodes.map((entry) => entry.path)
      });
      setPendingWorkspaceDeletePath(null);
      setSyncFeedback({
        tone: "neutral",
        text: `${mode === "cut" ? "Cut" : "Copied"} ${rootNodes.length} item${
          rootNodes.length === 1 ? "" : "s"
        }.`
      });
    },
    [getWorkspaceKeyboardSelection, isTrashViewOpen, setSyncFeedback]
  );

  const handleWorkspaceKeyboardPaste = useCallback(
    (destinationNode: WorkspaceTreeNode | null) => {
      if (isTrashViewOpen) {
        setSyncFeedback({ tone: "error", text: "Leave Trash before pasting files." });
        return;
      }

      if (!workspaceClipboard || workspaceClipboard.paths.length === 0) {
        setSyncFeedback({ tone: "error", text: "Nothing to paste." });
        return;
      }

      const clipboardNodes = workspaceClipboard.paths
        .map((path) => findWorkspaceNodeByPath(workspaceTree, path))
        .filter((entry): entry is WorkspaceTreeNode => Boolean(entry));
      const rootNodes = removeDescendantWorkspaceNodes(clipboardNodes);
      const domain = getWorkspaceClipboardDomain(rootNodes);

      if (rootNodes.length === 0 || !domain) {
        setWorkspaceClipboard(null);
        setSyncFeedback({ tone: "error", text: "Those files are no longer available." });
        return;
      }

      const pasteDestination = normalizeWorkspacePasteDestination(
        domain,
        getWorkspacePasteDestination(destinationNode)
      );

      if (pasteDestination.error) {
        setSyncFeedback({ tone: "error", text: pasteDestination.error });
        return;
      }

      if (workspaceClipboard.mode === "cut") {
        const movableNodes = rootNodes.filter(
          (entry) =>
            canMoveWorkspaceNode(entry) &&
            !(
              entry.kind === "folder" &&
              pasteDestination.destinationFolderPath &&
              (pasteDestination.destinationFolderPath === entry.path ||
                pasteDestination.destinationFolderPath.startsWith(`${entry.path}/`))
            )
        );

        if (movableNodes.length === 0) {
          setSyncFeedback({ tone: "error", text: "No movable file selected." });
          return;
        }

        for (const entry of movableNodes) {
          handleMoveWorkspaceNode(entry, pasteDestination.destinationFolderPath);
        }

        setWorkspaceClipboard(null);
        setPendingWorkspaceDeletePath(null);
        setSyncFeedback({
          tone: "success",
          text: `Moved ${movableNodes.length} item${movableNodes.length === 1 ? "" : "s"}.`
        });
        return;
      }

      const result = copyWorkspaceNodesToSnapshot(
        snapshot,
        rootNodes,
        pasteDestination.destinationFolderPath
      );

      if (result.copiedPaths.length === 0) {
        setSyncFeedback({ tone: "error", text: "Nothing could be copied there." });
        return;
      }

      setSnapshot(result.snapshot);
      setSelectedWorkspacePath(result.copiedPaths[0]);
      setSelectedWorkspacePaths(result.copiedPaths);
      setWorkspaceSelectionAnchorPath(result.copiedPaths[0]);
      setPendingWorkspaceDeletePath(null);
      setSyncFeedback({
        tone: "success",
        text: `Pasted ${result.copiedPaths.length} item${
          result.copiedPaths.length === 1 ? "" : "s"
        }.`
      });
    },
    [
      getWorkspacePasteDestination,
      handleMoveWorkspaceNode,
      isTrashViewOpen,
      setSnapshot,
      setSyncFeedback,
      snapshot,
      workspaceClipboard,
      workspaceTree
    ]
  );

  const handleWorkspaceKeyboardRestore = useCallback(
    (node: WorkspaceTreeNode) => {
      if (!isTrashViewOpen || node.source.kind !== "trash-item") {
        return false;
      }

      const trashNodes = getWorkspaceKeyboardSelection(node).filter(
        (entry): entry is WorkspaceTreeNode & { source: { kind: "trash-item"; id: string } } =>
          entry.source.kind === "trash-item"
      );

      if (trashNodes.length === 0) {
        return false;
      }

      setSnapshot((currentSnapshot) =>
        trashNodes.reduce(
          (nextSnapshot, trashNode) => restoreTrashEntry(nextSnapshot, trashNode.source.id),
          currentSnapshot
        )
      );
      setWorkspaceContextMenu(null);
      setSelectedWorkspacePath(null);
      setSelectedWorkspacePaths([]);
      setWorkspaceSelectionAnchorPath(null);
      setPendingWorkspaceDeletePath(null);
      setSyncFeedback({
        tone: "success",
        text: `Restored ${trashNodes.length} item${trashNodes.length === 1 ? "" : "s"}.`
      });
      return true;
    },
    [getWorkspaceKeyboardSelection, isTrashViewOpen, setSnapshot, setSyncFeedback]
  );

  const handleFilesPaneKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (
        !snapshot.preferences.vimMode ||
        activeSidebarTool !== "files" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      const key = event.key;

      if (pendingWorkspaceDeletePath) {
        if (key === "y" || key === "Y") {
          const nodeToDelete = findWorkspaceNodeByPath(visibleWorkspaceTree, pendingWorkspaceDeletePath);
          event.preventDefault();
          setPendingWorkspaceDeletePath(null);

          if (nodeToDelete && canDeleteWorkspaceNode(nodeToDelete)) {
            handleDeleteWorkspaceNode(nodeToDelete);
            setSyncFeedback({ tone: "success", text: `Deleted ${nodeToDelete.name}.` });
          }
          return;
        }

        if (key === "n" || key === "N" || key === "Escape") {
          event.preventDefault();
          setPendingWorkspaceDeletePath(null);
          setSyncFeedback({ tone: "neutral", text: "Delete cancelled." });
          return;
        }

        event.preventDefault();
        return;
      }

      if (key === "j") {
        event.preventDefault();
        moveWorkspaceKeyboardSelection(1);
        return;
      }

      if (key === "k") {
        event.preventDefault();
        moveWorkspaceKeyboardSelection(-1);
        return;
      }

      const commandNode = getWorkspaceKeyboardNode();

      if (key === " " || key === "Spacebar") {
        if (!commandNode) {
          return;
        }

        event.preventDefault();

        if (commandNode.kind === "folder") {
          if (commandNode.children.length > 0) {
            handleToggleFolder(commandNode.path);
          }
          return;
        }

        handleOpenWorkspaceFile(commandNode.path);
        return;
      }

      if (key === "Enter") {
        if (!commandNode) {
          return;
        }

        event.preventDefault();

        if (commandNode.kind === "folder") {
          if (commandNode.children.length > 0) {
            handleToggleFolder(commandNode.path);
          }
          return;
        }

        handlePinWorkspaceFile(commandNode.path);
        return;
      }

      if (key === "n") {
        event.preventDefault();
        if (isTrashViewOpen) {
          setSyncFeedback({ tone: "error", text: "Leave Trash before creating files." });
          return;
        }
        handleNewDocument();
        return;
      }

      if (key === "N") {
        event.preventDefault();
        if (isTrashViewOpen) {
          setSyncFeedback({ tone: "error", text: "Leave Trash before creating folders." });
          return;
        }
        handleAddFolder();
        return;
      }

      if (key === "r") {
        if (!commandNode) {
          return;
        }

        event.preventDefault();

        if (handleWorkspaceKeyboardRestore(commandNode)) {
          return;
        }

        if (!canRenameWorkspaceNode(commandNode)) {
          return;
        }

        handleRequestWorkspaceRename(commandNode);
        return;
      }

      if (key === "d") {
        if (!commandNode || !canDeleteWorkspaceNode(commandNode)) {
          return;
        }

        event.preventDefault();
        setPendingWorkspaceDeletePath(commandNode.path);
        setSyncFeedback({
          tone: "neutral",
          text: `Delete ${commandNode.name}? Press y to confirm or n to cancel.`
        });
        return;
      }

      if (key === "y") {
        if (!commandNode) {
          return;
        }

        event.preventDefault();
        handleWorkspaceKeyboardCopy(commandNode, "copy");
        return;
      }

      if (key === "x") {
        if (!commandNode) {
          return;
        }

        event.preventDefault();
        handleWorkspaceKeyboardCopy(commandNode, "cut");
        return;
      }

      if (key === "p") {
        event.preventDefault();
        handleWorkspaceKeyboardPaste(commandNode);
      }
    },
    [
      activeSidebarTool,
      getWorkspaceKeyboardNode,
      handleAddFolder,
      handleDeleteWorkspaceNode,
      handleNewDocument,
      handleOpenWorkspaceFile,
      handlePinWorkspaceFile,
      handleRequestWorkspaceRename,
      handleToggleFolder,
      handleWorkspaceKeyboardCopy,
      handleWorkspaceKeyboardPaste,
      handleWorkspaceKeyboardRestore,
      isTrashViewOpen,
      moveWorkspaceKeyboardSelection,
      pendingWorkspaceDeletePath,
      setSyncFeedback,
      snapshot.preferences.vimMode,
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
  const jumpToDiagnostic = useCallback((diagnostic: CompileDiagnostic, fallbackPath: string) => {
    if (!diagnostic.line) {
      return;
    }

    const diagnosticPath = normalizeWorkspacePath(diagnostic.path ?? fallbackPath);
    const currentPath = normalizeWorkspacePath(activeSourcePathRef.current);
    const column = diagnostic.column ?? 1;

    if (!diagnosticPath || diagnosticPath === currentPath) {
      editorRef.current?.focusRange({ line: diagnostic.line, column });
      return;
    }

    const matchingNode = findWorkspaceNodeByPath(visibleWorkspaceTree, diagnosticPath);
    if (matchingNode?.kind === "file" && matchingNode.source.kind === "document") {
      focusDocumentLocation(matchingNode.source.id, diagnostic.line, column);
    }
  }, [focusDocumentLocation, visibleWorkspaceTree]);

  const rerunBuildLogEntry = useCallback((entry: BuildLogEntry) => {
    const targetPath = normalizeWorkspacePath(entry.sourcePath);
    const matchingNode = findWorkspaceNodeByPath(visibleWorkspaceTree, targetPath);

    pendingCompileTriggerRef.current = "rerun";

    if (matchingNode?.kind === "file" && matchingNode.source.kind === "document") {
      focusDocumentLocation(matchingNode.source.id, 1, 1);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => queueCompile(false));
      });
      return;
    }

    if (targetPath === normalizeWorkspacePath(activeSourcePathRef.current)) {
      queueCompile(false);
    }
  }, [focusDocumentLocation, queueCompile, visibleWorkspaceTree]);

  const renderLatexPackageResolutionRow = (
    entry: LatexPackageResolution,
    key: string
  ): ReactNode => {
    const bundle = entry.bundleId ? latexBundleCacheById.get(entry.bundleId) : null;
    const packageKey = normalizeLatexPackageSelectionName(entry.name);
    const packageCached = Boolean(
      entry.bundleId &&
      !bundle?.defaultLoaded &&
      cachedLatexPackageKeys.has(packageKey) &&
      bundle?.cached
    );
    const bundleReady = Boolean(entry.bundleId && bundle?.cached);
    const isInstallingPackage = installingLatexPackageName === entry.name;
    const bundleLabel = entry.bundleId
      ? formatLatexPackageBundleLabel(entry.bundleId)
      : "Not in bundled catalog";
    const statusLabel = entry.bundleId
      ? bundle?.defaultLoaded
        ? "Loaded by default"
        : packageCached
          ? "Cached"
          : bundleReady
            ? "Bundle ready"
            : "Not cached"
      : "Unavailable";
    const buttonLabel = bundleReady ? "Cache" : `Cache ${bundleLabel}`;

    return (
      <article className="package-cache-row" key={key} role="listitem">
        <div className="package-cache-row__main">
          <strong>{entry.name}</strong>
          <span>
            {bundleLabel} · {statusLabel}
          </span>
        </div>
        {entry.bundleId && !bundle?.defaultLoaded && !packageCached ? (
          <button
            className="pane__button"
            disabled={isInstallingPackage}
            onClick={() => {
              void handleCacheLatexPackage(entry, bundleReady);
            }}
            type="button"
          >
            {isInstallingPackage ? "Caching..." : buttonLabel}
          </button>
        ) : (
          <span className="package-cache-row__badge">{statusLabel}</span>
        )}
      </article>
    );
  };
  const normalizedTransientSourceTabPath = transientSourceTabPath
    ? normalizeWorkspacePath(transientSourceTabPath)
    : null;
  const visibleSourceTabPaths = useMemo(() => {
    const tabs = normalizeUniqueWorkspacePaths(sourceTabPaths);

    if (
      normalizedTransientSourceTabPath &&
      !tabs.includes(normalizedTransientSourceTabPath) &&
      workspaceFilePathSet.has(normalizedTransientSourceTabPath)
    ) {
      return insertWorkspacePathAfterActive(tabs, normalizedTransientSourceTabPath, normalizedActiveSourcePath);
    }

    return tabs;
  }, [
    normalizedActiveSourcePath,
    normalizedTransientSourceTabPath,
    sourceTabPaths,
    workspaceFilePathSet
  ]);
  const visiblePreviewTabPaths = useMemo(
    () => normalizeUniqueWorkspacePaths(previewTabPaths),
    [previewTabPaths]
  );
  const workspaceGitBadgeByPath = useMemo<Record<string, WorkspaceGitBadgeKind>>(() => {
    const badges: Record<string, WorkspaceGitBadgeKind> = {};

    for (const entry of localRepoStatus?.entries ?? []) {
      const normalizedPath = normalizeWorkspacePath(entry.path);
      if (!normalizedPath) {
        continue;
      }

      if (entry.staged === "added" || entry.worktree === "untracked") {
        badges[normalizedPath] = "added";
      } else if (entry.staged === "deleted" || entry.worktree === "deleted") {
        badges[normalizedPath] = "deleted";
      } else {
        badges[normalizedPath] = "modified";
      }
    }

    for (const file of localRepoStatus?.mergeState?.files ?? []) {
      const normalizedPath = normalizeWorkspacePath(file.path);
      if (!normalizedPath) {
        continue;
      }

      badges[normalizedPath] = file.state === "conflict" ? "conflict" : "modified";
    }

    return badges;
  }, [localRepoStatus]);
  const visibleKeybindingDefinitions = useMemo(() => {
    const query = (keybindingSearchQuery.trim() || settingsSearchQuery.trim()).toLowerCase();

    if (!query) {
      return KEYBINDING_DEFINITIONS;
    }

    return KEYBINDING_DEFINITIONS.filter((definition) => {
      const binding = keybindings[definition.id];
      return [
        definition.label,
        definition.group,
        binding,
        definition.defaultBinding
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [keybindingSearchQuery, keybindings, settingsSearchQuery]);
  useEffect(() => {
    activateWorkspaceTabRef.current = (direction: -1 | 1) => {
      const activateTab = (
        paths: string[],
        activePath: string | null,
        onActivate: (path: string) => void
      ): boolean => {
        if (paths.length < 2) {
          return false;
        }

        const activeIndex = activePath ? paths.indexOf(activePath) : -1;
        const fallbackIndex = direction > 0 ? -1 : 0;
        const nextIndex =
          (activeIndex >= 0 ? activeIndex : fallbackIndex) + direction;
        const nextPath = paths[(nextIndex + paths.length) % paths.length];

        if (!nextPath) {
          return false;
        }

        onActivate(nextPath);
        return true;
      };

      const activateSourceTab = () =>
        activateTab(
          visibleSourceTabPaths,
          normalizedActiveSourcePath,
          handleActivateSourceTab
        );
      const activatePreviewTab = () =>
        activateTab(
          visiblePreviewTabPaths,
          activePreviewPath,
          handleActivatePreviewTab
        );

      if (lastZoomPaneTargetRef.current === "preview") {
        return activatePreviewTab() || activateSourceTab();
      }

      return activateSourceTab() || activatePreviewTab();
    };
  }, [
    activePreviewPath,
    handleActivatePreviewTab,
    handleActivateSourceTab,
    normalizedActiveSourcePath,
    visiblePreviewTabPaths,
    visibleSourceTabPaths
  ]);
  useEffect(() => {
    activeSourceTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [normalizedActiveSourcePath, visibleSourceTabPaths]);

  useEffect(() => {
    activePreviewTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePreviewPath, visiblePreviewTabPaths]);

  const renderWorkspaceTabStrip = ({
    activePath,
    ariaLabel,
    kind,
    onActivate,
    onClose,
    paths
  }: {
    activePath: string | null;
    ariaLabel: string;
    kind: WorkspaceTabKind;
    onActivate: (path: string) => void;
    onClose: (path: string) => void;
    paths: string[];
  }) => {
    const normalizedSourceTabs = normalizeUniqueWorkspacePaths(sourceTabPaths);

    return (
      <div className="pane-tabbar">
        <div
          className="pane-tabs"
          role="tablist"
          aria-label={ariaLabel}
          onWheel={handleWorkspaceTabWheel}
        >
          {paths.map((path) => {
            const isActiveTab = path === activePath;
            const canCloseTab =
              kind === "preview" ||
              path === normalizedTransientSourceTabPath ||
              normalizedSourceTabs.includes(path);
            const isPreviewSourceTab =
              kind === "source" &&
              path === normalizedTransientSourceTabPath &&
              !sourceTabPaths.includes(path);
            const isDraggingTab =
              draggingWorkspaceTab?.kind === kind && draggingWorkspaceTab.path === path;
            const dropSide =
              workspaceTabDropTarget?.kind === kind && workspaceTabDropTarget.path === path
                ? workspaceTabDropTarget.side
                : null;
            const tabDisplayPath = getWorkspaceTabDisplayPath(kind, path);
            const tabLabel = getWorkspaceBaseName(tabDisplayPath);

            return (
              <div
                className={`pane-tab ${isActiveTab ? "pane-tab--active" : ""} ${
                  isDraggingTab ? "pane-tab--dragging" : ""
                } ${isPreviewSourceTab ? "pane-tab--preview" : ""} ${
                  dropSide === "before" ? "pane-tab--drop-before" : ""
                } ${dropSide === "after" ? "pane-tab--drop-after" : ""}`}
                draggable
                key={path}
                ref={isActiveTab ? (kind === "source" ? activeSourceTabRef : activePreviewTabRef) : undefined}
                onDragEnd={handleWorkspaceTabDragEnd}
                onDragOver={handleWorkspaceTabDragOver(kind, path)}
                onDragStart={handleWorkspaceTabDragStart(kind, path)}
                onDrop={handleWorkspaceTabDrop(kind, path)}
                title={tabDisplayPath}
              >
                <button
                  aria-selected={isActiveTab}
                  className="pane-tab__button"
                  onClick={() => onActivate(path)}
                  role="tab"
                  title={tabDisplayPath}
                  type="button"
                >
                  <span className="pane-tab__label">{tabLabel}</span>
                </button>
                {canCloseTab ? (
                  <button
                    aria-label={`Close ${tabDisplayPath}`}
                    className="pane-tab__close"
                    draggable={false}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(path);
                    }}
                    title={`Close ${tabDisplayPath}`}
                    type="button"
                  >
                    <span aria-hidden="true" className="pane-tab__close-icon" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const sourceToolsPanel = isSourceFileEditable ? (
    <div className="source-tools-panel">
      <div className="source-tools-panel__section">
        <div className="pane__toolbar-group source-tools-panel__grid">
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
          <button
            aria-label="Format document"
            className="pane__button pane__button--compact pane__icon-button"
            disabled={!isActiveSourceFormatterEnabled}
            onClick={handleFormatDocument}
            title={`Format document (${formatDocumentShortcutLabel})`}
            type="button"
          >
            <span aria-hidden="true" className="toolbar-icon toolbar-icon--format" />
          </button>
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

      <div className="source-tools-panel__section">
        <div className={`matrix-menu ${openToolbarMenu === "matrix" ? "matrix-menu--open" : ""}`}>
          <button
            aria-expanded={openToolbarMenu === "matrix"}
            aria-label="Matrix options"
            className="pane__button source-tools-panel__dropdown-button"
            onClick={() => toggleToolbarMenu("matrix")}
            title="Matrix options"
            type="button"
          >
            <span>Matrix</span>
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
            className="pane__button source-tools-panel__dropdown-button"
            onClick={() => toggleToolbarMenu("table")}
            title="Table options"
            type="button"
          >
            <span>Table</span>
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

      <div className="source-tools-panel__section">
        <div className={`source-symbol-menu ${openToolbarMenu === "symbols" ? "source-symbol-menu--open" : ""}`}>
          <button
            aria-expanded={openToolbarMenu === "symbols"}
            aria-label="Symbols"
            className="pane__button source-tools-panel__dropdown-button"
            onClick={() => toggleToolbarMenu("symbols")}
            title="Symbols"
            type="button"
          >
            <span>Symbols</span>
          </button>
          {openToolbarMenu === "symbols" ? (
            <div className="source-symbol-menu__panel" role="menu" aria-label="Typst symbols">
              {SOURCE_SYMBOL_ITEMS.map((item) => (
                <button
                  key={item.template}
                  className="source-symbol-menu__item"
                  onBlur={clearSourceSymbolPreview}
                  onClick={() => {
                    handleInsertSymbol(item.template);
                    clearSourceSymbolPreview();
                    setOpenToolbarMenu(null);
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
          ) : null}
        </div>
      </div>
    </div>
  ) : (
    <div className="snippet-empty">Open an editable source file to use source tools.</div>
  );

  const projectGitHubPanel = gitHubClone.isOpen ? (
                      <div className={`project-clone-card project-clone-card--${gitHubClone.mode}`}>
                          <div className="project-clone-card__header">
                            <strong>
                              {gitHubClone.mode === "create" ? "Create GitHub repo" : "Clone GitHub repo"}
                            </strong>
                          </div>
                          {gitHubClone.status === "connected" && gitHubClone.accountLogin ? (
                            <div className="project-github-account">
                              <span className="toolbar-icon toolbar-icon--github" aria-hidden="true" />
                              <strong>{gitHubClone.accountLogin}</strong>
                            </div>
                          ) : (
                            <button
                              className="pane__button project-github-settings-button"
                              onClick={() => handleOpenSettingsTab("git")}
                              type="button"
                            >
                              Connect GitHub token in Settings
                            </button>
                          )}
                          <div className="project-clone-grid">
                            <label className="sync-field">
                              <span>Owner</span>
                              {gitHubClone.owners.length > 0 ? (
                                <select
                                  onChange={(event) => handleGitHubCloneOwnerChange(event.target.value)}
                                  value={gitHubClone.owner}
                                >
                                  {gitHubClone.owners.map((owner) => (
                                    <option key={owner.login} value={owner.login}>
                                      {owner.login}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  onChange={(event) => handleGitHubCloneOwnerChange(event.target.value)}
                                  placeholder="owner"
                                  type="text"
                                  value={gitHubClone.owner}
                                />
                              )}
                            </label>
                            <label className="sync-field">
                              <span>Repo</span>
                              {gitHubClone.mode === "clone" ? (
                                <select
                                  disabled={gitHubClone.isLoadingRepos || gitHubClone.status !== "connected"}
                                  onChange={(event) => handleGitHubCloneRepoSelection(event.target.value)}
                                  value={
                                    gitHubClone.repos.some((repo) => repo.name === gitHubClone.repo)
                                      ? gitHubClone.repo
                                      : ""
                                  }
                                >
                                  <option value="">
                                    {gitHubClone.isLoadingRepos ? "Loading repos..." : "Choose repo"}
                                  </option>
                                  {gitHubClone.repos.map((repo) => (
                                    <option key={repo.fullName} value={repo.name}>
                                      {repo.name}{repo.private ? " (private)" : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  onChange={(event) => handleGitHubCloneRepoSelection(event.target.value)}
                                  placeholder="New repository name"
                                  type="text"
                                  value={gitHubClone.repo}
                                />
                              )}
                            </label>
                          </div>
                          <div className="project-clone-grid">
                            <label className="sync-field">
                              <span>Branch</span>
                              {gitHubClone.mode === "clone" && gitHubClone.branches.length > 0 ? (
                                <select
                                  disabled={gitHubClone.isLoadingBranches}
                                  onChange={(event) =>
                                    setGitHubClone((current) => ({
                                      ...current,
                                      branch: event.target.value
                                    }))
                                  }
                                  value={
                                    gitHubClone.branches.some((branch) => branch.name === gitHubClone.branch)
                                      ? gitHubClone.branch
                                      : ""
                                  }
                                >
                                  <option value="">
                                    {gitHubClone.isLoadingBranches ? "Loading branches..." : "Choose branch"}
                                  </option>
                                  {gitHubClone.branches.map((branch) => (
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
                                    setGitHubClone((current) => ({
                                      ...current,
                                      branch: event.target.value
                                    }))
                                  }
                                  placeholder={gitHubClone.isLoadingBranches ? "Loading branches..." : "main"}
                                  type="text"
                                  value={gitHubClone.branch}
                                />
                              )}
                            </label>
                            {gitHubClone.mode === "clone" ? (
                              <label className="sync-field">
                                <span>Local name</span>
                                <input
                                  onChange={(event) =>
                                    setGitHubClone((current) => ({
                                      ...current,
                                      projectName: event.target.value
                                    }))
                                  }
                                  placeholder={gitHubClone.repo || "Project name"}
                                  type="text"
                                  value={gitHubClone.projectName}
                                />
                              </label>
                            ) : (
                              <label className="sync-field project-create-private-field">
                                <span>Visibility</span>
                                <div className="project-create-private-toggle">
                                  <strong>Private</strong>
                                  <input
                                    checked={createGitHubRepoPrivate}
                                    onChange={(event) => setCreateGitHubRepoPrivate(event.target.checked)}
                                    type="checkbox"
                                  />
                                </div>
                              </label>
                            )}
                          </div>
                          {gitHubClone.message ? (
                            <p className="project-clone-card__message">{gitHubClone.message}</p>
                          ) : null}
                          {gitHubClone.mode === "clone" && gitHubCloneBranchGuidance ? (
                            <p className="project-clone-card__message project-clone-card__message--warning">
                              {gitHubCloneBranchGuidance}
                            </p>
                          ) : null}
                          <div className="project-clone-actions">
                            {gitHubClone.mode === "clone" ? (
                              <button
                                className={`pane__button project-clone-button ${
                                  isSyncing && gitHubCloneProgressPercent !== null
                                    ? "project-clone-button--active"
                                    : ""
                                }`}
                                disabled={!canCloneGitHubRepository}
                                onClick={() => {
                                  void handleCloneGitHubRepository();
                                }}
                                style={
                                  {
                                    "--project-clone-progress": `${gitHubCloneProgressPercent ?? 0}%`
                                  } as CSSProperties
                                }
                                type="button"
                              >
                                <span>{isSyncing ? "Cloning..." : "Clone"}</span>
                              </button>
                            ) : (
                              <button
                                className="pane__button project-clone-button"
                                disabled={!canCreateGitHubRepository}
                                onClick={() => {
                                  void handleCreateGitHubRepoFromCurrentProject();
                                }}
                                type="button"
                              >
                                <span>{isSyncing ? "Creating..." : "Create and push"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      
  ) : null;

  const renderSettingsSheet = (embedded: boolean) => (
    <section
      aria-label="Typr settings"
      className={`settings-sheet ${embedded ? "settings-sheet--embedded" : ""} ${isMobileSettingsNavOpen ? "settings-sheet--mobile-nav-open" : ""}`}
      onClick={embedded ? undefined : (event) => event.stopPropagation()}
    >
      <div className="settings-sheet__header">
        <div className="settings-sheet__header-main">
          <h2>Settings</h2>
          <div className="settings-search-field">
            <input
              aria-label="Search settings"
              onChange={(event) => setSettingsSearchQuery(event.target.value)}
              placeholder="Search settings"
              type="search"
              value={settingsSearchQuery}
            />
            {settingsSearchQuery ? (
              <button
                aria-label="Clear settings search"
                className="settings-search-field__clear"
                onClick={() => setSettingsSearchQuery("")}
                type="button"
              >
                <span aria-hidden="true" className="package-search-clear__icon" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="settings-sheet__header-actions">
          <button
            className="pane__button"
            onClick={() => {
              saveCurrentSettingsScrollPosition();
              setIsMobileSettingsNavOpen(false);
              setIsSettingsOpen(false);
              if (embedded) {
                setActiveSidebarTool("files");
              }
            }}
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <button
        aria-expanded={isMobileSettingsNavOpen}
        className="settings-sheet__mobile-nav-toggle"
        onClick={() => setIsMobileSettingsNavOpen((current) => !current)}
        type="button"
      >
        <span>{getSettingsTabTitle(settingsTab)}</span>
        <span aria-hidden="true" className="settings-sheet__mobile-nav-chevron" />
      </button>
      <div className="settings-sheet__mobile-search">
        <div className="settings-search-field">
          <input
            aria-label="Search settings"
            onChange={(event) => setSettingsSearchQuery(event.target.value)}
            placeholder="Search settings"
            type="search"
            value={settingsSearchQuery}
          />
          {settingsSearchQuery ? (
            <button
              aria-label="Clear settings search"
              className="settings-search-field__clear"
              onClick={() => setSettingsSearchQuery("")}
              type="button"
            >
              <span aria-hidden="true" className="package-search-clear__icon" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="Settings tabs">
          <button
            aria-selected={settingsTab === "git"}
            className={`settings-tab ${settingsTab === "git" ? "settings-tab--active" : ""} ${
              settingsSearchQuery.trim() && !settingsSearchMatchingTabs.includes("git")
                ? "settings-tab--muted"
                : ""
            }`}
            onClick={() => handleSettingsTabSelect("git")}
            role="tab"
            type="button"
          >
            Git
          </button>
          <button
            aria-selected={settingsTab === "themes"}
            className={`settings-tab ${settingsTab === "themes" ? "settings-tab--active" : ""} ${
              settingsSearchQuery.trim() && !settingsSearchMatchingTabs.includes("themes")
                ? "settings-tab--muted"
                : ""
            }`}
            onClick={() => handleSettingsTabSelect("themes")}
            role="tab"
            type="button"
          >
            Themes
          </button>
          <button
            aria-selected={settingsTab === "editor"}
            className={`settings-tab ${settingsTab === "editor" ? "settings-tab--active" : ""} ${
              settingsSearchQuery.trim() && !settingsSearchMatchingTabs.includes("editor")
                ? "settings-tab--muted"
                : ""
            }`}
            onClick={() => handleSettingsTabSelect("editor")}
            role="tab"
            type="button"
          >
            Editor
          </button>
          <button
            aria-selected={settingsTab === "keybindings"}
            className={`settings-tab ${settingsTab === "keybindings" ? "settings-tab--active" : ""} ${
              settingsSearchQuery.trim() && !settingsSearchMatchingTabs.includes("keybindings")
                ? "settings-tab--muted"
                : ""
            }`}
            onClick={() => handleSettingsTabSelect("keybindings")}
            role="tab"
            type="button"
          >
            Keybindings
          </button>
          <button
            aria-selected={settingsTab === "snippets"}
            className={`settings-tab ${settingsTab === "snippets" ? "settings-tab--active" : ""} ${
              settingsSearchQuery.trim() && !settingsSearchMatchingTabs.includes("snippets")
                ? "settings-tab--muted"
                : ""
            }`}
            onClick={() => handleSettingsTabSelect("snippets")}
            role="tab"
            type="button"
          >
            Snippets
          </button>
          <button
            aria-selected={settingsTab === "packages"}
            className={`settings-tab ${settingsTab === "packages" ? "settings-tab--active" : ""} ${
              settingsSearchQuery.trim() && !settingsSearchMatchingTabs.includes("packages")
                ? "settings-tab--muted"
                : ""
            }`}
            onClick={() => handleSettingsTabSelect("packages")}
            role="tab"
            type="button"
          >
            Packages
          </button>
      </div>
      <div
        className="settings-sheet__body"
        onScroll={handleSettingsBodyScroll}
        ref={settingsBodyRef}
      >
        {settingsSearchQuery.trim() && settingsSearchMatchingTabs.length === 0 ? (
          <div className="settings-search-empty">No matching settings.</div>
        ) : null}

        {settingsTab === "git" ? (
          <div className="settings-panel settings-panel--git" role="tabpanel">
            <div className="git-setup-strip git-setup-strip--token-only">
              <a
                aria-label="Open GitHub personal access token settings"
                className="git-setup-step git-setup-step--link"
                href="https://github.com/settings/personal-access-tokens/new"
                rel="noreferrer"
                target="_blank"
                title="Open GitHub"
              >
                <span aria-hidden="true" className="git-setup-step__icon toolbar-icon toolbar-icon--github" />
              </a>
              <label className="sync-field git-token-field">
                <span>Fine-grained token</span>
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
                className={`pane__button git-connect-button ${
                  gitHubDiscovery.status === "connected" ? "pane__button--success" : ""
                }`}
                disabled={!selectedGitProject || gitHubDiscovery.status === "loading" || !selectedGitToken.trim()}
                onClick={() => {
                  void handleGitHubTokenConnectionAction();
                }}
                type="button"
              >
                {gitHubDiscovery.status === "loading"
                  ? "Connecting..."
                  : gitHubDiscovery.status === "connected"
                    ? gitHubDiscovery.accountLogin
                      ? `Connected as ${gitHubDiscovery.accountLogin}`
                      : "Connected"
                    : "Connect token"}
              </button>
            </div>

            <div className="git-settings-card git-settings-card--guidance">
              <p className="git-settings-note">
                Use a fine-grained GitHub token with repository Contents read/write access. To create repositories from Typr, also grant Administration read/write for the selected owner. Prefer a token that expires in 30 to 90 days instead of one with no expiration.
              </p>
              <p className="git-settings-note">
                Clone existing remote repositories from the Projects tab. Manage pulls, commits, pushes, and conflicts from the Sync tab.
              </p>
              <div className="git-permission-list">
                <div className="git-permission-row">
                  <span>Existing repos</span>
                  <strong>Contents read/write</strong>
                </div>
                <div className="git-permission-row">
                  <span>Create repos</span>
                  <strong>Contents + Administration read/write</strong>
                </div>
              </div>
            </div>

            <div className="git-settings-card git-settings-card--advanced">
              <div className="git-advanced-grid">
                <label className="sync-field">
                  <span>.gitignore</span>
                  <textarea
                    disabled={!selectedProjectRepository}
                    onChange={(event) => handleProjectGitignoreChange(event.target.value)}
                    placeholder={"*.pdf\n.env\nbuild/"}
                    rows={6}
                    value={projectGitignoreContent}
                  />
                </label>

                <label className="sync-field">
                  <span>Status ignore patterns</span>
                  <textarea
                    onChange={(event) => handleGitIgnorePatternsChange(event.target.value)}
                    placeholder={"figures/\n*.pdf\nnotes/private/**"}
                    rows={4}
                    value={stringifyIgnorePatterns(selectedGitProject?.ignorePatterns ?? [])}
                  />
                </label>
              </div>

              <label className="sync-field">
                <span>Default push message</span>
                <input
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(event) =>
                    handleGitProjectFieldChange("commitMessageTemplate", event.target.value)
                  }
                  placeholder="Sync from Typr"
                  type="text"
                  value={selectedGitProject?.commitMessageTemplate ?? ""}
                />
              </label>
            </div>

          </div>
        ) : settingsTab === "themes" ? (
          <div className="settings-panel" role="tabpanel">
            <div className="settings-section">
              <div className="settings-section__header">
                <h3>Theme</h3>
              </div>

              <div className="theme-auto-row">
                <label
                  className={`theme-auto-option ${
                    snapshot.preferences.theme === AUTO_THEME_ID ? "theme-auto-option--active" : ""
                  }`}
                >
                  <span>
                    <strong>Follow system default</strong>
                  </span>
                  <input
                    checked={snapshot.preferences.theme === AUTO_THEME_ID}
                    onChange={(event) =>
                      setThemeMode(event.target.checked ? AUTO_THEME_ID : theme.id)
                    }
                    type="checkbox"
                  />
                </label>
              </div>

              <div className="theme-columns">
                <section className="theme-column">
                  <div className="theme-column__header">
                    <h4>Light</h4>
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
        ) : settingsTab === "editor" ? (
          <div className="settings-panel" role="tabpanel">
            <div className="settings-section">
              <div className="settings-section__header">
                <h3>Editor</h3>
              </div>

              <div className="settings-toggle-stack">
                <label className="settings-toggle">
                  <span>
                    <strong>Live compilation (experimental)</strong>
                    <small>
                      Recompile the active Typst document automatically while you edit.
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
                    <strong>Lint while editing</strong>
                    <small>
                      Show browser-available linter diagnostics in the source editor.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.editorTooling.lintOnEdit}
                    onChange={handleLintOnEditToggle}
                    type="checkbox"
                  />
                </label>

                <label className="settings-toggle">
                  <span>
                    <strong>Format on compile</strong>
                    <small>
                      Run the selected formatter before compile or Markdown preview.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.editorTooling.formatOnCompile}
                    onChange={handleFormatOnCompileToggle}
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
                    <strong>LaTeX math preview</strong>
                    <small>
                      Show an inline RaTeX preview while typing valid math in LaTeX files.
                    </small>
                  </span>
                  <input
                    checked={snapshot.preferences.latexMathPreview}
                    onChange={handleLatexMathPreviewToggle}
                    type="checkbox"
                  />
                </label>

                <div className="settings-toggle settings-toggle--stacked">
                  <label className="settings-toggle__row">
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
                    <label className="settings-slider settings-slider--embedded">
                      <span>
                        <strong>Smear cursor</strong>
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
              </div>

              <section className="settings-section settings-section--nested mobile-keyboard-settings">
                <div className="settings-section__header">
                  <h3>Mobile quick keys</h3>
                  <span className="pane__meta">Editor footer</span>
                </div>

                <div className="settings-toggle-stack">
                  <label className="settings-toggle">
                    <span>
                      <strong>Show extra keyboard row</strong>
                      <small>Show language-specific quick keys below the mobile source editor.</small>
                    </span>
                    <input
                      checked={snapshot.preferences.mobileKeyboard.enabled}
                      onChange={handleMobileKeyboardEnabledToggle}
                      type="checkbox"
                    />
                  </label>
                </div>

                <div className="mobile-keyboard-settings__list">
                  {(["typst", "latex", "markdown"] as MobileKeyboardLanguage[]).map((language) => (
                    <label className="sync-field mobile-keyboard-settings__field" key={language}>
                      <span>{formatSourceLanguageLabel(language)} keys</span>
                      <textarea
                        onChange={(event) => handleMobileKeyboardLabelsChange(language, event.target.value)}
                        rows={2}
                        spellCheck={false}
                        value={formatMobileKeyboardLabels(snapshot.preferences.mobileKeyboard.keys[language])}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="settings-section settings-section--nested">
                <div className="settings-section__header">
                  <h3>Formatters and linters</h3>
                  <span className="pane__meta">Browser mode</span>
                </div>

                <div className="package-repository-list" role="list">
                  {(["typst", "latex", "markdown"] as EditorToolLanguage[]).map((language) => {
                    const languageTools = snapshot.preferences.editorTooling.languages[language];
                    const builtInDescription =
                      language === "typst"
                        ? "Built-in Typst formatting and linting run offline in the browser."
                        : language === "latex"
                          ? "Built-in LaTeX formatting and BusyTeX-oriented linting run offline in the browser."
                          : "Built-in Markdown formatting and linting run offline in the browser.";

                    return (
                      <article className="package-cache-row" key={language} role="listitem">
                        <div className="package-cache-row__main">
                          <strong>{formatEditorToolLanguageLabel(language)}</strong>
                          <span>{builtInDescription}</span>
                        </div>
                        <label className="sync-field">
                          <span>Formatter</span>
                          <select
                            onChange={(event) =>
                              handleFormatterChange(language, event.target.value as EditorFormatterId)
                            }
                            value={languageTools.formatter}
                          >
                            <option value="disabled">Disabled</option>
                            <option value="built-in">
                              Built in
                            </option>
                          </select>
                        </label>
                        <label className="sync-field">
                          <span>Linter</span>
                          <select
                            onChange={(event) =>
                              handleLinterChange(language, event.target.value as EditorLinterId)
                            }
                            value={languageTools.linter}
                          >
                            <option value="disabled">Disabled</option>
                            <option value="built-in">
                              Built in
                            </option>
                          </select>
                        </label>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        ) : settingsTab === "keybindings" ? (
          <div className="settings-panel" role="tabpanel">
            <div className="settings-section">
              <div className="keybindings-search-field">
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setKeybindingSearchQuery(event.target.value)}
                  placeholder="Search keybindings"
                  type="search"
                  value={keybindingSearchQuery}
                />
                {keybindingSearchQuery ? (
                  <button
                    aria-label="Clear keybinding search"
                    className="package-search-clear"
                    onClick={() => setKeybindingSearchQuery("")}
                    type="button"
                  >
                    <span aria-hidden="true" className="package-search-clear__icon" />
                  </button>
                ) : null}
              </div>
              <div className="keybindings-table" role="table" aria-label="Keyboard shortcuts">
                <div className="keybindings-table__row keybindings-table__row--head" role="row">
                  <span role="columnheader">Action</span>
                  <span role="columnheader">Shortcut</span>
                </div>
                {visibleKeybindingDefinitions.map((definition, index) => {
                  const binding = keybindings[definition.id];
                  const conflicts = getKeybindingConflictsForBinding(
                    keybindings,
                    definition.id,
                    binding
                  );
                  const pendingConflict =
                    pendingKeybindingConflict?.commandId === definition.id
                      ? pendingKeybindingConflict
                      : null;
                  const displayedConflictIds = pendingConflict?.conflictIds ?? conflicts;
                  const displayedConflictBinding = pendingConflict?.binding ?? binding;
                  const conflictLabels = displayedConflictIds
                    .map((conflictId) => getKeybindingLabel(conflictId))
                    .join(", ");
                  const isRecording = recordingKeybindingId === definition.id;
                  const isModified = binding !== definition.defaultBinding;
                  const previousDefinition = visibleKeybindingDefinitions[index - 1];
                  const showGroupHeader = previousDefinition?.group !== definition.group;

                  return (
                    <Fragment key={definition.id}>
                      {showGroupHeader ? (
                        <div className="keybindings-table__group" role="row">
                          <span role="cell">{definition.group}</span>
                        </div>
                      ) : null}
                      <div className="keybindings-table__row" role="row">
                        <span className="keybindings-table__action" role="cell">
                          <strong>{definition.label}</strong>
                        </span>
                        <div className="keybindings-table__binding" role="cell">
                          <button
                            className={`keybinding-recorder ${
                              isRecording ? "keybinding-recorder--active" : ""
                            }`}
                            data-keybinding-recorder={definition.id}
                            onClick={() => {
                              setPendingKeybindingConflict(null);
                              setRecordingKeybindingId(definition.id);
                            }}
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

                              handleRecordedKeybinding(definition.id, nextBinding);
                              setRecordingKeybindingId(null);
                            }}
                            type="button"
                          >
                            {isRecording
                              ? "Press keys"
                              : formatKeybinding(binding, isAppleShortcutPlatform)}
                          </button>
                          {isModified ? (
                            <button
                              aria-label={`Reset ${definition.label}`}
                              className="pane__button pane__button--compact pane__icon-button keybinding-reset-button"
                              onClick={() => handleKeybindingReset(definition.id)}
                              title={`Reset to ${formatKeybinding(
                                definition.defaultBinding,
                                isAppleShortcutPlatform
                              )}`}
                              type="button"
                            >
                              <span aria-hidden="true" className="toolbar-icon toolbar-icon--reset" />
                            </button>
                          ) : null}
                        </div>
                        {displayedConflictIds.length > 0 ? (
                          <div className="keybinding-conflict" role="alert">
                            <span>
                              <strong>
                                {formatKeybinding(
                                  displayedConflictBinding,
                                  isAppleShortcutPlatform
                                )}
                              </strong>{" "}
                              is already used by {conflictLabels}.
                            </span>
                            <div className="keybinding-conflict__actions">
                              <button
                                className="pane__button pane__button--compact"
                                onClick={() =>
                                  pendingConflict
                                    ? handleResolvePendingKeybindingConflict()
                                    : handleWhackKeybindingConflicts(
                                        definition.id,
                                        displayedConflictBinding
                                      )
                                }
                                type="button"
                              >
                                Whack-a-mole
                              </button>
                              {pendingConflict ? (
                                <button
                                  className="pane__button pane__button--compact pane__button--quiet"
                                  onClick={handleCancelPendingKeybindingConflict}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Fragment>
                  );
                })}
                {visibleKeybindingDefinitions.length === 0 ? (
                  <div className="snippet-empty">No matching keybindings.</div>
                ) : null}
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
                    <span>Rectangular selection</span>
                    <kbd>{isAppleShortcutPlatform ? "Shift+Option+Drag" : "Shift+Alt+Drag"}</kbd>
                  </div>
                  <div>
                    <span>Zoom pane under pointer</span>
                    <kbd>{isAppleShortcutPlatform ? "Option+Scroll" : "Alt+Scroll"}</kbd>
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
                  {activeSnippetLanguageLabel} · {activeAllSnippets.length} total ·{" "}
                  {activeCustomSnippets.length} custom
                </span>
              </div>

              <div
                className="snippet-language-tabs"
                role="tablist"
                aria-label="Snippet language"
              >
                {SNIPPET_LANGUAGES.map((language) => (
                  <button
                    aria-selected={activeSnippetLanguage === language}
                    className={`snippet-language-tab ${
                      activeSnippetLanguage === language ? "snippet-language-tab--active" : ""
                    }`}
                    key={language}
                    onClick={() => handleSnippetLanguageChange(language)}
                    role="tab"
                    type="button"
                  >
                    {SNIPPET_LANGUAGE_LABELS[language]}
                  </button>
                ))}
              </div>

              <div className="snippet-columns">
                <section className="snippet-column">
                  <div className="snippet-column__header">
                    <h4>Built in</h4>
                    <span className="pane__meta">{activeDefaultSnippets.length}</span>
                  </div>
                  <div className="snippet-list">
                    {activeDefaultSnippets.map((snippet) => (
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
                    <span className="pane__meta">{activeCustomSnippets.length}</span>
                  </div>
                  {activeCustomSnippets.length > 0 ? (
                    <div className="snippet-list">
                      {activeCustomSnippets.map((snippet) => (
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
                      Import your own {activeSnippetLanguageLabel} snippets to extend
                      autocomplete.
                    </div>
                  )}
                </section>
              </div>

              <section className="snippet-import-card">
                <div className="snippet-import-card__copy">
                  <h4>Import snippets</h4>
                  <p>
                    Paste JSON here or upload a file for {activeSnippetLanguageLabel}. Accepted
                    shapes include a <code>snippets</code> array or a simple object map of{" "}
                    <code>prefix</code> to snippet body.
                  </p>
                </div>
                <textarea
                  className="snippet-import-card__textarea"
                  onChange={handleSnippetImportTextChange}
                  placeholder={JSON.stringify(
                    getSnippetImportTemplate(activeSnippetLanguage),
                    null,
                    2
                  )}
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
                <h3>Packages</h3>
                <span className="pane__meta">
                  {packageSettingsScope === "typst"
                    ? `${packageCacheEntries.length} installed · ${formatByteSize(packageCacheTotalBytes)}`
                    : `${detectedLatexPackages.length} detected · ${
                        latexPackageBundleEntries.filter((entry) => entry.cached).length
                      } bundles ready`}
                </span>
              </div>

              <div className="package-scope-tabs" role="tablist" aria-label="Package type">
                <button
                  aria-selected={packageSettingsScope === "typst"}
                  className={`package-scope-tab ${
                    packageSettingsScope === "typst" ? "package-scope-tab--active" : ""
                  }`}
                  onClick={() => setPackageSettingsScope("typst")}
                  role="tab"
                  type="button"
                >
                  Typst
                </button>
                <button
                  aria-selected={packageSettingsScope === "latex"}
                  className={`package-scope-tab ${
                    packageSettingsScope === "latex" ? "package-scope-tab--active" : ""
                  }`}
                  onClick={() => setPackageSettingsScope("latex")}
                  role="tab"
                  type="button"
                >
                  LaTeX
                </button>
              </div>

              {packageSettingsScope === "typst" ? (
                <>
                  <section className="package-cache-card">
                <div className="package-cache-card__copy">
                  <h4>Add from Universe</h4>
                  <p>
                    Search Typst Universe for packages while online, then download them now so
                    they stay available offline later.
                  </p>
                </div>
                <div className="package-search-field">
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
                  {packageSearchQuery ? (
                    <button
                      aria-label="Clear package search"
                      className="package-search-clear"
                      onClick={() => setPackageSearchQuery("")}
                      type="button"
                    >
                      <span aria-hidden="true" className="package-search-clear__icon" />
                    </button>
                  ) : null}
                </div>
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
                </>
              ) : (
                <>
                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>Manual download</h4>
                      <p>
                        Search LaTeX package names from the local BusyTeX catalog, then cache the
                        TeX Live bundle that contains them.
                      </p>
                    </div>
                    <div className="package-search-field">
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="package-search-input"
                        onChange={(event) => setLatexPackageSearchQuery(event.target.value)}
                        placeholder="Search LaTeX packages like amsmath or tikz"
                        type="search"
                        value={latexPackageSearchQuery}
                      />
                      {latexPackageSearchQuery ? (
                        <button
                          aria-label="Clear package search"
                          className="package-search-clear"
                          onClick={() => setLatexPackageSearchQuery("")}
                          type="button"
                        >
                          <span aria-hidden="true" className="package-search-clear__icon" />
                        </button>
                      ) : null}
                    </div>
                    {isLatexPackageCacheLoading && !latexPackageCatalog ? (
                      <div className="snippet-empty">Loading LaTeX package catalog...</div>
                    ) : latexPackageSearchResults.length > 0 ? (
                      <div className="package-repository-list" role="list">
                        {latexPackageSearchResults.map((entry) =>
                          renderLatexPackageResolutionRow(entry, `search-${entry.name}`)
                        )}
                      </div>
                    ) : (
                      <div className="snippet-empty">
                        {latexPackageSearchQuery.trim()
                          ? "No matching LaTeX packages found in the bundled catalog."
                          : "Start typing to find the bundle for a LaTeX package."}
                      </div>
                    )}
                  </section>

                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>Used in project</h4>
                      <p>
                        Packages from LaTeX source files appear here automatically. Uncached
                        entries can be downloaded from their row.
                      </p>
                    </div>
                    {detectedLatexPackages.length > 0 ? (
                      <div className="package-cache-list" role="list">
                        {uncachedDetectedLatexPackages.map((entry) =>
                          renderLatexPackageResolutionRow(entry, `detected-missing-${entry.name}`)
                        )}
                        {detectedLatexPackages
                          .filter(
                            (entry) =>
                              !uncachedDetectedLatexPackages.some(
                                (missingEntry) => missingEntry.name === entry.name
                              )
                          )
                          .map((entry) =>
                            renderLatexPackageResolutionRow(entry, `detected-cached-${entry.name}`)
                          )}
                      </div>
                    ) : (
                      <div className="snippet-empty">
                        No LaTeX packages have been detected in this project yet.
                      </div>
                    )}
                  </section>

                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>Manual extra packages</h4>
                      <p>Extra packages cached from search.</p>
                    </div>
                    {manualExtraLatexPackages.length > 0 ? (
                      <div className="package-cache-list" role="list">
                        {manualExtraLatexPackages.map((entry) => (
                          <article className="package-cache-row" key={entry.name} role="listitem">
                            <div className="package-cache-row__main">
                              <strong>{entry.name}</strong>
                              <span>{formatLatexPackageBundleLabel("texlive-extra")}</span>
                            </div>
                            <button
                              className="pane__button pane__button--quiet"
                              onClick={() => handleRemoveCachedLatexPackage(entry.name)}
                              type="button"
                            >
                              Remove
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="snippet-empty">
                        No manually cached extra packages.
                      </div>
                    )}
                  </section>

                  <section className="package-cache-card">
                    <div className="package-cache-card__copy">
                      <h4>TeX Live bundle storage</h4>
                      <p>
                        BusyTeX downloads LaTeX packages as grouped TeX Live data bundles. Basic
                        is loaded by default; Recommended and Extra can be cached manually.
                      </p>
                    </div>
                    <div className="package-cache-card__actions">
                      <button
                        className="pane__button"
                        onClick={() => {
                          void refreshLatexPackageCache();
                        }}
                        type="button"
                      >
                        {isLatexPackageCacheLoading ? "Refreshing..." : "Refresh"}
                      </button>
                      <button
                        className="pane__button pane__button--quiet"
                        disabled={
                          isLatexPackageCacheClearing ||
                          latexPackageBundleEntries.every((entry) => entry.defaultLoaded || !entry.cached)
                        }
                        onClick={() => {
                          void handleClearLatexBundles();
                        }}
                        type="button"
                      >
                        {isLatexPackageCacheClearing ? "Clearing..." : "Clear cache"}
                      </button>
                    </div>
                    {latexPackageFeedback.text ? (
                      <div
                        className={`sync-feedback package-cache-card__feedback ${
                          latexPackageFeedback.tone === "success"
                            ? "sync-feedback--success"
                            : latexPackageFeedback.tone === "error"
                              ? "sync-feedback--error"
                              : ""
                        }`}
                      >
                        <span>{latexPackageFeedback.text}</span>
                      </div>
                    ) : null}
                    {isLatexPackageCacheLoading && latexPackageBundleEntries.length === 0 ? (
                      <div className="snippet-empty">Loading LaTeX package bundles...</div>
                    ) : (
                      <div className="package-cache-list" role="list">
                        {latexPackageBundleEntries.map((entry) => (
                          <article className="package-cache-row" key={entry.id} role="listitem">
                            <div className="package-cache-row__main">
                              <strong>{entry.label}</strong>
                              <span>
                                {entry.packageCount.toLocaleString()} packages ·{" "}
                                {entry.sizeBytes > 0
                                  ? formatByteSize(entry.sizeBytes)
                                  : "size unavailable"}{" "}
                                ·{" "}
                                {entry.defaultLoaded
                                  ? "Loaded by default"
                                  : entry.cached
                                    ? "Cached"
                                    : "Not cached"}
                              </span>
                            </div>
                            {entry.defaultLoaded ? (
                              <span className="package-cache-row__badge">Default</span>
                            ) : entry.cached ? (
                              <button
                                className="pane__button pane__button--quiet"
                                disabled={installingLatexBundleId === entry.id}
                                onClick={() => {
                                  void handleRemoveLatexBundle(entry.id);
                                }}
                                type="button"
                              >
                                Remove
                              </button>
                            ) : (
                              <button
                                className="pane__button"
                                disabled={installingLatexBundleId === entry.id}
                                onClick={() => {
                                  void handleCacheLatexBundle(entry.id);
                                }}
                                type="button"
                              >
                                {installingLatexBundleId === entry.id ? "Caching..." : "Cache"}
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

    </section>
  );

  return (
    <div className={`app-shell ${isZenMode ? "app-shell--zen" : ""} ${isMobileEditorFullscreen ? "app-shell--editor-fullscreen" : ""}`}>
      <div className={`workspace-shell ${isMobileWorkspace ? "workspace-shell--mobile" : ""} ${
        isZenMode ? "workspace-shell--zen" : ""
      } ${isMobileEditorFullscreen ? "workspace-shell--editor-fullscreen" : ""}`}>
      {isMobileWorkspace || isZenMode ? null : (
        <aside className="activity-bar" aria-label="Sidebar tools">
          <div className="activity-bar__scroll">
            <div className="activity-bar__section">
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
                    className={`activity-icon activity-icon--${tool.id === "docs" ? "help" : tool.id}`}
                  />
                  {tool.id === "debug" && lastBuildFailed ? <span className="activity-status-badge" aria-hidden="true" /> : null}
                  <span className="visually-hidden">{tool.label}</span>
                </button>
              ))}
            </div>
            {(isSourcePaneHidden && isSourceFileEditable) || isPreviewCollapsed ? (
              <div className="activity-bar__section activity-bar__section--restore" aria-label="Hidden panes">
                {isSourcePaneHidden && isSourceFileEditable ? (
                  <button
                    aria-label="Show source"
                    className="activity-bar__button activity-bar__button--restore"
                    onClick={() => restoreWorkspacePane("source")}
                    title="Show source"
                    type="button"
                  >
                    <span aria-hidden="true" className="activity-icon activity-icon--source" />
                    <span className="visually-hidden">Show source</span>
                  </button>
                ) : null}
                {isPreviewCollapsed ? (
                  <button
                    aria-label="Show preview"
                    className="activity-bar__button activity-bar__button--restore"
                    onClick={() => restoreWorkspacePane("preview")}
                    title="Show preview"
                    type="button"
                  >
                    <span aria-hidden="true" className="activity-icon activity-icon--preview" />
                    <span className="visually-hidden">Show preview</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="activity-bar__section activity-bar__section--bottom">
            <button
              aria-label="Docs"
              className="activity-bar__button"
              onClick={handleOpenTyprDocs}
              title="Docs"
              type="button"
            >
              <span aria-hidden="true" className="activity-icon activity-icon--help">?</span>
              <span className="visually-hidden">Docs</span>
            </button>
            <button
              aria-label="Settings"
              className="activity-bar__button"
              onClick={handleOpenSettings}
              title="Settings"
              type="button"
            >
              <span aria-hidden="true" className="activity-icon activity-icon--settings" />
              <span className="visually-hidden">Settings</span>
            </button>
          </div>
        </aside>
      )}

      <div className="workspace-main">
      <main
        className={`workspace workspace--triple workspace--${workspaceMode} ${
          isMobileWorkspace ? "workspace--mobile" : ""
        } ${isMobileEditorFullscreen ? "workspace--editor-fullscreen" : ""}`}
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
                onClick={() => handleMobileWorkspaceTabChange("files")}
                role="tab"
                type="button"
              >
                <span className="workspace-mobile-tab__label">{mobileSidebarTabLabel}</span>
              </button>
              <button
                aria-selected={mobileWorkspaceTab === "editor"}
                className={`workspace-mobile-tab ${
                  mobileWorkspaceTab === "editor" ? "workspace-mobile-tab--active" : ""
                }`}
                onClick={() => handleMobileWorkspaceTabChange("editor")}
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
                onClick={() => handleMobileWorkspaceTabChange("preview")}
                role="tab"
                type="button"
              >
                Preview
              </button>
            </div>
            {mobileWorkspaceTab === "files" ? (
              <div className="activity-bar activity-bar--mobile" aria-label="Sidebar tools">
                {MOBILE_SIDEBAR_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    aria-label={tool.label}
                    aria-pressed={activeSidebarTool === tool.id}
                    className={`activity-bar__button ${
                      activeSidebarTool === tool.id
                        ? "activity-bar__button--active"
                        : ""
                    }`}
                    onClick={() => {
                      if (tool.id === "docs") {
                        handleOpenTyprDocs();
                      } else if (tool.id === "settings") {
                        handleOpenSettings();
                      } else {
                        handleOpenSidebarTool(tool.id);
                      }
                    }}
                    title={tool.label}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`activity-icon activity-icon--${tool.id === "docs" ? "help" : tool.id}`}
                    >
                      {tool.id === "docs" ? "?" : null}
                    </span>
                    {tool.id === "debug" && lastBuildFailed ? <span className="activity-status-badge" aria-hidden="true" /> : null}
                    <span className="visually-hidden">{tool.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {showDesktopSidebar || isMobileWorkspace ? (
          <aside
            className={`pane pane--sidebar ${sidebarVisibilityClass}`}
            data-zoom-pane="sidebar"
            aria-label="Sidebar tools"
            onKeyDown={handleFilesPaneKeyDown}
            ref={sidebarPaneRef}
            style={sidebarPaneStyle}
            tabIndex={-1}
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
                        aria-label="Upload file"
                        title="Upload file"
                      >
                        <span aria-hidden="true" className="toolbar-icon toolbar-icon--upload" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {activeSidebarTool === "projects" ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable sidebar-section--projects"
                  onScroll={handleLeftPaneScroll}
                >
                  <div className="project-manager">
                    <div className="project-manager__actions project-manager__actions--primary">
                      <button
                        className="pane__button"
                        onClick={handleCreateLocalProject}
                        type="button"
                      >
                        New local project
                      </button>
                      <button
                        className="pane__button"
                        onClick={() => projectImportInputRef.current?.click()}
                        type="button"
                      >
                        Import project
                      </button>
                    </div>
                    <div className="project-manager__actions project-manager__actions--github">
                      <button
                        className={`pane__button project-github-action ${
                          gitHubClone.isOpen && gitHubClone.mode === "clone" ? "project-github-action--active" : ""
                        }`}
                        onClick={handleToggleGitHubCloneFlow}
                        type="button"
                      >
                        {gitHubClone.isOpen && gitHubClone.mode === "clone" ? "Hide clone" : "Clone GitHub repo"}
                      </button>
                      {gitHubClone.isOpen && gitHubClone.mode === "clone" ? projectGitHubPanel : null}
                      <button
                        className={`pane__button project-github-action ${
                          gitHubClone.isOpen && gitHubClone.mode === "create" ? "project-github-action--active" : ""
                        }`}
                        onClick={handleToggleGitHubCreateFlow}
                        type="button"
                      >
                        {gitHubClone.isOpen && gitHubClone.mode === "create" ? "Hide create" : "Create GitHub repo"}
                      </button>
                      {gitHubClone.isOpen && gitHubClone.mode === "create" ? projectGitHubPanel : null}
                    </div>
                    <div className="project-manager__list" role="list" aria-label="Projects">
                      {projectStorage.projects.map((project) => {
                        const isActiveProject = selectedProjectRepository?.id === project.id;
                        const projectFileCount = listProjectEntries(project).filter(
                          (entry) => entry.kind === "file"
                        ).length;

                        return (
                          <article
                            key={project.id}
                            className={`project-manager__row ${
                              isActiveProject ? "project-manager__row--active" : ""
                            } ${
                              draggedProjectId === project.id ? "project-manager__row--dragging" : ""
                            } ${
                              projectDragOverId === project.id && draggedProjectId !== project.id
                                ? "project-manager__row--drop-target"
                                : ""
                            }`}
                            draggable
                            onDragEnd={handleProjectDragEnd}
                            onDragOver={(event) => handleProjectDragOver(event, project.id)}
                            onDragStart={(event) => handleProjectDragStart(event, project.id)}
                            onDrop={(event) => handleProjectDrop(event, project.id)}
                            role="listitem"
                          >
                            <button
                              className="project-manager__select"
                              onClick={() => handleSelectLocalProject(project.id)}
                              type="button"
                            >
                              <strong>{project.displayName}</strong>
                              <span>{projectFileCount} {projectFileCount === 1 ? "file" : "files"}</span>
                            </button>
                            <div className="project-manager__row-actions">
                              <button
                                className="pane__button pane__button--compact"
                                onClick={() => handleRenameLocalProject(project.id)}
                                type="button"
                              >
                                Rename
                              </button>
                              <button
                                className="pane__button pane__button--compact pane__button--danger"
                                onClick={() => {
                                  void handleDeleteSelectedProject(project.id);
                                }}
                                type="button"
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : activeSidebarTool === "source-tools" ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable sidebar-section--source-tools"
                  onScroll={handleLeftPaneScroll}
                >
                  {sourceToolsPanel}
                </section>
              ) : activeSidebarTool === "files" ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable sidebar-section--files"
                  onScroll={handleLeftPaneScroll}
                >
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
                          } else if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
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
                    gitStatusByPath={workspaceGitBadgeByPath}
                    rootLabel={isTrashViewOpen ? "Trash" : "Files"}
                    rootIsRenameable={false}
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
                    onPinFile={handlePinWorkspaceFile}
                    onToggleFolder={handleToggleFolder}
                    onRenameDraftChange={setWorkspaceRenameDraft}
                    onRenameCancel={handleCancelWorkspaceRename}
                    onRenameCommit={handleCommitWorkspaceRename}
                    onRequestRootContextMenu={handleRequestWorkspaceRootContextMenu}
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
                        <>
                          <button
                            className="workspace-context-menu__item"
                            onClick={handleRequestWorkspaceRootRename}
                            type="button"
                          >
                            Rename
                          </button>
                          <button
                            className="workspace-context-menu__item"
                            onClick={handleDownloadWorkspaceProjectFiles}
                            type="button"
                          >
                            Download files
                          </button>
                        </>
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
                          className="workspace-context-menu__item"
                          onClick={() => handleDownloadWorkspaceNode(workspaceContextMenu.node)}
                          type="button"
                        >
                          Download
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

              {activeSidebarTool === "docs" ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable sidebar-section--embedded-docs"
                  onScroll={handleLeftPaneScroll}
                >
                  <DocsPanel embedded />
                </section>
              ) : null}

              {activeSidebarTool === "settings" && isSettingsOpen ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable sidebar-section--embedded-settings"
                  onScroll={handleLeftPaneScroll}
                >
                  {renderSettingsSheet(true)}
                </section>
              ) : null}

              {activeSidebarTool === "search" ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable"
                  onScroll={handleLeftPaneScroll}
                >
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
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable"
                  onScroll={handleLeftPaneScroll}
                >
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
                      Add headings like <code>= Section</code>, <code># Section</code>, or <code>{"\\section{Title}"}</code> to build an outline.
                    </div>
                  )}
                </section>
              ) : null}

              {activeSidebarTool === "mitex" ? (
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable sidebar-section--mitex"
                  onScroll={handleLeftPaneScroll}
                >
                  <MitexPanel
                    canInsert={isSourceFileEditable}
                    compiler={compiler}
                    compilerStatus={compilerStatus}
                    onInsert={handleInsertEditorText}
                    paperView={isPaperView}
                  />
                </section>
              ) : null}

              {activeSidebarTool === "diagram" ? (
                <section
                  ref={filesSectionRef}
                  className={`sidebar-section sidebar-section--scrollable sidebar-section--pane-editor ${
                    isDiagramInlineExpanded ? "sidebar-section--pane-expanded" : ""
                  }`}
                  onScroll={handleLeftPaneScroll}
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
                  ref={filesSectionRef}
                  className={`sidebar-section sidebar-section--scrollable sidebar-section--pane-editor ${
                    isGraphInlineExpanded ? "sidebar-section--pane-expanded" : ""
                  }`}
                  onScroll={handleLeftPaneScroll}
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
                  ref={filesSectionRef}
                  className={`sidebar-section sidebar-section--scrollable sidebar-section--sync ${
                    activeMergeState ? "sidebar-section--git-merge" : ""
                  } ${
                    isGitMergeInlineExpanded ? "sidebar-section--pane-expanded" : ""
                  }`}
                  onScroll={handleLeftPaneScroll}
                >
                  <div className="sync-stack">
                    <div className="sidebar-card">
                      <div className="sidebar-card__row">
                        <span>{selectedGitProject?.name || "Git repo"}</span>
                        <span className="pane__meta">
                          {selectedGitProjectIsGitHubConnected && selectedGitProject
                            ? selectedGitProject.backendId
                            : selectedProjectGitConnectionLabel}
                        </span>
                      </div>
                      <div className="sidebar-card__actions">
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
                          onClick={() => handleOpenSettingsTab("git")}
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
                <section
                  ref={filesSectionRef}
                  className="sidebar-section sidebar-section--scrollable"
                  onScroll={handleLeftPaneScroll}
                >
                  <div className="sync-stack debug-stack">
                    <details className="sidebar-card debug-section" open>
                      <summary className="debug-section__summary">
                        <span>Current file</span>
                        <span className="pane__meta">{debugSourceLanguageLabel}</span>
                      </summary>
                      <ul className="sidebar-card__list">
                        <li>
                          <span>Path</span>
                          <span>{activeSourcePath}</span>
                        </li>
                        <li>
                          <span>Type</span>
                          <span>{debugSourceLanguageLabel}</span>
                        </li>
                        <li>
                          <span>Compiler</span>
                          <span>{isActiveSourceCompilable ? compilerStatus.label : "No compiler"}</span>
                        </li>
                        <li>
                          <span>Output</span>
                          <span>{debugOutputKind}</span>
                        </li>
                      </ul>
                    </details>

                    <details className="sidebar-card debug-section" open>
                      <summary className="debug-section__summary">
                        <span>Output excerpt</span>
                        <span className="pane__meta">{debugOutputKind}</span>
                      </summary>
                      <pre className="debug-output-excerpt">{debugOutputExcerpt}</pre>
                    </details>

                    {activeSourceLanguage === "typst" || activeSourceLanguage === "latex" ? (
                      <details className="sidebar-card debug-section" open>
                        <summary className="debug-section__summary">
                          <span>Build log</span>
                          <span className="pane__meta">{filteredBuildLogEntries.length}/{buildLogEntries.length}</span>
                        </summary>
                        <div className="debug-control-grid">
                          <label>
                            <span>Filter</span>
                            <select value={buildLogFilter} onChange={(event) => setBuildLogFilter(event.target.value as BuildLogFilter)}>
                              <option value="all">All builds</option>
                              <option value="errors">Errors only</option>
                              <option value="warnings">Warnings only</option>
                              <option value="current-file">Current file</option>
                              <option value="latex">LaTeX only</option>
                            </select>
                          </label>
                          <label>
                            <span>Search</span>
                            <input
                              onChange={(event) => setBuildLogSearchQuery(event.target.value)}
                              placeholder="log, file, package"
                              type="search"
                              value={buildLogSearchQuery}
                            />
                          </label>
                          <label className="debug-toggle">
                            <input
                              checked={hideRepeatedBuildWarnings}
                              onChange={(event) => setHideRepeatedBuildWarnings(event.target.checked)}
                              type="checkbox"
                            />
                            <span className="debug-toggle__track" aria-hidden="true" />
                            <span>Hide repeated warnings</span>
                          </label>
                        </div>
                        <div className="sidebar-card__actions debug-action-row">
                          <button className="pane__button pane__button--compact" onClick={handleCopyBuildLog} type="button">
                            Copy filtered build log
                          </button>
                          <button className="pane__button pane__button--compact" onClick={handleCopyDiagnostics} type="button">
                            Copy filtered diagnostics
                          </button>
                          <button className="pane__button pane__button--compact" onClick={handleExportBuildLogText} type="button">
                            Export filtered build log text
                          </button>
                          <button className="pane__button pane__button--compact" onClick={handleExportBuildLogJson} type="button">
                            Export filtered build log JSON
                          </button>
                          <button
                            className="pane__button pane__button--compact"
                            onClick={() => setBuildLogEntries([])}
                            type="button"
                          >
                            Clear
                          </button>
                        </div>
                        {buildLogFeedback ? <p className="sidebar-card__copy">{buildLogFeedback}</p> : null}
                        {filteredBuildLogEntries.length > 0 ? (
                          <>
                            <div className="build-log-timeline-header">
                              <span>Recent build durations</span>
                            </div>
                            <div className="build-log-timeline" aria-label="Recent build duration timeline">
                              {filteredBuildLogEntries.slice(0, 12).map((entry) => (
                                <span
                                  className={`build-log-timeline__bar build-log-timeline__bar--${entry.ok ? "success" : "error"}`}
                                  key={`timeline:${entry.id}`}
                                  style={{ height: `${Math.max(12, Math.round((entry.durationMs / buildLogTimelineMaxMs) * 42))}px` }}
                                  title={`${entry.sourcePath}: ${formatDurationMs(entry.durationMs)}`}
                                />
                              ))}
                            </div>
                            <div className="build-log-list">
                              {filteredBuildLogEntries.map((entry, index) => {
                                const previousEntry = getPreviousBuildLogEntry(filteredBuildLogEntries, index);
                                const visibleDiagnostics = hideRepeatedBuildWarnings
                                  ? dedupeRepeatedWarnings(entry.diagnostics)
                                  : entry.diagnostics;

                                return (
                                  <details className="build-log-entry" key={entry.id}>
                                    <summary>
                                      <span className={`build-log-status build-log-status--${entry.ok ? "success" : "error"}`}>
                                        {entry.ok ? "ok" : "error"}
                                      </span>
                                      <span className="build-log-entry__main">
                                        <strong>{entry.sourcePath}</strong>
                                        <span>
                                          {formatSourceLanguageLabel(entry.language)} · {entry.engine} · {entry.trigger} · {formatDurationMs(entry.durationMs)}
                                        </span>
                                      </span>
                                      <time>{new Date(entry.startedAt).toLocaleTimeString()}</time>
                                    </summary>
                                    <div className="sidebar-card__actions build-log-entry__actions">
                                      <button className="pane__button pane__button--compact" onClick={() => rerunBuildLogEntry(entry)} type="button">
                                        Rerun
                                      </button>
                                      <button className="pane__button pane__button--compact" onClick={() => void handleCopyText(formatBuildLogEntryText(entry), "Build entry copied.")} type="button">
                                        Copy
                                      </button>
                                    </div>
                                    <ul className="sidebar-card__list build-log-entry__details">
                                      <li>
                                        <span>Started</span>
                                        <span>{new Date(entry.startedAt).toLocaleString()}</span>
                                      </li>
                                      <li>
                                        <span>Trigger</span>
                                        <span>{entry.trigger}</span>
                                      </li>
                                      <li>
                                        <span>Mode</span>
                                        <span>{entry.compileMode}{entry.cached ? " · cached" : ""}</span>
                                      </li>
                                      <li>
                                        <span>Output</span>
                                        <span>{entry.outputChanged ? "changed" : "unchanged"}</span>
                                      </li>
                                      {previousEntry ? (
                                        <li>
                                          <span>Previous</span>
                                          <span>
                                            {formatDurationMs(entry.durationMs - previousEntry.durationMs)} duration · {entry.diagnostics.length - previousEntry.diagnostics.length} diagnostics
                                          </span>
                                        </li>
                                      ) : null}
                                      {entry.shellEscapeUnavailable ? (
                                        <li>
                                          <span>Shell escape</span>
                                          <span>Unavailable in browser BusyTeX</span>
                                        </li>
                                      ) : null}
                                      {entry.metadata?.strategy ? (
                                        <li>
                                          <span>Strategy</span>
                                          <span>{formatCompileStrategySummary(entry.metadata)}</span>
                                        </li>
                                      ) : null}
                                      {entry.metadata?.timings?.map((timing) => (
                                        <li key={`${entry.id}:${timing.label}:${timing.durationMs}`}>
                                          <span>{timing.label}</span>
                                          <span>{formatDurationMs(timing.durationMs)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                    {entry.packageDetails.length > 0 ? (
                                      <details className="build-log-nested-details">
                                        <summary>Package resolution</summary>
                                        <pre>{entry.packageDetails.join("\n")}</pre>
                                      </details>
                                    ) : null}
                                    {entry.rawLog ? (
                                      <details className="build-log-nested-details">
                                        <summary>Raw LaTeX log</summary>
                                        <pre>{formatDebugOutputExcerpt(entry.rawLog)}</pre>
                                      </details>
                                    ) : null}
                                    {visibleDiagnostics.length > 0 ? (
                                      <div className="sidebar-diagnostics build-log-entry__diagnostics" role="list">
                                        {groupDiagnosticsByFile(visibleDiagnostics).map((group) => (
                                          <div className="build-log-diagnostic-group" key={`${entry.id}:${group.file}`}>
                                            <strong>{group.file}</strong>
                                            {group.diagnostics.map((diagnostic, diagnosticIndex) => (
                                              <div className="sidebar-diagnostic" key={`${entry.id}:${group.file}:${diagnostic.message}:${diagnosticIndex}`}>
                                                <strong>
                                                  {diagnostic.severity}
                                                  {formatDiagnosticRange(diagnostic) ? ` · ${formatDiagnosticRange(diagnostic)}` : ""}
                                                </strong>
                                                <span>{diagnostic.message}</span>
                                                {diagnostic.line ? (
                                                  <button className="pane__button pane__button--compact" onClick={() => jumpToDiagnostic(diagnostic, entry.sourcePath)} type="button">
                                                    Jump
                                                  </button>
                                                ) : null}
                                              </div>
                                            ))}
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </details>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <p className="sidebar-card__copy">No builds match the current filters.</p>
                        )}
                      </details>
                    ) : null}

                    {activeSourceLanguage === "typst" || activeSourceLanguage === "latex" ? (
                      <details className="sidebar-card debug-section">
                        <summary className="debug-section__summary">
                          <span>Compiler and performance</span>
                          <span className="pane__meta">{compilerStatus.label}</span>
                        </summary>
                        <p className="sidebar-card__copy">
                          {compilerStatus.detail ?? `${debugSourceLanguageLabel} preview pipeline is active.`}
                        </p>
                        {compileResult?.metadata ? (
                          <>
                            <p className="sidebar-card__copy">
                              {formatCompileTimingTotal(compileResult.metadata)} · {compileResult.metadata.strategy ? formatCompileStrategySummary(compileResult.metadata) : "No strategy metadata"}
                            </p>
                            <ul className="sidebar-card__list">
                              {compileResult.metadata.timings?.map((timing) => (
                                <li key={`${timing.label}-${timing.durationMs}`}>
                                  <span>{timing.label}</span>
                                  <span>{formatDurationMs(timing.durationMs)}</span>
                                </li>
                              ))}
                              {compileResult.metadata.synctexFiles ? (
                                <li>
                                  <span>Generated SyncTeX files</span>
                                  <span>
                                    {compileResult.metadata.synctexFiles.length > 0
                                      ? compileResult.metadata.synctexFiles
                                          .map((file) => file.path + " (" + formatByteSize(file.size) + ")")
                                          .join(", ")
                                      : "none"}
                                  </span>
                                </li>
                              ) : null}
                              {compileResult?.ok && compileResult.output.kind === "pdf" ? (
                                <li>
                                  <span>SyncTeX artifact</span>
                                  <span>
                                    {compileResult.output.sourceMapData?.length
                                      ? formatByteSize(compileResult.output.sourceMapData.length)
                                      : "missing"}
                                  </span>
                                </li>
                              ) : null}
                              {compileResult.metadata.fileSync ? (
                                <li>
                                  <span>Worker file cache</span>
                                  <span>
                                    {compileResult.metadata.fileSync.changedFiles} changed ·{" "}
                                    {compileResult.metadata.fileSync.deletedFiles} deleted ·{" "}
                                    {compileResult.metadata.fileSync.cachedFiles} cached ·{" "}
                                    {compileResult.metadata.fileSync.compileFiles} compiled
                                  </span>
                                </li>
                              ) : null}
                              {compileResult.metadata.dirty ? (
                                <>
                                  <li>
                                    <span>Dirty state</span>
                                    <span>
                                      {compileResult.metadata.dirty.status}
                                      {compileResult.metadata.dirty.requiresFullCompile ? " · full required" : ""}
                                    </span>
                                  </li>
                                  {compileResult.metadata.dirty.categories.length > 0 ? (
                                    <li>
                                      <span>Changed categories</span>
                                      <span>
                                        {compileResult.metadata.dirty.categories
                                          .map((entry) => `${entry.category} ${entry.count}`)
                                          .join(" · ")}
                                      </span>
                                    </li>
                                  ) : null}
                                  {compileResult.metadata.dirty.samplePaths.length > 0 ? (
                                    <li>
                                      <span>Changed paths</span>
                                      <span>{compileResult.metadata.dirty.samplePaths.join(", ")}</span>
                                    </li>
                                  ) : null}
                                </>
                              ) : null}
                            </ul>
                          </>
                        ) : null}
                      </details>
                    ) : null}

                    <details className="sidebar-card debug-section">
                      <summary className="debug-section__summary">
                        <span>Diagnostics</span>
                        <span className="pane__meta">{editorDiagnostics.length}</span>
                      </summary>
                      {editorDiagnostics.length > 0 ? (
                        <div className="sidebar-diagnostics" role="list">
                          {groupDiagnosticsByFile(editorDiagnostics).map((group) => (
                            <div className="build-log-diagnostic-group" key={`current:${group.file}`}>
                              <strong>{group.file}</strong>
                              {group.diagnostics.map((diagnostic, index) => (
                                <div className="sidebar-diagnostic" key={`${group.file}:${diagnostic.message}:${index}`}>
                                  <strong>
                                    {diagnostic.severity}
                                    {formatDiagnosticRange(diagnostic) ? ` · ${formatDiagnosticRange(diagnostic)}` : ""}
                                  </strong>
                                  <span>{diagnostic.message}</span>
                                  {diagnostic.line ? (
                                    <button className="pane__button pane__button--compact" onClick={() => jumpToDiagnostic(diagnostic, activeSourcePath)} type="button">
                                      Jump
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="sidebar-card__copy">No diagnostics right now.</p>
                      )}
                    </details>

                    {shouldShowPreviewInternals ? (
                      <details className="sidebar-card debug-section">
                        <summary className="debug-section__summary">
                          <span>Preview internals</span>
                          <span className="pane__meta">{isPreviewDebugVisible ? "Visible" : "Hidden"}</span>
                        </summary>
                        <div className="sidebar-card__actions">
                          <button
                            className="pane__button pane__button--compact"
                            onClick={togglePreviewDebug}
                            type="button"
                          >
                            {isPreviewDebugVisible ? "Hide preview panel" : "Show preview panel"}
                          </button>
                        </div>
                        {isPreviewDebugVisible ? (
                          <div className="sidebar-preview-debug">
                            <PreviewDebugPanel markup={debugOutputContent} />
                          </div>
                        ) : (
                          <p className="sidebar-card__copy">SVG structure and rendering checks for the current Typst output.</p>
                        )}
                      </details>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </>
          </aside>
        ) : null}

        {showDesktopSidebar && (showSourcePane || showPreviewPane) ? (
          <button
            aria-label="Resize sidebar"
            className="workspace-handle workspace-handle--left"
            onPointerDown={beginPanelResize("sidebar")}
            type="button"
          />
        ) : null}

        {isZenMode ? (
          <button
            aria-label="Resize zen editor height"
            className="workspace-handle workspace-handle--zen workspace-handle--zen-horizontal workspace-handle--zen-top"
            onPointerDown={beginZenResize("zen-top")}
            type="button"
          />
        ) : null}

        {isZenMode ? (
          <button
            aria-label="Resize zen editor width"
            className="workspace-handle workspace-handle--zen workspace-handle--zen-vertical workspace-handle--zen-left"
            onPointerDown={beginZenResize("zen-left")}
            type="button"
          />
        ) : null}

        {showSourcePane ? (
        <section
          className={`pane pane--editor ${editorVisibilityClass}`}
          data-zoom-pane="source"
          aria-label="Source editor"
        >
          {isMobileEditorFullscreen ? (
            <button
              aria-label="Close full screen"
              className="editor-fullscreen-exit pane__button pane__button--compact pane__icon-button"
              onClick={() => setIsEditorFullscreen(false)}
              title="Close full screen"
              type="button"
            >
              <span aria-hidden="true" className="toolbar-icon toolbar-icon--minimize" />
              <span className="visually-hidden">Close full screen</span>
            </button>
          ) : null}
          {isZenMode ? null : (
            <>
              <div className="pane__header">
                <div className="pane__header-group">
                  <h2>Source</h2>
                </div>
                <div className="pane__header-actions">
                  {isMobileWorkspace ? (
                    <button
                      aria-label="Full screen"
                      className="pane__button pane__button--compact pane__icon-button"
                      onClick={() => setIsEditorFullscreen(true)}
                      title="Full screen"
                      type="button"
                    >
                      <span aria-hidden="true" className="toolbar-icon toolbar-icon--maximize" />
                      <span className="visually-hidden">Full screen</span>
                    </button>
                  ) : null}
                  {showSourceCompileButton && visibleSourceTabPaths.includes(normalizedActiveSourcePath) ? (
                    <button
                      className="pane__button pane__button--compact"
                      onClick={handleCompile}
                      title={`Compile (${compileShortcutLabel})`}
                      type="button"
                    >
                      Compile
                    </button>
                  ) : null}
                </div>
              </div>
              {renderWorkspaceTabStrip({
                activePath: visibleSourceTabPaths.includes(normalizedActiveSourcePath) ? normalizedActiveSourcePath : null,
                ariaLabel: "Open source files",
                kind: "source",
                onActivate: handleActivateSourceTab,
                onClose: handleCloseSourceTab,
                paths: visibleSourceTabPaths
              })}
            </>
          )}
          {isSourceFileEditable && visibleSourceTabPaths.includes(normalizedActiveSourcePath) ? (
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
                language={activeSourceLanguage}
                snippets={
                  activeEditorSnippetLanguage
                    ? allSnippetsByLanguage[activeEditorSnippetLanguage]
                    : []
                }
                onCompileRequested={handleCompile}
                onFormatRequested={handleFormatDocument}
                onCloseRequested={handleCloseActiveSourceTab}
                onSearchRequested={openSearchPane}
                onSelectionChange={setCurrentEditorLineNumber}
                onSourceDoubleClick={handleEditorSourceDoubleClick}
                onFocusChange={setIsEditorFocused}
                value={sourceEditorValue}
                vimMode={snapshot.preferences.vimMode}
                editorFontSize={snapshot.preferences.editorFontSize}
                keybindings={keybindings}
                relativeLineNumbers={snapshot.preferences.relativeLineNumbers}
                cursorSmooth={!isMobileWorkspace && snapshot.preferences.cursorSmooth}
                cursorSmear={isMobileWorkspace ? 0 : snapshot.preferences.cursorSmear}
                latexMathPreview={snapshot.preferences.latexMathPreview}
                constrainMobileScroll={isMobileWorkspace}
                theme={theme}
                onChange={handleDocumentChange}
              />
              {snapshot.preferences.mobileKeyboard.enabled && isMobileWorkspace && isEditorFocused && mobileWorkspaceTab === "editor" && mobileKeyboardKeys.length > 0 ? (
                <div className="mobile-keyboard-extension" aria-label={`${formatSourceLanguageLabel(activeSourceLanguage)} quick keys`}>
                  <div className="mobile-keyboard-extension__label">
                    {formatSourceLanguageLabel(activeSourceLanguage)}
                  </div>
                  <div className="mobile-keyboard-extension__keys" role="toolbar" aria-label="Mobile editor quick keys">
                    {mobileKeyboardKeys.map((key) => (
                      <button
                        className="mobile-keyboard-extension__key"
                        key={`${key.label}-${key.title}`}
                        onClick={() => handleMobileKeyboardKey(key)}
                        onPointerDown={(event) => event.preventDefault()}
                        title={key.title}
                        type="button"
                      >
                        {key.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <TerminalDrawer
                isOpen={isTerminalOpen}
                onClose={() => setIsTerminalOpen(false)}
                runtime={terminalRuntime}
              />
            </>
          ) : visibleSourceTabPaths.length === 0 ? (
            <div className="source-empty-state" />
          ) : (
            <div className="source-empty-state">
              <div className="source-empty-state__title">cannot open this filetype</div>
              {normalizedSelectedWorkspacePath ? (
                <div className="source-empty-state__path">{normalizedSelectedWorkspacePath}</div>
              ) : null}
            </div>
          )}
          {isSourceFileEditable && visibleSourceTabPaths.includes(normalizedActiveSourcePath) && compileResult && !compileResult.ok ? (
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

        {isZenMode ? (
          <button
            aria-label="Resize zen editor width"
            className="workspace-handle workspace-handle--zen workspace-handle--zen-vertical workspace-handle--zen-right"
            onPointerDown={beginZenResize("zen-right")}
            type="button"
          />
        ) : null}

        {isZenMode ? (
          <button
            aria-label="Resize zen editor height"
            className="workspace-handle workspace-handle--zen workspace-handle--zen-horizontal workspace-handle--zen-bottom"
            onPointerDown={beginZenResize("zen-bottom")}
            type="button"
          />
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
          className={`pane pane--preview ${previewVisibilityClass}`}
          data-zoom-pane="preview"
          aria-label="Document preview"
          onKeyDown={handlePreviewPaneKeyDown}
          ref={previewPaneRef}
          tabIndex={-1}
        >
          <div className="pane__header pane__header--preview">
            <div className="pane__header-group">
              <h2>Preview</h2>
            </div>
            <div className="pane__header-center pane__header-center--preview-zoom">
              <PreviewZoomControls
                onZoomChange={setPreviewZoom}
                zoom={previewZoom}
              />
            </div>
            <div className="pane__header-actions">
              <div className="pane__header-mobile-zoom">
                <PreviewZoomControls
                  onZoomChange={setPreviewZoom}
                  zoom={previewZoom}
                />
              </div>
              {visiblePreviewIsCompiling ? (
                <span className="pane__meta pane__meta--status">
                  <PreviewStatusIcon kind="compiling" label={visiblePreviewCompilerStatus.label} />
                </span>
              ) : null}
              <button
                aria-pressed={isPaperView}
                className="pane__button pane__button--quiet"
                onClick={togglePaperView}
                type="button"
              >
                Paper
              </button>
              <div
                className={`preview-download-menu ${
                  isPreviewDownloadMenuOpen ? "preview-download-menu--open" : ""
                }`}
                ref={previewDownloadMenuRef}
              >
                <button
                  aria-expanded={isPreviewDownloadMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Download preview"
                  className="pane__button pane__button--quiet pane__icon-button preview-download-button"
                  onClick={() => setIsPreviewDownloadMenuOpen((current) => !current)}
                  title="Download preview"
                  type="button"
                >
                  <span aria-hidden="true" className="toolbar-icon toolbar-icon--download" />
                </button>
                {isPreviewDownloadMenuOpen ? (
                  <div className="preview-download-menu__panel" role="menu" aria-label="Download preview">
                    {(["output", "source"] as PreviewDownloadMode[]).map((mode) => (
                      <button
                        aria-checked={previewDownloadMode === mode}
                        className="preview-download-menu__item"
                        key={mode}
                        onClick={() => {
                          setPreviewDownloadMode(mode);
                          setIsPreviewDownloadMenuOpen(false);
                          handleDownloadActivePreview(mode);
                        }}
                        role="menuitemradio"
                        type="button"
                      >
                        <span>{mode === "output" ? "Output" : "Source"}</span>
                        {previewDownloadMode === mode ? (
                          <span aria-hidden="true" className="preview-download-menu__check" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {renderWorkspaceTabStrip({
            activePath: activePreviewPath,
            ariaLabel: "Open previews",
            kind: "preview",
            onActivate: handleActivatePreviewTab,
            onClose: handleClosePreviewTab,
            paths: visiblePreviewTabPaths
          })}
          <PreviewPane
            activeSource={activePreviewSourcePosition}
            compilerStatus={visiblePreviewCompilerStatus}
            forwardSearchSource={previewForwardSearchSource}
            isErrorSettled={isErrorSettled}
            isCompiling={visiblePreviewIsCompiling}
            lastSuccessfulResult={visibleLastSuccessfulResult}
            onDebugRequested={openDebugSidebar}
            onSourceJump={handlePreviewSourceJump}
            paperView={isPaperView}
            showToolbar={false}
            onZoomChange={setPreviewZoom}
            result={visiblePreviewResult}
            sourceLineCount={activePreviewSourceLineCount}
            sourcePath={activePreviewCompileSourcePath ?? activePreviewPath ?? undefined}
            workspacePreview={visibleWorkspacePreview}
            zoom={previewZoom}
          />
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
            data-zoom-pane="preview"
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
              activeSource={activePreviewSourcePosition}
              compilerStatus={visiblePreviewCompilerStatus}
              forwardSearchSource={previewForwardSearchSource}
              isErrorSettled={isErrorSettled}
              isCompiling={visiblePreviewIsCompiling}
              lastSuccessfulResult={visibleLastSuccessfulResult}
              onDebugRequested={openDebugSidebar}
              onSourceJump={handlePreviewSourceJump}
              paperView={isPaperView}
              showToolbar={true}
              onZoomChange={setPreviewZoom}
              result={visiblePreviewResult}
              sourceLineCount={activePreviewSourceLineCount}
              sourcePath={activePreviewCompileSourcePath ?? activePreviewPath ?? undefined}
              workspacePreview={visibleWorkspacePreview}
              zoom={previewZoom}
            />
          </section>
        </div>
      ) : null}

      {isDocsOpen ? <DocsModal onClose={() => setIsDocsOpen(false)} /> : null}

      {isSettingsOpen && !(isMobileWorkspace && activeSidebarTool === "settings") ? (
        <div
          className="sheet-backdrop"
          onClick={() => {
            saveCurrentSettingsScrollPosition();
            setIsSettingsOpen(false);
          }}
          role="presentation"
        >
          {renderSettingsSheet(false)}
        </div>
      ) : null}

      <input
        ref={documentUploadInputRef}
        accept={WORKSPACE_UPLOAD_ACCEPT}
        className="visually-hidden"
        onChange={handleUploadDocument}
        tabIndex={-1}
        type="file"
      />
      <input
        ref={projectImportInputRef}
        accept={PROJECT_EXPORT_INPUT_ACCEPT}
        className="visually-hidden"
        onChange={handleImportProjectFile}
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
  const hasMessage = text.trim().length > 0;

  if (!active && !hasMessage) {
    return null;
  }

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

interface SavedLatexPdfOptions {
  allowStale: boolean;
  project: TyprProjectRepository;
  sourcePath: string;
  source: string;
}

function loadSavedLatexPdfCompileResult(
  options: SavedLatexPdfOptions
): CompileResult | null {
  const pdfPath = getExistingLatexPdfPath(options.project, options.sourcePath);

  if (!pdfPath) {
    return null;
  }

  const pdfEntry = options.project.filesystem.entries[pdfPath];

  if (!pdfEntry || pdfEntry.kind !== "file") {
    return null;
  }

  const sourceEntry = options.project.filesystem.entries[
    normalizeCompilerPath(options.sourcePath) || options.sourcePath
  ];

  if (
    sourceEntry?.kind === "file" &&
    typeof sourceEntry.content === "string" &&
    sourceEntry.content !== options.source
  ) {
    return null;
  }

  if (
    !options.allowStale &&
    !isSavedLatexPdfFreshForSource({
      pdfUpdatedAt: pdfEntry.updatedAt,
      project: options.project,
      source: options.source,
      sourcePath: options.sourcePath
    })
  ) {
    return null;
  }

  return {
    ok: true,
    engine: "busytex",
    diagnostics: [],
    output: {
      kind: "pdf",
      content: "",
      artifactData:
        typeof pdfEntry.content === "string"
          ? new TextEncoder().encode(pdfEntry.content)
          : new Uint8Array(pdfEntry.content),
      sourceMapData: readSavedLatexSynctexBytes(options.project, options.sourcePath)
    },
    metadata: {
      timings: [{ label: "Load saved PDF", durationMs: 0 }]
    }
  } satisfies CompileResult;
}

function readSavedLatexSynctexBytes(
  project: TyprProjectRepository,
  sourcePath: string
): Uint8Array | undefined {
  return readProjectFileBytes(project, getLatexSynctexOutputPath(sourcePath)) ?? undefined;
}

function writeGeneratedLatexPdfFile(
  project: TyprProjectRepository,
  sourcePath: string,
  result: Extract<CompileResult, { ok: true }>
): TyprProjectRepository {
  if (result.output.kind !== "pdf" || !result.output.artifactData) {
    return project;
  }

  const pdfPath = getLatexPdfOutputPath(
    getLatexPdfSourcePathForResult(sourcePath, result)
  );
  const existingBytes = readProjectFileBytes(project, pdfPath);
  const nextBytes = new Uint8Array(result.output.artifactData);
  const pdfBytes =
    existingBytes && areBytesEqual(existingBytes, nextBytes) ? existingBytes : nextBytes;

  const projectWithPdf = writeProjectFile(
    project,
    pdfPath,
    pdfBytes,
    { kind: "virtual", id: GENERATED_LATEX_PDF_SOURCE_ID }
  );

  if (!result.output.sourceMapData || result.output.sourceMapData.length === 0) {
    return projectWithPdf;
  }

  const synctexPath = getLatexSynctexOutputPath(
    getLatexPdfSourcePathForResult(sourcePath, result)
  );
  const existingSynctexBytes = readProjectFileBytes(projectWithPdf, synctexPath);
  const nextSynctexBytes = new Uint8Array(result.output.sourceMapData);
  const synctexBytes =
    existingSynctexBytes && areBytesEqual(existingSynctexBytes, nextSynctexBytes)
      ? existingSynctexBytes
      : nextSynctexBytes;

  return writeProjectFile(
    projectWithPdf,
    synctexPath,
    synctexBytes,
    { kind: "virtual", id: GENERATED_LATEX_SYNCTEX_SOURCE_ID }
  );
}

function isSavedLatexPdfFreshForSource({
  pdfUpdatedAt,
  project,
  source,
  sourcePath
}: {
  pdfUpdatedAt: string;
  project: TyprProjectRepository;
  source: string;
  sourcePath: string;
}): boolean {
  const pdfUpdatedAtMs = Date.parse(pdfUpdatedAt);

  if (!Number.isFinite(pdfUpdatedAtMs)) {
    return false;
  }

  const sourceEntry = project.filesystem.entries[
    normalizeCompilerPath(sourcePath) || sourcePath
  ];

  if (
    !sourceEntry ||
    sourceEntry.kind !== "file" ||
    typeof sourceEntry.content !== "string" ||
    sourceEntry.content !== source
  ) {
    return false;
  }

  const sourceUpdatedAtMs = Date.parse(sourceEntry.updatedAt);

  if (!Number.isFinite(sourceUpdatedAtMs)) {
    return false;
  }

  return sourceUpdatedAtMs <= pdfUpdatedAtMs;
}

function getLatexPdfSourcePathForResult(
  sourcePath: string,
  result: Extract<CompileResult, { ok: true }>
): string {
  const strategy = result.metadata?.strategy;

  if (!strategy) {
    return sourcePath;
  }

  return strategy.previewKind === "subfile-wrapper"
    ? strategy.activeFilePath
    : strategy.mainFilePath;
}

function getLatexPdfOutputPath(sourcePath: string): string {
  const normalizedSourcePath = normalizeCompilerPath(sourcePath) || sourcePath;

  if (/\.(tex|ltx|latex)$/i.test(normalizedSourcePath)) {
    return normalizedSourcePath.replace(/\.(tex|ltx|latex)$/i, ".pdf");
  }

  return `${normalizedSourcePath}.pdf`;
}

function getLatexSynctexOutputPath(sourcePath: string): string {
  const normalizedSourcePath = normalizeCompilerPath(sourcePath) || sourcePath;

  if (/\.(tex|ltx|latex)$/i.test(normalizedSourcePath)) {
    return normalizedSourcePath.replace(/\.(tex|ltx|latex)$/i, ".synctex.gz");
  }

  return normalizedSourcePath + ".synctex.gz";
}

function getExistingLatexPdfPath(
  project: TyprProjectRepository,
  sourcePath: string
): string | null {
  const pdfPath = getLatexPdfOutputPath(sourcePath);
  const pdfEntry = project.filesystem.entries[pdfPath];

  return pdfEntry?.kind === "file" ? pdfPath : null;
}

function resolveLatexSourcePathForPdfPreview(
  previewPath: string,
  project: TyprProjectRepository | null,
  activeSourcePath: string
): string | null {
  const normalizedPreviewPath = normalizeCompilerPath(previewPath) || previewPath;
  const normalizedActiveSourcePath = normalizeCompilerPath(activeSourcePath) || activeSourcePath;

  if (
    getSourceLanguage(normalizedActiveSourcePath) === "latex" &&
    getLatexPdfOutputPath(normalizedActiveSourcePath) === normalizedPreviewPath
  ) {
    return normalizedActiveSourcePath;
  }

  if (!project || !/.pdf$/i.test(normalizedPreviewPath)) {
    return null;
  }

  const matchingSourceEntry = Object.entries(project.filesystem.entries).find(([path, entry]) => {
    const normalizedPath = normalizeCompilerPath(path) || path;
    return (
      entry.kind === "file" &&
      typeof entry.content === "string" &&
      getSourceLanguage(normalizedPath) === "latex" &&
      getLatexPdfOutputPath(normalizedPath) === normalizedPreviewPath
    );
  });

  return matchingSourceEntry?.[0] ?? null;
}

function getWorkspaceTabDisplayPath(_kind: WorkspaceTabKind, path: string): string {
  return path;
}

function areBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
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
      areDiagnosticsEqual(current.diagnostics, next.diagnostics) &&
      areCompileMetadataEqual(current.metadata, next.metadata)
    );
  }

  if (!current.ok && !next.ok) {
    return (
      areDiagnosticsEqual(current.errors, next.errors) &&
      areCompileMetadataEqual(current.metadata, next.metadata)
    );
  }

  return false;
}

function reuseCompileOutputIfUnchanged(
  current: CompileResult | null,
  next: CompileResult
): CompileResult {
  if (!current?.ok || !next.ok || current.engine !== next.engine) {
    return next;
  }

  if (!areCompileOutputsEqual(current, next)) {
    return next;
  }

  return {
    ...next,
    output:
      next.output.kind === "pdf"
        ? {
            ...next.output,
            artifactData: current.output.artifactData
          }
        : current.output
  };
}

function didCompileOutputChange(
  current: CompileResult | null,
  next: CompileResult
): boolean {
  if (!current?.ok || !next.ok || current.engine !== next.engine) {
    return true;
  }

  return !areCompileOutputsEqual(current, next);
}

function areCompileOutputsEqual(
  current: Extract<CompileResult, { ok: true }>,
  next: Extract<CompileResult, { ok: true }>
): boolean {
  if (current.output.kind !== next.output.kind) {
    return false;
  }

  if (current.output.kind !== "pdf" && current.output.content !== next.output.content) {
    return false;
  }

  return getCompileArtifactSignature(current) === getCompileArtifactSignature(next);
}

function getCompileArtifactSignature(result: Extract<CompileResult, { ok: true }>): string {
  const artifactData = result.output.artifactData;

  if (!artifactData) {
    return "none";
  }

  let hash = 0x811c9dc5;

  for (let index = 0; index < artifactData.byteLength; index += 1) {
    hash ^= artifactData[index];
    hash = Math.imul(hash, 0x01000193);
  }

  return `${artifactData.byteLength}:${(hash >>> 0).toString(16)}`;
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

function areCompileMetadataEqual(
  current: CompileMetadata | undefined,
  next: CompileMetadata | undefined
): boolean {
  if (!current && !next) {
    return true;
  }

  if (!current || !next) {
    return false;
  }

  const currentTimings = current.timings ?? [];
  const nextTimings = next.timings ?? [];

  if (currentTimings.length !== nextTimings.length) {
    return false;
  }

  for (let index = 0; index < currentTimings.length; index += 1) {
    if (
      currentTimings[index].label !== nextTimings[index].label ||
      Math.round(currentTimings[index].durationMs) !== Math.round(nextTimings[index].durationMs)
    ) {
      return false;
    }
  }

  const currentFileSync = current.fileSync;
  const nextFileSync = next.fileSync;

  return (
    currentFileSync?.changedFiles === nextFileSync?.changedFiles &&
    currentFileSync?.deletedFiles === nextFileSync?.deletedFiles &&
    currentFileSync?.cachedFiles === nextFileSync?.cachedFiles &&
    currentFileSync?.compileFiles === nextFileSync?.compileFiles &&
    JSON.stringify(current.dirty ?? null) === JSON.stringify(next.dirty ?? null) &&
    JSON.stringify(current.strategy ?? null) === JSON.stringify(next.strategy ?? null)
  );
}

function formatCompileTimingTotal(metadata: CompileMetadata): string {
  const totalMs = (metadata.timings ?? []).reduce((total, timing) => total + timing.durationMs, 0);
  return totalMs > 0 ? formatDurationMs(totalMs) : "No timings";
}

function formatCompileStrategySummary(metadata: CompileMetadata): string {
  const strategy = metadata.strategy;

  if (!strategy) {
    return "No compile strategy metadata.";
  }

  const mode =
    strategy.requestedMode === strategy.effectiveMode
      ? strategy.effectiveMode
      : `${strategy.requestedMode} -> ${strategy.effectiveMode}`;
  const fallback = strategy.fallbackUsed ? " · fallback used" : "";
  return `${mode} · ${strategy.previewKind} · ${strategy.mainFilePath}${fallback}. ${strategy.reason}`;
}

function formatDurationMs(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`;
  }

  return `${Math.max(0, durationMs).toFixed(0)}ms`;
}

function logCompileTiming({
  durationMs,
  changed,
  ok,
  diagnosticsCount,
  metadata
}: {
  durationMs: number;
  changed: boolean;
  ok: boolean;
  diagnosticsCount: number;
  metadata?: CompileMetadata;
}): void {
  if (typeof console === "undefined") {
    return;
  }

  const fileSync = metadata?.fileSync
    ? `, ${metadata.fileSync.changedFiles} changed/${metadata.fileSync.cachedFiles} cached files`
    : "";
  const strategy = metadata?.strategy
    ? `, strategy ${metadata.strategy.requestedMode}->${metadata.strategy.effectiveMode}/${metadata.strategy.previewKind}`
    : "";
  const dirty = metadata?.dirty
    ? `, dirty ${metadata.dirty.status}${metadata.dirty.requiresFullCompile ? "/full" : ""}`
    : "";
  const stages = metadata?.timings?.length
    ? `, ${metadata.timings
        .map((timing) => `${timing.label} ${formatDurationMs(timing.durationMs)}`)
        .join(", ")}`
    : "";

  console.debug(
    `[typr] compile ${ok ? "ok" : "error"} in ${durationMs.toFixed(1)}ms` +
      ` (${changed ? "updated preview" : "unchanged output"}, ${diagnosticsCount} diagnostics${fileSync}${strategy}${dirty}${stages})`
  );
}

function resolvePreviewSourcePath(
  path: string | undefined,
  activeSourcePath: string,
  activePreviewPath: string | null,
  activeSourceLanguage: SourceLanguage
): string {
  const normalizedPath = path ? normalizeWorkspacePath(path) : "";
  const fallbackPath = activePreviewPath ?? activeSourcePath;
  const fallbackIsTypst = getSourceLanguage(fallbackPath) === "typst";

  if (!normalizedPath) {
    return fallbackPath;
  }

  if (
    normalizedPath === "main.typ" &&
    (activeSourceLanguage === "typst" || fallbackIsTypst)
  ) {
    return fallbackPath;
  }

  return normalizedPath;
}

function resetDocumentScrollPosition(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function countSourceTextLines(source: string): number {
  if (!source) {
    return 1;
  }

  return source.replace(/\r\n?/g, "\n").split("\n").length;
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

function decodeProjectTextFile(project: TyprProjectRepository, path: string): string {
  const bytes = readProjectFileBytes(project, path);

  if (!bytes) {
    throw new Error(`File not found: ${path}`);
  }

  return new TextDecoder().decode(bytes);
}

function readProjectTextFileOrDefault(
  project: TyprProjectRepository,
  path: string,
  fallback: string
): string {
  const bytes = readProjectFileBytes(project, path);

  return bytes ? new TextDecoder().decode(bytes) : fallback;
}

function getSettingsTabTitle(tab: SettingsTab): string {
  switch (tab) {
    case "git":
      return "Git";
    case "themes":
      return "Themes";
    case "editor":
      return "Editor";
    case "keybindings":
      return "Keybindings";
    case "snippets":
      return "Snippets";
    case "packages":
      return "Packages";
  }
}

function getSidebarToolTitle(tool: SidebarTool): string {
  switch (tool) {
    case "projects":
      return "Projects";
    case "files":
      return "Files";
    case "source-tools":
      return "Tools";
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
    case "docs":
      return "Docs";
    case "settings":
      return "Settings";
  }
}

function getSidebarToolSubtitle(tool: SidebarTool): string {
  switch (tool) {
    case "projects":
      return "Local workspaces";
    case "files":
      return "Files";
    case "source-tools":
      return "Source actions";
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
      return "Version control";
    case "debug":
      return "Compiler and diagnostics";
    case "docs":
      return "User guide";
    case "settings":
      return "Preferences";
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

function collectOutlineEntries(content: string, language: SourceLanguage): OutlineEntry[] {
  if (language === "latex") {
    return collectLatexOutlineEntries(content);
  }

  if (language === "markdown") {
    return collectMarkdownOutlineEntries(content);
  }

  return collectTypstOutlineEntries(content);
}

function collectTypstOutlineEntries(content: string): OutlineEntry[] {
  return content
    .split("\n")
    .flatMap((lineText, index) => {
      const match = lineText.match(/^\s*(=+)\s+(.*)$/);

      if (!match) {
        return [];
      }

      return [
        {
          level: match[1].length,
          lineNumber: index + 1,
          title: cleanOutlineTitle(match[2])
        } satisfies OutlineEntry
      ];
    });
}

function collectMarkdownOutlineEntries(content: string): OutlineEntry[] {
  return content
    .split("\n")
    .flatMap((lineText, index) => {
      const match = lineText.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);

      if (!match) {
        return [];
      }

      return [
        {
          level: match[1].length,
          lineNumber: index + 1,
          title: cleanOutlineTitle(match[2])
        } satisfies OutlineEntry
      ];
    });
}

const LATEX_OUTLINE_LEVELS = new Map([
  ["part", 1],
  ["chapter", 2],
  ["section", 3],
  ["subsection", 4],
  ["subsubsection", 5],
  ["paragraph", 6],
  ["subparagraph", 7]
]);

function collectLatexOutlineEntries(content: string): OutlineEntry[] {
  return content
    .split("\n")
    .flatMap((lineText, index) => {
      const match = lineText.match(/^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{(.+)\}\s*$/);

      if (!match) {
        return [];
      }

      return [
        {
          level: LATEX_OUTLINE_LEVELS.get(match[1]) ?? 1,
          lineNumber: index + 1,
          title: cleanLatexOutlineTitle(match[2])
        } satisfies OutlineEntry
      ];
    });
}

function cleanOutlineTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function cleanLatexOutlineTitle(title: string): string {
  return cleanOutlineTitle(
    title
      .replace(/\\texorpdfstring\s*\{([^{}]*)\}\s*\{[^{}]*\}/g, "$1")
      .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\([#$%&_{}])/g, "$1")
      .replace(/\\[a-zA-Z]+\*?/g, "")
  );
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


function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function loadPersistedBuildLogEntries(storageKey: string): BuildLogEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isBuildLogEntry).map(normalizeBuildLogEntry).slice(0, 20);
  } catch {
    return [];
  }
}


function normalizeBuildLogEntry(entry: BuildLogEntry): BuildLogEntry {
  return {
    ...entry,
    diagnostics: entry.diagnostics ?? [],
    trigger: entry.trigger ?? "manual",
    compileMode: entry.compileMode ?? (entry.language === "latex" ? "quick" : "none"),
    cached: entry.cached ?? false,
    outputChanged: entry.outputChanged ?? false,
    rawLog: entry.rawLog,
    packageDetails: entry.packageDetails ?? [],
    shellEscapeUnavailable: entry.shellEscapeUnavailable ?? false
  };
}

function persistBuildLogEntries(storageKey: string, entries: BuildLogEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 20)));
  } catch {
    // Build logs are useful but non-critical; ignore quota/private-mode failures.
  }
}

function isBuildLogEntry(value: unknown): value is BuildLogEntry {
  const entry = value as Partial<BuildLogEntry> | null;
  return Boolean(
    entry &&
      typeof entry.id === "string" &&
      typeof entry.sourcePath === "string" &&
      typeof entry.language === "string" &&
      typeof entry.engine === "string" &&
      typeof entry.ok === "boolean" &&
      typeof entry.startedAt === "string" &&
      typeof entry.durationMs === "number" &&
      Array.isArray(entry.diagnostics)
  );
}

function extractBuildLogPackageDetails(log: string): string[] {
  return log
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /^(TeX packages|TeX packages local|TeX packages unresolved|Data packages used|Because of unresolved TeX packages)/i.test(line)
    )
    .slice(0, 12);
}

function hasShellEscapeConstraint(log: string): boolean {
  return /shell escape|write18|minted|biber|makeglossaries|external tool/i.test(log);
}

function filterBuildLogEntries(
  entries: BuildLogEntry[],
  filter: BuildLogFilter,
  currentPath: string,
  searchQuery: string
): BuildLogEntry[] {
  const normalizedCurrentPath = normalizeWorkspacePath(currentPath);
  const query = searchQuery.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filter === "errors" && entry.ok && !entry.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      return false;
    }

    if (filter === "warnings" && !entry.diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
      return false;
    }

    if (filter === "current-file" && normalizeWorkspacePath(entry.sourcePath) !== normalizedCurrentPath) {
      return false;
    }

    if (filter === "latex" && entry.language !== "latex") {
      return false;
    }

    if (!query) {
      return true;
    }

    return formatBuildLogEntryText(entry).toLowerCase().includes(query);
  });
}

function groupDiagnosticsByFile(diagnostics: CompileDiagnostic[]): Array<{ file: string; diagnostics: CompileDiagnostic[] }> {
  const groups = new Map<string, CompileDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const key = diagnostic.path || "Current file";
    groups.set(key, [...(groups.get(key) ?? []), diagnostic]);
  }

  return [...groups.entries()].map(([file, groupedDiagnostics]) => ({
    file,
    diagnostics: groupedDiagnostics
  }));
}

function formatBuildLogEntryText(entry: BuildLogEntry): string {
  const diagnostics = entry.diagnostics
    .map((diagnostic) => `${diagnostic.severity} ${formatDiagnosticRange(diagnostic) ?? ""} ${diagnostic.message}`)
    .join("\n");
  const packages = entry.packageDetails.length > 0 ? `\nPackages:\n${entry.packageDetails.join("\n")}` : "";
  const rawLog = entry.rawLog ? `\nRaw log:\n${entry.rawLog}` : "";

  return [
    `${entry.ok ? "OK" : "ERROR"} ${entry.sourcePath}`,
    `Started: ${new Date(entry.startedAt).toLocaleString()}`,
    `Language: ${formatSourceLanguageLabel(entry.language)}`,
    `Engine: ${entry.engine}`,
    `Trigger: ${entry.trigger}`,
    `Compile mode: ${entry.compileMode}`,
    `Duration: ${formatDurationMs(entry.durationMs)}`,
    `Cached: ${entry.cached ? "yes" : "no"}`,
    `Output changed: ${entry.outputChanged ? "yes" : "no"}`,
    `Shell escape unavailable: ${entry.shellEscapeUnavailable ? "yes" : "no"}`,
    `Diagnostics: ${entry.diagnostics.length}`,
    diagnostics,
    packages,
    rawLog
  ].filter(Boolean).join("\n");
}

function formatBuildLogEntriesText(entries: BuildLogEntry[]): string {
  return entries.map(formatBuildLogEntryText).join("\n\n---\n\n");
}

function getPreviousBuildLogEntry(entries: BuildLogEntry[], index: number): BuildLogEntry | null {
  return entries.slice(index + 1).find((entry) => entry.sourcePath === entries[index]?.sourcePath) ?? null;
}

function dedupeRepeatedWarnings(diagnostics: CompileDiagnostic[]): CompileDiagnostic[] {
  const seenWarnings = new Set<string>();
  const visible: CompileDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "warning") {
      visible.push(diagnostic);
      continue;
    }

    const key = `${diagnostic.path ?? ""}:${diagnostic.message}`;
    if (seenWarnings.has(key)) {
      continue;
    }

    seenWarnings.add(key);
    visible.push(diagnostic);
  }

  return visible;
}

function formatDebugOutputExcerpt(output: string): string {
  const limit = 1800;

  if (!output.trim()) {
    return "No output available for the current file.";
  }

  if (output.length <= limit * 2) {
    return output;
  }

  return [
    output.slice(0, limit),
    "\n\n... output truncated ...\n\n",
    output.slice(-limit)
  ].join("");
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

function formatSourceLanguageLabel(language: SourceLanguage): string {
  return language === "typst"
    ? "Typst"
    : language === "latex"
      ? "LaTeX"
      : language === "markdown"
        ? "Markdown"
        : "Text";
}

function formatEditorToolLanguageLabel(language: EditorToolLanguage): string {
  return language === "typst"
    ? "Typst"
    : language === "latex"
      ? "LaTeX"
      : "Markdown";
}
