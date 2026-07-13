import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { TyprProjectRepository } from "../project/projectState";
import { isTextWorkspaceFile, normalizeWorkspacePath } from "../workspace/workspaceTree";
import {
  areWorkspacePathListsEqual,
  normalizeUniqueWorkspacePaths,
  reconcileWorkspaceTabs
} from "./workspaceTabs";

export function useWorkspaceTabPersistence({
  activePreviewPath,
  activeProjectTabKey,
  isAvailablePreviewTabPath,
  isTrashViewOpen,
  previewTabPaths,
  selectedProjectRepository,
  setActivePreviewPath,
  setPreviewTabPaths,
  setProjectRepository,
  setSourceTabPaths,
  setTransientSourceTabPath,
  sourceTabPaths,
  transientSourceTabPath,
  workspaceFilePathSet
}: {
  activePreviewPath: string | null;
  activeProjectTabKey: string;
  isAvailablePreviewTabPath: (path: string) => boolean;
  isTrashViewOpen: boolean;
  previewTabPaths: string[];
  selectedProjectRepository: TyprProjectRepository | null;
  setActivePreviewPath: Dispatch<SetStateAction<string | null>>;
  setPreviewTabPaths: Dispatch<SetStateAction<string[]>>;
  setProjectRepository: (updater: (project: TyprProjectRepository) => TyprProjectRepository) => void;
  setSourceTabPaths: Dispatch<SetStateAction<string[]>>;
  setTransientSourceTabPath: Dispatch<SetStateAction<string | null>>;
  sourceTabPaths: string[];
  transientSourceTabPath: string | null;
  workspaceFilePathSet: ReadonlySet<string>;
}) {
  const sourceTabsInitializedProjectRef = useRef<string | null>(null);
  const previewTabsInitializedProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      isTrashViewOpen ||
      workspaceFilePathSet.size === 0 ||
      sourceTabsInitializedProjectRef.current === activeProjectTabKey
    ) {
      return;
    }

    const storedSourceTabs = normalizeUniqueWorkspacePaths(
      selectedProjectRepository?.selection.openFilePaths ?? []
    ).filter((path) => workspaceFilePathSet.has(path) && isTextWorkspaceFile(path));

    setSourceTabPaths(storedSourceTabs);
    if (
      selectedProjectRepository &&
      !areWorkspacePathListsEqual(
        selectedProjectRepository.selection.openFilePaths,
        storedSourceTabs
      )
    ) {
      setProjectRepository((project) => ({
        ...project,
        selection: { ...project.selection, openFilePaths: storedSourceTabs }
      }));
    }
    sourceTabsInitializedProjectRef.current = activeProjectTabKey;
  }, [
    activeProjectTabKey,
    isTrashViewOpen,
    selectedProjectRepository,
    setProjectRepository,
    setSourceTabPaths,
    workspaceFilePathSet
  ]);

  useEffect(() => {
    if (isTrashViewOpen || previewTabsInitializedProjectRef.current === activeProjectTabKey) {
      return;
    }

    const storedPreviewTabs = normalizeUniqueWorkspacePaths([
      ...(selectedProjectRepository?.editor.previewTabPaths ?? []),
      selectedProjectRepository?.editor.previewPath ?? ""
    ]).filter(isAvailablePreviewTabPath);
    const storedActivePreviewPath = normalizeWorkspacePath(
      selectedProjectRepository?.editor.previewPath ?? ""
    );

    setPreviewTabPaths(storedPreviewTabs);
    setActivePreviewPath(
      storedActivePreviewPath && storedPreviewTabs.includes(storedActivePreviewPath)
        ? storedActivePreviewPath
        : storedPreviewTabs[0] ?? null
    );
    previewTabsInitializedProjectRef.current = activeProjectTabKey;
  }, [
    activeProjectTabKey,
    isAvailablePreviewTabPath,
    isTrashViewOpen,
    selectedProjectRepository,
    setActivePreviewPath,
    setPreviewTabPaths
  ]);

  useEffect(() => {
    const nextSourceTabs = normalizeUniqueWorkspacePaths(sourceTabPaths).filter(
      (path) => workspaceFilePathSet.has(path) && isTextWorkspaceFile(path)
    );
    if (!areWorkspacePathListsEqual(nextSourceTabs, sourceTabPaths)) {
      setSourceTabPaths(nextSourceTabs);
    }
  }, [setSourceTabPaths, sourceTabPaths, workspaceFilePathSet]);

  useEffect(() => {
    const currentTabs = normalizeUniqueWorkspacePaths(sourceTabPaths);
    const storedTabs = normalizeUniqueWorkspacePaths(
      selectedProjectRepository?.selection.openFilePaths ?? []
    ).filter((path) => workspaceFilePathSet.has(path) && isTextWorkspaceFile(path));
    const reconciled = reconcileWorkspaceTabs({
      activePath: currentTabs[0] ?? null,
      availablePaths: workspaceFilePathSet,
      includeStoredPaths: true,
      paths: currentTabs,
      storedPaths: storedTabs
    });
    if (!areWorkspacePathListsEqual(currentTabs, reconciled.paths)) {
      setSourceTabPaths(reconciled.paths);
    }
  }, [selectedProjectRepository?.selection.openFilePaths, setSourceTabPaths, sourceTabPaths, workspaceFilePathSet]);

  useEffect(() => {
    if (!transientSourceTabPath) return;
    const normalizedPath = normalizeWorkspacePath(transientSourceTabPath);
    if (
      !normalizedPath ||
      !workspaceFilePathSet.has(normalizedPath) ||
      sourceTabPaths.includes(normalizedPath)
    ) {
      setTransientSourceTabPath(null);
    }
  }, [setTransientSourceTabPath, sourceTabPaths, transientSourceTabPath, workspaceFilePathSet]);

  useEffect(() => {
    const nextState = reconcileWorkspaceTabs({
      activePath: activePreviewPath,
      availablePaths: new Set(
        normalizeUniqueWorkspacePaths(previewTabPaths).filter(isAvailablePreviewTabPath)
      ),
      includeStoredPaths: false,
      paths: previewTabPaths,
      storedPaths: []
    });
    if (!areWorkspacePathListsEqual(nextState.paths, previewTabPaths)) {
      setPreviewTabPaths(nextState.paths);
    }
    if (nextState.activePath !== activePreviewPath) {
      setActivePreviewPath(nextState.activePath);
    }
  }, [activePreviewPath, isAvailablePreviewTabPath, previewTabPaths, setActivePreviewPath, setPreviewTabPaths]);

  useEffect(() => {
    if (
      !selectedProjectRepository ||
      isTrashViewOpen ||
      previewTabsInitializedProjectRef.current !== activeProjectTabKey
    ) {
      return;
    }

    const nextPreviewTabs = normalizeUniqueWorkspacePaths(previewTabPaths).filter(
      isAvailablePreviewTabPath
    );
    const normalizedActivePreviewPath = activePreviewPath
      ? normalizeWorkspacePath(activePreviewPath)
      : "";
    const nextPreviewPath =
      normalizedActivePreviewPath && nextPreviewTabs.includes(normalizedActivePreviewPath)
        ? normalizedActivePreviewPath
        : null;
    const storedPreviewTabs = normalizeUniqueWorkspacePaths(
      selectedProjectRepository.editor.previewTabPaths ?? []
    ).filter(isAvailablePreviewTabPath);
    const storedPreviewPath =
      normalizeWorkspacePath(selectedProjectRepository.editor.previewPath ?? "") || null;

    if (
      areWorkspacePathListsEqual(nextPreviewTabs, storedPreviewTabs) &&
      nextPreviewPath === storedPreviewPath
    ) {
      return;
    }

    setProjectRepository((project) =>
      project.id === selectedProjectRepository.id
        ? {
            ...project,
            editor: {
              ...project.editor,
              previewPath: nextPreviewPath,
              previewTabPaths: nextPreviewTabs
            }
          }
        : project
    );
  }, [
    activePreviewPath,
    activeProjectTabKey,
    isAvailablePreviewTabPath,
    isTrashViewOpen,
    previewTabPaths,
    selectedProjectRepository,
    setProjectRepository
  ]);
}
