export type RelativePathPart = string | null | undefined;

export function normalizeRelativePath(path: string): string {
  const normalizedSegments: string[] = [];

  for (const rawSegment of path.replace(/\\/g, "/").trim().split("/")) {
    const segment = rawSegment.trim();

    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      const previousSegment = normalizedSegments.at(-1);
      if (previousSegment && previousSegment !== "..") {
        normalizedSegments.pop();
      } else {
        normalizedSegments.push(segment);
      }
      continue;
    }

    normalizedSegments.push(segment);
  }

  return normalizedSegments.join("/");
}

export function getRelativePathBasename(path: string): string {
  const normalizedPath = normalizeRelativePath(path);
  return normalizedPath.split("/").at(-1) ?? "";
}

export function getRelativePathParent(path: string): string | null {
  const segments = normalizeRelativePath(path).split("/").filter(Boolean);
  segments.pop();
  return segments.length > 0 ? segments.join("/") : null;
}

export function joinRelativePaths(...parts: RelativePathPart[]): string {
  return normalizeRelativePath(parts.filter((part): part is string => Boolean(part)).join("/"));
}

export function stripRelativePathPrefix(path: string, prefix: string): string | null {
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

export function moveRelativePath(path: string, fromPath: string, toPath: string): string {
  const normalizedPath = normalizeRelativePath(path);
  const relativePath = stripRelativePathPrefix(normalizedPath, fromPath);

  if (relativePath === null) {
    return normalizedPath;
  }

  return joinRelativePaths(toPath, relativePath);
}
