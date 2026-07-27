import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HarperWorkerRequest,
  HarperWorkerResponse
} from "./harperDiagnostics.protocol";

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly listeners = new Map<string, (event: MessageEvent<HarperWorkerResponse>) => void>();
  readonly messages: HarperWorkerRequest[] = [];
  readonly terminate = vi.fn();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<HarperWorkerResponse>) => void
  ): void {
    this.listeners.set(type, listener);
  }

  postMessage(message: HarperWorkerRequest): void {
    this.messages.push(message);
  }

  emitMessage(response: HarperWorkerResponse): void {
    this.listeners.get("message")?.({ data: response } as MessageEvent<HarperWorkerResponse>);
  }
}

describe("Harper diagnostics worker memory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("terminates the worker after the idle release interval", async () => {
    const {
      HARPER_DIAGNOSTICS_IDLE_RELEASE_MS,
      lintWithHarperWorker,
      releaseHarperDiagnosticsMemory
    } = await import("./harperDiagnosticsWorkerClient");
    const lintPromise = lintWithHarperWorker("A sentence.", "plaintext");
    const worker = FakeWorker.instances[0];

    expect(worker).toBeDefined();
    expect(worker.messages).toHaveLength(1);

    worker.emitMessage({
      id: worker.messages[0].id,
      ok: true,
      lints: []
    });
    await expect(lintPromise).resolves.toEqual([]);

    vi.advanceTimersByTime(HARPER_DIAGNOSTICS_IDLE_RELEASE_MS - 1);
    expect(worker.terminate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    releaseHarperDiagnosticsMemory();
  });
});
