import { decompressSync } from "fflate";
import { createSourceRange, type PreviewRect, type PreviewSourceLink, type SourcePosition } from "./sourceLinks";

const SP_PER_PDF_POINT = 65781.76;
const MAX_FORWARD_LINE_DISTANCE = 12;

interface SynctexEntry {
  kind: string;
  pageNumber: number;
  sourceTag: number;
  line: number;
  column: number;
  rect: PreviewRect;
  path?: string;
}

interface ParsedSynctex {
  entries: SynctexEntry[];
  inputs: Map<number, string>;
}

export interface PdfPreviewPoint {
  pageNumber: number;
  x: number;
  y: number;
}

const parsedSynctexCache = new WeakMap<Uint8Array, ParsedSynctex>();

export function resolveSynctexReverseSearch(
  sourceMapData: Uint8Array | undefined,
  point: PdfPreviewPoint
): PreviewSourceLink | null {
  const parsed = parseSynctex(sourceMapData);

  if (!parsed || parsed.entries.length === 0) {
    return null;
  }

  const candidates = parsed.entries.filter((entry) => entry.pageNumber === point.pageNumber);
  const match = findNearestPreviewEntry(candidates, point.x, point.y);

  if (!match) {
    return null;
  }

  return {
    source: createSourceRange({
      path: match.path,
      line: match.line,
      column: match.column
    }),
    previewRect: match.rect
  };
}

