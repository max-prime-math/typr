import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DiagramPane } from "./DiagramPane";

describe("DiagramPane", () => {
  it("offers a shared toggle for hiding the editor controls", () => {
    const markup = renderToStaticMarkup(
      <DiagramPane mode="draw" onModeChange={vi.fn()}>
        <div>Diagram editor</div>
      </DiagramPane>
    );

    expect(markup).toContain('aria-label="Hide diagram controls"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("diagram-pane__controls-toggle-icon--collapse");
    expect(markup).not.toContain("diagram-pane--controls-hidden");
  });
});
