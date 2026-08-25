import type {
  CompletionContext,
  CompletionResult,
  CompletionSource
} from "@codemirror/autocomplete";

interface LatexEnvironmentToken {
  kind: "begin" | "end";
  name: string;
  from: number;
}

const LATEX_ENVIRONMENT_TOKEN = /\\(begin|end)\s*\{([^{}\r\n]+)\}/g;
const LATEX_END_COMPLETION = /\\end(?:\{[^}\r\n]*)?$/;

export function findUnclosedLatexEnvironments(source: string, position: number): string[] {
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

  const seen = new Set<string>();
  const names: string[] = [];

  for (let index = unmatchedOpenings.length - 1; index >= 0; index -= 1) {
    const opening = unmatchedOpenings[index];

    if (opening.from >= position || seen.has(opening.name)) {
      continue;
    }

    seen.add(opening.name);
    names.push(opening.name);
  }

  return names;
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
      boost: Math.max(1, 99 - index)
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
      from
    });
  }

  return tokens;
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
