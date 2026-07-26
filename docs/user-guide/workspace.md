---
title: Workspace and Projects
---

# Workspace and Projects

Typr opens into the working app, not a landing page. The left sidebar contains project management, file navigation, source tools, Git, and diagrams. The main area can show source, preview, split view, or focused layouts.

## Projects

Each project is its own local workspace. Use the Projects pane to create a local project, import a project backup, clone from GitHub, or create a GitHub repository from the current project. Drag project rows to rearrange the order they appear.

The Clone GitHub repo and Create GitHub repo buttons expand downward into their setup cards. Create GitHub repo includes the repository visibility choice, including Private.

Project names are local Typr labels. Deleting a project removes local Typr data for that project and its managed browser git data. It does not delete a GitHub repository.

### Local folder sync in Chromium

In a Chromium-based browser, each project row has a **Link folder** action. Choose a folder to keep the Typr project and that folder synchronized in both directions:

- Typr edits are written to the folder automatically.
- Files edited, added, renamed, or deleted outside Typr are reflected back in the project.
- If the project has an initialized browser Git repository, its hidden `.git` files are synchronized too.
- On first link, content from both locations is kept. If the same path differs, the chosen folder's version wins that initial conflict.

Chromium may require folder access to be granted again after a browser restart. Use **Reconnect** in the project row when prompted. **Unlink** stops synchronization without deleting files from Typr or from the folder.

The browser uses its filesystem observer when available and otherwise checks the folder at a short interval. Keep the Typr tab open for external changes to flow into the browser project.

## Files

Use the Files pane to create documents and folders, upload files, rename or move workspace entries, open recent files, and manage trash. Typr hides managed .git internals from the file tree and browser shell.

Supported source files include Typst, LaTeX, Markdown, plain text, bibliography files, and common project assets. Diagrams are stored as Typr workspace items and can be edited from the Diagram tool.

## Downloads and Backups

Preview downloads export rendered output. Source downloads and project exports bundle local document dependencies where Typr can identify them. Keep independent backups when moving work between browsers or devices because browser site data is device-local.
