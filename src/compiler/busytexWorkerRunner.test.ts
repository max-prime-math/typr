import { afterEach, describe, expect, it, vi } from "vitest";
import { BusyTexWorkerRunner } from "./busytexWorkerRunner";

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  messages: unknown[] = [];

  constructor() {
    fakeWorkers.push(this);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }
}

let fakeWorkers: FakeWorker[] = [];

describe("BusyTexWorkerRunner", () => {
  afterEach(() => {
    fakeWorkers = [];
    vi.unstubAllGlobals();
  });

  it("rejects initialization promptly when terminated during asset checks", async () => {
    const resolveFetches: Array<() => void> = [];
    installBrowserStubs(() =>
      new Promise<{ ok: boolean }>((resolve) => {
        resolveFetches.push(() => resolve({ ok: true }));
      })
    );

    const runner = createRunner();
    const initialization = runner.initialize();

    runner.terminate("BusyTeX compile was superseded.");

    await expect(initialization).rejects.toThrow("BusyTeX compile was superseded.");
    for (const resolveFetch of resolveFetches) {
      resolveFetch();
    }
    await Promise.resolve();
    expect(fakeWorkers).toHaveLength(0);
  });

  it("rejects initialization promptly when terminated after worker creation", async () => {
    installBrowserStubs(async () => ({ ok: true }));

    const runner = createRunner();
    const initialization = runner.initialize();

    for (let attempt = 0; attempt < 10 && fakeWorkers.length === 0; attempt += 1) {
      await Promise.resolve();
    }

    expect(fakeWorkers).toHaveLength(1);
    runner.terminate("BusyTeX compile was superseded.");

    await expect(initialization).rejects.toThrow("BusyTeX compile was superseded.");
    expect(fakeWorkers[0].terminated).toBe(true);
  });
});

function createRunner(): BusyTexWorkerRunner {
  return new BusyTexWorkerRunner({
    busytexBasePath: "/core/busytex",
    preloadDataPackages: [],
    catalogDataPackages: []
  });
}

type FetchStub = (...args: Parameters<typeof fetch>) => Promise<{ ok: boolean }>;

function installBrowserStubs(fetchImpl: FetchStub): void {
  vi.stubGlobal("window", {
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis)
  });
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
}
