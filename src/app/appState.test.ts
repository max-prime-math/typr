import { describe, expect, it } from "vitest";
import {
  createDefaultSnapshot,
  createDocument,
  createFolder,
  DEFAULT_BIBLIOGRAPHY_DOCUMENT_CONTENT,
  DEFAULT_BIBLIOGRAPHY_DOCUMENT_NAME,
  DEFAULT_MARKDOWN_DOCUMENT_CONTENT,
  DEFAULT_MARKDOWN_DOCUMENT_NAME,
  renameDocumentById,
  renameFolderById
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

});
