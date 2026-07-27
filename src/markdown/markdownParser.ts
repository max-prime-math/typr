import { marked, type MarkedOptions, type Token, type Tokens } from "marked";

export type MarkdownRenderMode = "docs" | "preview" | "export";

export interface MarkdownRenderOptions {
  resolveImageHref?: (href: string) => string | null;
}

export interface MarkdownBlock {
  key: string;
  kind: string;
  startLine: number;
  endLine: number;
  token: Token;
}

export interface RenderedMarkdownBlock extends MarkdownBlock {
  html: string;
}

const MARKDOWN_OPTIONS = {
  breaks: false,
  gfm: true,
  pedantic: false
} satisfies MarkedOptions;

function normalizeMarkdownSource(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRenderedBlockToken(token: Token): boolean {
  return token.type !== "space" && token.type !== "def";
}

function countNewlines(value: string): number {
  return value.match(/\n/g)?.length ?? 0;
}

function getMarkdownBlockEndLine(raw: string, startLine: number): number {
  const visibleRaw = raw.replace(/\n+$/, "");
  return startLine + countNewlines(visibleRaw);
}

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const normalizedSource = normalizeMarkdownSource(source);
  const tokens = marked.lexer(normalizedSource, MARKDOWN_OPTIONS);
  const blocks: MarkdownBlock[] = [];
  let sourceOffset = 0;
  let currentLine = 1;

  for (const token of tokens) {
    if (isRenderedBlockToken(token)) {
      const index = blocks.length;
      blocks.push({
        key: `${token.type}-${index}`,
        kind: token.type,
        startLine: currentLine,
        endLine: getMarkdownBlockEndLine(token.raw, currentLine),
        token
      });
    }

    sourceOffset += token.raw.length;
    currentLine = countNewlines(normalizedSource.slice(0, sourceOffset)) + 1;
  }

  return blocks;
}

export function collectMarkdownImageReferences(source: string): string[] {
  const references = new Set<string>();
  const tokens = marked.lexer(normalizeMarkdownSource(source), MARKDOWN_OPTIONS);

  marked.walkTokens(tokens, (token) => {
    if (token.type === "image") {
      references.add((token as Tokens.Image).href);
    }
  });

  return [...references];
}

export function findMarkdownBlockKeyAtLine(
  blocks: readonly MarkdownBlock[],
  line: number
): string | null {
  return blocks.find((block) => line >= block.startLine && line <= block.endLine)?.key ?? null;
}

function isAllowedPreviewHref(href: string): boolean {
  const trimmed = href.trim();

  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return true;
  }

  return Boolean(
    trimmed &&
      !trimmed.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) &&
      !/[\u0000-\u001f\u007f]/.test(trimmed)
  );
}

function isExternalPreviewHref(href: string): boolean {
  return /^https?:/i.test(href);
}

function isAllowedRemoteImageHref(href: string): boolean {
  return /^https?:/i.test(href.trim());
}

function createMarkdownRenderer(
  mode: MarkdownRenderMode,
  options: MarkdownRenderOptions
) {
  const renderer = new marked.Renderer();

  if (mode === "docs") {
    return renderer;
  }

  renderer.html = ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text);

  if (mode === "preview") {
    renderer.link = ({ href, title, tokens, raw }: Tokens.Link) => {
      if (!isAllowedPreviewHref(href)) {
        return escapeHtml(raw);
      }

      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
      const externalAttributes = isExternalPreviewHref(href)
        ? ' rel="noreferrer" target="_blank"'
        : ' rel="noreferrer"';
      return `<a href="${escapeHtml(href)}"${titleAttribute}${externalAttributes}>${renderer.parser.parseInline(tokens)}</a>`;
    };
    renderer.image = ({ href, title, text, raw }: Tokens.Image) => {
      const resolvedHref =
        options.resolveImageHref?.(href) ??
        (isAllowedRemoteImageHref(href) ? href : null);

      if (!resolvedHref) {
        return escapeHtml(raw);
      }

      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(resolvedHref)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    };
  }

  return renderer;
}

function renderMarkdownTokens(
  tokens: Token[],
  mode: MarkdownRenderMode,
  options: MarkdownRenderOptions = {}
): string {
  return marked.parser<string, string>(tokens, {
    ...MARKDOWN_OPTIONS,
    renderer: createMarkdownRenderer(mode, options)
  });
}

export function renderMarkdownHtml(
  source: string,
  mode: MarkdownRenderMode,
  options: MarkdownRenderOptions = {}
): string {
  const tokens = marked.lexer(normalizeMarkdownSource(source), MARKDOWN_OPTIONS);
  return renderMarkdownTokens(tokens, mode, options);
}

export function renderMarkdownBlocksHtml(
  blocks: readonly MarkdownBlock[],
  mode: MarkdownRenderMode = "preview",
  options: MarkdownRenderOptions = {}
): RenderedMarkdownBlock[] {
  return blocks.map((block) => ({
    ...block,
    html: renderMarkdownTokens([block.token], mode, options)
  }));
}
