import type { CompileDiagnostic } from "../compiler/types";
import type { SourceLanguage } from "../compiler/sourceFileTypes";

export type EditorToolLanguage = "typst" | "latex" | "markdown";
export type EditorFormatterId = "disabled" | "built-in" | "local-agent" | "cloud-container";
export type EditorLinterId = "disabled" | "built-in" | "local-agent" | "cloud-container";

export interface EditorLanguageToolPreference {
  formatter: EditorFormatterId;
  linter: EditorLinterId;
}

export interface EditorToolingPreferences {
  schemaVersion: number;
  lintOnEdit: boolean;
  formatOnCompile: boolean;
  languages: Record<EditorToolLanguage, EditorLanguageToolPreference>;
}

export interface EditorFormatResult {
  source: string;
  changed: boolean;
  diagnostics: CompileDiagnostic[];
}

const EDITOR_TOOL_LANGUAGES: EditorToolLanguage[] = ["typst", "latex", "markdown"];

const DEFAULT_LANGUAGE_TOOL_PREFERENCES: Record<EditorToolLanguage, EditorLanguageToolPreference> = {
  typst: {
    formatter: "built-in",
    linter: "built-in"
  },
  latex: {
    formatter: "built-in",
    linter: "built-in"
  },
  markdown: {
    formatter: "built-in",
    linter: "built-in"
  }
};

export const DEFAULT_EDITOR_TOOLING_PREFERENCES: EditorToolingPreferences = {
  schemaVersion: 2,
  lintOnEdit: true,
  formatOnCompile: false,
  languages: DEFAULT_LANGUAGE_TOOL_PREFERENCES
};

export function normalizeEditorToolingPreferences(
  value: Partial<EditorToolingPreferences> | null | undefined
): EditorToolingPreferences {
  const normalizedLanguages = { ...DEFAULT_LANGUAGE_TOOL_PREFERENCES };
  const storedLanguages = value?.languages;
  const shouldMigratePhaseOneBuiltIns = value?.schemaVersion !== DEFAULT_EDITOR_TOOLING_PREFERENCES.schemaVersion;

  for (const language of EDITOR_TOOL_LANGUAGES) {
    const storedLanguage = storedLanguages?.[language];
    const fallback = DEFAULT_LANGUAGE_TOOL_PREFERENCES[language];
    const migrateBuiltIn =
      shouldMigratePhaseOneBuiltIns &&
      (language === "typst" || language === "latex") &&
      storedLanguage?.formatter === "disabled" &&
      storedLanguage?.linter === "disabled";

    normalizedLanguages[language] = {
      formatter: migrateBuiltIn ? fallback.formatter : normalizeFormatterId(storedLanguage?.formatter, fallback.formatter),
      linter: migrateBuiltIn ? fallback.linter : normalizeLinterId(storedLanguage?.linter, fallback.linter)
    };
  }

  return {
    schemaVersion: DEFAULT_EDITOR_TOOLING_PREFERENCES.schemaVersion,
    lintOnEdit: value?.lintOnEdit ?? DEFAULT_EDITOR_TOOLING_PREFERENCES.lintOnEdit,
    formatOnCompile: value?.formatOnCompile ?? DEFAULT_EDITOR_TOOLING_PREFERENCES.formatOnCompile,
    languages: normalizedLanguages
  };
}

export function getEditorToolLanguage(language: SourceLanguage): EditorToolLanguage | null {
  return language === "typst" || language === "latex" || language === "markdown" ? language : null;
}

export function formatSourceWithEditorTooling({
  language,
  path,
  preferences,
  source
}: {
  language: SourceLanguage;
  path: string;
  preferences: EditorToolingPreferences;
  source: string;
}): EditorFormatResult {
  const toolLanguage = getEditorToolLanguage(language);
  const formatter = toolLanguage ? preferences.languages[toolLanguage].formatter : "disabled";

  if (formatter !== "built-in") {
    return {
      source,
      changed: false,
      diagnostics: []
    };
  }

  const formatted =
    language === "typst"
      ? formatTypstSource(source)
      : language === "latex"
        ? formatLatexSource(source)
        : language === "markdown"
          ? formatMarkdownSource(source)
          : source;

  return {
    source: formatted,
    changed: formatted !== source,
    diagnostics: []
  };
}

