import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import {
  createSettingsFileContents,
  parseSettingsFile,
  readSettingsFileContents,
  SETTINGS_FILES_STORAGE_KEY
} from "./settingsFiles";

describe("settings files", () => {
  it("uses defaults for omitted lines", () => {
    const snapshot = createDefaultSnapshot();
    const result = parseSettingsFile("editor.json", '{"vimMode": true}', snapshot);
    expect(result.error).toBeNull();
    expect(result.preferences.vimMode).toBe(true);
    expect(result.preferences.liveCompilation).toBe(false);
  });

  it("ignores a corrupt file and resets only its group", () => {
    const snapshot = createDefaultSnapshot();
    snapshot.preferences.vimMode = true;
    snapshot.preferences.theme = "tokyo-night";
    const result = parseSettingsFile("editor.json", "{ nope", snapshot);
    expect(result.error).toContain("being ignored");
    expect(result.preferences.vimMode).toBe(false);
    expect(result.preferences.theme).toBe("tokyo-night");
  });

  it("retains corrupt stored text so the user can repair it", () => {
    const defaults = createDefaultSnapshot().preferences;
    const valid = createSettingsFileContents(defaults);
    const storage = {
      getItem: (key: string) => key === SETTINGS_FILES_STORAGE_KEY
        ? JSON.stringify({ ...valid, "editor.json": "{" })
        : null
    };
    expect(readSettingsFileContents(storage, defaults)["editor.json"]).toBe("{");
  });

  it("warns on invalid values instead of silently accepting them", () => {
    const snapshot = createDefaultSnapshot();
    const result = parseSettingsFile("editor.json", '{"vimMode": "yes"}', snapshot);
    expect(result.error).toContain("vimMode");
    expect(result.preferences.vimMode).toBe(false);
  });
});
