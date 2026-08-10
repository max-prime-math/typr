---
title: Workspace and Projects
---

# Workspace and Projects

Typr opens into the working app, not a landing page. The left sidebar contains project management, file navigation, source tools, Git, and diagrams. The main area can show source, preview, split view, or focused layouts.

## Projects

Each project is its own browser-local workspace. Use the Projects pane to create a local project, import a project backup, or clone from GitHub. Drag project rows to rearrange the order they appear.

Each project appears as a compact card showing its file count, last edit time, and active local-folder or GitHub connections. Select the main card to open that project's workspace. Use the arrow button at the right to expand management controls without opening the project. Rename and delete live inside the expanded card. Creating a GitHub repository includes the visibility choice, including Private.

Git status, history, branches, upstream information, and repository storage measurements are loaded when you open the Git pane instead of during every project switch.

Project names are local Typr labels. Deleting a project removes local Typr data for that project and its managed browser git data. It does not delete a GitHub repository or files in an explicitly linked folder or Companion workspace.

### Companion mapped workspace

When the self-hosted administrator maps a workspace into Typr Companion, use **Settings → Sync** to link the selected project and run a manual synchronization. Browser storage remains the primary local copy. Linking and unlinking never selects arbitrary server paths, and unlinking does not delete the mapped files.

### Local folder sync in Chromium

In a Chromium-based browser, use **Open local folder** to turn an existing folder—including an existing Git checkout—into a linked Typr project in one step. To connect a project that is already in Typr, including one cloned through the GitHub flow, use **Link local folder** in that project's row.

The chosen folder and Typr project synchronize in both directions. Open **Settings → Sync** to choose constant, compile, scheduled, or manual synchronization. On first link, content from both locations is kept; if the same path differs, the chosen folder's version wins that initial conflict.

Chromium may require folder access to be granted again after a browser restart. Use **Reconnect** in the project row when prompted. **Unlink** stops synchronization without deleting files from Typr or from the folder.

## Files

Use the Files pane to create documents and folders, upload files, rename or move workspace entries, open recent files, and manage trash. Use the upload button or drag files or folders from your computer over the Files pane; dropped folders retain their nested files and empty directories. Typr hides managed .git internals from the file tree and browser shell.

Select multiple entries with `Ctrl`/`Cmd` or `Shift`, then drag any selected entry onto a folder to move the selection together. To rename multiple files, select at least two files, right-click one of them, and choose **Batch rename**.

## Downloads and Backups

Preview downloads export rendered output. Source downloads and project exports bundle local document dependencies where Typr can identify them. Keep independent backups when moving work between browsers or devices because browser site data is device-local.

## App installation and updates

Typr is a Progressive Web App. Install it from your browser when offered for a more app-like desktop or tablet experience. Secure-context browser features require HTTPS except on localhost; plain HTTP on another LAN host has reduced PWA and local-folder support.
