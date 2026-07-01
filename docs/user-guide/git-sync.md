---
title: GitHub Sync
---

# GitHub Sync

Typr can connect a browser-managed project to GitHub without sending tokens through a third-party proxy. Git setup lives in Settings and project clone/create flows live in Projects.

## Connect a Project

1. Open Settings, then Git.
2. Paste and connect a fine-grained GitHub token. Existing repositories need Contents read/write; creating repositories also needs Administration read/write.
3. Open Projects, then use Clone GitHub repo to choose an existing repository or Create GitHub repo to create and push the current project.
4. Use Sync for status, pull, commit, push, and conflict resolution.

Tokens are stored separately from repository config and are redacted from UI feedback, terminal output, and diagnostics. The Projects pane uses the connected token to show your GitHub username, owners, repositories, and branch choices.

## Common Operations

The Git pane and browser shell support status, add, reset, commit, branch, switch, log, remote, fetch, pull, push, sync, and merge continuation or abort commands. Typr makes local commits before remote push/pull instead of replacing files through a document-sync API.

## Conflicts

Fast-forward pulls update the working tree when it is clean. Diverged histories stop in a browser merge state. Use the Git pane to compare base, local, and remote versions, choose or edit resolutions, and create a two-parent merge commit.
