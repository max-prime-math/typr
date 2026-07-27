import type { ReactNode } from "react";

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
  return (
    <div className={`diagram-pane diagram-pane--${mode}`}>
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
      </div>
      <div className="diagram-pane__content">{children}</div>
    </div>
  );
}
