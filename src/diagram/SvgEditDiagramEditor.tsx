import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DiagramAsset,
  DiagramCanvasFrame,
  DiagramEndpoint,
  DiagramShape,
  DiagramStroke,
  DiagramStrokeStyle
} from "../app/appState";
import "svgedit/dist/editor/svgedit.css";
import { normalizeDiagramFileName } from "./diagramFiles";
import { serializeDiagramSvg } from "./DiagramEditor";

interface SvgEditDiagramEditorProps {
  diagram: DiagramAsset;
  inkColor: string;
  onInkColorChange: (color: string) => void;
  fillColor: string;
  onFillColorChange: (color: string) => void;
  strokeStyle: DiagramStrokeStyle;
  onStrokeStyleChange: (style: DiagramStrokeStyle) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  startMarker: DiagramEndpoint;
  onStartMarkerChange: (marker: DiagramEndpoint) => void;
  endMarker: DiagramEndpoint;
  onEndMarkerChange: (marker: DiagramEndpoint) => void;
  paperView?: boolean;
  isExpanded?: boolean;
  onExpandLeft?: () => void;
  onExpandRight?: () => void;
  onAddStroke: (stroke: DiagramStroke) => void;
  onAddShape: (shape: DiagramShape) => void;
  onUpdateStroke: (stroke: DiagramStroke) => void;
  onUpdateShape: (shape: DiagramShape) => void;
  onUpdateFrame: (frame: DiagramCanvasFrame | null) => void;
  onRemoveStroke: (id: string) => void;
  onRemoveShape: (id: string) => void;
  onClear: () => void;
  onNew: () => void;
  onNewSvg?: (svg: string) => void;
  onSave: () => void;
  onSaveSvg?: (svg: string) => void;
  onInsertIntoDocument: () => void;
  onInsertSvg?: (svg: string) => void;
  onRename: (name: string) => void;
  onDownloadSvg: (svg: string) => void;
  onUndo: () => void;
  onSvgChange: (svg: string) => void;
}

type SvgEditEditor = {
  init: () => Promise<void> | void;
  setConfig: (config: Record<string, unknown>) => void;
  loadSvgString: (svg: string, options?: { noAlert?: boolean }) => void;
  svgCanvas?: {
    bind?: (eventName: string, callback: (...args: unknown[]) => void) => void;
    getSvgString?: () => string;
  };
};

