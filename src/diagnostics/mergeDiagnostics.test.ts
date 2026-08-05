import { describe, expect, it } from "vitest";
import { mergeEditorDiagnostics } from "./mergeDiagnostics";

describe("mergeEditorDiagnostics", () => {
  it("prefers an LSP diagnostic over an identical compiler diagnostic", () => {
    const diagnostics = mergeEditorDiagnostics(
      [],
      [{
        severity: "error",
        path: "main.typ",
        line: 1,
        column: 5,
        message: "typst: unknown variable: th",
        provenance: { kind: "lsp", label: "Local WebSocket LSP", source: "typst" }
      }],
      [{
        severity: "error",
        path: "main.typ",
        line: 1,
        column: 5,
        message: "unknown variable: th"
      }]
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].provenance).toEqual({
      kind: "lsp",
      label: "Local WebSocket LSP",
      source: "typst"
    });
  });

  it("retains compiler diagnostics that differ in source location or message", () => {
    const diagnostics = mergeEditorDiagnostics(
      [],
      [{
        severity: "error",
        path: "main.typ",
        line: 1,
        column: 5,
        message: "typst: unknown variable: th",
        provenance: { kind: "lsp", label: "Local WebSocket LSP", source: "typst" }
      }],
      [{
        severity: "error",
        path: "main.typ",
        line: 2,
        column: 5,
        message: "unknown variable: th"
      }]
    );

    expect(diagnostics).toHaveLength(2);
  });
});
