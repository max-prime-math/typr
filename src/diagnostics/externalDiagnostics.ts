import type { CompileDiagnostic } from "../compiler/types";
import type { SourceLanguage } from "../compiler/sourceFileTypes";

export type DiagnosticProviderId = "harper" | "local-lsp" | "remote-lsp";

export interface DiagnosticProviderStatus {
  id: DiagnosticProviderId;
  label: string;
  enabled: boolean;
  phase: "idle" | "checking" | "ready" | "warning" | "error";
  detail: string;
}

export interface ExternalDiagnosticProviderPreferences {
  harper: {
    enabled: boolean;
  };
  localLsp: {
    enabled: boolean;
    url: string;
  };
  remoteLsp: {
    enabled: boolean;
    url: string;
    allowDocumentUpload: boolean;
  };
}

export interface ExternalDiagnosticRequest {
  source: string;
  path: string;
  language: SourceLanguage;
  preferences: ExternalDiagnosticProviderPreferences;
  signal?: AbortSignal;
  onStatus?: (status: DiagnosticProviderStatus) => void;
}

export interface ExternalDiagnosticResult {
  diagnostics: CompileDiagnostic[];
  statuses: DiagnosticProviderStatus[];
}

const LSP_RESPONSE_TIMEOUT_MS = 1400;
const LSP_OPEN_TIMEOUT_MS = 3500;

let harperLinterPromise: Promise<HarperLinter> | null = null;

type HarperLinter = {
  setup(): Promise<void>;
  lint(text: string, options?: { language?: "plaintext" | "markdown" | "typst"; dedup?: boolean }): Promise<HarperLint[]>;
};

type HarperLint = {
  lint_kind_pretty(): string;
  message(): string;
  span(): { start: number; end: number; free?: () => void };
  suggestions(): Array<{ get_replacement_text(): string; free?: () => void }>;
  free?: () => void;
};

interface PreparedHarperSource {
  text: string;
  offsetMap: number[] | null;
}

