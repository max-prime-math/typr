import { describe, expect, it } from "vitest";
import { createDefaultSnapshot, createDocument, createFolder } from "./appState";
import {
  buildProjectWorkspaceEntries,
  buildWorkspaceTree,
  findWorkspaceNodeByPath
} from "../workspace/workspaceTree";
import {
  copyWorkspaceNodesToSnapshot,
  moveWorkspaceNodeInSnapshot,
  removeWorkspaceSelectionSubtree,
  trashWorkspaceNode
} from "./workspaceTreeActions";

function getNode(path: string) {
  const snapshot = createDocument(
    createFolder(createDefaultSnapshot(), "chapters"),
    "chapters/intro.typ"
  );
  const tree = buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot));
  const node = findWorkspaceNodeByPath(tree, path);
  expect(node).not.toBeNull();
  if (!node) throw new Error(`Missing fixture node ${path}`);
  return { node, snapshot };
}

describe("workspace tree actions", () => {
  it("moves a folder and reports the remapped workspace path", () => {
    const { node, snapshot } = getNode("chapters");
    const result = moveWorkspaceNodeInSnapshot(snapshot, node, "archive");

    expect(result.movedPath).toBe("archive/chapters");
    expect(result.snapshot.project.documents.map((entry) => entry.name)).toContain(
      "archive/chapters/intro.typ"
    );
  });

  it("copies a subtree without reusing document ids", () => {
    const { node, snapshot } = getNode("chapters");
    const result = copyWorkspaceNodesToSnapshot(snapshot, [node], null);
    const original = snapshot.project.documents.find(
      (entry) => entry.name === "chapters/intro.typ"
    );
    const copied = result.snapshot.project.documents.find(
      (entry) => entry.name === "chapters copy/intro.typ"
    );

    expect(result.copiedPaths).toEqual(["chapters copy"]);
    expect(copied?.id).not.toBe(original?.id);
  });

  it("moves a document to trash and removes its subtree from selection", () => {
    const { node, snapshot } = getNode("chapters/intro.typ");
    const trashed = trashWorkspaceNode(snapshot, node);

    expect(trashed.project.documents.map((entry) => entry.name)).not.toContain(
      "chapters/intro.typ"
    );
    expect(trashed.project.trash?.some((entry) => entry.originalPath === "chapters/intro.typ"))
      .toBe(true);
    expect(
      removeWorkspaceSelectionSubtree(
        ["chapters", "chapters/intro.typ", "other.typ"],
        "chapters"
      )
    ).toEqual(["other.typ"]);
  });
});
