export type KeybindingCommandId =
  | "compile"
  | "formatDocument"
  | "toggleVim"
  | "toggleLineWrap"
  | "openSearch"
  | "newFile"
  | "renameFile"
  | "multiCursorAbove"
  | "multiCursorBelow"
  | "multiCursorNextMatch"
  | "multiCursorAllMatches"
  | "multiCursorLineEnds"
  | "toggleSidebar"
  | "toggleSource"
  | "togglePreview"
  | "toggleZen"
  | "resetPanels"
  | "showSidebarOnly"
  | "showEditorOnly"
  | "showPreviewOnly"
  | "showSplit"
  | "focusSourcePane"
  | "focusPreviewPane"
  | "previousWorkspaceTab"
  | "nextWorkspaceTab"
  | "previousSidebarTool"
  | "nextSidebarTool"
  | "increaseActivePaneZoom"
  | "decreaseActivePaneZoom"
  | "increaseEditorFont"
  | "decreaseEditorFont"
  | "resetEditorFont"
  | "increasePreviewZoom"
  | "decreasePreviewZoom"
  | "resetPreviewZoom"
  | "previewScrollLeft"
  | "previewScrollDown"
  | "previewScrollUp"
  | "previewScrollRight"
  | "previewNextPage"
  | "previewPreviousPage"
  | "previewGoTop"
  | "previewGoBottom";

export type KeybindingMap = Record<KeybindingCommandId, string>;

export interface KeybindingDefinition {
  id: KeybindingCommandId;
  label: string;
  group: "Editing" | "Files" | "Multiple cursors" | "Layout" | "View" | "Preview Vim";
  defaultBinding: string;
}

