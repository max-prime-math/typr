import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompileResult } from "../compiler/types";
import {
  createEmptyProjectRepository,
  writeProjectFile
} from "../project/projectState";
import { BUILTIN_THEMES } from "../theme/themes";
import {
  createTypstPreviewCacheSignature,
  loadSavedLatexPdfCompileResult,
  loadTypstPreviewCacheResult,
  saveTypstPreviewCacheResult
} from "./compilePreviewCache";

describe("compile preview cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the legacy Typst cache signature fields", () => {
    const theme = BUILTIN_THEMES[0];
    const paletteJson = JSON.stringify(theme.palette);
    const signature = createTypstPreviewCacheSignature({
      diagramAssetsRevision: "diagram-1",
      isPaperView: true,
      projectUpdatedAt: "2026-07-11T00:00:00.000Z",
      source: "abc",
      sourcePath: "./main.typ",
      theme
    });

    expect(signature.split("\x1f")).toEqual([
      "main.typ",
      "3:1a47e90b",
      theme.id,
      expect.stringMatching(new RegExp(`^${paletteJson.length}:[a-f0-9]+$`)),
      "paper",
      "2026-07-11T00:00:00.000Z",
      "diagram-1"
    ]);
  });

  it("restores only the matching Typst preview signature", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }
    });
    const result: Extract<CompileResult, { ok: true }> = {
      ok: true,
      engine: "typst-ts",
      diagnostics: [],
      output: {
        kind: "svg",
        content: "<svg />"
      }
    };

    saveTypstPreviewCacheResult({
      projectKey: "project-a",
      result,
      signature: "signature-a",
      sourcePath: "chapters/intro.typ"
    });

    expect(
      loadTypstPreviewCacheResult({
        projectKey: "project-a",
        signature: "signature-a",
        sourcePath: "chapters/intro.typ"
      })
    ).toEqual(result);
    expect(
      loadTypstPreviewCacheResult({
        projectKey: "project-a",
        signature: "signature-b",
        sourcePath: "chapters/intro.typ"
      })
    ).toBeNull();
  });

  it("restores a fresh saved LaTeX PDF and its SyncTeX data", () => {
    const source = "\\documentclass{article}";
    let project = createEmptyProjectRepository({
      displayName: "Compile cache",
      defaultFileName: "main.tex",
      defaultContent: source
    });
    project = writeProjectFile(project, "main.pdf", new Uint8Array([1, 2, 3]));
    project = writeProjectFile(project, "main.synctex.gz", new Uint8Array([4, 5]));
    project = {
      ...project,
      filesystem: {
        ...project.filesystem,
        entries: {
          ...project.filesystem.entries,
          "main.tex": {
            ...project.filesystem.entries["main.tex"],
            updatedAt: "2026-01-01T00:00:00.000Z"
          },
          "main.pdf": {
            ...project.filesystem.entries["main.pdf"],
            updatedAt: "2026-01-02T00:00:00.000Z"
          }
        }
      }
    };

    const restored = loadSavedLatexPdfCompileResult({
      allowStale: false,
      project,
      source,
      sourcePath: "main.tex"
    });

    expect(restored?.ok && restored.output.artifactData).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(restored?.ok && restored.output.sourceMapData).toEqual(
      new Uint8Array([4, 5])
    );
    expect(
      loadSavedLatexPdfCompileResult({
        allowStale: false,
        project,
        source: `${source}\n% unsaved edit`,
        sourcePath: "main.tex"
      })
    ).toBeNull();
  });
});
