import {
  emptyTrash,
  moveDiagramToFolder,
  moveDiagramToTrash,
  moveDocumentToFolder,
  moveDocumentToTrash,
  moveFolderToFolder,
  moveFolderToTrash,
  permanentlyDeleteTrashEntry,
  type AppSnapshot,
  type DiagramAsset
} from "./appState";
import { normalizeDiagramFileName } from "../diagram/diagramFiles";
import { createPrefixedId } from "../utils/randomId";
import {
  getRelativePathBasename,
  getRelativePathParent,
  joinRelativePaths,
  stripRelativePathPrefix
} from "../utils/relativePath";
import {
  buildProjectWorkspaceEntries,
  buildWorkspaceTree,
  normalizeWorkspacePath,
  type WorkspaceTreeNode
} from "../workspace/workspaceTree";

export function getWorkspaceMovePromptLabel(node: WorkspaceTreeNode): string {
  return node.source.kind === "diagram"
    ? "Move to folder inside figures (blank for figures root)"
    : "Move to folder (blank for root)";
}

export function isFigureWorkspacePath(path: string | null): boolean {
  const normalizedPath = normalizeWorkspacePath(path ?? "");
  return normalizedPath === "figures" || normalizedPath.startsWith("figures/");
}

function stripFiguresWorkspaceRoot(path: string): string {
  return stripRelativePathPrefix(path, "figures") ?? normalizeWorkspacePath(path);
}

function cloneWorkspaceContent(content: string | Uint8Array): string | Uint8Array {
  return typeof content === "string" ? content : new Uint8Array(content);
}

function clonePlainValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneDiagramAssetForWorkspacePath(
  diagram: DiagramAsset,
  path: string,
  now: string
): DiagramAsset {
  return {
    ...diagram,
    id: createPrefixedId("diagram"),
    name: normalizeDiagramFileName(stripFiguresWorkspaceRoot(path)),
    updatedAt: now,
    frame: diagram.frame ? { ...diagram.frame } : null,
    strokes: clonePlainValue(diagram.strokes),
    shapes: clonePlainValue(diagram.shapes)
  };
}

export function collectWorkspaceNodePaths(nodes: WorkspaceTreeNode[]): string[] {
  return nodes.flatMap((node) => [node.path, ...collectWorkspaceNodePaths(node.children)]);
}

function flattenWorkspaceNodeSubtree(node: WorkspaceTreeNode): WorkspaceTreeNode[] {
  return [node, ...node.children.flatMap((child) => flattenWorkspaceNodeSubtree(child))];
}

export function removeDescendantWorkspaceNodes(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  const sortedNodes = [...nodes].sort((left, right) => left.path.length - right.path.length);
  const rootNodes: WorkspaceTreeNode[] = [];

  for (const node of sortedNodes) {
    if (rootNodes.some((rootNode) => node.path.startsWith(`${rootNode.path}/`))) {
      continue;
    }
    rootNodes.push(node);
  }

  return rootNodes;
}

function createWorkspacePathSet(snapshot: AppSnapshot): Set<string> {
  return new Set(
    collectWorkspaceNodePaths(buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot)))
  );
}

function createWorkspaceCopyPath(
  requestedPath: string,
  existingPaths: Set<string>,
  isFolder: boolean
): string {
  const normalizedPath = normalizeWorkspacePath(requestedPath);

  if (!existingPaths.has(normalizedPath)) {
    return normalizedPath;
  }

  const parentPath = getRelativePathParent(normalizedPath);
  const baseName = getRelativePathBasename(normalizedPath);
  const extensionMatch = isFolder ? null : /\.([^.]+)$/i.exec(baseName);
  const extension = extensionMatch ? `.${extensionMatch[1]}` : "";
  const stem = extension ? baseName.slice(0, -extension.length) : baseName;
  let copyIndex = 1;

  while (true) {
    const copySuffix = copyIndex === 1 ? " copy" : ` copy ${copyIndex}`;
    const candidate = joinRelativePaths(parentPath, `${stem}${copySuffix}${extension}`);
    if (!existingPaths.has(candidate)) return candidate;
    copyIndex += 1;
  }
}

