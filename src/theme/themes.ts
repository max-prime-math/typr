export type ThemeMode = "light" | "dark";
export const AUTO_THEME_ID = "auto";

export interface ThemePalette {
  background: string;
  backgroundWash: string;
  surface: string;
  surfaceStrong: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  danger: string;
  warning: string;
  editorBackground: string;
  editorForeground: string;
  editorGutter: string;
  editorGutterForeground: string;
  editorActiveLine: string;
  editorSelection: string;
  shadow: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  palette: ThemePalette;
  source: "builtin" | "custom";
}

export interface ThemeImportFile {
  name: string;
  mode: ThemeMode;
  colors: Partial<ThemePalette> | Record<string, string>;
}

export const THEME_IMPORT_TEMPLATE: ThemeImportFile = {
  name: "My Custom Theme",
  mode: "dark",
  colors: {
    background: "#1e1e2e",
    backgroundWash: "#181825",
    surface: "#313244",
    surfaceStrong: "#1e1e2e",
    surfaceMuted: "#45475a",
    text: "#cdd6f4",
    textMuted: "#a6adc8",
    border: "#45475a",
    accent: "#89b4fa",
    accentStrong: "#94e2d5",
    accentSoft: "rgba(137, 180, 250, 0.14)",
    danger: "#f38ba8",
    warning: "#f9e2af",
    editorBackground: "#1e1e2e",
    editorForeground: "#cdd6f4",
    editorGutter: "#181825",
    editorGutterForeground: "#6c7086",
    editorActiveLine: "rgba(137, 180, 250, 0.12)",
    editorSelection: "rgba(137, 180, 250, 0.24)",
    shadow: "0 24px 80px rgba(4, 5, 17, 0.42)"
  }
};

const LIGHT_NEUTRAL = {
  background: "#ece7dc",
  backgroundWash: "#f6f3eb",
  surface: "rgba(255, 252, 247, 0.82)",
  surfaceStrong: "#fffdf9",
  surfaceMuted: "rgba(242, 237, 227, 0.88)",
  text: "#1c231f",
  textMuted: "#667166",
  border: "rgba(70, 78, 64, 0.12)",
  accent: "#176f5f",
  accentStrong: "#145548",
  accentSoft: "rgba(23, 111, 95, 0.12)",
  danger: "#a54343",
  warning: "#7b6319",
  editorBackground: "#fffdf8",
  editorForeground: "#1c231f",
  editorGutter: "#f0e9dd",
  editorGutterForeground: "#8b8f84",
  editorActiveLine: "rgba(23, 111, 95, 0.08)",
  editorSelection: "rgba(23, 111, 95, 0.22)",
  shadow: "0 24px 80px rgba(76, 66, 49, 0.12)"
} satisfies ThemePalette;

const DARK_NEUTRAL = {
  background: "#111614",
  backgroundWash: "#181d1a",
  surface: "rgba(23, 28, 25, 0.86)",
  surfaceStrong: "#171d1a",
  surfaceMuted: "rgba(28, 35, 31, 0.94)",
  text: "#edf4ef",
  textMuted: "#9aa69d",
  border: "rgba(203, 216, 206, 0.12)",
  accent: "#58baa1",
  accentStrong: "#3e9d86",
  accentSoft: "rgba(88, 186, 161, 0.14)",
  danger: "#ff9393",
  warning: "#e6cb78",
  editorBackground: "#121815",
  editorForeground: "#edf4ef",
  editorGutter: "#171e1a",
  editorGutterForeground: "#7e897f",
  editorActiveLine: "rgba(88, 186, 161, 0.12)",
  editorSelection: "rgba(88, 186, 161, 0.24)",
  shadow: "0 24px 80px rgba(0, 0, 0, 0.28)"
} satisfies ThemePalette;

function theme(id: string, name: string, description: string, mode: ThemeMode, palette: ThemePalette): ThemeDefinition {
  return {
    id,
    name,
    description,
    mode,
    palette,
    source: "builtin"
  };
}

