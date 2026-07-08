function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}
export function normalizeRelativePath(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function stripPathPrefix(path: string, prefix: string): string | null {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedPrefix = normalizeRelativePath(prefix);

  if (!normalizedPrefix) {
    return normalizedPath;
  }

  if (normalizedPath === normalizedPrefix) {
    return "";
  }

  if (normalizedPath.startsWith(`${normalizedPrefix}/`)) {
    return normalizedPath.slice(normalizedPrefix.length + 1);
  }

  return null;
}

export function joinRelativePaths(...paths: string[]): string {
  return normalizeRelativePath(paths.filter(Boolean).join("/"));
}

export function matchesIgnorePattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedPattern = pattern.trim();

  if (!normalizedPath || !normalizedPattern) {
    return false;
  }

  if (normalizedPattern.endsWith("/")) {
    const directoryPath = normalizeRelativePath(normalizedPattern.slice(0, -1));
    return matchesDirectoryPattern(normalizedPath, directoryPath);
  }

  const pathCandidates = normalizedPattern.includes("/")
    ? [normalizedPath]
    : getPathSuffixCandidates(normalizedPath);

  return pathCandidates.some((candidate) => matchesGlob(candidate, normalizedPattern));
}

function matchesDirectoryPattern(path: string, directoryPath: string): boolean {
  if (!directoryPath) {
    return false;
  }

  const candidates = directoryPath.includes("/") ? [path] : getPathSuffixCandidates(path);

  return candidates.some(
    (candidate) => candidate === directoryPath || candidate.startsWith(`${directoryPath}/`)
  );
}

function matchesGlob(path: string, pattern: string): boolean {
  const regex = new RegExp(
    `^${escapeRegex(pattern)
      .replace(/\\\*\\\*/g, ".*")
      .replace(/\\\*/g, "[^/]*")}$`
  );

  return regex.test(path);
}

function getPathSuffixCandidates(path: string): string[] {
  const segments = normalizeRelativePath(path).split("/").filter(Boolean);
  return segments.map((_, index) => segments.slice(index).join("/"));
}

export function shouldIgnorePath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesIgnorePattern(path, pattern));
}
