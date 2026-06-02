import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import {
  addProjectRepository,
  createProjectStorageFromSnapshot,
  createEmptyProjectRepository,
  getSelectedProjectRepository,
  isReservedGitPath,
  normalizeProjectStorageState,
  removeProjectRepository
} from "./projectState";

describe("projectState", () => {
  it("hydrates a legacy snapshot into a selected repo-backed project", () => {
    const snapshot = createDefaultSnapshot();
    const storage = normalizeProjectStorageState(null, snapshot);
    const project = getSelectedProjectRepository(storage);

    expect(project?.id).toBe(snapshot.project.id);
    expect(project?.filesystem.entries["main.typ"]?.kind).toBe("file");
    expect(project?.git.backend).toBe("browser-git");
    expect(project?.git.status).toBe("not-initialized");
    expect(storage.migration.legacySnapshotRetained).toBe(true);
  });

  it("normalizes invalid persisted paths while retaining legacy recovery data", () => {
    const snapshot = createDefaultSnapshot();
    const storage = createProjectStorageFromSnapshot(snapshot);
    const project = getSelectedProjectRepository(storage);
    expect(project).not.toBeNull();
    if (!project) return;

    const normalized = normalizeProjectStorageState(
      {
        ...storage,
        projects: [
          {
            ...project,
            filesystem: {
              ...project.filesystem,
              entries: {
                ...project.filesystem.entries,
                "../escape.typ": {
                  id: "bad",
                  path: "../escape.typ",
                  kind: "file",
                  content: "bad",
                  source: { kind: "document", id: "bad" },
                  updatedAt: new Date().toISOString()
                }
              }
            }
          }
        ]
      },
      snapshot
    );
    const normalizedProject = getSelectedProjectRepository(normalized);

    expect(normalizedProject?.filesystem.entries["../escape.typ"]).toBeUndefined();
    expect(normalizedProject?.legacyRecovery.project.id).toBe(snapshot.project.id);
  });

  it("recognizes reserved git paths as non-workspace content", () => {
    expect(isReservedGitPath(".git")).toBe(true);
    expect(isReservedGitPath(".git/config")).toBe(true);
    expect(isReservedGitPath("notes/.gitignore")).toBe(false);
  });

  it("removes a selected project and selects a remaining project", () => {
    const snapshot = createDefaultSnapshot();
    const initialStorage = createProjectStorageFromSnapshot(snapshot);
    const firstProject = getSelectedProjectRepository(initialStorage);
    const secondProject = createEmptyProjectRepository({ displayName: "Second project" });
    expect(firstProject).not.toBeNull();
    if (!firstProject) return;

    const storage = addProjectRepository(initialStorage, secondProject);
    const nextStorage = removeProjectRepository(storage, secondProject.id);
    const selectedProject = getSelectedProjectRepository(nextStorage);

    expect(nextStorage.projects.map((project) => project.id)).toEqual([firstProject.id]);
    expect(selectedProject?.id).toBe(firstProject.id);
  });

  it("uses a fallback project when removing the final project", () => {
    const snapshot = createDefaultSnapshot();
    const storage = createProjectStorageFromSnapshot(snapshot);
    const project = getSelectedProjectRepository(storage);
    const fallbackProject = createEmptyProjectRepository({ displayName: "Replacement" });
    expect(project).not.toBeNull();
    if (!project) return;

    const nextStorage = removeProjectRepository(storage, project.id, fallbackProject);

    expect(nextStorage.projects).toHaveLength(1);
    expect(nextStorage.projects[0]?.id).toBe(fallbackProject.id);
    expect(nextStorage.selectedProjectId).toBe(fallbackProject.id);
  });
});
