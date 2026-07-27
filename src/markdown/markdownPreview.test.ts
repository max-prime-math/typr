import { describe, expect, it } from "vitest";
import {
  COMMON_MARKDOWN_HTML_FRAGMENTS,
  SHARED_MARKDOWN_SOURCE
} from "./__fixtures__/sharedMarkdownFixtures";
import {
  collectMarkdownImageReferences,
  findMarkdownBlockKeyAtLine,
  parseMarkdownBlocks,
  renderMarkdownBlocksHtml,
  renderMarkdownHtml
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

  it("renders the complete built-in GFM feature set used by the preview", () => {
    const source = [
      "| Left | Center | Right |",
      "| :--- | :----: | ----: |",
      "| alpha | **ready** | 12 |",
      "",
      "- [x] shipped",
      "- [ ] pending",
      "",
      "~~removed~~, www.example.com, and [guide](guide.md).",
      "",
      "hard break  ",
      "continues"
    ].join("\n");
    const html = renderMarkdownHtml(source, "preview");

    expect(html).toContain('<th align="left">Left</th>');
    expect(html).toContain('<th align="center">Center</th>');
    expect(html).toContain('<td align="right">12</td>');
    expect(html).toContain('<input checked="" disabled="" type="checkbox">');
    expect(html).toContain('<input disabled="" type="checkbox">');
    expect(html).toContain("<del>removed</del>");
    expect(html).toContain('<a href="http://www.example.com"');
    expect(html).toContain('<a href="guide.md" rel="noreferrer">guide</a>');
    expect(html).toContain("hard break<br>continues");
  });

  it("renders safe remote and resolved workspace images without enabling unsafe targets", () => {
    const source = [
      "![local](figures/chart.png \"Chart\")",
      "",
      "![remote](https://example.com/image.png)",
      "",
      "![unsafe](javascript:alert(1))"
    ].join("\n");
    const references = collectMarkdownImageReferences(source);
    const html = renderMarkdownHtml(source, "preview", {
      resolveImageHref: (href) =>
        href === "figures/chart.png" ? "blob:https://typr.test/chart" : null
    });

    expect(references).toEqual([
      "figures/chart.png",
      "https://example.com/image.png",
      "javascript:alert(1)"
    ]);
    expect(html).toContain(
      '<img src="blob:https://typr.test/chart" alt="local" title="Chart" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
    );
    expect(html).toContain(
      '<img src="https://example.com/image.png" alt="remote" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
    );
    expect(html).toContain("![unsafe](javascript:alert(1))");
    expect(html).not.toContain('src="javascript:');
  });
});
