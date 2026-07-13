---
title: Storage
---

# Storage

Typr uses browser storage for projects, preferences, git data, credentials, cached packages, and migration recovery.

## Project Data

Project snapshots contain visible workspace entries, app metadata, preferences, recent items, diagrams, and trash. Legacy snapshots are retained as recovery data during migration.

## Git Data

Browser-managed Git objects, refs, indexes, HEAD, and config live outside the visible workspace tree. The visible project filesystem cannot list or edit .git internals.

## Credentials

GitHub tokens are stored through src/git/credentials.ts and keyed by managed repo id. Tokens are not embedded in remote URLs, local repo config, terminal output, or diagnostics.

## Cached Assets

Typst and LaTeX package caches are stored separately from source files. Users can refresh or clear caches from Settings.
