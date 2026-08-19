import type {
  Completion,
  CompletionContext,
  CompletionResult
} from "@codemirror/autocomplete";
import { normalizeRelativePath } from "../utils/relativePath";

export interface LatexProjectFile {
  path: string;
  content: string;
}

export interface LatexProjectLocation {
  path: string;
  line: number;
  column: number;
  offset: number;
}

export interface LatexProjectLabel {
  name: string;
  location: LatexProjectLocation;
}

export interface LatexProjectBibEntry {
  key: string;
  type: string;
  title?: string;
  author?: string;
  year?: string;
  location: LatexProjectLocation;
}

export interface LatexProjectPackage {
  name: string;
  location: LatexProjectLocation;
}

export interface LatexProjectCommand {
  /** Includes the leading backslash. */
  name: string;
  location: LatexProjectLocation;
}

export interface LatexProjectEnvironment {
  name: string;
  location: LatexProjectLocation;
}

export interface LatexProjectSection {
  command: string;
  level: number;
  title: string;
  location: LatexProjectLocation;
}

export interface LatexProjectIndex {
  files: LatexProjectFile[];
  filePaths: string[];
  labels: LatexProjectLabel[];
  bibEntries: LatexProjectBibEntry[];
  packages: LatexProjectPackage[];
  commands: LatexProjectCommand[];
  environments: LatexProjectEnvironment[];
  sections: LatexProjectSection[];
}

export interface LatexProjectCompletionOptions {
  activePath: string;
  /** Package names from a compiler or package catalog. */
  packageNames?: readonly string[];
  /** Complete labels, citations, files, commands, and environments. */
  semanticCompletion?: boolean;
  /** Complete package names inside usepackage/RequirePackage. */
  packageCompletion?: boolean;
}

export interface LatexResolvedFileReference {
  path: string;
  command: string;
  reference: string;
  from: number;
  to: number;
}

const SECTION_LEVELS: Record<string, number> = {
  part: 1,
  chapter: 2,
  section: 3,
  subsection: 4,
  subsubsection: 5,
  paragraph: 6,
  subparagraph: 7
};

const TEX_FILE_EXTENSIONS = new Set(["tex", "ltx", "latex"]);
const LATEX_TEXT_EXTENSIONS = new Set(["tex", "ltx", "latex", "sty", "cls", "tikz", "pgf"]);
const GRAPHIC_FILE_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "eps",
  "ps",
  "bmp",
  "tif",
  "tiff",
  "avif"
]);
const REFERENCE_COMMANDS = [
  "ref",
  "pageref",
  "eqref",
  "autoref",
  "cref",
  "Cref",
  "nameref",
  "vref",
  "Vref"
];
const CITE_COMMAND_PATTERN =
  "(?:cite|Cite|citep|Citep|citet|Citet|citealp|citealt|citeauthor|citeyear|fullcite|volcite|pvolcite|fvolcite|parencite|Parencite|textcite|Textcite|autocite|Autocite|footcite|Footcite|smartcite|Smartcite|supercite|nocite)";

export function buildLatexProjectIndex(files: readonly LatexProjectFile[]): LatexProjectIndex {
  const normalizedFiles = normalizeProjectFiles(files);
  const index: LatexProjectIndex = {
    files: normalizedFiles,
    filePaths: normalizedFiles.map((file) => file.path),
    labels: [],
    bibEntries: [],
    packages: [],
    commands: [],
    environments: [],
    sections: []
  };

  for (const file of normalizedFiles) {
    if (getPathExtension(file.path) === "bib") {
      index.bibEntries.push(...extractBibEntries(file));
      continue;
    }

    if (!isLatexTextPath(file.path)) {
      continue;
    }

    const masked = maskLatexComments(file.content);
    index.labels.push(...extractLabels(file, masked));
    index.packages.push(...extractPackages(file, masked));
    index.commands.push(...extractCommands(file, masked));
    index.environments.push(...extractEnvironments(file, masked));
    index.sections.push(...extractSections(file, masked));
  }

  return index;
}

