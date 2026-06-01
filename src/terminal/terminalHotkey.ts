export function isTerminalToggleShortcut(event: KeyboardEvent): boolean {
  const key = event.key === "'" ? "'" : event.key;
  if (key !== "'") {
    return false;
  }
  const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
  return isMac
    ? event.metaKey && !event.ctrlKey && !event.altKey
    : event.ctrlKey && !event.metaKey && !event.altKey;
}