export const KEYBINDING_DEFINITIONS: KeybindingDefinition[] = [
  { id: "compile", label: "Compile document", group: "Editing", defaultBinding: "Mod-Enter" },
  { id: "formatDocument", label: "Format document", group: "Editing", defaultBinding: "Shift-Alt-f" },
  { id: "toggleVim", label: "Toggle Vim mode", group: "Editing", defaultBinding: "Alt-v" },
  { id: "toggleLineWrap", label: "Toggle line wrap", group: "Editing", defaultBinding: "Alt-w" },
  { id: "openSearch", label: "Open search", group: "Editing", defaultBinding: "Mod-f" },
  { id: "newFile", label: "New file", group: "Files", defaultBinding: "Alt-n" },
  { id: "renameFile", label: "Rename file", group: "Files", defaultBinding: "Alt-r" },
  {
    id: "multiCursorAbove",
    label: "Insert cursor above",
    group: "Multiple cursors",
    defaultBinding: "Mod-Alt-ArrowUp"
  },
  {
    id: "multiCursorBelow",
    label: "Insert cursor below",
    group: "Multiple cursors",
    defaultBinding: "Mod-Alt-ArrowDown"
  },
  {
    id: "multiCursorNextMatch",
    label: "Add next matching selection",
    group: "Multiple cursors",
    defaultBinding: "Mod-d"
  },
  {
    id: "multiCursorAllMatches",
    label: "Add all matching selections",
    group: "Multiple cursors",
    defaultBinding: "Mod-Shift-l"
  },
  {
    id: "multiCursorLineEnds",
    label: "Add cursors to line ends",
    group: "Multiple cursors",
    defaultBinding: "Shift-Alt-i"
  },
  { id: "toggleSidebar", label: "Toggle left pane", group: "Layout", defaultBinding: "Mod-Alt-b" },
  { id: "toggleSource", label: "Toggle source pane", group: "Layout", defaultBinding: "Alt-s" },
  { id: "togglePreview", label: "Toggle preview pane", group: "Layout", defaultBinding: "Alt-p" },
  { id: "toggleZen", label: "Toggle zen mode", group: "Layout", defaultBinding: "Alt-z" },
  { id: "resetPanels", label: "Reset pane widths", group: "Layout", defaultBinding: "Mod-Alt-0" },
  { id: "showSidebarOnly", label: "Show left pane only", group: "Layout", defaultBinding: "Mod-Alt-1" },
  { id: "showEditorOnly", label: "Show editor only", group: "Layout", defaultBinding: "Mod-Alt-2" },
  { id: "showPreviewOnly", label: "Show preview only", group: "Layout", defaultBinding: "Mod-Alt-3" },
  { id: "showSplit", label: "Show split workspace", group: "Layout", defaultBinding: "Mod-Alt-4" },
  { id: "focusSourcePane", label: "Focus pane left", group: "Layout", defaultBinding: "Alt-h" },
  { id: "focusPreviewPane", label: "Focus pane right", group: "Layout", defaultBinding: "Alt-l" },
  {
    id: "previousWorkspaceTab",
    label: "Previous open tab",
    group: "Layout",
    defaultBinding: "Alt-["
  },
  {
    id: "nextWorkspaceTab",
    label: "Next open tab",
    group: "Layout",
    defaultBinding: "Alt-]"
  },
  {
    id: "previousSidebarTool",
    label: "Previous left tab",
    group: "Layout",
    defaultBinding: "Mod-Alt-["
  },
  { id: "nextSidebarTool", label: "Next left tab", group: "Layout", defaultBinding: "Mod-Alt-]" },
  {
    id: "increaseActivePaneZoom",
    label: "Increase focused pane zoom",
    group: "View",
    defaultBinding: "Alt-="
  },
  {
    id: "decreaseActivePaneZoom",
    label: "Decrease focused pane zoom",
    group: "View",
    defaultBinding: "Alt-Minus"
  },
  {
    id: "increaseEditorFont",
    label: "Increase editor font",
    group: "View",
    defaultBinding: "Mod-="
  },
  {
    id: "decreaseEditorFont",
    label: "Decrease editor font",
    group: "View",
    defaultBinding: "Mod-Minus"
  },
  { id: "resetEditorFont", label: "Reset editor font", group: "View", defaultBinding: "Mod-0" },
  {
    id: "increasePreviewZoom",
    label: "Increase preview zoom",
    group: "View",
    defaultBinding: "Mod-Alt-="
  },
  {
    id: "decreasePreviewZoom",
    label: "Decrease preview zoom",
    group: "View",
    defaultBinding: "Mod-Alt-Minus"
  },
  {
    id: "resetPreviewZoom",
    label: "Reset preview zoom",
    group: "View",
    defaultBinding: "Mod-Alt-Backspace"
  },
  {
    id: "previewScrollLeft",
    label: "Preview scroll left",
    group: "Preview Vim",
    defaultBinding: "h"
  },
  {
    id: "previewScrollDown",
    label: "Preview scroll down",
    group: "Preview Vim",
    defaultBinding: "j"
  },
  {
    id: "previewScrollUp",
    label: "Preview scroll up",
    group: "Preview Vim",
    defaultBinding: "k"
  },
  {
    id: "previewScrollRight",
    label: "Preview scroll right",
    group: "Preview Vim",
    defaultBinding: "l"
  },
  {
    id: "previewNextPage",
    label: "Preview next page",
    group: "Preview Vim",
    defaultBinding: "Shift-j"
  },
  {
    id: "previewPreviousPage",
    label: "Preview previous page",
    group: "Preview Vim",
    defaultBinding: "Shift-k"
  },
  {
    id: "previewGoTop",
    label: "Preview top",
    group: "Preview Vim",
    defaultBinding: "g g"
  },
  {
    id: "previewGoBottom",
    label: "Preview bottom",
    group: "Preview Vim",
    defaultBinding: "Shift-g"
  }
];

export const DEFAULT_KEYBINDINGS: KeybindingMap = KEYBINDING_DEFINITIONS.reduce(
  (bindings, definition) => ({
    ...bindings,
    [definition.id]: definition.defaultBinding
  }),
  {} as KeybindingMap
);

export function normalizeKeybindings(candidate: unknown): KeybindingMap {
  const keybindings = { ...DEFAULT_KEYBINDINGS };

  if (!candidate || typeof candidate !== "object") {
    return keybindings;
  }

  const raw = candidate as Partial<Record<KeybindingCommandId, unknown>>;

  for (const definition of KEYBINDING_DEFINITIONS) {
    const value = raw[definition.id];
    if (typeof value === "string") {
      const normalizedValue = normalizeKeybindingString(value);
      keybindings[definition.id] =
        definition.id === "toggleVim" && normalizedValue === "Mod-;"
          ? DEFAULT_KEYBINDINGS.toggleVim
          : definition.id === "togglePreview" && normalizedValue === "Mod-Alt-p"
            ? DEFAULT_KEYBINDINGS.togglePreview
            : normalizedValue;
    }
  }

  return keybindings;
}

