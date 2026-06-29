# Typr

https://typr.ca/

The GitHub Pages deployment is also available at https://max-prime-math.github.io/typr/.

Typr is a local-first, browser-based writing and preview workspace for Typst, LaTeX, and Markdown on iPad and desktop. It runs as a Progressive Web App, keeps projects on device, and supports live preview, offline reopen, Vim mode, themes, diagrams, graphs, package caching, a browser shell, and repo-backed GitHub sync.

## What It Does

- Runs fully in the browser for the current build.
- Stores each Typr project as its own workspace and browser-managed git repository.
- Supports Typst, LaTeX, and Markdown source editing, preview, package caching, theme switching, and Vim-compatible editing.
- Opens multiple source and preview tabs, including separate active source and preview documents.
- Downloads rendered preview output or source bundles from Preview.
- Bundles local document dependencies when downloading source files, folders, selected files, or preview source bundles, and reports missing referenced files.
- Provides recent project/file switching, settings search, and Git status badges in the file tree.
- Keeps `.git` internals hidden from the workspace tree and Browser Shell.
- Uses local commits before remote push/pull, instead of replacing files through a document sync API.

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

Production builds can enable an optional in-app sign-in layer with
`VITE_TYPR_AUTH_USERS_SHA256`. The GitHub Actions workflow reads this from the
`TYPR_AUTH_USERS_SHA256` repository secret when it is present.

Add one or more entries as `username:sha256(username:password)`, separated by
newlines, commas, or semicolons. Generate an entry with:

```bash
node -e 'const crypto = require("node:crypto"); const [u, p] = process.argv.slice(1); console.log(`${u}:${crypto.createHash("sha256").update(`${u}:${p}`).digest("hex")}`);' username password
```

The production app stores unlock state in `sessionStorage`, so sign-in is not
kept across browser sessions.

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
    keybindings.ts
  auth/
    AuthGate.tsx
  compiler/
    latexCompiler.ts
    latexPackages.ts
    sourceFileTypes.ts
    typstCompiler.ts
    typstPackages.ts
  diagram/
    DiagramEditor.tsx
  editor/
    TypstEditor.tsx
    codemirrorSetup.ts
  graph/
    GraphEditor.tsx
  mitex/
    MitexPanel.tsx
  git/
    repoBackend.ts
    remoteService.ts
    gitState.ts
    credentials.ts
  project/
    projectState.ts
  preview/
    PreviewPane.tsx
    pdfCanvasRenderer.ts
    typstCanvasRenderer.ts
  storage/
    indexedDbStorage.ts
  terminal/
    browserBackend.ts
    projectFilesystemAdapter.ts
  workspace/
    workspaceTree.ts
    opfsWorkspace.ts
```

## Repo-Backed Git Model

Each Typr project owns its working tree, hidden `.git` data, remote config, and selected Git UI state. The project filesystem is the git working tree. Browser-managed `.git` files live in a separate IndexedDB object store keyed by Typr project id, so two projects can have separate branches, refs, indexes, commits, and remotes even when both are open in the app state.

Use the Projects pane to switch Typr projects, reopen recent projects and files, create or import a local project, export a project backup, or clone a GitHub repository as a separate project. Git settings manages the selected project's managed repo entries and GitHub remote connection; changing branches, remotes, tokens, or commit state there does not change another Typr project.

The browser git backend writes Git-compatible loose objects, trees, commits, refs, HEAD, config, and a v2 index. The visible workspace and Browser Shell cannot edit, delete, list, or stage `.git` internals as normal files.

GitHub remotes use the GitHub Git Database REST API for blobs, trees, commits, and refs. Typr does not use the old GitHub Contents API document-sync path and does not depend on a CORS proxy. Tokens are stored only through `src/git/credentials.ts`, persisted in the credentials store, and redacted from UI feedback and command output.

GitHub clone setup lives in Projects. After token connection, Typr lists owners, repositories, and branches, then blocks obvious empty-repository or missing-branch clone attempts with inline guidance.

Supported Browser Shell commands include:

- `git status`
- `git add <path|.>`
- `git reset [path]`
- `git commit -m <message>`
- `git branch`, `git branch -r`
- `git switch <branch>`, `git switch -c <branch>`
- `git log`
- `git remote -v`
- `git fetch`
- `git pull`
- `git push`
- `git sync`
- `git merge --abort`
- `git merge --continue -m <message>`

## Merge And Conflict Limits

Fast-forward pulls are applied to the project working tree. Dirty working trees are blocked before fetch or checkout.

When local and remote history diverge, Browser mode stops before merge. It records a persistent merge-stop state containing the base, local, and remote object ids for every changed path, including conflict classification. It does not auto-resolve by timestamps and does not write conflict markers into project files. The Git pane lets you inspect base/local/remote versions, choose or edit a resolution for each conflict, then create a two-parent merge commit. `git merge --abort` clears that state without changing local files or commits. Rebase and smart-HTTP git transport are outside the current browser backend.

## Data Safety

- Project deletion, trash emptying, and cache clearing are user-triggered actions with explicit UI controls.
- Deleting a Typr project requires typing the project name and removes only local Typr data, browser `.git` data, managed repo entries, and stored tokens for that project. It does not delete a GitHub repository.
- Normal project operations reject path traversal and `.git` paths.
- Remote operations call `https://api.github.com` directly with bearer tokens in request headers.
- Legacy project snapshots are retained as recovery data during migration.

## Tests

```bash
npm run typecheck
npm test
```
