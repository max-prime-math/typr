import { describe, expect, it, vi } from "vitest";
import {
  EDITOR_INPUT_QUIET_WINDOW_MS,
  getInputPriorityWaitMs,
  markEditorInputActivity,
  subscribeToEditorInputActivity
} from "./inputPriority";

describe("editor input priority", () => {
  it("holds background work until the editor has been quiet", () => {
    expect(getInputPriorityWaitMs(1_000, 1_040)).toBe(
      EDITOR_INPUT_QUIET_WINDOW_MS - 40
    );
    expect(getInputPriorityWaitMs(1_000, 1_000 + EDITOR_INPUT_QUIET_WINDOW_MS)).toBe(0);
  });

  it("continues holding work while the browser reports queued input", () => {
    expect(getInputPriorityWaitMs(1_000, 2_000, true)).toBe(
      EDITOR_INPUT_QUIET_WINDOW_MS
    );
  });

  it("does not delay work before the first editor input", () => {
    expect(getInputPriorityWaitMs(Number.NEGATIVE_INFINITY, 1_000)).toBe(0);
  });

  it("synchronously preempts subscribed background work", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToEditorInputActivity(listener);

    markEditorInputActivity(1_000);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    markEditorInputActivity(1_100);
    expect(listener).toHaveBeenCalledOnce();
  });
});
