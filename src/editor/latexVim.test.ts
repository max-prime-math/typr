import { EditorState, type ChangeSpec } from "@codemirror/state";
import { latexLanguage } from "codemirror-lang-latex";
import { describe, expect, it } from "vitest";
import {
  findVimLatexMotionTarget,
  findVimLatexReference,
  findVimLatexTextObject,
  getVimLatexStructuralChanges,
  type VimLatexStructuralKind
} from "./latexVim";

function state(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [latexLanguage] });
}

function plainState(doc: string): EditorState {
  return EditorState.create({ doc });
}

function selected(doc: string, marker: string, kind: Parameters<typeof findVimLatexTextObject>[2], inner: boolean) {
  const editorState = state(doc);
  const position = doc.indexOf(marker);
  const range = findVimLatexTextObject(editorState, position, kind, inner);
  return range ? doc.slice(range.from, range.to) : null;
}

function applyChanges(doc: string, changes: readonly ChangeSpec[]): string {
  return state(doc).update({ changes }).state.doc.toString();
}

describe("Vim LaTeX text objects", () => {
  it("selects command arguments and complete commands", () => {
    const doc = "Before \\textbf{bold words} after";
    expect(selected(doc, "bold", "command", true)).toBe("bold words");
    expect(selected(doc, "bold", "command", false)).toBe("\\textbf{bold words}");
  });

  it("uses the outer command's direct argument when its name is selected", () => {
    const doc = "Before \\foo{\\bar{x}} after";
    expect(selected(doc, "foo", "command", true)).toBe("\\bar{x}");
  });

  it("selects nested environment content and surroundings", () => {
    const doc = [
      "\\begin{itemize}",
      "\\item outer",
      "\\begin{equation}",
      "x=y",
      "\\end{equation}",
      "\\end{itemize}"
    ].join("\n");
    expect(selected(doc, "x=y", "environment", true)).toBe("\nx=y\n");
    expect(selected(doc, "x=y", "environment", false)).toBe(
      "\\begin{equation}\nx=y\n\\end{equation}"
    );
  });

  it("handles inline and display math delimiters", () => {
    const inline = "Before $x+y$ after";
    const display = "Before $$x+y$$ after";
    const bracket = "Before \\[x+y\\] after";
    expect(selected(inline, "x+y", "math", true)).toBe("x+y");
    expect(selected(inline, "x+y", "math", false)).toBe("$x+y$");
    expect(selected(display, "x+y", "math", true)).toBe("x+y");
    expect(selected(display, "x+y", "math", false)).toBe("$$x+y$$");
    expect(selected(bracket, "x+y", "math", true)).toBe("x+y");
  });

  it("selects section bodies and individual list items", () => {
    const sections = "\\section{One}\nAlpha\n\\subsection{Two}\nBeta\n\\section{Three}\nGamma";
    expect(selected(sections, "Alpha", "section", true)).toContain("Alpha");
    expect(selected(sections, "Alpha", "section", false)).toContain("\\section{One}");

    const items = "\\begin{itemize}\n\\item One\ncontinued\n\\item Two\n\\end{itemize}";
    expect(selected(items, "continued", "item", true)).toBe("One\ncontinued\n");
    expect(selected(items, "continued", "item", false)).toBe("\\item One\ncontinued\n");
  });

  it("keeps a nested list inside its containing outer item", () => {
    const doc = [
      "\\begin{itemize}",
      "\\item Outer",
      "\\begin{itemize}",
      "\\item Inner",
      "\\end{itemize}",
      "outer tail",
      "\\item Next",
      "\\end{itemize}"
    ].join("\n");
    expect(selected(doc, "Outer", "item", true)).toBe([
      "Outer",
      "\\begin{itemize}",
      "\\item Inner",
      "\\end{itemize}",
      "outer tail",
      ""
    ].join("\n"));
    expect(selected(doc, "Outer", "item", false)).toContain("\\item Inner");
  });

  it("falls back to balanced source scanning when no syntax tree is active", () => {
    const doc = "\\begin{outer}a \\begin{inner}$x$\\end{inner} b\\end{outer}";
    const editorState = plainState(doc);
    const position = doc.indexOf("x");
    const environment = findVimLatexTextObject(editorState, position, "environment", true);
    const math = findVimLatexTextObject(editorState, position, "math", true);
    expect(environment && doc.slice(environment.from, environment.to)).toBe("$x$");
    expect(math && doc.slice(math.from, math.to)).toBe("x");
  });
});

