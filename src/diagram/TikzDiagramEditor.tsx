import { useEffect, useMemo, useRef, useState } from "react";
import { DiagramActionBar } from "./DiagramActionBar";
import {
  getTikzEditorUrl,
  isTrustedTikzEditorEvent,
  parseTikzEditorMessage
} from "./tikzEmbedProtocol";
import {
  getTikzFileName,
  normalizeTikzFileName,
  type TikzFigureFile
} from "./tikzFiles";
import {
  getTikzInsertionOptions,
  type TikzInsertMode
} from "./tikzInsertion";
import { applyTikzEditorTheme } from "./tikzThemeBridge";
import type { SourceLanguage } from "../compiler/sourceFileTypes";
import type { ThemeDefinition } from "../theme/themes";

interface TikzDiagramEditorProps {
  canInsert: boolean;
  figure: TikzFigureFile | null;
  figures: TikzFigureFile[];
  onChange: (path: string, source: string, svg?: string) => void;
  onCreate: () => void;
  onInsert: (
    path: string,
    source: string,
    svg: string,
    mode: TikzInsertMode
  ) => void | Promise<void>;
  onRename: (path: string, name: string) => void;
  onSelect: (path: string) => void;
  targetLanguage: SourceLanguage;
  theme: Pick<ThemeDefinition, "mode" | "palette">;
}

type EditorStatus = "loading" | "ready" | "modified" | "saving" | "saved" | "error";
type PendingExport = {
  kind: "insert";
  mode: TikzInsertMode;
} | null;