export function normalizeKeybindingString(value: string): string {
  return value
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("-");
}

export function formatKeybinding(binding: string, apple: boolean): string {
  if (!binding) {
    return "Unassigned";
  }

  const sequence = binding.trim().split(/\s+/).filter(Boolean);
  if (sequence.length > 1) {
    return sequence.map((chord) => formatKeybinding(chord, apple)).join(" ");
  }

  return binding
    .split("-")
    .filter(Boolean)
    .map((part) => formatKeybindingPart(part, apple))
    .join("+");
}

export function toCodeMirrorKeybinding(binding: string): string {
  return binding
    .trim()
    .split(/\s+/)
    .map((chord) =>
      chord
        .split("-")
        .filter(Boolean)
        .map((part) => (part === "Minus" ? "-" : part))
        .join("-")
    )
    .join(" ");
}

export function keybindingFromKeyboardEvent(event: KeyboardEvent, apple: boolean): string | null {
  const key = getKeyboardEventKeyCandidates(event)[0] ?? null;

  if (!key || key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") {
    return null;
  }

  const parts = [];
  if (apple ? event.metaKey : event.ctrlKey) {
    parts.push("Mod");
  }
  if (event.ctrlKey && apple) {
    parts.push("Ctrl");
  }
  if (event.metaKey && !apple) {
    parts.push("Meta");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }

  parts.push(key);
  return parts.join("-");
}

export function matchesKeybinding(
  event: KeyboardEvent,
  binding: string,
  apple: boolean
): boolean {
  if (!binding) {
    return false;
  }

  const parsed = parseKeybinding(binding, apple);
  if (!parsed) {
    return false;
  }

  return (
    getKeyboardEventKeyCandidates(event).some(
      (key) => key.toLowerCase() === parsed.key.toLowerCase()
    ) &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta
  );
}

function parseKeybinding(binding: string, apple: boolean) {
  const parts = binding.split("-").filter(Boolean);
  const key = parts.at(-1);

  if (!key) {
    return null;
  }

  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  const mod = modifiers.has("mod");

  return {
    key,
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
    ctrl: modifiers.has("ctrl") || (mod && !apple),
    meta: modifiers.has("meta") || modifiers.has("cmd") || (mod && apple)
  };
}

function getKeyboardEventKeyCandidates(event: KeyboardEvent): string[] {
  const candidates = [
    event.altKey ? normalizeEventCode(event.code) : null,
    normalizeEventKey(event.key)
  ].filter((key): key is string => key !== null);

  return Array.from(new Set(candidates));
}

function normalizeEventKey(key: string): string | null {
  if (key.length === 1) {
    if (key === "-") {
      return "Minus";
    }

    return key.toLowerCase();
  }

  if (key === " ") {
    return "Space";
  }

  const aliases: Record<string, string> = {
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Backspace: "Backspace",
    Delete: "Delete",
    Enter: "Enter",
    Escape: "Escape",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown"
  };

  return aliases[key] ?? null;
}

function normalizeEventCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  if (code === "Minus") {
    return "Minus";
  }

  if (code === "Equal") {
    return "=";
  }

  if (code === "BracketLeft") {
    return "[";
  }

  if (code === "BracketRight") {
    return "]";
  }

  return null;
}

function formatKeybindingPart(part: string, apple: boolean): string {
  if (part === "Mod") {
    return apple ? "Cmd" : "Ctrl";
  }

  if (part === "Alt") {
    return apple ? "Option" : "Alt";
  }

  if (part === "ArrowUp") {
    return "Up";
  }

  if (part === "ArrowDown") {
    return "Down";
  }

  if (part === "ArrowLeft") {
    return "Left";
  }

  if (part === "ArrowRight") {
    return "Right";
  }

  if (part === "Minus") {
    return "-";
  }

  if (part.length === 1) {
    return part.toUpperCase();
  }

  return part;
}
