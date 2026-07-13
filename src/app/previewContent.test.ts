import { describe, expect, it } from "vitest";
import { createEmptyProjectRepository, writeProjectFile } from "../project/projectState";
import type { WorkspaceTreeNode } from "../workspace/workspaceTree";
import { resolvePreviewTextContent } from "./previewContent";

function fileNode(path: string, content?: string): WorkspaceTreeNode {
  return {
    path,
    name: path.split("/").pop() ?? path,
    kind: "file",
    source: { kind: "document", id: `doc-${path}` },
    content,
    children: []
  };
}

describe("preview content", () => {
  it("uses the active editor content when the preview path is the active source", () => {
    const project = createEmptyProjectRepository({
      displayName: "Preview test",
      defaultFileName: "README.md",
      defaultContent: "Saved README"
    });

    expect(
      resolvePreviewTextContent({
        activePreviewPath: "README.md",
        activeSourceContent: "Unsaved editor README",
        activeSourcePath: "README.md",
        isTextPreview: true,
        previewNode: fileNode("README.md", "Workspace README"),
        project
      })
    ).toBe("Unsaved editor README");
  });

  it("keeps inactive Markdown preview content tied to the preview file", () => {
    const project = writeProjectFile(
      createEmptyProjectRepository({
        displayName: "Preview test",
        defaultFileName: "main.typ",
        defaultContent: "#set page(width: auto)"
      }),
      "README.md",
      "# Project README\n\nThis should stay visible."
    );

    expect(
      resolvePreviewTextContent({
        activePreviewPath: "README.md",
        activeSourceContent: "= Typst source",
        activeSourcePath: "main.typ",
        isTextPreview: true,
        previewNode: fileNode("README.md", ""),
        project
      })
    ).toBe("# Project README\n\nThis should stay visible.");
  });

  it("falls back to workspace node content when the project file is unavailable", () => {
    expect(
      resolvePreviewTextContent({
        activePreviewPath: "README.md",
        activeSourceContent: "= Typst source",
        activeSourcePath: "main.typ",
        isTextPreview: true,
        previewNode: fileNode("README.md", "# Workspace README"),
        project: null
      })
    ).toBe("# Workspace README");
  });

  it("does not decode project bytes for non-text previews", () => {
    const project = writeProjectFile(
      createEmptyProjectRepository({
        displayName: "Preview test",
        defaultFileName: "main.typ",
        defaultContent: "#set page(width: auto)"
      }),
      "image.png",
      new Uint8Array([137, 80, 78, 71])
    );

    expect(
      resolvePreviewTextContent({
        activePreviewPath: "image.png",
        activeSourceContent: "= Typst source",
        activeSourcePath: "main.typ",
        isTextPreview: false,
        previewNode: fileNode("image.png"),
        project
      })
    ).toBe("");
  });

});
