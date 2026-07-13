import { describe, expect, it } from "vitest";
import { createDefaultSnapshot, createDocument, createFolder } from "./appState";
import {
  buildProjectWorkspaceEntries,
  buildWorkspaceTree,
  findWorkspaceNodeByPath
} from "../workspace/workspaceTree";
import { getWorkspaceRenameDraft, renameWorkspaceNode } from "./workspaceRename";

describe("App workspace rename semantics", () => {
  it("requests a basename and commits a nested document rename in place", () => {
    const withFolder = createFolder(createDefaultSnapshot(), "chapters");
    const snapshot = createDocument(withFolder, "chapters/intro.typ");
    const tree = buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot));
    const targetNode = findWorkspaceNodeByPath(tree, "chapters/intro.typ");
    expect(targetNode).not.toBeNull();
    if (!targetNode) return;

    expect(getWorkspaceRenameDraft(targetNode)).toBe("intro.typ");

    const renamed = renameWorkspaceNode(snapshot, targetNode, "overview.typ");

    expect(
      renamed.project.documents.find(
        (document) => document.id === targetNode.source.id
      )?.name
    ).toBe("chapters/overview.typ");
  });

  it("commits a nested folder rename through its folder source id", () => {
    const withParentFolder = createFolder(createDefaultSnapshot(), "chapters");
    const withNestedFolder = createFolder(withParentFolder, "chapters/drafts");
    const snapshot = createDocument(withNestedFolder, "chapters/drafts/intro.typ");
    const tree = buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot));
    const targetNode = findWorkspaceNodeByPath(tree, "chapters/drafts");
    expect(targetNode).not.toBeNull();
    if (!targetNode) return;

    expect(getWorkspaceRenameDraft(targetNode)).toBe("drafts");

    const renamed = renameWorkspaceNode(snapshot, targetNode, "archive");

    expect(
      renamed.project.folders.find((folder) => folder.id === targetNode.source.id)?.name
    ).toBe("chapters/archive");
    expect(renamed.project.documents.map((document) => document.name)).toContain(
      "chapters/archive/intro.typ"
    );
  });
});
