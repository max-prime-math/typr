---
title: Browser Git Model
---

# Browser Git Model

Each Typr project owns a working tree plus a separate browser-managed git object database. Visible project files are the working tree. Hidden .git data is stored separately so normal file tools cannot edit repository internals.

## Managed Repositories

A managed repository records the Typr project id, remote configuration, selected backend, and Git UI state. Different Typr projects can have separate branches, refs, indexes, commits, and remotes even when they are open in the same browser origin.

## Remote Strategy

Browser GitHub sync uses GitHub's Git Database REST API for blobs, trees, commits, and refs. It does not use GitHub Contents API as a document sync layer and does not require a CORS proxy.