export function lintSourceWithEditorTooling({
  language,
  path,
  preferences,
  source
}: {
  language: SourceLanguage;
  path: string;
  preferences: EditorToolingPreferences;
  source: string;
}): CompileDiagnostic[] {
  if (!preferences.lintOnEdit) {
    return [];
  }

  const toolLanguage = getEditorToolLanguage(language);
  const linter = toolLanguage ? preferences.languages[toolLanguage].linter : "disabled";

  if (linter !== "built-in") {
    return [];
  }

  if (language === "typst") {
    return lintTypstSource(source, path);
  }

  if (language === "latex") {
    return lintLatexSource(source, path);
  }

  return language === "markdown" ? lintMarkdownSource(source, path) : [];
}

export function formatMarkdownSource(source: string): string {
  return formatPlainMarkupSource(source, (line) =>
    line
      .replace(/^(#{1,6})([^\s#].*)$/, "$1 $2")
      .replace(/^(\s*[-*+]) {2,}(\S.*)$/, "$1 $2")
      .replace(/^(\s*\d+\.) {2,}(\S.*)$/, "$1 $2")
  );
}

export function formatTypstSource(source: string): string {
  if (!source) {
    return source;
  }

  const hadFinalNewline = /\r?\n$/.test(source);
  const lines = getSourceLines(source);
  const formattedLines: string[] = [];
  let blankRun = 0;
  let indentLevel = 0;
  let inRawBlock = false;

  for (const rawLine of lines) {
    let line = rawLine.replace(/[ \t]+$/g, "");
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inRawBlock = !inRawBlock;
      formattedLines.push(line);
      blankRun = 0;
      continue;
    }

    if (!trimmed) {
      blankRun += 1;
      if (blankRun <= 2) {
        formattedLines.push("");
      }
      continue;
    }

    blankRun = 0;

    if (inRawBlock) {
      formattedLines.push(line);
      continue;
    }

    const content = trimmed
      .replace(/^(={1,6})([^\s=].*)$/, "$1 $2")
      .replace(/^([-+]) {2,}(\S.*)$/, "$1 $2");
    const leadingClosers = (content.match(/^[\])}]+/)?.[0].length ?? 0);
    const lineIndent = Math.max(0, indentLevel - leadingClosers);

    formattedLines.push(`${"  ".repeat(lineIndent)}${content}`);
    indentLevel = Math.max(0, lineIndent + getBracketDelta(stripTypstLineComment(content)));
  }

  return finishFormattedSource(formattedLines, hadFinalNewline);
}

export function formatLatexSource(source: string): string {
  if (!source) {
    return source;
  }

  const hadFinalNewline = /\r?\n$/.test(source);
  const lines = getSourceLines(source);
  const formattedLines: string[] = [];
  let blankRun = 0;
  let indentLevel = 0;
  let verbatimEnvironment: string | null = null;

  for (const rawLine of lines) {
    let line = rawLine.replace(/[ \t]+$/g, "");
    const trimmed = line.trim();

    if (!trimmed) {
      blankRun += 1;
      if (blankRun <= 2) {
        formattedLines.push("");
      }
      continue;
    }

    blankRun = 0;

    if (verbatimEnvironment !== null) {
      formattedLines.push(line);
      if (isLatexEnvironmentEnd(trimmed, verbatimEnvironment)) {
        verbatimEnvironment = null;
      }
      continue;
    }

    const startingVerbatimEnvironment = getLatexVerbatimEnvironmentStart(trimmed);
    const leadingEnvironmentEnd = getLatexLeadingEnvironmentEnd(trimmed);
    const content = trimmed.replace(/^(\\item(?:\[[^\]]*])?)\s{2,}/, "$1 ");
    const lineIndent = leadingEnvironmentEnd ? Math.max(0, indentLevel - 1) : indentLevel;

    formattedLines.push(`${"  ".repeat(lineIndent)}${content}`);

    if (startingVerbatimEnvironment !== null) {
      verbatimEnvironment = startingVerbatimEnvironment;
      indentLevel = lineIndent;
    } else {
      indentLevel = Math.max(0, lineIndent + getLatexEnvironmentDelta(content));
    }
  }

  return finishFormattedSource(formattedLines, hadFinalNewline);
}

