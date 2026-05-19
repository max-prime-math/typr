import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
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
  type AppSnapshot
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
import {
  loadGitHubConfig,
  loadSnapshot,
  saveGitHubConfig,
  saveSnapshot
} from "../storage/indexedDbStorage";
import { useTheme } from "../theme/ThemeProvider";

const COMPILE_DEBOUNCE_MS = 90;
const SAVE_DEBOUNCE_MS = 250;
const MENU_CLOSE_DELAY_MS = 140;

const MENU_ITEMS = ["typr", "File", "View", "Help"] as const;
type MenuLabel = (typeof MENU_ITEMS)[number];
type WorkspaceMode = "split" | "editor" | "preview";

interface SyncFeedback {
  tone: "neutral" | "success" | "error";
  text: string;
}

export function App() {
  const menuStripRef = useRef<HTMLElement | null>(null);
  const openMenuTimerRef = useRef<number | null>(null);
  const closeMenuTimerRef = useRef<number | null>(null);
  const compileTimerRef = useRef<number | null>(null);
  const compileRequestRef = useRef(0);
  const pendingSourceRef = useRef("");
  const compileInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const [activeMenu, setActiveMenu] = useState<MenuLabel | null>(null);
  const [isSyncSettingsOpen, setIsSyncSettingsOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("split");
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
  const { theme, setTheme } = useTheme();

  const activeDocument = getActiveDocument(snapshot.project);

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
        setIsSyncSettingsOpen(false);
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
  }, [cancelPendingMenuClose, cancelPendingMenuOpen]);

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

    try {
      const result = await compiler.compileDocument(source);

      if (!isMountedRef.current || requestId !== compileRequestRef.current) {
        return;
      }

      setCompileResult(result);
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
        scheduleCompile();
      } else {
        setIsCompiling(false);
      }
    }
  }, [compiler, isHydrated]);

  const scheduleCompile = useCallback(() => {
    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
    }

    setIsCompiling(true);
    compileTimerRef.current = window.setTimeout(() => {
      compileTimerRef.current = null;
      void runCompile();
    }, COMPILE_DEBOUNCE_MS);
  }, [runCompile]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    pendingSourceRef.current = activeDocument.content;
    scheduleCompile();
  }, [activeDocument.content, isHydrated, scheduleCompile]);

  const handleDocumentChange = useCallback((content: string) => {
    setSnapshot((currentSnapshot) => updateActiveDocument(currentSnapshot, content));
  }, []);

  const handleSelectDocument = (documentId: string) => {
    setSnapshot((currentSnapshot) => setActiveDocument(currentSnapshot, documentId));
  };

  const handleNewDocument = () => {
    setSnapshot((currentSnapshot) => createDocument(currentSnapshot));
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
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
      setIsSyncSettingsOpen(true);
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
            label="typr"
            onClose={closeMenusWithDelay}
            onNavigate={handleMenuNavigate}
            onOpen={() => openMenuWithDelay("typr")}
            onOpenImmediately={() => openMenuImmediately("typr")}
          >
            <button
              className="menu-action"
              onClick={() => {
                setIsSyncSettingsOpen(true);
                setActiveMenu(null);
              }}
              type="button"
            >
              GitHub sync settings
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
              onClick={() => setWorkspaceMode("split")}
              type="button"
            >
              {workspaceMode === "split" ? "✓ " : ""}Show all panes
            </button>
            <button
              className="menu-action"
              onClick={() => setWorkspaceMode("editor")}
              type="button"
            >
              {workspaceMode === "editor" ? "✓ " : ""}Only show editor
            </button>
            <button
              className="menu-action"
              onClick={() => setWorkspaceMode("preview")}
              type="button"
            >
              {workspaceMode === "preview" ? "✓ " : ""}Only show preview
            </button>
            <button className="menu-action" onClick={handleVimToggle} type="button">
              Vim mode: {snapshot.preferences.vimMode ? "On" : "Off"}
            </button>
            <button className="menu-action" onClick={handleThemeToggle} type="button">
              Theme: {theme === "light" ? "Light" : "Dark"}
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
      >
        <aside className="pane pane--sidebar" aria-label="Files and sync">
          <div className="pane__header">
            <h2>Files</h2>
            <button className="pane__button" onClick={handleNewDocument} type="button">
              New file
            </button>
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
                  onClick={() => setIsSyncSettingsOpen(true)}
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
        </aside>

        <section className="pane pane--editor" aria-label="Typst source editor">
          <div className="pane__header">
            <div className="pane__header-group">
              <h2>Source</h2>
              <span className="pane__subtitle">{activeDocument.name}</span>
            </div>
            <span className="pane__meta">{storageLabel}</span>
          </div>
          <TypstEditor
            diagnostics={editorDiagnostics}
            value={activeDocument.content}
            vimMode={snapshot.preferences.vimMode}
            theme={theme}
            onChange={handleDocumentChange}
          />
        </section>

        <section className="pane pane--preview" aria-label="Typst preview">
          <div className="pane__header">
            <div className="pane__header-group">
              <h2>Preview</h2>
              <span className="pane__subtitle">
                {compilerStatus.mode === "worker" ? "Worker render" : "Fallback render"}
              </span>
            </div>
            <span className="pane__meta">{isCompiling ? compilerStatus.label : "Live"}</span>
          </div>
          <PreviewPane
            compilerStatus={compilerStatus}
            isCompiling={isCompiling}
            result={compileResult}
          />
        </section>
      </main>

      {isSyncSettingsOpen ? (
        <div
          className="sheet-backdrop"
          onClick={() => setIsSyncSettingsOpen(false)}
          role="presentation"
        >
          <section
            aria-label="GitHub sync settings"
            className="settings-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-sheet__header">
              <div>
                <h2>GitHub Sync</h2>
                <p className="settings-sheet__copy">
                  Keep the project local-first, then push to GitHub when the device is
                  back online.
                </p>
              </div>
              <button
                className="pane__button"
                onClick={() => setIsSyncSettingsOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="settings-sheet__body">
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
    </div>
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
