export interface SourcePosition {
  path?: string;
  line: number;
  column: number;
}

export interface SourceRange extends SourcePosition {
  endLine?: number;
  endColumn?: number;
}

export interface PreviewRect {
  pageNumber?: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PreviewSourceLink {
  source: SourceRange;
  previewRect?: PreviewRect;
}

export function createSourceRange(options: {
  path?: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}): SourceRange {
  return {
    path: options.path,
    line: Math.max(1, Math.floor(options.line)),
    column: Math.max(0, Math.floor(options.column ?? 0)),
    endLine: options.endLine === undefined ? undefined : Math.max(1, Math.floor(options.endLine)),
    endColumn: options.endColumn === undefined ? undefined : Math.max(0, Math.floor(options.endColumn))
  };
}

export function parseSourceLocation(sourceLocation: string): SourceRange | null {
  const normalizedLocation = sourceLocation.trim();
  const locationMatch = normalizedLocation.match(
    /(?:^|\s|\()(?:(?<path>[^\s():]+):)?(?<line>\d+):(?<column>\d+)(?:-(?<endLine>\d+):(?<endColumn>\d+))?(?:$|\s|\))/
  );

  if (locationMatch) {
    return createSourceRange({
      path: locationMatch.groups?.path,
      line: Number.parseInt(locationMatch.groups?.line ?? "", 10),
      column: Number.parseInt(locationMatch.groups?.column ?? "", 10),
      endLine: locationMatch.groups?.endLine
        ? Number.parseInt(locationMatch.groups.endLine, 10)
        : undefined,
      endColumn: locationMatch.groups?.endColumn
        ? Number.parseInt(locationMatch.groups.endColumn, 10)
        : undefined
    });
  }

  const fallbackNumbers = normalizedLocation
    .match(/\d+/g)
    ?.map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part)) ?? [];

  if (fallbackNumbers.length >= 4) {
    const [line, column, endLine, endColumn] = fallbackNumbers.slice(-4);

    return createSourceRange({ line, column, endLine, endColumn });
  }

  if (fallbackNumbers.length >= 2) {
    const [line, column] = fallbackNumbers.slice(-2);

    return createSourceRange({ line, column });
  }

  return null;
}

export function sourcePositionIntersectsRange(
  position: SourcePosition,
  range: SourceRange
): boolean {
  const rangeStart = range.line;
  const rangeEnd = range.endLine ?? range.line;

  return position.line >= rangeStart && position.line <= rangeEnd;
}
