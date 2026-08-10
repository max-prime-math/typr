---
title: Packages and Browser Shell
---

# Packages and Browser Shell

Typr includes package caching and a browser shell for project-local workflows.

## Typst Packages

Typst Universe packages can be searched and cached from Settings while online. Cached packages remain available offline until removed.

## LaTeX Packages

LaTeX package support uses the BusyTeX catalog and TeX Live bundle caching. Basic packages are loaded by default, while Recommended and Extra bundles can be cached as needed.

The self-hosted full image includes Typr's pinned compiler cores and BusyTeX
bundles, but it is not a promise that every document package or external asset
is already cached. First use of uncached content can still require the network.

## Browser Shell

The browser shell exposes supported project commands without access to hidden .git internals. It is designed for local project operations and browser-managed git commands, not arbitrary host system access. Toggle it with <kbd>Ctrl</kbd>+<kbd>'</kbd> on Windows/Linux or <kbd>⌘</kbd>+<kbd>'</kbd> on Apple platforms. See [Keyboard Shortcuts](./keyboard-shortcuts.md) for input controls and the default app keymap; run `help` in the shell for the current supported commands.
