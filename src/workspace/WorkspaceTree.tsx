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

export type WorkspaceGitBadgeKind = "modified" | "added" | "deleted" | "conflict";

function getWorkspaceIconTitle(badge: WorkspaceFileBadge): string {
  switch (badge) {
    case "typ":
      return "Typst file";
    case "tex":
      return "TeX/LaTeX file";
    case "md":
      return "Markdown file";
    case "img":
      return "Image file";
    case "pdf":
      return "PDF file";
    case "json":
      return "JSON file";
    case "yaml":
      return "YAML file";
    case "csv":
      return "CSV file";
    case "config":
      return "Configuration file";
    case "bib":
      return "Bibliography file";
    case "code":
      return "Code file";
    case "txt":
      return "Text file";
    case "bin":
      return "Binary file";
    case "dir":
      return "Folder";
    case "empty":
      return "Empty folder";
  }
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
  gitStatusByPath?: Record<string, WorkspaceGitBadgeKind>;
  nodes: WorkspaceTreeNode[];
  rootLabel: string;
  rootIsRenameable: boolean;
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
  dropTargetPath: string | null;
}

export function WorkspaceTree({
  collapsedPaths,
  gitStatusByPath = {},
  nodes,
  rootLabel,
  rootIsRenameable,
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
  dropTargetPath
}: WorkspaceTreeProps) {
  return (
    <div
      className={`file-tree ${dropTargetPath === WORKSPACE_ROOT_PATH ? "file-tree--drop-target" : ""}`}
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
        if (!rootIsRenameable || event.defaultPrevented) {
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
  dropTargetPath: string | null;
}

function WorkspaceTreeBranch({
  collapsedPaths,
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
  dropTargetPath
}: WorkspaceTreeBranchProps) {
  const isRenaming = renamingPath === node.path;
  const isSelected = selectedPaths.includes(node.path);
  const gitStatus = getWorkspaceNodeGitStatus(node, gitStatusByPath);
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

    if ((event.target as HTMLElement).closest(".file-tree__toggle-button")) {
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
            dropTargetPath === node.path ? "file-tree__branch-header--drop-target" : ""
          }`}
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
          {isEmpty ? (
            <span
              aria-hidden="true"
              className="file-tree__chevron-text file-tree__chevron-text--empty"
              title="Empty folder"
            >
              •
            </span>
          ) : (
            <button
              className="file-tree__toggle-button"
              onClick={() => onToggleFolder(node.path)}
              type="button"
              aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.name}`}
              title={`${isCollapsed ? "Expand" : "Collapse"} ${node.name}`}
            >
              <span
                aria-hidden="true"
                className={`tree-disclosure-icon ${isCollapsed ? "tree-disclosure-icon--collapsed" : ""}`}
              />
            </button>
          )}
          <span
            className={`file-tree__folder-icon ${
              isEmpty
                ? "file-tree__folder-icon--empty"
                : isCollapsed
                  ? "file-tree__folder-icon--closed"
                  : "file-tree__folder-icon--open"
            }`}
            aria-hidden="true"
            title={getWorkspaceIconTitle(isEmpty ? "empty" : "dir")}
          />
          {isRenaming ? (
            <input
              autoFocus
              className="file-tree__rename-input"
              onBlur={onRenameCommit}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onClick={(event) => event.stopPropagation()}
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
              type="text"
              value={renameDraft}
            />
          ) : (
            <span className="file-tree__branch-label" title={node.name}>{node.name}</span>
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
                dropTargetPath={dropTargetPath}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const badge = getWorkspaceNodeBadge(node);
  const canMove = canMoveWorkspaceNode(node);

  if (isRenaming) {
    return (
      <div
        className={`file-row file-tree__entry-row ${selectedPath === node.path ? "file-row--active" : ""} ${
          isSelected ? "file-row--selected" : ""
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
        <span
          aria-hidden="true"
          className={`file-tree__file-icon file-tree__file-icon--${badge}`}
          title={getWorkspaceIconTitle(badge)}
        />
        <input
          autoFocus
          className="file-tree__rename-input"
          onBlur={onRenameCommit}
          onChange={(event) => onRenameDraftChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
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
          type="text"
          value={renameDraft}
        />
      </div>
    );
  }

  return (
    <button
      className={`file-row file-tree__entry-row ${selectedPath === node.path ? "file-row--active" : ""} ${
        isSelected ? "file-row--selected" : ""
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
      <span
        aria-hidden="true"
        className={`file-tree__file-icon file-tree__file-icon--${badge}`}
        title={getWorkspaceIconTitle(badge)}
      />
      <span className="file-row__name" title={node.name}>{node.name}</span>
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