export const BUILTIN_THEMES: ThemeDefinition[] = [
  theme("catppuccin-latte", "Catppuccin Latte", "Soft latte tones with a cool blue accent.", "light", {
    ...LIGHT_NEUTRAL,
    background: "#eff1f5",
    backgroundWash: "#e6e9ef",
    surface: "rgba(255, 255, 255, 0.82)",
    surfaceStrong: "#ffffff",
    surfaceMuted: "rgba(220, 224, 232, 0.9)",
    text: "#4c4f69",
    textMuted: "#6c6f85",
    border: "rgba(92, 95, 121, 0.16)",
    accent: "#1e66f5",
    accentStrong: "#209fb5",
    accentSoft: "rgba(30, 102, 245, 0.12)",
    danger: "#d20f39",
    warning: "#df8e1d",
    editorBackground: "#eff1f5",
    editorForeground: "#4c4f69",
    editorGutter: "#e6e9ef",
    editorGutterForeground: "#8c8fa1",
    editorActiveLine: "rgba(30, 102, 245, 0.08)",
    editorSelection: "rgba(30, 102, 245, 0.2)",
    shadow: "0 24px 80px rgba(76, 79, 105, 0.12)"
  }),
  theme("catppuccin-frappe", "Catppuccin Frappe", "Muted cool dark theme from the Catppuccin family.", "dark", {
    ...DARK_NEUTRAL,
    background: "#303446",
    backgroundWash: "#292c3c",
    surface: "rgba(49, 52, 70, 0.86)",
    surfaceStrong: "#303446",
    surfaceMuted: "rgba(65, 69, 89, 0.94)",
    text: "#c6d0f5",
    textMuted: "#a5adce",
    border: "rgba(165, 173, 206, 0.14)",
    accent: "#8caaee",
    accentStrong: "#85c1dc",
    accentSoft: "rgba(140, 170, 238, 0.14)",
    danger: "#e78284",
    warning: "#e5c890",
    editorBackground: "#303446",
    editorForeground: "#c6d0f5",
    editorGutter: "#292c3c",
    editorGutterForeground: "#737994",
    editorActiveLine: "rgba(140, 170, 238, 0.12)",
    editorSelection: "rgba(140, 170, 238, 0.24)",
    shadow: "0 24px 80px rgba(17, 18, 28, 0.35)"
  }),
  theme("catppuccin-macchiato", "Catppuccin Macchiato", "A deeper blue-gray Catppuccin variant.", "dark", {
    ...DARK_NEUTRAL,
    background: "#24273a",
    backgroundWash: "#1e2030",
    surface: "rgba(36, 39, 58, 0.86)",
    surfaceStrong: "#24273a",
    surfaceMuted: "rgba(54, 58, 79, 0.94)",
    text: "#cad3f5",
    textMuted: "#a5adcb",
    border: "rgba(165, 173, 203, 0.14)",
    accent: "#8aadf4",
    accentStrong: "#91d7e3",
    accentSoft: "rgba(138, 173, 244, 0.14)",
    danger: "#ed8796",
    warning: "#eed49f",
    editorBackground: "#24273a",
    editorForeground: "#cad3f5",
    editorGutter: "#1e2030",
    editorGutterForeground: "#7077a5",
    editorActiveLine: "rgba(138, 173, 244, 0.12)",
    editorSelection: "rgba(138, 173, 244, 0.24)",
    shadow: "0 24px 80px rgba(11, 12, 21, 0.38)"
  }),
  theme("catppuccin-mocha", "Catppuccin Mocha", "Warm dark theme with soft contrast and cyan accents.", "dark", {
    ...DARK_NEUTRAL,
    background: "#1e1e2e",
    backgroundWash: "#181825",
    surface: "rgba(30, 30, 46, 0.86)",
    surfaceStrong: "#1e1e2e",
    surfaceMuted: "rgba(69, 71, 90, 0.94)",
    text: "#cdd6f4",
    textMuted: "#a6adc8",
    border: "rgba(166, 173, 200, 0.14)",
    accent: "#89b4fa",
    accentStrong: "#94e2d5",
    accentSoft: "rgba(137, 180, 250, 0.14)",
    danger: "#f38ba8",
    warning: "#f9e2af",
    editorBackground: "#1e1e2e",
    editorForeground: "#cdd6f4",
    editorGutter: "#181825",
    editorGutterForeground: "#6c7086",
    editorActiveLine: "rgba(137, 180, 250, 0.12)",
    editorSelection: "rgba(137, 180, 250, 0.24)",
    shadow: "0 24px 80px rgba(4, 5, 17, 0.42)"
  }),
  theme("gruvbox-light", "Gruvbox Light", "Warm paper tones with an amber-and-blue accent mix.", "light", {
    ...LIGHT_NEUTRAL,
    background: "#fbf1c7",
    backgroundWash: "#f2e5bc",
    surface: "rgba(250, 241, 198, 0.84)",
    surfaceStrong: "#fbf1c7",
    surfaceMuted: "rgba(235, 219, 178, 0.94)",
    text: "#3c3836",
    textMuted: "#665c54",
    border: "rgba(146, 131, 116, 0.2)",
    accent: "#458588",
    accentStrong: "#076678",
    accentSoft: "rgba(69, 133, 136, 0.14)",
    danger: "#cc241d",
    warning: "#d79921",
    editorBackground: "#fbf1c7",
    editorForeground: "#3c3836",
    editorGutter: "#ebdbb2",
    editorGutterForeground: "#7c6f64",
    editorActiveLine: "rgba(69, 133, 136, 0.08)",
    editorSelection: "rgba(69, 133, 136, 0.2)",
    shadow: "0 24px 80px rgba(60, 56, 54, 0.12)"
  }),
  theme("gruvbox-dark", "Gruvbox Dark", "Low-glare earth tones for long writing sessions.", "dark", {
    ...DARK_NEUTRAL,
    background: "#282828",
    backgroundWash: "#1d2021",
    surface: "rgba(60, 56, 54, 0.9)",
    surfaceStrong: "#282828",
    surfaceMuted: "rgba(80, 73, 69, 0.94)",
    text: "#ebdbb2",
    textMuted: "#a89984",
    border: "rgba(146, 131, 116, 0.16)",
    accent: "#83a598",
    accentStrong: "#8ec07c",
    accentSoft: "rgba(131, 165, 152, 0.14)",
    danger: "#fb4934",
    warning: "#fabd2f",
    editorBackground: "#282828",
    editorForeground: "#ebdbb2",
    editorGutter: "#1d2021",
    editorGutterForeground: "#928374",
    editorActiveLine: "rgba(131, 165, 152, 0.12)",
    editorSelection: "rgba(131, 165, 152, 0.24)",
    shadow: "0 24px 80px rgba(0, 0, 0, 0.34)"
  }),
  theme("nord", "Nord", "Icy blue-gray surfaces inspired by the Nord palette.", "dark", {
    ...DARK_NEUTRAL,
    background: "#2e3440",
    backgroundWash: "#3b4252",
    surface: "rgba(59, 66, 82, 0.88)",
    surfaceStrong: "#2e3440",
    surfaceMuted: "rgba(76, 86, 106, 0.94)",
    text: "#eceff4",
    textMuted: "#d8dee9",
    border: "rgba(216, 222, 233, 0.14)",
    accent: "#88c0d0",
    accentStrong: "#81a1c1",
    accentSoft: "rgba(136, 192, 208, 0.14)",
    danger: "#bf616a",
    warning: "#ebcb8b",
    editorBackground: "#2e3440",
    editorForeground: "#eceff4",
    editorGutter: "#3b4252",
    editorGutterForeground: "#81a1c1",
    editorActiveLine: "rgba(136, 192, 208, 0.12)",
    editorSelection: "rgba(136, 192, 208, 0.24)",
    shadow: "0 24px 80px rgba(18, 22, 33, 0.4)"
  }),
  theme("solarized-light", "Solarized Light", "Classic solarized daylight with soft teal accents.", "light", {
    ...LIGHT_NEUTRAL,
    background: "#fdf6e3",
    backgroundWash: "#eee8d5",
    surface: "rgba(253, 246, 227, 0.84)",
    surfaceStrong: "#fdf6e3",
    surfaceMuted: "rgba(220, 210, 183, 0.94)",
    text: "#586e75",
    textMuted: "#657b83",
    border: "rgba(147, 161, 161, 0.2)",
    accent: "#268bd2",
    accentStrong: "#2aa198",
    accentSoft: "rgba(38, 139, 210, 0.14)",
    danger: "#dc322f",
    warning: "#b58900",
    editorBackground: "#fdf6e3",
    editorForeground: "#586e75",
    editorGutter: "#eee8d5",
    editorGutterForeground: "#93a1a1",
    editorActiveLine: "rgba(38, 139, 210, 0.08)",
    editorSelection: "rgba(38, 139, 210, 0.2)",
    shadow: "0 24px 80px rgba(88, 110, 117, 0.12)"
  }),
  theme("solarized-dark", "Solarized Dark", "Solarized's dim night mode with precise contrast.", "dark", {
    ...DARK_NEUTRAL,
    background: "#002b36",
    backgroundWash: "#073642",
    surface: "rgba(7, 54, 66, 0.9)",
    surfaceStrong: "#002b36",
    surfaceMuted: "rgba(11, 58, 70, 0.94)",
    text: "#eee8d5",
    textMuted: "#93a1a1",
    border: "rgba(131, 148, 150, 0.18)",
    accent: "#268bd2",
    accentStrong: "#2aa198",
    accentSoft: "rgba(38, 139, 210, 0.14)",
    danger: "#dc322f",
    warning: "#b58900",
    editorBackground: "#002b36",
    editorForeground: "#eee8d5",
    editorGutter: "#073642",
    editorGutterForeground: "#839496",
    editorActiveLine: "rgba(38, 139, 210, 0.12)",
    editorSelection: "rgba(38, 139, 210, 0.24)",
    shadow: "0 24px 80px rgba(0, 27, 36, 0.42)"
  }),
  theme("dracula", "Dracula", "High-contrast purple and pink with a familiar terminal feel.", "dark", {
    ...DARK_NEUTRAL,
    background: "#282a36",
    backgroundWash: "#21222c",
    surface: "rgba(52, 55, 70, 0.9)",
    surfaceStrong: "#282a36",
    surfaceMuted: "rgba(68, 71, 90, 0.94)",
    text: "#f8f8f2",
    textMuted: "#bd93f9",
    border: "rgba(189, 147, 249, 0.16)",
    accent: "#bd93f9",
    accentStrong: "#ff79c6",
    accentSoft: "rgba(189, 147, 249, 0.14)",
    danger: "#ff5555",
    warning: "#f1fa8c",
    editorBackground: "#282a36",
    editorForeground: "#f8f8f2",
    editorGutter: "#21222c",
    editorGutterForeground: "#6272a4",
    editorActiveLine: "rgba(189, 147, 249, 0.12)",
    editorSelection: "rgba(189, 147, 249, 0.24)",
    shadow: "0 24px 80px rgba(6, 6, 13, 0.44)"
  }),
  theme("tokyo-night", "Tokyo Night", "Deep indigo surfaces with a crisp blue accent.", "dark", {
    ...DARK_NEUTRAL,
    background: "#1a1b26",
    backgroundWash: "#16161e",
    surface: "rgba(36, 40, 59, 0.9)",
    surfaceStrong: "#1f2335",
    surfaceMuted: "rgba(65, 72, 104, 0.94)",
    text: "#c0caf5",
    textMuted: "#9aa5ce",
    border: "rgba(122, 162, 247, 0.14)",
    accent: "#7aa2f7",
    accentStrong: "#bb9af7",
    accentSoft: "rgba(122, 162, 247, 0.14)",
    danger: "#f7768e",
    warning: "#e0af68",
    editorBackground: "#1a1b26",
    editorForeground: "#c0caf5",
    editorGutter: "#16161e",
    editorGutterForeground: "#565f89",
    editorActiveLine: "rgba(122, 162, 247, 0.12)",
    editorSelection: "rgba(122, 162, 247, 0.24)",
    shadow: "0 24px 80px rgba(10, 11, 22, 0.42)"
  }),
  theme("everforest-dark", "Everforest Dark", "Forest tones with a muted, soft-edged contrast.", "dark", {
    ...DARK_NEUTRAL,
    background: "#2b3339",
    backgroundWash: "#232a2e",
    surface: "rgba(55, 65, 69, 0.9)",
    surfaceStrong: "#2b3339",
    surfaceMuted: "rgba(75, 86, 92, 0.94)",
    text: "#d3c6aa",
    textMuted: "#859289",
    border: "rgba(135, 145, 137, 0.16)",
    accent: "#a7c080",
    accentStrong: "#7fbbb3",
    accentSoft: "rgba(167, 192, 128, 0.14)",
    danger: "#e67e80",
    warning: "#dbbc7f",
    editorBackground: "#2b3339",
    editorForeground: "#d3c6aa",
    editorGutter: "#232a2e",
    editorGutterForeground: "#7a8478",
    editorActiveLine: "rgba(167, 192, 128, 0.12)",
    editorSelection: "rgba(167, 192, 128, 0.24)",
    shadow: "0 24px 80px rgba(13, 18, 18, 0.38)"
  })
];

