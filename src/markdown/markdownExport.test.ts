import { describe, expect, it } from "vitest";
import {
  COMMON_MARKDOWN_HTML_FRAGMENTS,
  SHARED_MARKDOWN_SOURCE
} from "./__fixtures__/sharedMarkdownFixtures";
import { renderMarkdownHtml } from "./markdownParser";

describe("export Markdown rendering", () => {
  it("uses the shared grammar without implicitly changing export sanitization", () => {
    const html = renderMarkdownHtml(SHARED_MARKDOWN_SOURCE, "export");

    for (const fragment of COMMON_MARKDOWN_HTML_FRAGMENTS) {
      expect(html).toContain(fragment);
    }
    expect(html).toContain('<a href="javascript:alert(1)">unsafe</a>');
    expect(html).toContain('<img src="javascript:alert(2)" alt="unsafe image">');
    expect(html).toContain('&lt;span data-fixture=&quot;raw&quot;&gt;raw HTML&lt;/span&gt;');
    expect(html).not.toContain('<span data-fixture="raw">');
  });
});

