---
title: Introduction
slug: /
sidebar_position: 1
---

# Typr Documentation

Typr is a local-first browser workspace for writing, previewing, and syncing Typst, LaTeX, and Markdown projects. It runs as a Progressive Web App, keeps project files on device, and supports live preview, diagrams, package caching, a browser shell, and GitHub-backed browser git.

The README is the project front door. These docs hold workflow details, concepts, architecture notes, roadmap, and current limits.

## Start Here

Use the user guide pages for day-to-day workflows. Use concepts and architecture pages when changing code or making product decisions.

| Goal | Page |
|---|---|
| Create, import, export, and switch projects | [Workspace and Projects](./user-guide/workspace.md) |
| Edit source and use live preview | [Editing and Preview](./user-guide/editing-preview.md) |
| Draw diagrams | [Diagrams](./user-guide/diagrams.md) |
| Connect a GitHub remote | [GitHub Sync](./user-guide/git-sync.md) |
| Change app, editor, Git, snippet, and package settings | [Settings](./user-guide/settings.md) |
| Cache packages or use the browser shell | [Packages and Browser Shell](./user-guide/packages-shell.md) |
| Understand local storage boundaries | [Local-First Projects](./concepts/local-first-projects.md) and [Storage](./architecture/storage.md) |
| Work on implementation | [Architecture Overview](./architecture/overview.md) |

## Documentation Principles

- Keep the README short and project-level.
- Put user workflows in user-guide pages.
- Put product and data-model explanations in concepts.
- Put file-level implementation details in architecture.
- Keep current limitations explicit so users know which workflows are browser-only.

## Current Focus Areas

- Browser-managed git repositories per Typr project.
- GitHub sync without a CORS proxy or Contents API document-sync path.
- Offline reopen and package caching for Typst and LaTeX workflows.
- Productive editing on both iPad and desktop.
