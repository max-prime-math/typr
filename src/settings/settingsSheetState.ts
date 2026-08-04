import { KEYBINDING_DEFINITIONS } from "../app/keybindings";

export const SETTINGS_MENU_STORAGE_KEY = "typr.settings-menu.v1";

export type SettingsTab =
  | "files"
  | "sync"
  | "git"
  | "themes"
  | "editor"
  | "keybindings"
  | "snippets"
  | "packages";
export type SettingsScrollPositions = Partial<Record<SettingsTab, number>>;

export interface StoredSettingsMenuState {
  tab: SettingsTab;
  scrollByTab: SettingsScrollPositions;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  "files", "sync", "git", "themes", "editor", "keybindings", "snippets", "packages"
];

const SETTINGS_SEARCH_INDEX: Record<SettingsTab, string[]> = {
  files: ["files", "json", "text", "configuration", "settings as text"],
  sync: [
    "sync",
    "google drive",
    "drive",
    "local folder",
    "automatic",
    "compile",
    "interval",
    "minutes",
    "constant",
    "manual"
  ],
  git: ["git", "github", "token", "remote", "owner", "repo", "repository", "branch", "gitignore", "status", "push", "sync", "commit"],
  themes: ["theme", "themes", "light", "dark", "system", "import", "palette", "cursor", "smear cursor", "intensity", "follow system default"],
  editor: ["editor", "vim", "format", "formatter", "lint", "linter", "diagnostics", "harper", "lsp", "language server", "websocket", "local lsp", "remote lsp", "compile", "live"],
  keybindings: [
    "keybindings", "keys", "shortcuts", "hotkeys", "vim", "layout", "preview", "multi cursor",
    ...KEYBINDING_DEFINITIONS.flatMap((definition) => [definition.label, definition.group, definition.defaultBinding])
  ],
  snippets: ["snippets", "typst", "latex", "markdown", "autocomplete", "import", "json", "template"],
  packages: ["packages", "package", "typst universe", "latex", "cache", "offline", "bundle", "manual", "recommended", "basic"]
};

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function getDefaultStorage(): SettingsStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && SETTINGS_TABS.includes(value as SettingsTab);
}

function normalizeSettingsScrollPositions(value: unknown): SettingsScrollPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return SETTINGS_TABS.reduce<SettingsScrollPositions>((positions, tab) => {
    const scrollTop = (value as Partial<Record<SettingsTab, unknown>>)[tab];
    if (typeof scrollTop === "number" && Number.isFinite(scrollTop) && scrollTop > 0) {
      positions[tab] = Math.round(scrollTop);
    }
    return positions;
  }, {});
}

export function readStoredSettingsMenuState(
  storage: Pick<SettingsStorage, "getItem"> | undefined = getDefaultStorage()
): StoredSettingsMenuState {
  if (!storage) return { tab: "git", scrollByTab: {} };

  try {
    const stored = storage.getItem(SETTINGS_MENU_STORAGE_KEY);
    if (!stored) return { tab: "git", scrollByTab: {} };
    const parsed = JSON.parse(stored);
    return {
      tab: isSettingsTab(parsed?.tab) ? parsed.tab : "git",
      scrollByTab: normalizeSettingsScrollPositions(parsed?.scrollByTab)
    };
  } catch {
    return { tab: "git", scrollByTab: {} };
  }
}

export function writeStoredSettingsMenuState(
  storage: Pick<SettingsStorage, "setItem"> | undefined,
  tab: SettingsTab,
  scrollByTab: SettingsScrollPositions
): void {
  storage?.setItem(SETTINGS_MENU_STORAGE_KEY, JSON.stringify({ tab, scrollByTab }));
}

export function findMatchingSettingsTabs(searchQuery: string): readonly SettingsTab[] {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return SETTINGS_TABS;
  return SETTINGS_TABS.filter((tab) =>
    SETTINGS_SEARCH_INDEX[tab].some((term) => term.toLowerCase().includes(query))
  );
}

export function getSettingsTabTitle(tab: SettingsTab): string {
  return tab === "files" ? "Settings files" : tab === "sync" ? "Sync" : tab === "git" ? "Git" : tab === "themes" ? "Themes" : tab === "editor" ? "Editor" : tab === "keybindings" ? "Keybindings" : tab === "snippets" ? "Snippets" : "Packages";
}