export function TikzDiagramEditor({
  canInsert,
  figure,
  figures,
  onChange,
  onCreate,
  onInsert,
  onRename,
  onSelect,
  targetLanguage,
  theme
}: TikzDiagramEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadedPathRef = useRef<string | null>(null);
  const latestSourceRef = useRef(figure?.source ?? "");
  const latestSvgRef = useRef(figure?.svg ?? "");
  const pendingExportRef = useRef<PendingExport>(null);
  const [fileNameDraft, setFileNameDraft] = useState(
    figure ? getTikzFileName(figure.path) : "diagram.tikz"
  );
  const [status, setStatus] = useState<EditorStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [insertMode, setInsertMode] = useState<TikzInsertMode>("recommended");
  const editorUrl = getTikzEditorUrl();
  const editorOrigin = new URL(editorUrl).origin;
  const insertionOptions = useMemo(
    () => getTikzInsertionOptions(targetLanguage),
    [targetLanguage]
  );

  const postToEditor = (message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), editorOrigin);
  };

  const applyActiveTheme = () => {
    const frameDocument = iframeRef.current?.contentDocument;
    if (frameDocument) {
      applyTikzEditorTheme(frameDocument, theme);
    }
  };

  const loadFigure = (nextFigure: TikzFigureFile) => {
    loadedPathRef.current = nextFigure.path;
    latestSourceRef.current = nextFigure.source;
    latestSvgRef.current = nextFigure.svg;
    setErrorMessage(null);
    setStatus("loading");
    postToEditor({
      action: "load",
      source: nextFigure.source,
      autosave: 1,
      fileName: getTikzFileName(nextFigure.path),
      settings: {
        general: {
          colorScheme: theme.mode
        }
      }
    });
  };

  useEffect(() => {
    setFileNameDraft(figure ? getTikzFileName(figure.path) : "diagram.tikz");

    if (!figure) {
      loadedPathRef.current = null;
      latestSourceRef.current = "";
      latestSvgRef.current = "";
      setStatus("ready");
      return;
    }

    if (
      loadedPathRef.current === figure.path &&
      latestSourceRef.current === figure.source
    ) {
      if (figure.svg) {
        latestSvgRef.current = figure.svg;
      }
      return;
    }

    if (iframeRef.current?.contentWindow) {
      loadFigure(figure);
    } else {
      latestSourceRef.current = figure.source;
      latestSvgRef.current = figure.svg;
    }
  }, [figure?.path, figure?.source, figure?.svg]);

  useEffect(() => {
    if (!insertionOptions.some((option) => option.mode === insertMode)) {
      setInsertMode(insertionOptions[0]?.mode ?? "recommended");
    }
  }, [insertMode, insertionOptions]);

  useEffect(() => {
    if (!figure || loadedPathRef.current !== figure.path) {
      return;
    }

    postToEditor({
      action: "settings",
      settings: {
        general: {
          colorScheme: theme.mode
        }
      }
    });
    applyActiveTheme();
  }, [figure?.path, theme]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        !isTrustedTikzEditorEvent(
          event,
          iframeRef.current?.contentWindow ?? null,
          editorOrigin
        )
      ) {
        return;
      }

      const message = parseTikzEditorMessage(event.data);
      if (!message?.event) {
        return;
      }

      if (message.event === "init") {
        applyActiveTheme();
        if (figure) {
          loadFigure(figure);
        } else {
          setStatus("ready");
        }
        return;
      }

      if (message.event === "loaded") {
        setStatus("ready");
        return;
      }

      if (message.event === "change" || message.event === "autosave" || message.event === "save") {
        if (!figure || loadedPathRef.current !== figure.path) {
          return;
        }

        const source =
          typeof message.source === "string"
            ? message.source
            : typeof message.xml === "string"
              ? message.xml
              : latestSourceRef.current;
        const svg = typeof message.svg === "string" ? message.svg : latestSvgRef.current;
        latestSourceRef.current = source;
        latestSvgRef.current = svg;
        onChange(figure.path, source, svg || undefined);
        setStatus(message.event === "change" ? "modified" : "saved");
        return;
      }

      if (message.event === "status" && typeof message.modified === "boolean") {
        setStatus(message.modified ? "modified" : "saved");
        return;
      }

      if (message.event === "export") {
        const source =
          typeof message.source === "string" ? message.source : latestSourceRef.current;
        const svg =
          typeof message.svg === "string"
            ? message.svg
            : typeof message.data === "string"
              ? message.data
              : latestSvgRef.current;
        const pendingExport = pendingExportRef.current;
        pendingExportRef.current = null;

        if (message.error || !svg.trim()) {
          setErrorMessage(message.error ?? "The TikZ preview is not ready yet.");
          setStatus("error");
          return;
        }

        latestSourceRef.current = source;
        latestSvgRef.current = svg;

        if (figure) {
          onChange(figure.path, source, svg);
          if (pendingExport?.kind === "insert") {
            setStatus("saving");
            void Promise.resolve(
              onInsert(figure.path, source, svg, pendingExport.mode)
            ).then(
              () => setStatus("saved"),
              (error) => {
                setErrorMessage(
                  error instanceof Error ? error.message : "Unable to insert the TikZ figure."
                );
                setStatus("error");
              }
            );
            return;
          }
        }
        setStatus("saved");
        return;
      }

      if (message.event === "message") {
        setErrorMessage(message.message ?? message.title ?? "TikZ editor reported an error.");
        if (message.kind === "error") {
          setStatus("error");
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [editorOrigin, figure, onChange, onInsert]);

  const handleRename = () => {
    if (!figure) {
      return;
    }

    const normalizedName = normalizeTikzFileName(fileNameDraft);
    setFileNameDraft(normalizedName);
    onRename(figure.path, normalizedName);
  };

  const handleSave = () => {
    if (!figure) {
      return;
    }

    setStatus("saving");
    postToEditor({ action: "save" });
  };

  const handleInsert = () => {
    if (!figure) {
      return;
    }

    pendingExportRef.current = {
      kind: "insert",
      mode: insertMode
    };
    setStatus("saving");
    setErrorMessage(null);
    postToEditor({ action: "export", format: "svg" });
  };

  if (!figure) {
    return (
      <div className="tikz-editor tikz-editor--empty">
        <div className="tikz-editor__empty-card">
          <div className="tikz-editor__empty-mark" aria-hidden="true">T<sub>i</sub>kZ</div>
          <h3>Create a TikZ figure</h3>
          <p>
            Draw on a canvas and keep the generated <code>.tikz</code> source in this project.
          </p>
          <button className="pane__button" onClick={onCreate} type="button">
            New TikZ figure
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tikz-editor">
      <div className="tikz-editor__filebar">
        <select
          aria-label="TikZ figure"
          className="tikz-editor__figure-select"
          onChange={(event) => onSelect(event.currentTarget.value)}
          value={figure.path}
        >
          {figures.map((item) => (
            <option key={item.path} value={item.path}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="tikz-editor__namebar">
        <input
          aria-label="TikZ file name"
          className="tikz-editor__filename"
          onBlur={handleRename}
          onChange={(event) => setFileNameDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          value={fileNameDraft}
        />
        <span className={`tikz-editor__status tikz-editor__status--${status}`}>
          {formatEditorStatus(status)}
        </span>
      </div>
      <DiagramActionBar
        insertDisabled={
          !canInsert ||
          insertionOptions.length === 0 ||
          status === "saving"
        }
        onInsert={handleInsert}
        onNew={onCreate}
        onSave={handleSave}
      >
        <select
          aria-label="TikZ insertion format"
          className="diagram-action-bar__wide-control"
          disabled={
            !canInsert ||
            insertionOptions.length < 2 ||
            status === "saving"
          }
          onChange={(event) => setInsertMode(event.currentTarget.value as TikzInsertMode)}
          value={insertMode}
        >
          {insertionOptions.length > 0 ? (
            insertionOptions.map((option) => (
              <option key={option.mode} value={option.mode}>
                {option.label}
              </option>
            ))
          ) : (
            <option value="recommended">Unsupported file</option>
          )}
        </select>
      </DiagramActionBar>
      {errorMessage ? (
        <div className="tikz-editor__error" role="alert">{errorMessage}</div>
      ) : null}
      <div className="tikz-editor__frame-shell">
        <iframe
          allow="clipboard-read; clipboard-write"
          className="tikz-editor__frame"
          onLoad={() => {
            setStatus("loading");
            applyActiveTheme();
            if (figure) {
              loadFigure(figure);
            }
          }}
          ref={iframeRef}
          src={editorUrl}
          title="Visual TikZ editor"
        />
      </div>
      <div className="tikz-editor__credit">
        Powered by{" "}
        <a
          href="https://github.com/DominikPeters/tikz-editor"
          rel="noreferrer"
          target="_blank"
        >
          TikZ Editor
        </a>
      </div>
    </div>
  );
}

function formatEditorStatus(status: EditorStatus): string {
  switch (status) {
    case "loading":
      return "Loading…";
    case "modified":
      return "Autosaving…";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Needs attention";
    default:
      return "Ready";
  }
}