export function lintMarkdownSource(source: string, path?: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let inFence = false;
  let fenceStartLine = 0;
  let previousHeadingLevel = 0;
  let h1Count = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (/[ \t]+$/.test(line)) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: line.length - (line.match(/[ \t]+$/)?.[0].length ?? 0) + 1,
        message: "Markdown lint: trailing whitespace."
      });
    }

    const fenceMatch = line.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      inFence = !inFence;
      fenceStartLine = inFence ? lineNumber : 0;
      return;
    }

    if (inFence) {
      return;
    }

    const heading = line.match(/^(#{1,6})(\s+|$)(.*)$/);
    if (heading) {
      const level = heading[1].length;

      if (level === 1) {
        h1Count += 1;

        if (h1Count > 1) {
          diagnostics.push({
            severity: "warning",
            path,
            line: lineNumber,
            column: 1,
            message: "Markdown lint: multiple top-level headings."
          });
        }
      }

      if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) {
        diagnostics.push({
          severity: "warning",
          path,
          line: lineNumber,
          column: 1,
          message: `Markdown lint: heading jumps from h${previousHeadingLevel} to h${level}.`
        });
      }

      previousHeadingLevel = level;
      return;
    }

    if (/^(#{1,6})[^\s#]/.test(line)) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: 1,
        message: "Markdown lint: add a space after heading markers."
      });
    }

    for (const match of line.matchAll(/\[([^\]]*)]\(([^)]*)\)/g)) {
      if (!match[1].trim() || !match[2].trim()) {
        diagnostics.push({
          severity: "warning",
          path,
          line: lineNumber,
          column: match.index + 1,
          message: "Markdown lint: link text and target should both be present."
        });
      }
    }
  });

  if (inFence) {
    diagnostics.push({
      severity: "error",
      path,
      line: fenceStartLine,
      column: 1,
      message: "Markdown lint: code fence is not closed."
    });
  }

  return diagnostics;
}

export function lintTypstSource(source: string, path?: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const bracketStack: Array<{ character: string; line: number; column: number }> = [];
  let inRawBlock = false;
  let rawBlockStartLine = 0;
  let previousHeadingLevel = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    pushTrailingWhitespaceDiagnostic(diagnostics, line, lineNumber, path, "Typst");

    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inRawBlock = !inRawBlock;
      rawBlockStartLine = inRawBlock ? lineNumber : 0;
      return;
    }

    if (inRawBlock) {
      return;
    }

    const heading = trimmed.match(/^(={1,6})(\s+|$)(.*)$/);
    if (heading) {
      const level = heading[1].length;
      if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) {
        diagnostics.push({
          severity: "warning",
          path,
          line: lineNumber,
          column: line.indexOf("=") + 1,
          message: `Typst lint: heading jumps from level ${previousHeadingLevel} to ${level}.`
        });
      }

      previousHeadingLevel = level;
    } else if (/^={1,6}[^\s=]/.test(trimmed)) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: line.indexOf("=") + 1,
        message: "Typst lint: add a space after heading markers."
      });
    }

    if (/^\s*\\(begin|section|subsection|documentclass|usepackage)\b/.test(line)) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: line.search(/\\/) + 1,
        message: "Typst lint: this line looks like LaTeX syntax."
      });
    }

    const commentlessLine = stripTypstLineComment(line);
    pushBracketDiagnostics(diagnostics, commentlessLine, lineNumber, path, "Typst", bracketStack);

    if (countUnescaped(commentlessLine, "$") % 2 === 1) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: commentlessLine.indexOf("$") + 1,
        message: "Typst lint: math delimiter may be unclosed on this line."
      });
    }
  });

  if (inRawBlock) {
    diagnostics.push({
      severity: "error",
      path,
      line: rawBlockStartLine,
      column: 1,
      message: "Typst lint: raw code block is not closed."
    });
  }

  for (const entry of bracketStack) {
    diagnostics.push({
      severity: "warning",
      path,
      line: entry.line,
      column: entry.column,
      message: `Typst lint: '${entry.character}' is not closed.`
    });
  }

  return diagnostics;
}

