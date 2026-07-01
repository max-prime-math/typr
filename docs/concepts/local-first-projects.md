---
title: Local-First Projects
---

# Local-First Projects

Typr treats the browser as the primary workspace. Normal editing, preview, project switching, package reuse, and browser git operations happen locally in browser-managed storage.

## What Stays Local

Project files, Typr project metadata, managed browser git data, cached packages, editor preferences, and unlock state for optional production sign-in stay in browser storage for the current origin.

## Explicit Network Actions

Network access is tied to explicit user workflows: GitHub remote operations, package search/download, and opening external references. GitHub tokens are credentials, not project content.

## Data Boundaries

Clearing browser site data can erase local Typr projects. Export project backups before resetting browser data or moving to a new device.
