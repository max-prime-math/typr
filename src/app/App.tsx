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
  getActiveDocument,
  renameActiveDocument,
  renameProject,
  setActiveDocument,
  updateActiveDocument,
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
import {
  TypstEditor,
  type TypstEditorHandle
} from "../editor/TypstEditor";
import {
  createEmptyGitHubRemoteConfig,
  hasRequiredConfig,
  pushProjectToGitHub,
  type GitHubRemoteConfig
} from "../github/githubSync";
import { PreviewPane } from "../preview/PreviewPane";
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
const EDITOR_MIN_WIDTH = 420;
const THEME_TEMPLATE_FILENAME = "typr-theme-template.json";
const SNIPPET_TEMPLATE_FILENAME = "typr-snippets.json";
const APP_VERSION = packageJson.version;
const PREVIEW_POPUP_STORAGE_KEY = "typr.preview-popup";
const SOURCE_TOOLBAR_STORAGE_KEY = "typr.source-toolbar";

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

interface SourceSymbolTooltipState {
  item: SourceSymbolItem;
  x: number;
  y: number;
}

const MENU_ITEMS = ["Typr", "File", "Edit", "View", "Help"] as const;
type MenuLabel = (typeof MENU_ITEMS)[number];
type WorkspaceMode = "split" | "sidebar" | "editor" | "preview";
type MobileWorkspaceTab = "files" | "editor" | "preview";
type SettingsTab = "github" | "themes" | "snippets";

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
  previewRatio: number
) {
  const availableWidth = Math.max(0, workspaceWidth - sidebarWidth - PANEL_HANDLE_WIDTH * 2);
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

export function App() {
  const [storedPanelLayout] = useState(readStoredPanelLayout);
  const menuStripRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<TypstEditorHandle | null>(null);
  const themeImportInputRef = useRef<HTMLInputElement | null>(null);
  const snippetImportInputRef = useRef<HTMLInputElement | null>(null);
  const documentUploadInputRef = useRef<HTMLInputElement | null>(null);
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
  const compileInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const [activeMenu, setActiveMenu] = useState<MenuLabel | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("github");
  const [themeImportFeedback, setThemeImportFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: ""
  });
  const [isPreviewPopupOpen, setIsPreviewPopupOpen] = useState(false);
  const [isSourceToolbarVisible, setIsSourceToolbarVisible] = useState(true);
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
  const [isHydrated, setIsHydrated] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [lastSuccessfulResult, setLastSuccessfulResult] = useState<
    Extract<CompileResult, { ok: true }> | null
  >(null);
  const [isErrorSettled, setIsErrorSettled] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [storageStatus, setStorageStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>({
    tone: "neutral",
    text: "Documents stay on this device. Push to GitHub when you are online."
  });
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const handleVimToggle = useCallback(() => {
    setSnapshot((currentSnapshot) =>
      updateVimPreference(currentSnapshot, !currentSnapshot.preferences.vimMode)
    );
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
  const previewSource = useMemo(
    () => createThemedPreviewSource(activeDocument.content, theme),
    [activeDocument.content, theme]
  );

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
      const storedSnippets = await loadCustomSnippets();

      if (cancelled) {
        return;
      }

      const nextSnapshot = storedSnapshot ?? createDefaultSnapshot();
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
    const requestId = compileRequestRef.current + 1;
    compileRequestRef.current = requestId;
    compileInFlightRef.current = true;
    const compileStartedAt =
      typeof performance === "undefined" ? 0 : performance.now();

    try {
      const result = await compiler.compileDocument(source);

      if (!isMountedRef.current || requestId !== compileRequestRef.current) {
        return;
      }

      const compileDurationMs =
        typeof performance === "undefined"
          ? 0
          : performance.now() - compileStartedAt;
      const nextResult = shouldReuseCompileResult(compileResult, result)
        ? compileResult
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

      if (pendingSourceRef.current !== source) {
        void runCompile();
      } else {
        setIsCompiling(false);
      }
    }
  }, [compileResult, compiler, isHydrated]);

  const scheduleCompile = useCallback(() => {
    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
    }

    setIsCompiling(true);

    if (compileInFlightRef.current) {
      return;
    }

    compileTimerRef.current = window.setTimeout(() => {
      compileTimerRef.current = null;
      void runCompile();
    }, COMPILE_DEBOUNCE_MS);
  }, [runCompile]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    pendingSourceRef.current = previewSource;
    scheduleCompile();
  }, [isHydrated, previewSource, scheduleCompile]);

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

  const downloadFile = (name: string, content: string, type = "text/plain") => {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 0);
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

  const handleExportPdf = () => {
    window.print();
  };

  const handleUndo = () => editorRef.current?.undo();
  const handleRedo = () => editorRef.current?.redo();
  const handleSearch = () => editorRef.current?.search();
  const handleGoToLine = () => editorRef.current?.goToLine();
  const handleSelectAll = () => editorRef.current?.selectAll();

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

  function createThemedPreviewSource(source: string, themeDefinition: ThemeDefinition) {
    const previewTextFill = themeDefinition.palette.editorForeground;
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
      const sidebarPaneWidth = isSidebarCollapsed ? PANEL_COLLAPSED_WIDTH : sidebarWidth;
      const remainingWidth = Math.max(0, workspaceWidth - sidebarPaneWidth - PANEL_HANDLE_WIDTH * 2);
      const startWidth =
        edge === "sidebar"
          ? sidebarWidth
          : getPreviewPaneWidth(workspaceWidth, sidebarPaneWidth, previewRatio);
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
          const clampedWidth = clampPanelWidth(
            nextWidth,
            PREVIEW_MIN_WIDTH,
            Math.max(PREVIEW_MIN_WIDTH, remainingWidth)
          );
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
  const lightThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "light");
  const darkThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "dark");
  const sidebarPaneWidth = isSidebarCollapsed ? PANEL_COLLAPSED_WIDTH : sidebarWidth;
  const effectiveWorkspaceWidth =
    workspaceWidth > 0 ? workspaceWidth : typeof window !== "undefined" ? window.innerWidth : 0;
  const isMobileWorkspace =
    effectiveWorkspaceWidth > 0 && effectiveWorkspaceWidth <= MOBILE_WORKSPACE_THRESHOLD;
  const previewPaneWidth = isPreviewCollapsed
    ? PANEL_COLLAPSED_WIDTH
    : getPreviewPaneWidth(effectiveWorkspaceWidth, sidebarPaneWidth, previewRatio);
  const sourcePaneWidth =
    workspaceMode === "split" && effectiveWorkspaceWidth > 0
      ? Math.max(
          0,
          effectiveWorkspaceWidth - sidebarPaneWidth - previewPaneWidth - PANEL_HANDLE_WIDTH * 2
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
          gridTemplateColumns: `${sidebarPaneWidth}px ${PANEL_HANDLE_WIDTH}px ${sourcePaneWidth}px ${PANEL_HANDLE_WIDTH}px ${previewPaneWidth}px`
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
  const sidebarPaneCollapsed = isSidebarCollapsed && !isMobileWorkspace;
  const previewPaneCollapsed = isPreviewCollapsed && !isMobileWorkspace;

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
            <button className="menu-action" onClick={handleExportPdf} type="button">
              Export PDF
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
              onClick={handleSearch}
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
            <button className="menu-action" onClick={() => handlePanelToggle("sidebar")} type="button">
              Files
            </button>
            <button className="menu-action" onClick={() => setFullscreenMode("editor")} type="button">
              Editor
            </button>
            <button className="menu-action" onClick={() => setFullscreenMode("preview")} type="button">
              Preview
            </button>
            <button className="menu-action" onClick={handleSearch} type="button">
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
            className={`status-pill ${
              isOnline ? "status-pill--online" : "status-pill--offline"
            }`}
          >
            {isOnline ? "Online" : "Offline"}
          </span>
          <span className="file-pill">{activeDocument.name}</span>
        </div>
      </header>

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

        <aside
          className={`pane pane--sidebar ${
            sidebarPaneCollapsed ? "pane--collapsed" : ""
          } ${sidebarVisibilityClass}`}
          aria-label="Files and sync"
        >
          {sidebarPaneCollapsed ? (
            <button
              className="pane__collapsed-toggle"
              onClick={() => handlePanelToggle("sidebar")}
              type="button"
            >
              Files
            </button>
          ) : (
            <>
              <div className="pane__header">
                <h2>Files</h2>
                <div className="pane__header-actions">
                  <button
                    className="pane__button"
                    onClick={handleNewDocument}
                    type="button"
                  >
                    New file
                  </button>
                  <button
                    className="pane__button pane__button--quiet"
                    onClick={() => handlePanelToggle("sidebar")}
                    type="button"
                  >
                    Hide
                  </button>
                </div>
              </div>

              <section className="sidebar-section">
                <div className="file-list" role="list">
                  {snapshot.project.documents.map((document) => (
                    <button
                      key={document.id}
                      className={`file-row ${
                        document.id === activeDocument.id ? "file-row--active" : ""
                      }`}
                      onClick={() => handleSelectDocument(document.id)}
                      type="button"
                    >
                      <span className="file-row__name">{document.name}</span>
                      <span className="file-row__meta">
                        {document.id === activeDocument.id ? "Open" : "Switch"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sidebar-section sidebar-section--status">
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
                        void handlePushToGitHub();
                      }}
                      type="button"
                    >
                      {isSyncing ? "Pushing..." : "Push"}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </aside>

        {isMobileWorkspace ? null : (
          <button
            aria-label="Resize sidebar"
            className="workspace-handle workspace-handle--left"
            onPointerDown={beginPanelResize("sidebar")}
            type="button"
          />
        )}

        <section
          className={`pane pane--editor ${editorVisibilityClass}`}
          aria-label="Typst source editor"
        >
          <div className="pane__header">
            <div className="pane__header-group">
              <h2>Source</h2>
              <span className="pane__subtitle">{activeDocument.name}</span>
            </div>
            <div className="pane__header-actions">
              <span className="pane__meta">{storageLabel}</span>
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
              <button
                className="pane__button pane__button--quiet"
                onClick={() => handlePanelToggle("preview")}
                type="button"
              >
                {isPreviewCollapsed ? "Show preview" : "Hide preview"}
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
            value={activeDocument.content}
            vimMode={snapshot.preferences.vimMode}
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
              <div className="pane__header">
                <div className="pane__header-group">
                  <h2>Preview</h2>
                  <span className="pane__subtitle">
                    {compilerStatus.mode === "worker" ? "Worker render" : "Fallback render"}
                  </span>
                </div>
                <div className="pane__header-actions">
                  <span className="pane__meta">{isCompiling ? compilerStatus.label : "Live"}</span>
                  <button
                    className="pane__button pane__button--quiet"
                    onClick={() => handlePanelToggle("preview")}
                    type="button"
                  >
                    Hide
                  </button>
                </div>
              </div>
              <PreviewPane
                compilerStatus={compilerStatus}
                isErrorSettled={isErrorSettled}
                isCompiling={isCompiling}
                lastSuccessfulResult={lastSuccessfulResult}
                onZoomChange={setPreviewZoom}
                result={compileResult}
                zoom={previewZoom}
              />
            </>
          )}
        </section>
      </main>

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
              onZoomChange={setPreviewZoom}
              result={compileResult}
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
                  Configure sync, themes, and snippets from one place.
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
                        placeholder="max-prime-math"
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
                        placeholder="typr"
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
                      placeholder="github_pat_..."
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
              ) : (
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
              )}
            </div>

            <div className="settings-sheet__footer">
              <button
                className="control-button"
                disabled={!canPushToGitHub}
                onClick={() => {
                  void handlePushToGitHub();
                }}
                type="button"
              >
                {isSyncing ? "Pushing..." : "Push project"}
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
