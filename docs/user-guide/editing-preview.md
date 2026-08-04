---
title: Editing and Preview
---

# Editing and Preview

Typr provides source editing with live preview for Typst, LaTeX, and Markdown. Source tabs and preview tabs are independent so you can keep multiple files open while previewing the active output.

## Source Editing

The editor supports themes, Vim-compatible editing, relative line numbers, snippets, formatting and linting tools where available, configurable keybindings, and an optional mobile quick-key row. Settings search can find editor, theme, keybinding, snippet, package, and Git options quickly.

Use source tools for common insertions such as matrices and tables. Typst reference opens the official Typst docs in a new tab.

## Preview

Preview can run inline, side-by-side, in a focused layout, or in a popup. Use the preview controls to zoom, switch paper view where available, and download the rendered output or source-oriented output. Live compilation can be toggled when you want manual control. Build logs and diagnostics show compiler output, and source jumps connect preview diagnostics back to source lines when location data is available.

Typst preview uses the bundled Typst WebAssembly compiler and renderer. LaTeX preview uses the browser LaTeX path included with Typr. Markdown preview is local to the app.

Markdown uses GitHub-Flavored Markdown (GFM), including tables with column alignment, task lists, strikethrough, autolinks, fenced code blocks, and standard inline formatting. Local workspace images referenced with Markdown image syntax are resolved inside the project; remote HTTP(S) images use a no-referrer request. Raw HTML and unsafe URL schemes remain escaped in the live preview.
