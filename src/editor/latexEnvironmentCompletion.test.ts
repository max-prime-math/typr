import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  findUnclosedLatexEnvironments,
  latexEnvironmentCompletionSource
} from "./latexEnvironmentCompletion";

describe("findUnclosedLatexEnvironments", () => {
  it("returns unmatched environments with the innermost first", () => {
    const source = [
      "\\begin{document}",
      "\\begin{itemize}",
      "  \\begin{enumerate}",
      "  \\end{enumerate}",
      "\\end"
    ].join("\n");

    expect(findUnclosedLatexEnvironments(source, source.length)).toEqual([
      "itemize",
      "document"
    ]);
  });

  it("does not offer an environment that has a matching end later in the document", () => {
    const marker = "\\end";
    const source = [
      "\\begin{document}",
      "\\begin{itemize}",
      marker,
      "\\end{itemize}",
      "\\end{document}"
    ].join("\n");

    expect(findUnclosedLatexEnvironments(source, source.indexOf(marker) + marker.length)).toEqual([]);
  });

  it("ignores begin and end commands in comments", () => {
    const source = [
      "% \\begin{commented}",
      "\\begin{real} % \\end{real}",
      "escaped \\% \\begin{nested}",
      "\\end"
    ].join("\n");

    expect(findUnclosedLatexEnvironments(source, source.length)).toEqual([
      "nested",
      "real"
    ]);
  });

  it("lists a repeated unmatched environment only once", () => {
    const source = "\\begin{itemize}\n\\begin{itemize}\n\\end";

    expect(findUnclosedLatexEnvironments(source, source.length)).toEqual(["itemize"]);
  });
});

describe("latexEnvironmentCompletionSource", () => {
  it("offers complete end commands after typing \\end", () => {
    const doc = "\\begin{document}\n\\begin{align*}\n\\end";
    const state = EditorState.create({ doc });
    const result = latexEnvironmentCompletionSource(
      new CompletionContext(state, doc.length, false)
    );

    expect(result).not.toBeInstanceOf(Promise);
    expect(result && "options" in result ? result.from : null).toBe(doc.length - 4);
    expect(result && "options" in result
      ? result.options.map((option) => option.label)
      : []).toEqual(["\\end{align*}", "\\end{document}"]);
  });

  it("does not activate for ordinary text or a commented end command", () => {
    for (const doc of ["\\begin{document}\nfriend", "\\begin{document}\n% \\end"]) {
      const state = EditorState.create({ doc });
      expect(latexEnvironmentCompletionSource(
        new CompletionContext(state, doc.length, false)
      )).toBeNull();
    }
  });
});
