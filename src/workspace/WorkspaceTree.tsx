import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  canDeleteWorkspaceNode,
  canMoveWorkspaceNode,
  canRenameWorkspaceNode,
  getWorkspaceNodeBadge,
  type WorkspaceFileBadge,
  type WorkspaceTreeNode
} from "./workspaceTree";

export const WORKSPACE_ROOT_PATH = "__workspace_root__";
const TOUCH_CONTEXT_MENU_DELAY_MS = 500;
const TOUCH_CONTEXT_MENU_MOVE_TOLERANCE_PX = 10;
const WORKSPACE_TREE_COLLAPSED_CARET = "";
const WORKSPACE_TREE_EXPANDED_CARET = "";

function selectWorkspaceFileNameStem(input: HTMLInputElement): void {
  const extensionIndex = input.value.lastIndexOf(".");
  input.setSelectionRange(0, extensionIndex > 0 ? extensionIndex : input.value.length);
}

export type WorkspaceGitBadgeKind = "modified" | "added" | "deleted" | "conflict";

function getWorkspaceIconGlyph(badge: WorkspaceFileBadge, options: { open?: boolean } = {}): string {
  switch (badge) {
    case "dir":
      return options.open ? "" : "";
    case "empty":
      return "";
    case "typ":
      return "";
    case "tex":
      return "";
    case "md":
      return "";
    case "img":
      return "";
    case "pdf":
      return "";
    case "json":
      return "";
    case "yaml":
      return "";
    case "csv":
      return "";
    case "config":
      return "";
    case "git":
      return "";
    case "info":
      return "󰂺";
    case "bib":
      return "󱉟";
    case "code":
      return "";
    case "txt":
      return "󰈙";
    case "archive":
      return "";
    case "bin":
      return "";
    default:
      return "";
  }
}

function getWorkspaceIconTone(badge: WorkspaceFileBadge): string {
  switch (badge) {
    case "dir":
    case "empty":
      return "folder";
    case "typ":
      return "typ";
    case "tex":
    case "bib":
      return "tex";
    case "md":
    case "info":
      return "md";
    case "img":
      return "img";
    case "pdf":
      return "pdf";
    case "json":
    case "yaml":
    case "csv":
    case "config":
      return "data";
    case "git":
      return "git";
    case "archive":
      return "archive";
    case "bin":
      return "bin";
    default:
      return "default";
  }
}

function getWorkspaceIconClassName(badge: WorkspaceFileBadge, colorful: boolean): string {
  return colorful ? `file-tree__icon file-tree__icon--${getWorkspaceIconTone(badge)}` : "file-tree__icon";
}

function getWorkspaceFolderCaret(isEmpty: boolean, isCollapsed: boolean): string {
  if (isEmpty) {
    return "";
  }

  return isCollapsed ? WORKSPACE_TREE_COLLAPSED_CARET : WORKSPACE_TREE_EXPANDED_CARET;
}

function getWorkspaceGitBadgeLabel(
  status: WorkspaceGitBadgeKind,
  nodeKind: WorkspaceTreeNode["kind"]
): string {
  const folderPrefix = "Folder contains";

  switch (status) {
    case "added":
      return nodeKind === "folder" ? `${folderPrefix} added files` : "Git status: added";
    case "deleted":
      return nodeKind === "folder" ? `${folderPrefix} deleted files` : "Git status: deleted";
    case "conflict":
      return nodeKind === "folder" ? `${folderPrefix} merge conflicts` : "Git status: conflict";
    case "modified":
    default:
      return nodeKind === "folder" ? `${folderPrefix} modified files` : "Git status: modified";
  }
}

function getWorkspaceGitBadgeText(status: WorkspaceGitBadgeKind): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "conflict":
      return "!";
    case "modified":
    default:
      return "M";
  }
}