export function createLatexProjectCompletionSource(
  index: LatexProjectIndex,
  options: LatexProjectCompletionOptions
): (context: CompletionContext) => CompletionResult | null {
  const activePath = normalizeRelativePath(options.activePath);
  const semanticCompletion = options.semanticCompletion ?? true;
  const packageCompletion = options.packageCompletion ?? true;
  const packageNames = uniqueStrings([
    ...index.packages.map((entry) => entry.name),
    ...(options.packageNames ?? [])
  ]);

  return (context: CompletionContext): CompletionResult | null => {
    const before = context.state.sliceDoc(0, context.pos);
    if (isPositionInLatexComment(before)) {
      return null;
    }

    const referenceMatch = semanticCompletion ? matchArgumentContext(
      before,
      new RegExp(`\\\\(?:${REFERENCE_COMMANDS.join("|")})\\*?\\s*\\{([^{}]*)$`)
    ) : null;
    if (referenceMatch) {
      return completionResult(
        referenceMatch.from,
        uniqueBy(index.labels, (entry) => entry.name).map((entry) => ({
          label: entry.name,
          type: "constant",
          detail: formatLocationDetail(entry.location),
          apply: entry.name
        })),
        /^[^{}\s,]*$/
      );
    }

    const citeMatch = semanticCompletion ? matchArgumentContext(
      before,
      new RegExp(`\\\\${CITE_COMMAND_PATTERN}\\*?(?:\\s*\\[[^\\]]*]){0,2}\\s*\\{([^{}]*)$`)
    ) : null;
    if (citeMatch) {
      return completionResult(
        citeMatch.from,
        uniqueBy(index.bibEntries, (entry) => entry.key).map((entry) => ({
          label: entry.key,
          type: "constant",
          detail: formatBibEntryDetail(entry),
          info: entry.title,
          apply: entry.key
        })),
        /^[^{}\s,]*$/
      );
    }

    const texFileMatch = semanticCompletion ? matchArgumentContext(
      before,
      /\\(?:input|include|subfile)\*?\s*\{([^{}]*)$/
    ) : null;
    if (texFileMatch) {
      return fileCompletionResult(index, activePath, texFileMatch.from, TEX_FILE_EXTENSIONS, true);
    }

    const graphicMatch = semanticCompletion ? matchArgumentContext(
      before,
      /\\includegraphics\*?(?:\s*\[[^\]]*])?\s*\{([^{}]*)$/
    ) : null;
    if (graphicMatch) {
      return fileCompletionResult(index, activePath, graphicMatch.from, GRAPHIC_FILE_EXTENSIONS, false);
    }

    const bibliographyMatch = semanticCompletion ? matchArgumentContext(
      before,
      /\\(bibliography|addbibresource)\*?(?:\s*\[[^\]]*])?\s*\{([^{}]*)$/,
      2
    ) : null;
    if (bibliographyMatch) {
      const omitExtension = bibliographyMatch.command === "bibliography";
      return fileCompletionResult(index, activePath, bibliographyMatch.from, new Set(["bib"]), omitExtension);
    }

    const packageMatch = packageCompletion ? matchArgumentContext(
      before,
      /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*])?\s*\{([^{}]*)$/
    ) : null;
    if (packageMatch) {
      const loadedPackages = new Set(index.packages.map((entry) => entry.name));
      return completionResult(
        packageMatch.from,
        packageNames.map((name) => ({
          label: name,
          type: "module",
          detail: loadedPackages.has(name) ? "Used in this project" : "LaTeX package",
          apply: name,
          boost: loadedPackages.has(name) ? 2 : 0
        })),
        /^[A-Za-z0-9_.-]*$/
      );
    }

    const environmentMatch = semanticCompletion
      ? matchArgumentContext(before, /\\(?:begin|end)\s*\{([^{}]*)$/)
      : null;
    if (environmentMatch) {
      return completionResult(
        environmentMatch.from,
        uniqueBy(index.environments, (entry) => entry.name).map((entry) => ({
          label: entry.name,
          type: "class",
          detail: `Project environment · ${formatLocationDetail(entry.location)}`,
          apply: entry.name
        })),
        /^[A-Za-z0-9*+@_.:-]*$/
      );
    }

    const commandMatch = semanticCompletion ? /\\[A-Za-z@]*$/.exec(before) : null;
    if (commandMatch) {
      return completionResult(
        commandMatch.index,
        uniqueBy(index.commands, (entry) => entry.name).map((entry) => ({
          label: entry.name,
          type: "function",
          detail: `Project command · ${formatLocationDetail(entry.location)}`,
          apply: entry.name
        })),
        /^\\[A-Za-z@]*$/
      );
    }

    return null;
  };
}

export function resolveLatexFileReferenceAt(
  source: string,
  cursor: number,
  activePath: string,
  index: LatexProjectIndex
): LatexResolvedFileReference | null {
  const position = Math.max(0, Math.min(source.length, cursor));
  const masked = maskLatexComments(source);
  const commandPattern =
    /\\(input|include|subfile|includegraphics|bibliography|addbibresource)\*?(?:\s*\[[^\]]*])?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = commandPattern.exec(masked))) {
    const argumentFrom = match.index + match[0].length;
    const argumentTo = findClosingBrace(masked, argumentFrom - 1);

    if (argumentTo < 0) {
      continue;
    }

    if (position < argumentFrom || position > argumentTo) {
      commandPattern.lastIndex = argumentTo + 1;
      continue;
    }

    const command = match[1];
    const argument = source.slice(argumentFrom, argumentTo);
    const segment = findCommaSeparatedSegment(argument, position - argumentFrom);
    const reference = segment.value.trim();

    if (!reference) {
      return null;
    }

    const path = resolveReferencePath(
      reference,
      activePath,
      index.filePaths,
      command === "input" || command === "include" || command === "subfile"
        ? TEX_FILE_EXTENSIONS
        : command === "includegraphics"
          ? GRAPHIC_FILE_EXTENSIONS
          : new Set(["bib"])
    );

    if (!path) {
      return null;
    }

    const leadingWhitespace = segment.value.length - segment.value.trimStart().length;
    const trailingWhitespace = segment.value.length - segment.value.trimEnd().length;
    return {
      path,
      command,
      reference,
      from: argumentFrom + segment.from + leadingWhitespace,
      to: argumentFrom + segment.to - trailingWhitespace
    };
  }

  return null;
}

