import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DiagramActionBar } from "./DiagramActionBar";

describe("DiagramActionBar", () => {
  it("keeps the common diagram actions in a stable order before editor-specific controls", () => {
    const markup = renderToStaticMarkup(
      <DiagramActionBar
        insertDisabled
        onInsert={vi.fn()}
        onNew={vi.fn()}
        onSave={vi.fn()}
      >
        <button type="button">Editor-specific action</button>
      </DiagramActionBar>
    );
    const labels = Array.from(
      markup.matchAll(/<button[^>]*>([^<]+)<\/button>/g),
      (match) => match[1]
    );

    expect(labels).toEqual([
      "New",
      "Save",
      "Insert",
      "Editor-specific action"
    ]);
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Insert<\/button>/);
  });
});
