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

function getWorkspaceIconTitle(badge: WorkspaceFileBadge): string {
  switch (badge) {
    case "typ":
      return "Typst file";
    case "tex":
      return "TeX file";
    case "img":
      return "Image file";
    case "pdf":
      return "PDF file";
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

interface WorkspaceTreeProps {
  collapsedPaths: Record<string, boolean>;
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
  onDropAtRoot: () => void;
  onToggleFolder: (path: string) => void;
  onDragEnd: () => void;
  onDragStart: (node: WorkspaceTreeNode) => void;
  onFolderDragHover: (path: string) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameCommit: () => void;
  onRequestRootContextMenu: (x: number, y: number) => void;
  onRequestRootRename: () => void;
  onRequestRename: (node: WorkspaceTreeNode) => void;
  onRequestContextMenu: (node: WorkspaceTreeNode, x: number, y: number) => void;
  onDropIntoFolder: (targetNode: WorkspaceTreeNode) => void;
  dropTargetPath: string | null;
}

export function WorkspaceTree({
  collapsedPaths,
  nodes,
  rootLabel,
  rootIsRenameable,
  selectedPaths,
  selectedPath,
  renamingPath,
  renameDraft,
  onActivateNode,
  onOpenFile,
  onDropAtRoot,
  onToggleFolder,
  onDragEnd,
  onDragStart,
  onFolderDragHover,
  onRenameDraftChange,
  onRenameCancel,
  onRenameCommit,
  onRequestRootContextMenu,
  onRequestRootRename,
  onRequestRename,
  onRequestContextMenu,
  onDropIntoFolder,
  dropTargetPath
}: WorkspaceTreeProps) {
  const isRootCollapsed = collapsedPaths[WORKSPACE_ROOT_PATH] ?? false;
  const isRootRenaming = renamingPath === WORKSPACE_ROOT_PATH;

  return (
    <div className="file-tree" role="tree" aria-label="Files">
      <div className="file-tree__branch">
        <div
          className={`file-tree__branch-header file-tree__branch-header--button ${
            dropTargetPath === WORKSPACE_ROOT_PATH ? "file-tree__branch-header--drop-target" : ""
          }`}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDragEnter={() => onFolderDragHover(WORKSPACE_ROOT_PATH)}
          onDrop={(event) => {
            event.preventDefault();
            onDropAtRoot();
          }}
          onClick={() => onToggleFolder(WORKSPACE_ROOT_PATH)}
          onContextMenu={(event) => {
            if (!rootIsRenameable) {
              return;
            }

            event.preventDefault();
            onRequestRootContextMenu(event.clientX, event.clientY);
          }}
          onDoubleClick={() => {
            if (rootIsRenameable) {
              onRequestRootRename();
            }
          }}
          aria-expanded={!isRootCollapsed}
          aria-label={`${isRootCollapsed ? "Expand" : "Collapse"} ${rootLabel}`}
          role="treeitem"
          title={`${isRootCollapsed ? "Expand" : "Collapse"} ${rootLabel}`}
        >
          <span
            aria-hidden="true"
            className={`tree-disclosure-icon ${isRootCollapsed ? "tree-disclosure-icon--collapsed" : ""}`}
          />
          <span
            className={`file-tree__folder-icon ${
              isRootCollapsed ? "file-tree__folder-icon--closed" : "file-tree__folder-icon--open"
            }`}
            aria-hidden="true"
            title="Folder"
          />
          {isRootRenaming ? (
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
            <span className="file-tree__branch-label">{rootLabel}</span>
          )}
        </div>
        {!isRootCollapsed ? (
          <div className="file-tree__items" role="group">
            {nodes.length > 0 ? (
              nodes.map((node) => (
                <WorkspaceTreeBranch
                  key={node.path}
                  collapsedPaths={collapsedPaths}
                  node={node}
                  renamingPath={renamingPath}
                  renameDraft={renameDraft}
                  selectedPaths={selectedPaths}
                  selectedPath={selectedPath}
                  onActivateNode={onActivateNode}
                  onOpenFile={onOpenFile}
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
        ) : null}
      </div>
    </div>
  );
}

interface WorkspaceTreeBranchProps {
  collapsedPaths: Record<string, boolean>;
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
  node,
  renamingPath,
  renameDraft,
  selectedPaths,
  selectedPath,
  onActivateNode,
  onOpenFile,
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

    return (
      <div className="file-tree__branch">
        <div
          className={`file-tree__branch-header ${isEmpty ? "file-tree__branch-header--static" : ""} ${
            isSelected ? "file-tree__branch-header--selected" : ""
          } ${
            dropTargetPath === node.path ? "file-tree__branch-header--drop-target" : ""
          }`}
          draggable={canMove}
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
          onClick={handleNodeClick}
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
            <span className="file-tree__branch-label">{node.name}</span>
          )}
        </div>
        {!isEmpty && !isCollapsed ? (
          <div className="file-tree__items" role="group">
            {node.children.map((child) => (
              <WorkspaceTreeBranch
                key={child.path}
                collapsedPaths={collapsedPaths}
                node={child}
                renamingPath={renamingPath}
                renameDraft={renameDraft}
                selectedPaths={selectedPaths}
                selectedPath={selectedPath}
                onActivateNode={onActivateNode}
                onOpenFile={onOpenFile}
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
      draggable={canMove}
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
      onDoubleClick={() => {
        if (canRenameWorkspaceNode(node)) {
          onRequestRename(node);
        }
      }}
      role="treeitem"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`file-tree__file-icon file-tree__file-icon--${badge}`}
        title={getWorkspaceIconTitle(badge)}
      />
      <span className="file-row__name">{node.name}</span>
    </button>
  );
}
