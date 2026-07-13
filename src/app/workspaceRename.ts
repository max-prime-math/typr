import {
  renameDiagramById,
  renameDocumentById,
  renameFolderById,
  type AppSnapshot
} from "./appState";
import type { WorkspaceTreeNode } from "../workspace/workspaceTree";

export function getWorkspaceRenameDraft(node: WorkspaceTreeNode): string {
  return node.name;
}

export function renameWorkspaceNode(
  snapshot: AppSnapshot,
  node: WorkspaceTreeNode,
  name: string
): AppSnapshot {
  const nextName = name.trim();

  if (!nextName) {
    return snapshot;
  }

  if (node.source.kind === "document") {
    return renameDocumentById(snapshot, node.source.id, nextName);
  }

  if (node.source.kind === "folder") {
    return renameFolderById(snapshot, node.source.id, nextName);
  }

  if (node.source.kind === "diagram") {
    return renameDiagramById(snapshot, node.source.id, nextName);
  }

  return snapshot;
}