export function lintLatexSource(source: string, path?: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const environmentStack: Array<{ name: string; line: number; column: number }> = [];
  let verbatimEnvironment: string | null = null;
  let braceBalance = 0;
  let braceBalanceStart: { line: number; column: number } | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    pushTrailingWhitespaceDiagnostic(diagnostics, line, lineNumber, path, "LaTeX");

    const trimmed = line.trim();
    if (verbatimEnvironment !== null) {
      if (isLatexEnvironmentEnd(trimmed, verbatimEnvironment)) {
        verbatimEnvironment = null;
      }
      return;
    }

    const startingVerbatimEnvironment = getLatexVerbatimEnvironmentStart(trimmed);
    const commentlessLine = stripLatexLineComment(line);

    if (/^\s*#(?!#)/.test(line)) {
      diagnostics.push({
        severity: "error",
        path,
        line: lineNumber,
        column: line.search("#") + 1,
        message: "LaTeX lint: '#' starts a macro parameter here; did you paste Typst syntax?"
      });
    }

    if (/\\(?:write18|inputminted)\b|\\usepackage(?:\[[^\]]*])?{minted}/.test(commentlessLine)) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: line.search(/\\(?:write18|inputminted|usepackage)/) + 1,
        message: "LaTeX lint: this may require shell escape, which browser preview cannot run."
      });
    }

    const svgMatch = commentlessLine.match(/\\includegraphics(?:\[[^\]]*])?{[^}]*\.svg}/i);
    if (svgMatch) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: (svgMatch.index ?? 0) + 1,
        message: "LaTeX lint: pdfTeX cannot include SVG directly; use PDF/PNG or convert the image first."
      });
    }

    for (const match of commentlessLine.matchAll(/\\(begin|end)\s*{([^}]+)}/g)) {
      const [, kind, name] = match;

      if (kind === "begin") {
        environmentStack.push({ name, line: lineNumber, column: match.index + 1 });
      } else {
        const last = environmentStack.pop();
        if (!last || last.name !== name) {
          diagnostics.push({
            severity: "error",
            path,
            line: lineNumber,
            column: match.index + 1,
            message: last
              ? `LaTeX lint: expected \\end{${last.name}} before \\end{${name}}.`
              : `LaTeX lint: \\end{${name}} has no matching \\begin.`
          });
          if (last) {
            environmentStack.push(last);
          }
        }
      }
    }

    for (const match of commentlessLine.matchAll(/[{}]/g)) {
      if (isEscaped(commentlessLine, match.index)) {
        continue;
      }

      if (match[0] === "{") {
        if (braceBalance === 0) {
          braceBalanceStart = { line: lineNumber, column: match.index + 1 };
        }
        braceBalance += 1;
      } else {
        braceBalance -= 1;
        if (braceBalance < 0) {
          diagnostics.push({
            severity: "warning",
            path,
            line: lineNumber,
            column: match.index + 1,
            message: "LaTeX lint: closing brace has no matching opening brace."
          });
          braceBalance = 0;
          braceBalanceStart = null;
        } else if (braceBalance === 0) {
          braceBalanceStart = null;
        }
      }
    }

    if (countUnescaped(commentlessLine, "$") % 2 === 1) {
      diagnostics.push({
        severity: "warning",
        path,
        line: lineNumber,
        column: commentlessLine.indexOf("$") + 1,
        message: "LaTeX lint: math delimiter may be unclosed on this line."
      });
    }

    if (startingVerbatimEnvironment !== null) {
      verbatimEnvironment = startingVerbatimEnvironment;
    }
  });

  for (const entry of environmentStack) {
    diagnostics.push({
      severity: "error",
      path,
      line: entry.line,
      column: entry.column,
      message: `LaTeX lint: \\begin{${entry.name}} is not closed.`
    });
  }

  const unclosedBraceStart = braceBalanceStart as { line: number; column: number } | null;
  if (braceBalance > 0 && unclosedBraceStart) {
    diagnostics.push({
      severity: "warning",
      path,
      line: unclosedBraceStart.line,
      column: unclosedBraceStart.column,
      message: "LaTeX lint: opening brace may be unclosed."
    });
  }

  return diagnostics;
}

