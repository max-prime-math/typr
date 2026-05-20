import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";

export interface TypstSnippet {
  prefix: string;
  body: string;
  description?: string;
}

interface SnippetImportEntry {
  prefix?: unknown;
  trigger?: unknown;
  body?: unknown;
  template?: unknown;
  description?: unknown;
  name?: unknown;
}

interface SnippetImportObject {
  snippets?: unknown;
}

export const DEFAULT_TYPST_SNIPPETS: TypstSnippet[] = [
  {
    prefix: "frac",
    body: "frac(${1:numerator}, ${2:denominator})",
    description: "Fraction"
  },
  {
    prefix: "sqrt",
    body: "sqrt(${1:value})",
    description: "Square root"
  },
  {
    prefix: "lim",
    body: "lim_(${1:x} -> ${2:3})",
    description: "Limit"
  },
  {
    prefix: "int",
    body: "integral_(${1:a})^(${2:b}) ${3:f(x)} dif ${4:x}",
    description: "Integral"
  },
  {
    prefix: "sum",
    body: "sum_(${1:n=1})^(${2:oo}) ${3:a_n}",
    description: "Summation"
  },
  {
    prefix: "vec",
    body: "vec(${1:x})",
    description: "Vector"
  },
  {
    prefix: "bb",
    body: "bb(${1:x})",
    description: "Bold math"
  }
];

export const SNIPPET_IMPORT_TEMPLATE = {
  snippets: DEFAULT_TYPST_SNIPPETS
};

export function parseSnippetImport(text: string): {
  ok: true;
  snippets: TypstSnippet[];
} | {
  ok: false;
  message: string;
} {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: "Snippets must be valid JSON."
    };
  }

  const snippets = normalizeSnippetCollection(parsed);

  if (!snippets) {
    return {
      ok: false,
      message: "No valid snippets were found."
    };
  }

  return {
    ok: true,
    snippets
  };
}

export function mergeSnippets(snippets: TypstSnippet[]): TypstSnippet[] {
  const byPrefix = new Map<string, TypstSnippet>();

  for (const snippet of snippets) {
    const prefix = snippet.prefix.trim();
    const body = snippet.body.trim();

    if (!prefix || !body) {
      continue;
    }

    byPrefix.set(prefix, {
      prefix,
      body,
      description: snippet.description?.trim() || undefined
    });
  }

  return [...byPrefix.values()].sort((left, right) =>
    left.prefix.localeCompare(right.prefix)
  );
}

export function createSnippetCompletionSource(snippets: TypstSnippet[]): CompletionSource {
  const definitions = mergeSnippets(snippets);

  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_.-]*/);

    if (!word) {
      return null;
    }

    if (!context.explicit && word.from === word.to) {
      return null;
    }

    const wrapInMath = !isPositionInsideMathMode(context.state, context.pos);

    return {
      from: word.from,
      options: definitions.map((snippet) =>
        snippetCompletion(wrapInMath ? `$${snippet.body}$` : snippet.body, {
          label: snippet.prefix,
          displayLabel: snippet.prefix,
          detail: snippet.description,
          type: "keyword"
        })
      ),
      validFor: /^[A-Za-z_][A-Za-z0-9_.-]*$/
    };
  };
}

export function isPositionInsideMathMode(state: EditorState, position: number): boolean {
  const line = state.doc.lineAt(position);
  const text = line.text.slice(0, position - line.from);
  let isEscaped = false;
  let delimiterCount = 0;

  for (const character of text) {
    if (character === "\\" && !isEscaped) {
      isEscaped = true;
      continue;
    }

    if (character === "$" && !isEscaped) {
      delimiterCount += 1;
    }

    isEscaped = false;
  }

  return delimiterCount % 2 === 1;
}

function normalizeSnippetCollection(value: unknown): TypstSnippet[] | null {
  if (Array.isArray(value)) {
    return normalizeSnippetEntries(value);
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as SnippetImportObject & SnippetImportEntry;

  if (Array.isArray(candidate.snippets)) {
    return normalizeSnippetEntries(candidate.snippets);
  }

  if (candidate.prefix !== undefined || candidate.trigger !== undefined) {
    const single = normalizeSnippetEntry(candidate);
    return single ? [single] : null;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(
    ([prefix, body]) => ({ prefix, body })
  );

  return normalizeSnippetEntries(entries);
}

function normalizeSnippetEntries(entries: unknown[]): TypstSnippet[] | null {
  const snippets = entries
    .map((entry) => normalizeSnippetEntry(entry))
    .filter((entry): entry is TypstSnippet => entry !== null);

  return snippets.length > 0 ? snippets : null;
}

function normalizeSnippetEntry(entry: unknown): TypstSnippet | null {
  if (typeof entry === "string") {
    return {
      prefix: entry.trim(),
      body: entry.trim()
    };
  }

  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const candidate = entry as SnippetImportEntry;
  const rawPrefix = candidate.prefix ?? candidate.trigger ?? candidate.name;
  const rawBody = candidate.body ?? candidate.template;

  if (typeof rawPrefix !== "string" || typeof rawBody !== "string") {
    return null;
  }

  const prefix = rawPrefix.trim();
  const body = rawBody.trim();

  if (!prefix || !body) {
    return null;
  }

  const description =
    typeof candidate.description === "string" && candidate.description.trim().length > 0
      ? candidate.description.trim()
      : undefined;

  return {
    prefix,
    body,
    description
  };
}
