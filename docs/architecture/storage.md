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

Google Drive uses a dedicated client-side OAuth callback with the `drive.file` scope. The callback validates the short-lived request state, removes the access token from the URL before the main app starts, and keeps a session-only handoff until the Picker continuation succeeds, is cancelled, or visibly fails. The active token then remains only in memory.

Picker selects a parent destination. IndexedDB stores a version-2 provider-neutral project binding plus Google provider metadata for that selected parent, the schema-v2 Typr-managed child folder, and its exact Drive `webViewLink`. Sync verifies the child’s project marker and parent before reading or writing its tree. Version-1 root-created bindings are not migrated automatically: the user must choose a new destination, and Typr never deletes the old Drive folder.

Cloud bindings are keyed by provider and project. This lets a single project keep simultaneous Google Drive, future Dropbox or OneDrive, local-folder, and GitHub connections without putting provider-specific fields on the project repository model.

## Cached Assets

Typst and LaTeX package caches are stored separately from source files. Users can refresh or clear caches from Settings.
