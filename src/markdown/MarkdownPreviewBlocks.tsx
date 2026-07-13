import type { MouseEvent, ReactNode } from "react";

import {
  createSourceRange,
  sourcePositionIntersectsRange,
  type PreviewRect,
  type PreviewSourceLink,
  type SourcePosition
} from "../preview/sourceLinks";
import {
  findMarkdownBlockKeyAtLine,
  parseMarkdownBlocks,
  renderMarkdownBlocksHtml,
  type RenderedMarkdownBlock
} from "./markdownParser";

interface MarkdownPreviewRenderOptions {
  activeSource: SourcePosition | null;
  onSourceJump?: (sourceLink: PreviewSourceLink) => void;
  sourcePath: string;
}

function getPreviewRectFromElement(element: HTMLElement): PreviewRect {
  const rect = element.getBoundingClientRect();

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function renderMarkdownPreviewBlock(
  block: RenderedMarkdownBlock,
  options: MarkdownPreviewRenderOptions
): ReactNode {
  const range = createSourceRange({
    path: options.sourcePath,
    line: block.startLine,
    column: 0,
    endLine: block.endLine,
    endColumn: 0
  });
  const active = options.activeSource
    ? sourcePositionIntersectsRange(options.activeSource, range)
    : false;
  const className = [
    "preview-markdown__source-block",
    block.kind === "code" ? "preview-markdown__code-block" : null,
    active ? "preview-markdown__source-block--active" : null
  ].filter(Boolean).join(" ");

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!options.onSourceJump) {
      return;
    }

    options.onSourceJump({
      previewRect: getPreviewRectFromElement(event.currentTarget),
      source: range
    });
  };

  return (
    <div
      className={className}
      data-source-block-key={block.key}
      data-source-end-line={block.endLine}
      data-source-line={block.startLine}
      dangerouslySetInnerHTML={{ __html: block.html }}
      key={block.key}
      onDoubleClick={handleDoubleClick}
    />
  );
}

export function renderMarkdownPreviewBlocks(
  source: string,
  options: MarkdownPreviewRenderOptions
): ReactNode[] {
  return renderMarkdownBlocksHtml(parseMarkdownBlocks(source), "preview")
    .map((block) => renderMarkdownPreviewBlock(block, options));
}

export function findActiveMarkdownBlockKey(
  source: string,
  activeSource: SourcePosition | null
): string | null {
  return activeSource
    ? findMarkdownBlockKeyAtLine(parseMarkdownBlocks(source), activeSource.line)
    : null;
}

