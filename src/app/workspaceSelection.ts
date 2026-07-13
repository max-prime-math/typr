import {
  findWorkspaceNodeByPath,
  normalizeWorkspacePath,
  type WorkspaceTreeNode
} from "../workspace/workspaceTree";

export interface WorkspaceSelectionState {
  currentPath: string | null;
  currentPaths: string[];
  anchorPath: string | null;
}

export function reconcileWorkspaceSelection({
  activeDocumentPath,
  anchorPath,
  currentPath,
  currentPaths,
  isTrashViewOpen,
  tree
}: WorkspaceSelectionState & {
  activeDocumentPath: string;
  isTrashViewOpen: boolean;
  tree: WorkspaceTreeNode[];
}): WorkspaceSelectionState {
  const fallbackPath = isTrashViewOpen ? null : normalizeWorkspacePath(activeDocumentPath);
  const isAvailable = (path: string | null) => Boolean(path && findWorkspaceNodeByPath(tree, path));
  const nextPaths = currentPaths.filter((path) => isAvailable(path));

  return {
    currentPath: isAvailable(currentPath) ? currentPath : fallbackPath,
    currentPaths: nextPaths.length > 0 ? nextPaths : fallbackPath ? [fallbackPath] : [],
    anchorPath: isAvailable(anchorPath) ? anchorPath : fallbackPath
  };
}

export function selectWorkspaceRange(
  selectablePaths: readonly string[],
  anchorPath: string,
  targetPath: string
): string[] {
  const anchorIndex = selectablePaths.indexOf(anchorPath);
  const targetIndex = selectablePaths.indexOf(targetPath);

  if (anchorIndex < 0 || targetIndex < 0) {
    return [targetPath];
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return selectablePaths.slice(start, end + 1);
}
