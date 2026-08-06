import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBINDINGS,
  formatKeybinding,
  normalizeKeybindings,
  toCodeMirrorKeybinding
} from "./keybindings";

describe("keybindings", () => {
  it("defaults file creation and rename to Alt/Option shortcuts", () => {
    expect(DEFAULT_KEYBINDINGS.newFile).toBe("Alt-n");
    expect(DEFAULT_KEYBINDINGS.renameFile).toBe("Alt-r");
    expect(formatKeybinding(DEFAULT_KEYBINDINGS.newFile, true)).toBe("Option+N");
    expect(formatKeybinding(DEFAULT_KEYBINDINGS.renameFile, false)).toBe("Alt+R");
  });

  it("defaults manual formatting to Shift+Alt+F", () => {
    expect(DEFAULT_KEYBINDINGS.formatDocument).toBe("Shift-Alt-f");
    expect(formatKeybinding(DEFAULT_KEYBINDINGS.formatDocument, false)).toBe("Shift+Alt+F");
  });

  it("defaults line wrap to Alt/Option+W", () => {
    expect(DEFAULT_KEYBINDINGS.toggleLineWrap).toBe("Alt-w");
    expect(formatKeybinding(DEFAULT_KEYBINDINGS.toggleLineWrap, true)).toBe("Option+W");
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
