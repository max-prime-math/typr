import { describe, expect, it } from "vitest";
import {
  COMMON_MARKDOWN_HTML_FRAGMENTS,
  SHARED_MARKDOWN_SOURCE
} from "./__fixtures__/sharedMarkdownFixtures";
import {
  findMarkdownBlockKeyAtLine,
  parseMarkdownBlocks,
  renderMarkdownBlocksHtml
} from "./markdownParser";

describe("preview Markdown rendering", () => {
  it("uses the shared grammar with the existing restricted preview policy", () => {
    const html = renderMarkdownBlocksHtml(parseMarkdownBlocks(SHARED_MARKDOWN_SOURCE), "preview")
      .map((block) => block.html)
      .join("\n");

    for (const fragment of COMMON_MARKDOWN_HTML_FRAGMENTS) {
      expect(html).toContain(fragment);
    }
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="javascript:');
    expect(html).toContain('[unsafe](javascript:alert(1))');
    expect(html).toContain('![unsafe image](javascript:alert(2))');
    expect(html).toContain('&lt;span data-fixture=&quot;raw&quot;&gt;raw HTML&lt;/span&gt;');
  });

  it("keeps marked blocks tied to source lines for preview synchronization", () => {
    const blocks = parseMarkdownBlocks(SHARED_MARKDOWN_SOURCE);

    expect(blocks.map(({ kind, startLine, endLine }) => ({ kind, startLine, endLine }))).toEqual([
      { kind: "heading", startLine: 1, endLine: 1 },
      { kind: "paragraph", startLine: 3, endLine: 4 },
      { kind: "blockquote", startLine: 6, endLine: 6 },
      { kind: "list", startLine: 8, endLine: 9 },
      { kind: "list", startLine: 11, endLine: 12 },
      { kind: "table", startLine: 14, endLine: 16 },
      { kind: "code", startLine: 18, endLine: 20 },
      { kind: "paragraph", startLine: 22, endLine: 22 },
      { kind: "paragraph", startLine: 24, endLine: 24 },
      { kind: "paragraph", startLine: 26, endLine: 26 }
    ]);
    expect(findMarkdownBlockKeyAtLine(blocks, 19)).toBe("code-6");
    expect(findMarkdownBlockKeyAtLine(blocks, 25)).toBeNull();
  });
});

