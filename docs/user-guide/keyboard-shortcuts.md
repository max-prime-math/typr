---
title: Keyboard Shortcuts
---

# Keyboard Shortcuts

This page lists Typr's **default** shortcuts. `Mod` means <kbd>Ctrl</kbd> on Windows and Linux, and <kbd>⌘</kbd> on macOS and iPad with a hardware keyboard. `Alt` is <kbd>Option</kbd> on Apple platforms.

Open **Settings → Keybindings** to view, search, change, reset, or resolve conflicts in your current bindings. That Settings page is the source of truth after you customize a shortcut.

## Editing and files

| Action | Default |
|---|---|
| Compile document | <kbd>Mod</kbd>+<kbd>Enter</kbd> |
| Format document | <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> |
| Toggle Vim mode | <kbd>Alt</kbd>+<kbd>V</kbd> |
| Open Search | <kbd>Mod</kbd>+<kbd>F</kbd> |
| New file | <kbd>Alt</kbd>+<kbd>N</kbd> |
| Rename selected file | <kbd>Alt</kbd>+<kbd>R</kbd> |

## Multiple cursors

| Action | Default |
|---|---|
| Insert cursor above | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd> |
| Insert cursor below | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>↓</kbd> |
| Add next matching selection | <kbd>Mod</kbd>+<kbd>D</kbd> |
| Add all matching selections | <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> |
| Add cursors to line ends | <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd> |

## Workspace layout and navigation

| Action | Default |
|---|---|
| Toggle left pane | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>B</kbd> |
| Toggle source pane | <kbd>Alt</kbd>+<kbd>S</kbd> |
| Toggle preview pane | <kbd>Alt</kbd>+<kbd>P</kbd> |
| Toggle Zen mode | <kbd>Alt</kbd>+<kbd>Z</kbd> |
| Reset pane widths | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>0</kbd> |
| Show left pane only | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>1</kbd> |
| Show editor only | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>2</kbd> |
| Show preview only | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>3</kbd> |
| Show split workspace | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>4</kbd> |
| Focus pane left | <kbd>Alt</kbd>+<kbd>H</kbd> |
| Focus pane right | <kbd>Alt</kbd>+<kbd>L</kbd> |
| Previous open tab | <kbd>Alt</kbd>+<kbd>[</kbd> |
| Next open tab | <kbd>Alt</kbd>+<kbd>]</kbd> |
| Previous sidebar tool | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>[</kbd> |
| Next sidebar tool | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>]</kbd> |

## Zoom and preview

| Action | Default |
|---|---|
| Increase focused pane zoom | <kbd>Alt</kbd>+<kbd>=</kbd> |
| Decrease focused pane zoom | <kbd>Alt</kbd>+<kbd>-</kbd> |
| Increase editor font size | <kbd>Mod</kbd>+<kbd>=</kbd> |
| Decrease editor font size | <kbd>Mod</kbd>+<kbd>-</kbd> |
| Reset editor font size | <kbd>Mod</kbd>+<kbd>0</kbd> |
| Increase preview zoom | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>=</kbd> |
| Decrease preview zoom | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>-</kbd> |
| Reset preview zoom | <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>Backspace</kbd> |

When Vim mode is enabled and the preview has focus, these defaults navigate the preview:

| Action | Default |
|---|---|
| Scroll left, down, up, right | <kbd>H</kbd>, <kbd>J</kbd>, <kbd>K</kbd>, <kbd>L</kbd> |
| Next or previous page | <kbd>Shift</kbd>+<kbd>J</kbd>, <kbd>Shift</kbd>+<kbd>K</kbd> |
| Go to top | <kbd>G</kbd> then <kbd>G</kbd> |
| Go to bottom | <kbd>Shift</kbd>+<kbd>G</kbd> |

## Browser Shell

| Action | Default |
|---|---|
| Toggle Browser Shell | <kbd>Ctrl</kbd>+<kbd>'</kbd> on Windows/Linux; <kbd>⌘</kbd>+<kbd>'</kbd> on Apple platforms |
| Run the current command | <kbd>Enter</kbd> |
| Complete a command or workspace path | <kbd>Tab</kbd> |
| Previous or next command history | <kbd>↑</kbd>, <kbd>↓</kbd> |
| Remove focus from the command input | <kbd>Esc</kbd> |

Run `help` in the Browser Shell for the supported command groups: filesystem, text/search, Typst, LaTeX, project helpers, and browser-managed Git. The shell is project-local and does not expose arbitrary host-system commands or visible `.git` internals.