interface JsonRpcMessage {
  jsonrpc?: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface LspDiagnostic {
  range?: {
    start?: { line?: number; character?: number };
    end?: { line?: number; character?: number };
  };
  severity?: number;
  message?: string;
  source?: string;
  code?: string | number;
}

export const DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES: ExternalDiagnosticProviderPreferences = {
  harper: {
    enabled: true
  },
  localLsp: {
    enabled: false,
    url: "ws://localhost:3007"
  },
  remoteLsp: {
    enabled: false,
    url: "",
    allowDocumentUpload: false
  }
};

export function normalizeExternalDiagnosticProviderPreferences(
  value: Partial<ExternalDiagnosticProviderPreferences> | undefined
): ExternalDiagnosticProviderPreferences {
  return {
    harper: {
      enabled: value?.harper?.enabled ?? DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES.harper.enabled
    },
    localLsp: {
      enabled: value?.localLsp?.enabled ?? DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES.localLsp.enabled,
      url: normalizeWebSocketUrl(value?.localLsp?.url, DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES.localLsp.url)
    },
    remoteLsp: {
      enabled: value?.remoteLsp?.enabled ?? DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES.remoteLsp.enabled,
      url: normalizeWebSocketUrl(value?.remoteLsp?.url, DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES.remoteLsp.url),
      allowDocumentUpload:
        value?.remoteLsp?.allowDocumentUpload ??
        DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES.remoteLsp.allowDocumentUpload
    }
  };
}

export async function runExternalDiagnostics({
  source,
  path,
  language,
  preferences,
  signal,
  onStatus
}: ExternalDiagnosticRequest): Promise<ExternalDiagnosticResult> {
  const normalizedPreferences = normalizeExternalDiagnosticProviderPreferences(preferences);
  const statuses = new Map<DiagnosticProviderId, DiagnosticProviderStatus>();
  const diagnostics: CompileDiagnostic[] = [];

  const updateStatus = (status: DiagnosticProviderStatus) => {
    statuses.set(status.id, status);
    onStatus?.(status);
  };

  const tasks: Array<Promise<void>> = [];

  if (normalizedPreferences.harper.enabled) {
    tasks.push(
      runHarperDiagnostics(source, path, language, signal, updateStatus).then((result) => {
        diagnostics.push(...result);
      })
    );
  } else {
    updateStatus(createStatus("harper", false, "idle", "Offline Harper diagnostics disabled."));
  }

  if (normalizedPreferences.localLsp.enabled) {
    tasks.push(
      runLspDiagnostics({
        id: "local-lsp",
        label: "Local WebSocket LSP",
        url: normalizedPreferences.localLsp.url,
        source,
        path,
        language,
        signal,
        updateStatus
      }).then((result) => {
        diagnostics.push(...result);
      })
    );
  } else {
    updateStatus(createStatus("local-lsp", false, "idle", "Local WebSocket LSP disabled."));
  }

  if (normalizedPreferences.remoteLsp.enabled) {
    if (!normalizedPreferences.remoteLsp.allowDocumentUpload) {
      updateStatus(
        createStatus(
          "remote-lsp",
          true,
          "warning",
          "Remote LSP is enabled, but document upload is not allowed."
        )
      );
    } else {
      tasks.push(
        runLspDiagnostics({
          id: "remote-lsp",
          label: "Remote WebSocket LSP",
          url: normalizedPreferences.remoteLsp.url,
          source,
          path,
          language,
          signal,
          updateStatus
        }).then((result) => {
          diagnostics.push(...result);
        })
      );
    }
  } else {
    updateStatus(createStatus("remote-lsp", false, "idle", "Remote WebSocket LSP disabled."));
  }

  await Promise.all(tasks);

  return {
    diagnostics: diagnostics.sort(compareDiagnostics),
    statuses: [...statuses.values()]
  };
}

function createStatus(
  id: DiagnosticProviderId,
  enabled: boolean,
  phase: DiagnosticProviderStatus["phase"],
  detail: string
): DiagnosticProviderStatus {
  return {
    id,
    label:
      id === "harper"
        ? "Harper"
        : id === "local-lsp"
          ? "Local WebSocket LSP"
          : "Remote WebSocket LSP",
    enabled,
    phase,
    detail
  };
}

async function runHarperDiagnostics(
  source: string,
  path: string,
  language: SourceLanguage,
  signal: AbortSignal | undefined,
  updateStatus: (status: DiagnosticProviderStatus) => void
): Promise<CompileDiagnostic[]> {
  updateStatus(createStatus("harper", true, "checking", "Checking prose offline in the browser."));

  try {
    throwIfAborted(signal);
    const linter = await getHarperLinter();
    throwIfAborted(signal);
    const harperSource = prepareHarperSource(source, language);
    const lints = await linter.lint(harperSource.text, {
      language: getHarperLanguage(language),
      dedup: true
    });
    throwIfAborted(signal);
    const diagnostics = lints
      .map((lint) => mapHarperLint(lint, source, harperSource, path))
      .filter((diagnostic): diagnostic is CompileDiagnostic => diagnostic !== null);

    updateStatus(
      createStatus(
        "harper",
        true,
        "ready",
        diagnostics.length === 0
          ? "Harper found no writing diagnostics."
          : `Harper found ${diagnostics.length} writing diagnostic${diagnostics.length === 1 ? "" : "s"}.`
      )
    );

    return diagnostics;
  } catch (error) {
    if (isAbortError(error)) {
      return [];
    }

    updateStatus(
      createStatus(
        "harper",
        true,
        "error",
        error instanceof Error ? error.message : "Harper diagnostics failed."
      )
    );
    return [];
  }
}

async function getHarperLinter(): Promise<HarperLinter> {
  if (!harperLinterPromise) {
    harperLinterPromise = Promise.all([
      import("harper.js"),
      import("harper.js/binaryInlined")
    ]).then(async ([harper, binaryModule]) => {
      const linter = new harper.LocalLinter({
        binary: binaryModule.binaryInlined,
        dialect: harper.Dialect.American
      });
      await linter.setup();
      return linter;
    });
  }

  return harperLinterPromise;
}

function getHarperLanguage(language: SourceLanguage): "plaintext" | "markdown" | "typst" {
  if (language === "typst") {
    return "typst";
  }

  if (language === "markdown") {
    return "markdown";
  }

  return "plaintext";
}

function prepareHarperSource(source: string, language: SourceLanguage): PreparedHarperSource {
  if (language !== "latex" && !looksLikeLatexSource(source)) {
    return { text: source, offsetMap: null };
  }

  return createLatexHarperSource(source);
}

function looksLikeLatexSource(source: string): boolean {
  return /\\(?:documentclass|usepackage|begin|end|maketitle|section|subsection|chapter|cite|ref|label)\b/.test(source);
}

export function createLatexHarperSource(source: string): PreparedHarperSource {
  const masked = maskLatexMarkupForHarper(source);
  const textParts: string[] = [];
  const offsetMap: number[] = [];
  let lineStart = 0;

  for (const line of masked.split("\n")) {
    const firstProseIndex = line.search(/\S/);

    if (firstProseIndex >= 0) {
      const lastProseIndex = findLastNonWhitespaceIndex(line);

      if (textParts.length > 0) {
        textParts.push("\n");
        offsetMap.push(lineStart);
      }

      for (let index = firstProseIndex; index <= lastProseIndex; index += 1) {
        textParts.push(line[index]);
        offsetMap.push(lineStart + index);
      }
    }

    lineStart += line.length + 1;
  }

  return {
    text: textParts.join(""),
    offsetMap
  };
}

export function maskLatexMarkupForHarper(source: string): string {
  let masked = source;

  masked = maskPattern(masked, /\\(?:begin|end)\s*\{[^}]*\}/g);
  masked = maskPattern(masked, /\\(?:usepackage|documentclass|bibliographystyle|bibliography|addbibresource|includegraphics)(?:\s*\[[^\]]*\])?\s*\{[^}]*\}/gi);
  masked = maskPattern(masked, /\\(?:cite|citep|citet|autocite|parencite|textcite|ref|eqref|autoref|label|url|href)(?:\s*\[[^\]]*\])?\s*\{[^}]*\}(?:\s*\{[^}]*\})?/gi);
  masked = maskPattern(masked, /\\[a-zA-Z@]+\*?(?:\s*\[[^\]]*\])?/g);
  masked = maskPattern(masked, /\\./g);
  masked = maskPattern(masked, /\$\$[\s\S]*?\$\$/g);
  masked = maskPattern(masked, /\$[^\n$]*\$/g);
  masked = maskPattern(masked, /\\\[[\s\S]*?\\\]/g);
  masked = maskPattern(masked, /\\\([\s\S]*?\\\)/g);
  masked = maskPattern(masked, /[{}]/g);

  return masked;
}