export function resolveSynctexForwardSearch(
  sourceMapData: Uint8Array | undefined,
  position: SourcePosition | null | undefined
): PreviewSourceLink | null {
  const parsed = parseSynctex(sourceMapData);

  if (!parsed || !position) {
    return null;
  }

  const normalizedTargetPath = normalizeSourcePath(position.path);
  const pathMatches = normalizedTargetPath
    ? parsed.entries.filter((entry) => sourcePathsMatch(entry.path, normalizedTargetPath))
    : [];
  const candidates = pathMatches.length > 0 ? pathMatches : parsed.entries;
  let best: SynctexEntry | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const entry of candidates) {
    const lineDistance = Math.abs(entry.line - position.line);

    if (lineDistance > MAX_FORWARD_LINE_DISTANCE) {
      continue;
    }

    const columnDistance = Math.abs(entry.column - position.column);
    const pathPenalty = normalizedTargetPath && !sourcePathsMatch(entry.path, normalizedTargetPath) ? 1000 : 0;
    const score = pathPenalty + lineDistance * 100 + columnDistance + getSynctexKindPenalty(entry.kind);

    if (score < bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  if (!best) {
    return null;
  }

  return {
    source: createSourceRange({
      path: best.path,
      line: best.line,
      column: best.column
    }),
    previewRect: best.rect
  };
}

function parseSynctex(sourceMapData: Uint8Array | undefined): ParsedSynctex | null {
  if (!sourceMapData || sourceMapData.length === 0) {
    return null;
  }

  const cached = parsedSynctexCache.get(sourceMapData);

  if (cached) {
    return cached;
  }

  const content = decodeSynctex(sourceMapData);

  if (!content) {
    return null;
  }

  const inputs = new Map<number, string>();
  const entries: SynctexEntry[] = [];
  let pageNumber = 0;
  let unit = 1;
  let xOffset = 0;
  let yOffset = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const inputMatch = line.match(/^Input:(\d+):(.+)$/);

    if (inputMatch) {
      inputs.set(Number.parseInt(inputMatch[1] ?? "", 10), normalizeSourcePath(inputMatch[2] ?? ""));
      continue;
    }

    const pageMatch = line.match(/^(?:!|\{|Sheet:)(\d+)/);

    if (pageMatch) {
      pageNumber = Number.parseInt(pageMatch[1] ?? "", 10);
      continue;
    }

    const unitMatch = line.match(/^Unit:([\d.eE+-]+)/);

    if (unitMatch) {
      const nextUnit = Number.parseFloat(unitMatch[1] ?? "1");
      unit = Number.isFinite(nextUnit) && nextUnit > 0 ? nextUnit : 1;
      continue;
    }

    const xOffsetMatch = line.match(/^X Offset:([\d.eE+-]+)/);

    if (xOffsetMatch) {
      xOffset = parseNumber(xOffsetMatch[1]);
      continue;
    }

    const yOffsetMatch = line.match(/^Y Offset:([\d.eE+-]+)/);

    if (yOffsetMatch) {
      yOffset = parseNumber(yOffsetMatch[1]);
      continue;
    }

    const entry = parseSynctexBoxLine(line, pageNumber, unit, xOffset, yOffset, inputs);

    if (entry) {
      entries.push(entry);
    }
  }

  const parsed = { entries, inputs };
  parsedSynctexCache.set(sourceMapData, parsed);
  return parsed;
}

function decodeSynctex(sourceMapData: Uint8Array): string | null {
  const decoder = new TextDecoder();

  try {
    const bytes = sourceMapData[0] === 0x1f && sourceMapData[1] === 0x8b
      ? decompressSync(sourceMapData)
      : sourceMapData;
    return decoder.decode(bytes);
  } catch {
    try {
      return decoder.decode(sourceMapData);
    } catch {
      return null;
    }
  }
}

function parseSynctexBoxLine(
  line: string,
  pageNumber: number,
  unit: number,
  xOffset: number,
  yOffset: number,
  inputs: Map<number, string>
): SynctexEntry | null {
  if (pageNumber <= 0) {
    return null;
  }

  const kind = line[0] ?? "";
  const numbers = line
    .match(/-?\d+/g)
    ?.map((value) => Number.parseInt(value, 10)) ?? [];

  if (numbers.length < 6) {
    return null;
  }

  const [sourceTag, sourceLine, rawX, rawY, rawWidth, rawHeight, rawDepth = 0] = numbers;
  const x = toPdfPoint(rawX ?? 0, unit, xOffset);
  const y = toPdfPoint(rawY ?? 0, unit, yOffset);
  const width = normalizeSynctexExtent(Math.abs(toPdfPoint(rawWidth ?? 0, unit, 0)), kind, "width");
  const height = normalizeSynctexExtent(
    Math.abs(toPdfPoint((rawHeight ?? 0) + Math.max(0, rawDepth), unit, 0)),
    kind,
    "height"
  );

  if (!Number.isFinite(sourceTag) || !Number.isFinite(sourceLine) || sourceLine <= 0) {
    return null;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    kind,
    pageNumber,
    sourceTag,
    line: sourceLine,
    column: 0,
    path: inputs.get(sourceTag),
    rect: {
      pageNumber,
      left: x,
      top: y,
      width,
      height
    }
  };
}

function normalizeSynctexExtent(value: number, kind: string, axis: "width" | "height"): number {
  if (value > 0) {
    return value;
  }

  if (kind === "x" || kind === "k" || kind === "g") {
    return axis === "width" ? 3 : 8;
  }

  return axis === "width" ? 4 : 10;
}

function getSynctexKindPenalty(kind: string): number {
  switch (kind) {
    case "x":
      return 0;
    case "k":
    case "g":
      return 20;
    case "h":
      return 60;
    case "v":
      return 140;
    case "[":
    case "(":
    case "{":
      return 300;
    default:
      return 180;
  }
}

function findNearestPreviewEntry(entries: SynctexEntry[], x: number, y: number): SynctexEntry | null {
  let best: SynctexEntry | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const entry of entries) {
    const rect = entry.rect;
    const insideX = x >= rect.left && x <= rect.left + rect.width;
    const insideY = y >= rect.top && y <= rect.top + rect.height;
    const dx = insideX ? 0 : Math.min(Math.abs(x - rect.left), Math.abs(x - (rect.left + rect.width)));
    const dy = insideY ? 0 : Math.min(Math.abs(y - rect.top), Math.abs(y - (rect.top + rect.height)));
    const area = rect.width * rect.height;
    const kindPenalty = getSynctexKindPenalty(entry.kind);
    const areaPenalty = Math.min(area, 250000) / 250;
    const distancePenalty = dx * dx + dy * dy;
    const score = distancePenalty + areaPenalty + kindPenalty;

    if (score < bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  return best;
}

function sourcePathsMatch(entryPath: string | undefined, normalizedTargetPath: string): boolean {
  const normalizedEntryPath = normalizeSourcePath(entryPath);

  return Boolean(
    normalizedEntryPath &&
      (normalizedEntryPath === normalizedTargetPath ||
        normalizedEntryPath.endsWith("/" + normalizedTargetPath) ||
        normalizedTargetPath.endsWith("/" + normalizedEntryPath))
  );
}

function normalizeSourcePath(path: string | undefined): string {
  return (path ?? "")
    .trim()
    .replace(/^file:\/\//, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function parseNumber(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPdfPoint(value: number, unit: number, offset: number): number {
  return ((value * unit) + offset) / SP_PER_PDF_POINT;
}