function formatPlainMarkupSource(source: string, transformLine: (line: string) => string): string {
  if (!source) {
    return source;
  }

  const hadFinalNewline = /\r?\n$/.test(source);
  const lines = getSourceLines(source);
  const formattedLines: string[] = [];
  let blankRun = 0;

  for (const rawLine of lines) {
    const line = transformLine(rawLine.replace(/[ \t]+$/g, ""));

    if (!line.trim()) {
      blankRun += 1;
      if (blankRun <= 2) {
        formattedLines.push("");
      }
      continue;
    }

    blankRun = 0;
    formattedLines.push(line);
  }

  return finishFormattedSource(formattedLines, hadFinalNewline);
}

function getSourceLines(source: string): string[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function finishFormattedSource(lines: string[], hadFinalNewline: boolean): string {
  let formatted = lines.join("\n").replace(/\n{3,}/g, "\n\n");

  if (hadFinalNewline || formatted.length > 0) {
    formatted = formatted.replace(/\n*$/g, "\n");
  }

  return formatted;
}

function getBracketDelta(line: string): number {
  let delta = 0;
  for (const character of line) {
    if (character === "{" || character === "[" || character === "(") {
      delta += 1;
    } else if (character === "}" || character === "]" || character === ")") {
      delta -= 1;
    }
  }
  return Math.min(1, Math.max(-1, delta));
}

function stripTypstLineComment(line: string): string {
  const commentIndex = line.indexOf("//");
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function stripLatexLineComment(line: string): string {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "%" && !isEscaped(line, index)) {
      return line.slice(0, index);
    }
  }
  return line;
}

function pushTrailingWhitespaceDiagnostic(
  diagnostics: CompileDiagnostic[],
  line: string,
  lineNumber: number,
  path: string | undefined,
  language: string
): void {
  const match = line.match(/[ \t]+$/);
  if (!match) {
    return;
  }

  diagnostics.push({
    severity: "warning",
    path,
    line: lineNumber,
    column: line.length - match[0].length + 1,
    message: `${language} lint: trailing whitespace.`
  });
}

function pushBracketDiagnostics(
  diagnostics: CompileDiagnostic[],
  line: string,
  lineNumber: number,
  path: string | undefined,
  language: string,
  stack: Array<{ character: string; line: number; column: number }>
): void {
  const closingToOpening: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{"
  };

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "(" || character === "[" || character === "{") {
      stack.push({ character, line: lineNumber, column: index + 1 });
    } else if (character === ")" || character === "]" || character === "}") {
      const last = stack.pop();
      if (!last || last.character !== closingToOpening[character]) {
        diagnostics.push({
          severity: "warning",
          path,
          line: lineNumber,
          column: index + 1,
          message: `${language} lint: '${character}' has no matching opener.`
        });
        if (last) {
          stack.push(last);
        }
      }
    }
  }
}

function countUnescaped(line: string, character: string): number {
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === character && !isEscaped(line, index)) {
      count += 1;
    }
  }
  return count;
}

function isEscaped(line: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function getLatexVerbatimEnvironmentStart(line: string): string | null {
  const match = line.match(/^\\begin{(verbatim|lstlisting|minted)}/);
  return match?.[1] ?? null;
}

function isLatexEnvironmentEnd(line: string, environmentName: string): boolean {
  return line.startsWith(`\\end{${environmentName}}`);
}

function getLatexLeadingEnvironmentEnd(line: string): string | null {
  return line.match(/^\\end{([^}]+)}/)?.[1] ?? null;
}

function getLatexEnvironmentDelta(line: string): number {
  let delta = 0;
  for (const match of line.matchAll(/\\(begin|end)\s*{([^}]+)}/g)) {
    delta += match[1] === "begin" ? 1 : -1;
  }
  return Math.min(1, Math.max(-1, delta));
}

function normalizeFormatterId(value: unknown, fallback: EditorFormatterId): EditorFormatterId {
  return value === "disabled" || value === "built-in" || value === "local-agent" || value === "cloud-container"
    ? value
    : fallback;
}

function normalizeLinterId(value: unknown, fallback: EditorLinterId): EditorLinterId {
  return value === "disabled" || value === "built-in" || value === "local-agent" || value === "cloud-container"
    ? value
    : fallback;
}

function formatEditorToolLanguage(language: SourceLanguage): string {
  return language === "typst"
    ? "Typst"
    : language === "latex"
      ? "LaTeX"
      : language === "markdown"
        ? "Markdown"
        : "this file type";
}
