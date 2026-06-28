import {
  snippetCompletion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";

export type SnippetLanguage = "typst" | "latex" | "markdown";

export const SNIPPET_LANGUAGES: SnippetLanguage[] = ["typst", "latex", "markdown"];

export const SNIPPET_LANGUAGE_LABELS: Record<SnippetLanguage, string> = {
  typst: "Typst",
  latex: "LaTeX",
  markdown: "Markdown"
};

export interface SnippetDefinition {
  prefix: string;
  body: string;
  description?: string;
}

export type TypstSnippet = SnippetDefinition;
export type SnippetCollections = Record<SnippetLanguage, SnippetDefinition[]>;

interface SnippetImportEntry {
  prefix?: unknown;
  trigger?: unknown;
  body?: unknown;
  template?: unknown;
  description?: unknown;
  name?: unknown;
}

interface SnippetImportObject {
  language?: unknown;
  snippets?: unknown;
}

export const DEFAULT_TYPST_SNIPPETS: SnippetDefinition[] = [
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

export const DEFAULT_LATEX_SNIPPETS: SnippetDefinition[] = [
  {
    prefix: "frac",
    body: "\\frac{${1:numerator}}{${2:denominator}}",
    description: "Fraction"
  },
  {
    prefix: "sqrt",
    body: "\\sqrt{${1:value}}",
    description: "Square root"
  },
  {
    prefix: "section",
    body: "\\section{${1:Title}}",
    description: "Section"
  },
  {
    prefix: "env",
    body: "\\begin{${1:environment}}\n\t${2}\n\\end{${1:environment}}",
    description: "Environment"
  },
  {
    prefix: "itemize",
    body: "\\begin{itemize}\n\t\\item ${1:item}\n\\end{itemize}",
    description: "Itemized list"
  },
  {
    prefix: "align",
    body: "\\begin{align}\n\t${1:equation}\n\\end{align}",
    description: "Aligned equations"
  }
];

export const DEFAULT_MARKDOWN_SNIPPETS: SnippetDefinition[] = [
  {
    prefix: "link",
    body: "[${1:text}](${2:url})",
    description: "Link"
  },
  {
    prefix: "image",
    body: "![${1:alt}](${2:url})",
    description: "Image"
  },
  {
    prefix: "code",
    body: "```${1:language}\n${2:code}\n```",
    description: "Code block"
  },
  {
    prefix: "table",
    body: "| ${1:Column} | ${2:Column} |\n| --- | --- |\n| ${3:Value} | ${4:Value} |",
    description: "Table"
  },
  {
    prefix: "task",
    body: "- [ ] ${1:task}",
    description: "Task"
  },
  {
    prefix: "details",
    body: "<details>\n<summary>${1:Summary}</summary>\n\n${2:Content}\n\n</details>",
    description: "Details block"
  }
];

export const DEFAULT_SNIPPETS_BY_LANGUAGE: SnippetCollections = {
  typst: DEFAULT_TYPST_SNIPPETS,
  latex: DEFAULT_LATEX_SNIPPETS,
  markdown: DEFAULT_MARKDOWN_SNIPPETS
};

export function createEmptySnippetCollections(): SnippetCollections {
  return {
    typst: [],
    latex: [],
    markdown: []
  };
}

export function getSnippetImportTemplate(language: SnippetLanguage) {
  return {
    language,
    snippets: DEFAULT_SNIPPETS_BY_LANGUAGE[language]
  };
}

export const SNIPPET_IMPORT_TEMPLATE = {
  language: "typst",
  snippets: DEFAULT_TYPST_SNIPPETS
};

export function parseSnippetImport(
  text: string,
  fallbackLanguage: SnippetLanguage = "typst"
): {
  ok: true;
  language: SnippetLanguage;
  snippets: SnippetDefinition[];
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

  const language = getSnippetImportLanguage(parsed) ?? fallbackLanguage;
  const snippets = normalizeSnippetCollection(parsed);

  if (!snippets) {
    return {
      ok: false,
      message: "No valid snippets were found."
    };
  }

  return {
    ok: true,
    language,
    snippets
  };
}

export function mergeSnippets(snippets: SnippetDefinition[]): SnippetDefinition[] {
  const byPrefix = new Map<string, SnippetDefinition>();

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

export function createSnippetCompletionSource(snippets: SnippetDefinition[]): CompletionSource {
  const definitions = mergeSnippets(snippets);

  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_.-]*/);

    if (!word) {
      return null;
    }

    if (!context.explicit && word.from === word.to) {
      return null;
    }

    return {
      from: word.from,
      options: definitions.map((snippet) =>
        snippetCompletion(snippet.body, {
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

export function createTypstSnippetCompletionSource(snippets: SnippetDefinition[]): CompletionSource {
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

export function createLanguageSnippetCompletionSource(
  language: SnippetLanguage,
  snippets: SnippetDefinition[]
): CompletionSource {
  return language === "typst"
    ? createTypstSnippetCompletionSource(snippets)
    : createSnippetCompletionSource(snippets);
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

export function normalizeSnippetCollections(value: unknown): SnippetCollections {
  const collections = createEmptySnippetCollections();

  if (Array.isArray(value)) {
    collections.typst = mergeSnippets(normalizeSnippetEntries(value) ?? []);
    return collections;
  }

  if (typeof value !== "object" || value === null) {
    return collections;
  }

  const candidate = value as Partial<Record<SnippetLanguage, unknown>> & SnippetImportObject;
  let foundLanguageCollection = false;

  for (const language of SNIPPET_LANGUAGES) {
    const snippets = Array.isArray(candidate[language])
      ? normalizeSnippetEntries(candidate[language])
      : null;

    if (snippets) {
      collections[language] = mergeSnippets(snippets);
      foundLanguageCollection = true;
    }
  }

  if (foundLanguageCollection) {
    return collections;
  }

  const language = getSnippetImportLanguage(value) ?? "typst";
  collections[language] = mergeSnippets(normalizeSnippetCollection(value) ?? []);
  return collections;
}

export function isSnippetLanguage(value: unknown): value is SnippetLanguage {
  return value === "typst" || value === "latex" || value === "markdown";
}

function getSnippetImportLanguage(value: unknown): SnippetLanguage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as SnippetImportObject;
  return isSnippetLanguage(candidate.language) ? candidate.language : null;
}

function normalizeSnippetCollection(value: unknown): SnippetDefinition[] | null {
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

function normalizeSnippetEntries(entries: unknown[]): SnippetDefinition[] | null {
  const snippets = entries
    .map((entry) => normalizeSnippetEntry(entry))
    .filter((entry): entry is SnippetDefinition => entry !== null);

  return snippets.length > 0 ? snippets : null;
}

function normalizeSnippetEntry(entry: unknown): SnippetDefinition | null {
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
