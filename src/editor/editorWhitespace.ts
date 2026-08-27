import type { SourceLanguage } from "../compiler/sourceFileTypes";

export const EDITOR_INDENT = "  ";

export interface OwnLineInsertion {
  cursor: number;
  from: number;
  insert: string;
  to: number;
}

export function getOwnLineInsertion(
  source: string,
  position: number,
  text: string
): OwnLineInsertion {
  const line = getLineAt(source, position);

  if (!line.text.trim()) {
    return {
      cursor: line.from,
      from: line.from,
      insert: text,
      to: line.to
    };
  }

  return {
    cursor: line.to + 1,
    from: line.to,
    insert: `\n${text}`,
    to: line.to
  };
}

export function getSmartNewlineInsertion(
  source: string,
  position: number,
  language: SourceLanguage
): string | null {
  const line = getLineAt(source, position);
  const beforeCursor = source.slice(line.from, position);
  const baseIndent = beforeCursor.match(/^[ \t]*/)?.[0].replace(/\t/g, EDITOR_INDENT) ?? "";
  const trimmedBefore = beforeCursor.trim();

  if (!trimmedBefore) {
    return `\n${baseIndent}`;
  }

  if (language === "markdown") {
    const listContinuation = getMarkdownListContinuation(beforeCursor);
    if (listContinuation) {
      return `\n${listContinuation}`;
    }

    return `\n${baseIndent}`;
  }

  if (language === "latex") {
    const nextIndent = shouldIndentAfterLatexLine(trimmedBefore)
      ? `${baseIndent}${EDITOR_INDENT}`
      : baseIndent;
    return `\n${nextIndent}`;
  }

  if (language === "typst") {
    const nextIndent = shouldIndentAfterTypstLine(trimmedBefore)
      ? `${baseIndent}${EDITOR_INDENT}`
      : baseIndent;
    return `\n${nextIndent}`;
  }

  return `\n${baseIndent}`;
}

export function getLatexItemNewlineInsertion(
  source: string,
  position: number
): string | null {
  if (!isInsideLatexListEnvironment(source, position)) {
    return null;
  }

  const newline = getSmartNewlineInsertion(source, position, "latex");
  return newline === null ? null : `${newline}\\item `;
}

function getLineAt(source: string, position: number): { from: number; to: number; text: string } {
  const clampedPosition = Math.max(0, Math.min(position, source.length));
  const lineStart = source.lastIndexOf("\n", clampedPosition - 1) + 1;
  const nextLineBreak = source.indexOf("\n", clampedPosition);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;

  return {
    from: lineStart,
    to: lineEnd,
    text: source.slice(lineStart, lineEnd)
  };
}

function getMarkdownListContinuation(beforeCursor: string): string | null {
  const unordered = beforeCursor.match(/^(\s*)([-*+])\s+\S/);
  if (unordered) {
    return `${unordered[1]}${unordered[2]} `;
  }

  const ordered = beforeCursor.match(/^(\s*)(\d+)\.\s+\S/);
  if (ordered) {
    return `${ordered[1]}${Number(ordered[2]) + 1}. `;
  }

  return null;
}

function shouldIndentAfterLatexLine(trimmedLine: string): boolean {
  if (/^\\end\{[^}]+}/.test(trimmedLine)) {
    return false;
  }

  const beginMatch = trimmedLine.match(/^\\begin\{([^}]+)}/);
  if (!beginMatch) {
    return false;
  }

  return !trimmedLine.includes(`\\end{${beginMatch[1]}}`);
}

function isInsideLatexListEnvironment(source: string, position: number): boolean {
  const environmentStack: string[] = [];
  const sourceBeforeCursor = source.slice(0, Math.max(0, Math.min(position, source.length)));

  for (const match of sourceBeforeCursor.matchAll(/\\(begin|end)\s*\{([^{}\r\n]+)\}/g)) {
    const from = match.index;
    if (isPositionInLatexComment(sourceBeforeCursor, from)) {
      continue;
    }

    const name = match[2].trim();
    if (match[1] === "begin") {
      environmentStack.push(name);
      continue;
    }

    for (let index = environmentStack.length - 1; index >= 0; index -= 1) {
      if (environmentStack[index] === name) {
        environmentStack.splice(index, 1);
        break;
      }
    }
  }

  const innermostEnvironment = environmentStack.at(-1);
  return innermostEnvironment === "itemize" || innermostEnvironment === "enumerate";
}

function isPositionInLatexComment(source: string, position: number): boolean {
  const lineStart = source.lastIndexOf("\n", Math.max(0, position - 1)) + 1;

  for (let index = lineStart; index < position; index += 1) {
    if (source[index] !== "%") {
      continue;
    }

    let precedingBackslashes = 0;
    for (let cursor = index - 1; cursor >= lineStart && source[cursor] === "\\"; cursor -= 1) {
      precedingBackslashes += 1;
    }

    if (precedingBackslashes % 2 === 0) {
      return true;
    }
  }

  return false;
}

function shouldIndentAfterTypstLine(trimmedLine: string): boolean {
  const line = stripTypstLineComment(trimmedLine);
  let delta = 0;

  for (const character of line) {
    if (character === "(" || character === "[" || character === "{") {
      delta += 1;
    } else if (character === ")" || character === "]" || character === "}") {
      delta -= 1;
    }
  }

  return delta > 0;
}

function stripTypstLineComment(line: string): string {
  const commentIndex = line.indexOf("//");
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}
