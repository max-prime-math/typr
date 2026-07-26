---
title: Local-First Projects
---

# Local-First Projects

Typr treats the browser as the primary workspace. Normal editing, preview, project switching, package reuse, and browser git operations happen locally in browser-managed storage.

## What Stays Local

Project files, Typr project metadata, managed browser git data, cached packages, editor preferences, and unlock state for optional production sign-in stay in browser storage for the current origin.

Chromium users can additionally link a project to a user-selected local folder. The browser project remains the durable local-first copy; the folder is a live two-way mirror, including compatible `.git` internals after repository initialization. Directory handles and sync baselines are stored per project so access can resume after reload when the browser permission remains granted.

## Explicit Network Actions

Network access is tied to explicit user workflows: GitHub remote operations, package search/download, and opening external references. GitHub tokens are credentials, not project content.

## Data Boundaries

Clearing browser site data can erase local Typr projects. Export project backups before resetting browser data or moving to a new device.
