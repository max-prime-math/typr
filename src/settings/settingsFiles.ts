import {
  createDefaultSnapshot,
  normalizeSnapshot,
  type AppPreferences,
  type AppSnapshot
} from "../app/appState";

export const SETTINGS_FILES_STORAGE_KEY = "typr.settings-files.v1";

export const SETTINGS_FILE_NAMES = [
  "appearance.json",
  "editor.json",
  "keybindings.json",
  "sync.json"
] as const;

export type SettingsFileName = (typeof SETTINGS_FILE_NAMES)[number];
export type SettingsFileContents = Record<SettingsFileName, string>;
export type SettingsFileErrors = Partial<Record<SettingsFileName, string>>;

type JsonObject = Record<string, unknown>;

const GROUP_KEYS: Record<SettingsFileName, readonly (keyof AppPreferences)[]> = {
  "appearance.json": [
    "theme",
    "cursorSmooth",
    "cursorSmear",
    "editorFontSize",
    "sidebarFontSize",
    "colorfulFileTreeIcons",
    "showGitignoreInFileTree"
  ],
  "editor.json": [
    "vimMode",
    "vimClipboardSharing",
    "relativeLineNumbers",
    "liveCompilation",
    "latexMathPreview",
    "typstMathPreview",
    "editorTooling",
    "externalDiagnostics",
    "mobileKeyboard",
    "pastedImages"
  ],
  "keybindings.json": ["keybindings"],
  "sync.json": ["autoSyncGitProjects"]
};

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function serializeSettingsFile(
  fileName: SettingsFileName,
  preferences: AppPreferences
): string {
  const value: JsonObject = {};
  for (const key of GROUP_KEYS[fileName]) value[key] = preferences[key];
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createSettingsFileContents(preferences: AppPreferences): SettingsFileContents {
  return Object.fromEntries(
    SETTINGS_FILE_NAMES.map((fileName) => [fileName, serializeSettingsFile(fileName, preferences)])
  ) as SettingsFileContents;
}

export function parseSettingsFile(
  fileName: SettingsFileName,
  source: string,
  currentSnapshot: AppSnapshot
): { preferences: AppPreferences; error: null } | { preferences: AppPreferences; error: string } {
  const defaults = createDefaultSnapshot().preferences;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return {
      preferences: replaceSettingsGroup(currentSnapshot.preferences, defaults, fileName),
      error: `Could not read ${fileName}: ${message}. This file is being ignored.`
    };
  }

  if (!isJsonObject(parsed)) {
    return {
      preferences: replaceSettingsGroup(currentSnapshot.preferences, defaults, fileName),
      error: `Could not read ${fileName}: the top level must be an object. This file is being ignored.`
    };
  }

  const allowedKeys = new Set<string>(GROUP_KEYS[fileName]);
  const unexpectedKey = Object.keys(parsed).find((key) => !allowedKeys.has(key));
  if (unexpectedKey) {
    return {
      preferences: replaceSettingsGroup(currentSnapshot.preferences, defaults, fileName),
      error: `Could not read ${fileName}: “${unexpectedKey}” belongs in another settings file or is unknown. This file is being ignored.`
    };
  }

  const candidate = replaceSettingsGroup(currentSnapshot.preferences, defaults, fileName);
  for (const key of GROUP_KEYS[fileName]) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      (candidate as unknown as JsonObject)[key] = parsed[key];
    }
  }
  const normalized = normalizeSnapshot({ ...currentSnapshot, preferences: candidate }).preferences;
  const mismatchPath = findNormalizedMismatch(parsed, normalized);
  if (mismatchPath) {
    return {
      preferences: replaceSettingsGroup(currentSnapshot.preferences, defaults, fileName),
      error: `Could not read ${fileName}: “${mismatchPath}” has an invalid value. This file is being ignored.`
    };
  }
  return { preferences: replaceSettingsGroup(currentSnapshot.preferences, normalized, fileName), error: null };
}

function findNormalizedMismatch(input: JsonObject, normalized: unknown, prefix = ""): string | null {
  if (!isJsonObject(normalized)) return prefix || "settings";
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const normalizedValue = normalized[key];
    if (isJsonObject(value)) {
      const nestedMismatch = findNormalizedMismatch(value, normalizedValue, path);
      if (nestedMismatch) return nestedMismatch;
    } else if (JSON.stringify(value) !== JSON.stringify(normalizedValue)) {
      return path;
    }
  }
  return null;
}

function replaceSettingsGroup(
  current: AppPreferences,
  source: AppPreferences,
  fileName: SettingsFileName
): AppPreferences {
  const next = { ...current };
  for (const key of GROUP_KEYS[fileName]) {
    (next as unknown as Record<keyof AppPreferences, unknown>)[key] = source[key];
  }
  return next;
}

export function readSettingsFileContents(
  storage: Pick<Storage, "getItem"> | undefined,
  preferences: AppPreferences
): SettingsFileContents {
  const defaults = createSettingsFileContents(preferences);
  if (!storage) return defaults;
  try {
    const parsed = JSON.parse(storage.getItem(SETTINGS_FILES_STORAGE_KEY) ?? "null");
    if (!isJsonObject(parsed)) return defaults;
    return Object.fromEntries(SETTINGS_FILE_NAMES.map((fileName) => [
      fileName,
      typeof parsed[fileName] === "string" ? parsed[fileName] : defaults[fileName]
    ])) as SettingsFileContents;
  } catch {
    return defaults;
  }
}

export function writeSettingsFileContents(
  storage: Pick<Storage, "setItem"> | undefined,
  contents: SettingsFileContents
): void {
  storage?.setItem(SETTINGS_FILES_STORAGE_KEY, JSON.stringify(contents));
}
