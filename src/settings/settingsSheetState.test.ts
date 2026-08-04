import { describe, expect, it } from "vitest";
import {
  SETTINGS_MENU_STORAGE_KEY,
  findMatchingSettingsTabs,
  readStoredSettingsMenuState,
  writeStoredSettingsMenuState
} from "./settingsSheetState";

function createStorage(initialValue?: string) {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set(SETTINGS_MENU_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    value() {
      return values.get(SETTINGS_MENU_STORAGE_KEY) ?? null;
    }
  };
}

describe("settings sheet state", () => {
  it("retains the existing key and normalizes persisted tab scroll positions", () => {
    const storage = createStorage(JSON.stringify({
      tab: "packages",
      scrollByTab: { packages: 18.6, editor: -2, unknown: 99 }
    }));

    expect(SETTINGS_MENU_STORAGE_KEY).toBe("typr.settings-menu.v1");
    expect(readStoredSettingsMenuState(storage)).toEqual({
      tab: "packages",
      scrollByTab: { packages: 19 }
    });

    writeStoredSettingsMenuState(storage, "themes", { themes: 42 });
    expect(JSON.parse(storage.value() ?? "null")).toEqual({
      tab: "themes",
      scrollByTab: { themes: 42 }
    });
  });

  it("uses the current settings search vocabulary and falls back safely", () => {
    expect(findMatchingSettingsTabs("github")).toEqual(["git"]);
    expect(findMatchingSettingsTabs("constant")).toEqual(["sync"]);
    expect(findMatchingSettingsTabs("formatter")).toContain("editor");
    expect(findMatchingSettingsTabs("")).toEqual([
      "files",
      "sync",
      "git",
      "themes",
      "editor",
      "keybindings",
      "snippets",
      "packages"
    ]);
    expect(readStoredSettingsMenuState(createStorage("not-json"))).toEqual({
      tab: "git",
      scrollByTab: {}
    });
  });
});
