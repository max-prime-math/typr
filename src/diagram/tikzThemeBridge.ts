import type { ThemeDefinition, ThemePalette } from "../theme/themes";

const TIKZ_THEME_STYLE_ID = "typr-tikz-theme";

const TIKZ_THEME_OVERRIDES = `
html,
body,
#root {
  color: var(--text) !important;
  background: var(--bg-app) !important;
}

.cm-editor {
  color: var(--typr-editor-foreground) !important;
  background: var(--typr-editor-background) !important;
}

.cm-gutters {
  color: var(--typr-editor-gutter-foreground) !important;
  background: var(--typr-editor-gutter) !important;
  border-right-color: var(--border) !important;
}

.cm-activeLine,
.cm-activeLineGutter {
  background: var(--typr-editor-active-line) !important;
}

.cm-selectionBackground,
.cm-focused .cm-selectionBackground {
  background: var(--typr-editor-selection) !important;
}

.cm-cursor {
  border-left-color: var(--typr-editor-foreground) !important;
}

.cm-content {
  caret-color: var(--typr-editor-foreground) !important;
}

.cm-tooltip,
.cm-panels {
  color: var(--text) !important;
  background: var(--bg-pane) !important;
  border-color: var(--border) !important;
}

.cm-tooltip-autocomplete > ul > li[aria-selected] {
  color: var(--text) !important;
  background: var(--accent-btn-bg) !important;
}
`;

export function getTikzEditorThemeVariables(
  palette: ThemePalette
): Record<string, string> {
  return {
    "--bg-pane": palette.surfaceStrong,
    "--bg-app": palette.background,
    "--bg-header": palette.surfaceMuted,
    "--bg-canvas-panel": palette.surface,
    "--bg-canvas-area": palette.backgroundWash,
    "--bg-diagnostics": palette.surface,
    "--border": palette.border,
    "--border-light": palette.border,
    "--border-lighter": palette.border,
    "--text": palette.text,
    "--text-muted": palette.textMuted,
    "--text-faint": palette.editorGutterForeground,
    "--text-dim": palette.editorGutterForeground,
    "--btn-hover-bg": palette.accentSoft,
    "--btn-active-bg": palette.surfaceMuted,
    "--btn-disabled-bg": palette.surfaceMuted,
    "--btn-disabled-text": palette.textMuted,
    "--toggle-active-bg": palette.accentSoft,
    "--toggle-mixed-bg": palette.surfaceMuted,
    "--accent": palette.accent,
    "--accent-dark": palette.accentStrong,
    "--accent-btn-bg": palette.accentSoft,
    "--accent-btn-border": palette.accent,
    "--accent-btn-hover-bg": palette.accentSoft,
    "--accent-btn-hover-border": palette.accentStrong,
    "--color-error": palette.danger,
    "--color-warning": palette.warning,
    "--color-ok": palette.accentStrong,
    "--scrollbar-track": palette.surfaceStrong,
    "--scrollbar-thumb": palette.editorGutterForeground,
    "--scrollbar-thumb-hover": palette.textMuted,
    "--tooltip-dark-bg": palette.surfaceStrong,
    "--tooltip-dark-text": palette.text,
    "--tooltip-dark-text-muted": palette.textMuted,
    "--tooltip-dark-border": palette.border,
    "--tooltip-warning-bg": palette.surfaceMuted,
    "--tooltip-warning-border": palette.warning,
    "--tooltip-warning-text": palette.warning,
    "--typr-editor-background": palette.editorBackground,
    "--typr-editor-foreground": palette.editorForeground,
    "--typr-editor-gutter": palette.editorGutter,
    "--typr-editor-gutter-foreground": palette.editorGutterForeground,
    "--typr-editor-active-line": palette.editorActiveLine,
    "--typr-editor-selection": palette.editorSelection
  };
}

export function applyTikzEditorTheme(
  frameDocument: Document,
  theme: Pick<ThemeDefinition, "mode" | "palette">
): void {
  const root = frameDocument.documentElement;
  root.dataset.colorScheme = theme.mode;
  root.style.colorScheme = theme.mode;

  for (const [name, value] of Object.entries(getTikzEditorThemeVariables(theme.palette))) {
    root.style.setProperty(name, value);
  }

  const existingStyle = frameDocument.getElementById(TIKZ_THEME_STYLE_ID);
  if (existingStyle?.tagName.toLowerCase() !== "style") {
    const style = frameDocument.createElement("style");
    style.id = TIKZ_THEME_STYLE_ID;
    style.textContent = TIKZ_THEME_OVERRIDES;
    frameDocument.head.append(style);
  }
}
