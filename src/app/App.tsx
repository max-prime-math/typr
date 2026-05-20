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
  getActiveDocument,
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
import { TypstEditor } from "../editor/TypstEditor";
import {
  createEmptyGitHubRemoteConfig,
  hasRequiredConfig,
  pushProjectToGitHub,
  type GitHubRemoteConfig
} from "../github/githubSync";
import { PreviewPane } from "../preview/PreviewPane";
import { AUTO_THEME_ID, THEME_IMPORT_TEMPLATE } from "../theme/themes";
import {
  loadGitHubConfig,
  loadSnapshot,
  saveGitHubConfig,
  saveSnapshot
} from "../storage/indexedDbStorage";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeDefinition } from "../theme/themes";

const COMPILE_DEBOUNCE_MS = 60;
const SAVE_DEBOUNCE_MS = 250;
const MENU_CLOSE_DELAY_MS = 140;
const PANEL_LAYOUT_STORAGE_KEY = "typr.panel-layout";
const SIDEBAR_DEFAULT_WIDTH = 300;
const PREVIEW_DEFAULT_WIDTH = 420;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 460;
const PREVIEW_MIN_WIDTH = 320;
const PANEL_COLLAPSED_WIDTH = 56;
const PANEL_HANDLE_WIDTH = 12;
const EDITOR_MIN_WIDTH = 420;
const THEME_TEMPLATE_FILENAME = "typr-theme-template.json";

const MENU_ITEMS = ["Typr", "File", "View", "Help"] as const;
type MenuLabel = (typeof MENU_ITEMS)[number];
type WorkspaceMode = "split" | "sidebar" | "editor" | "preview";
type SettingsTab = "github" | "themes";

interface SyncFeedback {
  tone: "neutral" | "success" | "error";
  text: string;
}

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

