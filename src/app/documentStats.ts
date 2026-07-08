import type { SourceLanguage } from "../compiler/sourceFileTypes";

export interface DocumentStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  lines: number;
  headings: number;
  equations: number;
  codeBlocks: number;
  comments: number;
  counterLabel: string;
}

interface CommentStripResult {
  text: string;
  count: number;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function collectDocumentStats(content: string, language: SourceLanguage): DocumentStats {
  const text = normalizeLineEndings(content);
  const lines = text.length === 0 ? 1 : text.split("\n").length;
  const characters = Array.from(text).length;
  const charactersNoSpaces = Array.from(text.replace(/\s/g, "")).length;

  if (language === "latex") {
    return {
      ...collectLatexDocumentStats(text),
      characters,
      charactersNoSpaces,
      lines,
      counterLabel: "TeXcount-style"
    };
  }

  if (language === "typst") {
    return {
      ...collectTypstDocumentStats(text),
      characters,
      charactersNoSpaces,
      lines,
      counterLabel: "wordometer-style"
    };
  }

  return {
    ...collectPlainDocumentStats(text, language),
    characters,
    charactersNoSpaces,
    lines,
    counterLabel: language === "markdown" ? "Markdown source" : "Text source"
  };
}

function collectLatexDocumentStats(text: string) {
  const comments = stripLatexComments(text);
  const codeBlocks = countMatches(
    comments.text,
    /\\begin\{(?:verbatim|lstlisting|minted)\}[\s\S]*?\\end\{(?:verbatim|lstlisting|minted)\}/g
  );
  const withoutCode = comments.text.replace(
    /\\begin\{(?:verbatim|lstlisting|minted)\}[\s\S]*?\\end\{(?:verbatim|lstlisting|minted)\}/g,
    " "
  );
  const headings = countMatches(
    withoutCode,
    /\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{/g
  );
  const equations = countMatches(
    withoutCode,
    /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{(?:equation|align|gather|multline|displaymath|math)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|multline|displaymath|math)\*?\}|\$(?:\\.|[^$\\])+\$/g
  );
  const wordSource = withoutCode
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ")
    .replace(/\\begin\{(?:equation|align|gather|multline|displaymath|math)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|multline|displaymath|math)\*?\}/g, " ")
    .replace(/\$(?:\\.|[^$\\])+\$/g, " ")
    .replace(/\\(?:begin|end)\{[^{}]*\}/g, " ")
    .replace(/\\(?:cite|citep|citet|ref|eqref|label|url|href|includegraphics|input|include|bibliography|bibliographystyle)\*?(?:\[[^\]]*\])*(?:\{[^{}]*\})*/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])*/g, " ")
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/[{}~^]/g, " ");

  return {
    words: countWords(wordSource),
    headings,
    equations,
    codeBlocks,
    comments: comments.count
  };
}

function collectTypstDocumentStats(text: string) {
  const comments = stripTypstComments(text);
  const codeBlocks = countMatches(comments.text, /```[\s\S]*?```/g);
  const withoutCode = comments.text.replace(/```[\s\S]*?```/g, " ");
  const headings = countMatches(withoutCode, /^\s*=+\s+.+$/gm);
  const equations = countMatches(withoutCode, /\$(?:\\.|[^$\\])+\$/g);
  const wordSource = withoutCode
    .replace(/\$(?:\\.|[^$\\])+\$/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^\s*=+\s+/gm, "")
    .replace(/#([A-Za-z_][\w-]*)\s*\[/g, "[")
    .replace(/#(?:let|set|show|import|include|bibliography|figure|table|image|outline|pagebreak|cite|link|label)\b(?:\s*\([^)]*\))?/g, " ")
    .replace(/#?[A-Za-z_][\w-]*\s*\(/g, " ")
    .replace(/@[A-Za-z0-9_:\-./]+/g, " ")
    .replace(/<[^>\n]+>/g, " ")
    .replace(/[\[\]{}()=_*#]/g, " ");

  return {
    words: countWords(wordSource),
    headings,
    equations,
    codeBlocks,
    comments: comments.count
  };
}

function collectPlainDocumentStats(text: string, language: SourceLanguage) {
  const withoutMarkdownCode = language === "markdown" ? text.replace(/```[\s\S]*?```/g, " ") : text;
  const headings = language === "markdown" ? countMatches(text, /^\s{0,3}#{1,6}\s+.+$/gm) : 0;
  const codeBlocks = language === "markdown" ? countMatches(text, /```[\s\S]*?```/g) : 0;
  const wordSource =
    language === "markdown"
      ? withoutMarkdownCode
          .replace(/`[^`\n]*`/g, " ")
          .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
          .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
          .replace(/^\s{0,3}#{1,6}\s+/gm, "")
          .replace(/[*_~>#-]/g, " ")
      : text;

  return {
    words: countWords(wordSource),
    headings,
    equations: 0,
    codeBlocks,
    comments: 0
  };
}

function stripLatexComments(text: string): CommentStripResult {
  let count = 0;
  const stripped = text
    .split("\n")
    .map((line) => {
      const index = findUnescapedCharacter(line, "%");
      if (index < 0) {
        return line;
      }

      count += 1;
      return line.slice(0, index);
    })
    .join("\n");

  return { text: stripped, count };
}

function stripTypstComments(text: string): CommentStripResult {
  let count = 0;
  const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    count += Math.max(1, match.split("\n").length);
    return " ";
  });
  const stripped = withoutBlocks
    .split("\n")
    .map((line) => {
      const index = findTypstLineCommentStart(line);
      if (index < 0) {
        return line;
      }

      count += 1;
      return line.slice(0, index);
    })
    .join("\n");

  return { text: stripped, count };
}

function findTypstLineCommentStart(line: string): number {
  let inString = false;

  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && !isEscaped(line, index)) {
      inString = !inString;
      continue;
    }

    if (!inString && char === "/" && next === "/") {
      return index;
    }
  }

  return -1;
}

function findUnescapedCharacter(line: string, target: string): number {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === target && !isEscaped(line, index)) {
      return index;
    }
  }

  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function countWords(text: string): number {
  return Array.from(text.matchAll(WORD_PATTERN)).length;
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