function findLastNonWhitespaceIndex(value: string): number {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (/\S/.test(value[index])) {
      return index;
    }
  }

  return -1;
}

function maskPattern(source: string, pattern: RegExp): string {
  return source.replace(pattern, (match) => preserveNewlinesAsSpaces(match));
}

function preserveNewlinesAsSpaces(value: string): string {
  return value.replace(/[^\n\r]/g, " ");
}
function mapHarperLint(
  lint: HarperLint,
  source: string,
  harperSource: PreparedHarperSource,
  path: string
): CompileDiagnostic | null {
  const span = lint.span();

  if (!harperSource.text.slice(span.start, span.end).trim()) {
    span.free?.();
    lint.free?.();
    return null;
  }

  const originalStartOffset = mapPreparedOffset(harperSource, span.start);
  const originalEndOffset = mapPreparedOffset(harperSource, Math.max(span.start, span.end - 1)) + 1;
  const kind = lint.lint_kind_pretty();
  const lintMessage = lint.message();

  if (
    isInsideLatexCommandName(source, originalStartOffset, originalEndOffset) ||
    isInsideTypstReference(source, originalStartOffset, originalEndOffset) ||
    isNearTypstReferenceCluster(source, originalStartOffset, originalEndOffset, kind)
  ) {
    span.free?.();
    lint.free?.();
    return null;
  }

  const start = offsetToLineColumn(source, originalStartOffset);
  const end = offsetToLineColumn(source, originalEndOffset);
  const suggestions = lint.suggestions();
  const suggestionText = suggestions
    .map((suggestion) => suggestion.get_replacement_text())
    .filter(Boolean)
    .slice(0, 3);
  const message = suggestionText.length > 0
    ? `Harper ${kind}: ${lintMessage} Suggestions: ${suggestionText.join(", ")}.`
    : `Harper ${kind}: ${lintMessage}`;

  span.free?.();
  for (const suggestion of suggestions) {
    suggestion.free?.();
  }
  lint.free?.();

  return {
    severity: "warning",
    path,
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    message
  };
}

