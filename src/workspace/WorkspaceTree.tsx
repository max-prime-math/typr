import {
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
  onOpenFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
}

export function WorkspaceTree({
  collapsedPaths,
  nodes,
  rootLabel,
  selectedPath,
  onOpenFile,
  onToggleFolder
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
                  selectedPath={selectedPath}
                  onOpenFile={onOpenFile}
                  onToggleFolder={onToggleFolder}
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
  selectedPath: string | null;
  onOpenFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
}

function WorkspaceTreeBranch({
  collapsedPaths,
  node,
  selectedPath,
  onOpenFile,
  onToggleFolder
}: WorkspaceTreeBranchProps) {
  if (node.kind === "folder") {
    const isCollapsed = collapsedPaths[node.path] ?? false;
    const isEmpty = node.children.length === 0;

    return (
      <div className="file-tree__branch">
        <div
          className={`file-tree__branch-header ${isEmpty ? "file-tree__branch-header--static" : ""}`}
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
          <span className="file-tree__branch-label">{node.name}</span>
        </div>
        {!isEmpty && !isCollapsed ? (
          <div className="file-tree__items" role="group">
            {node.children.map((child) => (
              <WorkspaceTreeBranch
                key={child.path}
                collapsedPaths={collapsedPaths}
                node={child}
                selectedPath={selectedPath}
                onOpenFile={onOpenFile}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const badge = getWorkspaceNodeBadge(node);

  return (
    <button
      className={`file-row file-tree__entry-row ${selectedPath === node.path ? "file-row--active" : ""}`}
      onClick={() => onOpenFile(node.path)}
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
