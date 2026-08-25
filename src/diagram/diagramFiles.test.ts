import { describe, expect, it } from "vitest";
import {
  getDiagramAssetFilePath,
  getDiagramAssetPdfFilePath,
  getDiagramCreationDirectory,
  getDiagramWorkspacePath
} from "./diagramFiles";

describe("diagram file locations", () => {
  it("places new diagrams beside nested documents by default", () => {
    expect(getDiagramCreationDirectory("chapters/algebra/main.typ", true)).toBe(
      "chapters/algebra/figures"
    );
    expect(getDiagramWorkspacePath("plot.svg", "chapters/algebra/main.typ", true)).toBe(
      "chapters/algebra/figures/plot.svg"
    );
  });

  it("supports project-root figure directories", () => {
    expect(getDiagramCreationDirectory("chapters/main.typ", false)).toBe("figures");
    expect(getDiagramWorkspacePath("plot.svg", "chapters/main.typ", false)).toBe(
      "figures/plot.svg"
    );
  });

  it("prefers a diagram's persisted workspace location", () => {
    const diagram = { name: "plot.svg", workspacePath: "chapters/figures/plot.svg" };
    expect(getDiagramAssetFilePath(diagram)).toBe("chapters/figures/plot.svg");
    expect(getDiagramAssetPdfFilePath(diagram)).toBe("chapters/figures/plot.pdf");
  });
});
