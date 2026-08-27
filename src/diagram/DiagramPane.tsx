import { useState, type ReactNode } from "react";

export type DiagramPaneMode = "draw" | "tikz";

interface DiagramPaneProps {
  children: ReactNode;
  mode: DiagramPaneMode;
  onModeChange: (mode: DiagramPaneMode) => void;
}

export function DiagramPane({
  children,
  mode,
  onModeChange
}: DiagramPaneProps) {
  const [controlsVisible, setControlsVisible] = useState(true);

  return (
    <div
      className={`diagram-pane diagram-pane--${mode}${
        controlsVisible ? "" : " diagram-pane--controls-hidden"
      }`}
    >
      <div className="diagram-pane__toolbar">
        <div aria-label="Diagram editor" className="diagram-pane__tabs" role="tablist">
          <button
            aria-selected={mode === "draw"}
            className="diagram-pane__tab"
            onClick={() => onModeChange("draw")}
            role="tab"
            type="button"
          >
            Draw
          </button>
          <button
            aria-selected={mode === "tikz"}
            className="diagram-pane__tab"
            onClick={() => onModeChange("tikz")}
            role="tab"
            type="button"
          >
            TikZ
          </button>
        </div>
        <button
          aria-label={controlsVisible ? "Hide diagram controls" : "Show diagram controls"}
          aria-expanded={controlsVisible}
          className="diagram-pane__controls-toggle"
          onClick={() => setControlsVisible((visible) => !visible)}
          title={controlsVisible ? "Hide diagram controls" : "Show diagram controls"}
          type="button"
        >
          <span
            aria-hidden="true"
            className={`diagram-pane__controls-toggle-icon${
              controlsVisible ? " diagram-pane__controls-toggle-icon--collapse" : ""
            }`}
          />
        </button>
      </div>
      <div className="diagram-pane__content">{children}</div>
    </div>
  );
}
