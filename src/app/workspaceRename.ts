import {
  renameDiagramById,
  renameDocumentById,
  renameFolderById,
  type AppSnapshot
} from "./appState";
import { getDiagramFilePath } from "../diagram/diagramFiles";
import type { WorkspaceTreeNode } from "../workspace/workspaceTree";

export interface WorkspaceRenameTransition {
  snapshot: AppSnapshot;
  previousPath: string;
  nextPath: string;
}

export function getWorkspaceRenameDraft(node: WorkspaceTreeNode): string {
  return node.name;
}

export function renameWorkspaceNode(
  snapshot: AppSnapshot,
  node: WorkspaceTreeNode,
  name: string
): AppSnapshot {
  return renameWorkspaceNodeWithPath(snapshot, node, name).snapshot;
}

export function renameWorkspaceNodeWithPath(
  snapshot: AppSnapshot,
  node: WorkspaceTreeNode,
  name: string
): WorkspaceRenameTransition {
  const nextName = name.trim();

  if (!nextName) {
    return {
      snapshot,
      previousPath: node.path,
      nextPath: node.path
    };
  }

  if (node.source.kind === "document") {
    const nextSnapshot = renameDocumentById(snapshot, node.source.id, nextName);
    const nextDocument = nextSnapshot.project.documents.find(
      (document) => document.id === node.source.id
    );

    return {
      snapshot: nextSnapshot,
      previousPath: node.path,
      nextPath: nextDocument?.name ?? node.path
    };
  }

  if (node.source.kind === "folder") {
    const nextSnapshot = renameFolderById(snapshot, node.source.id, nextName);
    const nextFolder = nextSnapshot.project.folders.find(
      (folder) => folder.id === node.source.id
    );

    return {
      snapshot: nextSnapshot,
      previousPath: node.path,
      nextPath: nextFolder?.name ?? node.path
    };
  }

  if (node.source.kind === "diagram") {
    const nextSnapshot = renameDiagramById(snapshot, node.source.id, nextName);
    const nextDiagram = (nextSnapshot.project.figures ?? []).find(
      (diagram) => diagram.id === node.source.id
    );

    return {
      snapshot: nextSnapshot,
      previousPath: node.path,
      nextPath: nextDiagram ? getDiagramFilePath(nextDiagram.name) : node.path
    };
  }

  return {
    snapshot,
    previousPath: node.path,
    nextPath: node.path
  };
}
