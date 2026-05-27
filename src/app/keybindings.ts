export type KeybindingCommandId =
  | "compile"
  | "toggleVim"
  | "openSearch"
  | "multiCursorAbove"
  | "multiCursorBelow"
  | "multiCursorNextMatch"
  | "multiCursorAllMatches"
  | "multiCursorLineEnds"
  | "toggleSidebar"
  | "togglePreview"
  | "resetPanels"
  | "showSidebarOnly"
  | "showEditorOnly"
  | "showPreviewOnly"
  | "showSplit"
  | "previousSidebarTool"
  | "nextSidebarTool"
  | "increaseEditorFont"
  | "decreaseEditorFont"
  | "resetEditorFont"
  | "increasePreviewZoom"
  | "decreasePreviewZoom"
  | "resetPreviewZoom";

export type KeybindingMap = Record<KeybindingCommandId, string>;

export interface KeybindingDefinition {
  id: KeybindingCommandId;
  label: string;
  group: "Editing" | "Multiple cursors" | "Layout" | "View";
  defaultBinding: string;
}

export const KEYBINDING_DEFINITIONS: KeybindingDefinition[] = [
  { id: "compile", label: "Compile document", group: "Editing", defaultBinding: "Mod-Enter" },
  { id: "toggleVim", label: "Toggle Vim mode", group: "Editing", defaultBinding: "Mod-;" },
  { id: "openSearch", label: "Open search", group: "Editing", defaultBinding: "Mod-f" },
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
    label: "Insert cursors at selected line ends",
    group: "Multiple cursors",
    defaultBinding: "Shift-Alt-i"
  },
  { id: "toggleSidebar", label: "Toggle left pane", group: "Layout", defaultBinding: "Mod-Alt-b" },
  { id: "togglePreview", label: "Toggle preview pane", group: "Layout", defaultBinding: "Mod-Alt-p" },
  { id: "resetPanels", label: "Reset pane widths", group: "Layout", defaultBinding: "Mod-Alt-0" },
  { id: "showSidebarOnly", label: "Show left pane only", group: "Layout", defaultBinding: "Mod-Alt-1" },
  { id: "showEditorOnly", label: "Show editor only", group: "Layout", defaultBinding: "Mod-Alt-2" },
  { id: "showPreviewOnly", label: "Show preview only", group: "Layout", defaultBinding: "Mod-Alt-3" },
  { id: "showSplit", label: "Show split workspace", group: "Layout", defaultBinding: "Mod-Alt-4" },
  {
    id: "previousSidebarTool",
    label: "Previous left tab",
    group: "Layout",
    defaultBinding: "Mod-Alt-["
  },
  { id: "nextSidebarTool", label: "Next left tab", group: "Layout", defaultBinding: "Mod-Alt-]" },
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
      keybindings[definition.id] = normalizeKeybindingString(value);
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

  return binding
    .split("-")
    .filter(Boolean)
    .map((part) => formatKeybindingPart(part, apple))
    .join("+");
}

export function toCodeMirrorKeybinding(binding: string): string {
  return binding
    .split("-")
    .map((part) => (part === "Minus" ? "-" : part))
    .join("-");
}

export function keybindingFromKeyboardEvent(event: KeyboardEvent, apple: boolean): string | null {
  const key = normalizeEventKey(event.key);

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
    event.key.toLowerCase() === parsed.key.toLowerCase() &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta
  );
}

export function findKeybindingConflicts(
  keybindings: KeybindingMap,
  commandId: KeybindingCommandId
): KeybindingCommandId[] {
  const binding = keybindings[commandId];
  if (!binding) {
    return [];
  }

  return KEYBINDING_DEFINITIONS
    .filter((definition) => definition.id !== commandId && keybindings[definition.id] === binding)
    .map((definition) => definition.id);
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
    key: denormalizeEventKey(key),
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
    ctrl: modifiers.has("ctrl") || (mod && !apple),
    meta: modifiers.has("meta") || modifiers.has("cmd") || (mod && apple)
  };
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

function denormalizeEventKey(key: string): string {
  if (key === "Space") {
    return " ";
  }

  if (key === "Minus") {
    return "-";
  }

  return key;
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
