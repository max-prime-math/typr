import { describe, expect, it } from "vitest";
import type { ThemePalette } from "../theme/themes";
import { getTikzEditorThemeVariables } from "./tikzThemeBridge";

const palette: ThemePalette = {
  background: "#101010",
  backgroundWash: "#111111",
  surface: "#202020",
  surfaceStrong: "#212121",
  surfaceMuted: "#303030",
  text: "#f0f0f0",
  textMuted: "#a0a0a0",
  border: "#404040",
  accent: "#50a0ff",
  accentStrong: "#80c0ff",
  accentSoft: "rgba(80, 160, 255, 0.2)",
  danger: "#ff6060",
  warning: "#ffc050",
  editorBackground: "#121212",
  editorForeground: "#eeeeee",
  editorGutter: "#181818",
  editorGutterForeground: "#777777",
  editorActiveLine: "rgba(255, 255, 255, 0.05)",
  editorSelection: "rgba(80, 160, 255, 0.3)",
  shadow: "none"
};

describe("TikZ editor theme bridge", () => {
  it("maps the active Typr palette onto the embedded editor variables", () => {
    const variables = getTikzEditorThemeVariables(palette);

    expect(variables["--bg-app"]).toBe(palette.background);
    expect(variables["--bg-pane"]).toBe(palette.surfaceStrong);
    expect(variables["--accent"]).toBe(palette.accent);
    expect(variables["--color-error"]).toBe(palette.danger);
    expect(variables["--typr-editor-background"]).toBe(palette.editorBackground);
    expect(variables["--typr-editor-selection"]).toBe(palette.editorSelection);
  });
});
