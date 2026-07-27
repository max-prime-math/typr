---
title: Workspace and Projects
---

# Workspace and Projects

Typr opens into the working app, not a landing page. The left sidebar contains project management, file navigation, source tools, Git, and diagrams. The main area can show source, preview, split view, or focused layouts.

## Projects

Each project is its own local workspace. Use the Projects pane to create a local project, import a project backup, or clone from GitHub. Drag project rows to rearrange the order they appear.

Each project appears as a compact card showing its file count, last edit time, and active local-folder and GitHub connections. Select the card to expand its management controls without loading that project's workspace. Choose **Open project** only when you want to switch the editor and preview. Rename and delete also live inside the expanded card. A project can connect to a local folder and GitHub repository at the same time. Creating a GitHub repository includes the visibility choice, including Private.

Git status, history, branches, upstream information, and repository storage measurements are loaded when you open the Git pane instead of during every project switch.

Project names are local Typr labels. Deleting a project removes local Typr data for that project and its managed browser git data. It does not delete a GitHub repository.

### Local folder sync in Chromium

In a Chromium-based browser, use **Open local folder** to turn an existing folder—including an existing Git checkout—into a linked Typr project in one step. To connect a project that is already in Typr, including one cloned through the GitHub flow, use **Link local folder** in that project's row.

The chosen folder and Typr project synchronize in both directions. Open **Settings → Sync** to choose a policy for the selected linked project:

- **Constant sync** watches Typr and the folder for changes in real time.
- **Sync on compile** synchronizes when you explicitly request a compile.
- **Scheduled sync** synchronizes every configured number of minutes.
- **Manual sync** synchronizes only when you choose **Sync now**.

During a sync, Typr edits are written to the folder, and files edited, added, renamed, or deleted outside Typr are reflected back in the project.
- If the project has an initialized browser Git repository, its hidden `.git` files are synchronized too.
- On first link, content from both locations is kept. If the same path differs, the chosen folder's version wins that initial conflict.

Chromium may require folder access to be granted again after a browser restart. Use **Reconnect** in the project row when prompted. **Unlink** stops synchronization without deleting files from Typr or from the folder.

Constant mode uses the browser's filesystem observer when available and otherwise checks the folder at a short interval. Keep the Typr tab open for constant or scheduled sync to run.

## Files

Use the Files pane to create documents and folders, upload files, rename or move workspace entries, open recent files, and manage trash. Typr hides managed .git internals from the file tree and browser shell.

Supported source files include Typst, LaTeX, Markdown, plain text, bibliography files, and common project assets. Diagrams are stored as Typr workspace items and can be edited from the Diagram tool.

## Downloads and Backups

Preview downloads export rendered output. Source downloads and project exports bundle local document dependencies where Typr can identify them. Keep independent backups when moving work between browsers or devices because browser site data is device-local.