async function runLspDiagnostics({
  id,
  label,
  url,
  source,
  path,
  language,
  signal,
  updateStatus
}: {
  id: "local-lsp" | "remote-lsp";
  label: string;
  url: string;
  source: string;
  path: string;
  language: SourceLanguage;
  signal: AbortSignal | undefined;
  updateStatus: (status: DiagnosticProviderStatus) => void;
}): Promise<CompileDiagnostic[]> {
  if (!url.trim()) {
    updateStatus(createStatus(id, true, "warning", `${label} URL is empty.`));
    return [];
  }

  updateStatus(createStatus(id, true, "checking", `Connecting to ${url}.`));

  try {
    const diagnostics = await requestLspDiagnostics({
      url,
      source,
      path,
      language,
      signal
    });

    updateStatus(
      createStatus(
        id,
        true,
        "ready",
        diagnostics.length === 0
          ? `${label} returned no diagnostics.`
          : `${label} returned ${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}.`
      )
    );

    return diagnostics;
  } catch (error) {
    if (isAbortError(error)) {
      return [];
    }

    updateStatus(
      createStatus(
        id,
        true,
        "error",
        error instanceof Error ? error.message : `${label} failed.`
      )
    );
    return [];
  }
}

function requestLspDiagnostics({
  url,
  source,
  path,
  language,
  signal
}: {
  url: string;
  source: string;
  path: string;
  language: SourceLanguage;
  signal?: AbortSignal;
}): Promise<CompileDiagnostic[]> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    const socket = new WebSocket(url);
    const diagnostics: CompileDiagnostic[] = [];
    const documentUri = createDocumentUri(path);
    let nextId = 1;
    let settled = false;
    let responseTimer: number | null = null;
    let openTimer: number | null = window.setTimeout(() => {
      rejectOnce(new Error(`Unable to connect to ${url}.`));
    }, LSP_OPEN_TIMEOUT_MS);

    const abort = () => rejectOnce(new DOMException("Diagnostics cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });

    const rejectOnce = (error: Error | DOMException) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(diagnostics);
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      if (openTimer !== null) {
        window.clearTimeout(openTimer);
        openTimer = null;
      }
      if (responseTimer !== null) {
        window.clearTimeout(responseTimer);
        responseTimer = null;
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };

    const scheduleResolve = () => {
      if (responseTimer !== null) {
        window.clearTimeout(responseTimer);
      }
      responseTimer = window.setTimeout(resolveOnce, LSP_RESPONSE_TIMEOUT_MS);
    };

    const send = (message: JsonRpcMessage) => {
      socket.send(JSON.stringify({ jsonrpc: "2.0", ...message }));
    };

    socket.addEventListener("open", () => {
      if (openTimer !== null) {
        window.clearTimeout(openTimer);
        openTimer = null;
      }

      send({
        id: nextId++,
        method: "initialize",
        params: {
          processId: null,
          rootUri: null,
          capabilities: {
            textDocument: {
              publishDiagnostics: {
                relatedInformation: false,
                versionSupport: false,
                codeDescriptionSupport: false,
                dataSupport: false
              }
            }
          },
          workspaceFolders: null
        }
      });
      send({ method: "initialized", params: {} });
      send({
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: documentUri,
            languageId: getLspLanguageId(language, path),
            version: 1,
            text: source
          }
        }
      });
      send({
        method: "textDocument/didChange",
        params: {
          textDocument: {
            uri: documentUri,
            version: 2
          },
          contentChanges: [{ text: source }]
        }
      });
      scheduleResolve();
    });

    socket.addEventListener("message", (event) => {
      const messages = parseLspMessages(String(event.data));

      for (const message of messages) {
        if (message.method !== "textDocument/publishDiagnostics") {
          continue;
        }

        const params = message.params as { uri?: string; diagnostics?: LspDiagnostic[] } | undefined;

        if (params?.uri && params.uri !== documentUri) {
          continue;
        }

        diagnostics.splice(
          0,
          diagnostics.length,
          ...(params?.diagnostics ?? []).map((diagnostic) => mapLspDiagnostic(diagnostic, path))
        );
        scheduleResolve();
      }
    });

    socket.addEventListener("error", () => {
      rejectOnce(new Error(`Unable to use WebSocket LSP at ${url}.`));
    });

    socket.addEventListener("close", () => {
      if (!settled) {
        resolveOnce();
      }
    });
  });
}

