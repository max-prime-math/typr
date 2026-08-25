export const TIKZ_EDITOR_VERSION = "0.5.2";

export interface TikzEditorMessage {
  event?: string;
  source?: string;
  xml?: string;
  svg?: string;
  data?: string;
  error?: string;
  message?: string;
  title?: string;
  kind?: string;
  version?: string;
  modified?: boolean;
}

export const TIKZ_SVG_EXPORT_RETRY_DELAY_MS = 250;
export const TIKZ_SVG_EXPORT_TIMEOUT_MS = 10_000;

export function isTikzSvgExportPending(
  message: Pick<TikzEditorMessage, "error">,
  svg: string
): boolean {
  if (svg.trim()) {
    return false;
  }

  return !message.error || message.error.startsWith("SVG is not ready yet");
}

export function parseTikzEditorMessage(value: unknown): TikzEditorMessage | null {
  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed as TikzEditorMessage;
}

export function isTrustedTikzEditorEvent(
  event: Pick<MessageEvent, "origin" | "source">,
  frameWindow: Window | null,
  expectedOrigin: string
): boolean {
  return event.source === frameWindow && event.origin === expectedOrigin;
}

export function getTikzEditorUrl(): string {
  return new URL("core/tikz-editor/index.html", document.baseURI).toString();
}
