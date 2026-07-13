import { describe, expect, it } from "vitest";
import type { CompileResult } from "../compiler/types";
import { resolveCompileResultCompletion } from "./compileResultReuse";

function createSvgResult({
  content = "<svg><text>Same</text></svg>",
  durationMs,
  diagnostics = []
}: {
  content?: string;
  durationMs: number;
  diagnostics?: Extract<CompileResult, { ok: true }>["diagnostics"];
}): Extract<CompileResult, { ok: true }> {
  return {
    ok: true,
    engine: "typst-ts",
    diagnostics,
    output: {
      kind: "svg",
      content
    },
    metadata: {
      timings: [{ label: "Typst compile", durationMs }]
    }
  };
}

describe("compile result reuse", () => {
  it("keeps preview identity while recording current timing as build metadata", () => {
    const current = createSvgResult({ durationMs: 12 });
    const completed = createSvgResult({ durationMs: 47 });

    const resolution = resolveCompileResultCompletion(current, completed);

    expect(resolution.previewResult).toBe(current);
    expect(resolution.diagnosticResult).toBe(current);
    expect(resolution.outputChanged).toBe(false);
    expect(resolution.buildLog.metadata).toBe(completed.metadata);
    expect(resolution.buildLog.metadata?.timings).toEqual([
      { label: "Typst compile", durationMs: 47 }
    ]);
  });

  it("updates diagnostics without replacing identical render output", () => {
    const current = createSvgResult({ durationMs: 12 });
    const completed = createSvgResult({
      durationMs: 47,
      diagnostics: [
        {
          message: "Unused label",
          severity: "warning",
          path: "main.typ"
        }
      ]
    });

    const resolution = resolveCompileResultCompletion(current, completed);

    expect(resolution.previewResult).toBe(current);
    expect(resolution.diagnosticResult).not.toBe(current);
    expect(resolution.diagnosticResult.ok && resolution.diagnosticResult.output).toBe(
      current.output
    );
    expect(resolution.diagnosticResult.ok && resolution.diagnosticResult.diagnostics).toEqual(
      completed.diagnostics
    );
    expect(resolution.buildLog.diagnostics).toBe(completed.diagnostics);
  });

  it("does not reuse preview identity when rendered SVG content changes", () => {
    const current = createSvgResult({ durationMs: 12 });
    const completed = createSvgResult({
      content: "<svg><text>Changed</text></svg>",
      durationMs: 47
    });

    const resolution = resolveCompileResultCompletion(current, completed);

    expect(resolution.previewResult).toBe(completed);
    expect(resolution.diagnosticResult).toBe(completed);
    expect(resolution.outputChanged).toBe(true);
  });

  it("reuses identical PDF bytes but detects changed PDF bytes", () => {
    const current: Extract<CompileResult, { ok: true }> = {
      ok: true,
      engine: "busytex",
      diagnostics: [],
      output: {
        kind: "pdf",
        content: "first log",
        artifactData: new Uint8Array([1, 2, 3])
      },
      metadata: {
        timings: [{ label: "BusyTeX execution", durationMs: 20 }]
      }
    };
    const identical: Extract<CompileResult, { ok: true }> = {
      ...current,
      output: {
        kind: "pdf",
        content: "second log",
        artifactData: new Uint8Array([1, 2, 3])
      },
      metadata: {
        timings: [{ label: "BusyTeX execution", durationMs: 35 }]
      }
    };
    const changed: Extract<CompileResult, { ok: true }> = {
      ...identical,
      output: {
        ...identical.output,
        artifactData: new Uint8Array([1, 2, 4])
      }
    };

    const identicalResolution = resolveCompileResultCompletion(current, identical);
    const changedResolution = resolveCompileResultCompletion(current, changed);

    expect(identicalResolution.previewResult).toBe(current);
    expect(identicalResolution.outputChanged).toBe(false);
    expect(changedResolution.previewResult).toBe(changed);
    expect(changedResolution.outputChanged).toBe(true);
  });
});