export const DEFAULT_THEME_ID = "catppuccin-latte";

export const BUILTIN_THEME_IDS = new Set(BUILTIN_THEMES.map((themeDefinition) => themeDefinition.id));

export const THEME_VARIABLE_NAMES: Record<keyof ThemePalette, string> = {
  background: "--background",
  backgroundWash: "--background-wash",
  surface: "--surface",
  surfaceStrong: "--surface-strong",
  surfaceMuted: "--surface-muted",
  text: "--text",
  textMuted: "--text-muted",
  border: "--border",
  accent: "--accent",
  accentStrong: "--accent-strong",
  accentSoft: "--accent-soft",
  danger: "--danger",
  warning: "--warning",
  editorBackground: "--editor-background",
  editorForeground: "--editor-foreground",
  editorGutter: "--editor-gutter",
  editorGutterForeground: "--editor-gutter-foreground",
  editorActiveLine: "--editor-active-line",
  editorSelection: "--editor-selection",
  shadow: "--shadow"
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function isThemePaletteKey(key: string): key is keyof ThemePalette {
  return key in THEME_VARIABLE_NAMES;
}

export function getThemeById(
  themeId: string,
  customThemes: ThemeDefinition[] = []
): ThemeDefinition {
  const allThemes = [...BUILTIN_THEMES, ...customThemes];
  return (
    allThemes.find((themeDefinition) => themeDefinition.id === themeId) ??
    BUILTIN_THEMES[0]
  );
}

export function createThemeId(name: string): string {
  return `custom-${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createCustomTheme(
  name: string,
  mode: ThemeMode,
  palette: ThemePalette
): ThemeDefinition {
  return {
    id: createThemeId(name),
    name,
    description: "Imported theme palette.",
    mode,
    palette,
    source: "custom"
  };
}

export function isCompletePalette(value: unknown): value is ThemePalette {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.keys(THEME_VARIABLE_NAMES).every((key) => {
    const palette = value as Record<string, unknown>;
    return typeof palette[key] === "string" && palette[key].trim().length > 0;
  });
}

export function normalizeThemeId(themeId: string): string {
  if (themeId === AUTO_THEME_ID) {
    return AUTO_THEME_ID;
  }

  if (themeId === "light") {
    return DEFAULT_THEME_ID;
  }

  if (themeId === "dark") {
    return "catppuccin-mocha";
  }

  return themeId;
}

export function applyThemeVariables(theme: ThemeDefinition, root: HTMLElement): void {
  root.dataset.theme = theme.mode;

  for (const [key, cssVariable] of Object.entries(THEME_VARIABLE_NAMES)) {
    root.style.setProperty(cssVariable, theme.palette[key as keyof ThemePalette]);
  }
}

export function isAutoThemeId(themeId: string): boolean {
  return themeId === AUTO_THEME_ID;
}

export function getThemesByMode(
  themes: ThemeDefinition[],
  mode: ThemeMode
): ThemeDefinition[] {
  return themes.filter((themeDefinition) => themeDefinition.mode === mode);
}

export function pickRandomTheme(themes: ThemeDefinition[]): ThemeDefinition | null {
  if (themes.length === 0) {
    return null;
  }

  return themes[Math.floor(Math.random() * themes.length)] ?? themes[0];
}
