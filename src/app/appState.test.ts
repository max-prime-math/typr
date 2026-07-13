import { describe, expect, it } from "vitest";
import {
  createDefaultSnapshot,
  createDocument,
  createFolder,
  DEFAULT_BIBLIOGRAPHY_DOCUMENT_CONTENT,
  DEFAULT_BIBLIOGRAPHY_DOCUMENT_NAME,
  DEFAULT_MARKDOWN_DOCUMENT_CONTENT,
  DEFAULT_MARKDOWN_DOCUMENT_NAME,
  normalizeSnapshot,
  renameDocumentById,
  renameFolderById,
  type AppSnapshot
} from "./appState";

describe("appState", () => {
  it("uses README.md as the default Markdown document", () => {
    const snapshot = createDefaultSnapshot();
    const readme = snapshot.project.documents.find(
      (document) => document.name === DEFAULT_MARKDOWN_DOCUMENT_NAME
    );

    expect(DEFAULT_MARKDOWN_DOCUMENT_NAME).toBe("README.md");
    expect(snapshot.project.activeDocumentId).toBe(readme?.id);
    expect(readme?.content).toBe(DEFAULT_MARKDOWN_DOCUMENT_CONTENT);
    expect(readme?.content).toContain("matching bibliography stress tests");
    expect(readme?.content).toContain(DEFAULT_BIBLIOGRAPHY_DOCUMENT_NAME);

    const bibliography = snapshot.project.documents.find(
      (document) => document.name === DEFAULT_BIBLIOGRAPHY_DOCUMENT_NAME
    );

    expect(bibliography?.content).toBe(DEFAULT_BIBLIOGRAPHY_DOCUMENT_CONTENT);
    expect(bibliography?.content).toContain("@book{knuth1984texbook");
  });

  it("creates extensionless new files with the smallest available directory-local index", () => {
    const initial = createDefaultSnapshot();
    const withRootFile = createDocument(initial);
    const withSecondRootFile = createDocument(withRootFile);
    const withFolder = createFolder(withSecondRootFile, "notes");
    const withFolderFile = createDocument(withFolder, "notes/new-file-1");
    const withSecondFolderFile = createDocument(withFolderFile, "notes/new-file-1");
    const names = withSecondFolderFile.project.documents.map((document) => document.name);

    expect(names).toContain("new-file-1");
    expect(names).toContain("new-file-2");
    expect(names).toContain("notes/new-file-1");
    expect(names).toContain("notes/new-file-2");
  });

  it("renames nested documents without moving them to the project root", () => {
    const withFolder = createFolder(createDefaultSnapshot(), "chapters");
    const withDocument = createDocument(withFolder, "chapters/intro.typ");
    const nestedDocument = withDocument.project.documents.find(
      (document) => document.name === "chapters/intro.typ"
    );
    expect(nestedDocument).toBeDefined();
    if (!nestedDocument) return;

    const renamed = renameDocumentById(withDocument, nestedDocument.id, "overview.typ");
    const renamedDocument = renamed.project.documents.find(
      (document) => document.id === nestedDocument.id
    );

    expect(renamedDocument?.name).toBe("chapters/overview.typ");
    expect(renamed.project.documents.map((document) => document.name)).not.toContain(
      "overview.typ"
    );
  });

  it("keeps nested document rename collisions in the same parent folder", () => {
    const withFolder = createFolder(createDefaultSnapshot(), "chapters");
    const withExistingDocument = createDocument(withFolder, "chapters/overview.typ");
    const withSecondExistingDocument = createDocument(
      withExistingDocument,
      "chapters/overview-2.typ"
    );
    const withTargetDocument = createDocument(
      withSecondExistingDocument,
      "chapters/intro.typ"
    );
    const targetDocument = withTargetDocument.project.documents.find(
      (document) => document.name === "chapters/intro.typ"
    );
    const existingDocument = withTargetDocument.project.documents.find(
      (document) => document.name === "chapters/overview.typ"
    );
    expect(targetDocument).toBeDefined();
    expect(existingDocument).toBeDefined();
    if (!targetDocument || !existingDocument) return;

    const renamed = renameDocumentById(withTargetDocument, targetDocument.id, "overview.typ");

    expect(
      renamed.project.documents.find((document) => document.id === targetDocument.id)?.name
    ).toBe("chapters/overview-3.typ");
    expect(
      renamed.project.documents.find((document) => document.id === existingDocument.id)
    ).toBe(existingDocument);
    expect(renamed.project.documents.map((document) => document.name)).not.toContain(
      "overview-3.typ"
    );
  });

  it("renames nested folders in place and moves their descendants with them", () => {
    const withParentFolder = createFolder(createDefaultSnapshot(), "chapters");
    const withNestedFolder = createFolder(withParentFolder, "chapters/drafts");
    const withNestedDocument = createDocument(withNestedFolder, "chapters/drafts/intro.typ");
    const nestedFolder = withNestedDocument.project.folders.find(
      (folder) => folder.name === "chapters/drafts"
    );
    expect(nestedFolder).toBeDefined();
    if (!nestedFolder) return;

    const renamed = renameFolderById(withNestedDocument, nestedFolder.id, "archive");
    const renamedFolder = renamed.project.folders.find((folder) => folder.id === nestedFolder.id);

    expect(renamedFolder?.name).toBe("chapters/archive");
    expect(renamed.project.documents.map((document) => document.name)).toContain(
      "chapters/archive/intro.typ"
    );
    expect(renamed.project.folders.map((folder) => folder.name)).not.toContain("archive");
    expect(renamed.project.documents.map((document) => document.name)).not.toContain(
      "chapters/drafts/intro.typ"
    );
  });

  it("renames every nested folder descendant through collisions without touching unrelated paths", () => {
    const withParentFolder = createFolder(createDefaultSnapshot(), "chapters");
    const withTargetFolder = createFolder(withParentFolder, "chapters/drafts");
    const withNestedFolder = createFolder(withTargetFolder, "chapters/drafts/deep");
    const withCollision = createFolder(withNestedFolder, "chapters/archive");
    const withSecondCollision = createFolder(withCollision, "chapters/archive-2");
    const withSimilarSibling = createFolder(withSecondCollision, "chapters/drafts-notes");
    const withTargetDocument = createDocument(
      withSimilarSibling,
      "chapters/drafts/intro.typ"
    );
    const withNestedDocument = createDocument(
      withTargetDocument,
      "chapters/drafts/deep/notes.typ"
    );
    const withCollisionDocument = createDocument(
      withNestedDocument,
      "chapters/archive/keep.typ"
    );
    const snapshot = createDocument(
      withCollisionDocument,
      "chapters/drafts-notes/keep.typ"
    );
    const targetFolder = snapshot.project.folders.find(
      (folder) => folder.name === "chapters/drafts"
    );
    const unrelatedFolder = snapshot.project.folders.find(
      (folder) => folder.name === "chapters/drafts-notes"
    );
    const unrelatedDocument = snapshot.project.documents.find(
      (document) => document.name === "chapters/drafts-notes/keep.typ"
    );
    expect(targetFolder).toBeDefined();
    expect(unrelatedFolder).toBeDefined();
    expect(unrelatedDocument).toBeDefined();
    if (!targetFolder || !unrelatedFolder || !unrelatedDocument) return;

    const renamed = renameFolderById(snapshot, targetFolder.id, "archive");
    const folderNames = renamed.project.folders.map((folder) => folder.name);
    const documentNames = renamed.project.documents.map((document) => document.name);

    expect(folderNames).toContain("chapters/archive-3");
    expect(folderNames).toContain("chapters/archive-3/deep");
    expect(documentNames).toContain("chapters/archive-3/intro.typ");
    expect(documentNames).toContain("chapters/archive-3/deep/notes.typ");
    expect(folderNames).not.toContain("chapters/drafts");
    expect(folderNames).not.toContain("chapters/drafts/deep");
    expect(documentNames).not.toContain("chapters/drafts/intro.typ");
    expect(documentNames).not.toContain("chapters/drafts/deep/notes.typ");
    expect(renamed.project.folders.find((folder) => folder.id === unrelatedFolder.id)).toBe(
      unrelatedFolder
    );
    expect(
      renamed.project.documents.find((document) => document.id === unrelatedDocument.id)
    ).toBe(unrelatedDocument);
    expect(folderNames).toContain("chapters/archive");
    expect(folderNames).toContain("chapters/archive-2");
    expect(documentNames).toContain("chapters/archive/keep.typ");
  });

  it("migrates saved Graph Typst assets to ordinary documents", () => {
    const snapshot = createDefaultSnapshot();
    const content = new TextEncoder().encode("#let legacy-plot = true");
    const legacySnapshot = {
      ...snapshot,
      project: {
        ...snapshot.project,
        graph: {
          id: "draft-graph",
          name: "draft.typ",
          content: new Uint8Array()
        },
        graphs: [
          {
            id: "saved-graph",
            name: "plots/result.typ",
            content,
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      },
      preferences: {
        ...snapshot.preferences,
        graphProvider: "simple-plot"
      }
    } as unknown as AppSnapshot;

    const normalized = normalizeSnapshot(legacySnapshot);
    const migratedDocument = normalized.project.documents.find(
      (document) => document.name === "figures/plots/result.typ"
    );

    expect(migratedDocument?.id).toBe("saved-graph");
    expect(migratedDocument?.content).toEqual(content);
    expect("graph" in normalized.project).toBe(false);
    expect("graphs" in normalized.project).toBe(false);
    expect("graphProvider" in normalized.preferences).toBe(false);
  });

});
