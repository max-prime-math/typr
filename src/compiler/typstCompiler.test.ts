import { afterEach, describe, expect, it, vi } from "vitest";

describe("Typst compiler worker lifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("falls back to the main-thread compiler when module worker construction is blocked", async () => {
    const fallbackCompile = vi.fn(async () => ({
      ok: true as const,
      engine: "mock" as const,
      diagnostics: [],
      output: {
        kind: "svg" as const,
        content: "<svg></svg>"
      }
    }));

    vi.doMock("./typstCompilerMainThread", () => ({
      createMainThreadTypstCompiler: () => ({
        compileDocument: fallbackCompile,
        dispose: vi.fn()
      })
    }));

    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Module workers are blocked");
        }
      }
    );

    const { createTypstCompiler } = await import("./typstCompiler");
    const compiler = createTypstCompiler();
    const result = await compiler.compileDocument("#set page(width: auto)\nHello");

    expect(result.ok).toBe(true);
    expect(fallbackCompile).toHaveBeenCalledTimes(1);
  });
});
