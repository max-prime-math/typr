import { useRef, useState } from "react";

export type WorkspaceTabKind = "source" | "preview";

export function useWorkspaceTabs() {
  const workspaceTabDragRef = useRef<{ kind: WorkspaceTabKind; path: string } | null>(null);
  const [sourceTabPaths, setSourceTabPaths] = useState<string[]>([]);
  const [transientSourceTabPath, setTransientSourceTabPath] = useState<string | null>(null);
  const [previewTabPaths, setPreviewTabPaths] = useState<string[]>([]);
  const [activePreviewPath, setActivePreviewPath] = useState<string | null>(null);
  const [draggingWorkspaceTab, setDraggingWorkspaceTab] =
    useState<{ kind: WorkspaceTabKind; path: string } | null>(null);
  const [workspaceTabDropTarget, setWorkspaceTabDropTarget] =
    useState<{ kind: WorkspaceTabKind; path: string; side: "before" | "after" } | null>(null);

  return {
    activePreviewPath,
    draggingWorkspaceTab,
    previewTabPaths,
    setActivePreviewPath,
    setDraggingWorkspaceTab,
    setPreviewTabPaths,
    setSourceTabPaths,
    setTransientSourceTabPath,
    setWorkspaceTabDropTarget,
    sourceTabPaths,
    transientSourceTabPath,
    workspaceTabDragRef,
    workspaceTabDropTarget
  };
}
