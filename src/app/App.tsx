import {
  useCallback,
  useEffect,
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
import { areBytesEqual } from "../utils/bytes";
import { DocsModal, DocsPanel } from "./DocsModal";
import { SettingsSheet } from "../settings/SettingsSheet";
import { SettingsPanelContent } from "../settings/SettingsPanelContent";
import { useSettingsSheetController } from "../settings/useSettingsSheetController";
import { useSettingsFiles } from "../settings/useSettingsFiles";
import { isSettingsProject, SETTINGS_PROJECT_MARKER_PATH } from "../settings/settingsFiles";
import type { SettingsTab } from "../settings/settingsSheetState";
import { BuildLogPanel } from "../buildLog/BuildLogPanel";
import { useBuildLogController } from "../buildLog/useBuildLogController";
import {
  extractBuildLogPackageDetails,
  groupDiagnosticsByFile,
  hasShellEscapeConstraint,
  type BuildLogEntry,
  type BuildLogTrigger
} from "../buildLog/buildLogState";
import {
  createDefaultSnapshot,
  DEFAULT_EDITOR_FONT_SIZE,
  createDocument,
  createDocumentFromFile,
  createDefaultDiagram,
  createFolder,
  type DiagramAsset,
  getActiveDocument,
  normalizeSnapshot,
  setActiveDocument,
  saveCurrentDiagram,
  createNextDiagramSnapshot,
  restoreTrashEntry,
  updateDiagram,
  updateActiveDocument,
  updateColorfulFileTreeIconsPreference,
  updateCursorSmearPreference,
  updateCursorSmoothPreference,
  updateEditorFontSizePreference,
  updateEditorToolingPreference,
  updateExternalDiagnosticsPreference,
  updateKeybindingsPreference,
  updateLatexMathPreviewPreference,
  updateLiveCompilationPreference,
  updateMobileKeyboardPreference,
  updatePastedImagePreference,
  updateRelativeLineNumbersPreference,
  updateShowGitignoreInFileTreePreference,
  updateSidebarFontSizePreference,
  updateThemePreference,
  updateTypstMathPreviewPreference,
  updateVimClipboardSharingPreference,
  updateVimPreference,
  type AppSnapshot,
  type MobileKeyboardLanguage,
  type ThemePreference
} from "./appState";
import {
  getWorkspaceRenameDraft,
  renameWorkspaceNodeWithPath
} from "./workspaceRename";
import { selectWorkspaceRange } from "./workspaceSelection";
import { useWorkspaceSelection } from "./useWorkspaceSelection";
import { useWorkspaceTabs, type WorkspaceTabKind } from "./useWorkspaceTabs";
import { useWorkspaceTabPersistence } from "./useWorkspaceTabPersistence";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { useGoogleDriveSync } from "./useGoogleDriveSync";
import {
  GoogleDriveGlobalNotice
} from "./GoogleDriveConnectionCard";
import { useLocalFolderSync } from "./useLocalFolderSync";
import {
  areWorkspacePathListsEqual,
  insertWorkspacePathAfterActive,
  openWorkspacePreviewTab,
  normalizeUniqueWorkspacePaths,
  remapWorkspacePath,
  remapWorkspacePaths,
  reorderWorkspacePaths
} from "./workspaceTabs";
import {
  copyWorkspaceNodesToSnapshot,
  emptyWorkspaceTrash,
  getWorkspaceClipboardDomain,
  getWorkspaceMovePromptLabel,
  isWorkspaceNodeCopyable,
  moveWorkspaceNodeInSnapshot,
  normalizeWorkspacePasteDestination,
  remapWorkspaceSelectionAfterMove,
  removeDescendantWorkspaceNodes,
  removeWorkspaceSelectionSubtree,
  trashWorkspaceNode
} from "./workspaceTreeActions";
import {
  formatSourceWithEditorTooling,
  getEditorToolLanguage,
  lintSourceWithEditorTooling,
  type EditorFormatterId,
  type EditorLinterId,
  type EditorToolLanguage
} from "../editor/editorTools";
import {
  runExternalDiagnostics,
  type DiagnosticProviderStatus,
  type ExternalDiagnosticProviderPreferences
} from "../diagnostics/externalDiagnostics";
import { releaseHarperDiagnosticsMemory } from "../diagnostics/harperDiagnosticsWorkerClient";
import { collectDocumentStats, type DocumentStats } from "./documentStats";
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
  collectAvailableLatexPdfPreviewPaths,
  createCompilePreviewState,
  createCompletedPreviewCompilerStatus,
  createIdleCompilerStatusForSource,
  decideCompilePreviewTransition,
  getCompilePreviewSourcePathsForResult,
  getLatexPdfOutputPath,
  getLatexPdfSourcePathForResult,
  shouldShowCompileActivity
} from "./compilePreviewState";
import {
  createTypstPreviewCacheSignature,
  getExistingLatexPdfPath,
  getLatexSynctexOutputPath,
  loadSavedLatexPdfCompileResult,
  loadTypstPreviewCacheResult,
  saveTypstPreviewCacheResult
} from "./compilePreviewCache";
import { useCompilePreviewController } from "./useCompilePreviewController";
import { resolveCompileResultCompletion } from "./compileResultReuse";
import { prepareBrowserForLatexCompile } from "./latexCompilePreparation";
import { resolvePreviewTextContent } from "./previewContent";
import {
  buildTypstProjectShadowFiles,
  exportTypstPreviewPdf
} from "./typstPreviewExport";
import {
  releaseTypstCompilerMemory,
  type CompilerStatus,
  type CompileResult
} from "../compiler/typstCompiler";
import {
  cancelLatexCompile,
  compileLatexDocument,
  releaseLatexCompilerMemory,
  type LatexCompileDriver,
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
  DEFAULT_NEW_DOCUMENT_EXTENSION,
  getPreferredNewDocumentExtension,
  getSourceLanguage,
  isCompilableSourceFile,
  isLatexMainSourceFile,
  isTypstSourceFile,
  normalizeCompilerPath,
  type PreferredNewDocumentExtension,
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
  type TypstEditorSelection,
  type TypstSearchQueryState
} from "../editor/TypstEditor";
import { TerminalDrawer } from "../terminal/TerminalDrawer";
import {
  collectMarkdownImageReferences,
  renderMarkdownHtml
} from "../markdown/markdownParser";
import { isTerminalToggleShortcut } from "../terminal/terminalHotkey";
import {
  PreviewPane,
  PreviewDebugPanel,
  PreviewStatusIcon,
  type WorkspacePreviewAsset,
  type WorkspacePreviewFile
} from "../preview/PreviewPane";
import { MitexPanel } from "../mitex/MitexPanel";
import { DiagramEditorErrorBoundary } from "../diagram/DiagramEditorErrorBoundary";
import { DiagramPane, type DiagramPaneMode } from "../diagram/DiagramPane";
import { serializeDiagramSvg } from "../diagram/diagramSvgSerializer";
import { DiagramEditor } from "../diagram/SvgEditDiagramEditor";
import { TikzDiagramEditor } from "../diagram/TikzDiagramEditor";
import { exportSvgToVectorPdfBytes } from "../diagram/diagramPdfExport";
import {
  DIAGRAM_DIRECTORY,
  getDiagramCompilerPath,
  getDiagramFilePath,
  getDiagramPdfFileName,
  getDiagramPdfFilePath,
  normalizeDiagramFileName
} from "../diagram/diagramFiles";
import {
  DEFAULT_TIKZ_SOURCE,
  collectTikzFigureFiles,
  createNextTikzPath,
  getTikzCetzPath,
  getTikzFileName,
  getTikzPdfPath,
  getTikzSvgPath,
  renameTikzFigureFiles,
  writeTikzFigureFiles
} from "../diagram/tikzFiles";
import {
  buildTikzInsertion,
  type TikzInsertMode
} from "../diagram/tikzInsertion";
import {
  assessCetzConversion,
  buildCetzValidationSource
} from "../diagram/cetzConversion";
import { compareDiagramSvgs } from "../diagram/cetzVisualValidation";
import {
  convertTikzToCetz,
  releaseTylaxWorker
} from "../diagram/tylaxWorkerClient";
import {
  AUTO_THEME_ID,
  compareThemesByDisplayOrder,
  THEME_IMPORT_TEMPLATE
} from "../theme/themes";
import {
  DEFAULT_ZOOM,
  nextZoomStep,
  zoomPreviewByWheel,
  type PreviewZoomState
} from "../preview/PreviewPane";
import { shouldUseLowMemoryCompilerMode } from "../utils/browserDetection";
import {
  createSourceRange,
  type PreviewSourceLink,
  type SourcePosition
} from "../preview/sourceLinks";
import {
  deleteCloudProjectBindings,
  deleteLocalFolderBinding,
  deleteProjectDeletionTombstone,
  deleteProjectGitFiles,
  loadGitWorkspace,
  loadGitHubConfig,
  loadProjectDeletionTombstones,
  loadProjectStorage,
  loadSnapshot,
  loadCustomSnippets,
  saveGitWorkspace,
  saveGitHubConfig,
  saveProjectDeletionTombstone,
  saveProjectStorage,
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
  renameProjectPath,
  updateSelectedProjectRepository,
  writeProjectFile,
  type ProjectFilesystemEntry,
  type TyprProjectRepository,
} from "../project/projectState";
import {
  applyProjectDeletionTombstones,
  deleteProjectDurably,
  retryProjectDeletions
} from "../project/projectDeletion";
import {
  createEmptyGitManagedProject,
  normalizeGitWorkspaceState,
  parseIgnorePatternsInput,
  stringifyIgnorePatterns,
  type GitManagedProject
} from "../git/gitState";
import {
  formatRepoError,
  type RepoMergeResolution,
  type RepoStorageStats,
  type RepoStatus,
  type RepoStatusEntry
} from "../git/repoBackend";
import { loadGitCredentialMap, redactGitSecrets, saveGitCredentialMap } from "../git/credentials";
import {
  type RemoteGitConfig
} from "../git/remoteService";
import {
  createInitialGitHubCloneState,
  useGitPanelController,
  type MergeVersionPreview,
  type MergeVersionRole
} from "./useGitPanelController";
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
import {
  getRelativePathBasename as getWorkspaceBaseName,
  getRelativePathParent as getWorkspaceParentPath,
  joinRelativePaths as joinWorkspacePath
} from "../utils/relativePath";
import { scrollElementWithin } from "../utils/domScroll";
import { ApplicationInfoButton } from "../update/ApplicationInfoButton";
import { updateManager } from "../update/updateManager";

const COMPILE_DEBOUNCE_MS = 60;
const SAVE_DEBOUNCE_MS = 250;
const OUTLINE_DEBOUNCE_MS = 180;
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
const PREVIEW_POPUP_STORAGE_KEY = "typr.preview-popup";
const WORKSPACE_OPEN_FOLDERS_STORAGE_KEY = "typr.workspace-open-folders.v1";
const LATEX_PACKAGE_SELECTIONS_STORAGE_KEY = "typr.latex-package-selections.v1";
const RECENT_WORKSPACE_STORAGE_KEY = "typr.recent-workspace.v1";
const LEFT_PANE_STORAGE_KEY = "typr.left-pane.v1";
const FILE_KEYBINDING_COMMAND_IDS = ["newFile", "renameFile"] as const;
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

function collectMarkdownPreviewAssets(
  project: TyprProjectRepository | null,
  sourcePath: string,
  source: string
): WorkspacePreviewAsset[] {
  if (!project) {
    return [];
  }

  const assets = new Map<string, WorkspacePreviewAsset>();

  for (const reference of collectMarkdownImageReferences(source)) {
    const path = normalizeWorkspaceReferencePath(reference, sourcePath);
    const mimeType = path ? getWorkspacePreviewMimeType(path) : null;

    if (!path || !mimeType?.startsWith("image/") || assets.has(path)) {
      continue;
    }

    const content = readProjectFileBytes(project, path);

    if (content) {
      assets.set(path, { path, content, mimeType });
    }
  }

  return [...assets.values()];
}

function isWorkspacePreviewFile(path: string): boolean {
  const mimeType = getWorkspacePreviewMimeType(path);

  return mimeType !== null && mimeType !== "text/markdown";
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

function getProjectLastEditedAt(project: TyprProjectRepository): string {
  const candidates = [
    project.updatedAt,
    project.filesystem.updatedAt,
    ...Object.values(project.filesystem.entries).map((entry) => entry.updatedAt)
  ];
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  let latestValue = project.updatedAt;

  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestValue = candidate;
    }
  }

  return latestValue;
}

function formatProjectLastEditedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

const SIDEBAR_TOOLS: Array<{ id: SidebarTool; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "files", label: "Files" },
  { id: "source-tools", label: "Tools" },
  { id: "search", label: "Search" },
  { id: "outline", label: "Outline" },
  { id: "diagram", label: "Diagram" },
  { id: "mitex", label: "MiTeX" },
  { id: "sync", label: "Git" },
  { id: "debug", label: "Debug" }
];

const MOBILE_SIDEBAR_TOOLS: Array<{ id: SidebarTool; label: string }> = [
  ...SIDEBAR_TOOLS,
  { id: "docs", label: "Docs" },
  { id: "settings", label: "Settings" }
];

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
const PREVIEW_PINCH_MIN_PERCENT = 25;
const PREVIEW_PINCH_MAX_PERCENT = 500;
const EDITOR_PINCH_MIN_FONT_SIZE = 12;
const EDITOR_PINCH_MAX_FONT_SIZE = 28;
type MenuLabel = (typeof MENU_ITEMS)[number];
type WorkspaceMode = "split" | "sidebar" | "editor" | "preview" | "zen";
type ZenResizeEdge = "zen-left" | "zen-right" | "zen-top" | "zen-bottom";
type ZoomPaneTarget = "sidebar" | "source" | "preview";
type PinchZoomPaneTarget = "source" | "preview";
type VimPaneFocusTarget = "sidebar" | "source" | "preview";

interface PinchZoomState {
  input: "gesture" | "touch";
  pane: PinchZoomPaneTarget;
  startDistance: number;
  startPreviewPercent: number;
  startEditorFontSize: number;
  lastPreviewPercent: number;
  lastEditorFontSize: number;
}
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
  | "docs"
  | "settings";
type PackageSettingsScope = "typst" | "latex";
type WorkspaceClipboardMode = "copy" | "cut";
type MatrixDelimiter = "paren" | "bracket" | "brace" | "bar" | "angle" | "none";
type TableHorizontalAlignment = "left" | "center" | "right";
type TableVerticalAlignment = "top" | "middle" | "bottom";
type TableFormatScope = "table" | "column" | "row" | "cell";
type TablePadding = "none" | "small" | "medium" | "large";
type TableStrokeStyle = "none" | "solid" | "dashed" | "dotted" | "double";
type TableStrokeWeight = "thin" | "medium" | "thick";
type TableBorderEdge = "top" | "right" | "bottom" | "left";
type TableBorderPreset =
  | "clear"
  | "all"
  | "outer"
  | "inner"
  | "horizontal"
  | "vertical"
  | "top"
  | "right"
  | "bottom"
  | "left";
type TableAlignment = TableHorizontalAlignment | "horizon";
type TableGutter = "none" | "small" | "medium";
type TableInset = "none" | "small" | "medium";
type TableStroke = "default" | "none";
type LatexCompileProfileId = "pdftex-quick" | "pdftex-full" | "luatex-full" | "luahbtex-full";

interface LatexCompileProfile {
  id: LatexCompileProfileId;
  label: string;
  description: string;
  mode: LatexCompileMode;
  driver: LatexCompileDriver;
}

const LATEX_COMPILE_PROFILES: LatexCompileProfile[] = [
  {
    id: "pdftex-quick",
    label: "pdfTeX quick",
    description: "One pdfTeX pass; skips BibTeX, index, and reruns.",
    mode: "quick",
    driver: "pdftex_bibtex8"
  },
  {
    id: "pdftex-full",
    label: "pdfTeX full",
    description: "pdfTeX, BibTeX8/makeindex as needed, then rerun passes.",
    mode: "full",
    driver: "pdftex_bibtex8"
  },
  {
    id: "luatex-full",
    label: "LuaTeX full",
    description: "LuaTeX engine with BibTeX8/makeindex and rerun passes.",
    mode: "full",
    driver: "luatex_bibtex8"
  },
  {
    id: "luahbtex-full",
    label: "LuaHBTeX full",
    description: "LuaTeX plus HarfBuzz shaping; best for modern OpenType text.",
    mode: "full",
    driver: "luahbtex_bibtex8"
  }
];

function getLatexCompileProfile(id: LatexCompileProfileId): LatexCompileProfile {
  return LATEX_COMPILE_PROFILES.find((profile) => profile.id === id) ?? LATEX_COMPILE_PROFILES[0];
}

interface WorkspaceClipboardState {
  mode: WorkspaceClipboardMode;
  paths: string[];
}

interface SyncFeedback {
  tone: "neutral" | "success" | "error";
  text: string;
}

interface DiagnosticSourceSnapshot {
  source: string;
  path: string;
  language: SourceLanguage;
}

interface ExternalDiagnosticsState {
  source: DiagnosticSourceSnapshot;
  preferencesSignature: string;
  diagnostics: CompileDiagnostic[];
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

interface StoredLeftPaneState {
  activeSidebarTool: SidebarTool;
  mobileWorkspaceTab: MobileWorkspaceTab;
  isTrashViewOpen: boolean;
  scrollByPane: Record<string, number>;
}

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

interface MatrixSize {
  rows: number;
  columns: number;
}

interface MatrixSettings extends MatrixSize {
  delimiter: MatrixDelimiter;
  cells: string[][];
}

interface TableCellBorder {
  strokeStyle: TableStrokeStyle;
  strokeWeight: TableStrokeWeight;
}

interface TableCellFormat {
  align?: TableHorizontalAlignment;
  verticalAlign?: TableVerticalAlignment;
  padding?: TablePadding;
  strokeStyle?: TableStrokeStyle;
  strokeWeight?: TableStrokeWeight;
  backgroundColor?: string;
  borders?: Partial<Record<TableBorderEdge, TableCellBorder>>;
}

interface TableMerge {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
}

interface TableSelection {
  anchorRow: number;
  anchorColumn: number;
  focusRow: number;
  focusColumn: number;
}

interface TableSelectionRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

interface TableResolvedCellFormat {
  align: TableHorizontalAlignment;
  verticalAlign: TableVerticalAlignment;
  padding: TablePadding;
  strokeStyle: TableStrokeStyle;
  strokeWeight: TableStrokeWeight;
  backgroundColor: string;
}

interface TableSettings extends MatrixSize {
  header: boolean;
  footer: boolean;
  striped: boolean;
  align: TableAlignment;
  gutter: TableGutter;
  inset: TableInset;
  stroke: TableStroke;
  caption: string;
  cells: string[][];
  tableFormat: TableCellFormat;
  columnFormats: TableCellFormat[];
  rowFormats: TableCellFormat[];
  cellFormats: TableCellFormat[][];
  merges: TableMerge[];
}

interface EditableSourceTable {
  from: number;
  to: number;
  language: SourceLanguage;
  settings: TableSettings;
}

const MATRIX_MIN_ROWS = 1;
const MATRIX_MIN_COLUMNS = 1;
const MATRIX_SIZE_PICKER_INITIAL_ROWS = 4;
const MATRIX_SIZE_PICKER_INITIAL_COLUMNS = 4;
const MATRIX_MAX_ROWS = 24;
const MATRIX_MAX_COLUMNS = 24;
const MATRIX_DELIMITER_OPTIONS: Array<{
  id: MatrixDelimiter;
  label: string;
  delim: string | null;
}> = [
  { id: "paren", label: "()", delim: "(" },
  { id: "bracket", label: "[]", delim: "[" },
  { id: "brace", label: "{}", delim: "{" },
  { id: "bar", label: "||", delim: "|" },
  { id: "angle", label: "<>", delim: "<" },
  { id: "none", label: "None", delim: null }
];

function clampMatrixDimension(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function createMatrixCells(rows: number, columns: number, cells: string[][] = []): string[][] {
  return Array.from({ length: rows }, (_unusedRow, rowIndex) =>
    Array.from({ length: columns }, (_unusedColumn, columnIndex) => cells[rowIndex]?.[columnIndex] ?? "")
  );
}

function createInitialMatrixSettings(): MatrixSettings {
  const rows = 2;
  const columns = 2;

  return {
    rows,
    columns,
    delimiter: "paren",
    cells: createMatrixCells(rows, columns)
  };
}

function resizeMatrixSettings(settings: MatrixSettings, rows: number, columns: number): MatrixSettings {
  const nextRows = clampMatrixDimension(rows, MATRIX_MIN_ROWS, MATRIX_MAX_ROWS);
  const nextColumns = clampMatrixDimension(columns, MATRIX_MIN_COLUMNS, MATRIX_MAX_COLUMNS);

  return {
    ...settings,
    rows: nextRows,
    columns: nextColumns,
    cells: createMatrixCells(nextRows, nextColumns, settings.cells)
  };
}

function updateMatrixCell(
  settings: MatrixSettings,
  rowIndex: number,
  columnIndex: number,
  value: string
): MatrixSettings {
  const cells = createMatrixCells(settings.rows, settings.columns, settings.cells);

  cells[rowIndex][columnIndex] = value;

  return {
    ...settings,
    cells
  };
}

function escapeSnippetText(value: string): string {
  return value.replace(/[\\$}]/g, "\\$&");
}

function escapeTypstContent(value: string): string {
  const escapedTypst = value
    .replace(/\\/g, "\\\\")
    .replace(/\/\//g, "\\/\\/")
    .replace(/([#$*_`\[\]@])/g, "\\$1");

  return escapeSnippetText(escapedTypst);
}

function escapeLatexText(value: string): string {
  const escapedLatex = value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}");

  return escapeSnippetText(escapedLatex);
}

function escapeMarkdownTableCell(value: string): string {
  const escapedMarkdown = value
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");

  return escapeSnippetText(escapedMarkdown);
}

function createTableCells(rows: number, columns: number, cells: string[][] = []): string[][] {
  return createMatrixCells(rows, columns, cells);
}

function cloneTableCellBorder(border: TableCellBorder): TableCellBorder {
  return { ...border };
}

function cloneTableCellFormat(format: TableCellFormat = {}): TableCellFormat {
  return {
    ...format,
    borders: format.borders
      ? Object.fromEntries(
          TABLE_BORDER_EDGES.flatMap((edge) => {
            const border = format.borders?.[edge];
            return border ? [[edge, cloneTableCellBorder(border)]] : [];
          })
        ) as Partial<Record<TableBorderEdge, TableCellBorder>>
      : undefined
  };
}

function createTableFormatList(length: number, formats: TableCellFormat[] = []): TableCellFormat[] {
  return Array.from({ length }, (_unused, index) => cloneTableCellFormat(formats[index]));
}

function createTableFormatGrid(rows: number, columns: number, formats: TableCellFormat[][] = []): TableCellFormat[][] {
  return Array.from({ length: rows }, (_unusedRow, rowIndex) =>
    Array.from({ length: columns }, (_unusedColumn, columnIndex) =>
      cloneTableCellFormat(formats[rowIndex]?.[columnIndex])
    )
  );
}

function createInitialTableSettings(): TableSettings {
  const rows = 3;
  const columns = 3;

  return {
    rows,
    columns,
    header: true,
    footer: false,
    striped: true,
    align: "left",
    gutter: "none",
    inset: "small",
    stroke: "default",
    caption: "",
    cells: createTableCells(rows, columns),
    tableFormat: { ...DEFAULT_TABLE_FORMAT },
    columnFormats: createTableFormatList(columns),
    rowFormats: createTableFormatList(rows),
    cellFormats: createTableFormatGrid(rows, columns),
    merges: []
  };
}

function resizeTableSettings(settings: TableSettings, rows: number, columns: number): TableSettings {
  const nextRows = clampMatrixDimension(rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const nextColumns = clampMatrixDimension(columns, TABLE_MIN_COLUMNS, TABLE_MAX_COLUMNS);

  return {
    ...settings,
    rows: nextRows,
    columns: nextColumns,
    footer: nextRows < 2 ? false : settings.footer,
    cells: createTableCells(nextRows, nextColumns, settings.cells),
    columnFormats: createTableFormatList(nextColumns, settings.columnFormats),
    rowFormats: createTableFormatList(nextRows, settings.rowFormats),
    cellFormats: createTableFormatGrid(nextRows, nextColumns, settings.cellFormats),
    merges: normalizeTableMergesForSize(settings.merges, nextRows, nextColumns)
  };
}

function normalizeTableMergesForSize(merges: TableMerge[], rows: number, columns: number): TableMerge[] {
  return merges
    .map((merge) => ({
      row: merge.row,
      column: merge.column,
      rowSpan: Math.min(merge.rowSpan, rows - merge.row),
      columnSpan: Math.min(merge.columnSpan, columns - merge.column)
    }))
    .filter((merge) => merge.row >= 0 && merge.column >= 0 && merge.rowSpan > 0 && merge.columnSpan > 0);
}

function updateTableCell(
  settings: TableSettings,
  rowIndex: number,
  columnIndex: number,
  value: string
): TableSettings {
  const cells = createTableCells(settings.rows, settings.columns, settings.cells);

  cells[rowIndex][columnIndex] = value;

  return {
    ...settings,
    cells
  };
}

function buildTableauColumnTemplate(cells: string[][], columns: number): string {
  return Array.from({ length: columns }, (_unused, columnIndex) => {
    const maxLength = Math.max(
      2,
      ...cells.map((row) => (row[columnIndex] ?? "").trim().length)
    );
    const width = Math.min(42, Math.max(4, maxLength + 2));

    return `minmax(var(--tool-tableau-cell-size), max(var(--tool-tableau-cell-size), ${width}ch))`;
  }).join(" ");
}

function isTableFooterRow(settings: TableSettings, rowIndex: number): boolean {
  return settings.footer && settings.rows > 1 && rowIndex === settings.rows - 1;
}

function getTableCellPlaceholder(rowIndex: number, columnIndex: number, settings: TableSettings): string {
  if (settings.header && rowIndex === 0) {
    return `Header ${columnIndex + 1}`;
  }

  if (isTableFooterRow(settings, rowIndex)) {
    return `Footer ${columnIndex + 1}`;
  }

  return "*";
}

function normalizeTableHorizontalAlignment(align: TableAlignment | undefined): TableHorizontalAlignment {
  if (align === "center" || align === "right") {
    return align;
  }

  return "left";
}

function normalizeTableSelection(selection: TableSelection): TableSelectionRange {
  return {
    startRow: Math.min(selection.anchorRow, selection.focusRow),
    endRow: Math.max(selection.anchorRow, selection.focusRow),
    startColumn: Math.min(selection.anchorColumn, selection.focusColumn),
    endColumn: Math.max(selection.anchorColumn, selection.focusColumn)
  };
}

function clampTableSelection(selection: TableSelection, settings: TableSettings): TableSelection {
  const maxRow = Math.max(0, settings.rows - 1);
  const maxColumn = Math.max(0, settings.columns - 1);
  const clampRow = (row: number) => Math.min(maxRow, Math.max(0, row));
  const clampColumn = (column: number) => Math.min(maxColumn, Math.max(0, column));

  return {
    anchorRow: clampRow(selection.anchorRow),
    anchorColumn: clampColumn(selection.anchorColumn),
    focusRow: clampRow(selection.focusRow),
    focusColumn: clampColumn(selection.focusColumn)
  };
}

function isCellInTableSelection(selection: TableSelection, rowIndex: number, columnIndex: number): boolean {
  const range = normalizeTableSelection(selection);

  return (
    rowIndex >= range.startRow &&
    rowIndex <= range.endRow &&
    columnIndex >= range.startColumn &&
    columnIndex <= range.endColumn
  );
}

function isTableSelectionMergedRange(selection: TableSelection): boolean {
  const range = normalizeTableSelection(selection);
  return range.startRow !== range.endRow || range.startColumn !== range.endColumn;
}

function tableMergeContainsCell(merge: TableMerge, rowIndex: number, columnIndex: number): boolean {
  return (
    rowIndex >= merge.row &&
    rowIndex < merge.row + merge.rowSpan &&
    columnIndex >= merge.column &&
    columnIndex < merge.column + merge.columnSpan
  );
}

function tableMergeIsAnchor(merge: TableMerge, rowIndex: number, columnIndex: number): boolean {
  return merge.row === rowIndex && merge.column === columnIndex;
}

function getTableMergeForCell(settings: TableSettings, rowIndex: number, columnIndex: number): TableMerge | null {
  return settings.merges.find((merge) => tableMergeContainsCell(merge, rowIndex, columnIndex)) ?? null;
}

function isCoveredTableMergeCell(settings: TableSettings, rowIndex: number, columnIndex: number): boolean {
  const merge = getTableMergeForCell(settings, rowIndex, columnIndex);
  return Boolean(merge && !tableMergeIsAnchor(merge, rowIndex, columnIndex));
}

function findVisibleTableCell(
  settings: TableSettings,
  rowIndex: number,
  columnIndex: number,
  rowStep: number,
  columnStep: number
): { rowIndex: number; columnIndex: number } {
  let nextRow = Math.min(settings.rows - 1, Math.max(0, rowIndex));
  let nextColumn = Math.min(settings.columns - 1, Math.max(0, columnIndex));

  while (isCoveredTableMergeCell(settings, nextRow, nextColumn)) {
    const candidateRow = Math.min(settings.rows - 1, Math.max(0, nextRow + rowStep));
    const candidateColumn = Math.min(settings.columns - 1, Math.max(0, nextColumn + columnStep));

    if (candidateRow === nextRow && candidateColumn === nextColumn) {
      break;
    }

    nextRow = candidateRow;
    nextColumn = candidateColumn;
  }

  return { rowIndex: nextRow, columnIndex: nextColumn };
}

function findVisibleTableCellByOffset(
  settings: TableSettings,
  rowIndex: number,
  columnIndex: number,
  offset: number
): { rowIndex: number; columnIndex: number } {
  const currentIndex = rowIndex * settings.columns + columnIndex;
  const totalCells = settings.rows * settings.columns;
  let nextIndex = Math.max(0, Math.min(totalCells - 1, currentIndex + offset));

  while (nextIndex > 0 && nextIndex < totalCells - 1) {
    const nextRow = Math.floor(nextIndex / settings.columns);
    const nextColumn = nextIndex % settings.columns;

    if (!isCoveredTableMergeCell(settings, nextRow, nextColumn)) {
      return { rowIndex: nextRow, columnIndex: nextColumn };
    }

    nextIndex += offset > 0 ? 1 : -1;
  }

  return {
    rowIndex: Math.floor(nextIndex / settings.columns),
    columnIndex: nextIndex % settings.columns
  };
}

function tableMergeIntersectsRange(merge: TableMerge, range: TableSelectionRange): boolean {
  return !(
    merge.row + merge.rowSpan - 1 < range.startRow ||
    merge.row > range.endRow ||
    merge.column + merge.columnSpan - 1 < range.startColumn ||
    merge.column > range.endColumn
  );
}

function mergeSelectedTableCells(settings: TableSettings, selection: TableSelection): TableSettings {
  const range = normalizeTableSelection(clampTableSelection(selection, settings));
  const rowSpan = range.endRow - range.startRow + 1;
  const columnSpan = range.endColumn - range.startColumn + 1;

  if (rowSpan === 1 && columnSpan === 1) {
    return settings;
  }

  return {
    ...settings,
    merges: [
      ...settings.merges.filter((merge) => !tableMergeIntersectsRange(merge, range)),
      {
        row: range.startRow,
        column: range.startColumn,
        rowSpan,
        columnSpan
      }
    ]
  };
}

function unmergeSelectedTableCells(settings: TableSettings, selection: TableSelection): TableSettings {
  const range = normalizeTableSelection(clampTableSelection(selection, settings));

  return {
    ...settings,
    merges: settings.merges.filter((merge) => !tableMergeIntersectsRange(merge, range))
  };
}

function getTableSelectionLabel(selection: TableSelection): string {
  const range = normalizeTableSelection(selection);
  const rows = range.endRow - range.startRow + 1;
  const columns = range.endColumn - range.startColumn + 1;

  if (rows === 1 && columns === 1) {
    return `R${range.startRow + 1} C${range.startColumn + 1}`;
  }

  return `${rows} x ${columns}`;
}

function getTableBorderPresetEdges(
  preset: TableBorderPreset,
  range: TableSelectionRange,
  rowIndex: number,
  columnIndex: number
): TableBorderEdge[] {
  const edges: TableBorderEdge[] = [];

  switch (preset) {
    case "clear":
    case "all":
      return [...TABLE_BORDER_EDGES];
    case "outer":
      if (rowIndex === range.startRow) {
        edges.push("top");
      }
      if (rowIndex === range.endRow) {
        edges.push("bottom");
      }
      if (columnIndex === range.startColumn) {
        edges.push("left");
      }
      if (columnIndex === range.endColumn) {
        edges.push("right");
      }
      return edges;
    case "inner":
      if (rowIndex < range.endRow) {
        edges.push("bottom");
      }
      if (columnIndex < range.endColumn) {
        edges.push("right");
      }
      return edges;
    case "horizontal":
      if (rowIndex === range.startRow) {
        edges.push("top");
      }
      edges.push("bottom");
      return edges;
    case "vertical":
      if (columnIndex === range.startColumn) {
        edges.push("left");
      }
      edges.push("right");
      return edges;
    case "top":
      return rowIndex === range.startRow ? ["top"] : [];
    case "right":
      return columnIndex === range.endColumn ? ["right"] : [];
    case "bottom":
      return rowIndex === range.endRow ? ["bottom"] : [];
    case "left":
      return columnIndex === range.startColumn ? ["left"] : [];
  }
}

function updateTableBordersForSelection(
  settings: TableSettings,
  selection: TableSelection,
  preset: TableBorderPreset,
  border: TableCellBorder
): TableSettings {
  const range = normalizeTableSelection(clampTableSelection(selection, settings));
  const cellFormats = createTableFormatGrid(settings.rows, settings.columns, settings.cellFormats);
  const nextBorder: TableCellBorder = preset === "clear"
    ? { strokeStyle: "none", strokeWeight: border.strokeWeight }
    : border;

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    for (let columnIndex = range.startColumn; columnIndex <= range.endColumn; columnIndex += 1) {
      const edges = getTableBorderPresetEdges(preset, range, rowIndex, columnIndex);

      if (edges.length === 0) {
        continue;
      }

      const cellFormat = cloneTableCellFormat(cellFormats[rowIndex][columnIndex]);
      const borders = { ...(cellFormat.borders ?? {}) };

      for (const edge of edges) {
        borders[edge] = cloneTableCellBorder(nextBorder);
      }

      cellFormat.borders = borders;
      cellFormats[rowIndex][columnIndex] = cellFormat;
    }
  }

  return {
    ...settings,
    cellFormats
  };
}

function getTableFormatBorder(
  settings: TableSettings,
  rowIndex: number,
  columnIndex: number,
  edge: TableBorderEdge
): TableCellBorder | null {
  const merge = getTableMergeForCell(settings, rowIndex, columnIndex);
  const formatRow = merge ? merge.row : rowIndex;
  const formatColumn = merge ? merge.column : columnIndex;

  return settings.cellFormats?.[formatRow]?.[formatColumn]?.borders?.[edge] ?? null;
}

function getTableBorderCssValue(border: TableCellBorder | null, fallback: TableCellBorder): string {
  const effectiveBorder = border ?? fallback;

  if (effectiveBorder.strokeStyle === "none") {
    return "1px solid color-mix(in srgb, var(--border) 46%, transparent)";
  }

  const width = effectiveBorder.strokeWeight === "thick" ? "3px" : effectiveBorder.strokeWeight === "medium" ? "2px" : "1px";
  const style = effectiveBorder.strokeStyle === "double" ? "double" : effectiveBorder.strokeStyle;
  const color = border
    ? "color-mix(in srgb, var(--text) 58%, var(--border))"
    : "color-mix(in srgb, var(--text) 34%, var(--border))";

  return `${width} ${style} ${color}`;
}

function getTablePaddingCssValue(padding: TablePadding): string {
  switch (padding) {
    case "none":
      return "0.08rem";
    case "medium":
      return "0.45rem 0.65rem";
    case "large":
      return "0.65rem 0.85rem";
    case "small":
    default:
      return "0.3rem 0.45rem";
  }
}

function resolveTableCellFormat(settings: TableSettings, rowIndex: number, columnIndex: number): TableResolvedCellFormat {
  return {
    ...DEFAULT_TABLE_FORMAT,
    align: normalizeTableHorizontalAlignment(settings.align),
    padding: settings.inset === "medium" ? "medium" : settings.inset === "none" ? "none" : "small",
    strokeStyle: settings.stroke === "none" ? "none" : "solid",
    ...(settings.tableFormat ?? {}),
    ...(settings.columnFormats?.[columnIndex] ?? {}),
    ...(settings.rowFormats?.[rowIndex] ?? {}),
    ...(settings.cellFormats?.[rowIndex]?.[columnIndex] ?? {})
  };
}

function getTableScopeFormat(
  settings: TableSettings,
  scope: TableFormatScope,
  selection: TableSelection
): TableResolvedCellFormat {
  const range = normalizeTableSelection(clampTableSelection(selection, settings));

  if (scope === "table") {
    return {
      ...DEFAULT_TABLE_FORMAT,
      align: normalizeTableHorizontalAlignment(settings.align),
      padding: settings.inset === "medium" ? "medium" : settings.inset === "none" ? "none" : "small",
      strokeStyle: settings.stroke === "none" ? "none" : "solid",
      ...(settings.tableFormat ?? {})
    };
  }

  if (scope === "column") {
    return resolveTableCellFormat(settings, range.startRow, range.startColumn);
  }

  if (scope === "row") {
    return resolveTableCellFormat(settings, range.startRow, range.startColumn);
  }

  return resolveTableCellFormat(settings, selection.focusRow, selection.focusColumn);
}

function updateTableFormatForScope(
  settings: TableSettings,
  scope: TableFormatScope,
  selection: TableSelection,
  patch: TableCellFormat
): TableSettings {
  const range = normalizeTableSelection(clampTableSelection(selection, settings));

  if (scope === "table") {
    return {
      ...settings,
      align: patch.align ?? settings.align,
      inset: patch.padding === "none" ? "none" : patch.padding === "medium" || patch.padding === "large" ? "medium" : patch.padding === "small" ? "small" : settings.inset,
      stroke: patch.strokeStyle === "none" ? "none" : patch.strokeStyle ? "default" : settings.stroke,
      tableFormat: {
        ...(settings.tableFormat ?? {}),
        ...patch
      }
    };
  }

  if (scope === "column") {
    const columnFormats = createTableFormatList(settings.columns, settings.columnFormats);

    for (let columnIndex = range.startColumn; columnIndex <= range.endColumn; columnIndex += 1) {
      columnFormats[columnIndex] = {
        ...columnFormats[columnIndex],
        ...patch
      };
    }

    return { ...settings, columnFormats };
  }

  if (scope === "row") {
    const rowFormats = createTableFormatList(settings.rows, settings.rowFormats);

    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
      rowFormats[rowIndex] = {
        ...rowFormats[rowIndex],
        ...patch
      };
    }

    return { ...settings, rowFormats };
  }

  const cellFormats = createTableFormatGrid(settings.rows, settings.columns, settings.cellFormats);

  for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
    for (let columnIndex = range.startColumn; columnIndex <= range.endColumn; columnIndex += 1) {
      cellFormats[rowIndex][columnIndex] = {
        ...cellFormats[rowIndex][columnIndex],
        ...patch
      };
    }
  }

  return { ...settings, cellFormats };
}


const TABLE_MIN_ROWS = 1;
const TABLE_MIN_COLUMNS = 1;
const TABLE_MAX_ROWS = 60;
const TABLE_MAX_COLUMNS = 24;
const DEFAULT_TABLE_FORMAT: TableResolvedCellFormat = {
  align: "left",
  verticalAlign: "middle",
  padding: "small",
  strokeStyle: "solid",
  strokeWeight: "thin",
  backgroundColor: ""
};
const TABLE_HORIZONTAL_ALIGNMENT_OPTIONS: Array<{ id: TableHorizontalAlignment; label: string }> = [
  { id: "left", label: "Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Right" }
];
const TABLE_VERTICAL_ALIGNMENT_OPTIONS: Array<{ id: TableVerticalAlignment; label: string; typstValue: string }> = [
  { id: "top", label: "Top", typstValue: "top" },
  { id: "middle", label: "Middle", typstValue: "horizon" },
  { id: "bottom", label: "Bottom", typstValue: "bottom" }
];
const TABLE_PADDING_OPTIONS: Array<{ id: TablePadding; label: string; typstValue: string; latexTabcolsep: string; latexArrayStretch: string }> = [
  { id: "none", label: "None", typstValue: "0pt", latexTabcolsep: "0pt", latexArrayStretch: "1" },
  { id: "small", label: "Small", typstValue: "0.15em", latexTabcolsep: "3pt", latexArrayStretch: "1.05" },
  { id: "medium", label: "Medium", typstValue: "0.35em", latexTabcolsep: "6pt", latexArrayStretch: "1.15" },
  { id: "large", label: "Large", typstValue: "0.65em", latexTabcolsep: "10pt", latexArrayStretch: "1.3" }
];
const TABLE_STROKE_STYLE_OPTIONS: Array<{ id: TableStrokeStyle; label: string }> = [
  { id: "none", label: "None" },
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "double", label: "Double" }
];
const TABLE_STROKE_WEIGHT_OPTIONS: Array<{ id: TableStrokeWeight; label: string; typstValue: string; latexValue: string }> = [
  { id: "thin", label: "Thin", typstValue: "0.5pt", latexValue: "0.4pt" },
  { id: "medium", label: "Medium", typstValue: "0.9pt", latexValue: "0.8pt" },
  { id: "thick", label: "Thick", typstValue: "1.3pt", latexValue: "1.2pt" }
];
const TABLE_BORDER_EDGES: TableBorderEdge[] = ["top", "right", "bottom", "left"];
const TABLE_BORDER_PRESET_OPTIONS: Array<{ id: TableBorderPreset; label: string }> = [
  { id: "outer", label: "Outer" },
  { id: "all", label: "All" },
  { id: "inner", label: "Inner" },
  { id: "horizontal", label: "Horizontal" },
  { id: "vertical", label: "Vertical" },
  { id: "top", label: "Top" },
  { id: "right", label: "Right" },
  { id: "bottom", label: "Bottom" },
  { id: "left", label: "Left" },
  { id: "clear", label: "No border" }
];
const TABLE_GUTTER_OPTIONS: Array<{ id: TableGutter; label: string; value: string }> = [
  { id: "none", label: "None", value: "0pt" },
  { id: "small", label: "Small", value: "0.2em" },
  { id: "medium", label: "Medium", value: "0.45em" }
];
function isMarkdownTableLanguage(language: SourceLanguage): boolean {
  return language === "markdown" || language === "text";
}

function getSupportedTableStrokeStyles(language: SourceLanguage): TableStrokeStyle[] {
  if (language === "typst") {
    return ["none", "solid", "dashed", "dotted"];
  }

  return ["none", "solid", "dashed", "dotted", "double"];
}

function supportsTableMerges(language: SourceLanguage): boolean {
  return language === "latex" || language === "typst";
}

function supportsTableVerticalAlignment(language: SourceLanguage): boolean {
  return language === "typst";
}

function supportsTablePaddingControl(language: SourceLanguage, _scope: TableFormatScope): boolean {
  return language === "typst" || language === "latex";
}

function supportsTableStrokeControl(language: SourceLanguage, scope: TableFormatScope): boolean {
  return language === "typst" || language === "markdown" || language === "text" || (language === "latex" && scope === "table");
}

function supportsTableBorderControl(_language: SourceLanguage): boolean {
  return true;
}

function supportsTableBackgroundControl(language: SourceLanguage): boolean {
  return language === "typst" || language === "latex";
}

function supportsTableMarginControl(language: SourceLanguage): boolean {
  return language === "typst";
}

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


function getRemoteTrackingRefPath(config: RemoteGitConfig): string {
  return `refs/remotes/${config.remoteName.trim()}/${config.branch.trim()}`;
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

function filterGitignoreFromWorkspaceTree(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes
    .filter((node) => normalizeWorkspacePath(node.path) !== ".gitignore")
    .map((node) =>
      node.kind === "folder"
        ? {
            ...node,
            children: filterGitignoreFromWorkspaceTree(node.children)
          }
        : node
    );
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

function getSafeDownloadName(name: string, fallback = "download"): string {
  const normalizedName = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  return normalizedName || fallback;
}

function getWorkspacePathDirectory(path: string): string {
  return getWorkspaceParentPath(path) ?? "";
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
    "img{max-width:100%;height:auto}pre{overflow:auto;padding:12px;background:#f6f8fa;border-radius:6px}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}blockquote{margin-left:0;padding-left:16px;border-left:3px solid #d0d7de;color:#57606a}table{display:block;width:100%;overflow-x:auto;border-collapse:collapse}th,td{padding:8px 11px;border:1px solid #d0d7de;text-align:left;vertical-align:top}th{background:#f6f8fa}th[align=center],td[align=center]{text-align:center}th[align=right],td[align=right]{text-align:right}li:has(>input[type=checkbox]){list-style:none}li>input[type=checkbox]{margin-left:-20px}",
    "</style>",
    "</head>",
    "<body>",
    renderMarkdownHtml(source, "export"),
    "</body>",
    "</html>"
  ].join("\n");
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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function resolveZoomPaneTarget(target: EventTarget | null): ZoomPaneTarget | null {
  const element = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;

  if (!element) {
    return null;
  }

  const pane = element.closest<HTMLElement>("[data-zoom-pane]");
  const zoomPane = pane?.dataset.zoomPane;
  return zoomPane === "sidebar" || zoomPane === "source" || zoomPane === "preview"
    ? zoomPane
    : null;
}

function resolvePinchZoomPaneTarget(target: EventTarget | null): PinchZoomPaneTarget | null {
  const zoomPane = resolveZoomPaneTarget(target);
  return zoomPane === "source" || zoomPane === "preview" ? zoomPane : null;
}

function resolvePinchZoomPaneTargetFromTouches(event: TouchEvent): PinchZoomPaneTarget | null {
  if (event.touches.length < 2 || typeof document === "undefined") {
    return resolvePinchZoomPaneTarget(event.target);
  }

  const firstTouch = event.touches.item(0);
  const secondTouch = event.touches.item(1);

  if (!firstTouch || !secondTouch) {
    return resolvePinchZoomPaneTarget(event.target);
  }

  const midpointTarget = document.elementFromPoint(
    (firstTouch.clientX + secondTouch.clientX) / 2,
    (firstTouch.clientY + secondTouch.clientY) / 2
  );

  return resolvePinchZoomPaneTarget(midpointTarget) ?? resolvePinchZoomPaneTarget(event.target);
}

function getTouchDistance(touches: TouchList): number | null {
  if (touches.length < 2) {
    return null;
  }

  const firstTouch = touches.item(0);
  const secondTouch = touches.item(1);

  if (!firstTouch || !secondTouch) {
    return null;
  }

  return Math.hypot(
    secondTouch.clientX - firstTouch.clientX,
    secondTouch.clientY - firstTouch.clientY
  );
}

function getPreviewZoomPercent(zoom: PreviewZoomState): number {
  return zoom.mode === "percent" ? zoom.percent : 100;
}

function clampPreviewPinchPercent(percent: number): number {
  return Math.max(
    PREVIEW_PINCH_MIN_PERCENT,
    Math.min(PREVIEW_PINCH_MAX_PERCENT, Math.round(percent * 10) / 10)
  );
}

function clampEditorPinchFontSize(fontSize: number): number {
  return Math.max(
    EDITOR_PINCH_MIN_FONT_SIZE,
    Math.min(EDITOR_PINCH_MAX_FONT_SIZE, Math.round(fontSize))
  );
}

function preventNativePinchZoom(event: Event): void {
  if (event.cancelable) {
    event.preventDefault();
  }
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

type PastedSourceImage = {
  bytes: Uint8Array;
  extension: "png" | "jpg";
  mimeType: "image/png" | "image/jpeg";
};

type PastedImageRenameBinding = {
  sourcePath: string;
  originalImagePath: string;
  imagePath: string;
  folderPath: string;
  nameFrom: number;
  nameTo: number;
  extension: "png" | "jpg";
};

async function preparePastedSourceImage(
  file: File,
  format: "png" | "jpeg"
): Promise<PastedSourceImage> {
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const extension = format === "jpeg" ? "jpg" : "png";

  if (file.type === mimeType) {
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      extension,
      mimeType
    };
  }

  const convertedBlob = await convertImageBlob(file, mimeType);

  return {
    bytes: new Uint8Array(await convertedBlob.arrayBuffer()),
    extension,
    mimeType
  };
}

async function convertImageBlob(blob: Blob, mimeType: "image/png" | "image/jpeg"): Promise<Blob> {
  const image = await loadClipboardImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth || image.width);
  canvas.height = Math.max(1, image.naturalHeight || image.height);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare pasted image.");
  }

  if (mimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (convertedBlob) => {
        if (convertedBlob) {
          resolve(convertedBlob);
        } else {
          reject(new Error("Unable to convert pasted image."));
        }
      },
      mimeType,
      0.92
    );
  });
}

function loadClipboardImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to load pasted image."));
    };
    image.src = objectUrl;
  });
}

function normalizePastedImageDirectory(directory: string): string {
  const normalized = normalizeWorkspacePath(directory)
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");

  return normalized || "figures";
}

function getWorkspaceRelativeReference(fromFilePath: string, toPath: string): string {
  const fromDirectory = getWorkspacePathDirectory(fromFilePath);
  const fromSegments = fromDirectory ? fromDirectory.split("/").filter(Boolean) : [];
  const toSegments = normalizeWorkspacePath(toPath).split("/").filter(Boolean);
  let sharedSegmentCount = 0;

  while (
    sharedSegmentCount < fromSegments.length &&
    sharedSegmentCount < toSegments.length &&
    fromSegments[sharedSegmentCount] === toSegments[sharedSegmentCount]
  ) {
    sharedSegmentCount += 1;
  }

  const parentSegments = fromSegments.slice(sharedSegmentCount).map(() => "..");
  const targetSegments = toSegments.slice(sharedSegmentCount);
  return [...parentSegments, ...targetSegments].join("/") || getWorkspaceBaseName(toPath);
}

function buildPastedImagePath(
  project: TyprProjectRepository,
  activePath: string,
  preferences: AppSnapshot["preferences"]["pastedImages"],
  extension: "png" | "jpg"
): { folderPath: string; imagePath: string; referencePath: string } {
  const documentDirectory = getWorkspacePathDirectory(activePath);
  const configuredDirectory = normalizePastedImageDirectory(preferences.figuresDirectory);
  const folderPath = preferences.figuresDirectoryRelativeToFile
    ? joinWorkspacePath(documentDirectory || null, configuredDirectory)
    : configuredDirectory;
  const safePrefix = sanitizePastedImageFilePrefix(preferences.fileNamePrefix);
  const existingPaths = new Set(listProjectEntries(project).map((entry) => normalizeWorkspacePath(entry.path)));
  const baseStamp = new Date().toISOString().replace(/[:.]/g, "-");
  let imagePath = joinWorkspacePath(folderPath, `${safePrefix}-${baseStamp}.${extension}`);
  let suffix = 2;

  while (existingPaths.has(imagePath)) {
    imagePath = joinWorkspacePath(folderPath, `${safePrefix}-${baseStamp}-${suffix}.${extension}`);
    suffix += 1;
  }

  return {
    folderPath,
    imagePath,
    referencePath: getWorkspaceRelativeReference(activePath, imagePath)
  };
}

function findDuplicatePastedImagePath(
  project: TyprProjectRepository,
  folderPath: string,
  extension: "png" | "jpg",
  bytes: Uint8Array
): string | null {
  const normalizedFolderPath = normalizeWorkspacePath(folderPath);
  const folderPrefix = normalizedFolderPath ? `${normalizedFolderPath}/` : "";
  const extensionSuffix = `.${extension}`;

  for (const entry of listProjectEntries(project)) {
    const normalizedPath = normalizeWorkspacePath(entry.path);

    if (
      entry.kind !== "file" ||
      !normalizedPath.startsWith(folderPrefix) ||
      normalizedPath.slice(folderPrefix.length).includes("/") ||
      !normalizedPath.toLowerCase().endsWith(extensionSuffix)
    ) {
      continue;
    }

    const existingBytes = readProjectFileBytes(project, normalizedPath);

    if (existingBytes && areBytesEqual(existingBytes, bytes)) {
      return normalizedPath;
    }
  }

  return null;
}


function sanitizePastedImageFilePrefix(prefix: string): string {
  const normalized = prefix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "pasted-image";
}

function getPastedImageNameStem(name: string, extension: "png" | "jpg"): string {
  const extensionSuffix = `.${extension}`;
  return name.endsWith(extensionSuffix) ? name.slice(0, -extensionSuffix.length) : name;
}

function normalizePastedImageRename(rawName: string): string | null {
  const normalized = rawName.trim();

  if (
    !normalized ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized === "." ||
    normalized === ".."
  ) {
    return null;
  }

  return normalized;
}

function readPastedImageNameAt(content: string, from: number): { name: string; to: number } | null {
  if (from < 0 || from >= content.length) {
    return null;
  }

  let to = from;
  while (to < content.length && !/["}\])>]/.test(content[to] ?? "")) {
    to += 1;
  }

  const name = content.slice(from, to);
  return name ? { name, to } : null;
}

function buildPastedImageInsertion(
  language: SourceLanguage,
  referencePath: string,
  preferences: AppSnapshot["preferences"]["pastedImages"]
): string {
  if (language === "latex") {
    return `${preferences.latexPrefix}${referencePath}${preferences.latexSuffix}`;
  }

  if (language === "markdown") {
    return `${preferences.markdownPrefix}${referencePath}${preferences.markdownSuffix}`;
  }

  return `${preferences.typstPrefix}${referencePath}${preferences.typstSuffix}`;
}

function writeDiagramSvgProjectFile(
  project: TyprProjectRepository,
  diagram: Pick<DiagramAsset, "id" | "name">,
  svgMarkup: string
): TyprProjectRepository {
  return writeProjectFile(
    ensureProjectFolder(project, DIAGRAM_DIRECTORY, {
      kind: "virtual",
      id: DIAGRAM_DIRECTORY
    }),
    getDiagramFilePath(diagram.name),
    svgMarkup,
    { kind: "diagram", id: diagram.id }
  );
}

function writeDiagramPdfProjectFile(
  project: TyprProjectRepository,
  diagram: Pick<DiagramAsset, "id" | "name">,
  pdfBytes: Uint8Array<ArrayBuffer>
): TyprProjectRepository {
  return writeProjectFile(
    ensureProjectFolder(project, DIAGRAM_DIRECTORY, {
      kind: "virtual",
      id: DIAGRAM_DIRECTORY
    }),
    getDiagramPdfFilePath(diagram.name),
    pdfBytes,
    { kind: "virtual", id: `diagram-pdf:${diagram.id}` }
  );
}

class TikzInsertionTargetChangedError extends Error {
  constructor() {
    super("The TikZ insertion target changed.");
    this.name = "TikzInsertionTargetChangedError";
  }
}

function waitForCompileIdle(
  compileInFlightRef: { readonly current: boolean },
  timeoutMs: number = 15_000
): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (!compileInFlightRef.current) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("The active Typst preview did not finish in time."));
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

