import { describe, expect, it } from "vitest";
import {
  getWorkspaceNodeBadge,
  isTextWorkspaceFile,
  type WorkspaceTreeNode
} from "./workspaceTree";

function fileNode(path: string): WorkspaceTreeNode {
  return {
    path,
    name: path.split("/").at(-1) ?? path,
    kind: "file",
    source: { kind: "document", id: path },
    children: []
  };
}

describe("workspace tree file icons", () => {
  it("resolves document icons by filename and extension", () => {
    expect(getWorkspaceNodeBadge(fileNode("main.typ"))).toBe("typ");
    expect(getWorkspaceNodeBadge(fileNode("paper.tex"))).toBe("tex");
    expect(getWorkspaceNodeBadge(fileNode("figures/orbit.tikz"))).toBe("tex");
    expect(getWorkspaceNodeBadge(fileNode("references.bib"))).toBe("bib");
    expect(getWorkspaceNodeBadge(fileNode("README.md"))).toBe("info");
    expect(getWorkspaceNodeBadge(fileNode("paper.pdf"))).toBe("pdf");
  });

  it("resolves data, config, code, and fallback icons", () => {
    expect(getWorkspaceNodeBadge(fileNode("package.json"))).toBe("config");
    expect(getWorkspaceNodeBadge(fileNode("data/results.csv"))).toBe("csv");
    expect(getWorkspaceNodeBadge(fileNode("workflow.yml"))).toBe("yaml");
    expect(getWorkspaceNodeBadge(fileNode(".gitignore"))).toBe("git");
    expect(getWorkspaceNodeBadge(fileNode("scripts/build.ts"))).toBe("code");
    expect(getWorkspaceNodeBadge(fileNode("notes.txt"))).toBe("txt");
    expect(getWorkspaceNodeBadge(fileNode("archive.zip"))).toBe("archive");
    expect(getWorkspaceNodeBadge(fileNode("3.0.intro.synctex.gz"))).toBe("archive");
  });

  it("treats TikZ source as editable text", () => {
    expect(isTextWorkspaceFile("figures/orbit.tikz")).toBe(true);
    expect(isTextWorkspaceFile("figures/orbit.pgf")).toBe(true);
  });
});
