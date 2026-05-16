import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDefaultSnapshot,
  getActiveDocument,
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
import { PreviewPane } from "../preview/PreviewPane";
import { loadSnapshot, saveSnapshot } from "../storage/indexedDbStorage";
import { useTheme } from "../theme/ThemeProvider";

const COMPILE_DEBOUNCE_MS = 450;
const SAVE_DEBOUNCE_MS = 250;

export function App() {
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
  const [isHydrated, setIsHydrated] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [storageStatus, setStorageStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { theme, setTheme } = useTheme();

  const activeDocument = getActiveDocument(snapshot.project);

  useEffect(() => {
    return () => {
      compiler.dispose();
    };
  }, [compiler]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const storedSnapshot = await loadSnapshot();

      if (cancelled) {
        return;
      }

      if (storedSnapshot) {
        setSnapshot(storedSnapshot);
        setTheme(storedSnapshot.preferences.theme);
      } else {
        const initialSnapshot = createDefaultSnapshot();
        setSnapshot(initialSnapshot);
        setTheme(initialSnapshot.preferences.theme);
      }

      setIsHydrated(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [setTheme]);

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

    let cancelled = false;
    setIsCompiling(true);

    const handle = window.setTimeout(() => {
      void compiler
        .compileDocument(activeDocument.content)
        .then((result) => {
          if (!cancelled) {
            setCompileResult(result);
            setIsCompiling(false);
          }
        })
        .catch((error) => {
          if (!cancelled) {
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
            setIsCompiling(false);
          }
        });
    }, COMPILE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [activeDocument.content, compiler, isHydrated]);

  const handleDocumentChange = useCallback((content: string) => {
    setSnapshot((currentSnapshot) => updateActiveDocument(currentSnapshot, content));
  }, []);

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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__identity">
          <div>
            <p className="eyebrow">wrytr</p>
            <h1>{snapshot.project.name}</h1>
          </div>
          <div className="file-pill">{activeDocument.name}</div>
        </div>
        <div className="topbar__actions">
          <button className="control-button" onClick={handleThemeToggle} type="button">
            {theme === "light" ? "Dark theme" : "Light theme"}
          </button>
          <button className="control-button" onClick={handleVimToggle} type="button">
            Vim: {snapshot.preferences.vimMode ? "On" : "Off"}
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="pane pane--editor" aria-label="Typst source editor">
          <div className="pane__header">
            <h2>Source</h2>
            <span className="pane__meta">
              {storageStatus === "saved"
                ? "Saved locally"
                : storageStatus === "saving"
                  ? "Saving..."
                  : storageStatus === "error"
                    ? "Save failed"
                    : "Local-first"}
            </span>
          </div>
          <TypstEditor
            value={activeDocument.content}
            vimMode={snapshot.preferences.vimMode}
            theme={theme}
            onChange={handleDocumentChange}
          />
        </section>

        <section className="pane pane--preview" aria-label="Typst preview">
          <div className="pane__header">
            <h2>Preview</h2>
            <span className="pane__meta">
              {isCompiling ? compilerStatus.label : "Live"}
            </span>
          </div>
          <PreviewPane
            result={compileResult}
            isCompiling={isCompiling}
            compilerStatus={compilerStatus}
          />
        </section>
      </main>
    </div>
  );
}