export function isWorkspaceNodeCopyable(node: WorkspaceTreeNode): boolean {
  return ["document", "diagram", "folder"].includes(node.source.kind);
}

function getWorkspaceNodeCopyDomain(node: WorkspaceTreeNode): "regular" | "figure" | null {
  if (!isWorkspaceNodeCopyable(node)) return null;
  return isFigureWorkspacePath(node.path) ? "figure" : "regular";
}

export function getWorkspaceClipboardDomain(
  nodes: WorkspaceTreeNode[]
): "regular" | "figure" | null {
  let domain: "regular" | "figure" | null = null;

  for (const node of nodes) {
    const nodeDomain = getWorkspaceNodeCopyDomain(node);
    if (!nodeDomain || (domain && domain !== nodeDomain)) return null;
    domain = nodeDomain;
  }

  return domain;
}

export function normalizeWorkspacePasteDestination(
  domain: "regular" | "figure",
  destinationFolderPath: string | null
): { destinationFolderPath: string | null; error: string | null } {
  const normalizedDestination = normalizeWorkspacePath(destinationFolderPath ?? "");

  if (domain === "figure") {
    return {
      destinationFolderPath:
        normalizedDestination && isFigureWorkspacePath(normalizedDestination)
          ? normalizedDestination
          : "figures",
      error: null
    };
  }

  if (normalizedDestination && isFigureWorkspacePath(normalizedDestination)) {
    return { destinationFolderPath: null, error: "Documents cannot be pasted inside figures." };
  }

  return { destinationFolderPath: normalizedDestination || null, error: null };
}

export function copyWorkspaceNodesToSnapshot(
  snapshot: AppSnapshot,
  nodes: WorkspaceTreeNode[],
  destinationFolderPath: string | null
): { snapshot: AppSnapshot; copiedPaths: string[] } {
  const rootNodes = removeDescendantWorkspaceNodes(nodes).filter(isWorkspaceNodeCopyable);
  if (rootNodes.length === 0) return { snapshot, copiedPaths: [] };

  const now = new Date().toISOString();
  const existingPaths = createWorkspacePathSet(snapshot);
  const copiedPaths: string[] = [];
  const copiedRootPaths: string[] = [];
  let nextDocuments = [...snapshot.project.documents];
  let nextFolders = [...snapshot.project.folders];
  let nextFigures = [...snapshot.project.figures];
  let activeDocumentId = snapshot.project.activeDocumentId;

  for (const rootNode of rootNodes) {
    const domain = getWorkspaceNodeCopyDomain(rootNode);
    const requestedRootPath = joinRelativePaths(
      destinationFolderPath,
      getRelativePathBasename(rootNode.path)
    );
    const rootTargetPath = createWorkspaceCopyPath(
      requestedRootPath,
      existingPaths,
      rootNode.kind === "folder"
    );
    let didCopyRoot = false;
    existingPaths.add(rootTargetPath);

    for (const sourceNode of flattenWorkspaceNodeSubtree(rootNode)) {
      const relativePath =
        sourceNode.path === rootNode.path ? "" : sourceNode.path.slice(rootNode.path.length + 1);
      const targetPath = relativePath
        ? joinRelativePaths(rootTargetPath, relativePath)
        : rootTargetPath;

      if (sourceNode.kind === "folder") {
        if (domain === "regular" && sourceNode.source.kind === "folder") {
          nextFolders.push({ id: createPrefixedId("folder"), name: targetPath, updatedAt: now });
          didCopyRoot ||= sourceNode.path === rootNode.path;
        }
        existingPaths.add(targetPath);
        continue;
      }

      if (sourceNode.source.kind === "document" && domain === "regular") {
        const sourceDocument = snapshot.project.documents.find(
          (document) => document.id === sourceNode.source.id
        );
        if (!sourceDocument) continue;
        const copiedDocument = {
          ...sourceDocument,
          id: createPrefixedId("doc"),
          name: targetPath,
          content: cloneWorkspaceContent(sourceDocument.content),
          updatedAt: now
        };
        nextDocuments.push(copiedDocument);
        activeDocumentId = copiedDocument.id;
        copiedPaths.push(targetPath);
        didCopyRoot ||= sourceNode.path === rootNode.path;
        existingPaths.add(targetPath);
        continue;
      }

      if (sourceNode.source.kind === "diagram" && domain === "figure") {
        const sourceDiagram = snapshot.project.figures.find(
          (figure) => figure.id === sourceNode.source.id
        );
        if (!sourceDiagram) continue;
        nextFigures.push(cloneDiagramAssetForWorkspacePath(sourceDiagram, targetPath, now));
        copiedPaths.push(targetPath);
        didCopyRoot ||= sourceNode.path === rootNode.path;
        existingPaths.add(targetPath);
      }
    }

    if (didCopyRoot) copiedRootPaths.push(rootTargetPath);
  }

  if (copiedPaths.length === 0 && copiedRootPaths.length === 0) {
    return { snapshot, copiedPaths: [] };
  }

  return {
    snapshot: {
      ...snapshot,
      project: {
        ...snapshot.project,
        documents: nextDocuments,
        folders: nextFolders,
        figures: nextFigures,
        activeDocumentId,
        updatedAt: now
      }
    },
    copiedPaths: copiedRootPaths.length > 0 ? copiedRootPaths : copiedPaths
  };
}

