import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLifecyclePersistence } from "./lifecyclePersistence";

class VisibilityEventTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

describe("lifecycle persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createHarness() {
    const windowTarget = new EventTarget();
    const documentTarget = new VisibilityEventTarget();
    const saveSnapshot = vi.fn(async () => {});
    const saveProjectStorage = vi.fn(async () => {});
    const persistence = createLifecyclePersistence({
      debounceMs: 250,
      documentTarget,
      saveProjectStorage,
      saveSnapshot,
      windowTarget
    });

    return {
      documentTarget,
      persistence,
      saveProjectStorage,
      saveSnapshot,
      windowTarget
    };
  }

  it("persists the latest edit immediately on pagehide without a later stale debounce", () => {
    const harness = createHarness();

    harness.persistence.update({
      projectStorage: { revision: "initial" },
      snapshot: { revision: "initial" }
    });
    harness.persistence.update({
      projectStorage: { revision: "latest" },
      snapshot: { revision: "latest" }
    });

    harness.windowTarget.dispatchEvent(new Event("pagehide"));

    expect(harness.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.saveSnapshot).toHaveBeenLastCalledWith({ revision: "latest" });
    expect(harness.saveProjectStorage).toHaveBeenCalledTimes(1);
    expect(harness.saveProjectStorage).toHaveBeenLastCalledWith({ revision: "latest" });

    vi.advanceTimersByTime(250);
    expect(harness.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.saveProjectStorage).toHaveBeenCalledTimes(1);
  });

  it("persists the latest edit when visibility becomes hidden and deduplicates pagehide", () => {
    const harness = createHarness();

    harness.persistence.update({
      projectStorage: { revision: "latest" },
      snapshot: { revision: "latest" }
    });
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(harness.saveSnapshot).not.toHaveBeenCalled();
    expect(harness.saveProjectStorage).not.toHaveBeenCalled();

    harness.documentTarget.visibilityState = "hidden";
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    harness.windowTarget.dispatchEvent(new Event("pagehide"));

    expect(harness.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.saveSnapshot).toHaveBeenLastCalledWith({ revision: "latest" });
    expect(harness.saveProjectStorage).toHaveBeenCalledTimes(1);
    expect(harness.saveProjectStorage).toHaveBeenLastCalledWith({ revision: "latest" });
  });

  it("persists the latest edit during cleanup and removes lifecycle listeners", () => {
    const harness = createHarness();
    const removeWindowListener = vi.spyOn(harness.windowTarget, "removeEventListener");
    const removeDocumentListener = vi.spyOn(harness.documentTarget, "removeEventListener");

    harness.persistence.update({
      projectStorage: { revision: "initial" },
      snapshot: { revision: "initial" }
    });
    harness.persistence.update({
      projectStorage: { revision: "latest" },
      snapshot: { revision: "latest" }
    });

    harness.persistence.dispose();
    expect(removeWindowListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    expect(harness.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.saveSnapshot).toHaveBeenLastCalledWith({ revision: "latest" });
    expect(harness.saveProjectStorage).toHaveBeenCalledTimes(1);
    expect(harness.saveProjectStorage).toHaveBeenLastCalledWith({ revision: "latest" });

    harness.documentTarget.visibilityState = "hidden";
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    harness.windowTarget.dispatchEvent(new Event("pagehide"));
    harness.persistence.dispose();
    vi.advanceTimersByTime(250);

    expect(harness.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.saveProjectStorage).toHaveBeenCalledTimes(1);
  });

  it("lets destructive actions await an already active persistence request", async () => {
    let finishProjectStorageSave: (() => void) | undefined;
    const saveProjectStorage = vi.fn(
      () => new Promise<void>((resolve) => {
        finishProjectStorageSave = resolve;
      })
    );
    const persistence = createLifecyclePersistence({
      debounceMs: 250,
      documentTarget: new VisibilityEventTarget(),
      saveProjectStorage,
      saveSnapshot: vi.fn(async () => {}),
      windowTarget: new EventTarget()
    });
    persistence.update({
      projectStorage: { revision: "latest" },
      snapshot: { revision: "latest" }
    });

    const firstRequest = persistence.persistNow();
    const flushRequest = persistence.persistNow();
    let didFlush = false;
    void flushRequest.then(() => {
      didFlush = true;
    });

    await Promise.resolve();
    expect(didFlush).toBe(false);
    expect(saveProjectStorage).toHaveBeenCalledTimes(1);

    finishProjectStorageSave?.();
    await firstRequest;
    await flushRequest;

    expect(didFlush).toBe(true);
  });

  it("reports pending changes through the debounce and active save", async () => {
    const harness = createHarness();

    expect(harness.persistence.hasPendingChanges()).toBe(false);

    harness.persistence.update({
      projectStorage: { revision: "latest" },
      snapshot: { revision: "latest" }
    });
    expect(harness.persistence.hasPendingChanges()).toBe(true);

    await harness.persistence.persistNow();
    expect(harness.persistence.hasPendingChanges()).toBe(false);
  });
});
