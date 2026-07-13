import type { CompileDiagnostic, CompileMetadata, CompileResult } from "../compiler/types";
import { normalizeCompilerPath } from "../compiler/sourceFileTypes";
import {
  readProjectFileBytes,
  type TyprProjectRepository
} from "../project/projectState";
import type { ThemeDefinition } from "../theme/themes";
import { hashTextContent } from "../utils/contentHash";
import { normalizeWorkspacePath } from "../workspace/workspaceTree";
import { getLatexPdfOutputPath } from "./compilePreviewState";

const TYPST_PREVIEW_CACHE_STORAGE_KEY = "typr.typst-preview-cache.v1";
const TYPST_PREVIEW_CACHE_MAX_CONTENT_LENGTH = 2_000_000;

type CachedTypstPreviewOutputKind = "svg" | "html" | "placeholder";

interface TypstPreviewCacheEntry {
  version: 1;
  signature: string;
  updatedAt: string;
  result: {
    ok: true;
    engine: Extract<CompileResult, { ok: true }>["engine"];
    diagnostics: CompileDiagnostic[];
    output: {
      kind: CachedTypstPreviewOutputKind;
      content: string;
    };
    metadata?: CompileMetadata;
  };
}

interface SavedLatexPdfOptions {
  allowStale: boolean;
  project: TyprProjectRepository;
  sourcePath: string;
  source: string;
}

export function loadSavedLatexPdfCompileResult(
  options: SavedLatexPdfOptions
): CompileResult | null {
  const pdfPath = getExistingLatexPdfPath(options.project, options.sourcePath);

  if (!pdfPath) {
    return null;
  }

  const pdfEntry = options.project.filesystem.entries[pdfPath];

  if (!pdfEntry || pdfEntry.kind !== "file") {
    return null;
  }

  const sourceEntry = options.project.filesystem.entries[
    normalizeCompilerPath(options.sourcePath) || options.sourcePath
  ];

  if (
    sourceEntry?.kind === "file" &&
    typeof sourceEntry.content === "string" &&
    sourceEntry.content !== options.source
  ) {
    return null;
  }

  if (
    !options.allowStale &&
    !isSavedLatexPdfFreshForSource({
      pdfUpdatedAt: pdfEntry.updatedAt,
      project: options.project,
      source: options.source,
      sourcePath: options.sourcePath
    })
  ) {
    return null;
  }

  return {
    ok: true,
    engine: "busytex",
    diagnostics: [],
    output: {
      kind: "pdf",
      content: "",
      artifactData:
        typeof pdfEntry.content === "string"
          ? new TextEncoder().encode(pdfEntry.content)
          : new Uint8Array(pdfEntry.content),
      sourceMapData: readProjectFileBytes(
        options.project,
        getLatexSynctexOutputPath(options.sourcePath)
      ) ?? undefined
    },
    metadata: {
      timings: [{ label: "Load saved PDF", durationMs: 0 }]
    }
  } satisfies CompileResult;
}

export function getLatexSynctexOutputPath(sourcePath: string): string {
  const normalizedSourcePath = normalizeCompilerPath(sourcePath) || sourcePath;

  if (/\.(tex|ltx|latex)$/i.test(normalizedSourcePath)) {
    return normalizedSourcePath.replace(/\.(tex|ltx|latex)$/i, ".synctex.gz");
  }

  return normalizedSourcePath + ".synctex.gz";
}

export function getExistingLatexPdfPath(
  project: TyprProjectRepository,
  sourcePath: string
): string | null {
  const pdfPath = getLatexPdfOutputPath(sourcePath);
  const pdfEntry = project.filesystem.entries[pdfPath];

  return pdfEntry?.kind === "file" ? pdfPath : null;
}

function isSavedLatexPdfFreshForSource({
  pdfUpdatedAt,
  project,
  source,
  sourcePath
}: {
  pdfUpdatedAt: string;
  project: TyprProjectRepository;
  source: string;
  sourcePath: string;
}): boolean {
  const pdfUpdatedAtMs = Date.parse(pdfUpdatedAt);

  if (!Number.isFinite(pdfUpdatedAtMs)) {
    return false;
  }

  const sourceEntry = project.filesystem.entries[
    normalizeCompilerPath(sourcePath) || sourcePath
  ];

  if (
    !sourceEntry ||
    sourceEntry.kind !== "file" ||
    typeof sourceEntry.content !== "string" ||
    sourceEntry.content !== source
  ) {
    return false;
  }

  const sourceUpdatedAtMs = Date.parse(sourceEntry.updatedAt);

  if (!Number.isFinite(sourceUpdatedAtMs)) {
    return false;
  }

  return sourceUpdatedAtMs <= pdfUpdatedAtMs;
}

