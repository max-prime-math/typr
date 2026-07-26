import { describe, expect, it, vi } from "vitest";
import {
  UpdateManager,
  parseReleaseMetadata,
  type RegisterServiceWorker,
  type ServiceWorkerRegistrationCallbacks,
  type UpdateManagerRuntime
} from "./updateManager";

function createHarness({ online = true }: { online?: boolean } = {}) {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  let isOnline = online;
  let visibilityState: DocumentVisibilityState = "visible";
  let now = 10_000;
  let callbacks: ServiceWorkerRegistrationCallbacks | null = null;
  const activate = vi.fn(async () => {});
  const update = vi.fn(async () => {});
  const registration = {
    active: {} as ServiceWorker,
    update
  } as unknown as ServiceWorkerRegistration;
  const runtime: UpdateManagerRuntime = {
    addDocumentListener(type, listener) {
      documentTarget.addEventListener(type, listener);
    },
    addWindowListener(type, listener) {
      windowTarget.addEventListener(type, listener);
    },
    fetch: vi.fn(async () => new Response("{}", { status: 404 })),
    getBaseUrl: () => "https://example.test/typr/",
    getVisibilityState: () => visibilityState,
    hasServiceWorkerController: () => true,
    isOnline: () => isOnline,
    isProduction: () => true,
    isServiceWorkerSupported: () => true,
    now: () => now,
    setInterval: vi.fn(() => 1)
  };
  const register: RegisterServiceWorker = (options) => {
    callbacks = options;
    return activate;
  };
  const manager = new UpdateManager(runtime);

  manager.initialize(register, vi.fn());

  return {
    activate,
    documentTarget,
    getCallbacks: () => {
      if (!callbacks) {
        throw new Error("Service worker callbacks were not registered.");
      }
      return callbacks;
    },
    manager,
    registration,
    runtime,
    setNow(value: number) {
      now = value;
    },
    setOnline(value: boolean) {
      isOnline = value;
    },
    setVisibility(value: DocumentVisibilityState) {
      visibilityState = value;
    },
    update,
    windowTarget
  };
}

describe("update manager", () => {
  it("checks at startup when online and remains quiet when the check fails", async () => {
    const harness = createHarness();
    harness.update.mockRejectedValueOnce(new Error("offline gateway"));

    harness.getCallbacks().onRegisteredSW("sw.js", harness.registration);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.manager.getSnapshot().phase).toBe("current");
    expect(harness.manager.getSnapshot().attentionRequired).toBe(false);
  });

  it("waits while offline and checks when the browser reconnects", async () => {
    const harness = createHarness({ online: false });
    harness.getCallbacks().onRegisteredSW("sw.js", harness.registration);
    await Promise.resolve();

    expect(harness.update).not.toHaveBeenCalled();

    harness.setOnline(true);
    harness.windowTarget.dispatchEvent(new Event("online"));
    await Promise.resolve();

    expect(harness.update).toHaveBeenCalledTimes(1);
  });

  it("activates a downloaded update automatically only in a safe state", async () => {
    const harness = createHarness();
    const prepare = vi.fn(async () => {});
    harness.getCallbacks().onRegisteredSW("sw.js", harness.registration);
    await harness.manager.checkForUpdates(true);
    harness.manager.setRestartSafety({ safe: true, prepare });

    harness.getCallbacks().onNeedRefresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(harness.activate).toHaveBeenCalledWith(true);
    expect(harness.manager.getSnapshot().attentionRequired).toBe(false);
  });

  it("shows attention for an unsafe update and installs it when the state becomes safe", async () => {
    const harness = createHarness();
    harness.getCallbacks().onRegisteredSW("sw.js", harness.registration);
    await harness.manager.checkForUpdates(true);
    harness.manager.setRestartSafety({ safe: false });

    harness.getCallbacks().onNeedRefresh();

    expect(harness.manager.getSnapshot()).toMatchObject({
      phase: "ready",
      attentionRequired: true
    });
    expect(harness.activate).not.toHaveBeenCalled();

    harness.manager.setRestartSafety({ safe: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.activate).toHaveBeenCalledWith(true);
  });

  it("lets an explicit update flush persistence and proceed from an unsafe state", async () => {
    const harness = createHarness();
    const prepare = vi.fn(async () => {});
    harness.getCallbacks().onRegisteredSW("sw.js", harness.registration);
    await harness.manager.checkForUpdates(true);
    harness.manager.setRestartSafety({ safe: false, prepare });
    harness.getCallbacks().onNeedRefresh();

    await harness.manager.activateUpdate(true);

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(harness.activate).toHaveBeenCalledWith(true);
  });

  it("checks again after returning from a hidden tab once the throttle expires", async () => {
    const harness = createHarness();
    harness.getCallbacks().onRegisteredSW("sw.js", harness.registration);
    await harness.manager.checkForUpdates(true);
    harness.update.mockClear();
    harness.setNow(100_000);

    harness.setVisibility("hidden");
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    harness.setVisibility("visible");
    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    expect(harness.update).toHaveBeenCalledTimes(1);
  });
});

describe("release metadata", () => {
  it("normalizes supported release notes and breaking-update flags", () => {
    expect(
      parseReleaseMetadata({
        version: " 0.9.0 ",
        build: "abcdef0",
        breaking: true,
        backupRecommended: true,
        notes: ["Workspace format updated", "", 42]
      })
    ).toEqual({
      version: "0.9.0",
      build: "abcdef0",
      breaking: true,
      backupRecommended: true,
      notes: ["Workspace format updated"]
    });
  });

  it("rejects metadata without a version", () => {
    expect(parseReleaseMetadata({ notes: [] })).toBeNull();
  });
});
