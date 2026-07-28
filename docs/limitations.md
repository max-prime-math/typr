---
title: Limitations
---

# Limitations

Typr is intentionally browser-first, so some workflows differ from desktop editors and command-line git.

## Browser Storage

Projects are tied to browser site data for the Typr origin. Clearing site data can erase local work unless you exported backups or pushed to a remote.

## Cloud sync

Google Drive sync requires an online connection and a deployment configured with a Google OAuth web client, a restricted Google Picker browser key, a numeric Cloud project number, and the dedicated callback page as an exact authorized redirect URI. The client-side `drive.file` access-token flow does not issue refresh tokens, so background policies run only while the Typr tab is open and authorization remains active. A user action is required to reconnect after reload or token expiry. Typr displays only the Picker-selected parent name and managed child-folder name because `drive.file` does not provide an arbitrary full Drive hierarchy.

## Git

Browser GitHub sync requires an initialized branch when cloning existing repositories. Repositories created from Typr are initialized automatically before the first push. Diverged pulls stop for manual browser merge resolution. Rebase and smart-HTTP git transport are outside the current browser backend.

## Packages

Package search and first-time package downloads require network access. Cached packages remain available offline until removed.

## Preview

Preview behavior depends on browser WebAssembly support and source-language compiler limits. Build logs and diagnostics expose compiler messages, but not every source location can be mapped back perfectly.
