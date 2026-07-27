import { describe, expect, it } from "vitest";
import {
  createDefaultSnapshot,
  DEFAULT_DOCUMENT_NAME,
  DEFAULT_LATEX_DOCUMENT_NAME,
  DEFAULT_MARKDOWN_DOCUMENT_NAME,
  renameDocumentById
} from "../app/appState";
import {
  addProjectRepository,
  createProjectStorageFromSnapshot,
  createEmptyProjectRepository,
  DEFAULT_PROJECT_GITIGNORE_CONTENT,
  DEFAULT_PROJECT_GITIGNORE_PATH,
  GENERATED_LATEX_PDF_SOURCE_ID,
  getSelectedProjectRepository,
  assertSafeProjectPath,
  isReservedGitPath,
  normalizeProjectStorageState,
  projectRepositoryToLegacyProject,
  removeProjectRepository,
  writeProjectFile
} from "./projectState";

describe("projectState", () => {
  it("hydrates a legacy snapshot into a selected repo-backed project", () => {
    const snapshot = createDefaultSnapshot();
    const storage = normalizeProjectStorageState(null, snapshot);
    const project = getSelectedProjectRepository(storage);

    expect(project?.id).toBe(snapshot.project.id);
    expect(project?.filesystem.entries[DEFAULT_DOCUMENT_NAME]?.kind).toBe("file");
    expect(project?.filesystem.entries[DEFAULT_LATEX_DOCUMENT_NAME]?.kind).toBe("file");
    expect(project?.filesystem.entries[DEFAULT_MARKDOWN_DOCUMENT_NAME]?.kind).toBe("file");
    expect(snapshot.project.activeDocumentId).toBe(
      snapshot.project.documents.find((document) => document.name === DEFAULT_MARKDOWN_DOCUMENT_NAME)?.id
    );
    const gitignore = project?.filesystem.entries[DEFAULT_PROJECT_GITIGNORE_PATH];
    expect(gitignore?.kind).toBe("file");
    expect(gitignore?.kind === "file" && gitignore.content).toBe(
      DEFAULT_PROJECT_GITIGNORE_CONTENT
    );
    expect(gitignore?.source.kind).toBe("document");
    expect(project?.legacyRecovery.project.documents.map((document) => document.name)).not.toContain(
      DEFAULT_PROJECT_GITIGNORE_PATH
    );
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

  it("normalizes persisted Graph files to ordinary project documents", () => {
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
                "figures/legacy.typ": {
                  id: "graph:saved-graph",
                  path: "figures/legacy.typ",
                  kind: "file",
                  content: "#let legacy-plot = true",
                  source: { kind: "graph", id: "saved-graph" } as never,
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

    expect(normalizedProject?.filesystem.entries["figures/legacy.typ"]?.source).toEqual({
      kind: "document",
      id: "saved-graph"
    });
  });

  it("normalizes generated CeTZ sidecars to editable Typst documents", () => {
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
                "figures/orbit.cetz.typ": {
                  id: "virtual:tikz-cetz:orbit",
                  path: "figures/orbit.cetz.typ",
                  kind: "file",
                  content: "#canvas({})",
                  source: { kind: "virtual", id: "tikz-cetz:orbit" },
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
    const cetzEntry =
      normalizedProject?.filesystem.entries["figures/orbit.cetz.typ"];

    expect(cetzEntry?.source).toEqual({
      kind: "document",
      id: "tikz-cetz:orbit"
    });
    const hydratedProject = normalizedProject
      ? projectRepositoryToLegacyProject(normalizedProject, snapshot.project)
      : null;
    expect(
      hydratedProject?.documents.some(
        (document) => document.name === "figures/orbit.cetz.typ"
      )
    ).toBe(true);
  });

  it("preserves virtual generated files when rebuilding from the legacy snapshot", () => {
    const snapshot = createDefaultSnapshot();
    const storage = createProjectStorageFromSnapshot(snapshot);
    const project = getSelectedProjectRepository(storage);
    expect(project).not.toBeNull();
    if (!project) return;

    const updatedProject = writeProjectFile(
      writeProjectFile(
        project,
        "main.pdf",
        new Uint8Array([1, 2, 3]),
        { kind: "virtual", id: GENERATED_LATEX_PDF_SOURCE_ID }
      ),
      DEFAULT_PROJECT_GITIGNORE_PATH,
      "*.pdf\nbuild/\n",
      { kind: "virtual", id: DEFAULT_PROJECT_GITIGNORE_PATH }
    );
    const rebuilt = createProjectStorageFromSnapshot(snapshot, {
      ...storage,
      projects: [updatedProject]
    });
    const rebuiltProject = getSelectedProjectRepository(rebuilt);
    const generatedPdf = rebuiltProject?.filesystem.entries["main.pdf"];
    const gitignore = rebuiltProject?.filesystem.entries[DEFAULT_PROJECT_GITIGNORE_PATH];

    expect(generatedPdf?.kind).toBe("file");
    expect(generatedPdf?.source).toEqual({
      kind: "virtual",
      id: GENERATED_LATEX_PDF_SOURCE_ID
    });
    expect(gitignore?.kind === "file" && gitignore.content).toBe("*.pdf\nbuild/\n");
    expect(gitignore?.source.kind).toBe("document");
  });

  it("normalizes persisted preview tabs", () => {
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
            editor: {
              previewPath: "./build/main.pdf",
              previewTabPaths: ["build/main.pdf", "./build/main.pdf", "../escape.pdf"]
            }
          }
        ]
      },
      snapshot
    );
    const normalizedProject = getSelectedProjectRepository(normalized);

    expect(normalizedProject?.editor.previewPath).toBe("build/main.pdf");
    expect(normalizedProject?.editor.previewTabPaths).toEqual(["build/main.pdf"]);
  });

  it("moves persisted source and preview paths when a document is renamed", () => {
    const snapshot = createDefaultSnapshot();
    const mainDocument = snapshot.project.documents.find(
      (document) => document.name === DEFAULT_DOCUMENT_NAME
    );
    expect(mainDocument).toBeDefined();
    if (!mainDocument) return;

    const storage = createProjectStorageFromSnapshot(snapshot);
    const project = getSelectedProjectRepository(storage);
    expect(project).not.toBeNull();
    if (!project) return;

    const storageWithOpenMain = {
      ...storage,
      projects: storage.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              selection: {
                activeFilePath: DEFAULT_DOCUMENT_NAME,
                openFilePaths: [DEFAULT_DOCUMENT_NAME]
              },
              editor: {
                previewPath: DEFAULT_DOCUMENT_NAME,
                previewTabPaths: [DEFAULT_DOCUMENT_NAME]
              }
            }
          : candidate
      )
    };
    const renamedSnapshot = renameDocumentById(
      snapshot,
      mainDocument.id,
      "article.typ"
    );
    const rebuilt = createProjectStorageFromSnapshot(
      renamedSnapshot,
      storageWithOpenMain
    );
    const rebuiltProject = getSelectedProjectRepository(rebuilt);

    expect(rebuiltProject?.selection).toEqual({
      activeFilePath: DEFAULT_MARKDOWN_DOCUMENT_NAME,
      openFilePaths: ["article.typ"]
    });
    expect(rebuiltProject?.editor).toEqual({
      previewPath: "article.typ",
      previewTabPaths: ["article.typ"]
    });
  });

  it("exposes project .gitignore as an editable legacy document", () => {
    const snapshot = createDefaultSnapshot();
    const storage = createProjectStorageFromSnapshot(snapshot);
    const project = getSelectedProjectRepository(storage);
    expect(project).not.toBeNull();
    if (!project) return;

    const legacyProject = projectRepositoryToLegacyProject(project, snapshot.project);
    const gitignoreDocument = legacyProject.documents.find(
      (document) => document.name === DEFAULT_PROJECT_GITIGNORE_PATH
    );

    expect(gitignoreDocument?.content).toBe(DEFAULT_PROJECT_GITIGNORE_CONTENT);
    expect(legacyProject.activeDocumentId).toBe(snapshot.project.activeDocumentId);
  });

  it("recognizes reserved git paths as non-workspace content", () => {
    expect(isReservedGitPath(".git")).toBe(true);
    expect(isReservedGitPath(".git/config")).toBe(true);
    expect(isReservedGitPath("/.git//objects/aa")).toBe(true);
    expect(isReservedGitPath("notes/.gitignore")).toBe(false);
    expect(isReservedGitPath(".github/workflows/qa.yml")).toBe(false);
    expect(() => assertSafeProjectPath("project/../.git/config")).toThrow(
      "cannot escape the project root"
    );
    expect(() => assertSafeProjectPath("/.git/config")).toThrow(
      "reserved for Typr git storage"
    );
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

  it("restores an empty project without inheriting state from the previous project", () => {
    const previousSnapshot = createDefaultSnapshot();
    const emptyProject = createEmptyProjectRepository({
      displayName: "Empty project",
      defaultFileName: null
    });

    const restoredProject = projectRepositoryToLegacyProject(
      emptyProject,
      previousSnapshot.project
    );

    expect(restoredProject.documents).toEqual([]);
    expect(restoredProject.activeDocumentId).toBe("");
    expect(restoredProject.diagram?.id).toBe(emptyProject.legacyRecovery.project.diagram?.id);
    expect(restoredProject.diagram?.id).not.toBe(previousSnapshot.project.diagram?.id);
    expect(restoredProject.trash).toEqual([]);
    expect(restoredProject.createdAt).toBe(emptyProject.createdAt);
  });
});
