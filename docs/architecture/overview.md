---
title: Architecture Overview
---

# Architecture Overview

Typr is a React, Vite, and TypeScript application with local-first project state, browser rendering pipelines, visual editors, package caching, and browser-managed git.

## High-Yield Entry Points

| Area | Files |
|---|---|
| App shell and settings | src/app/App.tsx, src/app/appState.ts, src/app/keybindings.ts |
| Editor | src/editor/TypstEditor.tsx, src/editor/codemirrorSetup.ts, src/editor/editorTools.ts |
| Preview | src/preview/PreviewPane.tsx, src/preview/pdfCanvasRenderer.ts, src/preview/typstCanvasRenderer.ts |
| Compilers and packages | src/compiler/ |
| Browser git | src/git/repoBackend.ts, src/git/remoteService.ts, src/git/gitState.ts, src/git/credentials.ts |
| Projects and workspace files | src/project/projectState.ts, src/workspace/workspaceTree.ts, src/workspace/opfsWorkspace.ts |
| Diagrams | src/diagram/SvgEditDiagramEditor.tsx |
| Browser shell | src/terminal/ |

## Application Shape

App.tsx owns the top-level workspace shell, view modes, sidebars, settings sheet, tab management, compiler flow, project operations, and Git interactions. Shared state helpers live in smaller modules so reducers, persistence, and domain operations can be tested independently.
