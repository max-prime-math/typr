import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import { createProjectStorageFromSnapshot, getSelectedProjectRepository, writeProjectFile } from "../project/projectState";
import { CompanionClient } from "./companionClient";
import {
  busyTexProvider,
  compileLatexWithAutomaticProvider,
  compileWithCompanion,
  createCompanionCompileRequest,
  selectLatexCompilerProvider
} from "./latexCompilerProviders";

const availableConnection = {
  state: "available" as const,
  baseUrl: "http://localhost:8484",
  status: {
    protocolVersion: 1,
    serverVersion: "0.1.0",
    capabilities: {
      compile: { engines: ["pdflatex"] },
      filesystem: { projectStorage: false as const },
      lsp: { languages: [] },
      git: { enabled: false },
      terminal: { enabled: false }
    }
  }
};

function fixtureProject() {
  const storage = createProjectStorageFromSnapshot(createDefaultSnapshot());
  const project = getSelectedProjectRepository(storage);
  if (!project) throw new Error("Expected fixture project");
  return writeProjectFile(
    writeProjectFile(
      writeProjectFile(project, "main.tex", "\\documentclass{article}\n\\begin{document}\n\\input{chapters/intro}\n\\end{document}"),
      "chapters/intro.tex",
      "Hello from a chapter."
    ),
    "figures/logo.bin",
    new Uint8Array([0, 1, 2, 255])
  );
}

describe("LaTeX compiler providers", () => {
  it("selects Companion only for an advertised compatible engine and preserves BusyTeX", () => {
    expect(selectLatexCompilerProvider({ companion: availableConnection, compileDriver: "pdftex_bibtex8" })).toBe("companion");
    expect(selectLatexCompilerProvider({ companion: availableConnection, compileDriver: "luatex_bibtex8" })).toBe("busytex");
    expect(selectLatexCompilerProvider({ companion: { ...availableConnection, state: "unavailable" }, compileDriver: "pdftex_bibtex8" })).toBe("busytex");
    expect(busyTexProvider.isAvailable({ companion: { ...availableConnection, state: "unavailable" }, compileDriver: "pdftex_bibtex8" })).toBe(true);
  });

  it("serializes the complete multi-file project with the detected root main file", () => {
    const request = createCompanionCompileRequest({
      project: fixtureProject(),
      mainFilePath: "chapters/intro.tex",
      source: "Hello from a chapter.",
      compileDriver: "pdftex_bibtex8"
    });

    expect(request.mainFilePath).toBe("main.tex");
    expect(request.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      "main.tex", "chapters/intro.tex", "figures/logo.bin"
    ]));
    expect(request.files.find((file) => file.path === "figures/logo.bin")).toMatchObject({
      kind: "binary",
      encoding: "base64",
      content: "AAEC/w=="
    });
  });

  it("converts a Companion PDF success and typed LaTeX failure into Typr's existing result shape", async () => {
    const options = {
      project: fixtureProject(),
      mainFilePath: "main.tex",
      source: "\\documentclass{article}",
      compileDriver: "pdftex_bibtex8" as const
    };
    const successClient = new CompanionClient({
      fetch: async () => jsonResponse({
        ok: true,
        engine: "pdflatex",
        output: { path: "main.pdf", mediaType: "application/pdf", encoding: "base64", content: "JVBERg==" },
        log: "native complete",
        durationMs: 10
      })
    });
    const success = await compileWithCompanion(successClient, options);
    expect(success).toMatchObject({ ok: true, engine: "companion", output: { kind: "pdf", content: "native complete" } });
    expect(success.ok && [...success.output.artifactData ?? []]).toEqual([37, 80, 68, 70]);

    const failureClient = new CompanionClient({
      fetch: async () => jsonResponse({
        ok: false,
        engine: "pdflatex",
        errors: [{ code: "latex-compile-failed", message: "Undefined control sequence", path: "main.tex", line: 2 }],
        log: "! Undefined control sequence.",
        durationMs: 10
      })
    });
    const failure = await compileWithCompanion(failureClient, options);
    expect(failure).toMatchObject({ ok: false, engine: "companion", errors: [{ message: "Undefined control sequence", path: "main.tex", line: 2 }] });
    expect(!failure.ok && failure.output?.content).toContain("Undefined control sequence");
  });

  it("falls back to the existing BusyTeX provider when Companion disappears", async () => {
    const fallbackResult = {
      ok: true as const,
      engine: "busytex" as const,
      diagnostics: [],
      output: { kind: "pdf" as const, content: "BusyTeX fallback", artifactData: new Uint8Array([1]) }
    };
    const outcome = await compileLatexWithAutomaticProvider({
      client: new CompanionClient({ fetch: async () => { throw new TypeError("connection refused"); } }),
      companion: availableConnection,
      options: {
        project: fixtureProject(),
        mainFilePath: "main.tex",
        source: "\\documentclass{article}",
        compileDriver: "pdftex_bibtex8"
      },
      busyProvider: { id: "busytex", label: "BusyTeX", isAvailable: () => true, compile: async () => fallbackResult }
    });

    expect(outcome).toEqual({ result: fallbackResult, provider: "busytex" });
  });

  it("surfaces Companion HTTP failures without mislabelling them as BusyTeX errors", async () => {
    const outcome = await compileLatexWithAutomaticProvider({
      client: new CompanionClient({ fetch: async () => jsonResponse({ error: { message: "unsupported protocol" } }, 500) }),
      companion: availableConnection,
      options: {
        project: fixtureProject(),
        mainFilePath: "main.tex",
        source: "\\documentclass{article}",
        compileDriver: "pdftex_bibtex8"
      }
    });

    expect(outcome).toMatchObject({
      provider: "companion",
      result: { ok: false, engine: "companion", errors: [{ message: expect.stringContaining("unsupported protocol") }] }
    });
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
