import { useEffect, useState } from "react";
import type { WorkspaceTreeNode } from "../workspace/workspaceTree";
import { reconcileWorkspaceSelection } from "./workspaceSelection";

export function useWorkspaceSelection({
  activeDocumentPath,
  isTrashViewOpen,
  tree
}: {
  activeDocumentPath: string;
  isTrashViewOpen: boolean;
  tree: WorkspaceTreeNode[];
}) {
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null);
  const [selectedWorkspacePaths, setSelectedWorkspacePaths] = useState<string[]>([]);
  const [workspaceSelectionAnchorPath, setWorkspaceSelectionAnchorPath] =
    useState<string | null>(null);

  useEffect(() => {
    setSelectedWorkspacePath((currentPath) =>
      reconcileWorkspaceSelection({
        activeDocumentPath,
        anchorPath: null,
        currentPath,
        currentPaths: [],
        isTrashViewOpen,
        tree
      }).currentPath
    );
    setSelectedWorkspacePaths((currentPaths) =>
      reconcileWorkspaceSelection({
        activeDocumentPath,
        anchorPath: null,
        currentPath: null,
        currentPaths,
        isTrashViewOpen,
        tree
      }).currentPaths
    );
    setWorkspaceSelectionAnchorPath((anchorPath) =>
      reconcileWorkspaceSelection({
        activeDocumentPath,
        anchorPath,
        currentPath: null,
        currentPaths: [],
        isTrashViewOpen,
        tree
      }).anchorPath
    );
  }, [activeDocumentPath, isTrashViewOpen, tree]);

  return {
    selectedWorkspacePath,
    selectedWorkspacePaths,
    setSelectedWorkspacePath,
    setSelectedWorkspacePaths,
    workspaceSelectionAnchorPath,
    setWorkspaceSelectionAnchorPath
  };
}