function parseLspMessages(data: string): JsonRpcMessage[] {
  const trimmed = data.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("Content-Length:")) {
    return trimmed
      .split(/\r?\n\r?\n/)
      .map((part) => part.trim())
      .filter((part) => part.startsWith("{"))
      .flatMap(parseLspMessages);
  }

  try {
    const parsed = JSON.parse(trimmed) as JsonRpcMessage | JsonRpcMessage[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function mapLspDiagnostic(diagnostic: LspDiagnostic, path: string): CompileDiagnostic {
  const start = diagnostic.range?.start;
  const end = diagnostic.range?.end;
  const source = diagnostic.source ? `${diagnostic.source}: ` : "";
  const code = diagnostic.code ? ` (${diagnostic.code})` : "";

  return {
    severity: diagnostic.severity === 1 ? "error" : "warning",
    path,
    line: typeof start?.line === "number" ? start.line + 1 : undefined,
    column: typeof start?.character === "number" ? start.character + 1 : undefined,
    endLine: typeof end?.line === "number" ? end.line + 1 : undefined,
    endColumn: typeof end?.character === "number" ? end.character + 1 : undefined,
    message: `${source}${diagnostic.message ?? "LSP diagnostic"}${code}`
  };
}

function isInsideTypstReference(source: string, startOffset: number, endOffset: number): boolean {
  const lineInfo = getSourceLineAtOffset(source, startOffset);
  const localStart = startOffset - lineInfo.start;
  const localEnd = Math.max(localStart, endOffset - lineInfo.start);

  for (const match of lineInfo.text.matchAll(/@[A-Za-z0-9_:\-]+/g)) {
    const referenceStart = match.index ?? 0;
    const referenceEnd = referenceStart + match[0].length;

    if (localStart >= referenceStart && localEnd <= referenceEnd) {
      return true;
    }
  }

  return false;
}

function isNearTypstReferenceCluster(
  source: string,
  startOffset: number,
  endOffset: number,
  kind: string
): boolean {
  if (kind !== "Punctuation" && kind !== "Spelling" && kind !== "Typo") {
    return false;
  }

  const lineInfo = getSourceLineAtOffset(source, startOffset);
  const references = [...lineInfo.text.matchAll(/@[A-Za-z0-9_:\-]+/g)];

  if (references.length === 0) {
    return false;
  }

  const localStart = startOffset - lineInfo.start;
  const localEnd = Math.max(localStart, endOffset - lineInfo.start);
  const firstReferenceStart = references[0].index ?? 0;
  const lastReference = references[references.length - 1];
  const lastReferenceEnd = (lastReference.index ?? 0) + lastReference[0].length;

  return localStart >= firstReferenceStart && localEnd <= lastReferenceEnd + 2;
}

function getSourceLineAtOffset(source: string, offset: number): { start: number; end: number; text: string } {
  const start = Math.max(source.lastIndexOf("\n", offset - 1) + 1, 0);
  const nextLineBreak = source.indexOf("\n", offset);
  const end = nextLineBreak === -1 ? source.length : nextLineBreak;

  return {
    start,
    end,
    text: source.slice(start, end)
  };
}

function isInsideLatexCommandName(source: string, startOffset: number, endOffset: number): boolean {
  const lineStart = Math.max(source.lastIndexOf("\n", startOffset - 1) + 1, 0);
  const lineEndIndex = source.indexOf("\n", startOffset);
  const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
  const line = source.slice(lineStart, lineEnd);
  const localStart = startOffset - lineStart;
  const localEnd = Math.max(localStart, endOffset - lineStart);

  for (const match of line.matchAll(/\\[A-Za-z@]+\*?/g)) {
    const commandStart = match.index ?? 0;
    const commandEnd = commandStart + match[0].length;

    if (localStart >= commandStart && localEnd <= commandEnd) {
      return true;
    }
  }

  return false;
}
function mapPreparedOffset(preparedSource: PreparedHarperSource, offset: number): number {
  if (!preparedSource.offsetMap) {
    return offset;
  }

  return preparedSource.offsetMap[Math.min(Math.max(0, offset), preparedSource.offsetMap.length - 1)] ?? 0;
}

function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.min(Math.max(0, offset), source.length);
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < safeOffset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    column: safeOffset - lineStart + 1
  };
}

function createDocumentUri(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `file://${normalizedPath.split("/").map(encodeURIComponent).join("/")}`;
}

function getLspLanguageId(language: SourceLanguage, path: string): string {
  if (language === "latex") {
    return path.toLowerCase().endsWith(".bib") ? "bibtex" : "latex";
  }

  return language;
}

function normalizeWebSocketUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return fallback;
  }

  return trimmed;
}

function compareDiagnostics(left: CompileDiagnostic, right: CompileDiagnostic): number {
  return (
    (left.path ?? "").localeCompare(right.path ?? "") ||
    (left.line ?? 0) - (right.line ?? 0) ||
    (left.column ?? 0) - (right.column ?? 0) ||
    left.message.localeCompare(right.message)
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Diagnostics cancelled.", "AbortError");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
