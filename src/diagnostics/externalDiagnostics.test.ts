import { describe, expect, it } from "vitest";
import { DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES, maskLatexMarkupForHarper, runExternalDiagnostics } from "./externalDiagnostics";

describe("maskLatexMarkupForHarper", () => {
  it("masks LaTeX commands and package arguments while preserving prose", () => {
    const source = "\\documentclass{article}\n\\usepackage{url}\n\\maketitle\nThis sentence has teh typo.\n\\url{https://example.com}";
    const masked = maskLatexMarkupForHarper(source);

    expect(masked).toHaveLength(source.length);
    expect(masked).not.toContain("usepackage");
    expect(masked).not.toContain("url");
    expect(masked).not.toContain("maketitle");
    expect(masked).toContain("This sentence has teh typo.");
  });
  it("does not return Harper diagnostics for LaTeX command names", async () => {
    const source = "\\documentclass{article}\n\\usepackage{url}\n\\maketitle\nThis sentence has teh typo.";
    const result = await runExternalDiagnostics({
      source,
      path: "main.tex",
      language: "latex",
      preferences: DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).not.toContain("maketitle");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ line: 4, column: 19 });
  });
  it("does not return Harper diagnostics for Typst citation keys", async () => {
    const source = "Classic systems papers should appear together: @turing1936computable, @church1936unsolvable, and @mccarthy1960recursive.";
    const result = await runExternalDiagnostics({
      source,
      path: "main.typ",
      language: "typst",
      preferences: DEFAULT_EXTERNAL_DIAGNOSTIC_PREFERENCES
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).not.toMatch(/turing|church|mccarthy|space after a comma/i);
  });
});
