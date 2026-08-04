import {
  createDefaultSnapshot,
  normalizeSnapshot,
  type AppPreferences,
  type AppSnapshot
} from "../app/appState";
import {
  createEmptyProjectRepository,
  readProjectFileBytes,
  writeProjectFile,
  type TyprProjectRepository
} from "../project/projectState";

export const SETTINGS_PROJECT_MARKER_PATH = ".typr-settings-project.json";
export const SETTINGS_PROJECT_MARKER_CONTENT = `${JSON.stringify({ type: "typr-settings", version: 1 }, null, 2)}\n`;

export const SETTINGS_FILE_NAMES = [
  "theme.json",
  "editor.json",
  "keybindings.json",
  "sync.json"
] as const;

export type SettingsFileName = (typeof SETTINGS_FILE_NAMES)[number];
export type SettingsFileErrors = Partial<Record<SettingsFileName, string>>;

type JsonObject = Record<string, unknown>;

const GROUP_KEYS: Record<SettingsFileName, readonly (keyof AppPreferences)[]> = {
  "theme.json": [
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

export function isSettingsProject(project: TyprProjectRepository | null | undefined): boolean {
  if (!project) return false;
  const bytes = readProjectFileBytes(project, SETTINGS_PROJECT_MARKER_PATH);
  if (!bytes) return false;
  try {
    const marker = JSON.parse(new TextDecoder().decode(bytes));
    return marker?.type === "typr-settings" && marker?.version === 1;
  } catch {
    return false;
  }
}

export function readSettingsProjectFile(
  project: TyprProjectRepository,
  fileName: SettingsFileName
): string | null {
  const bytes = readProjectFileBytes(project, fileName);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

export function createSettingsProject(preferences: AppPreferences): TyprProjectRepository {
  let project = createEmptyProjectRepository({
    displayName: "Typr Settings",
    defaultFileName: null
  });
  project = writeProjectFile(project, SETTINGS_PROJECT_MARKER_PATH, SETTINGS_PROJECT_MARKER_CONTENT);
  for (const fileName of SETTINGS_FILE_NAMES) {
    project = writeProjectFile(project, fileName, serializeSettingsFile(fileName, preferences));
  }
  return {
    ...project,
    selection: {
      activeFilePath: "editor.json",
      openFilePaths: ["editor.json"]
    }
  };
}

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
