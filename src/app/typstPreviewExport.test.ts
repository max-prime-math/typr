import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyProjectRepository, writeProjectFile } from "../project/projectState";
import { exportTypstPdf } from "../compiler/typstRuntime";
import { exportTypstPreviewPdf } from "./typstPreviewExport";

vi.mock("../compiler/typstRuntime", () => ({
  exportTypstPdf: vi.fn()
}));

const PDF_BYTES = new Uint8Array([37, 80, 68, 70]);

describe("Typst preview PDF export", () => {
  beforeEach(() => {
    vi.mocked(exportTypstPdf).mockReset();
    vi.mocked(exportTypstPdf).mockResolvedValue(PDF_BYTES);
  });

  it("uses the visible nested preview path and includes complete project shadows", async () => {
    const sourcePath = "book/chapters/intro.typ";
    const source = [
      '#import "../shared/styles.typ": chapter-title',
      '#image("../../assets/cover.png")',
      "#chapter-title[Unsaved introduction]"
    ].join("\n");
    const coverBytes = new Uint8Array([137, 80, 78, 71]);
    const project = writeProjectFile(
      writeProjectFile(
        writeProjectFile(
          writeProjectFile(
            createEmptyProjectRepository({
              displayName: "Nested Typst export",
              defaultFileName: "main.typ",
              defaultContent: '#include "book/chapters/intro.typ"'
            }),
            sourcePath,
            "= Saved introduction"
          ),
          "book/shared/styles.typ",
          "#let chapter-title(body) = heading(level: 1, body)"
        ),
        "assets/cover.png",
        coverBytes
      ),
      "data/appendix.csv",
      "label,value\nanswer,42"
    );
    const generatedDiagram = {
      path: "/diagrams/generated.svg",
      content: new TextEncoder().encode("<svg />")
    };

    await expect(
      exportTypstPreviewPdf({
        activePreviewCompileSourcePath: sourcePath,
        assets: [generatedDiagram],
        project,
        source,
        sourcePath: "main.typ"
      })
    ).resolves.toEqual(PDF_BYTES);

    expect(exportTypstPdf).toHaveBeenCalledTimes(1);
    const [exportSource, shadowFiles, options] = vi.mocked(exportTypstPdf).mock.calls[0];
    expect(shadowFiles).toBeDefined();
    const shadowsByPath = new Map(shadowFiles!.map((file) => [file.path, file.content]));

    expect(exportSource).toBe(source);
    expect(options).toEqual({ mainFilePath: sourcePath });
    expect([...shadowsByPath.keys()]).toEqual(expect.arrayContaining([
      "/main.typ",
      "/book/chapters/intro.typ",
      "/book/shared/styles.typ",
      "/assets/cover.png",
      "/data/appendix.csv",
      "/diagrams/generated.svg"
    ]));
    expect(new TextDecoder().decode(shadowsByPath.get("/book/chapters/intro.typ"))).toBe(source);
    expect(shadowsByPath.get("/assets/cover.png")).toEqual(coverBytes);
  });

  it("falls back to the selected source path when no preview compile path is available", async () => {
    const sourcePath = "fallback/nested.typ";
    const source = '#import "../shared.typ"\nFallback preview';
    const project = writeProjectFile(
      writeProjectFile(
        createEmptyProjectRepository({
          displayName: "Fallback Typst export",
          defaultFileName: sourcePath,
          defaultContent: "Saved fallback source"
        }),
        "shared.typ",
        "#let shared = [Shared]"
      ),
      "assets/fallback.svg",
      "<svg />"
    );

    await exportTypstPreviewPdf({
      activePreviewCompileSourcePath: null,
      project,
      source,
      sourcePath
    });

    const [, shadowFiles, options] = vi.mocked(exportTypstPdf).mock.calls[0];
    expect(shadowFiles).toBeDefined();
    const shadowsByPath = new Map(shadowFiles!.map((file) => [file.path, file.content]));

    expect(options).toEqual({ mainFilePath: sourcePath });
    expect(new TextDecoder().decode(shadowsByPath.get("/fallback/nested.typ"))).toBe(source);
    expect([...shadowsByPath.keys()]).toEqual(expect.arrayContaining([
      "/fallback/nested.typ",
      "/shared.typ",
      "/assets/fallback.svg"
    ]));
  });
});
