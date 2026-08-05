import { describe, expect, it } from "vitest";
import {
  COMMON_MARKDOWN_HTML_FRAGMENTS,
  SHARED_MARKDOWN_SOURCE
} from "./__fixtures__/sharedMarkdownFixtures";
import { renderMarkdownHtml } from "./markdownParser";

describe("Docs Markdown rendering", () => {
  it("uses the shared grammar while retaining the trusted-docs HTML policy", () => {
    const html = renderMarkdownHtml(SHARED_MARKDOWN_SOURCE, "docs");

    for (const fragment of COMMON_MARKDOWN_HTML_FRAGMENTS) {
      expect(html).toContain(fragment);
    }
    expect(html).toContain('<div class="docs-markdown__table-scroll"><table>');
    expect(html).toContain('<a href="javascript:alert(1)">unsafe</a>');
    expect(html).toContain('<img src="javascript:alert(2)" alt="unsafe image">');
    expect(html).toContain('<span data-fixture="raw">raw HTML</span>');
  });
});
