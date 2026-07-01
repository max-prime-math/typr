---
title: Git Architecture
---

# Git Architecture

Typr's browser git implementation keeps a Git-compatible object model in browser storage and exposes supported operations through the Git pane and browser shell.

## Local Backend

The browser backend writes loose objects, trees, commits, refs, HEAD, config, and a v2 index. It rejects path traversal and .git workspace paths during normal project operations.

## GitHub Remote Service

The remote service calls https://api.github.com directly with bearer tokens. Fetch imports remote commit graphs before updating remote refs. Pull is fetch plus clean-worktree fast-forward checkout. Push uploads required objects before updating the remote branch ref.

## Merge Stops

Diverged pulls persist a merge-stop state with base, local, and remote object ids for changed paths. The Git pane resolves those paths and creates a two-parent commit. Rebase is not implemented in the browser backend.
