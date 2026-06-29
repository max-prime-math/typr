import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBINDINGS,
  formatKeybinding,
  normalizeKeybindings,
  toCodeMirrorKeybinding
} from "./keybindings";

describe("keybindings", () => {
  it("defaults manual formatting to Shift+Alt+F", () => {
    expect(DEFAULT_KEYBINDINGS.formatDocument).toBe("Shift-Alt-f");
    expect(formatKeybinding(DEFAULT_KEYBINDINGS.formatDocument, false)).toBe("Shift+Alt+F");
  });

  it("preserves shifted letter bindings for CodeMirror", () => {
    expect(toCodeMirrorKeybinding("Shift-Alt-f")).toBe("Shift-Alt-f");
    expect(toCodeMirrorKeybinding("Alt-Shift-f")).toBe("Alt-Shift-f");
    expect(toCodeMirrorKeybinding("Mod-Minus")).toBe("Mod--");
  });

  it("keeps older stored lowercase format bindings usable", () => {
    const keybindings = normalizeKeybindings({
      formatDocument: "Shift-Alt-f"
    });

    expect(toCodeMirrorKeybinding(keybindings.formatDocument)).toBe("Shift-Alt-f");
  });
});
