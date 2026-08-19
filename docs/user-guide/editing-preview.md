---
title: Editing and Preview
---

# Editing and Preview

Typr provides source editing with live preview for Typst, LaTeX, and Markdown. Source tabs and preview tabs are independent so you can keep multiple files open while previewing the active output.

## Source Editing

The editor supports themes, Vim-compatible editing, line wrap, relative line numbers, snippets, formatting and linting tools where available, configurable keybindings, and an optional mobile quick-key row. See [Keyboard Shortcuts](./keyboard-shortcuts.md) for the default keymap; Settings search can find editor, theme, keybinding, snippet, package, and Git options quickly.

For LaTeX files, **Settings → Editor → Vim-LaTeX enhancements** enables an opt-in language-aware layer over Vim mode. The child settings independently control LaTeX text objects, structural motions and edits, project-aware completion and navigation, diagnostic navigation, folding, and package intelligence. The master switch is off by default; enabling it turns on all child features unless you disable selected ones.

Use source tools for common insertions such as matrices and tables. Typst reference opens the official Typst docs in a new tab.

## Preview

Preview can run inline, side-by-side, in a focused layout, or in a popup. Use the preview controls to zoom, switch paper view where available, and download the rendered output or source-oriented output. Live compilation can be toggled when you want manual control. Build logs and diagnostics show compiler output, and source jumps connect preview diagnostics back to source lines when location data is available.

Typst preview uses the bundled Typst WebAssembly compiler and renderer. LaTeX preview uses the browser LaTeX path included with Typr. Markdown preview is local to the app.

### Experimental TeXpresso live preview

When the local Docker Companion is connected and a LaTeX project has a detectable root `.tex` document, the Preview header offers **Live Preview (Experimental)** alongside **PDF Preview**. Selecting it opens the private `/ws/texpresso` transport and sends the complete current project—including nested text files, binary assets, and the active unsaved buffer—at 192 DPI. Edits then update the raster pages automatically; pressing Compile is not required for the live path.

Live Preview is an interactive aid, not the authoritative compiler. The normal Compile button continues to use Companion `latexmk`/pdfLaTeX when available and BusyTeX otherwise. Switch back to PDF Preview at any time to see the existing authoritative PDF viewer.

Typr keeps the last successfully completed live revision visible while a newer edit is rendering or contains invalid LaTeX. A compact status reports Connecting, Updating, Ready, Error, or Disconnected. If Companion disappears, editing continues and the last raster pages remain visible; Typr creates a fresh session from the complete current project after Companion recovers. The preference is retained, but Typr falls back to the existing PDF preview when no live page has been produced or the current project is unsupported.

Current limitations: the private endpoint is not advertised by Companion status, so its actual WebSocket outcome determines availability; create/delete/rename and binary-asset changes restart the session; all existing text files can update incrementally; included files must use an explicit extension (`\input{chapter.tex}`, not `\input{chapter}`) because the pinned upstream VFS does not reliably update extensionless include aliases; every publishable revision currently rerenders every page because TeXpresso has no dirty-page signal; and live preview has no SyncTeX/source navigation or LSP integration. Raster pages are displayed at their logical 96-DPI CSS size so the 192-DPI pixels improve sharpness rather than doubling the apparent page dimensions.

Markdown uses GitHub-Flavored Markdown (GFM), including tables with column alignment, task lists, strikethrough, autolinks, fenced code blocks, and standard inline formatting. Local workspace images referenced with Markdown image syntax are resolved inside the project; remote HTTP(S) images use a no-referrer request. Raw HTML and unsafe URL schemes remain escaped in the live preview.
