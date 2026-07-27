import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiagramAsset } from "../app/appState";
import "svgedit/dist/editor/svgedit.css";
import { DiagramActionBar } from "./DiagramActionBar";
import { normalizeDiagramFileName } from "./diagramFiles";
import { serializeDiagramSvg } from "./diagramSvgSerializer";
import { svgEditLifecycle } from "./svgEditLifecycle";

interface SvgEditDiagramEditorProps {
  diagram: DiagramAsset;
  onClear: () => void;
  onNew: () => void;
  onNewSvg?: (svg: string) => void;
  onSave: () => void;
  onSaveSvg?: (svg: string) => void;
  onInsertIntoDocument: () => void;
  onInsertSvg?: (svg: string) => void;
  onRename: (name: string) => void;
  onDownloadSvg: (svg: string) => void;
  onSvgChange: (svg: string) => void;
}

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
  const onSvgChangeRef = useRef(onSvgChange);
  const [fileNameDraft, setFileNameDraft] = useState(diagram.name);
  const [editorError, setEditorError] = useState<string | null>(null);

  const initialSvg = useMemo(() => diagram.content ?? serializeDiagramSvg(diagram), [diagram]);
  onSvgChangeRef.current = onSvgChange;

  const getCurrentSvg = useCallback(() => {
    return svgEditLifecycle.getCurrentSvg(initialSvg);
  }, [initialSvg]);

  useEffect(() => {
    setFileNameDraft(diagram.name);
  }, [diagram.name]);

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) {
      return undefined;
    }

    let active = true;
    svgEditLifecycle.load(diagram.id, initialSvg);
    const attachmentId = svgEditLifecycle.attach(hostElement, {
      onError(message) {
        if (active) {
          setEditorError(message);
        }
      },
      onReady(runtimeHost) {
        if (active) {
          patchSvgEditShadowTheme(runtimeHost);
        }
      },
      onSvgChange(svg) {
        if (active) {
          onSvgChangeRef.current(svg);
        }
      }
    });

    return () => {
      active = false;
      svgEditLifecycle.detach(attachmentId);
    };
  }, []);

  useEffect(() => {
    svgEditLifecycle.load(diagram.id, initialSvg);
  }, [diagram.id, initialSvg]);

  function handleRenameSubmit() {
    const normalized = normalizeDiagramFileName(fileNameDraft);
    setFileNameDraft(normalized);
    onRename(normalized);
  }

  function handleClear() {
    svgEditLifecycle.load(diagram.id, BLANK_SVG, { force: true });
    onSvgChange(BLANK_SVG);
    onClear();
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
        <DiagramActionBar
          onInsert={handleInsert}
          onNew={handleNew}
          onSave={handleSave}
        >
          <button type="button" onClick={handleDownload}>Download</button>
          <button type="button" onClick={handleClear}>Clear</button>
        </DiagramActionBar>
      </div>
      {editorError ? <div className="diagram-editor__error">{editorError}</div> : null}
      <div className="diagram-editor__svgedit-host" ref={hostRef} />
      <div className="diagram-editor__credit">
        Powered by{" "}
        <a
          href="https://github.com/SVG-Edit/svgedit"
          rel="noreferrer"
          target="_blank"
        >
          SVG-Edit
        </a>
      </div>
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