export function App() {
  const menuStripRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const themeImportInputRef = useRef<HTMLInputElement | null>(null);
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("split");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [previewWidth, setPreviewWidth] = useState(PREVIEW_DEFAULT_WIDTH);
  const [compilerStatus, setCompilerStatus] = useState<CompilerStatus>({
    phase: "idle",
    mode: "worker",
    label: "Waiting to compile"
  });
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

      if (cancelled) {
        return;
      }

      const nextSnapshot = storedSnapshot ?? createDefaultSnapshot();
      setSnapshot(nextSnapshot);
      setTheme(nextSnapshot.preferences.theme);
      setGitHubConfig(storedGitHubConfig ?? createEmptyGitHubRemoteConfig());
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

    try {
      const stored = window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const layout = JSON.parse(stored) as {
        isSidebarCollapsed?: boolean;
        isPreviewCollapsed?: boolean;
        sidebarWidth?: number;
        previewWidth?: number;
      };

      if (typeof layout.isSidebarCollapsed === "boolean") {
        setIsSidebarCollapsed(layout.isSidebarCollapsed);
      }

      if (typeof layout.isPreviewCollapsed === "boolean") {
        setIsPreviewCollapsed(layout.isPreviewCollapsed);
      }

      if (typeof layout.sidebarWidth === "number") {
        setSidebarWidth(clampPanelWidth(layout.sidebarWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
      }

      if (typeof layout.previewWidth === "number") {
        setPreviewWidth(Math.max(PREVIEW_MIN_WIDTH, layout.previewWidth));
      }
    } catch {
      // Ignore malformed stored panel layout data.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        isSidebarCollapsed,
        isPreviewCollapsed,
        sidebarWidth,
        previewWidth
      })
    );
  }, [isPreviewCollapsed, isSidebarCollapsed, previewWidth, sidebarWidth]);

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
  }, [cancelPendingMenuClose, cancelPendingMenuOpen, handlePanelToggle, resetPanelWidths, setFullscreenMode]);

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

  const handleVimToggle = () => {
    setSnapshot((currentSnapshot) =>
      updateVimPreference(currentSnapshot, !currentSnapshot.preferences.vimMode)
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
    setPreviewWidth(PREVIEW_DEFAULT_WIDTH);
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

      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1080px)").matches) {
        return;
      }

      const workspace = workspaceRef.current;
      if (!workspace) {
        return;
      }

      event.preventDefault();

      const startWidth = edge === "sidebar" ? sidebarWidth : previewWidth;
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
        const workspaceWidth = workspace.getBoundingClientRect().width;
        const nextWidth =
          edge === "sidebar"
            ? resizeState.startWidth + delta
            : resizeState.startWidth - delta;
        const previewPaneWidth = isPreviewCollapsed ? PANEL_COLLAPSED_WIDTH : previewWidth;
        const sidebarPaneWidth = isSidebarCollapsed ? PANEL_COLLAPSED_WIDTH : sidebarWidth;
        const totalHandleWidth = PANEL_HANDLE_WIDTH * 2;
        const otherPaneWidth = edge === "sidebar" ? previewPaneWidth : sidebarPaneWidth;
        const remainingWidth = workspaceWidth - totalHandleWidth - EDITOR_MIN_WIDTH - otherPaneWidth;
        const minWidth = edge === "sidebar" ? SIDEBAR_MIN_WIDTH : PREVIEW_MIN_WIDTH;
        const maxWidth =
          edge === "sidebar"
            ? Math.min(SIDEBAR_MAX_WIDTH, remainingWidth)
            : remainingWidth;
        const clampedWidth = clampPanelWidth(nextWidth, minWidth, Math.max(minWidth, maxWidth));

        if (edge === "sidebar") {
          setSidebarWidth(clampedWidth);
          if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
          }
        } else {
          setPreviewWidth(clampedWidth);
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
    [isPreviewCollapsed, isSidebarCollapsed, previewWidth, sidebarWidth, workspaceMode]
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
  const lightThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "light");
  const darkThemes = allThemes.filter((themeDefinition) => themeDefinition.mode === "dark");
  const sidebarPaneWidth = isSidebarCollapsed ? PANEL_COLLAPSED_WIDTH : sidebarWidth;
  const previewPaneWidth = isPreviewCollapsed ? PANEL_COLLAPSED_WIDTH : previewWidth;
  const workspaceGridStyle =
    workspaceMode === "split"
      ? {
          gridTemplateColumns: `${sidebarPaneWidth}px ${PANEL_HANDLE_WIDTH}px minmax(0, 1fr) ${PANEL_HANDLE_WIDTH}px ${previewPaneWidth}px`
        }
      : {
          gridTemplateColumns: "minmax(0, 1fr)"
        };

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
            <div className="menu-note">Local-first Typst editor for offline writing.</div>
            <div className="menu-note">{storageLabel}</div>
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
              New file
            </button>
            <button
              className="menu-action"
              disabled={!canPushToGitHub}
              onClick={() => {
                void handlePushToGitHub();
                setActiveMenu(null);
              }}
              type="button"
            >
              {isSyncing ? "Pushing..." : "Push project"}
            </button>
            <div className="menu-note">
              {snapshot.project.documents.length} file
              {snapshot.project.documents.length === 1 ? "" : "s"} in this project
            </div>
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
            <button
              className="menu-action"
              onClick={() => setFullscreenMode("split")}
              type="button"
            >
              {workspaceMode === "split" ? "✓ " : ""}Show all panes
            </button>
            <button
              className="menu-action"
              onClick={() => setFullscreenMode("sidebar")}
              type="button"
            >
              {workspaceMode === "sidebar" ? "✓ " : ""}Only show files
            </button>
            <button
              className="menu-action"
              onClick={() => setFullscreenMode("editor")}
              type="button"
            >
              {workspaceMode === "editor" ? "✓ " : ""}Only show editor
            </button>
            <button
              className="menu-action"
              onClick={() => setFullscreenMode("preview")}
              type="button"
            >
              {workspaceMode === "preview" ? "✓ " : ""}Only show preview
            </button>
            <button className="menu-action" onClick={handleVimToggle} type="button">
              Vim mode: {snapshot.preferences.vimMode ? "On" : "Off"}
            </button>
            <button
              className="menu-action"
              onClick={() => {
                setSettingsTab("themes");
                setIsSettingsOpen(true);
                setActiveMenu(null);
              }}
              type="button"
            >
              Theme: {snapshot.preferences.theme === AUTO_THEME_ID ? `Auto · ${theme.name}` : theme.name}
            </button>
            <button className="menu-action" onClick={() => handlePanelToggle("sidebar")} type="button">
              Sidebar: {isSidebarCollapsed ? "Show" : "Hide"}
            </button>
            <button className="menu-action" onClick={() => handlePanelToggle("preview")} type="button">
              Preview: {isPreviewCollapsed ? "Show" : "Hide"}
            </button>
            <button className="menu-action" onClick={resetPanelWidths} type="button">
              Reset panel widths
            </button>
            <div className="menu-note">Current view: {workspaceModeLabel}</div>
            <div className="menu-note">Shortcuts: Cmd/Ctrl+Alt+1 files, 2 editor, 3 preview, 4 split, B sidebar, P preview, 0 reset</div>
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
            <div className="menu-note">Offline preview works after the installed app caches its fonts once online.</div>
            <div className="menu-note">Use GitHub sync when the device comes back online.</div>
            <div className="menu-note">Active file: {activeDocument.name}</div>
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
        className={`workspace workspace--triple workspace--${workspaceMode}`}
        ref={workspaceRef}
        style={workspaceGridStyle}
      >
        <aside
          className={`pane pane--sidebar ${isSidebarCollapsed ? "pane--collapsed" : ""}`}
          aria-label="Files and sync"
        >
          {isSidebarCollapsed ? (
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

        <button
          aria-label="Resize sidebar"
          className="workspace-handle workspace-handle--left"
          onPointerDown={beginPanelResize("sidebar")}
          type="button"
        />

        <section className="pane pane--editor" aria-label="Typst source editor">
          <div className="pane__header">
            <div className="pane__header-group">
              <h2>Source</h2>
              <span className="pane__subtitle">{activeDocument.name}</span>
            </div>
            <div className="pane__header-actions">
              <span className="pane__meta">{storageLabel}</span>
              <button
                className="pane__button pane__button--quiet"
                onClick={() => handlePanelToggle("preview")}
                type="button"
              >
                {isPreviewCollapsed ? "Show preview" : "Hide preview"}
              </button>
            </div>
          </div>
          <TypstEditor
            diagnostics={editorDiagnostics}
            highlightErrors={isErrorSettled}
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
        </section>

        <button
          aria-label="Resize preview"
          className="workspace-handle workspace-handle--right"
          onPointerDown={beginPanelResize("preview")}
          type="button"
        />

        <section
          className={`pane pane--preview ${isPreviewCollapsed ? "pane--collapsed" : ""}`}
          aria-label="Typst preview"
        >
          {isPreviewCollapsed ? (
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
                result={compileResult}
              />
            </>
          )}
        </section>
      </main>

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
                  Configure sync and themes from one place.
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
              ) : (
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
        ref={themeImportInputRef}
        accept=".json,application/json"
        className="visually-hidden"
        onChange={handleThemeImport}
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
