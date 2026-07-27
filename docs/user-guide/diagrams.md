---
title: Diagrams
---

# Diagrams

Typr includes a visual diagram tool so supporting figures can live beside source files in the same browser project.

The diagram editor supports canvas-based shapes, strokes, assets, and reusable diagram documents. Use it for quick figures that should stay editable in the project rather than being pasted as final images.

The **TikZ** tab embeds a visual TikZ editor. Each figure keeps its canonical
`.tikz` source and generated SVG in the project's `figures` directory.

## Inserting TikZ Figures

The available insertion formats depend on the active source file:

- LaTeX can insert editable TikZ with `\input` or a rendered PDF. Typr adds the
  required `tikz` or `graphicx` package if it is not already loaded.
- Markdown inserts the generated SVG.
- Typst offers automatic verified CeTZ, explicit editable CeTZ, or SVG.

Automatic CeTZ uses Tylax, compiles the generated code with Typr's real Typst
compiler, and compares its rendering with the TikZ editor's SVG. Typr uses the
SVG fallback if Tylax reports unsupported commands, CeTZ does not compile, or
the renderings differ too much.

**Editable CeTZ** permits diagnostic or visual-difference warnings, but still
requires a structurally supported conversion that compiles. Generated code is
stored as a managed `.cetz.typ` companion file and included from the document.

## Project Storage

Diagram data is part of the Typr project snapshot. Export project backups when you need to move editable visual assets to another browser or device.
