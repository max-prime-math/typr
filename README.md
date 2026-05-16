# wrytr

`wrytr` is a local-first, browser-based Typst editor for iPad and desktop built as a Progressive Web App. The initial version focuses on a clean editing experience, live preview plumbing, offline installability, and an architecture that is ready for real Typst WebAssembly compilation and future GitHub sync.

## Goals

- Run fully in the browser for the MVP.
- Feel comfortable on iPad Safari and desktop browsers.
- Keep documents local-first with IndexedDB autosave.
- Support live preview, theme switching, and Vim-compatible editing.
- Stay open-source friendly with small, readable modules.

## MVP Status

This scaffold is intentionally conservative:

- The editor, autosave, theme toggle, Vim toggle, and responsive layout are implemented.
- The compiler layer is real code with a stable adapter interface.
- The app now bundles the real `typst.ts` browser compiler and renderer WASM modules.
- A mock preview fallback still exists as a safety net if the WASM bootstrap fails in a target browser.
- The exact integration points for `typst.ts` remain isolated in `src/compiler/typstCompiler.ts`.

## Tech Stack

- Vite
- React
- TypeScript
- CodeMirror 6
- IndexedDB via `idb`
- `vite-plugin-pwa`

## Project Structure

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

## Getting Started

### Requirements

- Node.js 20.19+ or 22.12+.
- npm 10+ recommended.

### Install

```bash
npm install
```

### Start development server

```bash
npm run dev
```

Open the local Vite URL in your browser. On the same network, you can also open it on an iPad if you keep the Vite host accessible.

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## How It Works

### App state

`src/app/appState.ts` defines the project, document, and user preference model. The MVP stores one active document in one local project, but the types already support multiple documents later.

### Editor setup

`src/editor/TypstEditor.tsx` hosts a raw CodeMirror 6 instance inside React. The configuration lives in `src/editor/codemirrorSetup.ts`, including Vim mode support and a placeholder Typst language extension.

### Compiler adapter

`src/compiler/typstCompiler.ts` is the only place that should know whether preview rendering comes from:

- the real in-browser Typst WASM compiler
- a mock fallback used only if WASM bootstrap fails

The main-thread adapter now talks to a dedicated web worker, so Typst initialization and compilation stay off the UI thread. The worker keeps the compiler warm across edits and returns `CompileResult` payloads back to React.

### Preview rendering

`src/preview/PreviewPane.tsx` renders either:

- compiled output
- a placeholder output
- compile diagnostics

### Storage

`src/storage/indexedDbStorage.ts` persists the full app snapshot in IndexedDB and restores it on reload.

### Theme handling

`src/theme/ThemeProvider.tsx` owns the active theme and exposes it through React context. CSS variables in `src/styles/global.css` handle most of the visual system.

### Future GitHub sync

`src/github/githubSync.ts` is a placeholder module for future push/pull operations. The first practical implementation can use the GitHub Contents API plus a personal access token before moving to OAuth or device flow.

## Compiler Notes

Real Typst compilation is wired by default using:

- `@myriaddreamin/typst.ts`
- `@myriaddreamin/typst-ts-web-compiler`
- `@myriaddreamin/typst-ts-renderer`

The compiler wrapper imports the peer-package `.wasm` assets directly, then passes those bundled URLs into the `typst.ts` snippet API.

The remaining compiler work is now narrower:

1. Improve diagnostic mapping from raw thrown errors into line-aware editor diagnostics.
2. Decide how bundled fonts should work for fully deterministic offline rendering.
3. Decide how Typst package imports should be cached and synchronized for local-first projects.
4. Explore incremental compile flows inside the warm worker to reduce repeat compile cost further.

## Known Issues

### Chrome SVG Preview Pixelation

The preview renders with visible pixelation and chunkiness in Chrome, while Firefox renders the same output cleanly. This appears to be a Chrome-specific SVG rendering limitation when scaling vector graphics. The Typst.ts compiler output is correct; the issue is how Chrome's rendering engine handles SVG scaling compared to Firefox. Workaround: use Firefox for sharper preview quality. This will be revisited when investigating performance optimizations or alternative rendering approaches.

## Roadmap

### Near term

- Replace the mock compiler with fully bundled `typst.ts` WASM assets.
- Add multi-document project navigation and export/import.
- Add proper Typst syntax highlighting and richer diagnostics.

### Mid term

- GitHub backup and sync with conflict handling.
- Font management for local/offline Typst rendering.
- Shareable document bundles and installable templates.

### Long term

- Collaboration and merge-aware sync.
- Package-aware Typst project support.
- Better mobile editing ergonomics and keyboard shortcut surfaces.

## Open Source Notes

- License: MIT
- Intended as a contributor-friendly starter for a serious browser Typst editor
- Architecture favors small modules and clear seams over framework-heavy abstractions
