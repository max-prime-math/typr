---
title: Settings
---

# Settings

Open Settings from the gear button in the activity bar. The search field at the top filters the Settings tabs and jumps to the first tab that matches the query. Typr remembers the last open tab and each tab's scroll position.

## Git

Use Git settings for GitHub token validation and Git defaults. Choosing or creating a remote repository happens in Projects. Pull, commit, push, and conflict workflows are managed in Sync.

| Setting | What it changes |
|---|---|
| Fine-grained token | Stores the GitHub token used for repository discovery and remote operations. |
| Connect token | Validates the token and loads the GitHub account, owners, and repositories for the Projects pane. |
| .gitignore | Project .gitignore content used by browser-managed Git repositories. |
| Status ignore patterns | Additional patterns hidden from Typr's Git status display. |
| Default push message | Commit message Typr uses when creating sync commits. |

For a fine-grained GitHub token, use the shortest lifespan that fits your workflow, typically 30 to 90 days. Existing repositories need Contents read/write. Creating repositories from Typr also needs Administration read/write for the target account or organization.

Cloning an existing remote repo is done through the Projects tab and managed through the Sync tab.

## Themes

Use Themes to choose the app palette.

| Setting | What it changes |
|---|---|
| Follow system default | Lets Typr switch between light and dark themes with the operating system. |
| Light themes | Selects a built-in light theme. |
| Dark themes | Selects a built-in dark theme. |
| Imported themes | Selects or removes custom themes that were imported from JSON. |
| Import JSON | Imports a custom theme file with name, mode, and colors. |
| Download template | Downloads a starter JSON file for custom themes. |

## Editor

Use Editor settings for source editing, compile behavior, and browser tooling.

| Setting | What it changes |
|---|---|
| Live compilation | Recompiles the active Typst document automatically while editing. |
| Lint while editing | Shows browser-available diagnostics in the source editor. |
| Format on compile | Runs the selected formatter before compile or Markdown preview. |
| Relative line numbers | Shows line numbers relative to the cursor line. |
| Smooth cursor | Animates the source cursor as it moves. |
| Smear cursor | Adjusts cursor trail intensity when Smooth cursor is enabled. |
| Formatter | Selects Disabled or Built in formatting for Typst, LaTeX, and Markdown. |
| Linter | Selects Disabled or Built in linting for Typst, LaTeX, and Markdown. |

## Keybindings

Use Keybindings to search and change keyboard shortcuts.

| Setting | What it changes |
|---|---|
| Search keybindings | Filters the shortcut list by action or group. |
| Shortcut recorder | Click a shortcut, press the new keys, or press Escape to cancel. |
| Reset action | Restores one modified shortcut to its default. |
| Whack-a-mole | Clears conflicting commands when a shortcut is already assigned. |
| Reset all | Restores every shortcut to the default set. |

Mouse gestures are fixed: insert cursor with Alt/Option-click, rectangular selection with Shift+Alt/Option-drag, and zoom the pane under the pointer with Alt/Option-scroll.

## Snippets

Use Snippets to inspect built-in snippets and manage custom autocomplete snippets.

| Setting | What it changes |
|---|---|
| Language tabs | Switches between Typst, LaTeX, and Markdown snippets. |
| Built in | Shows bundled snippets for the selected language. |
| Custom | Shows imported snippets and lets you remove individual custom snippets. |
| Import JSON | Uploads snippets from a JSON file. |
| Import pasted JSON | Imports snippets from the pasted JSON text area. |
| Download template | Downloads an example JSON file for the selected language. |
| Download current | Downloads current custom snippets for the selected language. |
| Clear custom | Removes all custom snippets for the selected language. |

Accepted imports include a snippets array or a simple object map from prefix to snippet body.

## Packages

Use Packages to manage offline package caches for Typst and LaTeX.

### Typst

| Setting | What it changes |
|---|---|
| Search Universe packages | Finds Typst Universe packages while online. |
| Install | Downloads the selected package so it remains available offline. |
| Refresh | Reloads the local Typst package cache listing. |
| Clear cache | Removes cached Typst packages. |
| Remove | Removes one cached Typst package. |

### LaTeX

| Setting | What it changes |
|---|---|
| Manual download | Searches the local BusyTeX package catalog and caches the bundle containing a package. |
| Used in project | Lists packages detected from LaTeX source files and offers downloads for missing bundles. |
| Manual extra packages | Shows extra packages cached from search and lets you remove them. |
| Refresh | Reloads the local LaTeX bundle cache listing. |
| Clear cache | Removes cached non-default LaTeX bundles. |
| Cache or Remove | Downloads or removes individual TeX Live bundles. |

BusyTeX Basic is loaded by default. Recommended and Extra bundles can be cached for offline LaTeX workflows.
