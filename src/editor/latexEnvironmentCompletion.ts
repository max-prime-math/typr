import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource
} from "@codemirror/autocomplete";
import { pickedCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { EDITOR_INDENT } from "./editorWhitespace";

interface LatexEnvironmentToken {
  kind: "begin" | "end";
  name: string;
  from: number;
  to: number;
}

export interface LatexEndCompletionEdit {
  cursor: number;
  from: number;
  insert: string;
  to: number;
}

const LATEX_ENVIRONMENT_TOKEN = /\\(begin|end)\s*\{([^{}\r\n]+)\}/g;
const LATEX_END_COMPLETION = /\\end(?:\{[^}\r\n]*)?$/;

export function findUnclosedLatexEnvironments(source: string, position: number): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const opening of findUnclosedLatexEnvironmentTokens(source, position)) {
    if (seen.has(opening.name)) {
      continue;
    }

    seen.add(opening.name);
    names.push(opening.name);
  }

  return names;
}

export function getLatexEndCompletionEdit(
  source: string,
  from: number,
  to: number,
  environmentName: string
): LatexEndCompletionEdit {
  const command = `\\end{${environmentName}}`;
  const lineStart = source.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const linePrefix = source.slice(lineStart, from);

  // A completion embedded after other content should only replace the command.
  if (linePrefix.trim()) {
    return { cursor: from + command.length, from, insert: command, to };
  }

  const opening = findUnclosedLatexEnvironmentTokens(source, to).find(
    (token) => token.name === environmentName
  );
  if (!opening) {
    return { cursor: from + command.length, from, insert: command, to };
  }

  const openingLineStart = source.lastIndexOf("\n", Math.max(0, opening.from - 1)) + 1;
  const openingIndent = (source.slice(openingLineStart, opening.from).match(/^[ \t]*/)?.[0] ?? "")
    .replace(/\t/g, EDITOR_INDENT);
  const openingLineEnd = source.indexOf("\n", opening.to);
  const directlyBelowOpening = openingLineEnd >= 0 && openingLineEnd + 1 === lineStart;
  const onlyWhitespaceAfterOpening = !source.slice(opening.to, from).trim();

  if (directlyBelowOpening || onlyWhitespaceAfterOpening) {
    const bodyIndent = `${openingIndent}${EDITOR_INDENT}`;
    return {
      cursor: lineStart + bodyIndent.length,
      from: lineStart,
      insert: `${bodyIndent}\n${openingIndent}${command}`,
      to
    };
  }

  return {
    cursor: lineStart + openingIndent.length + command.length,
    from: lineStart,
    insert: `${openingIndent}${command}`,
    to
  };
}

export const latexEnvironmentCompletionSource: CompletionSource = (
  context: CompletionContext
): CompletionResult | null => {
  const endCommand = context.matchBefore(LATEX_END_COMPLETION);

  if (!endCommand || isPositionInLatexComment(context.state.doc.toString(), endCommand.from)) {
    return null;
  }

  const environmentNames = findUnclosedLatexEnvironments(
    context.state.doc.toString(),
    context.pos
  );

  if (environmentNames.length === 0) {
    return null;
  }

  return {
    from: endCommand.from,
    options: environmentNames.map((name, index) => ({
      label: `\\end{${name}}`,
      detail: "Close unclosed environment",
      type: "keyword",
      boost: Math.max(1, 99 - index),
      apply: createLatexEndCompletionApply(name)
    })),
    validFor: /^\\end(?:\{[^}\r\n]*)?$/
  };
};

function findLatexEnvironmentTokens(source: string): LatexEnvironmentToken[] {
  const tokens: LatexEnvironmentToken[] = [];

  for (const match of source.matchAll(LATEX_ENVIRONMENT_TOKEN)) {
    const from = match.index;

    if (isPositionInLatexComment(source, from)) {
      continue;
    }

    const name = match[2].trim();

    if (!name) {
      continue;
    }

    tokens.push({
      kind: match[1] as "begin" | "end",
      name,
      from,
      to: from + match[0].length
    });
  }

  return tokens;
}

function findUnclosedLatexEnvironmentTokens(
  source: string,
  position: number
): LatexEnvironmentToken[] {
  const unmatchedOpenings: LatexEnvironmentToken[] = [];

  for (const token of findLatexEnvironmentTokens(source)) {
    if (token.kind === "begin") {
      unmatchedOpenings.push(token);
      continue;
    }

    const matchingOpeningIndex = findLastIndex(
      unmatchedOpenings,
      (opening) => opening.name === token.name
    );

    if (matchingOpeningIndex >= 0) {
      unmatchedOpenings.splice(matchingOpeningIndex, 1);
    }
  }

  return unmatchedOpenings
    .filter((opening) => opening.from < position)
    .reverse();
}

function createLatexEndCompletionApply(environmentName: string) {
  return (view: EditorView, completion: Completion, from: number, to: number): void => {
    const edit = getLatexEndCompletionEdit(
      view.state.doc.toString(),
      from,
      to,
      environmentName
    );

    view.dispatch({
      changes: {
        from: edit.from,
        to: edit.to,
        insert: edit.insert
      },
      selection: { anchor: edit.cursor },
      annotations: pickedCompletion.of(completion),
      scrollIntoView: true,
      userEvent: "input.complete"
    });
  };
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

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
}
