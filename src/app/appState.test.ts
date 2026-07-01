import { describe, expect, it } from "vitest";
import {
  createDefaultSnapshot,
  createDocument,
  createFolder,
  DEFAULT_MARKDOWN_DOCUMENT_CONTENT,
  DEFAULT_MARKDOWN_DOCUMENT_NAME
} from "./appState";

describe("appState", () => {
  it("uses README.md as the default Markdown document", () => {
    const snapshot = createDefaultSnapshot();
    const readme = snapshot.project.documents.find(
      (document) => document.name === DEFAULT_MARKDOWN_DOCUMENT_NAME
    );

    expect(DEFAULT_MARKDOWN_DOCUMENT_NAME).toBe("README.md");
    expect(readme?.content).toBe(DEFAULT_MARKDOWN_DOCUMENT_CONTENT);
    expect(readme?.content).toContain("Typr is a local-first writing workspace");
    expect(readme?.content).toContain("Check Settings");
    expect(readme?.content).toContain("Explore the left pane tabs");
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
});