export function App() {
  const [storedPanelLayout] = useState(readStoredPanelLayout);
  const [storedLeftPane] = useState(readStoredLeftPaneState);
  const menuStripRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const leftPaneScrollByPaneRef = useRef<Record<string, number>>(storedLeftPane.scrollByPane);
  const leftPaneScrollRestoreFrameRef = useRef<number | null>(null);
  const editorRef = useRef<TypstEditorHandle | null>(null);
  const pastedImageRenameBindingRef = useRef<PastedImageRenameBinding | null>(null);
  const previewPaneRef = useRef<HTMLElement | null>(null);
  const sidebarPaneRef = useRef<HTMLElement | null>(null);
  const shouldFocusEditorAfterVimToggleRef = useRef(false);
  const activeSourceTabRef = useRef<HTMLDivElement | null>(null);
  const activePreviewTabRef = useRef<HTMLDivElement | null>(null);
  const themeImportInputRef = useRef<HTMLInputElement | null>(null);
  const snippetImportInputRef = useRef<HTMLInputElement | null>(null);
  const projectImportInputRef = useRef<HTMLInputElement | null>(null);
  const documentUploadInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const filesSectionRef = useRef<HTMLElement | null>(null);
  const lastZoomPaneTargetRef = useRef<ZoomPaneTarget>("source");
  const pinchZoomStateRef = useRef<PinchZoomState | null>(null);
  const openMenuTimerRef = useRef<number | null>(null);
  const closeMenuTimerRef = useRef<number | null>(null);
  const previewPendingGTimerRef = useRef<number | null>(null);
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const panelResizePendingWidthRef = useRef<number | null>(null);
  const panelResizePendingRatioRef = useRef<number | null>(null);
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
  const themeRef = useRef<ThemeDefinition | null>(null);
  const editedSourcePathRef = useRef<string | null>(null);
  const handleCompileRef = useRef<() => void>(() => {});
  const handleFormatDocumentRef = useRef<() => void>(() => {});
  const handleNewFileShortcutRef = useRef<() => boolean>(() => false);
  const handleRenameFileShortcutRef = useRef<() => boolean>(() => false);
  const pendingLatexCompileProfileRef = useRef<LatexCompileProfile>(getLatexCompileProfile("pdftex-quick"));
  const compileOptionsMenuRef = useRef<HTMLDivElement | null>(null);
  const previewDownloadMenuRef = useRef<HTMLDivElement | null>(null);
  const activateWorkspaceTabRef = useRef<(direction: -1 | 1) => boolean>(() => false);
  const [, setActiveMenu] = useState<MenuLabel | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(
    () => storedLeftPane.activeSidebarTool === "settings"
  );
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [keybindingSearchQuery, setKeybindingSearchQuery] = useState("");
  const [previewDownloadMode, setPreviewDownloadMode] = useState<PreviewDownloadMode>("output");
  const [selectedLatexCompileProfileId, setSelectedLatexCompileProfileId] = useState<LatexCompileProfileId>("pdftex-quick");
  const [isCompileOptionsMenuOpen, setIsCompileOptionsMenuOpen] = useState(false);
  const [isPreviewDownloadMenuOpen, setIsPreviewDownloadMenuOpen] = useState(false);
  const [recentWorkspaceState, setRecentWorkspaceState] = useState(readRecentWorkspaceState);
  const [activeSidebarTool, setActiveSidebarTool] = useState<SidebarTool>(
    storedLeftPane.activeSidebarTool
  );
  const [diagramPaneMode, setDiagramPaneMode] = useState<DiagramPaneMode>("draw");
  const [selectedTikzPath, setSelectedTikzPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<TypstSearchQueryState>({
    search: "",
    replace: "",
    caseSensitive: false,
    regexp: false,
    wholeWord: false
  });
  const [matrixSettings, setMatrixSettings] = useState<MatrixSettings>(createInitialMatrixSettings);
  const [matrixPickerSize, setMatrixPickerSize] = useState<MatrixSize>({
    rows: MATRIX_SIZE_PICKER_INITIAL_ROWS,
    columns: MATRIX_SIZE_PICKER_INITIAL_COLUMNS
  });
  const [matrixSizePreview, setMatrixSizePreview] = useState<MatrixSize | null>(null);
  const [tableSettings, setTableSettings] = useState<TableSettings>(createInitialTableSettings);
  const [tableSizePreview, setTableSizePreview] = useState<MatrixSize | null>(null);
  const [tableSizeInput, setTableSizeInput] = useState({ rows: "3", columns: "3" });
  const [isTableSizePickerOpen, setIsTableSizePickerOpen] = useState(false);
  const [isTableBorderMenuOpen, setIsTableBorderMenuOpen] = useState(false);
  const [tableSelection, setTableSelection] = useState<TableSelection>({
    anchorRow: 0,
    anchorColumn: 0,
    focusRow: 0,
    focusColumn: 0
  });
  const [tableBorderPreset, setTableBorderPreset] = useState<TableBorderPreset>("outer");
  const [tableBorderStyle, setTableBorderStyle] = useState<TableStrokeStyle>("solid");
  const [tableBorderWeight, setTableBorderWeight] = useState<TableStrokeWeight>("thin");
  const [openToolbarMenu, setOpenToolbarMenu] = useState<"matrix" | "table" | null>(null);
  const [themeImportFeedback, setThemeImportFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [isPreviewPopupOpen, setIsPreviewPopupOpen] = useState(false);
  const [isPreviewDebugVisible, setIsPreviewDebugVisible] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isPaperView, setIsPaperView] = useState(false);
  const [recordingKeybindingId, setRecordingKeybindingId] =
    useState<KeybindingCommandId | null>(null);
  const [pendingKeybindingConflict, setPendingKeybindingConflict] =
    useState<PendingKeybindingConflict | null>(null);
  const settingsController = useSettingsSheetController({
    isOpen: isSettingsOpen,
    recordingKeybindingId
  });
  const settingsTab = settingsController.tab;
  const settingsSearchQuery = settingsController.searchQuery;
  const setSettingsTab = settingsController.handleTabChange;
  const saveCurrentSettingsScrollPosition = settingsController.saveCurrentScrollPosition;
  const setIsMobileSettingsNavOpen = settingsController.setIsMobileNavOpen;
  const [workspaceOpenFoldersByProject, setWorkspaceOpenFoldersByProject] =
    useState<WorkspaceOpenFolderStorage>(() => readStoredWorkspaceOpenFolders());
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeNode[]>([]);
  const [isTrashViewOpen, setIsTrashViewOpen] = useState(storedLeftPane.isTrashViewOpen);
  const [isFilesPaneFileDragActive, setIsFilesPaneFileDragActive] = useState(false);
  const {
    activePreviewPath,
    draggingWorkspaceTab,
    previewTabPaths,
    setActivePreviewPath,
    setDraggingWorkspaceTab,
    setPreviewTabPaths,
    setSourceTabPaths,
    setTransientSourceTabPath,
    setWorkspaceTabDropTarget,
    sourceTabPaths,
    transientSourceTabPath,
    workspaceTabDragRef,
    workspaceTabDropTarget
  } = useWorkspaceTabs();
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<WorkspaceContextMenuState | null>(null);
  const [renamingWorkspacePath, setRenamingWorkspacePath] = useState<string | null>(null);
  const [workspaceRenameDraft, setWorkspaceRenameDraft] = useState("");
  const [workspaceClipboard, setWorkspaceClipboard] = useState<WorkspaceClipboardState | null>(null);
  const [pendingWorkspaceDeletePath, setPendingWorkspaceDeletePath] = useState<string | null>(null);
  const [draggedWorkspacePath, setDraggedWorkspacePath] = useState<string | null>(null);
  const [workspaceDropTargetPath, setWorkspaceDropTargetPath] = useState<string | null>(null);
  const [collapsedOutlineEntries, setCollapsedOutlineEntries] = useState<Record<string, boolean>>(
    {}
  );
  const [currentEditorLineNumber, setCurrentEditorLineNumber] = useState(1);
  const [sourceEditorSelection, setSourceEditorSelection] = useState<TypstEditorSelection>({
    lineNumber: 1,
    from: 0,
    to: 0,
    head: 0
  });
  const [externalDiagnosticsState, setExternalDiagnosticsState] = useState<ExternalDiagnosticsState | null>(null);
  const [diagnosticProviderStatuses, setDiagnosticProviderStatuses] =
    useState<DiagnosticProviderStatus[]>(createInitialExternalDiagnosticStatuses);
  const [areHarperDiagnosticsActivated, setAreHarperDiagnosticsActivated] = useState(false);
  const [harperSelfTestResult, setHarperSelfTestResult] = useState("Not run yet.");
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
  const [liveBuildOutput, setLiveBuildOutput] = useState("");
  const appendCompilerStatusToLiveBuildOutput = useCallback((status: CompilerStatus) => {
    setLiveBuildOutput((currentOutput) => {
      const timestamp = new Date().toLocaleTimeString();
      const detail = status.detail ? ` — ${status.detail}` : "";
      const progress = status.progress ? ` (${status.progress.current}/${status.progress.total}${status.progress.label ? ` ${status.progress.label}` : ""})` : "";
      const nextLine = `[${timestamp}] ${status.label}${detail}${progress}`;
      return currentOutput ? `${currentOutput}
${nextLine}` : nextLine;
    });
  }, []);
  const {
    compiler,
    compilerStatus,
    setCompilerStatus,
    handleCompilerStatusChange,
    compileResult,
    setCompileResult,
    lastSuccessfulResult,
    setLastSuccessfulResult,
    compilePreviewsByPath,
    setCompilePreviewsByPath,
    isCompiling,
    setIsCompiling,
    compileTimerRef,
    compileFrameRef,
    compileRequestRef,
    pendingSourceRef,
    pendingSourcePathRef,
    activeSourcePathRef,
    activeSourceLanguageRef,
    isActiveSourceCompilableRef,
    previewSourceDraftRef,
    diagramAssetsRevisionRef,
    diagramAssetsRef,
    compileResultRef,
    readyTypstPreviewSignatureRef,
    compileInFlightRef,
    compileInFlightLanguageRef,
    compileInFlightSourceRef,
    compileInFlightSourcePathRef,
    compileInFlightDiagramRevisionRef,
    pendingCompileTriggerRef,
    isMountedRef,
    clearScheduledCompile,
    queueCompile: scheduleCompilePreview,
    hasActiveCompileWork: hasScheduledCompileWork,
    applyRestoredCompilePreview
  } = useCompilePreviewController<BuildLogTrigger>({
    initialTrigger: "auto",
    onCompilerStatusChange: appendCompilerStatusToLiveBuildOutput
  });
  const workspaceHoverExpandTimerRef = useRef<number | null>(null);
  const matrixCellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);
  const tableCellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);
  const tableSelectionPointerRef = useRef(false);
  const tableDragSelectionRef = useRef(false);
  const loadedEditableTableSignatureRef = useRef<string | null>(null);
  const handleSourceEditorSelectionChange = useCallback((selection: TypstEditorSelection) => {
    setCurrentEditorLineNumber(selection.lineNumber);
    setSourceEditorSelection(selection);
  }, []);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasHydrationError, setHasHydrationError] = useState(false);
  const [storageStatus, setStorageStatus] =
    useState<"idle" | "saving" | "saved" | "error">("idle");
  const {
    lifecyclePersistenceRef,
    persistencePayloadRef,
    projectStorage,
    selectedProjectRepository,
    selectedProjectRepositoryRef,
    setProjectRepository,
    setProjectStorage,
    setRawSnapshot,
    setSnapshot,
    snapshot
  } = useWorkspacePersistence({
    hasHydrationError,
    isHydrated,
    isMountedRef,
    setStorageStatus
  });
  const settingsFilesController = useSettingsFiles(
    snapshot,
    setSnapshot,
    isHydrated,
    projectStorage,
    setProjectStorage
  );
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [projectDragOverId, setProjectDragOverId] = useState<string | null>(null);
  const [managedProjectId, setManagedProjectId] = useState<string | null>(null);
  const previewZoomRef = useRef(previewZoom);
  const editorFontSizeRef = useRef(snapshot.preferences.editorFontSize);
  previewZoomRef.current = previewZoom;
  editorFontSizeRef.current = snapshot.preferences.editorFontSize;
  const [isErrorSettled, setIsErrorSettled] = useState(false);
  const setSyncFeedback = useCallback((feedback: SyncFeedback) => {
    setSyncStatusSnapshot({ ...feedback, progress: null });
  }, []);
  const {
    abortGitMerge: handleAbortGitMerge,
    activeMergeState,
    addGitProject: handleAddGitProject,
    commitGitChanges: handleCommitGitChanges,
    continueGitMerge: handleContinueGitMerge,
    createGitHubRepoPrivate,
    ensureGitProject: addDefaultGitManagedProject,
    editMergeResolution: handleEditMergeResolution,
    fetchRemote: runFetchRemote,
    filesGitConflictNotice,
    gitBranches,
    gitCommitHistory,
    gitCredentials,
    gitFileStatuses,
    gitHubClone,
    gitHubDiscovery,
    gitMergePaneMode,
    gitRefreshToken,
    gitWorkspace,
    gitWorkingTreeEntries,
    handleMergeVersionBodyScroll,
    isGitStatusLoading,
    isMergeFilePreviewLoading,
    isSyncing,
    localGitCommits,
    localRepoStatus,
    mergeCommitMessage,
    mergeFilePreview,
    mergeResolutionDrafts,
    mergeResolutionEditorValue,
    mergeVersionBodyRefs,
    remoteConfig,
    pullRemote: runPullRemote,
    pushRemote: runPushRemote,
    remoteGitService,
    removeSelectedGitProject: handleRemoveSelectedGitProject,
    repoBackend,
    selectedGitProject,
    selectedGitProjectIsGitHubConnected,
    selectedGitToken,
    selectedMergePath,
    selectedProjectGitConnectionLabel,
    setCreateGitHubRepoPrivate,
    setGitCredentials,
    setGitHubClone,
    setGitHubDiscovery,
    setGitMergePaneMode,
    setGitRefreshToken,
    setGitWorkspace,
    setIsSyncing,
    setLocalRepoBranches,
    setLocalRepoCommits,
    setLocalRepoStatus,
    setMergeCommitMessage,
    setSelectedMergePath,
    setUpstreamTracking,
    stageAllGitChanges: handleStageAllGitChanges,
    stageGitPaths: handleStageGitPaths,
    unstageGitPath: handleUnstageGitPath,
    syncRemote: runSyncRemote,
    unresolvedMergeConflictCount,
    useMergeVersion: handleUseMergeVersion,
    updateGitManagedProject,
    updateSelectedGitProject,
    upstreamTracking
  } = useGitPanelController({
    isGitPanelActive: activeSidebarTool === "sync",
    isHydrated,
    selectedProjectRepository,
    fallbackProjectId: snapshot.project.id,
    fallbackProjectName: snapshot.project.name,
    setProjectRepository,
    setSyncFeedback,
    setSyncStatusSnapshot
  });
  const localFolderSync = useLocalFolderSync({
    gitRefreshToken,
    isHydrated,
    projectStorage,
    setGitRefreshToken,
    setProjectStorage,
    setRawSnapshot
  });
  const selectedLocalFolderSyncState = selectedProjectRepository
    ? localFolderSync.states[selectedProjectRepository.id]
    : undefined;
  const googleDriveSync = useGoogleDriveSync({
    clientId: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? "",
    cloudProjectNumber:
      import.meta.env.VITE_GOOGLE_CLOUD_PROJECT_NUMBER ?? "",
    isHydrated,
    pickerApiKey: import.meta.env.VITE_GOOGLE_PICKER_API_KEY ?? "",
    projectStorage,
    setProjectStorage,
    setRawSnapshot
  });
  const selectedGoogleDriveSyncState = selectedProjectRepository
    ? googleDriveSync.states[selectedProjectRepository.id]
    : undefined;
  const handledImportedDriveProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    const importedProjectId = googleDriveSync.importedProjectId;
    if (
      !importedProjectId ||
      handledImportedDriveProjectIdRef.current === importedProjectId
    ) {
      return;
    }
    const importedProject = projectStorage.projects.find(
      (project) => project.id === importedProjectId
    );
    if (!importedProject) {
      return;
    }
    handledImportedDriveProjectIdRef.current = importedProjectId;
    setIsTrashViewOpen(false);
    setSelectedWorkspacePath(importedProject.selection.activeFilePath);
    setSelectedWorkspacePaths(
      importedProject.selection.activeFilePath
        ? [importedProject.selection.activeFilePath]
        : []
    );
    setWorkspaceSelectionAnchorPath(importedProject.selection.activeFilePath);
  }, [googleDriveSync.importedProjectId, projectStorage.projects]);
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
  const newFileShortcutLabel = formatKeybinding(
    keybindings.newFile,
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

  const applyPinchZoomScale = useCallback((
    pinchState: PinchZoomState,
    scale: number
  ): boolean => {
    if (!Number.isFinite(scale) || scale <= 0) {
      return false;
    }

    if (pinchState.pane === "preview") {
      const nextPercent = clampPreviewPinchPercent(pinchState.startPreviewPercent * scale);

      if (nextPercent !== pinchState.lastPreviewPercent) {
        pinchState.lastPreviewPercent = nextPercent;
        setPreviewZoom({ mode: "percent", percent: nextPercent });
      }

      return true;
    }

    const nextFontSize = clampEditorPinchFontSize(pinchState.startEditorFontSize * scale);

    if (nextFontSize !== pinchState.lastEditorFontSize) {
      pinchState.lastEditorFontSize = nextFontSize;
      setSnapshot((currentSnapshot) =>
        updateEditorFontSizePreference(currentSnapshot, nextFontSize)
      );
    }

    return true;
  }, [setSnapshot]);

  const beginPinchZoom = useCallback((event: TouchEvent): boolean => {
    const pane = resolvePinchZoomPaneTargetFromTouches(event);
    const distance = getTouchDistance(event.touches);

    if (!pane || distance === null || distance <= 0) {
      return false;
    }

    preventNativePinchZoom(event);
    lastZoomPaneTargetRef.current = pane;
    pinchZoomStateRef.current = {
      input: "touch",
      pane,
      startDistance: distance,
      startPreviewPercent: getPreviewZoomPercent(previewZoomRef.current),
      startEditorFontSize: editorFontSizeRef.current,
      lastPreviewPercent: getPreviewZoomPercent(previewZoomRef.current),
      lastEditorFontSize: editorFontSizeRef.current
    };

    return true;
  }, []);

  const updatePinchZoom = useCallback((event: TouchEvent): boolean => {
    const pinchState = pinchZoomStateRef.current;
    const distance = getTouchDistance(event.touches);

    if (
      !pinchState ||
      pinchState.input !== "touch" ||
      distance === null ||
      pinchState.startDistance <= 0
    ) {
      return false;
    }

    preventNativePinchZoom(event);
    return applyPinchZoomScale(pinchState, distance / pinchState.startDistance);
  }, [applyPinchZoomScale]);

  const endPinchZoom = useCallback((event: TouchEvent) => {
    if (
      event.touches.length < 2 &&
      pinchZoomStateRef.current?.input === "touch"
    ) {
      pinchZoomStateRef.current = null;
    }
  }, []);

  const beginGestureZoom = useCallback((event: Event): boolean => {
    const pane =
      resolvePinchZoomPaneTarget(event.target) ??
      pinchZoomStateRef.current?.pane;

    if (!pane) {
      return false;
    }

    preventNativePinchZoom(event);
    lastZoomPaneTargetRef.current = pane;
    pinchZoomStateRef.current = {
      input: "gesture",
      pane,
      startDistance: 1,
      startPreviewPercent: getPreviewZoomPercent(previewZoomRef.current),
      startEditorFontSize: editorFontSizeRef.current,
      lastPreviewPercent: getPreviewZoomPercent(previewZoomRef.current),
      lastEditorFontSize: editorFontSizeRef.current
    };
    return true;
  }, []);

  const updateGestureZoom = useCallback((event: Event): boolean => {
    const pinchState = pinchZoomStateRef.current;
    const scale = Number((event as Event & { scale?: number }).scale);

    if (!pinchState || pinchState.input !== "gesture") {
      return false;
    }

    preventNativePinchZoom(event);
    return applyPinchZoomScale(pinchState, scale);
  }, [applyPinchZoomScale]);

  const endGestureZoom = useCallback((event: Event) => {
    preventNativePinchZoom(event);

    if (pinchZoomStateRef.current?.input === "gesture") {
      pinchZoomStateRef.current = null;
    }
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
  const handleTypstMathPreviewToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateTypstMathPreviewPreference(
        currentSnapshot,
        !currentSnapshot.preferences.typstMathPreview
      )
    );
  }, []);
  const handlePastedImagesEnabledToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updatePastedImagePreference(currentSnapshot, {
        enabled: !currentSnapshot.preferences.pastedImages.enabled
      })
    );
  }, []);
  const handlePastedImageFormatChange = useCallback((format: "png" | "jpeg") => {
    setSnapshot((currentSnapshot) =>
      updatePastedImagePreference(currentSnapshot, { format })
    );
  }, []);
  const handleVimClipboardSharingToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateVimClipboardSharingPreference(
        currentSnapshot,
        !currentSnapshot.preferences.vimClipboardSharing
      )
    );
  }, []);
  const handlePastedImagePrefixChange = useCallback((fileNamePrefix: string) => {
    setSnapshot((currentSnapshot) =>
      updatePastedImagePreference(currentSnapshot, { fileNamePrefix })
    );
  }, []);
  const handlePastedImageDirectoryChange = useCallback((figuresDirectory: string) => {
    setSnapshot((currentSnapshot) =>
      updatePastedImagePreference(currentSnapshot, { figuresDirectory })
    );
  }, []);
  const handlePastedImageDirectoryAnchorToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updatePastedImagePreference(currentSnapshot, {
        figuresDirectoryRelativeToFile:
          !currentSnapshot.preferences.pastedImages.figuresDirectoryRelativeToFile
      })
    );
  }, []);
  const handlePastedImageWrapperChange = useCallback(
    (
      field:
        | "typstPrefix"
        | "typstSuffix"
        | "latexPrefix"
        | "latexSuffix"
        | "markdownPrefix"
        | "markdownSuffix",
      value: string
    ) => {
      setSnapshot((currentSnapshot) =>
        updatePastedImagePreference(currentSnapshot, { [field]: value })
      );
    },
    []
  );

  const handleRelativeLineNumbersToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateRelativeLineNumbersPreference(
        currentSnapshot,
        !currentSnapshot.preferences.relativeLineNumbers
      )
    );
  }, []);
  const handleColorfulFileTreeIconsToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateColorfulFileTreeIconsPreference(
        currentSnapshot,
        !currentSnapshot.preferences.colorfulFileTreeIcons
      )
    );
  }, []);
  const handleShowGitignoreInFileTreeToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateShowGitignoreInFileTreePreference(
        currentSnapshot,
        !currentSnapshot.preferences.showGitignoreInFileTree
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
  const handleExternalDiagnosticsChange = useCallback((
    update: (preferences: ExternalDiagnosticProviderPreferences) => ExternalDiagnosticProviderPreferences
  ) => {
    setSnapshot((currentSnapshot) =>
      updateExternalDiagnosticsPreference(
        currentSnapshot,
        update(currentSnapshot.preferences.externalDiagnostics)
      )
    );
  }, []);
  const handleHarperSelfTest = useCallback(() => {
    const testSource = "This sentense has a mispelled wurd.";
    setHarperSelfTestResult("Running Harper self-test...");

    void runExternalDiagnostics({
      source: testSource,
      path: "harper-self-test.txt",
      language: "text",
      preferences: {
        harper: { enabled: true },
        localLsp: { enabled: false, url: "" },
        remoteLsp: { enabled: false, url: "", allowDocumentUpload: false }
      }
    }).then((result) => {
      const harperStatus = result.statuses.find((status) => status.id === "harper");
      const firstDiagnostic = result.diagnostics[0];
      setHarperSelfTestResult(
        firstDiagnostic
          ? `${harperStatus?.phase ?? "ready"}: ${result.diagnostics.length} diagnostic${result.diagnostics.length === 1 ? "" : "s"}. ${firstDiagnostic.message}`
          : `${harperStatus?.phase ?? "ready"}: 0 diagnostics. ${harperStatus?.detail ?? "No detail."}`
      );
    }).catch((error) => {
      setHarperSelfTestResult(error instanceof Error ? `error: ${error.message}` : "error: Harper self-test failed.");
    });
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
    typeof activeDocument?.content === "string" ? activeDocument.content : "";
  const initialNewDocumentExtension =
    getPreferredNewDocumentExtension(activeDocument?.name) ?? DEFAULT_NEW_DOCUMENT_EXTENSION;
  const newDocumentDefaultsRef = useRef<{
    projectId: string;
    extension: PreferredNewDocumentExtension;
    parentPath: string | null;
  }>({
    projectId: snapshot.project.id,
    extension: initialNewDocumentExtension,
    parentPath: activeDocument ? getWorkspaceParentPath(activeDocument.name) : null
  });

  if (newDocumentDefaultsRef.current.projectId !== snapshot.project.id) {
    newDocumentDefaultsRef.current = {
      projectId: snapshot.project.id,
      extension: initialNewDocumentExtension,
      parentPath: activeDocument ? getWorkspaceParentPath(activeDocument.name) : null
    };
  }

  const rememberNewDocumentFile = useCallback((path: string) => {
    const normalizedPath = normalizeWorkspacePath(path);
    const preferredExtension = getPreferredNewDocumentExtension(normalizedPath);

    newDocumentDefaultsRef.current = {
      ...newDocumentDefaultsRef.current,
      extension: preferredExtension ?? newDocumentDefaultsRef.current.extension,
      parentPath: getWorkspaceParentPath(normalizedPath)
    };
  }, []);

  const rememberNewDocumentFolder = useCallback((path: string) => {
    newDocumentDefaultsRef.current = {
      ...newDocumentDefaultsRef.current,
      parentPath:
        path === WORKSPACE_ROOT_PATH ? null : normalizeWorkspacePath(path) || null
    };
  }, []);

  useEffect(() => {
    if (activeDocument) {
      rememberNewDocumentFile(activeDocument.name);
    }
  }, [activeDocument?.id, activeDocument?.name, rememberNewDocumentFile]);
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
  const trashWorkspaceTree = useMemo(
    () => buildWorkspaceTree(buildTrashWorkspaceEntries(snapshot.project.trash ?? [])),
    [snapshot.project.trash]
  );
  const visibleWorkspaceTree = useMemo(() => {
    if (isTrashViewOpen) {
      return trashWorkspaceTree;
    }

    return snapshot.preferences.showGitignoreInFileTree
      ? workspaceTree
      : filterGitignoreFromWorkspaceTree(workspaceTree);
  }, [isTrashViewOpen, snapshot.preferences.showGitignoreInFileTree, trashWorkspaceTree, workspaceTree]);
  const {
    selectedWorkspacePath,
    selectedWorkspacePaths,
    setSelectedWorkspacePath,
    setSelectedWorkspacePaths,
    workspaceSelectionAnchorPath,
    setWorkspaceSelectionAnchorPath
  } = useWorkspaceSelection({
    activeDocumentPath: activeDocument?.name ?? "",
    isTrashViewOpen,
    tree: visibleWorkspaceTree
  });
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

    if (selectedRow && filesSectionRef.current) {
      scrollElementWithin(filesSectionRef.current, selectedRow);
    }
  }, [activeSidebarTool, workspaceTreeCursorPath]);
  const sourceWorkspaceNode = isTrashViewOpen ? null : selectedWorkspaceNode;
  const workspaceStructureKey = selectedProjectRepository
    ? getProjectWorkspaceStructureKey(selectedProjectRepository)
    : getSnapshotWorkspaceStructureKey(snapshot);
  const sourceEditorValue = activeDocumentTextContent;
  const workspacePreviewFileCacheRef = useRef(new Map<string, WorkspacePreviewFile>());
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setOutlineSourceContent(activeDocumentTextContent);
    }, OUTLINE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [activeDocumentTextContent]);
  const [selectedWorkspacePreview, setSelectedWorkspacePreview] = useState<WorkspacePreviewFile | null>(null);
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
    activeDocument !== null &&
    (sourceWorkspaceNode === null ||
      (sourceWorkspaceNode.source.kind === "document" && isTextWorkspaceFile(sourceWorkspaceNode.path)));
  const activeSourcePath = sourceWorkspaceNode?.path ?? activeDocument?.name ?? "";
  const activeSourceLanguage = getSourceLanguage(activeSourcePath);
  const activeEditableTableMatch = useMemo(
    () => isSourceFileEditable
      ? findEditableTableAtCursor(sourceEditorValue, activeSourceLanguage, sourceEditorSelection.head)
      : null,
    [activeSourceLanguage, isSourceFileEditable, sourceEditorSelection.head, sourceEditorValue]
  );
  const activeEditableTableSignature = activeEditableTableMatch
    ? [
        activeSourcePath,
        activeEditableTableMatch.language,
        activeEditableTableMatch.from,
        activeEditableTableMatch.to,
        sourceEditorValue.slice(activeEditableTableMatch.from, activeEditableTableMatch.to)
      ].join("\u001f")
    : null;

  useEffect(() => {
    if (!activeEditableTableMatch || !activeEditableTableSignature) {
      loadedEditableTableSignatureRef.current = null;
      return;
    }

    if (loadedEditableTableSignatureRef.current === activeEditableTableSignature) {
      return;
    }

    loadedEditableTableSignatureRef.current = activeEditableTableSignature;
    setTableSettings(activeEditableTableMatch.settings);
    setTableSelection({
      anchorRow: 0,
      anchorColumn: 0,
      focusRow: 0,
      focusColumn: 0
    });
  }, [activeEditableTableMatch, activeEditableTableSignature]);

  const isActiveSourceCompilable = isCompilableSourceFile(activeSourcePath);
  const showSourceCompileButton =
    isSourceFileEditable &&
    isActiveSourceCompilable &&
    activeSourceLanguage !== "markdown";
  const normalizedActiveSourcePath = normalizeWorkspacePath(activeSourcePath);
  const activeProjectTabKey = selectedProjectRepository?.id ?? snapshot.project.id;
  const buildLogController = useBuildLogController({
    currentPath: activeSourcePath,
    projectKey: activeProjectTabKey
  });
  const buildLogEntries = buildLogController.entries;
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
  const activePreviewTextContent = resolvePreviewTextContent({
    activePreviewPath,
    activeSourceContent: sourceEditorValue,
    activeSourcePath: normalizedActiveSourcePath,
    isTextPreview: activePreviewPath ? isTextWorkspaceFile(activePreviewPath) : false,
    previewNode: activePreviewWorkspaceNode,
    project: selectedProjectRepository
  });
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
          mimeType,
          assets: collectMarkdownPreviewAssets(
            selectedProjectRepository,
            activePreviewWorkspaceNode.path,
            activePreviewTextContent
          )
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

      const projectBytes = selectedProjectRepository
        ? readProjectFileBytes(selectedProjectRepository, activePreviewWorkspaceNode.path)
        : null;
      const opfsBytes = projectBytes
        ? null
        : selectedProjectRepository
          ? await readWorkspaceFileFromOpfs(selectedProjectRepository.id, activePreviewWorkspaceNode.path)
          : null;
      const bytes = projectBytes ?? opfsBytes;

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
  const hasActiveCompileWork = hasScheduledCompileWork();
  const hasModalUpdateBlocker =
    isSettingsOpen ||
    isDocsOpen ||
    isPreviewPopupOpen ||
    pendingKeybindingConflict !== null ||
    recordingKeybindingId !== null ||
    workspaceContextMenu !== null ||
    renamingWorkspacePath !== null ||
    pendingWorkspaceDeletePath !== null ||
    openToolbarMenu !== null ||
    isTableSizePickerOpen ||
    isTableBorderMenuOpen ||
    isCompileOptionsMenuOpen ||
    isPreviewDownloadMenuOpen ||
    gitHubClone.isOpen ||
    activeMergeState !== null;
  const hasGitOperationInFlight =
    isSyncing ||
    isGitStatusLoading ||
    isMergeFilePreviewLoading ||
    gitHubDiscovery.status === "loading" ||
    gitHubClone.status === "loading";
  const hasPendingWorkspaceChanges =
    storageStatus !== "saved" ||
    (lifecyclePersistenceRef.current?.hasPendingChanges() ?? true);
  const isSafeToRestart =
    isHydrated &&
    !hasHydrationError &&
    !hasPendingWorkspaceChanges &&
    !isCompiling &&
    !hasActiveCompileWork &&
    !hasGitOperationInFlight &&
    !hasModalUpdateBlocker;
  const prepareWorkspaceForUpdate = useCallback(async () => {
    await lifecyclePersistenceRef.current?.persistNow();
  }, [lifecyclePersistenceRef]);

  useEffect(() => {
    updateManager.setRestartSafety({
      safe: isSafeToRestart,
      prepare: prepareWorkspaceForUpdate
    });
  }, [isSafeToRestart, prepareWorkspaceForUpdate]);

  const activePreviewIsCompileTarget = Boolean(
    activePreviewCompilePath &&
      activeCompileTargetPath &&
      activePreviewCompilePath === activeCompileTargetPath
  );
  const rawVisiblePreviewCompilerStatus = activePreviewPath
    ? activePreviewCompileState?.isCompiling && activePreviewIsCompileTarget && hasActiveCompileWork
      ? compilerStatus
      : activePreviewCompileState?.compilerStatus ??
        createIdleCompilerStatusForSource(activePreviewCompileSourcePath ?? activePreviewPath)
    : compilerStatus;
  const visiblePreviewIsCompiling = shouldShowCompileActivity({
    compilerStatus: rawVisiblePreviewCompilerStatus,
    hasActiveCompileWork,
    isActiveCompileTarget: activePreviewIsCompileTarget,
    isCompiling: Boolean(activePreviewCompileState?.isCompiling)
  });
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
  const visiblePreviewCompilerStatus =
    rawVisiblePreviewCompilerStatus.phase === "compiling" && !visiblePreviewIsCompiling
      ? activePreviewCompileSourcePath
        ? createIdleCompilerStatusForSource(activePreviewCompileSourcePath)
        : compilerStatus
      : rawVisiblePreviewCompilerStatus;
  const compiledLatexPdfPreviewPathSet = useMemo(
    () =>
      collectAvailableLatexPdfPreviewPaths(
        Object.entries(compilePreviewsByPath).map(([sourcePath, preview]) => ({
          sourcePath,
          result: preview.result,
          isCompiling: preview.isCompiling
        }))
      ),
    [compilePreviewsByPath]
  );
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

    const activate = options.activate ?? true;
    setPreviewTabPaths((currentPaths) =>
      openWorkspacePreviewTab(currentPaths, normalizedPath, activePreviewPath, activate).paths
    );

    if (activate) {
      setActivePreviewPath(normalizedPath);
    }

    setProjectRepository((project) => {
      const nextState = openWorkspacePreviewTab(
        project.editor.previewTabPaths,
        normalizedPath,
        project.editor.previewPath ?? activePreviewPath,
        activate
      );

      return {
        ...project,
        editor: {
          ...project.editor,
          previewPath: nextState.activePath,
          previewTabPaths: nextState.paths
        }
      };
    });
  }, [activePreviewPath, setProjectRepository]);
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
  useWorkspaceTabPersistence({
    activePreviewPath,
    activeProjectTabKey,
    isAvailablePreviewTabPath,
    isTrashViewOpen,
    previewTabPaths,
    selectedProjectRepository,
    setActivePreviewPath,
    setPreviewTabPaths,
    setProjectRepository,
    setSourceTabPaths,
    setTransientSourceTabPath,
    sourceTabPaths,
    transientSourceTabPath,
    workspaceFilePathSet
  });
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
    const transition = decideCompilePreviewTransition({
      type: "source-switched",
      hasScheduledCompileForSource: Boolean(
        normalizedSourcePath &&
          scheduledCompilePath === normalizedSourcePath &&
          (compileInFlightRef.current ||
            compileFrameRef.current !== null ||
            compileTimerRef.current !== null)
      ),
      isCompilable: isActiveSourceCompilable,
      language: activeSourceLanguage
    });

    if (transition.type !== "reset") {
      return;
    }

    clearScheduledCompile();

    compileRequestRef.current += 1;
    compileResultRef.current = null;
    readyTypstPreviewSignatureRef.current = null;
    setIsCompiling(false);
    setCompileResult(null);
    setLastSuccessfulResult(null);
    setCompilerStatus(transition.status);
  }, [
    activeSourceLanguage,
    activeSourcePath,
    clearScheduledCompile,
    isActiveSourceCompilable,
    isHydrated
  ]);
  const diagram = useMemo(
    () => snapshot.project.diagram ?? createDefaultDiagram(),
    [snapshot.project.diagram]
  );
  const tikzFigures = useMemo(
    () => collectTikzFigureFiles(selectedProjectRepository),
    [selectedProjectRepository]
  );
  const selectedTikzFigure = useMemo(
    () =>
      tikzFigures.find((figure) => figure.path === selectedTikzPath) ??
      tikzFigures[0] ??
      null,
    [selectedTikzPath, tikzFigures]
  );
  const savedFigures = useMemo(
    () => snapshot.project.figures ?? [],
    [snapshot.project.figures]
  );
  useEffect(() => {
    const nextPath = selectedTikzFigure?.path ?? null;
    if (nextPath !== selectedTikzPath) {
      setSelectedTikzPath(nextPath);
    }
  }, [selectedTikzFigure?.path, selectedTikzPath]);
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
  const diagramAssetsRevision = useMemo(
    () =>
      [diagram, ...savedFigures].map((asset) => `${asset.id}:${asset.updatedAt}`)
        .join("|"),
    [diagram, savedFigures]
  );
  const typstPreviewCacheSignature = useMemo(
    () =>
      createTypstPreviewCacheSignature({
        diagramAssetsRevision,
        isPaperView,
        projectUpdatedAt: selectedProjectRepository?.filesystem.updatedAt ?? snapshot.project.updatedAt,
        source: sourceEditorValue,
        sourcePath: activeSourcePath,
        theme
      }),
    [
      activeSourcePath,
      diagramAssetsRevision,
      isPaperView,
      selectedProjectRepository?.filesystem.updatedAt,
      snapshot.project.updatedAt,
      sourceEditorValue,
      theme
    ]
  );

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    if (
      !isHydrated ||
      activeSourceLanguage !== "typst" ||
      !isActiveSourceCompilable ||
      activePreviewPath !== normalizedActiveSourcePath ||
      !compileResult?.ok ||
      compileResultRef.current !== compileResult
    ) {
      return;
    }

    readyTypstPreviewSignatureRef.current = typstPreviewCacheSignature;
    saveTypstPreviewCacheResult({
      projectKey: activeProjectTabKey,
      result: compileResult,
      signature: typstPreviewCacheSignature,
      sourcePath: activeSourcePath
    });
  }, [
    activePreviewPath,
    activeProjectTabKey,
    activeSourceLanguage,
    activeSourcePath,
    compileResult,
    isActiveSourceCompilable,
    isHydrated,
    normalizedActiveSourcePath,
    typstPreviewCacheSignature
  ]);

  const appendBuildLogEntry = buildLogController.appendEntry;

  useEffect(() => {
    const hasScheduledCompile = hasScheduledCompileWork();

    if (!hasScheduledCompile) {
      if (isCompiling) {
        setIsCompiling(false);
      }

      setCompilePreviewsByPath((currentPreviews) => {
        let nextPreviews = currentPreviews;

        for (const [path, preview] of Object.entries(currentPreviews)) {
          if (!preview.isCompiling) {
            continue;
          }

          if (nextPreviews === currentPreviews) {
            nextPreviews = { ...currentPreviews };
          }

          nextPreviews[path] = {
            ...preview,
            compilerStatus:
              preview.compilerStatus.phase === "compiling"
                ? createIdleCompilerStatusForSource(path)
                : preview.compilerStatus,
            isCompiling: false
          };
        }

        return nextPreviews;
      });
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
  }, [
    compilerStatus,
    hasScheduledCompileWork,
    isCompiling,
    activeSourcePath,
    activePreviewPath
  ]);

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

    const transition = decideCompilePreviewTransition({
      type: "restore-requested",
      language: "latex",
      result: savedResult?.ok ? savedResult : null
    });

    if (transition.type !== "restore") {
      return;
    }

    applyRestoredCompilePreview({
      result: transition.result,
      sourcePaths: getCompilePreviewSourcePathsForResult(activeSourcePath, transition.result),
      statusLabel: transition.statusLabel
    });
  }, [
    applyRestoredCompilePreview,
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
    const repositoryEntries = currentProjectRepository
      ? buildProjectWorkspaceEntriesFromProject(currentProjectRepository).filter(
          (entry) => !isSettingsProject(currentProjectRepository) || entry.path !== SETTINGS_PROJECT_MARKER_PATH
        )
      : null;
    const fallbackTree = buildWorkspaceTree(
      repositoryEntries
        ? repositoryEntries
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
    if (
      !isHydrated ||
      !selectedProjectRepository ||
      activeSidebarTool !== "sync"
    ) {
      setRepoStorageStats(null);
      return;
    }

    void refreshRepoStorageStats(selectedProjectRepository);
  }, [
    activeSidebarTool,
    gitRefreshToken,
    isHydrated,
    refreshRepoStorageStats,
    selectedProjectRepository?.git.headRef,
    selectedProjectRepository?.id
  ]);

  useEffect(() => {
    diagramAssetsRef.current = diagramShadowAssets;
    diagramAssetsRevisionRef.current = diagramAssetsRevision;
  }, [diagramAssetsRevision, diagramShadowAssets]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    handleCompileRef.current();
  }, [diagramAssetsRevision, isHydrated]);

  useEffect(() => {
    return () => {
      if (workspaceHoverExpandTimerRef.current !== null) {
        window.clearTimeout(workspaceHoverExpandTimerRef.current);
      }
    };
  }, []);

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
        const [
          storedSnapshot,
          storedProjectStorage,
          storedGitWorkspace,
          storedGitHubConfig,
          storedGitCredentials,
          storedProjectDeletionTombstones
        ] = await Promise.all([
          loadSnapshot(),
          loadProjectStorage(),
          loadGitWorkspace(),
          loadGitHubConfig(),
          loadGitCredentialMap(),
          loadProjectDeletionTombstones()
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
        let nextProjectStorage = normalizeProjectStorageState(
          storedProjectStorage,
          nextSnapshot
        );
        if (storedProjectDeletionTombstones.length > 0) {
          const recovery = await retryProjectDeletions({
            dependencies: {
              deleteBrowserGitFiles: deleteProjectGitFiles,
              deleteCloudProjectBindings,
              deleteLocalFolderBinding,
              deleteTombstone: deleteProjectDeletionTombstone,
              removeOpfsProject: removeProjectFromOpfs,
              saveProjectStorage
            },
            fallbackProject: createEmptyProjectRepository({
              displayName: "Untitled project",
              defaultFileName: null
            }),
            storage: nextProjectStorage,
            tombstones: storedProjectDeletionTombstones
          });
          nextProjectStorage = recovery.storage;
          if (recovery.errors.length > 0) {
            console.warn("Project deletion cleanup remains pending.", recovery.errors);
          }
        }
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
        case "newFile":
          return handleNewFileShortcutRef.current();
        case "renameFile":
          return handleRenameFileShortcutRef.current();
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
      if (event.metaKey || event.deltaY === 0) {
        return;
      }

      const zoomPaneTarget = resolveZoomPaneTarget(event.target);

      if (!zoomPaneTarget) {
        return;
      }

      const isPreviewGesture =
        zoomPaneTarget === "preview" && (event.altKey || event.ctrlKey);
      const isPaneFontGesture =
        zoomPaneTarget !== "preview" && event.altKey && !event.ctrlKey;

      if (!isPreviewGesture && !isPaneFontGesture) {
        return;
      }

      event.preventDefault();
      lastZoomPaneTargetRef.current = zoomPaneTarget;

      if (zoomPaneTarget === "preview") {
        setPreviewZoom((currentZoom) =>
          zoomPreviewByWheel(currentZoom, event.deltaY, event.deltaMode)
        );
        return;
      }

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


  const focusSidebarPane = useCallback(() => {
    lastZoomPaneTargetRef.current = "sidebar";
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

      if (!compileOptionsMenuRef.current?.contains(event.target as Node)) {
        setIsCompileOptionsMenuOpen(false);
      }

      if (!previewDownloadMenuRef.current?.contains(event.target as Node)) {
        setIsPreviewDownloadMenuOpen(false);
      }
    }

    function handlePinchTouchStart(event: TouchEvent) {
      if (event.touches.length >= 2) {
        beginPinchZoom(event);
      }
    }

    function handlePinchTouchMove(event: TouchEvent) {
      if (pinchZoomStateRef.current) {
        if (event.touches.length >= 2) {
          preventNativePinchZoom(event);
        }
        updatePinchZoom(event);
        return;
      }

      if (event.touches.length >= 2 && beginPinchZoom(event)) {
        updatePinchZoom(event);
      }
    }

    function handlePinchTouchEnd(event: TouchEvent) {
      endPinchZoom(event);
    }

    function handleGestureStart(event: Event) {
      beginGestureZoom(event);
    }

    function handleGestureChange(event: Event) {
      if (
        pinchZoomStateRef.current?.input !== "gesture" &&
        !beginGestureZoom(event)
      ) {
        return;
      }

      updateGestureZoom(event);
    }

    function handleGestureEnd(event: Event) {
      endGestureZoom(event);
    }

    function handleVimShortcutCapture(event: KeyboardEvent) {
      if (event.defaultPrevented || recordingKeybindingId) {
        return;
      }

      for (const commandId of FILE_KEYBINDING_COMMAND_IDS) {
        if (
          matchesKeybinding(
            event,
            snapshot.preferences.keybindings[commandId],
            isAppleShortcutPlatform
          ) &&
          runAppKeybindingCommand(commandId)
        ) {
          event.preventDefault();
          return;
        }
      }

      if (isTypingTarget(event.target)) {
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

      const activeElement = document.activeElement;
      const activeZoomPaneTarget =
        resolveZoomPaneTarget(event.target) ??
        resolveZoomPaneTarget(activeElement) ??
        lastZoomPaneTargetRef.current;
      const activeVimPane: VimPaneFocusTarget = activeZoomPaneTarget === "sidebar"
        ? "sidebar"
        : activeZoomPaneTarget;

      const paneFocusDirection = getVimPaneFocusDirection(
        event,
        snapshot.preferences.keybindings,
        isAppleShortcutPlatform
      );

      if (paneFocusDirection !== null) {
        event.preventDefault();

        const panes: VimPaneFocusTarget[] = ["sidebar", "source", "preview"];
        const activePaneIndex = Math.max(0, panes.indexOf(activeVimPane));
        const nextPane =
          panes[Math.min(panes.length - 1, Math.max(0, activePaneIndex + paneFocusDirection))];


        if (nextPane === "sidebar") {
          focusSidebarPane();
          return;
        }

        if (nextPane === "source") {
          focusSourcePane();
          return;
        }

        focusPreviewPane();
        return;
      }

      if (
        activeVimPane === "sidebar" &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "j" || event.key === "J" || event.key === "k" || event.key === "K")
      ) {
        event.preventDefault();
        cycleSidebarTool(event.key.toLowerCase() === "j" ? 1 : -1, { focusSidebarPane: true });
        return;
      }

      if (!snapshot.preferences.vimMode) {
        return;
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
    window.addEventListener("touchstart", handlePinchTouchStart, { capture: true, passive: false });
    window.addEventListener("touchmove", handlePinchTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", handlePinchTouchEnd, { capture: true });
    window.addEventListener("touchcancel", handlePinchTouchEnd, { capture: true });
    window.addEventListener("gesturestart", handleGestureStart, { capture: true, passive: false });
    window.addEventListener("gesturechange", handleGestureChange, { capture: true, passive: false });
    window.addEventListener("gestureend", handleGestureEnd, { capture: true, passive: false });
    window.addEventListener("keydown", handleVimShortcutCapture, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleGlobalZoomWheel, { passive: false });
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePinchTouchStart, true);
      window.removeEventListener("touchmove", handlePinchTouchMove, true);
      window.removeEventListener("touchend", handlePinchTouchEnd, true);
      window.removeEventListener("touchcancel", handlePinchTouchEnd, true);
      window.removeEventListener("gesturestart", handleGestureStart, true);
      window.removeEventListener("gesturechange", handleGestureChange, true);
      window.removeEventListener("gestureend", handleGestureEnd, true);
      window.removeEventListener("keydown", handleVimShortcutCapture, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleGlobalZoomWheel);
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [
    adjustZoomPaneTarget,
    beginGestureZoom,
    beginPinchZoom,
    cancelPendingMenuClose,
    cancelPendingMenuOpen,
    activeSidebarTool,
    endGestureZoom,
    endPinchZoom,
    focusSidebarPane,
    focusPreviewPane,
    focusSourcePane,
    handleVimToggle,
    handleGlobalZoomWheel,
    isAppleShortcutPlatform,
    recordingKeybindingId,
    runAppKeybindingCommand,
    snapshot.preferences.vimMode,
    snapshot.preferences.keybindings,
    updateGestureZoom,
    updatePinchZoom,
    workspaceMode
  ]);


  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    document.documentElement.dataset.typrAppReady = "true";
    window.dispatchEvent(new Event("typr:app-ready"));
  }, [isHydrated]);

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
    async ({
      projectId,
      result,
      sourcePath
    }: {
      projectId: string;
      result: Extract<CompileResult, { ok: true }>;
      sourcePath: string;
    }): Promise<void> => {
      const currentPayload = persistencePayloadRef.current;
      const currentProject = getSelectedProjectRepository(currentPayload.projectStorage);

      if (!currentProject || currentProject.id !== projectId) {
        return;
      }

      const nextProject = writeGeneratedLatexPdfFile(currentProject, sourcePath, result);
      const nextProjectStorage = updateSelectedProjectRepository(
        currentPayload.projectStorage,
        () => nextProject
      );
      const nextSnapshot = {
        ...currentPayload.snapshot,
        project: projectRepositoryToLegacyProject(
          nextProject,
          currentPayload.snapshot.project
        )
      };
      const nextPayload = {
        snapshot: nextSnapshot,
        projectStorage: nextProjectStorage
      };

      persistencePayloadRef.current = nextPayload;
      selectedProjectRepositoryRef.current = nextProject;
      setProjectStorage(nextProjectStorage);
      setRawSnapshot(nextSnapshot);
      lifecyclePersistenceRef.current?.update(nextPayload);

      try {
        await lifecyclePersistenceRef.current?.persistNow();
      } catch {
        // Storage status already exposes the failure; keep the successful preview available.
      }
    },
    [
      lifecyclePersistenceRef,
      persistencePayloadRef,
      selectedProjectRepositoryRef,
      setProjectStorage,
      setRawSnapshot
    ]
  );

  const prepareForLatexCompile = useCallback(() =>
    prepareBrowserForLatexCompile({
      lowMemoryMode: shouldUseLowMemoryCompilerMode(),
      persistWorkspace: () => lifecyclePersistenceRef.current?.persistNow() ?? Promise.resolve(),
      releaseHarperMemory: releaseHarperDiagnosticsMemory,
      releaseTypstMemory: releaseTypstCompilerMemory,
      yieldToBrowser: () => new Promise<void>((resolve) => window.setTimeout(resolve, 250))
    }), [lifecyclePersistenceRef]);

  const runCompile = useCallback(async () => {
    const sourcePath = pendingSourcePathRef.current;

    if (compileInFlightRef.current || !isHydrated) {
      setCompilePreviewsByPath((currentPreviews) => {
        const sourcePathKey = normalizeWorkspacePath(sourcePath);
        const currentPreview = sourcePathKey ? currentPreviews[sourcePathKey] : null;

        if (!currentPreview?.isCompiling) {
          return currentPreviews;
        }

        return {
          ...currentPreviews,
          [sourcePathKey]: {
            ...currentPreview,
            compilerStatus: createIdleCompilerStatusForSource(sourcePathKey),
            isCompiling: false
          }
        };
      });
      setIsCompiling(false);
      return;
    }

    const source = pendingSourceRef.current;
    const sourceLanguage = getSourceLanguage(sourcePath);
    const diagramRevision = diagramAssetsRevisionRef.current;
    const diagramAssets = diagramAssetsRef.current;
    const requestId = compileRequestRef.current + 1;
    compileRequestRef.current = requestId;
    compileInFlightRef.current = true;
    compileInFlightLanguageRef.current = sourceLanguage;
    compileInFlightSourceRef.current = source;
    compileInFlightSourcePathRef.current = sourcePath;
    compileInFlightDiagramRevisionRef.current = diagramRevision;
    const requestedLatexCompileProfile = pendingLatexCompileProfileRef.current;
    const requestedLatexCompileMode = requestedLatexCompileProfile.mode;
    const compileStartedAtIso = new Date().toISOString();
    setLiveBuildOutput(`[${new Date(compileStartedAtIso).toLocaleTimeString()}] Starting ${formatSourceLanguageLabel(sourceLanguage)} compile for ${sourcePath}`);
    const compileStartedAt =
      typeof performance === "undefined" ? 0 : performance.now();
    const handleScopedCompilerStatusChange = (status: CompilerStatus) => {
      if (!isMountedRef.current || requestId !== compileRequestRef.current) {
        return;
      }

      handleCompilerStatusChange(status);
    };

    if (sourceLanguage === "latex") {
      await prepareForLatexCompile();
    }

    try {
      const compileAssets = sourceLanguage === "typst"
        ? [
            ...buildTypstProjectShadowFiles(
              selectedProjectRepositoryRef.current,
              sourcePath,
              source
            ),
            ...diagramAssets
          ]
        : [...diagramAssets];
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

          if (requestedLatexCompileMode === "quick" && savedResult) {
            result = savedResult;
            compileUsedCachedOutput = true;
          } else {
            result = await compileLatexDocument({
              mainFilePath: sourcePath,
              source,
              project,
              assets: compileAssets,
              compileMode: requestedLatexCompileMode,
              compileDriver: requestedLatexCompileProfile.driver,
              onStatusChange: handleScopedCompilerStatusChange
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
        result = await compiler.compileDocument(source, compileAssets, {
          mainFilePath: sourcePath
        });
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
        const persistGeneratedPdf = saveGeneratedLatexPdfToProject(generatedLatexPdf);

        if (generatedLatexPdf.activatePreview) {
          openPreviewTab(
            getLatexPdfOutputPath(
              getLatexPdfSourcePathForResult(generatedLatexPdf.sourcePath, generatedLatexPdf.result)
            ),
            { activate: true }
          );
        }

        await persistGeneratedPdf;
      }

      const compileDurationMs =
        typeof performance === "undefined"
          ? 0
          : performance.now() - compileStartedAt;
      const currentCompileResult = compileResultRef.current;
      const compileResolution = resolveCompileResultCompletion(
        currentCompileResult,
        result
      );
      const nextResult = compileResolution.diagnosticResult;
      const changedPreview = compileResolution.outputChanged;

      if (nextResult !== currentCompileResult) {
        setCompileResult(nextResult);
      }

      if (nextResult.ok) {
        setLastSuccessfulResult(nextResult);
      }

      setCompilePreviewsByPath((currentPreviews) => {
        const sourcePathKeys = getCompilePreviewSourcePathsForResult(sourcePath, result);
        const nextPreviews = { ...currentPreviews };

        for (const sourcePathKey of sourcePathKeys) {
          const currentPreview = currentPreviews[sourcePathKey] ?? createCompilePreviewState(sourcePathKey);
          const previewResult = resolveCompileResultCompletion(
            currentPreview.result,
            result
          ).previewResult;
          const nextCompilerStatus = createCompletedPreviewCompilerStatus(
            result,
            currentPreview.compilerStatus
          );

          nextPreviews[sourcePathKey] = {
            ...currentPreview,
            result: previewResult,
            lastSuccessfulResult: previewResult.ok
              ? previewResult
              : currentPreview.lastSuccessfulResult,
            compilerStatus: nextCompilerStatus,
            isCompiling: false
          };
        }

        return nextPreviews;
      });

      setCompilerStatus((currentStatus) =>
        createCompletedPreviewCompilerStatus(result, currentStatus)
      );

      logCompileTiming({
        durationMs: compileDurationMs,
        changed: changedPreview,
        ok: result.ok,
        diagnosticsCount: compileResolution.buildLog.diagnostics.length,
        metadata: compileResolution.buildLog.metadata
      });
      appendBuildLogEntry({
        sourcePath,
        language: sourceLanguage,
        engine: result.engine,
        ok: result.ok,
        startedAt: compileStartedAtIso,
        durationMs: compileDurationMs,
        diagnostics: compileResolution.buildLog.diagnostics,
        metadata: compileResolution.buildLog.metadata,
        trigger: pendingCompileTriggerRef.current,
        compileMode: sourceLanguage === "latex" ? requestedLatexCompileMode : "none",
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
        compileMode: sourceLanguage === "latex" ? requestedLatexCompileMode : "none",
        cached: false,
        outputChanged: false,
        rawLog: sourceLanguage === "latex" ? failedResult.output?.content : undefined,
        packageDetails: sourceLanguage === "latex" ? extractBuildLogPackageDetails(failedResult.output?.content ?? "") : [],
        shellEscapeUnavailable: sourceLanguage === "latex" && hasShellEscapeConstraint(failedResult.output?.content ?? "")
      });
    } finally {
      if (sourceLanguage === "latex" && shouldUseLowMemoryCompilerMode()) {
        releaseLatexCompilerMemory();
      }

      compileInFlightRef.current = false;
      compileInFlightLanguageRef.current = null;
      compileInFlightSourceRef.current = "";
      compileInFlightSourcePathRef.current = "";
      compileInFlightDiagramRevisionRef.current = "";
      pendingLatexCompileProfileRef.current = getLatexCompileProfile("pdftex-quick");

      if (!isMountedRef.current) {
        return;
      }

      const completionTransition = decideCompilePreviewTransition({
        type: "compile-completed",
        completed: {
          diagramRevision,
          source,
          sourcePath
        },
        pending: {
          diagramRevision: diagramAssetsRevisionRef.current,
          source: pendingSourceRef.current,
          sourcePath: pendingSourcePathRef.current
        }
      });

      if (completionTransition.type === "schedule") {
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
  }, [
    appendBuildLogEntry,
    compiler,
    isHydrated,
    openPreviewTab,
    prepareForLatexCompile,
    saveGeneratedLatexPdfToProject
  ]);

  const queueCompile = useCallback((debounced: boolean) => {
    const sourcePath = activeSourcePathRef.current;
    const sourceLanguage = getSourceLanguage(sourcePath);
    const source =
      sourceLanguage === "typst"
        ? createThemedPreviewSource(
            previewSourceDraftRef.current,
            themeRef.current ?? theme,
            isPaperView
          )
        : previewSourceDraftRef.current;

    scheduleCompilePreview({
      debounceMs: COMPILE_DEBOUNCE_MS,
      debounced,
      diagramRevision: diagramAssetsRevisionRef.current,
      runCompile,
      source,
      sourcePath
    });
  }, [
    isPaperView,
    runCompile,
    scheduleCompilePreview,
    theme
  ]);

  const formatActiveSource = useCallback((reason: "compile" | "manual") => {
    if (!isSourceFileEditable) {
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

    const formatterLabel = formatEditorFormatterLabel(formatter);
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
        detail: `${formatterLabel} updated ${sourcePath}`
      });
    } else if (reason === "manual") {
      setCompilerStatus({
        phase: "ready",
        mode: "worker",
        label: "Source already formatted",
        detail: `${formatterLabel} made no changes to ${sourcePath}`
      });
    }

    return result.source;
  }, [
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

  const performManualCompile = useCallback((profileId: LatexCompileProfileId = selectedLatexCompileProfileId) => {
    const sourcePath = activeSourcePathRef.current;
    const sourceLanguage = getSourceLanguage(sourcePath);
    const selectedProfile = getLatexCompileProfile(profileId);
    const effectiveLatexMode = sourceLanguage === "latex" ? selectedProfile.mode : "quick";
    pendingLatexCompileProfileRef.current = sourceLanguage === "latex" ? selectedProfile : getLatexCompileProfile("pdftex-quick");
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
      setIsCompileOptionsMenuOpen(false);
      return;
    }

    const savedResult =
      sourceLanguage === "latex" && selectedProjectRepository
        ? loadSavedLatexPdfCompileResult({
            allowStale: false,
            project: selectedProjectRepository,
            source: nextSource,
            sourcePath
          })
        : null;
    const manualTransition = decideCompilePreviewTransition({
      type: "manual-compile-requested",
      language: sourceLanguage,
      latexMode: effectiveLatexMode,
      result: savedResult?.ok ? savedResult : null
    });

    if (manualTransition.type === "restore") {
      openCompilePreviewTab(
        getLatexPdfOutputPath(
          getLatexPdfSourcePathForResult(sourcePath, manualTransition.result)
        ),
        { forceActivate: true }
      );
      clearScheduledCompile();

      if (compileInFlightRef.current && compileInFlightLanguageRef.current === "latex") {
        compileRequestRef.current += 1;
        cancelLatexCompile("LaTeX compile was skipped because a matching PDF already exists.");
      }

      applyRestoredCompilePreview({
        result: manualTransition.result,
        sourcePaths: getCompilePreviewSourcePathsForResult(sourcePath, manualTransition.result),
        statusLabel: manualTransition.statusLabel
      });
      setIsCompileOptionsMenuOpen(false);
      appendBuildLogEntry({
        sourcePath,
        language: "latex",
        engine: manualTransition.result.engine,
        ok: true,
        startedAt: new Date().toISOString(),
        durationMs: 0,
        diagnostics: manualTransition.result.diagnostics,
        metadata: manualTransition.result.metadata,
        trigger: "manual",
        compileMode: effectiveLatexMode,
        cached: true,
        outputChanged: false,
        rawLog: manualTransition.result.output.content,
        packageDetails: extractBuildLogPackageDetails(manualTransition.result.output.content),
        shellEscapeUnavailable: hasShellEscapeConstraint(manualTransition.result.output.content)
      });
      return;
    }
    if (manualTransition.type !== "schedule") {
      return;
    }

    if (sourceLanguage === "latex") {
      openCompilePreviewTab(getLatexPdfOutputPath(sourcePath), { forceActivate: true });
    } else if (sourceLanguage === "typst") {
      openCompilePreviewTab(sourcePath, { forceActivate: true });
    } else {
      openCompilePreviewTab(sourcePath);
    }

    setIsCompileOptionsMenuOpen(false);
    pendingCompileTriggerRef.current = "manual";
    queueCompile(manualTransition.debounced);
  }, [
    activePreviewPath,
    applyRestoredCompilePreview,
    appendBuildLogEntry,
    clearScheduledCompile,
    formatActiveSourceForCompile,
    openPreviewTab,
    queueCompile,
    selectedLatexCompileProfileId,
    selectedProjectRepository
  ]);

  const handleCompile = useCallback(
    (profileId: LatexCompileProfileId = selectedLatexCompileProfileId) => {
      const projectId = selectedProjectRepositoryRef.current?.id;
      if (!projectId) {
        performManualCompile(profileId);
        return;
      }

      void Promise.all([
        localFolderSync.syncOnCompile(projectId),
        googleDriveSync.syncOnCompile(projectId)
      ])
        .then(() => performManualCompile(profileId));
    },
    [
      googleDriveSync.syncOnCompile,
      localFolderSync.syncOnCompile,
      performManualCompile,
      selectedLatexCompileProfileId
    ]
  );

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
      compileResultRef.current = null;
      readyTypstPreviewSignatureRef.current = null;
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

    if (compileResult === null) {
      const transition = decideCompilePreviewTransition({
        type: "restore-requested",
        language: "typst",
        result: loadTypstPreviewCacheResult({
          projectKey: activeProjectTabKey,
          signature: typstPreviewCacheSignature,
          sourcePath: activeSourcePath
        })
      });

      if (transition.type === "restore") {
        applyRestoredCompilePreview({
          result: transition.result,
          sourcePaths: [normalizedActiveSourcePath],
          statusLabel: transition.statusLabel,
          typstSignature: typstPreviewCacheSignature
        });
        return;
      }

      if (transition.type === "schedule") {
        pendingCompileTriggerRef.current = "auto";
        queueCompile(transition.debounced);
        return;
      }
    }

    const hasReadyTypstPreviewForCurrentSource = Boolean(
      compileResultRef.current?.ok &&
        readyTypstPreviewSignatureRef.current === typstPreviewCacheSignature
    );

    if (hasReadyTypstPreviewForCurrentSource) {
      return;
    }

    if (editedSourcePathRef.current !== normalizedActiveSourcePath) {
      return;
    }

    if (compileResult === null || snapshot.preferences.liveCompilation) {
      pendingCompileTriggerRef.current = "auto";
      queueCompile(compileResult !== null);
    }
  }, [
    activePreviewPath,
    applyRestoredCompilePreview,
    activeProjectTabKey,
    activeSourceLanguage,
    activeSourcePath,
    clearScheduledCompile,
    sourceEditorValue,
    diagramAssetsRevision,
    compileResult,
    isHydrated,
    isActiveSourceCompilable,
    normalizedActiveSourcePath,
    queueCompile,
    snapshot.preferences.liveCompilation,
    typstPreviewCacheSignature
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

    if (
      compileResultRef.current.ok &&
      readyTypstPreviewSignatureRef.current === typstPreviewCacheSignature
    ) {
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
    theme,
    typstPreviewCacheSignature
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
    setAreHarperDiagnosticsActivated(true);
    editedSourcePathRef.current = normalizeWorkspacePath(activeSourcePath);
    const pastedImageBinding = pastedImageRenameBindingRef.current;

    if (pastedImageBinding && pastedImageBinding.sourcePath === activeSourcePath) {
      const editedName = readPastedImageNameAt(content, pastedImageBinding.nameFrom);
      const nextName = editedName ? normalizePastedImageRename(editedName.name) : null;

      if (editedName) {
        pastedImageRenameBindingRef.current = {
          ...pastedImageBinding,
          imagePath: nextName
            ? joinWorkspacePath(pastedImageBinding.folderPath, nextName)
            : pastedImageBinding.imagePath,
          nameTo: editedName.to
        };
      } else {
        pastedImageRenameBindingRef.current = null;
      }
    }

    setSnapshot((currentSnapshot) => updateActiveDocument(currentSnapshot, content));
  }, [activeSourcePath]);

  const commitPastedImageRename = useCallback(() => {
    const pastedImageBinding = pastedImageRenameBindingRef.current;

    if (!pastedImageBinding || pastedImageBinding.sourcePath !== activeSourcePath) {
      pastedImageRenameBindingRef.current = null;
      return null;
    }

    const nextName = normalizePastedImageRename(getWorkspaceBaseName(pastedImageBinding.imagePath));

    if (!nextName) {
      pastedImageRenameBindingRef.current = null;
      return null;
    }

    const nextImagePath = joinWorkspacePath(pastedImageBinding.folderPath, nextName);

    if (nextImagePath !== pastedImageBinding.originalImagePath) {
      const currentProject = selectedProjectRepositoryRef.current;
      const pathExists = currentProject
        ? listProjectEntries(currentProject).some(
            (entry) => entry.path === nextImagePath && entry.path !== pastedImageBinding.originalImagePath
          )
        : true;

      if (!pathExists) {
        setProjectRepository((project) =>
          renameProjectPath(project, pastedImageBinding.originalImagePath, nextImagePath)
        );
      }
    }

    pastedImageRenameBindingRef.current = null;
    return {
      ...pastedImageBinding,
      originalImagePath: nextImagePath,
      imagePath: nextImagePath
    };
  }, [activeSourcePath, setProjectRepository]);

  const handlePastedImageRenameKey = useCallback((event: KeyboardEvent, selection: { from: number; to: number }) => {
    const pastedImageBinding = pastedImageRenameBindingRef.current;

    if (!pastedImageBinding || pastedImageBinding.sourcePath !== activeSourcePath) {
      return null;
    }

    if (
      (event.key === "Tab" || event.key === "Enter") &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const committedBinding = commitPastedImageRename();
      return committedBinding ? { move: "lineEnd" as const } : null;
    }

    if (event.key === "ArrowLeft" && selection.from <= pastedImageBinding.nameFrom) {
      commitPastedImageRename();
      return { position: Math.max(0, pastedImageBinding.nameFrom - 1) };
    }

    if (event.key === "ArrowRight" && selection.to >= pastedImageBinding.nameTo) {
      commitPastedImageRename();
      return { position: pastedImageBinding.nameTo };
    }

    return null;
  }, [activeSourcePath, commitPastedImageRename]);

  const handleInsertEditorText = useCallback((text: string) => {
    editorRef.current?.insertText(text);
  }, []);

  const handleInsertEditorTemplate = useCallback((template: string) => {
    editorRef.current?.insertTemplate(template);
  }, []);

  const handleMatrixSizePreview = useCallback((rows: number, columns: number) => {
    setMatrixSizePreview({ rows, columns });
    setMatrixPickerSize((current) => ({
      rows:
        rows >= current.rows
          ? Math.min(MATRIX_MAX_ROWS, current.rows + 1)
          : current.rows,
      columns:
        columns >= current.columns
          ? Math.min(MATRIX_MAX_COLUMNS, current.columns + 1)
          : current.columns
    }));
  }, []);

  const handleMatrixSizeSelect = useCallback((rows: number, columns: number) => {
    setMatrixSettings((current) => resizeMatrixSettings(current, rows, columns));
    setMatrixSizePreview(null);
  }, []);

  const handleMatrixCellChange = useCallback(
    (rowIndex: number, columnIndex: number, value: string) => {
      setMatrixSettings((current) => updateMatrixCell(current, rowIndex, columnIndex, value));
    },
    []
  );

  const focusMatrixCell = useCallback((rowIndex: number, columnIndex: number) => {
    window.requestAnimationFrame(() => {
      const cell = matrixCellRefs.current[rowIndex]?.[columnIndex];

      if (!cell) {
        return;
      }

      cell.focus();
      cell.select();
    });
  }, []);

  const handleMatrixCellKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      let nextRow = rowIndex;
      let nextColumn = columnIndex;

      switch (event.key) {
        case "ArrowLeft":
          nextColumn = Math.max(0, columnIndex - 1);
          break;
        case "ArrowRight":
          nextColumn = Math.min(matrixSettings.columns - 1, columnIndex + 1);
          break;
        case "ArrowUp":
          nextRow = Math.max(0, rowIndex - 1);
          break;
        case "ArrowDown":
          nextRow = Math.min(matrixSettings.rows - 1, rowIndex + 1);
          break;
        case "Tab": {
          const offset = event.shiftKey ? -1 : 1;
          const currentIndex = rowIndex * matrixSettings.columns + columnIndex;
          const nextIndex = Math.max(
            0,
            Math.min(matrixSettings.rows * matrixSettings.columns - 1, currentIndex + offset)
          );

          nextRow = Math.floor(nextIndex / matrixSettings.columns);
          nextColumn = nextIndex % matrixSettings.columns;
          break;
        }
        case "Enter":
          nextRow = event.shiftKey
            ? Math.max(0, rowIndex - 1)
            : Math.min(matrixSettings.rows - 1, rowIndex + 1);
          break;
        default:
          return;
      }

      event.preventDefault();
      focusMatrixCell(nextRow, nextColumn);
    },
    [focusMatrixCell, matrixSettings.columns, matrixSettings.rows]
  );

  const handleInsertMatrix = useCallback(() => {
    const template = buildMatrixTemplate(matrixSettings, activeSourceLanguage);

    if (activeSourceLanguage === "latex") {
      editorRef.current?.insertLatexTemplateWithPackages(template, ["amsmath"]);
      return;
    }

    if (activeSourceLanguage === "typst") {
      editorRef.current?.insertMathTemplate(template);
      return;
    }

    handleInsertEditorTemplate(template);
  }, [activeSourceLanguage, handleInsertEditorTemplate, matrixSettings]);

  const handleTableSizePreview = useCallback((rows: number, columns: number) => {
    setTableSizePreview({ rows, columns });
  }, []);

  const handleTableSizeSelect = useCallback((rows: number, columns: number) => {
    setTableSettings((current) => resizeTableSettings(current, rows, columns));
    setTableSelection((current) =>
      clampTableSelection(current, {
        ...tableSettings,
        rows,
        columns
      })
    );
    setTableSizePreview(null);
    setIsTableSizePickerOpen(false);
  }, [tableSettings]);

  const handleTableSizeInputChange = useCallback(
    (dimension: "rows" | "columns", value: string) => {
      setTableSizeInput((current) => ({
        ...current,
        [dimension]: value
      }));

      const parsedValue = Number.parseInt(value, 10);

      if (!Number.isFinite(parsedValue)) {
        return;
      }

      const rows = clampMatrixDimension(
        dimension === "rows" ? parsedValue : tableSettings.rows,
        TABLE_MIN_ROWS,
        TABLE_MAX_ROWS
      );
      const columns = clampMatrixDimension(
        dimension === "columns" ? parsedValue : tableSettings.columns,
        TABLE_MIN_COLUMNS,
        TABLE_MAX_COLUMNS
      );

      setTableSettings((current) => resizeTableSettings(current, rows, columns));
      setTableSelection((current) =>
        clampTableSelection(current, {
          ...tableSettings,
          rows,
          columns
        })
      );
      setTableSizePreview(null);
    },
    [tableSettings]
  );

  const handleTableSizeInputBlur = useCallback(() => {
    setTableSizeInput({
      rows: String(tableSettings.rows),
      columns: String(tableSettings.columns)
    });
  }, [tableSettings.columns, tableSettings.rows]);

  const handleTableCellChange = useCallback(
    (rowIndex: number, columnIndex: number, value: string) => {
      setTableSettings((current) => updateTableCell(current, rowIndex, columnIndex, value));
    },
    []
  );

  const handleTableCellPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
      if (event.button !== 0) {
        return;
      }

      setIsTableSizePickerOpen(false);
      setIsTableBorderMenuOpen(false);
      setTableSizePreview(null);
      tableSelectionPointerRef.current = true;
      tableDragSelectionRef.current = true;

      if (event.shiftKey) {
        setTableSelection((current) => ({
          ...current,
          focusRow: rowIndex,
          focusColumn: columnIndex
        }));
      } else {
        setTableSelection({
          anchorRow: rowIndex,
          anchorColumn: columnIndex,
          focusRow: rowIndex,
          focusColumn: columnIndex
        });
      }

      window.requestAnimationFrame(() => {
        event.currentTarget.focus();
        event.currentTarget.select();
      });
    },
    []
  );

  const handleTableCellPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
      if (!tableDragSelectionRef.current) {
        return;
      }

      if ((event.buttons & 1) === 0) {
        tableDragSelectionRef.current = false;
        return;
      }

      tableSelectionPointerRef.current = true;
      setTableSelection((current) => ({
        ...current,
        focusRow: rowIndex,
        focusColumn: columnIndex
      }));
    },
    []
  );

  const handleTableGridPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tableDragSelectionRef.current) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      tableDragSelectionRef.current = false;
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cell = target instanceof HTMLElement
      ? target.closest<HTMLInputElement>("[data-table-row][data-table-column]")
      : null;

    if (!cell || !event.currentTarget.contains(cell)) {
      return;
    }

    const rowIndex = Number.parseInt(cell.dataset.tableRow ?? "", 10);
    const columnIndex = Number.parseInt(cell.dataset.tableColumn ?? "", 10);

    if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) {
      return;
    }

    tableSelectionPointerRef.current = true;
    setTableSelection((current) => {
      if (current.focusRow === rowIndex && current.focusColumn === columnIndex) {
        return current;
      }

      return {
        ...current,
        focusRow: rowIndex,
        focusColumn: columnIndex
      };
    });
  }, []);

  const handleTableCellFocus = useCallback((rowIndex: number, columnIndex: number) => {
    setIsTableSizePickerOpen(false);
    setIsTableBorderMenuOpen(false);
    setTableSizePreview(null);

    if (tableSelectionPointerRef.current) {
      tableSelectionPointerRef.current = false;
      return;
    }

    setTableSelection({
      anchorRow: rowIndex,
      anchorColumn: columnIndex,
      focusRow: rowIndex,
      focusColumn: columnIndex
    });
  }, []);

  useEffect(() => {
    const stopTableDragSelection = () => {
      tableDragSelectionRef.current = false;
    };

    window.addEventListener("pointerup", stopTableDragSelection);
    window.addEventListener("pointercancel", stopTableDragSelection);

    return () => {
      window.removeEventListener("pointerup", stopTableDragSelection);
      window.removeEventListener("pointercancel", stopTableDragSelection);
    };
  }, []);

  const handleTableFormatChange = useCallback(
    (patch: TableCellFormat) => {
      setTableSettings((current) => updateTableFormatForScope(current, "cell", tableSelection, patch));
    },
    [tableSelection]
  );

  const handleMergeTableSelection = useCallback(() => {
    setTableSettings((current) => mergeSelectedTableCells(current, tableSelection));
  }, [tableSelection]);

  const handleUnmergeTableSelection = useCallback(() => {
    setTableSettings((current) => unmergeSelectedTableCells(current, tableSelection));
  }, [tableSelection]);

  const handleApplyTableBorder = useCallback(() => {
    const supportedStyles = getSupportedTableStrokeStyles(activeSourceLanguage);

    if (supportedStyles.length === 0) {
      return;
    }

    const strokeStyle = tableBorderPreset === "clear"
      ? "none"
      : supportedStyles.includes(tableBorderStyle)
        ? tableBorderStyle
        : supportedStyles.includes("solid")
          ? "solid"
          : supportedStyles[0];

    setTableSettings((current) =>
      updateTableBordersForSelection(current, tableSelection, tableBorderPreset, {
        strokeStyle,
        strokeWeight: tableBorderWeight
      })
    );
  }, [activeSourceLanguage, tableBorderPreset, tableBorderStyle, tableBorderWeight, tableSelection]);

  const focusNextTableCell = useCallback(
    (rowIndex: number, columnIndex: number, extendSelection: boolean) => {
      const nextSelection = extendSelection
        ? (current: TableSelection) => ({
            ...current,
            focusRow: rowIndex,
            focusColumn: columnIndex
          })
        : () => ({
            anchorRow: rowIndex,
            anchorColumn: columnIndex,
            focusRow: rowIndex,
            focusColumn: columnIndex
          });

      setTableSelection(nextSelection);
      window.requestAnimationFrame(() => {
        const cell = tableCellRefs.current[rowIndex]?.[columnIndex];

        if (!cell) {
          return;
        }

        cell.focus();
        cell.select();
      });
    },
    []
  );

  const handleTableCellKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      let nextRow = rowIndex;
      let nextColumn = columnIndex;
      let rowStep = 0;
      let columnStep = 0;
      let flatOffset = 0;
      const extendSelection = event.shiftKey && event.key.startsWith("Arrow");

      switch (event.key) {
        case "ArrowLeft":
          columnStep = -1;
          nextColumn = Math.max(0, columnIndex - 1);
          break;
        case "ArrowRight":
          columnStep = 1;
          nextColumn = Math.min(tableSettings.columns - 1, columnIndex + 1);
          break;
        case "ArrowUp":
          rowStep = -1;
          nextRow = Math.max(0, rowIndex - 1);
          break;
        case "ArrowDown":
          rowStep = 1;
          nextRow = Math.min(tableSettings.rows - 1, rowIndex + 1);
          break;
        case "Tab":
          flatOffset = event.shiftKey ? -1 : 1;
          break;
        case "Enter":
          rowStep = event.shiftKey ? -1 : 1;
          nextRow = event.shiftKey
            ? Math.max(0, rowIndex - 1)
            : Math.min(tableSettings.rows - 1, rowIndex + 1);
          break;
        default:
          return;
      }

      const visibleCell = flatOffset
        ? findVisibleTableCellByOffset(tableSettings, rowIndex, columnIndex, flatOffset)
        : findVisibleTableCell(tableSettings, nextRow, nextColumn, rowStep, columnStep);

      event.preventDefault();
      focusNextTableCell(visibleCell.rowIndex, visibleCell.columnIndex, extendSelection);
    },
    [focusNextTableCell, tableSettings]
  );

  useEffect(() => {
    setTableSelection((current) => clampTableSelection(current, tableSettings));
  }, [tableSettings.columns, tableSettings.rows]);

  useEffect(() => {
    setTableSizeInput({
      rows: String(tableSettings.rows),
      columns: String(tableSettings.columns)
    });
  }, [tableSettings.columns, tableSettings.rows]);

  const handleInsertTable = useCallback(() => {
    const template = buildTableTemplate(tableSettings, activeSourceLanguage);

    if (activeEditableTableMatch) {
      if (activeSourceLanguage === "latex") {
        editorRef.current?.replaceRangeWithLatexTemplateWithPackages(
          activeEditableTableMatch.from,
          activeEditableTableMatch.to,
          template,
          getLatexTableRequiredPackages(tableSettings)
        );
        return;
      }

      editorRef.current?.replaceRangeWithTemplate(
        activeEditableTableMatch.from,
        activeEditableTableMatch.to,
        template
      );
      return;
    }

    if (activeSourceLanguage === "latex") {
      editorRef.current?.insertLatexTemplateWithPackages(template, getLatexTableRequiredPackages(tableSettings));
      return;
    }

    handleInsertEditorTemplate(template);
  }, [activeEditableTableMatch, activeSourceLanguage, handleInsertEditorTemplate, tableSettings]);

  const toggleToolbarMenu = useCallback((menu: "matrix" | "table") => {
    setOpenToolbarMenu((current) => (current === menu ? null : menu));
  }, []);

  useEffect(() => {
    if (openToolbarMenu !== "matrix") {
      setMatrixSizePreview(null);
    }

    if (openToolbarMenu !== "table") {
      setTableSizePreview(null);
      setIsTableSizePickerOpen(false);
      setIsTableBorderMenuOpen(false);
    }
  }, [openToolbarMenu]);

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
      rememberNewDocumentFile(nextPath);

      if (options.sourceTabMode === "pin") {
        openSourceTab(nextPath);
      } else if (options.sourceTabMode !== "preserve") {
        previewSourceTab(nextPath);
      }

      setSelectedWorkspacePath(nextPath);
      setSelectedWorkspacePaths([nextPath]);
      setWorkspaceSelectionAnchorPath(nextPath);
      setProjectRepository((project) => ({
        ...project,
        selection: {
          ...project.selection,
          activeFilePath: nextPath
        }
      }));
    }

    setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, documentId));
  }, [
    openSourceTab,
    previewSourceTab,
    rememberNewDocumentFile,
    setProjectRepository,
    snapshot.project.documents
  ]);

  const handleActivateSourceTab = useCallback(
    (path: string) => {
      const normalizedPath = normalizeWorkspacePath(path);
      const targetDocument = snapshot.project.documents.find(
        (document) => normalizeWorkspacePath(document.name) === normalizedPath
      );

      if (!targetDocument) {
        return;
      }

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
      if (node.kind === "folder") {
        rememberNewDocumentFolder(normalizedPath);
      } else {
        rememberNewDocumentFile(normalizedPath);
      }

      if (modifiers.range) {
        const selectablePaths = visibleWorkspaceNodes.map((entry) => entry.path);
        const anchorPath = workspaceSelectionAnchorPath ?? selectedWorkspacePath ?? normalizedPath;
        setSelectedWorkspacePaths(
          selectWorkspaceRange(selectablePaths, anchorPath, normalizedPath)
        );

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
    [
      rememberNewDocumentFile,
      rememberNewDocumentFolder,
      selectedWorkspacePath,
      visibleWorkspaceNodes,
      workspaceSelectionAnchorPath
    ]
  );

  const handleRequestWorkspaceRename = useCallback((node: WorkspaceTreeNode) => {
    setWorkspaceContextMenu(null);
    setRenamingWorkspacePath(node.path);
    setWorkspaceRenameDraft(getWorkspaceRenameDraft(node));
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

    const renameTransition = renameWorkspaceNodeWithPath(snapshot, targetNode, nextName);
    const { nextPath, previousPath } = renameTransition;

    setSnapshot(renameTransition.snapshot);

    if (nextPath !== previousPath) {
      setSourceTabPaths((currentPaths) =>
        remapWorkspacePaths(currentPaths, previousPath, nextPath)
      );
      setTransientSourceTabPath((currentPath) =>
        currentPath ? remapWorkspacePath(currentPath, previousPath, nextPath) : null
      );
      setPreviewTabPaths((currentPaths) =>
        remapWorkspacePaths(currentPaths, previousPath, nextPath)
      );
      setActivePreviewPath((currentPath) =>
        currentPath ? remapWorkspacePath(currentPath, previousPath, nextPath) : null
      );
      setSelectedWorkspacePath((currentPath) =>
        currentPath ? remapWorkspacePath(currentPath, previousPath, nextPath) : nextPath
      );
      setSelectedWorkspacePaths((currentPaths) =>
        currentPaths.length > 0
          ? remapWorkspacePaths(currentPaths, previousPath, nextPath)
          : [nextPath]
      );
      setWorkspaceSelectionAnchorPath((currentPath) =>
        currentPath ? remapWorkspacePath(currentPath, previousPath, nextPath) : nextPath
      );
      setWorkspaceOpenFoldersByProject((current) => {
        const storedPaths = current[workspaceFolderStorageKey];

        if (!storedPaths) {
          return current;
        }

        return {
          ...current,
          [workspaceFolderStorageKey]: remapWorkspacePaths(
            storedPaths,
            previousPath,
            nextPath
          )
        };
      });

      activeSourcePathRef.current = remapWorkspacePath(
        activeSourcePathRef.current,
        previousPath,
        nextPath
      );
      if (editedSourcePathRef.current) {
        editedSourcePathRef.current = remapWorkspacePath(
          editedSourcePathRef.current,
          previousPath,
          nextPath
        );
      }
      if (pastedImageRenameBindingRef.current) {
        pastedImageRenameBindingRef.current = {
          ...pastedImageRenameBindingRef.current,
          sourcePath: remapWorkspacePath(
            pastedImageRenameBindingRef.current.sourcePath,
            previousPath,
            nextPath
          )
        };
      }
    }

    handleCancelWorkspaceRename();
  }, [
    handleCancelWorkspaceRename,
    renamingWorkspacePath,
    setActivePreviewPath,
    setPreviewTabPaths,
    setProjectRepository,
    setSourceTabPaths,
    setTransientSourceTabPath,
    snapshot,
    visibleWorkspaceTree,
    workspaceFolderStorageKey,
    workspaceRenameDraft
  ]);

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
      if (node.kind === "folder") {
        rememberNewDocumentFolder(node.path);
      } else {
        rememberNewDocumentFile(node.path);
      }

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
    [rememberNewDocumentFile, rememberNewDocumentFolder]
  );

  const handleRequestWorkspaceRootContextMenu = useCallback(
    (x: number, y: number) => {
      if (isTrashViewOpen) {
        return;
      }

      rememberNewDocumentFolder(WORKSPACE_ROOT_PATH);
      setWorkspaceContextMenu({
        kind: "project-root",
        x,
        y
      });
    },
    [isTrashViewOpen, rememberNewDocumentFolder]
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
      setSnapshot((currentSnapshot) => trashWorkspaceNode(currentSnapshot, node));

      if (selectedWorkspacePath === node.path) {
        setSelectedWorkspacePath(null);
      }
      setSelectedWorkspacePaths((currentPaths) =>
        removeWorkspaceSelectionSubtree(currentPaths, node.path)
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

    setSnapshot((currentSnapshot) => emptyWorkspaceTrash(currentSnapshot));
    setWorkspaceContextMenu(null);
    setSelectedWorkspacePath(null);
  }, []);

  const handleMoveWorkspaceNode = useCallback(
    (node: WorkspaceTreeNode, destinationFolderPath: string | null) => {
      const { movedPath } = moveWorkspaceNodeInSnapshot(
        snapshot,
        node,
        destinationFolderPath
      );
      const nextSelectedPaths = remapWorkspaceSelectionAfterMove(
        selectedWorkspacePaths,
        node.path,
        movedPath,
        node.kind === "folder"
      );
      const nextSelectedPath = remapWorkspaceSelectionAfterMove(
        selectedWorkspacePath ? [selectedWorkspacePath] : [],
        node.path,
        movedPath,
        node.kind === "folder"
      )[0] ?? null;

      setSnapshot((currentSnapshot) =>
        moveWorkspaceNodeInSnapshot(currentSnapshot, node, destinationFolderPath).snapshot
      );

      setWorkspaceContextMenu(null);
      setDraggedWorkspacePath(null);
      setWorkspaceDropTargetPath(null);
      setSelectedWorkspacePaths(nextSelectedPaths);
      if (nextSelectedPath) {
        setSelectedWorkspacePath(nextSelectedPath);
      }
    },
    [selectedWorkspacePath, selectedWorkspacePaths, snapshot]
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

      if (node.source.kind === "diagram") {
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

    if (draggedNode.source.kind === "diagram") {
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

      if (draggedNode.source.kind === "diagram") {
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
    if (isTrashViewOpen) {
      setSyncFeedback({ tone: "error", text: "Leave Trash before creating files." });
      return;
    }

    const { extension, parentPath } = newDocumentDefaultsRef.current;
    const requestedName = joinWorkspacePath(parentPath, `new-file-1${extension}`);
    const nextSnapshot = createDocument(snapshot, requestedName);
    const createdDocument = getActiveDocument(nextSnapshot.project);

    if (!createdDocument) {
      return;
    }

    const createdPath = normalizeWorkspacePath(createdDocument.name);
    setSnapshot(nextSnapshot);
    rememberNewDocumentFile(createdPath);
    setWorkspaceContextMenu(null);
    setSelectedWorkspacePath(createdPath);
    setSelectedWorkspacePaths([createdPath]);
    setWorkspaceSelectionAnchorPath(createdPath);
    setRenamingWorkspacePath(createdPath);
    setWorkspaceRenameDraft(getWorkspaceBaseName(createdPath));
    updateWorkspaceOpenFolders((currentPaths) => {
      const nextPaths = new Set(currentPaths);
      let ancestorPath = getWorkspaceParentPath(createdPath);

      nextPaths.add(WORKSPACE_ROOT_PATH);
      while (ancestorPath) {
        nextPaths.add(ancestorPath);
        ancestorPath = getWorkspaceParentPath(ancestorPath);
      }

      return nextPaths;
    });
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

  const handleToggleGitHubCreateFlow = useCallback(
    (project: TyprProjectRepository | null = selectedProjectRepository) => {
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
          projectName: project?.displayName ?? ""
        };
      });
    },
    [
      gitHubDiscovery.accountLogin,
      gitHubDiscovery.owners,
      gitHubDiscovery.repos,
      gitHubDiscovery.isLoadingRepos,
      gitHubDiscovery.status,
      selectedGitToken,
      selectedProjectRepository
    ]
  );

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
      }
    },
    [addDefaultGitManagedProject, projectStorage.projects, selectStoredProjectRepository]
  );

  const handleToggleManageProject = useCallback(
    (projectId: string) => {
      setGitHubClone((current) =>
        current.mode === "create" ? { ...current, isOpen: false } : current
      );
      setManagedProjectId((currentProjectId) =>
        currentProjectId === projectId ? null : projectId
      );
    },
    []
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

  const handleOpenLocalFolder = useCallback(async () => {
    const pendingProject = createEmptyProjectRepository({
      displayName: "Local folder",
      defaultFileName: null
    });
    const connectResult = await localFolderSync.connect(pendingProject.id, {
      initialProject: pendingProject,
      pickerId: "typr-open-local-folder"
    });

    if (!connectResult.ok) {
      if (!connectResult.cancelled) {
        setSyncFeedback({
          tone: "error",
          text: connectResult.message
        });
      }
      return;
    }

    const openedProject = renameProjectRepositoryDisplayName(
      connectResult.project ?? pendingProject,
      connectResult.directoryName
    );
    selectProjectRepository(openedProject);
    addDefaultGitManagedProject(openedProject);
    setIsTrashViewOpen(false);
    setSelectedWorkspacePath(null);
    setSelectedWorkspacePaths([]);
    setWorkspaceSelectionAnchorPath(null);
    setGitRefreshToken((token) => token + 1);
    setSyncFeedback({
      tone: "success",
      text: `Opened and linked local folder “${connectResult.directoryName}”.`
    });
  }, [
    addDefaultGitManagedProject,
    localFolderSync,
    selectProjectRepository
  ]);

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
        "It does not delete any linked local folder, GitHub repository, or Google Drive folder.",
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
      await localFolderSync.disconnect(projectToDelete.id);
    } catch (error) {
      console.warn("Local folder binding cleanup will retry with project deletion.", error);
    }
    try {
      await googleDriveSync.disconnect(projectToDelete.id);
    } catch (error) {
      console.warn("Google Drive binding cleanup will retry with project deletion.", error);
    }

    const fallbackProject =
      projectStorage.projects.length <= 1
        ? createEmptyProjectRepository({
            displayName: "Untitled project",
            defaultFileName: null
          })
        : undefined;
    const pendingProjectStorage = applyProjectDeletionTombstones(
      projectStorage,
      [{
        projectId: projectToDelete.id,
        createdAt: ""
      }],
      fallbackProject
    );
    const pendingProject = getSelectedProjectRepository(pendingProjectStorage);
    const pendingSnapshot = pendingProject
      ? {
          ...snapshot,
          project: projectRepositoryToLegacyProject(pendingProject, snapshot.project)
        }
      : snapshot;

    try {
      await lifecyclePersistenceRef.current?.persistNow();
    } catch {
      // The lifecycle persistence path has already reported its storage error.
      // The independent deletion tombstone can still make this action durable.
    }

    let deletionResult;
    try {
      deletionResult = await deleteProjectDurably({
        dependencies: {
          deleteBrowserGitFiles: deleteProjectGitFiles,
          deleteCloudProjectBindings,
          deleteLocalFolderBinding,
          deleteTombstone: deleteProjectDeletionTombstone,
          removeOpfsProject: removeProjectFromOpfs,
          saveProjectStorage,
          saveTombstone: async (id) => {
            const tombstone = await saveProjectDeletionTombstone(id);
            const pendingPayload = {
              snapshot: pendingSnapshot,
              projectStorage: pendingProjectStorage
            };
            persistencePayloadRef.current = pendingPayload;
            lifecyclePersistenceRef.current?.update(pendingPayload);
            return tombstone;
          }
        },
        fallbackProject,
        projectId: projectToDelete.id,
        storage: projectStorage
      });
    } catch (error) {
      setSyncFeedback({
        tone: "error",
        text: error instanceof Error
          ? `Unable to record project deletion: ${error.message}`
          : "Unable to record project deletion."
      });
      return;
    }

    const nextProjectStorage = deletionResult.storage;
    const nextProject = getSelectedProjectRepository(nextProjectStorage);
    const nextSnapshot = nextProject
      ? {
          ...snapshot,
          project: projectRepositoryToLegacyProject(nextProject, snapshot.project)
        }
      : snapshot;
    const nextPersistencePayload = {
      snapshot: nextSnapshot,
      projectStorage: nextProjectStorage
    };
    persistencePayloadRef.current = nextPersistencePayload;
    lifecyclePersistenceRef.current?.update(nextPersistencePayload);
    const deletedManagedProjectIds = gitWorkspace.projects
      .filter((project) => project.projectId === projectToDelete.id)
      .map((project) => project.id);

    setProjectStorage(nextProjectStorage);
    if (nextProject) {
      setRawSnapshot(nextSnapshot);
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
    setSyncFeedback(
      deletionResult.pendingProjectIds.includes(projectToDelete.id)
        ? {
            tone: "neutral",
            text: `Deleted local project "${projectToDelete.displayName}". Auxiliary browser data cleanup will retry on reload.`
          }
        : {
            tone: "success",
            text: `Deleted local project "${projectToDelete.displayName}". GitHub repositories were not changed.`
          }
    );
  }, [
    gitWorkspace.projects,
    googleDriveSync,
    localFolderSync,
    projectStorage,
    selectedProjectRepository,
    snapshot
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

    let localProject = selectedProjectRepository;
    const initResult = await repoBackend.initRepository(localProject);
    if (!initResult.ok) {
      const message = formatRepoError(initResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }
    localProject = initResult.value;

    const localBranchResult = await repoBackend.getRef(localProject, `refs/heads/${branch}`);
    if (!localBranchResult.ok) {
      const message = formatRepoError(localBranchResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }
    const baselineProject = localBranchResult.value
      ? localProject
      : replaceProjectEntries(localProject, []);

    const fetchResult = await remoteGitService.fetch(baselineProject, createConfig, () => token, {
      onProgress: (progress) => setSyncFeedback({ tone: "neutral", text: progress.message })
    });
    if (!fetchResult.ok) {
      const message = redactGitSecrets(fetchResult.message, [token]);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    const remoteRefResult = await repoBackend.getRef(
      baselineProject,
      getRemoteTrackingRefPath(createConfig)
    );
    if (!remoteRefResult.ok || !remoteRefResult.value) {
      const message = !remoteRefResult.ok
        ? formatRepoError(remoteRefResult.error)
        : `Fetched ${owner}/${repo}, but no ${createConfig.remoteName}/${branch} ref was available.`;
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    if (localBranchResult.value && localBranchResult.value !== remoteRefResult.value) {
      const backupResult = await repoBackend.setRef(
        localProject,
        "refs/heads/typr-local-before-github-create",
        localBranchResult.value
      );
      if (!backupResult.ok) {
        const message = formatRepoError(backupResult.error);
        setIsSyncing(false);
        setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
        setSyncFeedback({ tone: "error", text: message });
        return;
      }
    }

    const checkoutResult = await repoBackend.fastForwardBranch(
      baselineProject,
      branch,
      remoteRefResult.value
    );
    if (!checkoutResult.ok) {
      const message = formatRepoError(checkoutResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }
    localProject = replaceProjectEntries(checkoutResult.value.project, sourceEntries);

    const stageResult = await repoBackend.stagePaths(localProject, ["."]);
    if (!stageResult.ok) {
      const message = formatRepoError(stageResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }
    setLocalRepoStatus(stageResult.value);

    const commitResult = await repoBackend.commit(localProject, {
      message: `Import ${selectedProjectRepository.displayName} from Typr`
    });
    if (!commitResult.ok) {
      const message = formatRepoError(commitResult.error);
      setIsSyncing(false);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    const pushResult = await remoteGitService.push(localProject, createConfig, () => token, {
      onProgress: (progress) => setSyncFeedback({ tone: "neutral", text: progress.message })
    });
    setIsSyncing(false);
    if (!pushResult.ok) {
      const message = redactGitSecrets(pushResult.message, [token]);
      setGitHubClone((current) => ({ ...current, status: "error", message, progress: null }));
      setSyncFeedback({ tone: "error", text: message });
      return;
    }

    const remoteUrl = remoteGitService.getRemoteUrl(createConfig);
    localProject = {
      ...localProject,
      git: {
        ...localProject.git,
        remotes: [
          ...localProject.git.remotes.filter((remote) => remote.name !== createConfig.remoteName),
          { name: createConfig.remoteName, url: remoteUrl }
        ].sort((left, right) => left.name.localeCompare(right.name))
      }
    };
    setProjectRepository((project) =>
      project.id === localProject.id ? localProject : project
    );
    if (pushResult.status) {
      setLocalRepoStatus(pushResult.status);
    }

    const managedProject = createManagedProjectForRepository(
      localProject,
      selectedProjectRepository.displayName,
      createConfig
    );
    const existingManagedProject = gitWorkspace.projects.find(
      (project) =>
        project.projectId === localProject.id &&
        (project.id === selectedGitProject?.id ||
          (!project.connected && !project.owner.trim() && !project.repo.trim()))
    );
    const connectedGitProjectId = existingManagedProject?.id ?? managedProject.id;
    setGitWorkspace((currentWorkspace) => {
      const existingProject = currentWorkspace.projects.find(
        (project) => project.id === connectedGitProjectId
      );
      const connectedProject = {
        ...(existingProject ?? managedProject),
        name: selectedProjectRepository.displayName,
        projectId: localProject.id,
        owner: createConfig.owner,
        repo: createConfig.repo,
        connected: true,
        branch: createConfig.branch,
        remoteName: createConfig.remoteName
      };
      const nextProjects = existingProject
        ? currentWorkspace.projects.map((project) =>
            project.id === existingProject.id ? connectedProject : project
          )
        : [...currentWorkspace.projects, connectedProject];

      return {
        ...currentWorkspace,
        selectedProjectId: connectedGitProjectId,
        selectedProjectIdsByTyprProjectId: {
          ...currentWorkspace.selectedProjectIdsByTyprProjectId,
          [localProject.id]: connectedGitProjectId
        },
        projects: nextProjects
      };
    });
    setGitCredentials((currentCredentials) => ({
      ...currentCredentials,
      [connectedGitProjectId ?? managedProject.id]: token
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
    gitWorkspace.projects,
    gitHubClone.owner,
    gitHubClone.repo,
    gitHubClone.token,
    remoteGitService,
    repoBackend,
    replaceProjectEntries,
    selectedGitProject,
    selectedProjectRepository,
    setProjectRepository
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
    setSettingsTab("keybindings");
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

  const uploadWorkspaceFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (isTrashViewOpen) {
      setSyncFeedback({ tone: "error", text: "Leave Trash before uploading files." });
      return;
    }

    const uploadedFiles = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        content: isTextWorkspaceFile(file.name)
          ? await file.text()
          : new Uint8Array(await file.arrayBuffer())
      }))
    );

    setSnapshot((currentSnapshot) =>
      uploadedFiles.reduce(
        (nextSnapshot, file) => createDocumentFromFile(nextSnapshot, file.name, file.content),
        currentSnapshot
      )
    );
  };

  const handleUploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await uploadWorkspaceFiles(files);
  };

  const handleFilesPaneDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isTrashViewOpen) {
      setIsFilesPaneFileDragActive(true);
    }
  };

  const handleFilesPaneDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsFilesPaneFileDragActive(false);
  };

  const handleFilesPaneDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsFilesPaneFileDragActive(false);
    const files = Array.from(event.dataTransfer.files);

    if (files.length === 0) {
      return;
    }

    void uploadWorkspaceFiles(files);
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
            const pdfBytes = await exportTypstPreviewPdf({
              activePreviewCompileSourcePath,
              assets: diagramShadowAssets,
              project: selectedProjectRepository,
              source: activePreviewTextContent,
              sourcePath
            });
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
    normalizedActiveSourcePath,
    previewDownloadMode,
    selectedProjectRepository,
    visibleWorkspacePreview,
    visibleLastSuccessfulResult,
    visiblePreviewResult
  ]);

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

  const handleUpdateDiagramSvg = useCallback((svgMarkup: string) => {
    setSnapshot((currentSnapshot) =>
      updateDiagram(currentSnapshot, (diagramAsset) => ({
        ...diagramAsset,
        content: svgMarkup,
        strokes: [],
        shapes: []
      }))
    );
  }, []);

  const handleClearDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateDiagram(currentSnapshot, (diagramAsset) => ({
        ...diagramAsset,
        content: undefined,
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

    rememberNewDocumentFolder(normalizedFolderId);

    updateWorkspaceOpenFolders((currentPaths) => {
      const nextPaths = new Set(currentPaths);

      if (nextPaths.has(normalizedFolderId)) {
        nextPaths.delete(normalizedFolderId);
        return nextPaths;
      }

      nextPaths.add(normalizedFolderId);
      return nextPaths;
    });
  }, [rememberNewDocumentFolder, updateWorkspaceOpenFolders]);

  const handleNewDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) => createNextDiagramSnapshot(currentSnapshot));
  }, []);

  const handleSaveDiagram = useCallback(() => {
    setSnapshot((currentSnapshot) => saveCurrentDiagram(currentSnapshot));
    handleCompileRef.current();
  }, []);

  const handleNewDiagramSvg = useCallback((svgMarkup: string) => {
    setSnapshot((currentSnapshot) =>
      createNextDiagramSnapshot(
        updateDiagram(currentSnapshot, (diagramAsset) => ({
          ...diagramAsset,
          content: svgMarkup,
          strokes: [],
          shapes: []
        }))
      )
    );
  }, []);

  const handleSaveDiagramSvg = useCallback(async (svgMarkup: string) => {
    setSnapshot((currentSnapshot) =>
      saveCurrentDiagram(
        updateDiagram(currentSnapshot, (diagramAsset) => ({
          ...diagramAsset,
          content: svgMarkup,
          strokes: [],
          shapes: []
        }))
      )
    );

    let pdfBytes: Uint8Array<ArrayBuffer> | null = null;

    if (activeSourceLanguage === "latex") {
      try {
        pdfBytes = await exportSvgToVectorPdfBytes(svgMarkup);
      } catch (error) {
        setProjectRepository((project) => writeDiagramSvgProjectFile(project, diagram, svgMarkup));
        window.alert(error instanceof Error ? error.message : "Unable to export diagram PDF.");
        return;
      }
    }

    setProjectRepository((project) => {
      const withSvg = writeDiagramSvgProjectFile(project, diagram, svgMarkup);
      return pdfBytes ? writeDiagramPdfProjectFile(withSvg, diagram, pdfBytes) : withSvg;
    });

    handleCompileRef.current();
  }, [activeSourceLanguage, diagram.id, diagram.name, setProjectRepository]);

  const handleDownloadDiagramSvg = useCallback(async (svgMarkup: string) => {
    if (activeSourceLanguage === "latex") {
      try {
        const pdfBytes = await exportSvgToVectorPdfBytes(svgMarkup);
        downloadBlob(
          getDiagramPdfFileName(diagram.name),
          new Blob([pdfBytes], {
            type: "application/pdf"
          })
        );
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to export diagram PDF.");
      }
      return;
    }

    const baseName = diagram.name.replace(/\.svg$/i, "");
    const svgName = `${baseName || diagram.name}.svg`;
    downloadBlob(
      svgName,
      new Blob([svgMarkup], {
        type: "image/svg+xml"
      })
    );
  }, [activeSourceLanguage, diagram.name]);

  const handleCreateTikzFigure = useCallback(() => {
    const project = selectedProjectRepositoryRef.current;

    if (!project) {
      setSyncFeedback({ tone: "error", text: "Open a project before creating a TikZ figure." });
      return;
    }

    const path = createNextTikzPath(project);
    setProjectRepository((currentProject) =>
      currentProject.id === project.id
        ? writeTikzFigureFiles(currentProject, path, DEFAULT_TIKZ_SOURCE)
        : currentProject
    );
    setSelectedTikzPath(path);
    updateWorkspaceOpenFolders((currentPaths) => new Set(currentPaths).add("figures"));
  }, [setProjectRepository, updateWorkspaceOpenFolders]);

  const handleUpdateTikzFigure = useCallback(
    (path: string, source: string, svg?: string) => {
      setProjectRepository((project) => writeTikzFigureFiles(project, path, source, svg));
    },
    [setProjectRepository]
  );

  const handleRenameTikzFigure = useCallback(
    (path: string, name: string) => {
      const project = selectedProjectRepositoryRef.current;

      if (!project) {
        return;
      }

      try {
        const renamed = renameTikzFigureFiles(project, path, name);
        setProjectRepository((currentProject) =>
          currentProject.id === project.id ? renamed.project : currentProject
        );
        setSelectedTikzPath(renamed.path);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to rename TikZ figure.");
      }
    },
    [setProjectRepository]
  );

  const handleInsertTikzFigure = useCallback(
    async (path: string, source: string, svg: string, mode: TikzInsertMode) => {
      const projectId = selectedProjectRepositoryRef.current?.id;
      const targetSourcePath = activeSourcePath;

      if (!projectId) {
        setSyncFeedback({
          tone: "error",
          text: "Open a project before inserting a TikZ figure."
        });
        return;
      }

      const tikzReference = getWorkspaceRelativeReference(activeSourcePath, path);
      const svgReference = getWorkspaceRelativeReference(activeSourcePath, getTikzSvgPath(path));
      const pdfReference = getWorkspaceRelativeReference(activeSourcePath, getTikzPdfPath(path));
      const cetzPath = getTikzCetzPath(path);
      const cetzReference = getWorkspaceRelativeReference(activeSourcePath, cetzPath);
      const label = getTikzFileName(path).replace(/\.tikz$/i, "");
      let resolvedMode = mode;
      let convertedCetz: string | undefined;
      let conversionFeedback: SyncFeedback | null = null;

      if (activeSourceLanguage === "typst" && mode !== "rendered") {
        setSyncFeedback({
          tone: "neutral",
          text: "Converting TikZ to CeTZ and verifying the result…"
        });

        try {
          const converted = await convertTikzToCetz(source);
          const assessment = assessCetzConversion(
            source,
            converted.cetz,
            converted.diagnostics
          );

          if (assessment.blockers.length > 0) {
            throw new Error(assessment.blockers.join(" "));
          }
          if (mode === "recommended" && assessment.warnings.length > 0) {
            throw new Error(assessment.warnings.join(" "));
          }
          if (
            selectedProjectRepositoryRef.current?.id !== projectId ||
            activeSourcePathRef.current !== targetSourcePath
          ) {
            throw new TikzInsertionTargetChangedError();
          }

          clearScheduledCompile();
          await waitForCompileIdle(compileInFlightRef);
          const validationResult = await compiler.compileDocument(
            buildCetzValidationSource(converted.cetz),
            [],
            { mainFilePath: cetzPath }
          );

          if (
            !validationResult.ok ||
            validationResult.engine !== "typst-ts" ||
            validationResult.output.kind !== "svg"
          ) {
            throw new Error(
              validationResult.ok
                ? "The generated CeTZ did not produce a real Typst SVG preview."
                : formatSourceError(validationResult)
            );
          }

          let visualWarning: string | null = null;
          try {
            const comparison = await compareDiagramSvgs(
              svg,
              validationResult.output.content
            );
            if (!comparison.similar) {
              visualWarning =
                "The CeTZ rendering differs from the TikZ preview " +
                `(mean difference ${(comparison.meanDifference * 100).toFixed(1)}%, ` +
                `${(comparison.changedPixelRatio * 100).toFixed(1)}% changed pixels, ` +
                `${(comparison.inkMismatchRatio * 100).toFixed(1)}% unmatched ink).`;
            }
          } catch (error) {
            visualWarning =
              error instanceof Error
                ? `Visual comparison was unavailable: ${error.message}`
                : "Visual comparison was unavailable.";
          }

          if (visualWarning && mode === "recommended") {
            throw new Error(visualWarning);
          }

          convertedCetz = converted.cetz;
          resolvedMode = "cetz";
          const explicitWarnings = [
            ...assessment.warnings,
            ...(visualWarning ? [visualWarning] : [])
          ];
          conversionFeedback =
            explicitWarnings.length > 0
              ? {
                  tone: "neutral",
                  text: `Inserted compilable CeTZ with warnings: ${explicitWarnings.join(" ")}`
                }
              : {
                  tone: "success",
                  text: `Inserted verified CeTZ generated by Tylax ${converted.version}.`
                };
        } catch (error) {
          if (error instanceof TikzInsertionTargetChangedError) {
            setSyncFeedback({
              tone: "neutral",
              text: "The insertion target changed while CeTZ was being prepared. Nothing was inserted."
            });
            return;
          }

          const message =
            error instanceof Error ? error.message : "CeTZ verification failed.";
          if (mode === "cetz") {
            setSyncFeedback({
              tone: "error",
              text: `Unable to insert editable CeTZ: ${message}`
            });
            return;
          }

          resolvedMode = "rendered";
          conversionFeedback = {
            tone: "neutral",
            text: `CeTZ verification failed, so Typr inserted the SVG fallback: ${message}`
          };
        } finally {
          releaseTylaxWorker();
        }
      }

      const insertion = buildTikzInsertion({
        cetzReference,
        label,
        language: activeSourceLanguage,
        mode: resolvedMode,
        pdfReference,
        source,
        sourceReference: tikzReference,
        svgReference
      });

      if (!insertion) {
        setSyncFeedback({
          tone: "error",
          text: "TikZ figures can only be inserted into LaTeX, Markdown, or Typst files."
        });
        return;
      }

      let pdfBytes: Uint8Array<ArrayBuffer> | undefined;
      if (insertion.artifact === "pdf") {
        try {
          pdfBytes = await exportSvgToVectorPdfBytes(svg);
        } catch (error) {
          setSyncFeedback({
            tone: "error",
            text: error instanceof Error
              ? `Unable to prepare the rendered TikZ PDF: ${error.message}`
              : "Unable to prepare the rendered TikZ PDF."
          });
          return;
        }
      }

      if (
        selectedProjectRepositoryRef.current?.id !== projectId ||
        activeSourcePathRef.current !== targetSourcePath
      ) {
        setSyncFeedback({
          tone: "neutral",
          text: "The insertion target changed while the TikZ figure was being prepared. Nothing was inserted."
        });
        return;
      }

      setProjectRepository((project) =>
        project.id === projectId
          ? writeTikzFigureFiles(
              project,
              path,
              source,
              svg,
              pdfBytes,
              convertedCetz
            )
          : project
      );

      if (activeSourceLanguage === "latex") {
        if (insertion.artifact === "pdf") {
          editorRef.current?.insertLatexGraphic(insertion.text);
        } else {
          editorRef.current?.insertLatexTemplateWithPackages(
            insertion.text,
            insertion.latexPackages
          );
        }
      } else {
        editorRef.current?.insertTextAndSelect(insertion.text);
      }

      if (conversionFeedback) {
        setSyncFeedback(conversionFeedback);
      } else if (mode === "recommended" && insertion.artifact === "pdf") {
        setSyncFeedback({
          tone: "neutral",
          text: "Inserted a rendered PDF because this figure is a complete LaTeX document, not an input-safe TikZ fragment."
        });
      }

      window.setTimeout(() => {
        handleCompileRef.current();
      }, 0);
    },
    [
      activeSourceLanguage,
      activeSourcePath,
      clearScheduledCompile,
      compiler,
      setProjectRepository
    ]
  );


  const handleSourceImagePaste = useCallback(async (file: File): Promise<boolean> => {
    if (!snapshot.preferences.pastedImages.enabled) {
      return false;
    }

    if (!selectedProjectRepositoryRef.current) {
      setSyncFeedback({ tone: "error", text: "Open a project before pasting images." });
      return false;
    }

    if (!isSourceFileEditable) {
      return false;
    }

    try {
      const preparedImage = await preparePastedSourceImage(
        file,
        snapshot.preferences.pastedImages.format
      );
      const project = selectedProjectRepositoryRef.current;
      const nextImagePath = buildPastedImagePath(
        project,
        activeSourcePath,
        snapshot.preferences.pastedImages,
        preparedImage.extension
      );
      const duplicateImagePath = findDuplicatePastedImagePath(
        project,
        nextImagePath.folderPath,
        preparedImage.extension,
        preparedImage.bytes
      );
      const folderPath = nextImagePath.folderPath;
      const imagePath = duplicateImagePath ?? nextImagePath.imagePath;
      const referencePath = duplicateImagePath
        ? getWorkspaceRelativeReference(activeSourcePath, duplicateImagePath)
        : nextImagePath.referencePath;
      const reusedExistingImage = duplicateImagePath !== null;
      const insertion = buildPastedImageInsertion(
        activeSourceLanguage,
        referencePath,
        snapshot.preferences.pastedImages
      );

      if (!reusedExistingImage) {
        setProjectRepository((currentProject) => {
          const withFolder = ensureProjectFolder(currentProject, folderPath, {
            kind: "folder",
            id: `pasted-image-folder:${folderPath}`
          });

          return writeProjectFile(withFolder, imagePath, preparedImage.bytes, {
            kind: "virtual",
            id: `pasted-image:${imagePath}`
          });
        });
      }

      updateWorkspaceOpenFolders((currentPaths) => {
        const nextPaths = new Set(currentPaths);
        nextPaths.add(WORKSPACE_ROOT_PATH);
        nextPaths.add(folderPath);
        return nextPaths;
      });
      const insertedText = `\n${insertion}\n`;
      const pastedImageBaseName = getWorkspaceBaseName(imagePath);
      const pastedImageNameStem = getPastedImageNameStem(
        pastedImageBaseName,
        preparedImage.extension
      );
      const selectionStart = insertedText.indexOf(pastedImageNameStem);
      const selectedRange =
        !reusedExistingImage && selectionStart >= 0
          ? activeSourceLanguage === "latex"
            ? editorRef.current?.insertLatexGraphicAndSelectRange(
                insertedText,
                selectionStart,
                selectionStart + pastedImageNameStem.length
              )
            : editorRef.current?.insertTextAndSelectRange(
                insertedText,
                selectionStart,
                selectionStart + pastedImageNameStem.length
              )
          : null;

      if (selectedRange) {
        pastedImageRenameBindingRef.current = {
          sourcePath: activeSourcePath,
          originalImagePath: imagePath,
          imagePath,
          folderPath,
          nameFrom: selectedRange.from,
          nameTo: selectedRange.from + pastedImageBaseName.length,
          extension: preparedImage.extension
        };
      } else {
        if (activeSourceLanguage === "latex") {
          editorRef.current?.insertLatexGraphic(insertedText);
        } else {
          editorRef.current?.insertText(insertedText);
        }
        pastedImageRenameBindingRef.current = null;
      }

      setSyncFeedback({
        tone: "success",
        text: reusedExistingImage ? `Reused image at ${imagePath}.` : `Pasted image to ${imagePath}.`
      });
      window.setTimeout(() => {
        handleCompileRef.current();
      }, 0);
      return true;
    } catch (error) {
      setSyncFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to paste clipboard image."
      });
      return false;
    }
  }, [
    activeSourceLanguage,
    activeSourcePath,
    isSourceFileEditable,
    setProjectRepository,
    snapshot.preferences.pastedImages,
    updateWorkspaceOpenFolders
  ]);

  const handleInsertDiagramIntoDocument = useCallback(() => {
    editorRef.current?.insertTextAndSelect(
      `\n#figure(image("${getDiagramFilePath(diagram.name)}"))\n`
    );
    window.setTimeout(() => {
      handleCompileRef.current();
    }, 0);
  }, [diagram.name]);

  const handleInsertDiagramSvgIntoDocument = useCallback(async (svgMarkup: string) => {
    setSnapshot((currentSnapshot) =>
      saveCurrentDiagram(
        updateDiagram(currentSnapshot, (diagramAsset) => ({
          ...diagramAsset,
          content: svgMarkup,
          strokes: [],
          shapes: []
        }))
      )
    );

    if (activeSourceLanguage === "latex") {
      try {
        const pdfBytes = await exportSvgToVectorPdfBytes(svgMarkup);
        const pdfPath = getDiagramPdfFilePath(diagram.name);

        setProjectRepository((project) =>
          writeDiagramPdfProjectFile(
            writeDiagramSvgProjectFile(project, diagram, svgMarkup),
            diagram,
            pdfBytes
          )
        );
        editorRef.current?.insertLatexGraphic(`\n\\includegraphics{${pdfPath}}\n`);
        window.setTimeout(() => {
          handleCompileRef.current();
        }, 0);
        return;
      } catch (error) {
        setProjectRepository((project) => writeDiagramSvgProjectFile(project, diagram, svgMarkup));
        window.alert(error instanceof Error ? error.message : "Unable to export diagram PDF.");
        return;
      }
    } else {
      setProjectRepository((project) => writeDiagramSvgProjectFile(project, diagram, svgMarkup));
      editorRef.current?.insertTextAndSelect(
        `\n#figure(image("${getDiagramFilePath(diagram.name)}"))\n`
      );
    }

    window.setTimeout(() => {
      handleCompileRef.current();
    }, 0);
  }, [activeSourceLanguage, diagram.id, diagram.name, setProjectRepository]);

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
    const typstCompileSource = createThemedPreviewSource(source, themeRef.current ?? theme, isPaperView);
    const compileAssets = sourceLanguage === "typst"
      ? [
          ...buildTypstProjectShadowFiles(project, sourcePath, typstCompileSource),
          ...diagramShadowAssets
        ]
      : [...diagramShadowAssets];

    if (sourceLanguage === "latex") {
      await prepareForLatexCompile();
    }

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
              typstCompileSource,
              compileAssets,
              { mainFilePath: sourcePath }
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
      if (sourceLanguage === "latex" && shouldUseLowMemoryCompilerMode()) {
        releaseLatexCompilerMemory();
      }

      setIsCompiling(false);
    }
  }, [
    compiler,
    diagramShadowAssets,
    isPaperView,
    prepareForLatexCompile,
    sourceEditorValue,
    theme
  ]);

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

  const handleFetchRemote = useCallback(async () => {
    const ready = validateRemoteAction();
    return ready.ok ? runFetchRemote(ready.repository) : ready;
  }, [runFetchRemote, validateRemoteAction]);
  const handlePushRemote = useCallback(async () => {
    const ready = validateRemoteAction();
    return ready.ok ? runPushRemote(ready.repository) : ready;
  }, [runPushRemote, validateRemoteAction]);
  const handlePullRemote = useCallback(async () => {
    const ready = validateRemoteAction();
    return ready.ok ? runPullRemote(ready.repository) : ready;
  }, [runPullRemote, validateRemoteAction]);
  const handleSyncRemote = useCallback(async () => {
    const ready = validateRemoteAction();
    return ready.ok ? runSyncRemote(ready.repository) : ready;
  }, [runSyncRemote, validateRemoteAction]);

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
              ...diagramShadowAssets
            ]);
          } else {
            return {
              ok: false as const,
              message: "The active file cannot be exported as PDF."
            };
          }

          const fileName = `${baseName || activeDocument?.name || "document"}.pdf`;
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
      activeDocument?.name,
      activeDocumentTextContent,
      compileProjectFile,
      compilerStatus,
      diagramShadowAssets,
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

  function cycleSidebarTool(
    direction: -1 | 1,
    options: { focusSidebarPane?: boolean } = {}
  ) {
    const currentIndex = SIDEBAR_TOOLS.findIndex((tool) => tool.id === activeSidebarTool);
    const nextIndex =
      (currentIndex + direction + SIDEBAR_TOOLS.length) % SIDEBAR_TOOLS.length;
    const nextTool = SIDEBAR_TOOLS[nextIndex].id;

    setIsSidebarCollapsed(false);
    setActiveSidebarTool(nextTool);

    if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
      setWorkspaceMode("split");
    }

    if (options.focusSidebarPane) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          sidebarPaneRef.current?.focus({ preventScroll: true });
        });
      });
    }
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
          (activeSidebarTool === "sync" && Boolean(activeMergeState) && gitMergePaneMode !== "sidebar")
        );
      const previewExpandedDuringResize =
        sidebarInlineExpandedDuringResize &&
        (
          (activeSidebarTool === "sync" && gitMergePaneMode === "preview")
        );
      const sourcePaneVisibleDuringResize =
        !sidebarInlineExpandedDuringResize && isSourceFileEditable && !isSourcePaneHidden;
      const previewPaneVisibleDuringResize = !previewExpandedDuringResize && !isPreviewCollapsed;
      const openPaneCount = [!isSidebarCollapsed, sourcePaneVisibleDuringResize, previewPaneVisibleDuringResize].filter(Boolean).length;
      const handleWidthTotal = Math.max(0, openPaneCount - 1) * PANEL_HANDLE_WIDTH;
      const sidebarHandleWidthDuringResize =
        !isSidebarCollapsed && (sourcePaneVisibleDuringResize || previewPaneVisibleDuringResize)
          ? PANEL_HANDLE_WIDTH
          : 0;
      const previewHandleWidthDuringResize =
        sourcePaneVisibleDuringResize && previewPaneVisibleDuringResize
          ? PANEL_HANDLE_WIDTH
          : 0;
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

      const applyWorkspaceGridColumns = (nextSidebarWidth: number, nextPreviewWidth: number) => {
        if (sidebarInlineExpandedDuringResize) {
          const expandedSidebarWidth = Math.max(
            0,
            workspaceWidth - nextPreviewWidth - previewHandleWidthDuringResize
          );
          workspace.style.gridTemplateColumns = `${expandedSidebarWidth}px ${previewHandleWidthDuringResize}px ${nextPreviewWidth}px`;
          return;
        }

        const effectivePreviewWidth =
          previewPaneVisibleDuringResize && !sourcePaneVisibleDuringResize
            ? Math.max(0, workspaceWidth - nextSidebarWidth - sidebarHandleWidthDuringResize)
            : nextPreviewWidth;
        const nextSourceWidth =
          sourcePaneVisibleDuringResize && workspaceMode === "split"
            ? Math.max(
                0,
                workspaceWidth - nextSidebarWidth - effectivePreviewWidth - handleWidthTotal
              )
            : 0;
        workspace.style.gridTemplateColumns =
          [
            !isSidebarCollapsed ? `${nextSidebarWidth}px` : null,
            !isSidebarCollapsed && (sourcePaneVisibleDuringResize || previewPaneVisibleDuringResize)
              ? `${sidebarHandleWidthDuringResize}px`
              : null,
            sourcePaneVisibleDuringResize ? `${nextSourceWidth}px` : null,
            sourcePaneVisibleDuringResize && previewPaneVisibleDuringResize
              ? `${previewHandleWidthDuringResize}px`
              : null,
            previewPaneVisibleDuringResize ? `${effectivePreviewWidth}px` : null
          ].filter(Boolean).join(" ") || "minmax(0, 1fr)";
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
          const nextPreviewWidth = previewPaneVisibleDuringResize
            ? getPreviewPaneWidth(
                workspaceWidth,
                clampedWidth,
                handleWidthTotal,
                previewRatio,
                sourceMinWidth
              )
            : 0;
          applyWorkspaceGridColumns(clampedWidth, nextPreviewWidth);
          panelResizePendingWidthRef.current = clampedWidth;
          if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
          }
        } else {
          const maxWidth = Math.max(0, remainingWidth - sourceMinWidth);
          const minWidth = Math.min(PREVIEW_MIN_WIDTH, maxWidth);
          const clampedWidth = clampPanelWidth(nextWidth, minWidth, maxWidth);
          applyWorkspaceGridColumns(sidebarPaneWidth, clampedWidth);
          panelResizePendingRatioRef.current = remainingWidth > 0 ? clampPreviewRatio(clampedWidth / remainingWidth) : previewRatio;
          if (isPreviewCollapsed) {
            setIsPreviewCollapsed(false);
          }
        }
      };

      const stopResize = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
        const pendingWidth = panelResizePendingWidthRef.current;
        panelResizePendingWidthRef.current = null;
        if (pendingWidth !== null) {
          setSidebarWidth(pendingWidth);
        }
        const pendingRatio = panelResizePendingRatioRef.current;
        panelResizePendingRatioRef.current = null;
        if (pendingRatio !== null) {
          setPreviewRatio(pendingRatio);
        }
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
      gitMergePaneMode,
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
  const diagnosticSourceSnapshot = useMemo<DiagnosticSourceSnapshot>(
    () => ({
      source: sourceEditorValue,
      path: activeSourcePath,
      language: activeSourceLanguage
    }),
    [activeSourceLanguage, activeSourcePath, sourceEditorValue]
  );
  const debouncedDiagnosticSourceSnapshot = useDebouncedValue(diagnosticSourceSnapshot, 180);
  const isDebouncedDiagnosticSourceCurrent = areDiagnosticSourceSnapshotsEqual(
    debouncedDiagnosticSourceSnapshot,
    diagnosticSourceSnapshot
  );
  const externalDiagnosticPreferencesSignature = useMemo(
    () => createExternalDiagnosticPreferencesSignature(snapshot.preferences.externalDiagnostics),
    [snapshot.preferences.externalDiagnostics]
  );
  const lintDiagnostics = useMemo(
    () =>
      lintSourceWithEditorTooling({
        language: debouncedDiagnosticSourceSnapshot.language,
        path: debouncedDiagnosticSourceSnapshot.path,
        preferences: snapshot.preferences.editorTooling,
        source: debouncedDiagnosticSourceSnapshot.source
      }),
    [
      debouncedDiagnosticSourceSnapshot,
      snapshot.preferences.editorTooling
    ]
  );
  useEffect(() => {
    const abortController = new AbortController();
    const requestSource = debouncedDiagnosticSourceSnapshot;
    const requestPreferencesSignature = externalDiagnosticPreferencesSignature;
    setDiagnosticProviderStatuses(
      createCheckingExternalDiagnosticStatuses(
        snapshot.preferences.externalDiagnostics,
        !areHarperDiagnosticsActivated
      )
    );

    void runExternalDiagnostics({
      source: requestSource.source,
      path: requestSource.path,
      language: requestSource.language,
      preferences: snapshot.preferences.externalDiagnostics,
      deferHarper: !areHarperDiagnosticsActivated,
      signal: abortController.signal,
      onStatus: (status) => {
        setDiagnosticProviderStatuses((currentStatuses) =>
          mergeDiagnosticProviderStatus(currentStatuses, status)
        );
      }
    }).then((result) => {
      if (abortController.signal.aborted) {
        return;
      }

      setExternalDiagnosticsState({
        source: requestSource,
        preferencesSignature: requestPreferencesSignature,
        diagnostics: result.diagnostics
      });
      setDiagnosticProviderStatuses(result.statuses);
    });

    return () => {
      abortController.abort();
    };
  }, [
    areHarperDiagnosticsActivated,
    debouncedDiagnosticSourceSnapshot,
    externalDiagnosticPreferencesSignature,
    snapshot.preferences.externalDiagnostics
  ]);

  const currentExternalDiagnostics = useMemo(() => {
    if (
      !isDebouncedDiagnosticSourceCurrent ||
      externalDiagnosticsState === null ||
      externalDiagnosticsState.preferencesSignature !== externalDiagnosticPreferencesSignature ||
      !areDiagnosticSourceSnapshotsEqual(externalDiagnosticsState.source, debouncedDiagnosticSourceSnapshot)
    ) {
      return EMPTY_COMPILE_DIAGNOSTICS;
    }

    return externalDiagnosticsState.diagnostics;
  }, [
    debouncedDiagnosticSourceSnapshot,
    externalDiagnosticPreferencesSignature,
    externalDiagnosticsState,
    isDebouncedDiagnosticSourceCurrent
  ]);

  const compilerDiagnostics =
    compileResult === null
      ? EMPTY_COMPILE_DIAGNOSTICS
      : compileResult.ok
        ? compileResult.diagnostics
        : compileResult.errors;
  const editorDiagnostics = useMemo(
    () => [
      ...(isDebouncedDiagnosticSourceCurrent ? lintDiagnostics : EMPTY_COMPILE_DIAGNOSTICS),
      ...currentExternalDiagnostics,
      ...compilerDiagnostics
    ],
    [
      compilerDiagnostics,
      currentExternalDiagnostics,
      isDebouncedDiagnosticSourceCurrent,
      lintDiagnostics
    ]
  );
  const debugOutputResult = compileResult?.ok ? compileResult : lastSuccessfulResult;
  const hasLiveCompileOutput = Boolean(isCompiling && hasActiveCompileWork && liveBuildOutput);
  const debugOutputContent = hasLiveCompileOutput
    ? liveBuildOutput
    : activeSourceLanguage === "markdown"
      ? sourceEditorValue
      : debugOutputResult?.output.content ?? "";
  const debugOutputExcerpt = formatDebugOutputExcerpt(debugOutputContent);
  const debugOutputKind = activeSourceLanguage === "markdown"
    ? "source"
    : hasLiveCompileOutput
      ? "live log"
      : debugOutputResult?.output.kind ?? "none";
  const debugSourceLanguageLabel = formatSourceLanguageLabel(activeSourceLanguage);
  const shouldShowPreviewInternals = activeSourceLanguage === "typst" && debugOutputContent.length > 0;
  const lastBuildFailed = buildLogEntries[0]?.ok === false;

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
  const documentStats = useMemo(
    () => collectDocumentStats(outlineSourceContent, activeSourceLanguage),
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
  const isGitMergeInlineExpanded =
    showDesktopSidebar &&
    workspaceMode === "split" &&
    activeSidebarTool === "sync" &&
    Boolean(activeMergeState) &&
    gitMergePaneMode !== "sidebar";
  const isGitMergePreviewExpanded = isGitMergeInlineExpanded && gitMergePaneMode === "preview";
  const isSidebarInlineExpanded = isGitMergeInlineExpanded;
  const isSettingsProjectSelected = isSettingsProject(selectedProjectRepository);
  const activeSettingsFileError = isSettingsProjectSelected
    ? (settingsFilesController.errors as Record<string, string | undefined>)[activeSourcePath]
    : undefined;
  const showSourcePane =
    !isSidebarInlineExpanded &&
    (isSettingsProjectSelected ||
      isZenMode ||
      (isSourceFileEditable && (isMobileWorkspace || !isSourcePaneHidden)));
  const showPreviewPane =
    !isZenMode &&
    !isSettingsProjectSelected &&
    !isGitMergePreviewExpanded &&
    (isMobileWorkspace || !isPreviewCollapsed);
  useEffect(() => {
    if (isSettingsProjectSelected && mobileWorkspaceTab === "preview") {
      setMobileWorkspaceTab("editor");
    }
  }, [isSettingsProjectSelected, mobileWorkspaceTab]);
  const isSidebarOnlyWorkspace =
    !isMobileWorkspace && showDesktopSidebar && !showSourcePane && !showPreviewPane;
  const sidebarPaneWidth = showDesktopSidebar
    ? isSidebarOnlyWorkspace
      ? effectiveWorkspaceWidth
      : sidebarWidth
    : 0;
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
      : workspaceMode === "split" && isGitMergePreviewExpanded
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

      rememberNewDocumentFile(node.path);

      setWorkspaceContextMenu(null);
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
        if (isMobileWorkspace) {
          setMobileWorkspaceTab("editor");
        }
      }

      setActiveSidebarTool("diagram");
      setIsSidebarCollapsed(false);
      setWorkspaceMode("split");
      if (isMobileWorkspace) {
        setMobileWorkspaceTab("files");
      }
    },
    [isMobileWorkspace, rememberNewDocumentFile, snapshot.project.documents]
  );

  const handleOpenWorkspaceFile = useCallback(
    (path: string, options: { pinSourceTab?: boolean } = {}) => {
      const normalizedPath = normalizeWorkspacePath(path);
      setWorkspaceContextMenu(null);

      if (isTrashViewOpen) {
        return;
      }

      rememberNewDocumentFile(normalizedPath);

      if (isWorkspacePreviewFile(normalizedPath)) {
        openPreviewTab(normalizedPath);
        setWorkspaceMode("split");
        setIsPreviewCollapsed(false);
        if (isMobileWorkspace) {
          setMobileWorkspaceTab("preview");
        }
        return;
      }

      setSelectedWorkspacePath(normalizedPath);
      setSelectedWorkspacePaths([normalizedPath]);
      setWorkspaceSelectionAnchorPath(normalizedPath);

      const matchingDocument = snapshot.project.documents.find(
        (document) =>
          normalizeWorkspacePath(document.name) === normalizedPath &&
          isTextWorkspaceFile(document.name)
      );

      if (matchingDocument) {
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

        if (getWorkspacePreviewMimeType(normalizedPath)) {
          openPreviewTab(normalizedPath);
        }
        setWorkspaceMode("split");
        setIsPreviewCollapsed(false);
      }
    },
    [
      handleOpenWorkspaceDiagram,
      handleSelectDocument,
      getExistingLatexPdfPreviewPath,
      isMobileWorkspace,
      isTrashViewOpen,
      openPreviewTab,
      rememberNewDocumentFile,
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

  const revealFilesPaneForShortcut = useCallback(() => {
    if (isSettingsOpen) {
      saveCurrentSettingsScrollPosition();
      setIsSettingsOpen(false);
    }

    setIsDocsOpen(false);
    setActiveSidebarTool("files");
    setIsSidebarCollapsed(false);

    if (isMobileWorkspace) {
      setMobileWorkspaceTab("files");
    } else if (workspaceMode === "editor" || workspaceMode === "preview" || workspaceMode === "zen") {
      setWorkspaceMode("split");
    }
  }, [isMobileWorkspace, isSettingsOpen, saveCurrentSettingsScrollPosition, workspaceMode]);

  handleNewFileShortcutRef.current = () => {
    revealFilesPaneForShortcut();
    handleNewDocument();
    return true;
  };

  handleRenameFileShortcutRef.current = () => {
    revealFilesPaneForShortcut();

    if (isTrashViewOpen) {
      setSyncFeedback({ tone: "error", text: "Leave Trash before renaming files." });
      return true;
    }

    const commandNode = getWorkspaceKeyboardNode();
    if (!commandNode || !canRenameWorkspaceNode(commandNode)) {
      setSyncFeedback({ tone: "neutral", text: "Select a renameable file or folder first." });
      return true;
    }

    handleRequestWorkspaceRename(commandNode);
    return true;
  };

  const selectWorkspaceKeyboardNode = useCallback((node: WorkspaceTreeNode) => {
    if (node.kind === "folder") {
      rememberNewDocumentFolder(node.path);
    } else {
      rememberNewDocumentFile(node.path);
    }

    setPendingWorkspaceDeletePath(null);
    setSelectedWorkspacePaths([node.path]);
    setWorkspaceSelectionAnchorPath(node.path);
  }, [rememberNewDocumentFile, rememberNewDocumentFolder]);

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

  const focusDocumentLocation = useCallback(
    (
      documentId: string,
      line: number,
      column = 1,
      options: { focusEditor?: boolean } = {}
    ) => {
      resetDocumentScrollPosition();
      setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, documentId));
      setWorkspaceMode("split");
      if (isMobileWorkspace) {
        setMobileWorkspaceTab("editor");
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          editorRef.current?.focusRange({ line, column }, { focus: options.focusEditor !== false });
          resetDocumentScrollPosition();
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
    revealActiveWorkspaceTab(activeSourceTabRef.current);
  }, [normalizedActiveSourcePath, visibleSourceTabPaths]);

  useEffect(() => {
    revealActiveWorkspaceTab(activePreviewTabRef.current);
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
  const activeMatrixSize = matrixSizePreview ?? matrixSettings;
  const activeTableSize = tableSizePreview ?? tableSettings;
  const visibleTablePickerSize = {
    rows: Math.min(TABLE_MAX_ROWS, activeTableSize.rows + 1),
    columns: Math.min(TABLE_MAX_COLUMNS, activeTableSize.columns + 1)
  };
  const handleTableSizePickerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const firstCell = event.currentTarget.querySelector<HTMLElement>(".matrix-size-picker__cell");
    const firstRow = event.currentTarget.querySelector<HTMLElement>(".matrix-size-picker__row");

    if (!firstCell || !firstRow) {
      return;
    }

    const cellRect = firstCell.getBoundingClientRect();
    const rowStyle = window.getComputedStyle(firstRow);
    const columnGap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
    const rowGap = Number.parseFloat(rowStyle.rowGap || rowStyle.gap) || columnGap;
    const columnStep = Math.max(1, cellRect.width + columnGap);
    const rowStep = Math.max(1, cellRect.height + rowGap);
    const columns = Math.min(
      visibleTablePickerSize.columns,
      Math.max(1, Math.floor((event.clientX - cellRect.left + columnGap / 2) / columnStep) + 1)
    );
    const rows = Math.min(
      visibleTablePickerSize.rows,
      Math.max(1, Math.floor((event.clientY - cellRect.top + rowGap / 2) / rowStep) + 1)
    );

    handleTableSizePreview(rows, columns);
  };
  const matrixColumnTemplate = useMemo(
    () => buildTableauColumnTemplate(matrixSettings.cells, matrixSettings.columns),
    [matrixSettings.cells, matrixSettings.columns]
  );
  const tableColumnTemplate = useMemo(
    () => buildTableauColumnTemplate(tableSettings.cells, tableSettings.columns),
    [tableSettings.cells, tableSettings.columns]
  );
  const activeTableFormat = getTableScopeFormat(tableSettings, "cell", tableSelection);
  const tableStrokeStyleOptions = TABLE_STROKE_STYLE_OPTIONS.filter((option) =>
    getSupportedTableStrokeStyles(activeSourceLanguage).includes(option.id)
  );
  const showTableMergeControls = supportsTableMerges(activeSourceLanguage);
  const showTableVerticalControls = supportsTableVerticalAlignment(activeSourceLanguage);
  const showTablePaddingControls = supportsTablePaddingControl(activeSourceLanguage, "cell");
  const showTableStrokeControls = supportsTableStrokeControl(activeSourceLanguage, "cell");
  const showTableBorderControls = supportsTableBorderControl(activeSourceLanguage);
  const showTableBackgroundControls = supportsTableBackgroundControl(activeSourceLanguage);
  const showTableMarginControls = supportsTableMarginControl(activeSourceLanguage);
  const activeTableBorderStyle = tableStrokeStyleOptions.some((option) => option.id === tableBorderStyle)
    ? tableBorderStyle
    : tableStrokeStyleOptions.find((option) => option.id === "solid")?.id ?? tableStrokeStyleOptions[0]?.id ?? "solid";
  const showTableBorderWeightControl = showTableBorderControls && activeTableBorderStyle !== "none";
  const tableSelectionLabel = getTableSelectionLabel(tableSelection);
  const canMergeTableSelection = showTableMergeControls && isTableSelectionMergedRange(tableSelection);
  const canUnmergeTableSelection = showTableMergeControls && tableSettings.merges.some((merge) =>
    tableMergeIntersectsRange(merge, normalizeTableSelection(tableSelection))
  );
  const sourceToolsPanel = isSourceFileEditable ? (
    <div className="source-tools-panel">
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
            <div className="matrix-menu__panel" aria-label="Matrix options">
              <div className="matrix-menu__size-header">
                <span>Size</span>
                <strong>{activeMatrixSize.rows} x {activeMatrixSize.columns}</strong>
              </div>
              <div
                aria-label="Matrix size"
                className="matrix-size-picker"
                onPointerLeave={() => setMatrixSizePreview(null)}
                style={
                  {
                    "--matrix-picker-columns": matrixPickerSize.columns
                  } as CSSProperties
                }
              >
                {Array.from({ length: matrixPickerSize.rows }, (_unusedRow, rowIndex) => (
                  <div className="matrix-size-picker__row" key={`matrix-size-row-${rowIndex}`}>
                    {Array.from({ length: matrixPickerSize.columns }, (_unusedColumn, columnIndex) => {
                      const rows = rowIndex + 1;
                      const columns = columnIndex + 1;
                      const isActive = rows <= activeMatrixSize.rows && columns <= activeMatrixSize.columns;
                      const isSelected = rows === matrixSettings.rows && columns === matrixSettings.columns;

                      return (
                        <button
                          aria-label={`${rows} by ${columns} matrix`}
                          aria-pressed={isSelected}
                          className={`matrix-size-picker__cell ${
                            isActive ? "matrix-size-picker__cell--active" : ""
                          } ${isSelected ? "matrix-size-picker__cell--selected" : ""}`}
                          key={`matrix-size-${rows}-${columns}`}
                          onClick={() => handleMatrixSizeSelect(rows, columns)}
                          onFocus={() => handleMatrixSizePreview(rows, columns)}
                          onPointerEnter={() => handleMatrixSizePreview(rows, columns)}
                          title={`${rows} x ${columns}`}
                          type="button"
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="matrix-menu__label">Brackets</div>
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
              <div className="matrix-menu__label">Values</div>
              <div className="matrix-tableau-wrap">
                <div
                  aria-label="Matrix values"
                  className="matrix-tableau"
                  role="grid"
                  style={{ gridTemplateColumns: matrixColumnTemplate }}
                >
                  {Array.from({ length: matrixSettings.rows }, (_unusedRow, rowIndex) =>
                    Array.from({ length: matrixSettings.columns }, (_unusedColumn, columnIndex) => (
                      <input
                        aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                        className="matrix-tableau__cell"
                        key={`matrix-cell-${rowIndex}-${columnIndex}`}
                        onChange={(event) =>
                          handleMatrixCellChange(rowIndex, columnIndex, event.target.value)
                        }
                        onKeyDown={(event) => handleMatrixCellKeyDown(event, rowIndex, columnIndex)}
                        placeholder="*"
                        ref={(element) => {
                          matrixCellRefs.current[rowIndex] ??= [];
                          matrixCellRefs.current[rowIndex][columnIndex] = element;
                        }}
                        role="gridcell"
                        type="text"
                        value={matrixSettings.cells[rowIndex]?.[columnIndex] ?? ""}
                      />
                    ))
                  )}
                </div>
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
            <div className="table-menu__panel" aria-label="Table options">
              <div className="table-menu__top-row">
                <div className="table-size-dropdown">
                  <button
                    aria-expanded={isTableSizePickerOpen}
                    className="pane__button table-size-dropdown__button"
                    onClick={() => {
                      setIsTableSizePickerOpen((current) => !current);
                      setIsTableBorderMenuOpen(false);
                      setTableSizePreview(null);
                    }}
                    type="button"
                  >
                    <span className="table-size-dropdown__label">
                      Size: <strong>{activeTableSize.rows}x{activeTableSize.columns}</strong>
                    </span>
                    <span aria-hidden="true" className="table-size-dropdown__caret" />
                  </button>
                  {isTableSizePickerOpen ? (
                    <div aria-label="Table size" className="table-size-picker">
                      <div className="table-size-picker__manual" aria-label="Manual table size">
                        <label className="table-size-picker__manual-field">
                          <span>Rows</span>
                          <input
                            inputMode="numeric"
                            max={TABLE_MAX_ROWS}
                            min={TABLE_MIN_ROWS}
                            onBlur={handleTableSizeInputBlur}
                            onChange={(event) => handleTableSizeInputChange("rows", event.target.value)}
                            type="number"
                            value={tableSizeInput.rows}
                          />
                        </label>
                        <label className="table-size-picker__manual-field">
                          <span>Columns</span>
                          <input
                            inputMode="numeric"
                            max={TABLE_MAX_COLUMNS}
                            min={TABLE_MIN_COLUMNS}
                            onBlur={handleTableSizeInputBlur}
                            onChange={(event) => handleTableSizeInputChange("columns", event.target.value)}
                            type="number"
                            value={tableSizeInput.columns}
                          />
                        </label>
                      </div>
                      <div
                        className="table-size-picker__grid"
                        onPointerMove={handleTableSizePickerPointerMove}
                        style={
                          {
                            "--matrix-picker-columns": visibleTablePickerSize.columns
                          } as CSSProperties
                        }
                      >
                        {Array.from({ length: visibleTablePickerSize.rows }, (_unusedRow, rowIndex) => (
                          <div className="matrix-size-picker__row" key={`table-size-row-${rowIndex}`}>
                            {Array.from({ length: visibleTablePickerSize.columns }, (_unusedColumn, columnIndex) => {
                              const rows = rowIndex + 1;
                              const columns = columnIndex + 1;
                              const isActive = rows <= activeTableSize.rows && columns <= activeTableSize.columns;
                              const isSelected = rows === tableSettings.rows && columns === tableSettings.columns;

                              return (
                                <button
                                  aria-label={`${rows} by ${columns} table`}
                                  aria-pressed={isSelected}
                                  className={`matrix-size-picker__cell ${
                                    isActive ? "matrix-size-picker__cell--active" : ""
                                  } ${isSelected ? "matrix-size-picker__cell--selected" : ""}`}
                                  key={`table-size-${rows}-${columns}`}
                                  onClick={() => handleTableSizeSelect(rows, columns)}
                                  onFocus={() => handleTableSizePreview(rows, columns)}
                                  onPointerEnter={() => handleTableSizePreview(rows, columns)}
                                  title={`${rows} x ${columns}`}
                                  type="button"
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="table-menu__structure-toggles">
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
                      disabled={tableSettings.rows < 2}
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
                  {activeSourceLanguage === "typst" ? (
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
                  ) : null}
                </div>
              </div>
              <div className="table-menu__selection-row">
                <div className="table-menu__format-header">
                  <span>Selection</span>
                  <strong>{tableSelectionLabel}</strong>
                </div>
                {showTableMergeControls || showTableBorderControls ? (
                  <div className="table-menu__actions">
                    {showTableMergeControls ? (
                      <>
                        <button
                          className="pane__button pane__button--quiet"
                          disabled={!canMergeTableSelection}
                          onClick={handleMergeTableSelection}
                          type="button"
                        >
                          Merge
                        </button>
                        <button
                          className="pane__button pane__button--quiet"
                          disabled={!canUnmergeTableSelection}
                          onClick={handleUnmergeTableSelection}
                          type="button"
                        >
                          Unmerge
                        </button>
                      </>
                    ) : null}
                    {showTableBorderControls ? (
                      <div className="table-border-dropdown">
                        <button
                          aria-expanded={isTableBorderMenuOpen}
                          aria-label="Border options"
                          className="pane__button table-border-dropdown__button"
                          onClick={() => {
                            setIsTableBorderMenuOpen((current) => !current);
                            setIsTableSizePickerOpen(false);
                            setTableSizePreview(null);
                          }}
                          title="Border options"
                          type="button"
                        >
                          <span aria-hidden="true" className="table-border-dropdown__grid-icon" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {showTableBorderControls && isTableBorderMenuOpen ? (
                <div className="table-border-dropdown__panel">
                  <div className="table-menu__border-tools">
                    <div className="table-menu__border-preset-field">
                      <span>Border</span>
                      <div className="table-menu__border-presets" role="radiogroup" aria-label="Border preset">
                        {TABLE_BORDER_PRESET_OPTIONS.map((option) => (
                          <button
                            aria-checked={tableBorderPreset === option.id}
                            aria-label={option.label}
                            className={`table-border-preset ${
                              tableBorderPreset === option.id ? "table-border-preset--active" : ""
                            }`}
                            key={option.id}
                            onClick={() => setTableBorderPreset(option.id)}
                            role="radio"
                            title={option.label}
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={`table-border-preset__glyph table-border-preset__glyph--${option.id}`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="table-menu__field table-menu__field--line-preview">
                      <span>Line</span>
                      <select
                        disabled={tableBorderPreset === "clear"}
                        onChange={(event) => setTableBorderStyle(event.target.value as TableStrokeStyle)}
                        value={activeTableBorderStyle}
                      >
                        {tableStrokeStyleOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {showTableBorderWeightControl ? (
                      <label className="table-menu__field">
                        <span>Weight</span>
                        <select
                          onChange={(event) => setTableBorderWeight(event.target.value as TableStrokeWeight)}
                          value={tableBorderWeight}
                        >
                          {TABLE_STROKE_WEIGHT_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <button
                      className="pane__button table-menu__border-apply"
                      disabled={tableStrokeStyleOptions.length === 0}
                      onClick={handleApplyTableBorder}
                      type="button"
                    >
                      Apply
                    </button>
                    <span
                      aria-hidden="true"
                      className={`table-menu__line-preview table-menu__line-preview--${activeTableBorderStyle} table-menu__line-preview--${tableBorderWeight}`}
                    />
                  </div>
                </div>
              ) : null}
              <div className="table-menu__grid table-menu__grid--format">
                <label className="table-menu__field">
                  <span>Horizontal</span>
                  <select
                    onChange={(event) =>
                      handleTableFormatChange({ align: event.target.value as TableHorizontalAlignment })
                    }
                    value={activeTableFormat.align}
                  >
                    {TABLE_HORIZONTAL_ALIGNMENT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {showTableVerticalControls ? (
                  <label className="table-menu__field">
                    <span>Vertical</span>
                    <select
                      onChange={(event) =>
                        handleTableFormatChange({ verticalAlign: event.target.value as TableVerticalAlignment })
                      }
                      value={activeTableFormat.verticalAlign}
                    >
                      {TABLE_VERTICAL_ALIGNMENT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {showTablePaddingControls ? (
                  <label className="table-menu__field">
                    <span>Padding</span>
                    <select
                      onChange={(event) =>
                        handleTableFormatChange({ padding: event.target.value as TablePadding })
                      }
                      value={activeTableFormat.padding}
                    >
                      {TABLE_PADDING_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {showTableMarginControls ? (
                  <label className="table-menu__field">
                    <span>Margins</span>
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
                ) : null}
                {showTableStrokeControls && tableStrokeStyleOptions.length > 0 ? (
                  <label className="table-menu__field">
                    <span>Stroke</span>
                    <select
                      onChange={(event) =>
                        handleTableFormatChange({ strokeStyle: event.target.value as TableStrokeStyle })
                      }
                      value={tableStrokeStyleOptions.some((option) => option.id === activeTableFormat.strokeStyle)
                        ? activeTableFormat.strokeStyle
                        : tableStrokeStyleOptions[0].id}
                    >
                      {tableStrokeStyleOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {showTableStrokeControls && activeTableFormat.strokeStyle !== "none" ? (
                  <label className="table-menu__field">
                    <span>Weight</span>
                    <select
                      onChange={(event) =>
                        handleTableFormatChange({ strokeWeight: event.target.value as TableStrokeWeight })
                      }
                      value={activeTableFormat.strokeWeight}
                    >
                      {TABLE_STROKE_WEIGHT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {showTableBackgroundControls ? (
                  <label className="table-menu__field table-menu__field--color">
                    <span>Background</span>
                    <div className="table-menu__color-row">
                      <input
                        aria-label="Background color"
                        onChange={(event) =>
                          handleTableFormatChange({ backgroundColor: event.target.value })
                        }
                        type="color"
                        value={normalizeTableBackgroundColor(activeTableFormat.backgroundColor) || "#ffffff"}
                      />
                      <button
                        className="pane__button pane__button--quiet table-menu__color-clear"
                        disabled={!activeTableFormat.backgroundColor}
                        onClick={() => handleTableFormatChange({ backgroundColor: "" })}
                        type="button"
                      >
                        None
                      </button>
                    </div>
                  </label>
                ) : null}
              </div>
              <div className="table-menu__label">Values</div>
              <div className="table-tableau-wrap">
                <div
                  aria-label="Table values"
                  className="table-tableau"
                  onPointerMove={handleTableGridPointerMove}
                  role="grid"
                  style={{
                    gridTemplateColumns: tableColumnTemplate,
                    gridTemplateRows: `repeat(${tableSettings.rows}, var(--tool-tableau-cell-size))`
                  }}
                >
                  {Array.from({ length: tableSettings.rows }, (_unusedRow, rowIndex) =>
                    Array.from({ length: tableSettings.columns }, (_unusedColumn, columnIndex) => {
                      const merge = getTableMergeForCell(tableSettings, rowIndex, columnIndex);
                      const isCoveredMergeCell = Boolean(
                        merge && !tableMergeIsAnchor(merge, rowIndex, columnIndex)
                      );

                      if (isCoveredMergeCell) {
                        tableCellRefs.current[rowIndex] ??= [];
                        tableCellRefs.current[rowIndex][columnIndex] = null;
                        return null;
                      }

                      const isHeader = tableSettings.header && rowIndex === 0;
                      const isFooter = isTableFooterRow(tableSettings, rowIndex);
                      const cellFormat = resolveTableCellFormat(tableSettings, rowIndex, columnIndex);
                      const fallbackBorder: TableCellBorder = {
                        strokeStyle: cellFormat.strokeStyle,
                        strokeWeight: cellFormat.strokeWeight
                      };
                      const isSelected = isCellInTableSelection(tableSelection, rowIndex, columnIndex);
                      const isMerged = Boolean(merge && (merge.rowSpan > 1 || merge.columnSpan > 1));
                      const borderTop = getTableBorderCssValue(
                        getTableFormatBorder(tableSettings, rowIndex, columnIndex, "top"),
                        fallbackBorder
                      );
                      const borderRight = getTableBorderCssValue(
                        getTableFormatBorder(tableSettings, rowIndex, columnIndex, "right"),
                        fallbackBorder
                      );
                      const borderBottom = getTableBorderCssValue(
                        getTableFormatBorder(tableSettings, rowIndex, columnIndex, "bottom"),
                        fallbackBorder
                      );
                      const borderLeft = getTableBorderCssValue(
                        getTableFormatBorder(tableSettings, rowIndex, columnIndex, "left"),
                        fallbackBorder
                      );
                      const cellPadding = getTablePaddingCssValue(cellFormat.padding);
                      const cellBackgroundColor = normalizeTableBackgroundColor(cellFormat.backgroundColor);

                      return (
                        <input
                          aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                          className={`table-tableau__cell ${
                            isHeader ? "table-tableau__cell--header" : ""
                          } ${isFooter ? "table-tableau__cell--footer" : ""} ${
                            isSelected ? "table-tableau__cell--selected" : ""
                          } ${isMerged ? "table-tableau__cell--merged" : ""}`}
                          data-table-column={columnIndex}
                          data-table-row={rowIndex}
                          key={`table-cell-${rowIndex}-${columnIndex}`}
                          onChange={(event) =>
                            handleTableCellChange(rowIndex, columnIndex, event.target.value)
                          }
                          onFocus={() => handleTableCellFocus(rowIndex, columnIndex)}
                          onKeyDown={(event) => handleTableCellKeyDown(event, rowIndex, columnIndex)}
                          onPointerDown={(event) => handleTableCellPointerDown(event, rowIndex, columnIndex)}
                          onPointerEnter={(event) => handleTableCellPointerEnter(event, rowIndex, columnIndex)}
                          placeholder={getTableCellPlaceholder(rowIndex, columnIndex, tableSettings)}
                          ref={(element) => {
                            tableCellRefs.current[rowIndex] ??= [];
                            tableCellRefs.current[rowIndex][columnIndex] = element;
                          }}
                          role="gridcell"
                          style={
                            {
                              borderTop,
                              borderRight,
                              borderBottom,
                              borderLeft,
                              padding: cellPadding,
                              backgroundColor: cellBackgroundColor || undefined,
                              gridColumn: `${columnIndex + 1} / span ${merge?.columnSpan ?? 1}`,
                              gridRow: `${rowIndex + 1} / span ${merge?.rowSpan ?? 1}`,
                              textAlign: cellFormat.align
                            } as CSSProperties
                          }
                          type="text"
                          value={tableSettings.cells[rowIndex]?.[columnIndex] ?? ""}
                        />
                      );
                    })
                  )}
                </div>
              </div>
              <button
                className="pane__button table-menu__insert"
                onClick={() => {
                  handleInsertTable();
                }}
                type="button"
              >
                {activeEditableTableMatch ? "Update table" : "Insert table"}
              </button>
              <label className="table-menu__field table-menu__field--full table-menu__caption">
                <span>Caption</span>
                <input
                  onChange={(event) =>
                    setTableSettings((current) => ({
                      ...current,
                      caption: event.target.value
                    }))
                  }
                  placeholder="Optional caption"
                  type="text"
                  value={tableSettings.caption}
                />
              </label>
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

  const settingsPanelBindings = {
    AUTO_THEME_ID,
    DocumentStatsPanel,
    SNIPPET_LANGUAGES,
    SNIPPET_LANGUAGE_LABELS,
    ThemeCard,
    activeAllSnippets,
    activeCustomSnippets,
    activeDefaultSnippets,
    activeSnippetLanguage,
    activeSnippetLanguageLabel,
    customThemes,
    darkThemes,
    detectedLatexPackages,
    documentStats,
    filteredRepositoryPackages,
    formatByteSize,
    formatEditorToolLanguageLabel,
    formatKeybinding,
    formatLatexPackageBundleLabel,
    formatMobileKeyboardLabels,
    formatSourceLanguageLabel,
    getEditorFormatterOptions,
    getKeybindingConflictsForBinding,
    getKeybindingLabel,
    getSnippetImportTemplate,
    gitHubDiscovery,
    googleDriveSync,
    googleDriveSyncState: selectedGoogleDriveSyncState,
    handleCacheLatexBundle,
    handleCancelPendingKeybindingConflict,
    handleClearCustomSnippets,
    handleClearLatexBundles,
    handleClearTypstPackages,
    handleColorfulFileTreeIconsToggle,
    handleCursorSmearChange,
    handleCursorSmoothToggle,
    handleDownloadCustomSnippets,
    handleDownloadSnippetTemplate,
    handleDownloadThemeTemplate,
    handleExternalDiagnosticsChange,
    handleFormatOnCompileToggle,
    handleFormatterChange,
    handleGitCredentialChange,
    handleGitHubTokenConnectionAction,
    handleGitIgnorePatternsChange,
    handleGitProjectFieldChange,
    handleImportPastedSnippets,
    handleInstallTypstPackage,
    handleKeybindingReset,
    handleLatexMathPreviewToggle,
    handleLintOnEditToggle,
    handleLinterChange,
    handleLiveCompilationToggle,
    handleMobileKeyboardEnabledToggle,
    handleMobileKeyboardLabelsChange,
    handlePastedImageDirectoryAnchorToggle,
    handlePastedImageDirectoryChange,
    handlePastedImageFormatChange,
    handlePastedImagePrefixChange,
    handlePastedImageWrapperChange,
    handlePastedImagesEnabledToggle,
    handleProjectGitignoreChange,
    handleRecordedKeybinding,
    handleRelativeLineNumbersToggle,
    handleRemoveCachedLatexPackage,
    handleRemoveCustomSnippet,
    handleRemoveCustomTheme,
    handleRemoveLatexBundle,
    handleRemoveTypstPackage,
    handleResetAllKeybindings,
    handleResolvePendingKeybindingConflict,
    handleShowGitignoreInFileTreeToggle,
    handleSnippetImportTextChange,
    handleSnippetLanguageChange,
    handleTypstMathPreviewToggle,
    handleVimClipboardSharingToggle,
    handleVimToggle,
    handleWhackKeybindingConflicts,
    installedPackageKeys,
    installingLatexBundleId,
    installingPackageName,
    isAppleShortcutPlatform,
    isLatexPackageCacheClearing,
    isLatexPackageCacheLoading,
    isOnline,
    isPackageCacheClearing,
    isPackageCacheLoading,
    isPackageSearchLoading,
    keybindingFromKeyboardEvent,
    keybindingSearchQuery,
    keybindings,
    latexPackageBundleEntries,
    latexPackageCatalog,
    latexPackageFeedback,
    latexPackageSearchQuery,
    latexPackageSearchResults,
    lightThemes,
    localFolderSync,
    localFolderSyncState: selectedLocalFolderSyncState,
    manualExtraLatexPackages,
    packageCacheEntries,
    packageCacheFeedback,
    packageCacheTotalBytes,
    packageSearchQuery,
    packageSettingsScope,
    pendingKeybindingConflict,
    projectGitignoreContent,
    recordingKeybindingId,
    refreshLatexPackageCache,
    refreshTypstPackageCache,
    renderLatexPackageResolutionRow,
    selectedGitProject,
    selectedGitToken,
    selectedProjectRepository,
    setKeybindingSearchQuery,
    setLatexPackageSearchQuery,
    setPackageSearchQuery,
    setPackageSearchVisibleCount,
    setPackageSettingsScope,
    setPendingKeybindingConflict,
    setRecordingKeybindingId,
    setThemeMode,
    settingsFiles: {
      ...settingsFilesController
    },
    settingsTab,
    snapshot,
    snippetImportFeedback,
    snippetImportInputRef,
    snippetImportText,
    stringifyIgnorePatterns,
    theme,
    themeImportFeedback,
    themeImportInputRef,
    uncachedDetectedLatexPackages,
    visibleKeybindingDefinitions,
    visibleRepositoryPackages
  };


  const renderSettingsSheet = (embedded: boolean) => (
    <SettingsSheet
      controller={settingsController}
      embedded={embedded}
      onClose={(isEmbedded) => {
        setIsSettingsOpen(false);
        if (isEmbedded) {
          setActiveSidebarTool("files");
        }
      }}
    >
      <SettingsPanelContent bindings={settingsPanelBindings} />
    </SettingsSheet>
  );

  return (
    <div className={`app-shell ${isZenMode ? "app-shell--zen" : ""} ${isMobileEditorFullscreen ? "app-shell--editor-fullscreen" : ""}`}>
      {googleDriveSync.notice ? (
        <>
          <GoogleDriveGlobalNotice
            dismiss={googleDriveSync.dismissNotice}
            notice={googleDriveSync.notice}
          />
          {googleDriveSync.notice.tone === "success" &&
          googleDriveSync.notice.title === "Google authorization complete" ? (
            <GoogleDriveGlobalNotice
              dismiss={googleDriveSync.dismissNotice}
              notice={googleDriveSync.notice}
              placement="bottom-left"
            />
          ) : null}
        </>
      ) : null}
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
              <span aria-hidden="true" className="activity-icon activity-icon--docs" />
              <span className="visually-hidden">Docs</span>
            </button>
            <ApplicationInfoButton />
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
              {!isSettingsProjectSelected ? (
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
              ) : null}
            </div>
            {mobileWorkspaceTab === "files" ? (
              <div className="activity-bar activity-bar--mobile" aria-label="Sidebar tools">
                <ApplicationInfoButton mobile />
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
                      className={`activity-icon activity-icon--${tool.id}`}
                    />
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
                        title={`New file (${newFileShortcutLabel})`}
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
                        disabled={!localFolderSync.supported}
                        onClick={() => {
                          void handleOpenLocalFolder();
                        }}
                        title={
                          localFolderSync.supported
                            ? "Open an existing local folder as a synchronized Typr project"
                            : "Opening local folders requires a Chromium browser"
                        }
                        type="button"
                      >
                        Open local folder
                      </button>
                      <button
                        className="pane__button"
                        onClick={() => projectImportInputRef.current?.click()}
                        type="button"
                      >
                        Import project
                      </button>
                      <button
                        className="pane__button"
                        onClick={() => {
                          void googleDriveSync.importProject();
                        }}
                        disabled={!googleDriveSync.configured}
                        title="Open a folder from Google Drive as a new Typr project"
                        type="button"
                      >
                        Import Drive project
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
                    </div>
                    <div className="project-manager__list" role="list" aria-label="Projects">
                      {projectStorage.projects
                        .filter((project) =>
                          snapshot.preferences.showSettingsProject || !isSettingsProject(project)
                        )
                        .map((project) => {
                          const isActiveProject = selectedProjectRepository?.id === project.id;
                          const projectFileCount = listProjectEntries(project).filter(
                            (entry) => entry.kind === "file"
                          ).length;
                        const localFolderState = localFolderSync.states[project.id];
                        const localFolderStatus =
                          localFolderState?.status ??
                          (localFolderSync.supported ? "disconnected" : "unsupported");
                        const localFolderConnected = Boolean(
                          localFolderState?.directoryName
                        );
                        const googleDriveState =
                          googleDriveSync.states[project.id];
                        const googleDriveStatus =
                          googleDriveState?.status ??
                          (googleDriveSync.configured
                            ? "disconnected"
                            : "unconfigured");
                        const googleDriveConnected = Boolean(
                          googleDriveState?.selectedParentName &&
                            googleDriveState?.projectFolderName &&
                            googleDriveState?.projectFolderWebViewLink &&
                            !googleDriveState?.migrationRequired
                        );
                        const connectedGitProject = gitWorkspace.projects.find(
                          (managedProject) =>
                            managedProject.projectId === project.id &&
                            managedProject.connected &&
                            managedProject.owner.trim() &&
                            managedProject.repo.trim()
                        );
                        const isManagedProject = managedProjectId === project.id;
                        const projectLastEditedAt = getProjectLastEditedAt(project);
                        const projectLastEditedLabel =
                          formatProjectLastEditedAt(projectLastEditedAt);
                        const hasInitializedGit =
                          project.git.status === "ready" && !connectedGitProject;

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
                            <div className="project-manager__summary-row">
                              <button
                                aria-label={`Open project ${project.displayName}`}
                                className="project-manager__summary"
                                onClick={() => handleSelectLocalProject(project.id)}
                                type="button"
                              >
                                <span className="project-manager__summary-heading">
                                  <strong>{project.displayName}</strong>
                                </span>
                                <span className="project-manager__summary-stats">
                                  <span>
                                    {projectFileCount} {projectFileCount === 1 ? "file" : "files"}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <time dateTime={projectLastEditedAt}>
                                    Edited {projectLastEditedLabel}
                                  </time>
                                </span>
                                <span
                                  aria-label="Project status and connections"
                                  className="project-manager__summary-connections"
                                >
                                  {isActiveProject ? (
                                    <span className="project-manager__summary-badge project-manager__summary-badge--active">
                                      Open
                                    </span>
                                  ) : null}
                                  {localFolderConnected ? (
                                    <span
                                      className={`project-manager__summary-badge project-manager__summary-badge--connected ${
                                        localFolderStatus === "permission-needed"
                                          ? "project-manager__summary-badge--warning"
                                          : ""
                                      }`}
                                      title={`${localFolderState?.directoryName} · ${localFolderState?.message}`}
                                    >
                                      Folder · {localFolderState?.directoryName}
                                    </span>
                                  ) : null}
                                  {connectedGitProject ? (
                                    <span
                                      className="project-manager__summary-badge project-manager__summary-badge--connected"
                                      title={`${connectedGitProject.owner}/${connectedGitProject.repo} · ${connectedGitProject.branch}`}
                                    >
                                      GitHub · {connectedGitProject.owner}/{connectedGitProject.repo}
                                    </span>
                                  ) : null}
                                  {googleDriveConnected ? (
                                    <span
                                      className={`project-manager__summary-badge project-manager__summary-badge--connected ${
                                        googleDriveStatus ===
                                        "authorization-needed"
                                          ? "project-manager__summary-badge--warning"
                                          : ""
                                      }`}
                                      title={`${googleDriveState?.selectedParentName} / ${googleDriveState?.projectFolderName} · ${googleDriveState?.message}`}
                                    >
                                      Drive · {googleDriveState?.projectFolderName}
                                    </span>
                                  ) : null}
                                  {hasInitializedGit ? (
                                    <span
                                      className="project-manager__summary-badge"
                                      title={project.git.headRef ?? "Browser Git repository initialized"}
                                    >
                                      Git initialized
                                    </span>
                                  ) : null}
                                  {!localFolderConnected &&
                                  !connectedGitProject &&
                                  !googleDriveConnected &&
                                  !hasInitializedGit ? (
                                    <span className="project-manager__summary-badge">
                                      Local only
                                    </span>
                                  ) : null}
                                </span>
                              </button>
                              <button
                                aria-controls={`project-management-${project.id}`}
                                aria-expanded={isManagedProject}
                                aria-label={`${
                                  isManagedProject ? "Hide" : "Show"
                                } options for ${project.displayName}`}
                                className="project-manager__expand-button"
                                onClick={() => handleToggleManageProject(project.id)}
                                title={`${
                                  isManagedProject ? "Hide" : "Show"
                                } project options`}
                                type="button"
                              >
                                <svg
                                  aria-hidden="true"
                                  className="project-manager__summary-chevron"
                                  viewBox="0 0 16 16"
                                >
                                  <path
                                    d={
                                      isManagedProject
                                        ? "M3.5 10 L8 6 L12.5 10"
                                        : "M3.5 6 L8 10 L12.5 6"
                                    }
                                  />
                                </svg>
                              </button>
                            </div>
                            {isManagedProject ? (
                              <div
                                className="project-manager__manage"
                                id={`project-management-${project.id}`}
                              >
                                <section className="project-manager__connection">
                                  <div className="project-manager__connection-header">
                                    <div>
                                      <strong>Project</strong>
                                      <small>
                                        {isActiveProject
                                          ? "This project is open in the workspace."
                                          : "This project is not currently open. Click its card to open it."}
                                      </small>
                                    </div>
                                    <span
                                      className={`project-manager__connection-badge ${
                                        isActiveProject
                                          ? "project-manager__connection-badge--connected"
                                          : ""
                                      }`}
                                    >
                                      {isActiveProject ? "Open" : "Not open"}
                                    </span>
                                  </div>
                                  <div className="project-manager__connection-actions">
                                    <button
                                      className="pane__button pane__button--compact"
                                      onClick={() => handleRenameLocalProject(project.id)}
                                      type="button"
                                    >
                                      Rename project
                                    </button>
                                    <button
                                      className="pane__button pane__button--compact pane__button--danger"
                                      onClick={() => {
                                        void handleDeleteSelectedProject(project.id);
                                      }}
                                      type="button"
                                    >
                                      Delete project
                                    </button>
                                  </div>
                                </section>
                                <section className="project-manager__connection">
                                  <div className="project-manager__connection-header">
                                    <div>
                                      <strong>Local folder</strong>
                                      <small>
                                        {localFolderConnected
                                          ? `${localFolderState?.directoryName} · ${localFolderState?.message}`
                                          : "Store and synchronize this project in a Chromium-accessible folder."}
                                      </small>
                                    </div>
                                    <span
                                      className={`project-manager__connection-badge ${
                                        localFolderConnected
                                          ? "project-manager__connection-badge--connected"
                                          : ""
                                      }`}
                                    >
                                      {localFolderConnected ? "Linked" : "Not linked"}
                                    </span>
                                  </div>
                                  <div className="project-manager__connection-actions">
                                    {localFolderStatus === "permission-needed" ? (
                                      <button
                                        className="pane__button pane__button--compact"
                                        onClick={() => {
                                          void localFolderSync.reconnect(project.id);
                                        }}
                                        type="button"
                                      >
                                        Reconnect
                                      </button>
                                    ) : localFolderConnected ? (
                                      <>
                                        <button
                                          className="pane__button pane__button--compact"
                                          disabled={localFolderStatus === "syncing"}
                                          onClick={() => {
                                            void localFolderSync.syncNow(project.id);
                                          }}
                                          type="button"
                                        >
                                          {localFolderStatus === "syncing" ? "Syncing…" : "Sync now"}
                                        </button>
                                        <button
                                          className="pane__button pane__button--compact"
                                          onClick={() => {
                                            if (!isActiveProject) {
                                              handleSelectLocalProject(project.id);
                                            }
                                            handleOpenSettingsTab("sync");
                                          }}
                                          type="button"
                                        >
                                          Sync settings
                                        </button>
                                        <button
                                          className="pane__button pane__button--compact"
                                          onClick={() => {
                                            void localFolderSync.disconnect(project.id);
                                          }}
                                          type="button"
                                        >
                                          Unlink
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        className="pane__button pane__button--compact"
                                        disabled={!localFolderSync.supported}
                                        onClick={() => {
                                          void localFolderSync.connect(project.id);
                                        }}
                                        title={
                                          localFolderSync.supported
                                            ? "Keep this project synchronized with a local folder"
                                            : "Local folder sync requires a Chromium browser"
                                        }
                                        type="button"
                                      >
                                        Link local folder
                                      </button>
                                    )}
                                  </div>
                                </section>

                                <section className="project-manager__connection">
                                  <div className="project-manager__connection-header">
                                    <div>
                                      <strong>Google Drive</strong>
                                      <small>
                                        {googleDriveConnected
                                          ? `${googleDriveState?.projectFolderName} · configured in Settings`
                                          : "Connect Google Drive and choose a folder from Settings."}
                                      </small>
                                    </div>
                                    <span className={`project-manager__connection-badge ${googleDriveConnected ? "project-manager__connection-badge--connected" : ""}`}>
                                      {googleDriveConnected ? "Connected" : "Not linked"}
                                    </span>
                                  </div>
                                  <div className="project-manager__connection-actions">
                                    <button
                                      className="pane__button pane__button--compact"
                                      onClick={() => {
                                        if (!isActiveProject) {
                                          handleSelectLocalProject(project.id);
                                        }
                                        if (googleDriveSync.isAuthorized) {
                                          void googleDriveSync.chooseLocation(project.id);
                                        } else {
                                          handleOpenSettingsTab("sync");
                                        }
                                      }}
                                      type="button"
                                    >
                                      {googleDriveConnected
                                        ? "Change Drive location"
                                        : googleDriveSync.isAuthorized
                                          ? "Choose Drive location"
                                          : "Connect Drive in Settings"}
                                    </button>
                                    {googleDriveConnected ? (
                                      <button
                                        className="pane__button pane__button--compact"
                                        onClick={() => handleOpenSettingsTab("sync")}
                                        type="button"
                                      >
                                        Drive sync settings
                                      </button>
                                    ) : null}
                                  </div>
                                </section>

                                <section className="project-manager__connection">
                                  <div className="project-manager__connection-header">
                                    <div>
                                      <strong>GitHub</strong>
                                      <small>
                                        {connectedGitProject
                                          ? `${connectedGitProject.owner}/${connectedGitProject.repo} · ${connectedGitProject.branch}`
                                          : "Create a GitHub repository from this project and push its files."}
                                      </small>
                                    </div>
                                    <span
                                      className={`project-manager__connection-badge ${
                                        connectedGitProject
                                          ? "project-manager__connection-badge--connected"
                                          : ""
                                      }`}
                                    >
                                      {connectedGitProject ? "Connected" : "Local only"}
                                    </span>
                                  </div>
                                  <div className="project-manager__connection-actions">
                                    {connectedGitProject ? (
                                      <button
                                        className="pane__button pane__button--compact"
                                        onClick={() => {
                                          if (!isActiveProject) {
                                            handleSelectLocalProject(project.id);
                                          }
                                          handleOpenSidebarTool("sync");
                                        }}
                                        type="button"
                                      >
                                        Open Git tools
                                      </button>
                                    ) : (
                                      <button
                                        className={`pane__button pane__button--compact ${
                                          gitHubClone.isOpen && gitHubClone.mode === "create"
                                            ? "pane__button--active"
                                            : ""
                                        }`}
                                        onClick={() => {
                                          if (!isActiveProject) {
                                            handleSelectLocalProject(project.id);
                                          }
                                          handleToggleGitHubCreateFlow(project);
                                        }}
                                        type="button"
                                      >
                                        {gitHubClone.isOpen && gitHubClone.mode === "create"
                                          ? "Hide GitHub setup"
                                          : "Create GitHub repo"}
                                      </button>
                                    )}
                                  </div>
                                  {!connectedGitProject &&
                                  gitHubClone.isOpen &&
                                  gitHubClone.mode === "create"
                                    ? projectGitHubPanel
                                    : null}
                                </section>
                              </div>
                            ) : null}
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
                  className={`sidebar-section sidebar-section--scrollable sidebar-section--files ${
                    isFilesPaneFileDragActive ? "sidebar-section--file-drop-active" : ""
                  }`}
                  onDragLeaveCapture={handleFilesPaneDragLeave}
                  onDragOverCapture={handleFilesPaneDragOver}
                  onDropCapture={handleFilesPaneDrop}
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
                    colorfulIcons={snapshot.preferences.colorfulFileTreeIcons}
                    draggedPath={draggedWorkspacePath}
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
                      (workspaceContextMenu.node.source.kind === "document" ||
                        workspaceContextMenu.node.source.kind === "diagram") ? (
                        <button
                          className="workspace-context-menu__item"
                          onClick={() =>
                            workspaceContextMenu.node.source.kind === "diagram"
                              ? handleOpenWorkspaceDiagram(workspaceContextMenu.node)
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
                        workspaceContextMenu.node.source.kind === "diagram") ? (
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
                        workspaceContextMenu.node.source.kind === "diagram") ? (
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
                        workspaceContextMenu.node.source.kind === "diagram") ? (
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
                        workspaceContextMenu.node.source.kind === "diagram") ? (
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
                  className="sidebar-section sidebar-section--scrollable sidebar-section--outline"
                  onScroll={handleLeftPaneScroll}
                >
                  {outlineEntries.length > 0 ? (
                    <div className="outline-list" role="list">
                      {renderOutlineEntries(
                        outlineEntries,
                        activeDocument?.id ?? "",
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
                  <DocumentStatsPanel stats={documentStats} />
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
                    isSidebarOnlyWorkspace ? "sidebar-section--pane-full" : ""
                  }`}
                  onScroll={handleLeftPaneScroll}
                >
                  <DiagramEditorErrorBoundary>
                    <DiagramPane
                      mode={diagramPaneMode}
                      onModeChange={setDiagramPaneMode}
                    >
                      <div
                        className="diagram-pane__panel"
                        hidden={diagramPaneMode !== "draw"}
                      >
                        <DiagramEditor
                          diagram={diagram}
                          onSvgChange={handleUpdateDiagramSvg}
                          onClear={handleClearDiagram}
                          onNew={handleNewDiagram}
                          onNewSvg={handleNewDiagramSvg}
                          onSave={handleSaveDiagram}
                          onSaveSvg={handleSaveDiagramSvg}
                          onInsertIntoDocument={handleInsertDiagramIntoDocument}
                          onInsertSvg={handleInsertDiagramSvgIntoDocument}
                          onRename={handleRenameDiagram}
                          onDownloadSvg={handleDownloadDiagramSvg}
                        />
                      </div>
                      <div
                        className="diagram-pane__panel"
                        hidden={diagramPaneMode !== "tikz"}
                      >
                        <TikzDiagramEditor
                          canInsert={
                            isSourceFileEditable &&
                            activeSourceLanguage !== "text" &&
                            (isMobileWorkspace || !isSourcePaneHidden)
                          }
                          figure={selectedTikzFigure}
                          figures={tikzFigures}
                          onChange={handleUpdateTikzFigure}
                          onCreate={handleCreateTikzFigure}
                          onInsert={handleInsertTikzFigure}
                          onRename={handleRenameTikzFigure}
                          onSelect={setSelectedTikzPath}
                          targetLanguage={activeSourceLanguage}
                          theme={theme}
                        />
                      </div>
                    </DiagramPane>
                  </DiagramEditorErrorBoundary>
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
                      <BuildLogPanel
                        controller={buildLogController}
                        downloadFile={downloadFile}
                        formatCompileStrategySummary={formatCompileStrategySummary}
                        formatRawLogExcerpt={formatDebugOutputExcerpt}
                        jumpToDiagnostic={jumpToDiagnostic}
                        rerunEntry={rerunBuildLogEntry}
                      />
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

                    <details className="sidebar-card debug-section" open>
                      <summary className="debug-section__summary">
                        <span>Diagnostic providers</span>
                        <span className="pane__meta">{diagnosticProviderStatuses.filter((status) => status.enabled).length} active</span>
                      </summary>
                      <ul className="sidebar-card__list">
                        {diagnosticProviderStatuses.map((status) => (
                          <li key={status.id}>
                            <span>{status.label}</span>
                            <span>{status.enabled ? status.phase : "disabled"}</span>
                          </li>
                        ))}
                      </ul>
                      {diagnosticProviderStatuses.map((status) => (
                        <p className="sidebar-card__copy" key={`${status.id}:detail`}>
                          {status.label}: {status.detail}
                        </p>
                      ))}
                      <div className="sidebar-card__actions">
                        <button className="pane__button pane__button--compact" onClick={handleHarperSelfTest} type="button">
                          Run Harper self-test
                        </button>
                      </div>
                      <p className="sidebar-card__copy">Harper self-test: {harperSelfTestResult}</p>
                    </details>

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
                    activeSourceLanguage === "latex" ? (
                      <div
                        className={`compile-options-menu ${isCompileOptionsMenuOpen ? "compile-options-menu--open" : ""}`}
                        ref={compileOptionsMenuRef}
                      >
                        <div className="compile-split-button" role="group" aria-label="Compile options">
                          <button
                            className="pane__button pane__button--compact compile-split-button__main"
                            onClick={() => handleCompile()}
                            title={`Compile ${getLatexCompileProfile(selectedLatexCompileProfileId).label} (${compileShortcutLabel})`}
                            type="button"
                          >
                            Compile
                          </button>
                          <button
                            aria-expanded={isCompileOptionsMenuOpen}
                            aria-haspopup="menu"
                            aria-label="Choose compile mode"
                            className="pane__button pane__button--compact compile-split-button__toggle"
                            onClick={() => setIsCompileOptionsMenuOpen((current) => !current)}
                            title="Choose compile mode"
                            type="button"
                          >
                            <span aria-hidden="true" className="compile-split-button__chevron" />
                          </button>
                        </div>
                        {isCompileOptionsMenuOpen ? (
                          <div className="compile-options-menu__panel" role="menu" aria-label="Compile mode">
                            {LATEX_COMPILE_PROFILES.map((profile) => (
                              <button
                                aria-checked={selectedLatexCompileProfileId === profile.id}
                                className="compile-options-menu__item"
                                key={profile.id}
                                onClick={() => {
                                  setSelectedLatexCompileProfileId(profile.id);
                                  setIsCompileOptionsMenuOpen(false);
                                }}
                                role="menuitemradio"
                                type="button"
                              >
                                <span className="compile-options-menu__item-main">
                                  <span>{profile.label}</span>
                                  {selectedLatexCompileProfileId === profile.id ? (
                                    <span aria-hidden="true" className="compile-options-menu__check">✓</span>
                                  ) : null}
                                </span>
                                <small>{profile.description}</small>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        className="pane__button pane__button--compact"
                        onClick={() => handleCompile()}
                        title={`Compile (${compileShortcutLabel})`}
                        type="button"
                      >
                        Compile
                      </button>
                    )
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
                onSelectionChange={handleSourceEditorSelectionChange}
                onSourceDoubleClick={handleEditorSourceDoubleClick}
                onFocusChange={setIsEditorFocused}
                imagePasteInVim={snapshot.preferences.pastedImages.enabled}
                vimClipboardSharing={snapshot.preferences.vimClipboardSharing}
                onImagePaste={snapshot.preferences.pastedImages.enabled ? handleSourceImagePaste : undefined}
                onImageRenameKey={handlePastedImageRenameKey}
                value={sourceEditorValue}
                vimMode={snapshot.preferences.vimMode}
                editorFontSize={snapshot.preferences.editorFontSize}
                keybindings={keybindings}
                relativeLineNumbers={snapshot.preferences.relativeLineNumbers}
                cursorSmooth={!isMobileWorkspace && snapshot.preferences.cursorSmooth}
                cursorSmear={isMobileWorkspace ? 0 : snapshot.preferences.cursorSmear}
                latexMathPreview={snapshot.preferences.latexMathPreview}
                typstMathPreview={snapshot.preferences.typstMathPreview}
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
          {activeSettingsFileError ? (
            <div className="source-inline-status source-inline-status--warning" role="status">
              {activeSettingsFileError} Defaults for this file are active until the JSON is fixed.
            </div>
          ) : null}
          {isSourceFileEditable && visibleSourceTabPaths.includes(normalizedActiveSourcePath) && compileResult && !compileResult.ok ? (
            <div className="source-inline-status source-inline-status--error">
              {formatSourceError(compileResult)}
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
        multiple
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
  const driver = strategy.driver ? ` · ${formatLatexCompileDriverLabel(strategy.driver)}` : "";
  const fallback = strategy.fallbackUsed ? " · fallback used" : "";
  return `${mode}${driver} · ${strategy.previewKind} · ${strategy.mainFilePath}${fallback}. ${strategy.reason}`;
}

function formatLatexCompileDriverLabel(driver: string): string {
  if (driver === "luatex_bibtex8") {
    return "LuaTeX";
  }

  if (driver === "luahbtex_bibtex8") {
    return "LuaHBTeX";
  }

  if (driver === "xetex_bibtex8_dvipdfmx") {
    return "XeTeX";
  }

  return "pdfTeX";
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

function createInitialExternalDiagnosticStatuses(): DiagnosticProviderStatus[] {
  return [
    {
      id: "harper",
      label: "Harper",
      enabled: true,
      phase: "idle",
      detail: "Offline Harper diagnostics are ready to run."
    },
    {
      id: "local-lsp",
      label: "Local WebSocket LSP",
      enabled: false,
      phase: "idle",
      detail: "Local WebSocket LSP disabled."
    },
    {
      id: "remote-lsp",
      label: "Remote WebSocket LSP",
      enabled: false,
      phase: "idle",
      detail: "Remote WebSocket LSP disabled."
    }
  ];
}

function createCheckingExternalDiagnosticStatuses(
  preferences: ExternalDiagnosticProviderPreferences,
  deferHarper = false
): DiagnosticProviderStatus[] {
  return createInitialExternalDiagnosticStatuses().map((status) => {
    if (status.id === "harper") {
      return preferences.harper.enabled
        ? deferHarper
          ? { ...status, enabled: true, phase: "idle", detail: "Harper will start after the first editor change." }
          : { ...status, enabled: true, phase: "checking", detail: "Checking prose offline in the browser." }
        : { ...status, enabled: false, detail: "Offline Harper diagnostics disabled." };
    }

    if (status.id === "local-lsp") {
      return preferences.localLsp.enabled
        ? { ...status, enabled: true, phase: "checking", detail: `Connecting to ${preferences.localLsp.url}.` }
        : status;
    }

    if (!preferences.remoteLsp.enabled) {
      return status;
    }

    return preferences.remoteLsp.allowDocumentUpload
      ? { ...status, enabled: true, phase: "checking", detail: `Connecting to ${preferences.remoteLsp.url}.` }
      : { ...status, enabled: true, phase: "warning", detail: "Remote LSP is enabled, but document upload is not allowed." };
  });
}

function mergeDiagnosticProviderStatus(
  statuses: DiagnosticProviderStatus[],
  nextStatus: DiagnosticProviderStatus
): DiagnosticProviderStatus[] {
  const nextStatuses = statuses.map((status) =>
    status.id === nextStatus.id ? nextStatus : status
  );

  return nextStatuses.some((status) => status.id === nextStatus.id)
    ? nextStatuses
    : [...nextStatuses, nextStatus];
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

function revealActiveWorkspaceTab(tab: HTMLElement | null): void {
  const tabList = tab?.closest<HTMLElement>(".pane-tabs");

  if (tab && tabList) {
    scrollElementWithin(tabList, tab);
  }
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

function buildSnippetPlaceholder(index: number, label: string): string {
  return `\${${index}:${label}}`;
}

function buildMatrixTemplate(settings: MatrixSettings, language: SourceLanguage): string {
  if (language === "latex") {
    return buildLatexMatrixTemplate(settings);
  }

  if (language === "markdown" || language === "text") {
    return `$$\n${buildLatexMatrixBody(settings)}\n$$`;
  }

  return buildTypstMatrixTemplate(settings);
}

function buildTypstMatrixTemplate(settings: MatrixSettings): string {
  const delimiter = MATRIX_DELIMITER_OPTIONS.find((option) => option.id === settings.delimiter);
  const rows = clampMatrixDimension(settings.rows, MATRIX_MIN_ROWS, MATRIX_MAX_ROWS);
  const columns = clampMatrixDimension(settings.columns, MATRIX_MIN_COLUMNS, MATRIX_MAX_COLUMNS);
  const cellsByRow = createMatrixCells(rows, columns, settings.cells);
  let cellIndex = 1;
  const rowStrings = Array.from({ length: rows }, (_unused, rowIndex) => {
    const cells = Array.from({ length: columns }, (_unusedCell, columnIndex) => {
      const cellValue = cellsByRow[rowIndex]?.[columnIndex]?.trim() ?? "";

      if (cellValue) {
        return escapeSnippetText(cellValue);
      }

      const placeholder = buildSnippetPlaceholder(cellIndex, "*");
      cellIndex += 1;
      return placeholder;
    });

    return `  ${cells.join(", ")};`;
  });
  const delimiterLine = delimiter
    ? delimiter.id === "none"
      ? "  delim: none"
      : `  delim: "${delimiter.delim}"`
    : "";
  const body = delimiterLine ? `${rowStrings.join("\n")}\n${delimiterLine}` : rowStrings.join("\n");

  return `mat(\n${body}\n)`;
}

function buildLatexMatrixTemplate(settings: MatrixSettings): string {
  return `\\[\n${buildLatexMatrixBody(settings)}\n\\]`;
}

function buildLatexMatrixBody(settings: MatrixSettings): string {
  const rows = clampMatrixDimension(settings.rows, MATRIX_MIN_ROWS, MATRIX_MAX_ROWS);
  const columns = clampMatrixDimension(settings.columns, MATRIX_MIN_COLUMNS, MATRIX_MAX_COLUMNS);
  const cellsByRow = createMatrixCells(rows, columns, settings.cells);
  let cellIndex = 1;
  const rowStrings = Array.from({ length: rows }, (_unused, rowIndex) => {
    const cells = Array.from({ length: columns }, (_unusedCell, columnIndex) => {
      const cellValue = cellsByRow[rowIndex]?.[columnIndex]?.trim() ?? "";

      if (cellValue) {
        return escapeLatexText(cellValue);
      }

      const placeholder = buildSnippetPlaceholder(cellIndex, "*");
      cellIndex += 1;
      return placeholder;
    });

    return `  ${cells.join(" & ")}${rowIndex < rows - 1 ? " \\\\" : ""}`;
  });

  if (settings.delimiter === "angle") {
    return `\\left\\langle\n\\begin{matrix}\n${rowStrings.join("\n")}\n\\end{matrix}\n\\right\\rangle`;
  }

  const environment =
    settings.delimiter === "bracket"
      ? "bmatrix"
      : settings.delimiter === "brace"
        ? "Bmatrix"
        : settings.delimiter === "bar"
          ? "vmatrix"
          : settings.delimiter === "none"
            ? "matrix"
            : "pmatrix";

  return `\\begin{${environment}}\n${rowStrings.join("\n")}\n\\end{${environment}}`;
}

function normalizeTableBackgroundColor(color: string | undefined): string {
  const trimmed = color?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : "";
}

function getTypstColorValue(color: string | undefined): string | null {
  const normalized = normalizeTableBackgroundColor(color);
  return normalized ? `rgb("${normalized}")` : null;
}

function getLatexHtmlColor(color: string | undefined): string | null {
  const normalized = normalizeTableBackgroundColor(color);
  return normalized ? normalized.slice(1).toUpperCase() : null;
}

function tableHasBackgroundColor(settings: TableSettings): boolean {
  return Boolean(
    normalizeTableBackgroundColor(settings.tableFormat.backgroundColor) ||
    settings.columnFormats.some((format) => normalizeTableBackgroundColor(format.backgroundColor)) ||
    settings.rowFormats.some((format) => normalizeTableBackgroundColor(format.backgroundColor)) ||
    settings.cellFormats.some((row) => row.some((format) => normalizeTableBackgroundColor(format.backgroundColor)))
  );
}

function buildTableTemplate(settings: TableSettings, language: SourceLanguage): string {
  if (language === "latex") {
    return buildLatexTableTemplate(settings);
  }

  if (language === "markdown" || language === "text") {
    return buildMarkdownTableTemplate(settings);
  }

  return buildTypstTableTemplate(settings);
}

function resolveTableBaseFormat(settings: TableSettings): TableResolvedCellFormat {
  return {
    ...DEFAULT_TABLE_FORMAT,
    align: normalizeTableHorizontalAlignment(settings.align),
    padding: settings.inset === "medium" ? "medium" : settings.inset === "none" ? "none" : "small",
    strokeStyle: settings.stroke === "none" ? "none" : "solid",
    ...(settings.tableFormat ?? {})
  };
}

function resolveTableColumnFormat(settings: TableSettings, columnIndex: number): TableResolvedCellFormat {
  return {
    ...resolveTableBaseFormat(settings),
    ...(settings.columnFormats?.[columnIndex] ?? {})
  };
}

function getTablePaddingOption(padding: TablePadding) {
  return TABLE_PADDING_OPTIONS.find((option) => option.id === padding) ?? TABLE_PADDING_OPTIONS[1];
}

function getTableStrokeWeightOption(weight: TableStrokeWeight) {
  return TABLE_STROKE_WEIGHT_OPTIONS.find((option) => option.id === weight) ?? TABLE_STROKE_WEIGHT_OPTIONS[0];
}

function getTypstAlignmentValue(format: TableResolvedCellFormat): string {
  const vertical = TABLE_VERTICAL_ALIGNMENT_OPTIONS.find((option) => option.id === format.verticalAlign)?.typstValue ?? "horizon";
  return `${format.align} + ${vertical}`;
}

function getTypstStrokeValue(format: TableResolvedCellFormat): string {
  if (format.strokeStyle === "none") {
    return "none";
  }

  const thickness = getTableStrokeWeightOption(format.strokeWeight).typstValue;

  if (format.strokeStyle === "dashed" || format.strokeStyle === "dotted") {
    return `(paint: black, thickness: ${thickness}, dash: "${format.strokeStyle}")`;
  }

  return `${thickness} + black`;
}

function getTypstBorderStrokeValue(border: TableCellBorder): string {
  if (border.strokeStyle === "none") {
    return "none";
  }

  const thickness = getTableStrokeWeightOption(border.strokeWeight).typstValue;

  if (border.strokeStyle === "dashed" || border.strokeStyle === "dotted") {
    return `(paint: black, thickness: ${thickness}, dash: "${border.strokeStyle}")`;
  }

  return `${thickness} + black`;
}

function getTypstExplicitCellStrokeValue(settings: TableSettings, rowIndex: number, columnIndex: number): string | null {
  const hasExplicitBorder = TABLE_BORDER_EDGES.some((edge) =>
    Boolean(getTableFormatBorder(settings, rowIndex, columnIndex, edge))
  );

  if (!hasExplicitBorder) {
    return null;
  }

  const cellFormat = resolveTableCellFormat(settings, rowIndex, columnIndex);
  const fallbackBorder: TableCellBorder = {
    strokeStyle: cellFormat.strokeStyle,
    strokeWeight: cellFormat.strokeWeight
  };
  const borderEntries = TABLE_BORDER_EDGES.map((edge) => {
    const border = getTableFormatBorder(settings, rowIndex, columnIndex, edge) ?? fallbackBorder;
    return `${edge}: ${getTypstBorderStrokeValue(border)}`;
  });

  return `(${borderEntries.join(", ")})`;
}

function formatTypstCellContent(settings: TableSettings, rowIndex: number, columnIndex: number, cellIndex: { current: number }): string {
  const cellValue = settings.cells[rowIndex]?.[columnIndex]?.trim() ?? "";

  if (cellValue) {
    return escapeTypstContent(cellValue);
  }

  const placeholderLabel = getTableCellPlaceholder(rowIndex, columnIndex, settings);
  const placeholder = buildSnippetPlaceholder(
    cellIndex.current,
    placeholderLabel === "*" ? "Cell" : placeholderLabel
  );
  cellIndex.current += 1;
  return placeholder;
}

function buildTypstTableCell(settings: TableSettings, rowIndex: number, columnIndex: number, cellIndex: { current: number }): string | null {
  const merge = getTableMergeForCell(settings, rowIndex, columnIndex);

  if (merge && !tableMergeIsAnchor(merge, rowIndex, columnIndex)) {
    return null;
  }

  const baseFormat = resolveTableBaseFormat(settings);
  const cellFormat = resolveTableCellFormat(settings, rowIndex, columnIndex);
  const options: string[] = [];

  if (merge?.columnSpan && merge.columnSpan > 1) {
    options.push(`colspan: ${merge.columnSpan}`);
  }

  if (merge?.rowSpan && merge.rowSpan > 1) {
    options.push(`rowspan: ${merge.rowSpan}`);
  }

  if (getTypstAlignmentValue(cellFormat) !== getTypstAlignmentValue(baseFormat)) {
    options.push(`align: ${getTypstAlignmentValue(cellFormat)}`);
  }

  if (cellFormat.padding !== baseFormat.padding) {
    options.push(`inset: ${getTablePaddingOption(cellFormat.padding).typstValue}`);
  }

  if (cellFormat.backgroundColor !== baseFormat.backgroundColor) {
    options.push(`fill: ${getTypstColorValue(cellFormat.backgroundColor) ?? "none"}`);
  }

  const explicitStroke = getTypstExplicitCellStrokeValue(settings, rowIndex, columnIndex);

  if (explicitStroke) {
    options.push(`stroke: ${explicitStroke}`);
  } else if (
    cellFormat.strokeStyle !== baseFormat.strokeStyle ||
    cellFormat.strokeWeight !== baseFormat.strokeWeight
  ) {
    options.push(`stroke: ${getTypstStrokeValue(cellFormat)}`);
  }

  const content = formatTypstCellContent(settings, rowIndex, columnIndex, cellIndex);

  if (options.length === 0) {
    return `[${content}]`;
  }

  return `table.cell(${options.join(", ")})[${content}]`;
}

function buildTypstTableTemplate(settings: TableSettings): string {
  const rows = clampMatrixDimension(settings.rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const columns = clampMatrixDimension(settings.columns, TABLE_MIN_COLUMNS, TABLE_MAX_COLUMNS);
  const cellIndex = { current: 1 };
  const buildRow = (rowIndex: number) => {
    const cells: string[] = [];

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const cell = buildTypstTableCell(settings, rowIndex, columnIndex, cellIndex);

      if (cell) {
        cells.push(cell);
      }
    }

    return cells.join(", ");
  };
  const bodyRowIndexes = Array.from({ length: rows }, (_unused, rowIndex) => rowIndex).filter(
    (rowIndex) => !(settings.header && rowIndex === 0) && !isTableFooterRow(settings, rowIndex)
  );
  const headerRow = settings.header ? `  table.header(\n    ${buildRow(0)},\n  ),` : "";
  const bodyRows = bodyRowIndexes.map((rowIndex) => `  ${buildRow(rowIndex)},`).join("\n");
  const footerRow = settings.footer && rows > 1 ? `  table.footer(\n    ${buildRow(rows - 1)},\n  ),` : "";
  const baseFormat = resolveTableBaseFormat(settings);
  const gutter = TABLE_GUTTER_OPTIONS.find((option) => option.id === settings.gutter)?.value ?? "0pt";
  const backgroundFill = getTypstColorValue(baseFormat.backgroundColor);
  const fillLine = settings.striped
    ? `  fill: (x, y) => if y == 0 { luma(232) } else if calc.odd(y) { luma(246) } else { ${backgroundFill ?? "white"} },`
    : backgroundFill
      ? `  fill: ${backgroundFill},`
      : "";
  const tableRows = [fillLine, headerRow, bodyRows, footerRow].filter(Boolean).join("\n");
  const table = `table(\n  columns: ${columns},\n  align: ${getTypstAlignmentValue(baseFormat)},\n  gutter: ${gutter},\n  inset: ${getTablePaddingOption(baseFormat.padding).typstValue},\n  stroke: ${getTypstStrokeValue(baseFormat)},\n${tableRows}\n)`;
  const caption = settings.caption.trim();

  if (!caption) {
    return `#${table}`;
  }

  return `#figure(\n  ${table.replace(/\n/g, "\n  ")},\n  caption: [${escapeTypstContent(caption)}],\n)`;
}

function getLatexAlignLetter(align: TableHorizontalAlignment): string {
  if (align === "right") {
    return "r";
  }

  if (align === "center") {
    return "c";
  }

  return "l";
}

function getLatexRuleSeparator(format: TableResolvedCellFormat): string {
  switch (format.strokeStyle) {
    case "none":
      return "";
    case "double":
      return "||";
    case "dashed":
    case "dotted":
      return ":";
    case "solid":
    default:
      return "|";
  }
}

function getLatexColumnSpec(settings: TableSettings): string {
  const baseFormat = resolveTableBaseFormat(settings);
  const separator = getLatexRuleSeparator(baseFormat);
  const columns = clampMatrixDimension(settings.columns, TABLE_MIN_COLUMNS, TABLE_MAX_COLUMNS);
  const specs = Array.from({ length: columns }, (_unused, columnIndex) => {
    const columnFormat = resolveTableColumnFormat(settings, columnIndex);
    return getLatexAlignLetter(columnFormat.align);
  });

  if (!separator) {
    return specs.join("");
  }

  return `${separator}${specs.join(separator)}${separator}`;
}

function getLatexRowRule(format: TableResolvedCellFormat): string | null {
  switch (format.strokeStyle) {
    case "none":
      return null;
    case "double":
      return "\\hline\\hline";
    case "dashed":
    case "dotted":
      return "\\hdashline";
    case "solid":
    default:
      return "\\hline";
  }
}

function getLatexMulticolumnSpec(format: TableResolvedCellFormat): string {
  const separator = getLatexRuleSeparator(format);
  const align = getLatexAlignLetter(format.align);

  return separator ? `${separator}${align}${separator}` : align;
}

function getLatexRuleSeparatorForBorder(border: TableCellBorder | null): string {
  switch (border?.strokeStyle) {
    case "none":
    case undefined:
      return "";
    case "double":
      return "||";
    case "dashed":
    case "dotted":
      return ":";
    case "solid":
    default:
      return "|";
  }
}

function hasExplicitLatexVerticalBorders(settings: TableSettings, rowIndex: number, columnIndex: number): boolean {
  return Boolean(
    getTableFormatBorder(settings, rowIndex, columnIndex, "left") ||
    getTableFormatBorder(settings, rowIndex, columnIndex, "right")
  );
}

function getLatexCellMulticolumnSpec(
  settings: TableSettings,
  rowIndex: number,
  columnIndex: number,
  format: TableResolvedCellFormat
): string {
  if (!hasExplicitLatexVerticalBorders(settings, rowIndex, columnIndex)) {
    return getLatexMulticolumnSpec(format);
  }

  const left = getLatexRuleSeparatorForBorder(getTableFormatBorder(settings, rowIndex, columnIndex, "left"));
  const right = getLatexRuleSeparatorForBorder(getTableFormatBorder(settings, rowIndex, columnIndex, "right"));

  return `${left}${getLatexAlignLetter(format.align)}${right}`;
}

function getLatexHorizontalRuleForBorder(border: TableCellBorder, startColumn: number, endColumn: number): string[] {
  const range = `${startColumn}-${endColumn}`;

  switch (border.strokeStyle) {
    case "none":
      return [];
    case "double":
      return [`\\cline{${range}}`, `\\cline{${range}}`];
    case "dashed":
    case "dotted":
      return [`\\cdashline{${range}}`];
    case "solid":
    default:
      return [`\\cline{${range}}`];
  }
}

function getLatexHorizontalBorderCommands(
  settings: TableSettings,
  rowIndex: number,
  edge: "top" | "bottom"
): string[] {
  const columns = clampMatrixDimension(settings.columns, TABLE_MIN_COLUMNS, TABLE_MAX_COLUMNS);
  const commands: string[] = [];
  let segmentStart: number | null = null;
  let segmentEnd: number | null = null;
  let segmentBorder: TableCellBorder | null = null;
  const flushSegment = () => {
    if (segmentStart == null || segmentEnd == null || !segmentBorder) {
      return;
    }

    commands.push(...getLatexHorizontalRuleForBorder(segmentBorder, segmentStart, segmentEnd));
    segmentStart = null;
    segmentEnd = null;
    segmentBorder = null;
  };

  for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
    const border = getTableFormatBorder(settings, rowIndex, columnIndex, edge);
    const borderKey = border ? `${border.strokeStyle}:${border.strokeWeight}` : "none";
    const segmentKey = segmentBorder ? `${segmentBorder.strokeStyle}:${segmentBorder.strokeWeight}` : "none";

    if (!border || border.strokeStyle === "none") {
      flushSegment();
      continue;
    }

    if (segmentStart == null) {
      segmentStart = columnIndex + 1;
      segmentEnd = columnIndex + 1;
      segmentBorder = border;
      continue;
    }

    if (borderKey === segmentKey && segmentEnd === columnIndex) {
      segmentEnd = columnIndex + 1;
      continue;
    }

    flushSegment();
    segmentStart = columnIndex + 1;
    segmentEnd = columnIndex + 1;
    segmentBorder = border;
  }

  flushSegment();
  return commands;
}

function formatLatexCellContent(settings: TableSettings, rowIndex: number, columnIndex: number, cellIndex: { current: number }): string {
  const cellValue = settings.cells[rowIndex]?.[columnIndex]?.trim() ?? "";

  if (cellValue) {
    return escapeLatexText(cellValue);
  }

  const placeholder = buildSnippetPlaceholder(
    cellIndex.current,
    getTableCellPlaceholder(rowIndex, columnIndex, settings)
  );
  cellIndex.current += 1;
  return placeholder;
}

function buildLatexTableCell(settings: TableSettings, rowIndex: number, columnIndex: number, cellIndex: { current: number }): { cell: string; columnSpan: number } | null {
  const merge = getTableMergeForCell(settings, rowIndex, columnIndex);

  if (merge && !tableMergeIsAnchor(merge, rowIndex, columnIndex)) {
    if (merge.row < rowIndex && merge.column === columnIndex) {
      const format = resolveTableCellFormat(settings, merge.row, merge.column);
      const emptyCell = merge.columnSpan > 1
        ? `\\multicolumn{${merge.columnSpan}}{${getLatexCellMulticolumnSpec(settings, merge.row, merge.column, format)}}{}`
        : "";

      return { cell: emptyCell, columnSpan: merge.columnSpan };
    }

    return null;
  }

  const columnFormat = resolveTableColumnFormat(settings, columnIndex);
  const cellFormat = resolveTableCellFormat(settings, rowIndex, columnIndex);
  const columnSpan = merge?.columnSpan ?? 1;
  const rowSpan = merge?.rowSpan ?? 1;
  let content = formatLatexCellContent(settings, rowIndex, columnIndex, cellIndex);
  const backgroundColor = getLatexHtmlColor(cellFormat.backgroundColor);

  if (backgroundColor) {
    content = `\\cellcolor[HTML]{${backgroundColor}}${content}`;
  }

  if (rowSpan > 1) {
    content = `\\multirow{${rowSpan}}{*}{${content}}`;
  }

  if (
    columnSpan > 1 ||
    cellFormat.align !== columnFormat.align ||
    hasExplicitLatexVerticalBorders(settings, rowIndex, columnIndex)
  ) {
    content = `\\multicolumn{${columnSpan}}{${getLatexCellMulticolumnSpec(settings, rowIndex, columnIndex, cellFormat)}}{${content}}`;
  }

  return { cell: content, columnSpan };
}

function getLatexTableSetupLines(settings: TableSettings): string[] {
  const baseFormat = resolveTableBaseFormat(settings);
  const padding = getTablePaddingOption(baseFormat.padding);
  const weight = getTableStrokeWeightOption(baseFormat.strokeWeight);
  const lines: string[] = [];

  if (baseFormat.padding !== "small") {
    lines.push(`\\setlength{\\tabcolsep}{${padding.latexTabcolsep}}`);
    lines.push(`\\renewcommand{\\arraystretch}{${padding.latexArrayStretch}}`);
  }

  if (baseFormat.strokeStyle !== "none") {
    lines.push(`\\setlength{\\arrayrulewidth}{${weight.latexValue}}`);
  }

  if (baseFormat.strokeStyle === "dashed") {
    lines.push("\\setlength{\\dashlinedash}{3pt}");
    lines.push("\\setlength{\\dashlinegap}{2pt}");
  }

  if (baseFormat.strokeStyle === "dotted") {
    lines.push("\\setlength{\\dashlinedash}{0.6pt}");
    lines.push("\\setlength{\\dashlinegap}{1.4pt}");
  }

  return lines;
}

function buildLatexTableTemplate(settings: TableSettings): string {
  const rows = clampMatrixDimension(settings.rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const columns = clampMatrixDimension(settings.columns, TABLE_MIN_COLUMNS, TABLE_MAX_COLUMNS);
  const baseFormat = resolveTableBaseFormat(settings);
  const rowRule = getLatexRowRule(baseFormat);
  const cellIndex = { current: 1 };
  const lines: string[] = [];

  if (rowRule) {
    lines.push(`  ${rowRule}`);
  }

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const rowCells: string[] = [];
    const topBorderCommands = getLatexHorizontalBorderCommands(settings, rowIndex, "top");

    for (const command of topBorderCommands) {
      lines.push(`  ${command}`);
    }

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const builtCell = buildLatexTableCell(settings, rowIndex, columnIndex, cellIndex);

      if (!builtCell) {
        continue;
      }

      rowCells.push(builtCell.cell);
      columnIndex += Math.max(0, builtCell.columnSpan - 1);
    }

    lines.push(`  ${rowCells.join(" & ")} \\\\`);

    for (const command of getLatexHorizontalBorderCommands(settings, rowIndex, "bottom")) {
      lines.push(`  ${command}`);
    }

    if (
      rowRule &&
      (rowIndex === rows - 1 || (settings.header && rowIndex === 0) || isTableFooterRow(settings, rowIndex))
    ) {
      lines.push(`  ${rowRule}`);
    }
  }

  const setup = getLatexTableSetupLines(settings);
  const tabular = `${setup.length > 0 ? `${setup.join("\n")}\n` : ""}\\begin{tabular}{${getLatexColumnSpec(settings)}}\n${lines.join("\n")}\n\\end{tabular}`;
  const caption = settings.caption.trim();

  if (!caption) {
    return tabular;
  }

  return `\\begin{table}[htbp]\n\\centering\n\\caption{${escapeLatexText(caption)}}\n${tabular}\n\\end{table}`;
}

function tableHasExplicitBorderStyle(settings: TableSettings, styles: TableStrokeStyle[]): boolean {
  return settings.cellFormats.some((row) =>
    row.some((format) =>
      TABLE_BORDER_EDGES.some((edge) => {
        const border = format.borders?.[edge];
        return Boolean(border && styles.includes(border.strokeStyle));
      })
    )
  );
}

function getLatexTableRequiredPackages(settings: TableSettings): string[] {
  const packages: string[] = [];
  const baseFormat = resolveTableBaseFormat(settings);

  if (settings.merges.some((merge) => merge.rowSpan > 1)) {
    packages.push("multirow");
  }

  if (
    baseFormat.strokeStyle === "dashed" ||
    baseFormat.strokeStyle === "dotted" ||
    tableHasExplicitBorderStyle(settings, ["dashed", "dotted"])
  ) {
    packages.push("arydshln");
  }

  if (tableHasBackgroundColor(settings)) {
    packages.push("xcolor", "colortbl");
  }

  return packages;
}

function buildMarkdownTableTemplate(settings: TableSettings): string {
  const rows = clampMatrixDimension(settings.rows, TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const columns = clampMatrixDimension(settings.columns, TABLE_MIN_COLUMNS, TABLE_MAX_COLUMNS);
  const cellIndex = { current: 1 };
  const buildCell = (rowIndex: number, columnIndex: number) => {
    const merge = getTableMergeForCell(settings, rowIndex, columnIndex);

    if (merge && !tableMergeIsAnchor(merge, rowIndex, columnIndex)) {
      return "";
    }

    const cellValue = settings.cells[rowIndex]?.[columnIndex]?.trim() ?? "";

    if (cellValue) {
      return escapeMarkdownTableCell(cellValue);
    }

    const placeholder = buildSnippetPlaceholder(
      cellIndex.current,
      getTableCellPlaceholder(rowIndex, columnIndex, settings)
    );
    cellIndex.current += 1;
    return placeholder;
  };
  const lines: string[] = [];
  const caption = settings.caption.trim();

  if (caption) {
    lines.push(`Table: ${escapeSnippetText(caption).replace(/\r?\n/g, " ")}`);
    lines.push("");
  }

  lines.push(`| ${Array.from({ length: columns }, (_unused, columnIndex) => buildCell(0, columnIndex)).join(" | ")} |`);
  lines.push(`| ${Array.from({ length: columns }, (_unused, columnIndex) => {
    const align = resolveTableColumnFormat(settings, columnIndex).align;

    if (align === "right") {
      return "---:";
    }

    if (align === "center") {
      return ":---:";
    }

    return ":---";
  }).join(" | ")} |`);

  for (let rowIndex = 1; rowIndex < rows; rowIndex += 1) {
    lines.push(`| ${Array.from({ length: columns }, (_unused, columnIndex) => buildCell(rowIndex, columnIndex)).join(" | ")} |`);
  }

  return lines.join("\n");
}


interface ParsedTableSettingsOptions {
  caption?: string;
  header?: boolean;
  footer?: boolean;
  striped?: boolean;
  align?: TableHorizontalAlignment;
  gutter?: TableGutter;
  tableFormat?: TableCellFormat;
  columnFormats?: TableCellFormat[];
  rowFormats?: TableCellFormat[];
  cellFormats?: TableCellFormat[][];
  merges?: TableMerge[];
}

interface SourceLineRange {
  from: number;
  to: number;
  lineBreakTo: number;
  text: string;
}

interface TypstTableCellToken {
  content: string;
  rowSpan: number;
  columnSpan: number;
  hasBackgroundColor?: boolean;
  backgroundColor?: string;
}

function findEditableTableAtCursor(
  source: string,
  language: SourceLanguage,
  cursorOffset: number
): EditableSourceTable | null {
  const cursor = clampSourceOffset(cursorOffset, source);

  if (language === "typst") {
    return findTypstTableAtCursor(source, cursor);
  }

  if (language === "latex") {
    return findLatexTableAtCursor(source, cursor);
  }

  if (isMarkdownTableLanguage(language)) {
    return findMarkdownTableAtCursor(source, cursor, language);
  }

  return null;
}

function clampSourceOffset(offset: number, source: string): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(source.length, Math.max(0, Math.floor(offset)));
}

function createParsedTableSettings(cells: string[][], options: ParsedTableSettingsOptions = {}): TableSettings {
  const rowCount = clampMatrixDimension(Math.max(TABLE_MIN_ROWS, cells.length || 1), TABLE_MIN_ROWS, TABLE_MAX_ROWS);
  const columnCount = clampMatrixDimension(
    Math.max(TABLE_MIN_COLUMNS, ...cells.map((row) => row.length), 1),
    TABLE_MIN_COLUMNS,
    TABLE_MAX_COLUMNS
  );
  const normalizedCells = createTableCells(
    rowCount,
    columnCount,
    cells.slice(0, rowCount).map((row) => row.slice(0, columnCount))
  );
  const tableFormat = {
    ...DEFAULT_TABLE_FORMAT,
    ...(options.tableFormat ?? {})
  };
  const base = resizeTableSettings(createInitialTableSettings(), rowCount, columnCount);

  return {
    ...base,
    rows: rowCount,
    columns: columnCount,
    header: options.header ?? false,
    footer: rowCount > 1 ? options.footer ?? false : false,
    striped: options.striped ?? false,
    align: options.align ?? tableFormat.align ?? "left",
    gutter: options.gutter ?? base.gutter,
    inset: tableFormat.padding === "none" ? "none" : tableFormat.padding === "small" ? "small" : "medium",
    stroke: tableFormat.strokeStyle === "none" ? "none" : "default",
    caption: options.caption ?? "",
    cells: normalizedCells,
    tableFormat,
    columnFormats: createTableFormatList(columnCount, options.columnFormats),
    rowFormats: createTableFormatList(rowCount, options.rowFormats),
    cellFormats: createTableFormatGrid(rowCount, columnCount, options.cellFormats),
    merges: normalizeTableMergesForSize(options.merges ?? [], rowCount, columnCount)
  };
}

function stripGeneratedSnippetSyntax(value: string): string {
  return value
    .replace(/\$\{\d+:([^}]*)\}/g, "$1")
    .replace(/\$\{\d+\}/g, "")
    .replace(/\\([\\$}])/g, "$1")
    .trim();
}

function cleanParsedCellContent(value: string, language: SourceLanguage): string {
  let cleaned = stripGeneratedSnippetSyntax(value);

  if (language === "latex") {
    cleaned = cleaned
      .replace(/\\textbackslash\{\}/g, "\\")
      .replace(/\\textasciicircum\{\}/g, "^")
      .replace(/\\textasciitilde\{\}/g, "~")
      .replace(/\\([#$%&_{}])/g, "$1");
  } else if (language === "typst") {
    cleaned = cleaned.replace(/\\]/g, "]");
  } else if (isMarkdownTableLanguage(language)) {
    cleaned = cleaned.replace(/\\\|/g, "|");
  }

  return cleaned;
}

function getSourceLineRanges(source: string): SourceLineRange[] {
  const lines: SourceLineRange[] = [];
  let from = 0;

  while (from <= source.length) {
    let to = from;

    while (to < source.length && source[to] !== "\n" && source[to] !== "\r") {
      to += 1;
    }

    let lineBreakTo = to;

    if (source[to] === "\r" && source[to + 1] === "\n") {
      lineBreakTo = to + 2;
    } else if (source[to] === "\n" || source[to] === "\r") {
      lineBreakTo = to + 1;
    }

    lines.push({
      from,
      to,
      lineBreakTo,
      text: source.slice(from, to)
    });

    if (lineBreakTo >= source.length) {
      break;
    }

    from = lineBreakTo;
  }

  if (lines.length === 0) {
    lines.push({ from: 0, to: 0, lineBreakTo: 0, text: "" });
  }

  return lines;
}

function isMarkdownPipeRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && (trimmed.startsWith("|") || trimmed.endsWith("|"));
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const content = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const row = content.endsWith("|") ? content.slice(0, -1) : content;
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of row) {
    if (escaped) {
      current += `\\${char}`;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push((escaped ? `${current}\\` : current).trim());
  return cells;
}

function isMarkdownAlignmentRow(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function getMarkdownColumnFormat(alignmentCell: string): TableCellFormat {
  const trimmed = alignmentCell.trim();

  if (trimmed.startsWith(":") && trimmed.endsWith(":")) {
    return { align: "center" };
  }

  if (trimmed.endsWith(":")) {
    return { align: "right" };
  }

  return { align: "left" };
}

function findMarkdownTableAtCursor(
  source: string,
  cursor: number,
  language: SourceLanguage
): EditableSourceTable | null {
  const lines = getSourceLineRanges(source);

  for (let alignIndex = 1; alignIndex < lines.length; alignIndex += 1) {
    if (!isMarkdownAlignmentRow(lines[alignIndex].text) || !isMarkdownPipeRow(lines[alignIndex - 1].text)) {
      continue;
    }

    let tableStartIndex = alignIndex - 1;
    let replacementStartIndex = tableStartIndex;
    let tableEndIndex = alignIndex;
    let caption = "";

    while (
      tableEndIndex + 1 < lines.length &&
      isMarkdownPipeRow(lines[tableEndIndex + 1].text) &&
      !isMarkdownAlignmentRow(lines[tableEndIndex + 1].text)
    ) {
      tableEndIndex += 1;
    }

    if (
      replacementStartIndex >= 2 &&
      lines[replacementStartIndex - 1].text.trim() === "" &&
      /^Table:\s*/.test(lines[replacementStartIndex - 2].text.trim())
    ) {
      caption = lines[replacementStartIndex - 2].text.trim().replace(/^Table:\s*/, "");
      replacementStartIndex -= 2;
    }

    const from = lines[replacementStartIndex].from;
    const to = lines[tableEndIndex].to;

    if (cursor < from || cursor > to) {
      continue;
    }

    const alignmentCells = splitMarkdownTableRow(lines[alignIndex].text);
    const rows = [
      splitMarkdownTableRow(lines[tableStartIndex].text),
      ...lines
        .slice(alignIndex + 1, tableEndIndex + 1)
        .filter((line) => isMarkdownPipeRow(line.text))
        .map((line) => splitMarkdownTableRow(line.text))
    ].map((row) => row.map((cell) => cleanParsedCellContent(cell, language)));

    return {
      from,
      to,
      language,
      settings: createParsedTableSettings(rows, {
        caption: cleanParsedCellContent(caption, language),
        header: true,
        columnFormats: alignmentCells.map(getMarkdownColumnFormat)
      })
    };
  }

  return null;
}

function findLatexEnvironmentRangeAtCursor(
  source: string,
  cursor: number,
  environment: string
): { from: number; to: number } | null {
  const beginToken = `\\begin{${environment}}`;
  const endToken = `\\end{${environment}}`;
  let beginIndex = source.lastIndexOf(beginToken, cursor);

  while (beginIndex >= 0) {
    const endIndex = source.indexOf(endToken, beginIndex + beginToken.length);

    if (endIndex >= 0) {
      const to = endIndex + endToken.length;

      if (cursor >= beginIndex && cursor <= to) {
        return { from: beginIndex, to };
      }
    }

    beginIndex = source.lastIndexOf(beginToken, beginIndex - 1);
  }

  return null;
}

function findLatexTableAtCursor(source: string, cursor: number): EditableSourceTable | null {
  const outerRange = findLatexEnvironmentRangeAtCursor(source, cursor, "table");
  const tabularRange = findLatexEnvironmentRangeAtCursor(source, cursor, "tabular");
  const range = outerRange ?? tabularRange;

  if (!range) {
    return null;
  }

  const block = source.slice(range.from, range.to);
  const settings = parseLatexTableSettings(block);

  return settings ? { ...range, language: "latex", settings } : null;
}

function parseLatexTableSettings(block: string): TableSettings | null {
  const tabularMatch = /\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/.exec(block);

  if (!tabularMatch) {
    return null;
  }

  const columnSpec = tabularMatch[1];
  const body = tabularMatch[2];
  const rawRows = splitLatexTableRows(body);
  const rows: string[][] = [];
  const dataRowRawIndexes: number[] = [];
  const cellFormats: TableCellFormat[][] = [];
  const merges: TableMerge[] = [];

  rawRows.forEach((rawRow, rawIndex) => {
    const cleanedRow = cleanLatexTableRow(rawRow);

    if (!cleanedRow) {
      return;
    }

    const parsedRow = parseLatexTableRow(cleanedRow, rows.length, merges, cellFormats);

    if (parsedRow.length === 0 || parsedRow.every((cell) => cell.trim() === "")) {
      return;
    }

    rows.push(parsedRow);
    dataRowRawIndexes.push(rawIndex);
  });

  if (rows.length === 0) {
    return null;
  }

  const columnFormats = parseLatexColumnFormats(columnSpec);
  const columnCount = Math.max(columnFormats.length, ...rows.map((row) => row.length), 1);
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_unused, index) => row[index] ?? ""));
  const header = dataRowRawIndexes.length > 1 && latexRowStartsWithRule(rawRows[dataRowRawIndexes[1]] ?? "");

  return createParsedTableSettings(normalizedRows, {
    caption: extractLatexCommandArgument(block, "caption") ?? "",
    header,
    columnFormats,
    tableFormat: parseLatexTableFormat(block, columnSpec),
    cellFormats,
    merges
  });
}

function splitLatexTableRows(body: string): string[] {
  const rows: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const nextChar = body[index + 1];

    if (char === "\\" && nextChar === "\\" && braceDepth === 0) {
      rows.push(current);
      current = "";
      index += 1;
      continue;
    }

    current += char;

    if (char === "{" && !isEscapedAt(body, index)) {
      braceDepth += 1;
    } else if (char === "}" && !isEscapedAt(body, index)) {
      braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  if (current.trim()) {
    rows.push(current);
  }

  return rows;
}

function cleanLatexTableRow(row: string): string {
  return row
    .replace(/%[^\n\r]*/g, "")
    .replace(/\\(?:hline|hdashline)\b/g, "")
    .replace(/\\c(?:dash)?line\{[^}]*\}/g, "")
    .replace(/\\setlength\{[^}]*\}\{[^}]*\}/g, "")
    .replace(/\\renewcommand\{[^}]*\}\{[^}]*\}/g, "")
    .trim();
}

function latexRowStartsWithRule(row: string): boolean {
  return /^\s*\\(?:hline|hdashline)\b/.test(row.replace(/%[^\n\r]*/g, ""));
}

function parseLatexTableRow(
  row: string,
  rowIndex: number,
  merges: TableMerge[],
  cellFormats: TableCellFormat[][]
): string[] {
  const cells: string[] = [];
  let columnIndex = 0;

  for (const rawCell of splitLatexCells(row)) {
    const parsedCell = parseLatexCell(rawCell);

    cells[columnIndex] = cleanParsedCellContent(parsedCell.content, "latex");

    if (parsedCell.backgroundColor) {
      cellFormats[rowIndex] ??= [];
      cellFormats[rowIndex][columnIndex] = { backgroundColor: parsedCell.backgroundColor };
    }

    if (parsedCell.columnSpan > 1 || parsedCell.rowSpan > 1) {
      merges.push({
        row: rowIndex,
        column: columnIndex,
        rowSpan: parsedCell.rowSpan,
        columnSpan: parsedCell.columnSpan
      });
    }

    for (let spanOffset = 1; spanOffset < parsedCell.columnSpan; spanOffset += 1) {
      cells[columnIndex + spanOffset] = "";
    }

    columnIndex += parsedCell.columnSpan;
  }

  return cells;
}

function splitLatexCells(row: string): string[] {
  const cells: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];

    if (char === "&" && braceDepth === 0 && !isEscapedAt(row, index)) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;

    if (char === "{" && !isEscapedAt(row, index)) {
      braceDepth += 1;
    } else if (char === "}" && !isEscapedAt(row, index)) {
      braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseLatexCell(rawCell: string): { content: string; columnSpan: number; rowSpan: number; backgroundColor?: string } {
  let content = rawCell.trim();
  let columnSpan = 1;
  let rowSpan = 1;
  let backgroundColor: string | undefined;
  const multicolumn = readLatexCommandArguments(content, "multicolumn", 3);

  if (multicolumn && multicolumn.start === 0) {
    columnSpan = Math.max(1, Number.parseInt(multicolumn.args[0], 10) || 1);
    content = multicolumn.args[2].trim();
  }

  const multirow = readLatexCommandArguments(content, "multirow", 3);

  if (multirow && multirow.start === 0) {
    rowSpan = Math.max(1, Number.parseInt(multirow.args[0], 10) || 1);
    content = multirow.args[2].trim();
  }

  const colorMatch = /\\cellcolor(?:\[HTML])?\{([0-9a-fA-F]{6})\}/.exec(content);

  if (colorMatch) {
    backgroundColor = `#${colorMatch[1].toLowerCase()}`;
    content = content.replace(colorMatch[0], "").trim();
  }

  return { content, columnSpan, rowSpan, backgroundColor };
}

function readLatexCommandArguments(
  source: string,
  command: string,
  expectedCount: number
): { args: string[]; start: number; end: number } | null {
  const commandStart = source.indexOf(`\\${command}`);

  if (commandStart < 0) {
    return null;
  }

  let index = commandStart + command.length + 1;
  const args: string[] = [];

  while (args.length < expectedCount) {
    while (/\s/.test(source[index] ?? "")) {
      index += 1;
    }

    if (source[index] !== "{") {
      return null;
    }

    const argument = readBalancedBrace(source, index);

    if (!argument) {
      return null;
    }

    args.push(argument.content);
    index = argument.end;
  }

  return { args, start: commandStart, end: index };
}

function readBalancedBrace(source: string, openIndex: number): { content: string; end: number } | null {
  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{" && !isEscapedAt(source, index)) {
      depth += 1;
      continue;
    }

    if (char === "}" && !isEscapedAt(source, index)) {
      depth -= 1;

      if (depth === 0) {
        return {
          content: source.slice(openIndex + 1, index),
          end: index + 1
        };
      }
    }
  }

  return null;
}

function extractLatexCommandArgument(source: string, command: string): string | null {
  const argument = readLatexCommandArguments(source, command, 1);
  return argument ? cleanParsedCellContent(argument.args[0], "latex") : null;
}

function parseLatexColumnFormats(columnSpec: string): TableCellFormat[] {
  const formats: TableCellFormat[] = [];

  for (const char of columnSpec) {
    if (char === "l") {
      formats.push({ align: "left" });
    } else if (char === "c") {
      formats.push({ align: "center" });
    } else if (char === "r") {
      formats.push({ align: "right" });
    }
  }

  return formats;
}

function parseLatexTableFormat(block: string, columnSpec: string): TableCellFormat {
  const padding = block.includes("\\tabcolsep}{0pt}")
    ? "none"
    : block.includes("\\tabcolsep}{10pt}")
      ? "large"
      : block.includes("\\tabcolsep}{6pt}")
        ? "medium"
        : "small";
  const strokeStyle: TableStrokeStyle = columnSpec.includes(":")
    ? "dashed"
    : columnSpec.includes("||")
      ? "double"
      : columnSpec.includes("|")
        ? "solid"
        : "none";
  const strokeWeight: TableStrokeWeight = block.includes("\\arrayrulewidth}{1.2pt}")
    ? "thick"
    : block.includes("\\arrayrulewidth}{0.8pt}")
      ? "medium"
      : "thin";

  return {
    padding,
    strokeStyle,
    strokeWeight
  };
}

function findTypstTableAtCursor(source: string, cursor: number): EditableSourceTable | null {
  const starts: number[] = [];

  for (const token of ["#table(", "#figure("]) {
    let index = source.indexOf(token);

    while (index >= 0 && index <= cursor) {
      starts.push(index);
      index = source.indexOf(token, index + token.length);
    }
  }

  starts.sort((left, right) => right - left);

  for (const start of starts) {
    const openIndex = source.indexOf("(", start);
    const end = findBalancedParenEnd(source, openIndex);

    if (end == null || cursor > end) {
      continue;
    }

    const block = source.slice(start, end);
    const settings = parseTypstTableSettings(block);

    if (settings) {
      return {
        from: start,
        to: end,
        language: "typst",
        settings
      };
    }
  }

  return null;
}

function parseTypstTableSettings(block: string): TableSettings | null {
  const tableStart = block.indexOf("table(");

  if (tableStart < 0) {
    return null;
  }

  const tableOpen = tableStart + "table".length;
  const tableEnd = findBalancedParenEnd(block, tableOpen);

  if (tableEnd == null) {
    return null;
  }

  const tableText = block.slice(tableStart, tableEnd);
  const columns = Number.parseInt(/columns:\s*(\d+)/.exec(tableText)?.[1] ?? "", 10);
  const columnCount = clampMatrixDimension(
    Number.isFinite(columns) && columns > 0 ? columns : 1,
    TABLE_MIN_COLUMNS,
    TABLE_MAX_COLUMNS
  );
  const tokens = parseTypstTableCellTokens(tableText);

  if (tokens.length === 0) {
    return null;
  }

  const { cells, merges, cellFormats } = buildTypstRowsFromTokens(tokens, columnCount);

  if (cells.length === 0) {
    return null;
  }

  return createParsedTableSettings(cells, {
    caption: parseTypstCaption(block),
    header: /table\.header\s*\(/.test(tableText),
    footer: /table\.footer\s*\(/.test(tableText),
    striped: /\bfill\s*:/.test(getTypstTablePreamble(tableText)),
    gutter: parseTypstGutter(tableText),
    tableFormat: parseTypstTableFormat(tableText),
    cellFormats,
    merges
  });
}

function parseTypstTableCellTokens(tableText: string): TypstTableCellToken[] {
  const tokens: TypstTableCellToken[] = [];

  for (let index = 0; index < tableText.length; index += 1) {
    if (tableText.startsWith("table.cell(", index)) {
      const openIndex = index + "table.cell".length;
      const end = findBalancedParenEnd(tableText, openIndex);

      if (end == null) {
        continue;
      }

      const args = tableText.slice(openIndex + 1, end - 1);
      let contentBlock = getLastTypstContentBlock(args);
      let contentEnd = end;

      if (!contentBlock) {
        let nextIndex = end;

        while (/\s/.test(tableText[nextIndex] ?? "")) {
          nextIndex += 1;
        }

        if (tableText[nextIndex] === "[") {
          contentBlock = readTypstContentBlock(tableText, nextIndex);
          contentEnd = contentBlock?.end ?? contentEnd;
        }
      }

      if (contentBlock) {
        const parsedFill = parseTypstFillArgument(args);

        tokens.push({
          content: contentBlock.content,
          rowSpan: Math.max(1, Number.parseInt(/rowspan:\s*(\d+)/.exec(args)?.[1] ?? "", 10) || 1),
          columnSpan: Math.max(1, Number.parseInt(/colspan:\s*(\d+)/.exec(args)?.[1] ?? "", 10) || 1),
          ...(parsedFill ? {
            hasBackgroundColor: true,
            backgroundColor: parsedFill === "none" ? "" : parsedFill
          } : {})
        });
      }

      index = Math.max(index, contentEnd - 1);
      continue;
    }

    if (tableText[index] === "[") {
      const contentBlock = readTypstContentBlock(tableText, index);

      if (contentBlock) {
        tokens.push({ content: contentBlock.content, rowSpan: 1, columnSpan: 1 });
        index = contentBlock.end - 1;
      }
    }
  }

  return tokens;
}

function buildTypstRowsFromTokens(
  tokens: TypstTableCellToken[],
  columns: number
): { cells: string[][]; merges: TableMerge[]; cellFormats: TableCellFormat[][] } {
  const cells: string[][] = [];
  const cellFormats: TableCellFormat[][] = [];
  const merges: TableMerge[] = [];
  let rowIndex = 0;
  let columnIndex = 0;
  const ensureRow = (index: number) => {
    cells[index] ??= Array.from({ length: columns }, () => "");
  };
  const isCovered = (row: number, column: number) => merges.some((merge) => tableMergeContainsCell(merge, row, column));

  for (const token of tokens) {
    while (true) {
      ensureRow(rowIndex);

      if (columnIndex >= columns) {
        rowIndex += 1;
        columnIndex = 0;
        continue;
      }

      if (isCovered(rowIndex, columnIndex)) {
        columnIndex += 1;
        continue;
      }

      break;
    }

    const columnSpan = Math.min(columns - columnIndex, Math.max(1, token.columnSpan));
    const rowSpan = Math.max(1, token.rowSpan);
    cells[rowIndex][columnIndex] = cleanParsedCellContent(token.content, "typst");

    if (token.hasBackgroundColor) {
      cellFormats[rowIndex] ??= [];
      cellFormats[rowIndex][columnIndex] = { backgroundColor: token.backgroundColor ?? "" };
    }

    for (let spanOffset = 1; spanOffset < columnSpan; spanOffset += 1) {
      cells[rowIndex][columnIndex + spanOffset] = "";
    }

    if (rowSpan > 1 || columnSpan > 1) {
      merges.push({
        row: rowIndex,
        column: columnIndex,
        rowSpan,
        columnSpan
      });
    }

    columnIndex += columnSpan;
  }

  return { cells, merges, cellFormats };
}

function parseTypstFillArgument(source: string): string | "none" | null {
  if (/\bfill:\s*none\b/.test(source)) {
    return "none";
  }

  const color = /\bfill:\s*rgb\("(#[0-9a-fA-F]{6})"\)/.exec(source)?.[1];
  return color ? color.toLowerCase() : null;
}

function findBalancedParenEnd(source: string, openIndex: number): number | null {
  if (openIndex < 0 || source[openIndex] !== "(") {
    return null;
  }

  let depth = 0;
  let squareDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "[") {
      squareDepth += 1;
      continue;
    }

    if (char === "]" && squareDepth > 0) {
      squareDepth -= 1;
      continue;
    }

    if (squareDepth > 0) {
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return null;
}

function readTypstContentBlock(source: string, openIndex: number): { content: string; end: number } | null {
  if (source[openIndex] !== "[") {
    return null;
  }

  let depth = 0;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;

      if (depth === 0) {
        return {
          content: source.slice(openIndex + 1, index),
          end: index + 1
        };
      }
    }
  }

  return null;
}

function getLastTypstContentBlock(source: string): { content: string; end: number } | null {
  let lastBlock: { content: string; end: number } | null = null;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "[") {
      continue;
    }

    const block = readTypstContentBlock(source, index);

    if (!block) {
      continue;
    }

    lastBlock = block;
    index = block.end - 1;
  }

  return lastBlock;
}

function getTypstTablePreamble(tableText: string): string {
  const bodyStarts = ["table.header(", "table.footer(", "table.cell(", "[" ]
    .map((token) => tableText.indexOf(token))
    .filter((index) => index > 0);
  const end = bodyStarts.length > 0 ? Math.min(...bodyStarts) : tableText.length;

  return tableText.slice(0, end);
}

function parseTypstCaption(block: string): string {
  const captionIndex = block.indexOf("caption:");

  if (captionIndex < 0) {
    return "";
  }

  const openIndex = block.indexOf("[", captionIndex);
  const contentBlock = openIndex >= 0 ? readTypstContentBlock(block, openIndex) : null;

  return contentBlock ? cleanParsedCellContent(contentBlock.content, "typst") : "";
}

function parseTypstGutter(tableText: string): TableGutter | undefined {
  const preamble = getTypstTablePreamble(tableText);
  const gutterValue = /gutter:\s*([^,\n]+)/.exec(preamble)?.[1]?.trim();

  return TABLE_GUTTER_OPTIONS.find((option) => option.value === gutterValue)?.id;
}

function parseTypstTableFormat(tableText: string): TableCellFormat {
  const preamble = getTypstTablePreamble(tableText);
  const alignMatch = /align:\s*(left|center|right)\s*\+\s*(top|horizon|bottom)/.exec(preamble);
  const insetValue = /inset:\s*([^,\n]+)/.exec(preamble)?.[1]?.trim();
  const fillColor = parseTypstTableFillColor(preamble);
  const padding = TABLE_PADDING_OPTIONS.find((option) => option.typstValue === insetValue)?.id ?? "small";
  const strokeStyle: TableStrokeStyle = /stroke:\s*none/.test(preamble)
    ? "none"
    : /dash:\s*"dotted"/.test(preamble)
      ? "dotted"
      : /dash:\s*"dashed"/.test(preamble)
        ? "dashed"
        : "solid";
  const strokeWeight: TableStrokeWeight = /1\.3pt/.test(preamble)
    ? "thick"
    : /0\.9pt/.test(preamble)
      ? "medium"
      : "thin";
  const verticalAlign = alignMatch?.[2] === "top"
    ? "top"
    : alignMatch?.[2] === "bottom"
      ? "bottom"
      : "middle";

  return {
    align: alignMatch?.[1] as TableHorizontalAlignment | undefined,
    verticalAlign,
    padding,
    strokeStyle,
    strokeWeight,
    ...(fillColor ? { backgroundColor: fillColor } : {})
  };
}

function parseTypstTableFillColor(preamble: string): string | null {
  const directFill = /\bfill:\s*rgb\("(#[0-9a-fA-F]{6})"\)/.exec(preamble)?.[1];

  if (directFill) {
    return directFill.toLowerCase();
  }

  const stripedFill = /else\s*\{\s*rgb\("(#[0-9a-fA-F]{6})"\)\s*}/.exec(preamble)?.[1];
  return stripedFill ? stripedFill.toLowerCase() : null;
}

function isEscapedAt(source: string, index: number): boolean {
  let slashCount = 0;

  for (let current = index - 1; current >= 0 && source[current] === "\\"; current -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
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

function DocumentStatsPanel({ stats }: { stats: DocumentStats }): ReactNode {
  return (
    <section className="document-stats" aria-label="Document statistics">
      <div className="document-stats__header">Document statistics</div>
      <dl className="document-stats__grid">
        <div>
          <dt>Words</dt>
          <dd>{formatInteger(stats.words)}</dd>
        </div>
        <div>
          <dt>Headings</dt>
          <dd>{formatInteger(stats.headings)}</dd>
        </div>
        <div>
          <dt>Equations</dt>
          <dd>{formatInteger(stats.equations)}</dd>
        </div>
        <div>
          <dt>Code blocks</dt>
          <dd>{formatInteger(stats.codeBlocks)}</dd>
        </div>
        <div>
          <dt>Characters</dt>
          <dd>{formatInteger(stats.characters)}</dd>
        </div>
        <div>
          <dt>No spaces</dt>
          <dd>{formatInteger(stats.charactersNoSpaces)}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{formatInteger(stats.lines)}</dd>
        </div>
        <div>
          <dt>Comments</dt>
          <dd>{formatInteger(stats.comments)}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(value);
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
    options?: { focusEditor?: boolean }
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
            onClick={() => focusDocumentLocation(documentId, entry.lineNumber, 1, { focusEditor: false })}
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

function areDiagnosticSourceSnapshotsEqual(
  left: DiagnosticSourceSnapshot,
  right: DiagnosticSourceSnapshot
): boolean {
  return (
    left.source === right.source &&
    left.path === right.path &&
    left.language === right.language
  );
}

function createExternalDiagnosticPreferencesSignature(
  preferences: ExternalDiagnosticProviderPreferences
): string {
  return [
    preferences.harper.enabled ? "1" : "0",
    preferences.localLsp.enabled ? "1" : "0",
    preferences.localLsp.url,
    preferences.remoteLsp.enabled ? "1" : "0",
    preferences.remoteLsp.url,
    preferences.remoteLsp.allowDocumentUpload ? "1" : "0"
  ].join("\x1f");
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

function getEditorFormatterOptions(
  language: EditorToolLanguage
): Array<{ id: EditorFormatterId; label: string }> {
  const options: Array<{ id: EditorFormatterId; label: string }> = [
    { id: "disabled", label: "Disabled" },
    { id: "built-in", label: "Built in" }
  ];

  if (language === "latex") {
    options.push({ id: "tex-fmt", label: "tex-fmt" });
  }

  if (language === "typst") {
    options.push({ id: "typstyle", label: "typstyle" });
  }

  return options;
}

function formatEditorFormatterLabel(formatter: EditorFormatterId): string {
  return formatter === "tex-fmt"
    ? "tex-fmt"
    : formatter === "typstyle"
      ? "typstyle"
      : formatter === "built-in"
        ? "Built-in formatter"
        : "Formatter";
}
