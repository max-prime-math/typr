import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { getMinimalTextChange, resolveControlledValue } from "./controlledValueSync";

describe("controlled editor value synchronization", () => {
  it("defers an intermediate React acknowledgement while newer input is pending", () => {
    expect(resolveControlledValue("typed", "type", true)).toBe("defer");
    expect(resolveControlledValue("first\nsecond", "first", true)).toBe("defer");
  });

  it("acknowledges the latest local value and applies genuine external values", () => {
    expect(resolveControlledValue("typed", "typed", true)).toBe("acknowledge");
    expect(resolveControlledValue("typed", "external", false)).toBe("apply");
  });

  it("maps a cursor across an external insertion instead of retaining a stale offset", () => {
    const currentValue = "first\nsecond";
    const nextValue = "heading\nfirst\nsecond";
    const state = EditorState.create({
      doc: currentValue,
      selection: EditorSelection.cursor(currentValue.length)
    });
    const change = getMinimalTextChange(currentValue, nextValue);

    expect(change).toEqual({ from: 0, to: 0, insert: "heading\n" });

    const transaction = state.update({ changes: change! });
    expect(transaction.newSelection.main.head).toBe(nextValue.length);
  });

  it("returns one replacement for a changed middle section", () => {
    expect(getMinimalTextChange("before old after", "before new after")).toEqual({
      from: 7,
      to: 10,
      insert: "new"
    });
    expect(getMinimalTextChange("same", "same")).toBeNull();
  });
});