function normalizeProjectFiles(files: readonly LatexProjectFile[]): LatexProjectFile[] {
  const byPath = new Map<string, LatexProjectFile>();

  for (const file of files) {
    const path = normalizeRelativePath(file.path);
    if (!path) {
      continue;
    }

    byPath.set(path, { path, content: file.content });
  }

  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function extractLabels(file: LatexProjectFile, masked: string): LatexProjectLabel[] {
  return collectMatches(masked, /\\label\s*\{([^{}]+)\}/g, (match) => ({
    name: match[1].trim(),
    location: locationAt(file, match.index)
  })).filter((entry) => entry.name.length > 0);
}

function extractPackages(file: LatexProjectFile, masked: string): LatexProjectPackage[] {
  const packages: LatexProjectPackage[] = [];

  for (const match of masked.matchAll(/\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*])?\s*\{([^{}]+)\}/g)) {
    for (const name of match[1].split(",").map((value) => value.trim()).filter(Boolean)) {
      packages.push({ name, location: locationAt(file, match.index) });
    }
  }

  return packages;
}

function extractCommands(file: LatexProjectFile, masked: string): LatexProjectCommand[] {
  const commands: LatexProjectCommand[] = [];
  const patterns = [
    /\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\*?\s*(?:\{\s*)?(\\[A-Za-z@]+)\s*\}?/g,
    /\\(?:NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand|DeclareDocumentCommand)\s*\{\s*(\\[A-Za-z@]+)\s*\}/g,
    /\\DeclareMathOperator\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}/g,
    /\\(?:def|gdef|edef|xdef)\s*(\\[A-Za-z@]+)/g
  ];

  for (const pattern of patterns) {
    for (const match of masked.matchAll(pattern)) {
      commands.push({ name: match[1], location: locationAt(file, match.index) });
    }
  }

  return commands;
}

function extractEnvironments(file: LatexProjectFile, masked: string): LatexProjectEnvironment[] {
  const patterns = [
    /\\(?:newenvironment|renewenvironment|provideenvironment|NewDocumentEnvironment|RenewDocumentEnvironment)\*?\s*\{\s*([^{}\s]+)\s*\}/g,
    /\\newtheorem\*?\s*\{\s*([^{}\s]+)\s*\}/g
  ];

  return patterns.flatMap((pattern) =>
    collectMatches(masked, pattern, (match) => ({
      name: match[1],
      location: locationAt(file, match.index)
    }))
  );
}

function extractSections(file: LatexProjectFile, masked: string): LatexProjectSection[] {
  const sections: LatexProjectSection[] = [];
  const pattern = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\s*\[[^\]]*])?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(masked))) {
    const argumentFrom = match.index + match[0].length;
    const argumentTo = findClosingBrace(masked, argumentFrom - 1);
    if (argumentTo < 0) {
      continue;
    }

    const title = cleanLatexTitle(file.content.slice(argumentFrom, argumentTo));
    if (title) {
      sections.push({
        command: match[1],
        level: SECTION_LEVELS[match[1]],
        title,
        location: locationAt(file, match.index)
      });
    }
    pattern.lastIndex = argumentTo + 1;
  }

  return sections;
}

