import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppSnapshot } from "../app/appState";
import {
  projectRepositoryToLegacyProject,
  writeProjectFile,
  type TyprProjectStorageState
} from "../project/projectState";
import {
  SETTINGS_FILE_NAMES,
  createSettingsProject,
  isSettingsProject,
  parseSettingsFile,
  readSettingsProjectFile,
  serializeSettingsFile,
  type SettingsFileErrors
} from "./settingsFiles";

export function useSettingsFiles(
  snapshot: AppSnapshot,
  setSnapshot: Dispatch<SetStateAction<AppSnapshot>>,
  isHydrated: boolean,
  projectStorage: TyprProjectStorageState,
  setProjectStorage: Dispatch<SetStateAction<TyprProjectStorageState>>
) {
  const [errors, setErrors] = useState<SettingsFileErrors>({});
  const [activeSettingsProjectId, setActiveSettingsProjectId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("typr.active-settings-project.v1")
  );
  const skipPreferenceWriteRef = useRef(false);
  const selectedProject = projectStorage.projects.find(
    (project) => project.id === projectStorage.selectedProjectId
  );
  const settingsProject = useMemo(() => {
    return projectStorage.projects.find(
      (project) => project.id === activeSettingsProjectId && isSettingsProject(project)
    ) ?? projectStorage.projects.find(isSettingsProject) ?? null;
  }, [activeSettingsProjectId, projectStorage.projects]);
  const settingsProjectSignature = settingsProject
    ? SETTINGS_FILE_NAMES.map((fileName) => readSettingsProjectFile(settingsProject, fileName) ?? "").join("\u001f")
    : "";

  useEffect(() => {
    if (!isSettingsProject(selectedProject) || selectedProject.id === activeSettingsProjectId) return;
    setActiveSettingsProjectId(selectedProject.id);
    window.localStorage.setItem("typr.active-settings-project.v1", selectedProject.id);
  }, [activeSettingsProjectId, selectedProject]);

  useEffect(() => {
    if (!isHydrated || !snapshot.preferences.showSettingsProject || settingsProject) return;
    setProjectStorage((current) => {
      if (current.projects.some(isSettingsProject)) return current;
      return {
        ...current,
        projects: [...current.projects, createSettingsProject(snapshot.preferences)]
      };
    });
  }, [isHydrated, setProjectStorage, settingsProject, snapshot.preferences]);

  useEffect(() => {
    if (!isHydrated || !settingsProject) return;
    let preferences = snapshot.preferences;
    const nextErrors: SettingsFileErrors = {};
    let workingSnapshot = snapshot;
    for (const fileName of SETTINGS_FILE_NAMES) {
      const result = parseSettingsFile(
        fileName,
        readSettingsProjectFile(settingsProject, fileName) ?? "{}",
        workingSnapshot
      );
      preferences = result.preferences;
      workingSnapshot = { ...workingSnapshot, preferences };
      if (result.error) nextErrors[fileName] = result.error;
    }
    skipPreferenceWriteRef.current = true;
    setErrors(nextErrors);
    setSnapshot((current) => ({
      ...current,
      preferences,
      project: projectStorage.selectedProjectId === settingsProject.id
        ? projectRepositoryToLegacyProject(settingsProject, current.project)
        : current.project
    }));
    // File contents, rather than repository metadata, determine when settings are reapplied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, projectStorage.selectedProjectId, settingsProject?.id, settingsProjectSignature]);

  useEffect(() => {
    if (!isHydrated || !settingsProject) return;
    if (skipPreferenceWriteRef.current) {
      skipPreferenceWriteRef.current = false;
      return;
    }
    setProjectStorage((current) => {
      let changed = false;
      const projects = current.projects.map((project) => {
        if (project.id !== settingsProject.id) return project;
        let nextProject = project;
        for (const fileName of SETTINGS_FILE_NAMES) {
          if (errors[fileName]) continue;
          const serialized = serializeSettingsFile(fileName, snapshot.preferences);
          if (readSettingsProjectFile(nextProject, fileName) !== serialized) {
            nextProject = writeProjectFile(nextProject, fileName, serialized);
            changed = true;
          }
        }
        return nextProject;
      });
      return changed ? { ...current, projects } : current;
    });
  }, [errors, isHydrated, setProjectStorage, settingsProject, snapshot.preferences]);

  const setShowSettingsProject = useCallback((showSettingsProject: boolean) => {
    setSnapshot((current) => ({
      ...current,
      preferences: { ...current.preferences, showSettingsProject }
    }));
  }, [setSnapshot]);

  return { errors, settingsProject, setShowSettingsProject };
}
