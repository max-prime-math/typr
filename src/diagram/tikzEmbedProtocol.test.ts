import { describe, expect, it } from "vitest";
import {
  isTrustedTikzEditorEvent,
  isTikzSvgExportPending,
  parseTikzEditorMessage
} from "./tikzEmbedProtocol";

describe("TikZ embed protocol", () => {
  it("accepts object and JSON messages and rejects invalid payloads", () => {
    expect(parseTikzEditorMessage('{"event":"autosave","source":"figure"}')).toEqual({
      event: "autosave",
      source: "figure"
    });
    expect(parseTikzEditorMessage({ event: "loaded" })).toEqual({ event: "loaded" });
    expect(parseTikzEditorMessage("not json")).toBeNull();
    expect(parseTikzEditorMessage([])).toBeNull();
  });

  it("requires both the expected iframe window and same origin", () => {
    const frameWindow = {} as Window;

    expect(
      isTrustedTikzEditorEvent(
        { origin: "https://typr.test", source: frameWindow },
        frameWindow,
        "https://typr.test"
      )
    ).toBe(true);
    expect(
      isTrustedTikzEditorEvent(
        { origin: "https://other.test", source: frameWindow },
        frameWindow,
        "https://typr.test"
      )
    ).toBe(false);
    expect(
      isTrustedTikzEditorEvent(
        { origin: "https://typr.test", source: {} as Window },
        frameWindow,
        "https://typr.test"
      )
    ).toBe(false);
  });

  it("recognizes SVG exports that are still waiting for the preview", () => {
    expect(isTikzSvgExportPending({}, "")).toBe(true);
    expect(
      isTikzSvgExportPending(
        { error: "SVG is not ready yet. Wait for the preview to finish rendering and try again." },
        ""
      )
    ).toBe(true);
    expect(isTikzSvgExportPending({ error: "The figure is invalid." }, "")).toBe(false);
    expect(isTikzSvgExportPending({}, "<svg />")).toBe(false);
  });
});