describe("Vim LaTeX structural motions", () => {
  it("moves by sections with counts", () => {
    const doc = "\\section{A}\na\n\\subsection{B}\nb\n\\section{C}\nc";
    const editorState = state(doc);
    const start = doc.indexOf("a\n");
    expect(findVimLatexMotionTarget(editorState, start, "section", 1, 1)).toBe(
      doc.indexOf("\\subsection")
    );
    expect(findVimLatexMotionTarget(editorState, start, "section", 1, 2)).toBe(
      doc.indexOf("\\section{C}")
    );
  });

  it("moves to environment and math starts", () => {
    const doc = "top\n\\begin{align}a&=b\\end{align}\ntext $x$ then \\[y\\]";
    const editorState = state(doc);
    expect(findVimLatexMotionTarget(editorState, 0, "environment", 1)).toBe(doc.indexOf("\\begin"));
    expect(findVimLatexMotionTarget(editorState, 0, "math", 1)).toBe(doc.indexOf("$x$"));
    expect(findVimLatexMotionTarget(editorState, doc.length, "math", -1)).toBe(doc.indexOf("\\[y"));
  });

  it("does not treat closing dollar delimiters as math motion targets", () => {
    const doc = "$x$ text $$y$$ then $z$";
    const editorState = state(doc);
    expect(findVimLatexMotionTarget(editorState, doc.indexOf("x"), "math", 1)).toBe(
      doc.indexOf("$$y$$")
    );
    expect(findVimLatexMotionTarget(editorState, doc.indexOf("then"), "math", -1)).toBe(
      doc.indexOf("$$y$$")
    );
  });
});

describe("Vim LaTeX structural transformations", () => {
  function transformed(doc: string, marker: string, kind: VimLatexStructuralKind, operation: "delete" | "toggle") {
    const editorState = state(doc);
    const changes = getVimLatexStructuralChanges(editorState, doc.indexOf(marker), kind, operation);
    return applyChanges(doc, changes);
  }

  it("removes command, environment, and math surroundings", () => {
    expect(transformed("A \\textbf{bold} B", "bold", "command", "delete")).toBe("A bold B");
    expect(transformed("A \\begin{center}x\\end{center} B", "x", "environment", "delete")).toBe("A x B");
    expect(transformed("A $x$ B", "x", "math", "delete")).toBe("A x B");
  });

  it("toggles command stars, environment stars, and math display style", () => {
    expect(transformed("\\section{A}", "section", "command", "toggle")).toBe("\\section*{A}");
    expect(transformed("\\begin{equation}x\\end{equation}", "x", "environment", "toggle")).toBe(
      "\\begin{equation*}x\\end{equation*}"
    );
    expect(transformed("A $x$ B", "x", "math", "toggle")).toBe("A $$x$$ B");
  });

  it("toggles only the selected outer environment in nested environments", () => {
    const doc = "\\begin{figure}a\\begin{center}x\\end{center}b\\end{figure}";
    expect(transformed(doc, "a", "environment", "toggle")).toBe(
      "\\begin{figure*}a\\begin{center}x\\end{center}b\\end{figure*}"
    );
  });

  it("removes an outer command without dropping a nested command", () => {
    const doc = "Before \\foo{\\bar{x}} after";
    expect(transformed(doc, "foo", "command", "delete")).toBe("Before \\bar{x} after");
  });
});

describe("Vim LaTeX file references", () => {
  it("resolves braced and bare include paths", () => {
    const braced = "See \\input{chapters/intro.tex}.";
    const bare = "See \\includegraphics[width=2cm] figures/plot.pdf next";
    expect(findVimLatexReference(state(braced), braced.indexOf("intro"))).toBe("chapters/intro.tex");
    expect(findVimLatexReference(plainState(bare), bare.indexOf("plot"))).toBe("figures/plot.pdf");
  });

  it("selects the bibliography file under the cursor from a comma-separated list", () => {
    const doc = "\\bibliography{primary, references}";
    expect(findVimLatexReference(state(doc), doc.indexOf("references"))).toBe("references");
  });
});
