import { normalizeRelativePath } from "../utils/relativePath";

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

interface ParsedIgnorePattern {
  negated: boolean;
  rootRelative: boolean;
  segments: string[];
}

export function matchesIgnorePattern(path: string, pattern: string): boolean {
  const pathSegments = getPathSegments(path);
  const parsedPattern = parseIgnorePattern(pattern);
  if (pathSegments.length === 0 || !parsedPattern) {
    return false;
  }

  return matchesParsedPattern(pathSegments, parsedPattern);
}

function parseIgnorePattern(pattern: string): ParsedIgnorePattern | null {
  let value = pattern.trim();
  if (!value || value.startsWith("#")) {
    return null;
  }

  const negated = value.startsWith("!");
  if (negated) {
    value = value.slice(1);
  }

  const anchored = value.startsWith("/");
  if (anchored) {
    value = value.slice(1);
  }

  if (value.endsWith("/")) {
    value = value.slice(0, -1);
  }

  const segments = value.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  return {
    negated,
    rootRelative: anchored || segments.length > 1,
    segments
  };
}

function matchesParsedPattern(
  pathSegments: string[],
  pattern: ParsedIgnorePattern
): boolean {
  if (pattern.rootRelative) {
    return matchesPathSegments(pathSegments, pattern.segments);
  }

  return pathSegments.some((segment) => matchesGlobSegment(segment, pattern.segments[0] ?? ""));
}

function matchesPathSegments(
  pathSegments: string[],
  patternSegments: string[],
  pathIndex = 0,
  patternIndex = 0
): boolean {
  if (patternIndex === patternSegments.length) {
    return true;
  }

  const patternSegment = patternSegments[patternIndex];
  if (patternSegment === "**") {
    for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
      if (matchesPathSegments(pathSegments, patternSegments, nextPathIndex, patternIndex + 1)) {
        return true;
      }
    }
    return false;
  }

  if (pathIndex === pathSegments.length || !patternSegment) {
    return false;
  }

  return (
    matchesGlobSegment(pathSegments[pathIndex] ?? "", patternSegment) &&
    matchesPathSegments(pathSegments, patternSegments, pathIndex + 1, patternIndex + 1)
  );
}

function matchesGlobSegment(pathSegment: string, patternSegment: string): boolean {
  const regex = new RegExp(
    `^${escapeRegex(patternSegment)
      .replace(/\\\*/g, ".*")
      .replace(/\\\?/g, ".")}$`
  );

  return regex.test(pathSegment);
}

function getPathSegments(path: string): string[] {
  return normalizeRelativePath(path).split("/").filter(Boolean);
}

export function shouldIgnorePath(path: string, patterns: string[]): boolean {
  const pathSegments = getPathSegments(path);
  if (pathSegments.length === 0) {
    return false;
  }

  let ignored = false;
  for (const pattern of patterns) {
    const parsedPattern = parseIgnorePattern(pattern);
    if (parsedPattern && matchesParsedPattern(pathSegments, parsedPattern)) {
      ignored = !parsedPattern.negated;
    }
  }
  return ignored;
}
