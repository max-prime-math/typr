# Typr

https://max-prime-math.github.io/typr/

Typr is a local-first, browser-based Typst editor for iPad and desktop. It runs as a Progressive Web App, keeps documents on device, and supports live preview, offline reopen, Vim mode, themes, and GitHub push when you are back online.  Features a diagram editor as well as a graph editor.  

## What It Does

- Runs fully in the browser for the MVP.
- Keeps documents local-first with IndexedDB autosave.
- Supports live preview, theme switching, and Vim-compatible editing.
- Caches core Typst assets for offline preview after install.
- Falls back to a mock preview if WASM bootstrapping fails in a target browser.

## Current Status

Typr is still a focused MVP, but the core pieces are in place:

- The editor, autosave, theme toggle, Vim toggle, and responsive layout are implemented.
- The compiler layer uses a stable adapter interface.
- The app bundles the real `typst.ts` browser compiler and renderer WASM modules.
- GitHub push is available from the app UI when the device is online.
- The `typst.ts` integration remains isolated in `src/compiler/typstCompiler.ts`.

## Getting Started

### Requirements

- Node.js 20.19+ or 22.12+.
- npm 10+ recommended.

### Install dependencies

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

Open the local Vite URL in your browser. If the host is reachable on your network, you can also open it on an iPad.

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## Repository Layout

```text
src/
  app/
    App.tsx
    appState.ts
  compiler/
    mockCompiler.ts
    typstCompiler.ts
  editor/
    TypstEditor.tsx
    codemirrorSetup.ts
    typstLanguage.ts
  github/
    githubSync.ts
  preview/
    PreviewPane.tsx
  storage/
    indexedDbStorage.ts
  styles/
    global.css
  theme/
    ThemeProvider.tsx
    themes.ts
  main.tsx
```

## How It Works

- `src/app/appState.ts` defines the project, document, and preference model.
- `src/editor/TypstEditor.tsx` hosts the CodeMirror 6 editor inside React.
- `src/compiler/typstCompiler.ts` owns the compiler adapter and worker lifecycle.
- `src/preview/PreviewPane.tsx` renders compiled output, diagnostics, and fallback states.
- `src/storage/indexedDbStorage.ts` persists and restores the full app snapshot in IndexedDB.
- `src/theme/ThemeProvider.tsx` manages the active theme, with CSS variables in `src/styles/global.css` handling most of the visual system.
- `src/github/githubSync.ts` implements GitHub Contents API push support with locally stored connection settings.

## Compiler Notes

Real Typst compilation is wired by default using:

- `@myriaddreamin/typst.ts`
- `@myriaddreamin/typst-ts-web-compiler`
- `@myriaddreamin/typst-ts-renderer`

The compiler wrapper loads the peer-package `.wasm` assets directly and passes those bundled URLs into the `typst.ts` API.

The next compiler-focused improvements are:

1. Better diagnostic mapping from thrown errors into line-aware editor diagnostics.
2. More predictable caching for Typst package imports in local-first projects.
3. Incremental compile flows inside the warm worker to reduce repeated compile cost.
4. Stronger GitHub auth plus pull and conflict handling.

## Roadmap

- Add multi-document project navigation and export/import.
- Add richer Typst syntax highlighting and diagnostics.
- Add pull/conflict handling for GitHub sync.
- Improve font management for offline Typst rendering.
- Add shareable bundles and installable templates.
- Improve mobile editing ergonomics and keyboard shortcuts.
- LaTeX to Typst converter
- Native Typst graphs
- Live compilation (non-experimental)
- PDF Markup
- "Live View" for presenting slides and marking up like a whiteboard.
- Native iPad app

## Open Source Notes

- License: GPL
- Contributor-friendly structure with small, readable modules
- Clear seams between editor, compiler, preview, and sync layers
