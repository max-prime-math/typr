import { normalizeWorkspacePath } from "../workspace/workspaceTree";

export interface WorkspaceTabState {
  paths: string[];
  activePath: string | null;
}

export function areWorkspacePathListsEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

export function normalizeUniqueWorkspacePaths(paths: readonly string[]): string[] {
  const seenPaths = new Set<string>();
  const normalizedPaths: string[] = [];

  for (const path of paths) {
    const normalizedPath = normalizeWorkspacePath(path);

    if (!normalizedPath || seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    normalizedPaths.push(normalizedPath);
  }

  return normalizedPaths;
}

export function remapWorkspacePath(
  path: string,
  previousPath: string,
  nextPath: string
): string {
  const normalizedPath = normalizeWorkspacePath(path);
  const normalizedPreviousPath = normalizeWorkspacePath(previousPath);
  const normalizedNextPath = normalizeWorkspacePath(nextPath);

  if (!normalizedPreviousPath || !normalizedNextPath) {
    return normalizedPath;
  }

  if (normalizedPath === normalizedPreviousPath) {
    return normalizedNextPath;
  }

  return normalizedPath.startsWith(`${normalizedPreviousPath}/`)
    ? `${normalizedNextPath}${normalizedPath.slice(normalizedPreviousPath.length)}`
    : normalizedPath;
}

export function remapWorkspacePaths(
  paths: readonly string[],
  previousPath: string,
  nextPath: string
): string[] {
  return normalizeUniqueWorkspacePaths(
    paths.map((path) => remapWorkspacePath(path, previousPath, nextPath))
  );
}

export function appendUniqueWorkspacePath(paths: string[], path: string): string[] {
  const normalizedPaths = normalizeUniqueWorkspacePaths(paths);
  const normalizedPath = normalizeWorkspacePath(path);

  if (!normalizedPath || normalizedPaths.includes(normalizedPath)) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  return [...normalizedPaths, normalizedPath];
}

export function insertWorkspacePathAfterActive(
  paths: string[],
  path: string,
  activePath: string | null
): string[] {
  const normalizedPaths = normalizeUniqueWorkspacePaths(paths);
  const normalizedPath = normalizeWorkspacePath(path);

  if (!normalizedPath || normalizedPaths.includes(normalizedPath)) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  const normalizedActivePath = activePath ? normalizeWorkspacePath(activePath) : null;
  const activeIndex = normalizedActivePath ? normalizedPaths.indexOf(normalizedActivePath) : -1;

  if (activeIndex < 0) {
    return [...normalizedPaths, normalizedPath];
  }

  return [
    ...normalizedPaths.slice(0, activeIndex + 1),
    normalizedPath,
    ...normalizedPaths.slice(activeIndex + 1)
  ];
}

export function openWorkspacePreviewTab(
  paths: readonly string[],
  path: string,
  activePath: string | null,
  activate: boolean
): WorkspaceTabState {
  const nextPaths = insertWorkspacePathAfterActive([...paths], path, activePath);
  const normalizedPath = normalizeWorkspacePath(path);
  const normalizedActivePath = activePath ? normalizeWorkspacePath(activePath) : null;

  return {
    paths: nextPaths,
    activePath: activate && normalizedPath
      ? normalizedPath
      : normalizedActivePath && nextPaths.includes(normalizedActivePath)
        ? normalizedActivePath
        : nextPaths[0] ?? null
  };
}

export function closeWorkspaceTab(
  paths: string[],
  closingPath: string,
  activePath: string | null
): WorkspaceTabState {
  const normalizedPaths = normalizeUniqueWorkspacePaths(paths);
  const normalizedClosingPath = normalizeWorkspacePath(closingPath);
  const normalizedActivePath = activePath ? normalizeWorkspacePath(activePath) : null;
  const closingIndex = normalizedPaths.indexOf(normalizedClosingPath);
  const nextPaths = normalizedPaths.filter((path) => path !== normalizedClosingPath);

  return {
    paths: nextPaths,
    activePath:
      normalizedActivePath === normalizedClosingPath
        ? nextPaths[Math.min(Math.max(closingIndex, 0), nextPaths.length - 1)] ?? null
        : normalizedActivePath
  };
}

export function reorderWorkspacePaths(
  paths: string[],
  draggedPath: string,
  targetPath: string,
  insertAfterTarget: boolean
): string[] {
  const normalizedPaths = normalizeUniqueWorkspacePaths(paths);
  const normalizedDraggedPath = normalizeWorkspacePath(draggedPath);
  const normalizedTargetPath = normalizeWorkspacePath(targetPath);
  const draggedIndex = normalizedPaths.indexOf(normalizedDraggedPath);
  const targetIndex = normalizedPaths.indexOf(normalizedTargetPath);

  if (
    !normalizedDraggedPath ||
    !normalizedTargetPath ||
    draggedIndex === -1 ||
    targetIndex === -1 ||
    draggedIndex === targetIndex
  ) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  const nextPaths = normalizedPaths.filter((path) => path !== normalizedDraggedPath);
  const targetInsertIndex = nextPaths.indexOf(normalizedTargetPath);

  if (targetInsertIndex === -1) {
    return areWorkspacePathListsEqual(paths, normalizedPaths) ? paths : normalizedPaths;
  }

  nextPaths.splice(targetInsertIndex + (insertAfterTarget ? 1 : 0), 0, normalizedDraggedPath);
  return nextPaths;
}

export function reconcileWorkspaceTabs({
  activePath,
  availablePaths,
  includeStoredPaths,
  paths,
  storedPaths
}: {
  activePath: string | null;
  availablePaths: ReadonlySet<string>;
  includeStoredPaths: boolean;
  paths: readonly string[];
  storedPaths: readonly string[];
}): WorkspaceTabState {
  const livePaths = normalizeUniqueWorkspacePaths(paths).filter((path) => availablePaths.has(path));
  const availableStoredPaths = normalizeUniqueWorkspacePaths(storedPaths).filter((path) =>
    availablePaths.has(path)
  );
  const nextPaths = includeStoredPaths
    ? normalizeUniqueWorkspacePaths([...livePaths, ...availableStoredPaths])
    : livePaths;
  const normalizedActivePath = activePath ? normalizeWorkspacePath(activePath) : null;

  return {
    paths: nextPaths,
    activePath:
      normalizedActivePath && nextPaths.includes(normalizedActivePath)
        ? normalizedActivePath
        : nextPaths[0] ?? null
  };
}
