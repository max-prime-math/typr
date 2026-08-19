---
title: Settings
---

# Settings

Open Settings from the gear button in the activity bar. The search field at the top filters the Settings tabs and jumps to the first tab that matches the query. Typr remembers the last open tab and each tab's scroll position.

## Sync

Sync settings are scoped to the selected project. Browser-local storage remains authoritative by default. Local-folder sync and an explicitly linked Companion mapped workspace do not replace the browser copy or the project's GitHub remote.

Local folder sync is available in Chromium browsers and can exchange visible project files plus browser-managed Git data with a directory handle. A Companion mapped workspace uses an administrator-configured directory and manual synchronization. It cannot browse or select arbitrary server paths.

## Git

Use Git settings for GitHub token validation and Git defaults. Choosing or creating a remote repository happens in Projects. Pull, commit, push, and conflict workflows are managed in the Git pane.

For a fine-grained GitHub token, use the shortest lifespan that fits your workflow, typically 30 to 90 days. Existing repositories need Contents read/write. Creating repositories from Typr also needs Administration read/write for the target account or organization.

## Themes

Use Themes to choose the app palette or import a custom theme from JSON.

## Editor

Use Editor settings for source editing, compile behavior, line wrapping, formatting, linting, and browser tooling.

Vim mode includes an opt-in **Vim-LaTeX enhancements** suite for LaTeX files. Its text objects, motions, structural editing, semantic completion, project navigation, diagnostic navigation, folding, and package intelligence can each be toggled independently. The suite is off by default so existing Vim mappings and editing behavior remain unchanged until it is enabled.

### Typr Companion

Companion is optional and makes no request in a fresh self-hosted browser
profile. After an administrator installs the separate Companion service, enter
its browser-reachable URL under **Typr Companion** and select **Apply**. The URL
is stored only in that browser. It must not be a Docker service name, and a
hosted or self-hosted HTTPS Typr page cannot call a plain HTTP/WS Companion
because browsers block mixed content.

For cross-device use, give Companion a client-trusted HTTPS endpoint with
WebSocket forwarding, restrict it to a trusted LAN/VPN, and include this Typr
page's exact scheme, host, and port in `TYPR_COMPANION_ALLOWED_ORIGINS`. CORS is
not authentication; neither service may be exposed to the public Internet.

### Settings project and external diagnostics

Enable **Show Settings Project** to create a syncable project containing Typr's settings JSON files. It can use the normal GitHub and local synchronization controls; invalid settings files fall back to their defaults and are reported in Settings.

Typr can run an offline Harper grammar check after its assets are cached. Advanced users can connect a local WebSocket language-server bridge, or a remote WebSocket language server after explicitly enabling document upload. A remote LSP can receive document content, so enable that consent only for an endpoint you trust.

## Keybindings and snippets

Use Keybindings to search and change keyboard shortcuts. Use Snippets to inspect built-in snippets and manage custom autocomplete snippets.

## Packages

Use Packages to manage offline package caches for Typst and LaTeX. BusyTeX Basic is loaded by default. Recommended and Extra bundles can be cached for offline LaTeX workflows. The full self-hosted image bundles the pinned compiler cores and Typr's BusyTeX bundles, not every possible user package or external document asset.
