---
title: Workspace Tools
---

# Workspace Tools

The sidebar provides tools that work on the current source file without leaving the workspace.

## Source Tools

Open **Tools** to insert structured content such as matrices and tables. The matrix tool lets you choose a size and delimiters. The table tool supports dimensions, alignment, padding, borders, and cell values. Generated syntax follows the active source language where supported.

## Search and Replace

Open **Search** to find text in the active editor. Use **Previous** and **Next** to move through matches, **All** to select matches, and the Match case, Regexp, and By word toggles to refine the search. Enter replacement text to replace the next match or every match.

## Outline and document statistics

Open **Outline** to jump to headings in the active file. Typr recognizes Typst headings such as `= Section`, Markdown headings such as `# Section`, and LaTeX `\section{Title}` headings. The panel also shows document statistics for the current source.

## MiTeX math input

Open **MiTeX** to compose math visually and insert the resulting source at the editor cursor. It is available whenever the current source file accepts text input.

## Debug and diagnostics

Open **Debug** to inspect the active compiler and diagnostic providers, run the Harper grammar-check self-test, and jump directly to reported source locations. Build logs remain available from the workspace when a compile reports messages.
