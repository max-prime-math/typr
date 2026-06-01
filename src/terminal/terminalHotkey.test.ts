import { afterEach, describe, expect, it } from "vitest";
import { isTerminalToggleShortcut } from "./terminalHotkey";

const originalNavigator = globalThis.navigator;

function setNavigator(platform: string) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { platform }
  });
}

describe("isTerminalToggleShortcut", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  });

  it("matches Ctrl+' on non-mac platforms", () => {
    setNavigator("Win32");
    expect(
      isTerminalToggleShortcut({
        key: "'",
        ctrlKey: true,
        metaKey: false,
        altKey: false
      } as KeyboardEvent)
    ).toBe(true);
  });

  it("matches Cmd+' on macOS", () => {
    setNavigator("MacIntel");
    expect(
      isTerminalToggleShortcut({
        key: "'",
        ctrlKey: false,
        metaKey: true,
        altKey: false
      } as KeyboardEvent)
    ).toBe(true);
  });
});
