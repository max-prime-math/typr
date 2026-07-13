import { describe, expect, it } from "vitest";
import type { DiagramAsset } from "../app/appState";
import { serializeDiagramSvg } from "./diagramSvgSerializer";

describe("serializeDiagramSvg", () => {
  it("preserves SVG-Edit content byte-for-byte", () => {
    const content = "  <svg xmlns=\"http://www.w3.org/2000/svg\"><text>SVG-Edit</text></svg>\n";

    expect(
      serializeDiagramSvg({
        id: "diagram-svg-edit",
        name: "svg-edit.svg",
        updatedAt: "2026-07-10T00:00:00.000Z",
        frame: null,
        content,
        strokes: [],
        shapes: []
      })
    ).toBe(content);
  });

  it("serializes legacy strokes and shapes in update order", () => {
    const diagram: DiagramAsset = {
      id: "diagram-legacy",
      name: "legacy.svg",
      updatedAt: "2026-07-10T00:00:00.000Z",
      frame: { x: -10, y: 5, width: 320, height: 180 },
      strokes: [
        {
          id: "stroke-1",
          color: "#123456",
          width: 2.5,
          strokeStyle: "dotted",
          startMarker: "dot",
          endMarker: "arrow",
          points: [
            { x: 0, y: 10, pressure: 1 },
            { x: 20, y: 30, pressure: 1 },
            { x: 50, y: 15, pressure: 1 }
          ],
          updatedAt: "2026-07-10T00:00:02.000Z"
        },
        {
          id: "stroke-dot",
          color: "#abcdef",
          width: 3,
          strokeStyle: "solid",
          startMarker: "none",
          endMarker: "none",
          points: [{ x: 7.25, y: 8.5, pressure: 1 }],
          updatedAt: "2026-07-10T00:00:00.000Z"
        }
      ],
      shapes: [
        {
          kind: "rect",
          id: "rect-1",
          strokeColor: "#ff0000",
          strokeWidth: 4,
          strokeStyle: "dashed",
          fillColor: "#ffeeaa",
          rotation: Math.PI / 6,
          x: 10,
          y: 20,
          width: 40,
          height: 30,
          originX: 10,
          originY: 20,
          updatedAt: "2026-07-10T00:00:01.000Z"
        },
        {
          kind: "ellipse",
          id: "ellipse-1",
          strokeColor: "#00aa00",
          strokeWidth: 1.5,
          strokeStyle: "fine-dotted",
          fillColor: "transparent",
          rotation: 0,
          cx: 100,
          cy: 50,
          rx: 15,
          ry: 10,
          originX: 85,
          originY: 40,
          updatedAt: "2026-07-10T00:00:03.000Z"
        },
        {
          kind: "line",
          id: "line-1",
          strokeColor: "#0000ff",
          strokeWidth: 2,
          strokeStyle: "solid",
          startMarker: "open-dot",
          endMarker: "none",
          x1: 120,
          y1: 30,
          x2: 180,
          y2: 70,
          updatedAt: "2026-07-10T00:00:04.000Z"
        },
        {
          kind: "bezier",
          id: "bezier-1",
          strokeColor: "#765432",
          strokeWidth: 3,
          strokeStyle: "dashed",
          startMarker: "none",
          endMarker: "dot",
          x1: 190,
          y1: 10,
          cx1: 210,
          cy1: 90,
          cx2: 240,
          cy2: -20,
          x2: 260,
          y2: 60,
          updatedAt: "2026-07-10T00:00:05.000Z"
        },
        {
          kind: "polygon",
          id: "polygon-1",
          strokeColor: "#111111",
          strokeWidth: 1,
          strokeStyle: "solid",
          fillColor: "#eeeeee",
          points: [
            { x: 30, y: 90, pressure: 1 },
            { x: 60.5, y: 100, pressure: 1 },
            { x: 45, y: 130.25, pressure: 1 }
          ],
          updatedAt: "2026-07-10T00:00:06.000Z"
        }
      ]
    };

    expect(serializeDiagramSvg(diagram)).toMatchSnapshot();
  });

  it("derives the legacy viewBox when no frame is stored", () => {
    expect(
      serializeDiagramSvg({
        id: "diagram-auto-frame",
        name: "auto-frame.svg",
        updatedAt: "2026-07-10T00:00:00.000Z",
        frame: null,
        strokes: [
          {
            id: "stroke-auto-frame",
            color: "#000000",
            width: 4,
            strokeStyle: "solid",
            startMarker: "none",
            endMarker: "arrow",
            points: [
              { x: 10, y: 20, pressure: 1 },
              { x: 50, y: 60, pressure: 1 }
            ],
            updatedAt: "2026-07-10T00:00:00.000Z"
          }
        ],
        shapes: []
      })
    ).toMatchSnapshot();
  });
});