function extractBibEntries(file: LatexProjectFile): LatexProjectBibEntry[] {
  const masked = maskLatexComments(file.content);
  const entries: LatexProjectBibEntry[] = [];
  const pattern = /@([A-Za-z]+)\s*([({])\s*([^\s,({}]+)\s*,/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(masked))) {
    const type = match[1].toLowerCase();
    if (type === "comment" || type === "preamble" || type === "string") {
      continue;
    }

    const openIndex = match.index + match[0].indexOf(match[2]);
    const closeIndex = findMatchingDelimiter(masked, openIndex, match[2], match[2] === "{" ? "}" : ")");
    const entryEnd = closeIndex < 0 ? masked.length : closeIndex;
    const bodyFrom = match.index + match[0].length;
    const body = file.content.slice(bodyFrom, entryEnd);
    entries.push({
      key: match[3],
      type,
      title: extractBibField(body, "title"),
      author: extractBibField(body, "author"),
      year: extractBibField(body, "year"),
      location: locationAt(file, match.index)
    });

    if (closeIndex >= 0) {
      pattern.lastIndex = closeIndex + 1;
    }
  }

  return entries;
}

function extractBibField(body: string, fieldName: string): string | undefined {
  const fieldPattern = new RegExp(`(?:^|,)\\s*${fieldName}\\s*=\\s*`, "ig");
  const match = fieldPattern.exec(body);
  if (!match) {
    return undefined;
  }

  let cursor = match.index + match[0].length;
  while (/\s/.test(body[cursor] ?? "")) {
    cursor += 1;
  }

  const opening = body[cursor];
  if (opening === "{" || opening === '"') {
    const closing = opening === "{" ? "}" : '"';
    const end = findMatchingDelimiter(body, cursor, opening, closing);
    if (end < 0) {
      return cleanBibValue(body.slice(cursor + 1));
    }
    return cleanBibValue(body.slice(cursor + 1, end));
  }

  const end = body.indexOf(",", cursor);
  return cleanBibValue(body.slice(cursor, end < 0 ? body.length : end));
}

function cleanBibValue(value: string): string | undefined {
  const cleaned = value
    .replace(/[{}]/g, "")
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/\\[A-Za-z@]+\*?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function cleanLatexTitle(value: string): string {
  return value
    .replace(/\\texorpdfstring\s*\{([^{}]*)\}\s*\{[^{}]*\}/g, "$1")
    .replace(/\\[A-Za-z@]+\*?(?:\s*\[[^\]]*])?\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/\\[A-Za-z@]+\*?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function locationAt(file: LatexProjectFile, offset: number): LatexProjectLocation {
  const prefix = file.content.slice(0, offset);
  const line = prefix.split("\n").length;
  const lastNewline = prefix.lastIndexOf("\n");
  return {
    path: file.path,
    line,
    column: offset - lastNewline,
    offset
  };
}

function maskLatexComments(source: string): string {
  const characters = source.split("");
  let lineStart = 0;

  for (let index = 0; index <= source.length; index += 1) {
    if (index < source.length && source[index] !== "\n") {
      continue;
    }

    for (let cursor = lineStart; cursor < index; cursor += 1) {
      if (source[cursor] !== "%" || isEscapedAt(source, cursor)) {
        continue;
      }

      for (let commentIndex = cursor; commentIndex < index; commentIndex += 1) {
        characters[commentIndex] = " ";
      }
      break;
    }
    lineStart = index + 1;
  }

  return characters.join("");
}

function isEscapedAt(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function isPositionInLatexComment(sourceBeforePosition: string): boolean {
  const lineStart = sourceBeforePosition.lastIndexOf("\n") + 1;
  for (let index = lineStart; index < sourceBeforePosition.length; index += 1) {
    if (sourceBeforePosition[index] === "%" && !isEscapedAt(sourceBeforePosition, index)) {
      return true;
    }
  }
  return false;
}

function findClosingBrace(source: string, openIndex: number): number {
  return findMatchingDelimiter(source, openIndex, "{", "}");
}

function findMatchingDelimiter(
  source: string,
  openIndex: number,
  opening: string,
  closing: string
): number {
  if (opening === closing) {
    for (let index = openIndex + 1; index < source.length; index += 1) {
      if (source[index] === closing && !isEscapedAt(source, index)) {
        return index;
      }
    }
    return -1;
  }

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === opening && !isEscapedAt(source, index)) {
      depth += 1;
      continue;
    }
    if (source[index] === closing && !isEscapedAt(source, index)) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function matchArgumentContext(
  before: string,
  pattern: RegExp,
  argumentGroup = 1
): { from: number; command?: string } | null {
  const match = pattern.exec(before);
  if (!match) {
    return null;
  }

  const argument = match[argumentGroup] ?? "";
  const commaIndex = argument.lastIndexOf(",");
  const segment = argument.slice(commaIndex + 1);
  const leadingWhitespace = segment.length - segment.trimStart().length;
  return {
    from: before.length - segment.length + leadingWhitespace,
    command: match[1]
  };
}

function completionResult(
  from: number,
  options: Completion[],
  validFor: RegExp
): CompletionResult | null {
  if (options.length === 0) {
    return null;
  }
  return { from, options, validFor };
}

function fileCompletionResult(
  index: LatexProjectIndex,
  activePath: string,
  from: number,
  extensions: ReadonlySet<string>,
  omitExtension: boolean
): CompletionResult | null {
  const options = index.filePaths
    .filter((path) => extensions.has(getPathExtension(path)))
    .map((path) => {
      const relativePath = makeRelativePath(activePath, path);
      const appliedPath = omitExtension ? stripKnownExtension(relativePath, extensions) : relativePath;
      return {
        label: appliedPath,
        type: "file",
        detail: path,
        apply: appliedPath
      } satisfies Completion;
    });
  return completionResult(from, uniqueBy(options, (option) => option.label), /^[^{}\s,]*$/);
}

function resolveReferencePath(
  reference: string,
  activePath: string,
  filePaths: readonly string[],
  defaultExtensions: ReadonlySet<string>
): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) {
    return null;
  }

  const normalizedActivePath = normalizeRelativePath(activePath);
  const activeDirectory = getPathDirectory(normalizedActivePath);
  const normalizedReference = normalizeRelativePath(
    reference.startsWith("/") ? reference.slice(1) : [activeDirectory, reference].filter(Boolean).join("/")
  );
  const paths = new Set(filePaths.map(normalizeRelativePath));

  if (paths.has(normalizedReference)) {
    return normalizedReference;
  }

  if (getPathExtension(normalizedReference)) {
    return null;
  }

  for (const extension of defaultExtensions) {
    const candidate = `${normalizedReference}.${extension}`;
    if (paths.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findCommaSeparatedSegment(
  value: string,
  cursor: number
): { value: string; from: number; to: number } {
  const position = Math.max(0, Math.min(value.length, cursor));
  const previousComma = value.lastIndexOf(",", Math.max(0, position - 1));
  const nextComma = value.indexOf(",", position);
  const from = previousComma + 1;
  const to = nextComma < 0 ? value.length : nextComma;
  return { value: value.slice(from, to), from, to };
}

function makeRelativePath(activePath: string, targetPath: string): string {
  const from = getPathDirectory(normalizeRelativePath(activePath)).split("/").filter(Boolean);
  const to = normalizeRelativePath(targetPath).split("/").filter(Boolean);

  while (from.length > 0 && to.length > 0 && from[0] === to[0]) {
    from.shift();
    to.shift();
  }

  return [...from.map(() => ".."), ...to].join("/");
}

function stripKnownExtension(path: string, extensions: ReadonlySet<string>): string {
  const extension = getPathExtension(path);
  return extension && extensions.has(extension) ? path.slice(0, -(extension.length + 1)) : path;
}

function getPathDirectory(path: string): string {
  const segments = normalizeRelativePath(path).split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

function getPathExtension(path: string): string {
  const basename = normalizeRelativePath(path).split("/").at(-1) ?? "";
  return basename.includes(".") ? (basename.split(".").at(-1) ?? "").toLowerCase() : "";
}

function isLatexTextPath(path: string): boolean {
  return LATEX_TEXT_EXTENSIONS.has(getPathExtension(path));
}

function formatLocationDetail(location: LatexProjectLocation): string {
  return `${location.path}:${location.line}`;
}

function formatBibEntryDetail(entry: LatexProjectBibEntry): string {
  const metadata = [entry.author, entry.year].filter(Boolean).join(" · ");
  return [metadata, formatLocationDetail(entry.location)].filter(Boolean).join(" · ");
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const unique = new Map<string, T>();
  for (const value of values) {
    const valueKey = key(value);
    if (!unique.has(valueKey)) {
      unique.set(valueKey, value);
    }
  }
  return [...unique.values()];
}

function collectMatches<T>(
  source: string,
  pattern: RegExp,
  create: (match: RegExpMatchArray & { index: number }) => T
): T[] {
  return [...source.matchAll(pattern)].map((match) =>
    create(match as RegExpMatchArray & { index: number })
  );
}