function getWorkspaceNodeGitStatus(
  node: WorkspaceTreeNode,
  gitStatusByPath: Record<string, WorkspaceGitBadgeKind>
): WorkspaceGitBadgeKind | null {
  const directStatus = gitStatusByPath[node.path];

  if (directStatus) {
    return directStatus;
  }

  if (node.kind !== "folder") {
    return null;
  }

  const childStatuses = node.children
    .map((child) => getWorkspaceNodeGitStatus(child, gitStatusByPath))
    .filter((status): status is WorkspaceGitBadgeKind => Boolean(status));

  if (childStatuses.includes("conflict")) {
    return "conflict";
  }
  if (childStatuses.includes("deleted")) {
    return "deleted";
  }
  if (childStatuses.includes("added")) {
    return "added";
  }
  if (childStatuses.includes("modified")) {
    return "modified";
  }

  return null;
}

interface WorkspaceTreeProps {
  collapsedPaths: Record<string, boolean>;
  colorfulIcons?: boolean;
  gitStatusByPath?: Record<string, WorkspaceGitBadgeKind>;
  nodes: WorkspaceTreeNode[];
  rootLabel: string;
  selectedPaths: string[];
  selectedPath: string | null;
  renamingPath: string | null;
  renameDraft: string;
  onActivateNode: (
    node: WorkspaceTreeNode,
    modifiers: { additive: boolean; range: boolean }
  ) => void;
  onOpenFile: (path: string) => void;
  onPinFile: (path: string) => void;
  onDropAtRoot: () => void;
  onToggleFolder: (path: string) => void;
  onDragEnd: () => void;
  onDragStart: (node: WorkspaceTreeNode) => void;
  onFolderDragHover: (path: string) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameCommit: () => void;
  onRequestRootContextMenu: (x: number, y: number) => void;
  onRequestRename: (node: WorkspaceTreeNode) => void;
  onRequestContextMenu: (node: WorkspaceTreeNode, x: number, y: number) => void;
  onDropIntoFolder: (targetNode: WorkspaceTreeNode) => void;
  draggedPaths: string[];
  dropTargetPath: string | null;
}

export function WorkspaceTree({
  collapsedPaths,
  colorfulIcons = false,
  gitStatusByPath = {},
  nodes,
  rootLabel,
  selectedPaths,
  selectedPath,
  renamingPath,
  renameDraft,
  onActivateNode,
  onOpenFile,
  onPinFile,
  onDropAtRoot,
  onToggleFolder,
  onDragEnd,
  onDragStart,
  onFolderDragHover,
  onRenameDraftChange,
  onRenameCancel,
  onRenameCommit,
  onRequestRootContextMenu,
  onRequestRename,
  onRequestContextMenu,
  onDropIntoFolder,
  draggedPaths,
  dropTargetPath
}: WorkspaceTreeProps) {
  const isRootDropTarget =
    draggedPaths.length > 0 && dropTargetPath === WORKSPACE_ROOT_PATH;

  return (
    <div
      className={`file-tree ${draggedPaths.length > 0 ? "file-tree--drag-active" : ""} ${
        isRootDropTarget ? "file-tree--drop-target" : ""
      }`}
      role="tree"
      aria-label={rootLabel}
      onDragOver={(event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        onFolderDragHover(WORKSPACE_ROOT_PATH);
      }}
      onDrop={(event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        onDropAtRoot();
      }}
      onContextMenu={(event) => {
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        onRequestRootContextMenu(event.clientX, event.clientY);
      }}
    >
      {nodes.length > 0 ? (
        nodes.map((node) => (
          <WorkspaceTreeBranch
            key={node.path}
            collapsedPaths={collapsedPaths}
            colorfulIcons={colorfulIcons}
            depth={0}
            gitStatusByPath={gitStatusByPath}
            node={node}
            renamingPath={renamingPath}
            renameDraft={renameDraft}
            selectedPaths={selectedPaths}
            selectedPath={selectedPath}
            onActivateNode={onActivateNode}
            onOpenFile={onOpenFile}
            onPinFile={onPinFile}
            onToggleFolder={onToggleFolder}
            onDragEnd={onDragEnd}
            onDragStart={onDragStart}
            onFolderDragHover={onFolderDragHover}
            onRenameDraftChange={onRenameDraftChange}
            onRenameCancel={onRenameCancel}
            onRenameCommit={onRenameCommit}
            onRequestRename={onRequestRename}
            onRequestContextMenu={onRequestContextMenu}
            onDropIntoFolder={onDropIntoFolder}
            draggedPaths={draggedPaths}
            dropTargetPath={dropTargetPath}
          />
        ))
      ) : (
        <div className="file-tree__empty">No files yet.</div>
      )}
    </div>
  );
}

