import { describe, expect, it } from "vitest";
import { collectDocumentStats } from "./documentStats";

describe("collectDocumentStats", () => {
  it("counts LaTeX prose while ignoring commands, comments, and math", () => {
    const stats = collectDocumentStats(
      String.raw`\section{Introduction}
This is a short document with \textbf{bold words}. % hidden comment words
The result is \(x + y\), and \cite{key} is ignored.
\begin{equation}
e^{i\pi}+1=0
\end{equation}`,
      "latex"
    );

    expect(stats.words).toBe(15);
    expect(stats.headings).toBe(1);
    expect(stats.equations).toBe(2);
    expect(stats.comments).toBe(1);
    expect(stats.counterLabel).toBe("TeXcount-style");
  });

  it("counts Typst prose with wordometer-style exclusions", () => {
    const stats = collectDocumentStats(
      `= Introduction
This is a short #strong[document] with words.
// hidden comment words
The result is $x + y$ and @ref is ignored.
\`\`\`
code words ignored
\`\`\``,
      "typst"
    );

    expect(stats.words).toBe(14);
    expect(stats.headings).toBe(1);
    expect(stats.equations).toBe(1);
    expect(stats.codeBlocks).toBe(1);
    expect(stats.comments).toBe(1);
    expect(stats.counterLabel).toBe("wordometer-style");
  });

  it("counts Markdown headings and prose", () => {
    const stats = collectDocumentStats(
      `# Heading
Text with [linked words](https://example.com).

\`\`\`
ignored words
\`\`\``,
      "markdown"
    );

    expect(stats.words).toBe(5);
    expect(stats.headings).toBe(1);
    expect(stats.codeBlocks).toBe(1);
  });
});