export function moveWorkspaceNodeInSnapshot(
  snapshot: AppSnapshot,
  node: WorkspaceTreeNode,
  destinationFolderPath: string | null
): { snapshot: AppSnapshot; movedPath: string } {
  const normalizedDestination = normalizeWorkspacePath(destinationFolderPath ?? "");
  const nextDestination = normalizedDestination || null;
  const movedBaseName = getRelativePathBasename(node.path);
  const movedPath =
    node.source.kind === "diagram"
      ? joinRelativePaths(
          "figures",
          joinRelativePaths(
            nextDestination === "figures"
              ? null
              : nextDestination?.replace(/^figures\/?/, "") ?? null,
            movedBaseName
          )
        )
      : joinRelativePaths(nextDestination, movedBaseName);

  if (node.source.kind === "document") {
    return { snapshot: moveDocumentToFolder(snapshot, node.source.id, nextDestination), movedPath };
  }
  if (node.source.kind === "folder") {
    return { snapshot: moveFolderToFolder(snapshot, node.source.id, nextDestination), movedPath };
  }
  if (node.source.kind === "diagram") {
    const figureDestination =
      nextDestination === null || nextDestination === "figures"
        ? null
        : nextDestination.startsWith("figures/")
          ? nextDestination.slice("figures/".length)
          : null;
    return { snapshot: moveDiagramToFolder(snapshot, node.source.id, figureDestination), movedPath };
  }
  return { snapshot, movedPath: node.path };
}

export function trashWorkspaceNode(snapshot: AppSnapshot, node: WorkspaceTreeNode): AppSnapshot {
  if (node.source.kind === "document") return moveDocumentToTrash(snapshot, node.source.id);
  if (node.source.kind === "folder") return moveFolderToTrash(snapshot, node.source.id);
  if (node.source.kind === "diagram") return moveDiagramToTrash(snapshot, node.source.id);
  if (node.source.kind === "trash-item") {
    return permanentlyDeleteTrashEntry(snapshot, node.source.id);
  }
  return snapshot;
}

export function emptyWorkspaceTrash(snapshot: AppSnapshot): AppSnapshot {
  return emptyTrash(snapshot);
}

export function remapWorkspaceSelectionAfterMove(
  paths: readonly string[],
  sourcePath: string,
  movedPath: string,
  isFolder: boolean
): string[] {
  return paths.map((path) =>
    path === sourcePath
      ? movedPath
      : isFolder && path.startsWith(`${sourcePath}/`)
        ? `${movedPath}${path.slice(sourcePath.length)}`
        : path
  );
}

export function removeWorkspaceSelectionSubtree(
  paths: readonly string[],
  removedPath: string
): string[] {
  return paths.filter((path) => path !== removedPath && !path.startsWith(`${removedPath}/`));
}