interface WorkspaceTreeBranchProps {
  collapsedPaths: Record<string, boolean>;
  colorfulIcons: boolean;
  depth: number;
  gitStatusByPath: Record<string, WorkspaceGitBadgeKind>;
  node: WorkspaceTreeNode;
  renamingPath: string | null;
  renameDraft: string;
  selectedPaths: string[];
  selectedPath: string | null;
  onActivateNode: (
    node: WorkspaceTreeNode,
    modifiers: { additive: boolean; range: boolean }
  ) => void;
  onOpenFile: (path: string) => void;
  onPinFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onDragEnd: () => void;
  onDragStart: (node: WorkspaceTreeNode) => void;
  onFolderDragHover: (path: string) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameCommit: () => void;
  onRequestRename: (node: WorkspaceTreeNode) => void;
  onRequestContextMenu: (node: WorkspaceTreeNode, x: number, y: number) => void;
  onDropIntoFolder: (targetNode: WorkspaceTreeNode) => void;
  draggedPaths: string[];
  dropTargetPath: string | null;
}

function WorkspaceTreeBranch({
  collapsedPaths,
  colorfulIcons,
  depth,
  gitStatusByPath,
  node,
  renamingPath,
  renameDraft,
  selectedPaths,
  selectedPath,
  onActivateNode,
  onOpenFile,
  onPinFile,
  onToggleFolder,
  onDragEnd,
  onDragStart,
  onFolderDragHover,
  onRenameDraftChange,
  onRenameCancel,
  onRenameCommit,
  onRequestRename,
  onRequestContextMenu,
  onDropIntoFolder,
  draggedPaths,
  dropTargetPath
}: WorkspaceTreeBranchProps) {
  const isRenaming = renamingPath === node.path;
  const isSelected = selectedPaths.includes(node.path);
  const isDragging = draggedPaths.includes(node.path);
  const isDropTarget = draggedPaths.length > 0 && dropTargetPath === node.path;
  const gitStatus = getWorkspaceNodeGitStatus(node, gitStatusByPath);
  const indent = " ".repeat(depth * 2);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const beginTouchContextMenu = (
    event: ReactPointerEvent<HTMLElement>,
    canOpenContextMenu: boolean
  ) => {
    if (event.pointerType !== "touch" || !canOpenContextMenu || isRenaming) {
      return;
    }

    clearLongPressTimer();
    longPressPointRef.current = {
      x: event.clientX,
      y: event.clientY
    };
    longPressTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = true;
      onRequestContextMenu(node, event.clientX, event.clientY);
      longPressTimerRef.current = null;
    }, TOUCH_CONTEXT_MENU_DELAY_MS);
  };

  const handleTouchPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" || !longPressPointRef.current) {
      return;
    }

    const deltaX = event.clientX - longPressPointRef.current.x;
    const deltaY = event.clientY - longPressPointRef.current.y;

    if (Math.hypot(deltaX, deltaY) > TOUCH_CONTEXT_MENU_MOVE_TOLERANCE_PX) {
      clearLongPressTimer();
      longPressPointRef.current = null;
    }
  };

  const endTouchGesture = () => {
    clearLongPressTimer();
    longPressPointRef.current = null;
  };

  const handleNodeClick = (event: ReactMouseEvent): boolean => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      return false;
    }

    onActivateNode(node, {
      additive: event.metaKey || event.ctrlKey,
      range: event.shiftKey
    });

    return true;
  };

  if (node.kind === "folder") {
    const isCollapsed = collapsedPaths[node.path] ?? false;
    const isEmpty = node.children.length === 0;
    const canRename = canRenameWorkspaceNode(node);
    const canMove = canMoveWorkspaceNode(node);
    const canOpenContextMenu = canRename || canDeleteWorkspaceNode(node) || canMove;
    const folderBadge: WorkspaceFileBadge = isEmpty ? "empty" : "dir";
    const folderCaret = getWorkspaceFolderCaret(isEmpty, isCollapsed);
    const folderIcon = getWorkspaceIconGlyph(folderBadge, { open: !isCollapsed && !isEmpty });
    const folderIconClassName = getWorkspaceIconClassName(folderBadge, colorfulIcons);
    const handleFolderClick = (event: ReactMouseEvent) => {
      const didActivate = handleNodeClick(event);

      if (didActivate && !isEmpty && event.detail === 1) {
        onToggleFolder(node.path);
      }
    };

    return (
      <div className="file-tree__branch">
        <div
          className={`file-tree__branch-header ${isEmpty ? "file-tree__branch-header--static" : ""} ${
            isSelected ? "file-tree__branch-header--selected" : ""
          } ${
            isDropTarget ? "file-tree__branch-header--drop-target" : ""
          } ${
            isDragging ? "file-tree__branch-header--dragging" : ""
          }`}
          data-drop-target={isDropTarget ? "true" : undefined}
          data-workspace-path={node.path}
          draggable={canMove}
          title={node.path}
          onDragEnd={onDragEnd}
          onDragEnter={() => onFolderDragHover(node.path)}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDragStart={() => onDragStart(node)}
          onDrop={(event) => {
            event.preventDefault();
            onDropIntoFolder(node);
          }}
          onPointerCancel={endTouchGesture}
          onPointerDown={(event) => beginTouchContextMenu(event, canOpenContextMenu)}
          onPointerMove={handleTouchPointerMove}
          onPointerUp={endTouchGesture}
          onContextMenu={(event) => {
            event.preventDefault();
            if (canOpenContextMenu) {
              onRequestContextMenu(node, event.clientX, event.clientY);
            }
          }}
          onClick={handleFolderClick}
          onDoubleClick={() => {
            if (canRename) {
              onRequestRename(node);
            }
          }}
          role="treeitem"
          aria-expanded={isEmpty ? undefined : !isCollapsed}
        >
          {isRenaming ? (
            <>
              <span aria-hidden="true">{indent}</span>
              <span aria-hidden="true" className="file-tree__caret">{folderCaret}</span>
              <span aria-hidden="true" className={folderIconClassName}>{folderIcon}</span>
              <input
                autoFocus
                className="file-tree__rename-input"
                onBlur={onRenameCommit}
                onChange={(event) => onRenameDraftChange(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onRenameCommit();
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    onRenameCancel();
                  }
                }}
                style={{ width: `calc(100% - ${depth * 2 + 4}ch)` }}
                type="text"
                value={renameDraft}
              />
            </>
          ) : (
            <span className="file-tree__text" title={node.name}>
              <span aria-hidden="true">{indent}</span>
              <span aria-hidden="true" className="file-tree__caret">{folderCaret}</span>
              <span aria-hidden="true" className={folderIconClassName}>{folderIcon}</span>
              <span>{node.name}</span>
            </span>
          )}
          {gitStatus ? (
            <span
              aria-label={getWorkspaceGitBadgeLabel(gitStatus, node.kind)}
              className={`file-tree__git-status file-tree__git-status--${gitStatus}`}
              title={getWorkspaceGitBadgeLabel(gitStatus, node.kind)}
            >
              {getWorkspaceGitBadgeText(gitStatus)}
            </span>
          ) : null}
        </div>
        {!isEmpty && !isCollapsed ? (
          <div className="file-tree__items" role="group">
            {node.children.map((child) => (
              <WorkspaceTreeBranch
                key={child.path}
                collapsedPaths={collapsedPaths}
                colorfulIcons={colorfulIcons}
                depth={depth + 1}
                gitStatusByPath={gitStatusByPath}
                node={child}
                renamingPath={renamingPath}
                renameDraft={renameDraft}
                selectedPaths={selectedPaths}
                selectedPath={selectedPath}
                onActivateNode={onActivateNode}
                onOpenFile={onOpenFile}
                onPinFile={onPinFile}
                onToggleFolder={onToggleFolder}
                onDragEnd={onDragEnd}
                onDragStart={onDragStart}
                onFolderDragHover={onFolderDragHover}
                onRenameDraftChange={onRenameDraftChange}
                onRenameCancel={onRenameCancel}
                onRenameCommit={onRenameCommit}
                onRequestRename={onRequestRename}
                onRequestContextMenu={onRequestContextMenu}
                onDropIntoFolder={onDropIntoFolder}
                draggedPaths={draggedPaths}
                dropTargetPath={dropTargetPath}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const badge = getWorkspaceNodeBadge(node);
  const fileIcon = getWorkspaceIconGlyph(badge);
  const fileIconClassName = getWorkspaceIconClassName(badge, colorfulIcons);
  const canMove = canMoveWorkspaceNode(node);

  if (isRenaming) {
    return (
      <div
        className={`file-row file-tree__entry-row ${selectedPath === node.path && isSelected ? "file-row--active" : ""} ${
          isSelected ? "file-row--selected" : ""
        } ${
          isDragging ? "file-row--dragging" : ""
        }`}
        data-workspace-path={node.path}
        onPointerCancel={endTouchGesture}
        onPointerDown={(event) => beginTouchContextMenu(event, true)}
        onPointerMove={handleTouchPointerMove}
        onPointerUp={endTouchGesture}
        onContextMenu={(event) => {
          event.preventDefault();
          onRequestContextMenu(node, event.clientX, event.clientY);
        }}
        role="treeitem"
      >
        <span aria-hidden="true">{indent}</span>
        <span aria-hidden="true" className="file-tree__caret" />
        <span aria-hidden="true" className={fileIconClassName}>{fileIcon}</span>
        <input
          autoFocus
          aria-label={`Rename ${node.name}`}
          className="file-tree__rename-input"
          onBlur={onRenameCommit}
          onChange={(event) => onRenameDraftChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onFocus={(event) => selectWorkspaceFileNameStem(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRenameCommit();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              onRenameCancel();
            }
          }}
          style={{ width: `calc(100% - ${depth * 2 + 4}ch)` }}
          type="text"
          value={renameDraft}
        />
      </div>
    );
  }

  return (
    <button
      className={`file-row file-tree__entry-row ${selectedPath === node.path && isSelected ? "file-row--active" : ""} ${
        isSelected ? "file-row--selected" : ""
      } ${
        isDragging ? "file-row--dragging" : ""
      }`}
      data-workspace-path={node.path}
      draggable={canMove}
      title={node.path}
      onDragEnd={onDragEnd}
      onDragStart={() => onDragStart(node)}
      onPointerCancel={endTouchGesture}
      onPointerDown={(event) => beginTouchContextMenu(event, true)}
      onPointerMove={handleTouchPointerMove}
      onPointerUp={endTouchGesture}
      onClick={(event) => {
        const didActivate = handleNodeClick(event);
        if (didActivate && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          onOpenFile(node.path);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onRequestContextMenu(node, event.clientX, event.clientY);
      }}
      onDoubleClick={() => onPinFile(node.path)}
      role="treeitem"
      type="button"
    >
      <span className="file-tree__text" title={node.name}>
        <span aria-hidden="true">{indent}</span>
        <span aria-hidden="true" className="file-tree__caret" />
        <span aria-hidden="true" className={fileIconClassName}>{fileIcon}</span>
        <span>{node.name}</span>
      </span>
      {gitStatus ? (
        <span
          aria-label={getWorkspaceGitBadgeLabel(gitStatus, node.kind)}
          className={`file-tree__git-status file-tree__git-status--${gitStatus}`}
          title={getWorkspaceGitBadgeLabel(gitStatus, node.kind)}
        >
          {getWorkspaceGitBadgeText(gitStatus)}
        </span>
      ) : null}
    </button>
  );
}