export function createTypstPreviewCacheSignature({
  diagramAssetsRevision,
  isPaperView,
  projectUpdatedAt,
  source,
  sourcePath,
  theme
}: {
  diagramAssetsRevision: string;
  isPaperView: boolean;
  projectUpdatedAt: string;
  source: string;
  sourcePath: string;
  theme: ThemeDefinition;
}): string {
  const paletteJson = JSON.stringify(theme.palette);

  return [
    normalizeWorkspacePath(sourcePath) || sourcePath,
    `${source.length}:${hashTextContent(source)}`,
    theme.id,
    `${paletteJson.length}:${hashTextContent(paletteJson)}`,
    isPaperView ? "paper" : "screen",
    projectUpdatedAt,
    diagramAssetsRevision
  ].join("\x1f");
}

export function saveTypstPreviewCacheResult({
  projectKey,
  result,
  signature,
  sourcePath
}: {
  projectKey: string;
  result: Extract<CompileResult, { ok: true }>;
  signature: string;
  sourcePath: string;
}): void {
  if (typeof window === "undefined" || !isCachedTypstPreviewOutputKind(result.output.kind)) {
    return;
  }

  if (result.output.content.length > TYPST_PREVIEW_CACHE_MAX_CONTENT_LENGTH) {
    return;
  }

  const entry: TypstPreviewCacheEntry = {
    version: 1,
    signature,
    updatedAt: new Date().toISOString(),
    result: {
      ok: true,
      engine: result.engine,
      diagnostics: result.diagnostics,
      output: {
        kind: result.output.kind,
        content: result.output.content
      },
      metadata: result.metadata
    }
  };

  try {
    window.localStorage.setItem(
      getTypstPreviewCacheStorageKey(projectKey, sourcePath),
      JSON.stringify(entry)
    );
  } catch {
    // Preview restoration is best effort; failed cache writes should not affect editing.
  }
}

export function loadTypstPreviewCacheResult({
  projectKey,
  signature,
  sourcePath
}: {
  projectKey: string;
  signature: string;
  sourcePath: string;
}): Extract<CompileResult, { ok: true }> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(
      getTypstPreviewCacheStorageKey(projectKey, sourcePath)
    );

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);

    if (!isTypstPreviewCacheEntry(parsed) || parsed.signature !== signature) {
      return null;
    }

    return {
      ok: true,
      engine: parsed.result.engine,
      diagnostics: parsed.result.diagnostics,
      output: {
        kind: parsed.result.output.kind,
        content: parsed.result.output.content
      },
      metadata: parsed.result.metadata
    };
  } catch {
    return null;
  }
}

function getTypstPreviewCacheStorageKey(projectKey: string, sourcePath: string): string {
  return `${TYPST_PREVIEW_CACHE_STORAGE_KEY}:${encodeURIComponent(projectKey)}:${encodeURIComponent(
    normalizeWorkspacePath(sourcePath) || sourcePath
  )}`;
}

function isTypstPreviewCacheEntry(value: unknown): value is TypstPreviewCacheEntry {
  const entry = value as Partial<TypstPreviewCacheEntry> | null;
  const result = entry?.result as Partial<TypstPreviewCacheEntry["result"]> | undefined;
  const output = result?.output as
    | Partial<TypstPreviewCacheEntry["result"]["output"]>
    | undefined;

  return Boolean(
    entry &&
      entry.version === 1 &&
      typeof entry.signature === "string" &&
      typeof entry.updatedAt === "string" &&
      result?.ok === true &&
      typeof result.engine === "string" &&
      Array.isArray(result.diagnostics) &&
      output &&
      isCachedTypstPreviewOutputKind(output.kind) &&
      typeof output.content === "string"
  );
}

function isCachedTypstPreviewOutputKind(kind: unknown): kind is CachedTypstPreviewOutputKind {
  return kind === "svg" || kind === "html" || kind === "placeholder";
}

