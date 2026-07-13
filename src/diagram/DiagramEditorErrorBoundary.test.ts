import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiagramEditorErrorBoundary } from "./DiagramEditorErrorBoundary";

describe("DiagramEditorErrorBoundary", () => {
  it("passes children through before an error", () => {
    const boundary = new DiagramEditorErrorBoundary({
      children: createElement("span", null, "Diagram ready")
    });

    expect(renderToStaticMarkup(boundary.render())).toBe("<span>Diagram ready</span>");
  });

  it("keeps the app available with the Diagram fallback after an error", () => {
    const boundary = new DiagramEditorErrorBoundary({
      children: createElement("span", null, "Diagram ready")
    });
    boundary.state = DiagramEditorErrorBoundary.getDerivedStateFromError();

    const markup = renderToStaticMarkup(boundary.render());

    expect(markup).toContain("The diagram canvas failed to load.");
    expect(markup).toContain("The rest of the app is still available.");
    expect(markup).toContain("Reloading should restore the panel.");
  });
});
