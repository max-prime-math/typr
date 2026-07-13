import { describe, expect, it } from "vitest";
import { createDefaultSnapshot, createDocument, createFolder } from "./appState";
import {
  buildProjectWorkspaceEntries,
  buildWorkspaceTree
} from "../workspace/workspaceTree";
import {
  reconcileWorkspaceSelection,
  selectWorkspaceRange
} from "./workspaceSelection";

describe("workspace selection", () => {
  const snapshot = createDocument(
    createFolder(createDefaultSnapshot(), "chapters"),
    "chapters/intro.typ"
  );
  const tree = buildWorkspaceTree(buildProjectWorkspaceEntries(snapshot));

  it("drops stale paths and falls back to the active document outside Trash", () => {
    expect(
      reconcileWorkspaceSelection({
        activeDocumentPath: "chapters/intro.typ",
        anchorPath: "missing.typ",
        currentPath: "missing.typ",
        currentPaths: ["missing.typ"],
        isTrashViewOpen: false,
        tree
      })
    ).toEqual({
      anchorPath: "chapters/intro.typ",
      currentPath: "chapters/intro.typ",
      currentPaths: ["chapters/intro.typ"]
    });
  });

  it("keeps Trash empty when no selected trash nodes remain", () => {
    expect(
      reconcileWorkspaceSelection({
        activeDocumentPath: "chapters/intro.typ",
        anchorPath: "missing.typ",
        currentPath: "missing.typ",
        currentPaths: ["missing.typ"],
        isTrashViewOpen: true,
        tree: []
      })
    ).toEqual({ anchorPath: null, currentPath: null, currentPaths: [] });
  });

  it("selects an inclusive keyboard/pointer range from the stable anchor", () => {
    expect(
      selectWorkspaceRange(
        ["a.typ", "folder", "folder/b.typ", "z.typ"],
        "folder",
        "z.typ"
      )
    ).toEqual(["folder", "folder/b.typ", "z.typ"]);
  });
});
