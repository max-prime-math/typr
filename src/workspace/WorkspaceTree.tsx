import {
  canDeleteWorkspaceNode,
  canRenameWorkspaceNode,
  getWorkspaceNodeBadge,
  type WorkspaceFileBadge,
  type WorkspaceTreeNode
} from "./workspaceTree";

export const WORKSPACE_ROOT_PATH = "__workspace_root__";

interface WorkspaceTreeProps {
  collapsedPaths: Record<string, boolean>;
  nodes: WorkspaceTreeNode[];
  rootLabel: string;
  selectedPath: string | null;
  renamingPath: string | null;
  renameDraft: string;
  onOpenFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameCommit: () => void;
  onRequestRename: (node: WorkspaceTreeNode) => void;
  onRequestContextMenu: (node: WorkspaceTreeNode, x: number, y: number) => void;
}

export function WorkspaceTree({
  collapsedPaths,
  nodes,
  rootLabel,
  selectedPath,
  renamingPath,
  renameDraft,
  onOpenFile,
  onToggleFolder,
  onRenameDraftChange,
  onRenameCancel,
  onRenameCommit,
  onRequestRename,
  onRequestContextMenu
}: WorkspaceTreeProps) {
  const isRootCollapsed = collapsedPaths[WORKSPACE_ROOT_PATH] ?? false;

  return (
    <div className="file-tree" role="tree" aria-label="Files">
      <div className="file-tree__branch">
        <button
          className="file-tree__branch-header file-tree__branch-header--button"
          onClick={() => onToggleFolder(WORKSPACE_ROOT_PATH)}
          type="button"
          aria-expanded={!isRootCollapsed}
          aria-label={`${isRootCollapsed ? "Expand" : "Collapse"} ${rootLabel}`}
        >
          <span aria-hidden="true" className="file-tree__chevron-text">
            {isRootCollapsed ? "▸" : "▾"}
          </span>
          <span className="file-tree__folder-icon" aria-hidden="true" />
          <span className="file-tree__branch-label">{rootLabel}</span>
        </button>
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
                  selectedPath={selectedPath}
                  onOpenFile={onOpenFile}
                  onToggleFolder={onToggleFolder}
                  onRenameDraftChange={onRenameDraftChange}
                  onRenameCancel={onRenameCancel}
                  onRenameCommit={onRenameCommit}
                  onRequestRename={onRequestRename}
                  onRequestContextMenu={onRequestContextMenu}
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
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameCommit: () => void;
  onRequestRename: (node: WorkspaceTreeNode) => void;
  onRequestContextMenu: (node: WorkspaceTreeNode, x: number, y: number) => void;
}

function WorkspaceTreeBranch({
  collapsedPaths,
  node,
  renamingPath,
  renameDraft,
  selectedPath,
  onOpenFile,
  onToggleFolder,
  onRenameDraftChange,
  onRenameCancel,
  onRenameCommit,
  onRequestRename,
  onRequestContextMenu
}: WorkspaceTreeBranchProps) {
  const isRenaming = renamingPath === node.path;

  if (node.kind === "folder") {
    const isCollapsed = collapsedPaths[node.path] ?? false;
    const isEmpty = node.children.length === 0;
    const canRename = canRenameWorkspaceNode(node);

    return (
      <div className="file-tree__branch">
        <div
          className={`file-tree__branch-header ${isEmpty ? "file-tree__branch-header--static" : ""}`}
          onContextMenu={(event) => {
            event.preventDefault();
            if (canRename || canDeleteWorkspaceNode(node) || node.source.kind === "trash-root") {
              onRequestContextMenu(node, event.clientX, event.clientY);
            }
          }}
          onDoubleClick={() => {
            if (canRename) {
              onRequestRename(node);
            }
          }}
          role="treeitem"
          aria-expanded={isEmpty ? undefined : !isCollapsed}
        >
          {isEmpty ? (
            <span aria-hidden="true" className="file-tree__chevron-text file-tree__chevron-text--empty">
              •
            </span>
          ) : (
            <button
              className="file-tree__toggle-button"
              onClick={() => onToggleFolder(node.path)}
              type="button"
              aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.name}`}
            >
              <span aria-hidden="true" className="file-tree__chevron-text">
                {isCollapsed ? "▸" : "▾"}
              </span>
            </button>
          )}
          <span
            className={`file-tree__folder-icon ${isEmpty ? "file-tree__folder-icon--empty" : ""}`}
            aria-hidden="true"
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
                selectedPath={selectedPath}
                onOpenFile={onOpenFile}
                onToggleFolder={onToggleFolder}
                onRenameDraftChange={onRenameDraftChange}
                onRenameCancel={onRenameCancel}
                onRenameCommit={onRenameCommit}
                onRequestRename={onRequestRename}
                onRequestContextMenu={onRequestContextMenu}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const badge = getWorkspaceNodeBadge(node);

  if (isRenaming) {
    return (
      <div
        className={`file-row file-tree__entry-row ${selectedPath === node.path ? "file-row--active" : ""}`}
        onContextMenu={(event) => {
          event.preventDefault();
          onRequestContextMenu(node, event.clientX, event.clientY);
        }}
        role="treeitem"
      >
        <span aria-hidden="true" className={`file-tree__file-badge file-tree__file-badge--${badge}`}>
          {formatWorkspaceBadge(badge)}
        </span>
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
      className={`file-row file-tree__entry-row ${selectedPath === node.path ? "file-row--active" : ""}`}
      onClick={() => onOpenFile(node.path)}
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
      <span aria-hidden="true" className={`file-tree__file-badge file-tree__file-badge--${badge}`}>
        {formatWorkspaceBadge(badge)}
      </span>
      <span className="file-row__name">{node.name}</span>
    </button>
  );
}

function formatWorkspaceBadge(badge: WorkspaceFileBadge): string {
  switch (badge) {
    case "typ":
      return "typ";
    case "tex":
      return "tex";
    case "img":
      return "img";
    case "pdf":
      return "pdf";
    case "txt":
      return "txt";
    case "empty":
      return "dir";
    case "dir":
      return "dir";
    default:
      return "bin";
  }
}
