# Typr

Typr is a local-first, browser-based writing and preview workspace for Typst, LaTeX, and Markdown on iPad and desktop. It runs as a Progressive Web App, keeps projects on device, and supports live preview, offline reopen, Vim mode, themes, diagrams, package caching, a browser shell, and repo-backed GitHub sync.

Live app: <https://typr.ca/>

GitHub Pages deployment: <https://max-prime-math.github.io/typr/>

## Documentation

The detailed documentation lives in [docs/](docs/index.md). The app renders these Markdown files from the `?` button above Settings.

## Quick Start

Requirements:

- Node.js 20.19+ or 22.12+.
- npm 10+ recommended.

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

Build and preview production output:

```bash
npm run build
npm run preview
```

Run checks:

```bash
npm run typecheck
npm test
```

## Project Notes

Typr is a React + Vite + TypeScript application. The app shell lives in [src/app/App.tsx](src/app/App.tsx), shared app state in [src/app/appState.ts](src/app/appState.ts), compiler integrations in [src/compiler/](src/compiler/), preview rendering in [src/preview/](src/preview/), browser git in [src/git/](src/git/), and workspace/project storage in [src/workspace/](src/workspace/) and [src/project/](src/project/).

Production builds can enable an optional in-app sign-in layer with `VITE_TYPR_AUTH_USERS_SHA256`. See [Architecture Overview](docs/architecture/overview.md) and the source in [src/auth/AuthGate.tsx](src/auth/AuthGate.tsx) for implementation context.

## License

See [LICENSE](LICENSE).