const BLANK_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
</svg>
`;

export function DiagramEditor({
  diagram,
  onClear,
  onDownloadSvg,
  onInsertIntoDocument,
  onInsertSvg,
  onNew,
  onNewSvg,
  onRename,
  onSave,
  onSaveSvg,
  onSvgChange
}: SvgEditDiagramEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<SvgEditEditor | null>(null);
  const loadedDiagramIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const [fileNameDraft, setFileNameDraft] = useState(diagram.name);
  const [editorError, setEditorError] = useState<string | null>(null);

  const initialSvg = useMemo(() => diagram.content ?? serializeDiagramSvg(diagram), [diagram]);

  const getCurrentSvg = useCallback(() => {
    const svg = editorRef.current?.svgCanvas?.getSvgString?.();
    return typeof svg === "string" && svg.trim() ? svg : initialSvg;
  }, [initialSvg]);

  const syncCurrentSvg = useCallback(() => {
    if (loadingRef.current) {
      return;
    }

    onSvgChange(getCurrentSvg());
  }, [getCurrentSvg, onSvgChange]);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      syncCurrentSvg();
    }, 250);
  }, [syncCurrentSvg]);

  useEffect(() => {
    setFileNameDraft(diagram.name);
  }, [diagram.name]);

  useEffect(() => {
    let cancelled = false;
    const hostElement = hostRef.current;

    if (!hostElement) {
      return undefined;
    }

    const mountHost = hostElement;

    async function mountEditor() {
      try {
        const { default: Editor } = await import("svgedit");

        if (cancelled || !hostRef.current) {
          return;
        }

        mountHost.innerHTML = "";
        const svgEditor = new Editor(mountHost) as SvgEditEditor;
        svgEditor.setConfig({
          allowInitialUserOverride: false,
          canvasName: `typr-${diagram.id}`,
          dimensions: [640, 480],
          imgPath: "/svgedit/images",
          initTool: "select",
          no_save_warning: true,
          noDefaultExtensions: true,
          noStorageOnLoad: true,
          preventAllURLConfig: true,
          preventURLContentLoading: true,
          showRulers: false,
          extensions: [],
          userExtensions: []
        });
        await svgEditor.init();

        if (cancelled) {
          return;
        }

        editorRef.current = svgEditor;
        loadingRef.current = true;
        svgEditor.loadSvgString(initialSvg, { noAlert: true });
        loadedDiagramIdRef.current = diagram.id;
        loadingRef.current = false;
        svgEditor.svgCanvas?.bind?.("changed", scheduleSync);
        svgEditor.svgCanvas?.bind?.("afterClear", scheduleSync);
        patchSvgEditShadowTheme(mountHost);
        window.setTimeout(() => patchSvgEditShadowTheme(mountHost), 0);
        window.setTimeout(() => patchSvgEditShadowTheme(mountHost), 500);
        setEditorError(null);
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : "SVG-Edit failed to load.");
      }
    }

    void mountEditor();

    return () => {
      cancelled = true;
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      editorRef.current = null;
      if ((window as typeof window & { svgEditor?: unknown }).svgEditor) {
        delete (window as typeof window & { svgEditor?: unknown }).svgEditor;
      }
      mountHost.innerHTML = "";
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor || loadedDiagramIdRef.current === diagram.id) {
      return;
    }

    try {
      loadingRef.current = true;
      editor.loadSvgString(initialSvg, { noAlert: true });
      loadedDiagramIdRef.current = diagram.id;
      loadingRef.current = false;
    } catch (error) {
      loadingRef.current = false;
      setEditorError(error instanceof Error ? error.message : "Unable to load diagram SVG.");
    }
  }, [diagram.id, initialSvg]);

  function handleRenameSubmit() {
    const normalized = normalizeDiagramFileName(fileNameDraft);
    setFileNameDraft(normalized);
    onRename(normalized);
  }

  function handleClear() {
    try {
      loadingRef.current = true;
      editorRef.current?.loadSvgString(BLANK_SVG, { noAlert: true });
      loadingRef.current = false;
      onSvgChange(BLANK_SVG);
      onClear();
    } catch (error) {
      loadingRef.current = false;
      setEditorError(error instanceof Error ? error.message : "Unable to clear diagram.");
    }
  }

  function handleNew() {
    const svg = getCurrentSvg();
    onSvgChange(svg);
    if (onNewSvg) {
      onNewSvg(svg);
      return;
    }
    onNew();
  }

  function handleSave() {
    const svg = getCurrentSvg();
    onSvgChange(svg);
    if (onSaveSvg) {
      onSaveSvg(svg);
      return;
    }
    onSave();
  }

  function handleInsert() {
    const svg = getCurrentSvg();
    onSvgChange(svg);
    if (onInsertSvg) {
      onInsertSvg(svg);
      return;
    }
    onInsertIntoDocument();
  }

  function handleDownload() {
    onDownloadSvg(getCurrentSvg());
  }

  return (
    <div className="diagram-editor diagram-editor--svgedit">
      <div className="diagram-editor__topbar">
        <input
          className="diagram-editor__filename"
          value={fileNameDraft}
          onBlur={handleRenameSubmit}
          onChange={(event) => setFileNameDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <div className="diagram-editor__actions">
          <button type="button" onClick={handleNew}>New</button>
          <button type="button" onClick={handleSave}>Save</button>
          <button type="button" onClick={handleInsert}>Insert</button>
          <button type="button" onClick={handleDownload}>Download</button>
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
      </div>
      {editorError ? <div className="diagram-editor__error">{editorError}</div> : null}
      <div className="diagram-editor__svgedit-host" ref={hostRef} />
    </div>
  );
}

function patchSvgEditShadowTheme(root: HTMLElement): void {
  const targets = collectOpenShadowRoots(root);

  targets.forEach((shadowRoot) => {
    if (shadowRoot.querySelector("style[data-typr-theme]")) {
      return;
    }

    const style = document.createElement("style");
    style.dataset.typrTheme = "true";
    style.textContent = `
      :host {
        color: var(--text, #1c231f) !important;
      }

      *,
      span,
      label,
      div,
      button,
      input,
      select,
      option,
      elix-menu,
      elix-menu-item,
      elix-menu-button,
      #selected-value,
      #options-container,
      #options-container *,
      [aria-label="option"] {
        color: var(--text, #1c231f) !important;
      }

      input,
      select {
        background: var(--editor-background, #fffdf8) !important;
        border-color: var(--border, rgba(70, 78, 64, 0.12)) !important;
      }

      elix-menu-button::part(menu),
      elix-menu::part(menu),
      elix-menu-item::part(item),
      #options-container,
      .menu,
      .menu-item {
        color: var(--text, #1c231f) !important;
        background: var(--surface-strong, #fffdf9) !important;
        border-color: var(--border, rgba(70, 78, 64, 0.12)) !important;
      }

      :host ::slotted(*) {
        color: var(--text, #1c231f) !important;
      }

      :host ::slotted([current]),
      [aria-label="option"]:hover,
      [selected],
      .menu-item:hover,
      .menu-item.pressed {
        color: var(--accent-strong, #145548) !important;
        background: color-mix(in srgb, var(--accent-soft, rgba(23, 111, 95, 0.12)) 70%, var(--surface-strong, #fffdf9)) !important;
      }

      :host-context(:root[data-theme="dark"]),
      :host-context(:root[data-theme="dark"]) *,
      :host-context(:root[data-theme="dark"]) span,
      :host-context(:root[data-theme="dark"]) label,
      :host-context(:root[data-theme="dark"]) div,
      :host-context(:root[data-theme="dark"]) button,
      :host-context(:root[data-theme="dark"]) input,
      :host-context(:root[data-theme="dark"]) select,
      :host-context(:root[data-theme="dark"]) option,
      :host-context(:root[data-theme="dark"]) elix-menu,
      :host-context(:root[data-theme="dark"]) elix-menu-item,
      :host-context(:root[data-theme="dark"]) elix-menu-button,
      :host-context(:root[data-theme="dark"]) #selected-value,
      :host-context(:root[data-theme="dark"]) #options-container,
      :host-context(:root[data-theme="dark"]) #options-container *,
      :host-context(:root[data-theme="dark"]) [aria-label="option"] {
        color: #edf4ef !important;
      }

      :host-context(:root[data-theme="dark"]) elix-menu-button::part(menu),
      :host-context(:root[data-theme="dark"]) elix-menu::part(menu),
      :host-context(:root[data-theme="dark"]) elix-menu-item::part(item),
      :host-context(:root[data-theme="dark"]) #options-container,
      :host-context(:root[data-theme="dark"]) .menu,
      :host-context(:root[data-theme="dark"]) .menu-item {
        color: #edf4ef !important;
        background: #171d1a !important;
      }
    `;
    shadowRoot.append(style);
  });
}

function collectOpenShadowRoots(root: ParentNode): ShadowRoot[] {
  const shadowRoots: ShadowRoot[] = [];
  const elements = root.querySelectorAll<HTMLElement>("*");

  elements.forEach((element) => {
    if (!element.shadowRoot) {
      return;
    }

    shadowRoots.push(element.shadowRoot);
    shadowRoots.push(...collectOpenShadowRoots(element.shadowRoot));
  });

  return shadowRoots;
}
