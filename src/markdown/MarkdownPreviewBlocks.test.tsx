import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SHARED_MARKDOWN_SOURCE } from "./__fixtures__/sharedMarkdownFixtures";
import { renderMarkdownPreviewBlocks } from "./MarkdownPreviewBlocks";

describe("Markdown preview source blocks", () => {
  it("renders shared Markdown with stable source metadata and active-line styling", () => {
    const html = renderToStaticMarkup(
      <>{renderMarkdownPreviewBlocks(SHARED_MARKDOWN_SOURCE, {
        activeSource: { path: "notes.md", line: 19, column: 0 },
        sourcePath: "notes.md"
      })}</>
    );

    expect(html).toContain('data-source-block-key="heading-0"');
    expect(html).toContain('data-source-line="18"');
    expect(html).toContain('data-source-end-line="20"');
    expect(html).toContain("preview-markdown__source-block--active");
    expect(html).toContain("<table>");
    expect(html).not.toContain('href="javascript:');
  });
});

