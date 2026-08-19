import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import {
  createSettingsProject,
  isSettingsProject,
  parseSettingsFile,
  readSettingsProjectFile,
  serializeSettingsFile
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

  it("creates a recognizable project with editable files", () => {
    const defaults = createDefaultSnapshot().preferences;
    const project = createSettingsProject(defaults);
    expect(isSettingsProject(project)).toBe(true);
    expect(readSettingsProjectFile(project, "editor.json")).toContain('"vimMode"');
    expect(readSettingsProjectFile(project, "editor.json")).toContain('"vimLatex"');
    expect(project.selection.activeFilePath).toBe("editor.json");
  });

  it("keeps project visibility local instead of syncing it in editor.json", () => {
    const defaults = createDefaultSnapshot().preferences;
    const project = createSettingsProject({ ...defaults, showSettingsProject: true });
    expect(readSettingsProjectFile(project, "editor.json")).not.toContain("showSettingsProject");
  });

  it("warns on invalid values instead of silently accepting them", () => {
    const snapshot = createDefaultSnapshot();
    const result = parseSettingsFile("editor.json", '{"vimMode": "yes"}', snapshot);
    expect(result.error).toContain("vimMode");
    expect(result.preferences.vimMode).toBe(false);
  });

  it("fills omitted Vim-LaTeX child preferences and preserves explicit choices", () => {
    const snapshot = createDefaultSnapshot();
    const result = parseSettingsFile(
      "editor.json",
      '{"vimLatex":{"enabled":true,"folding":false}}',
      snapshot
    );

    expect(result.error).toBeNull();
    expect(result.preferences.vimLatex.enabled).toBe(true);
    expect(result.preferences.vimLatex.folding).toBe(false);
    expect(result.preferences.vimLatex.textObjects).toBe(true);
    expect(result.preferences.vimLatex.packageIntelligence).toBe(true);
  });

  it("reports the path of an invalid Vim-LaTeX child preference", () => {
    const snapshot = createDefaultSnapshot();
    const result = parseSettingsFile(
      "editor.json",
      '{"vimLatex":{"enabled":"yes"}}',
      snapshot
    );

    expect(result.error).toContain("vimLatex.enabled");
    expect(result.preferences.vimLatex.enabled).toBe(false);
  });

  it("serializes Vim-LaTeX preferences with the editor settings group", () => {
    const preferences = createDefaultSnapshot().preferences;
    const serialized = JSON.parse(serializeSettingsFile("editor.json", preferences));

    expect(serialized.vimLatex).toEqual(preferences.vimLatex);
  });
});
