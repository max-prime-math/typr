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

  it("skips the heap reset snapshot only for configured single-pass compiles", async () => {
    installBrowserStubs(async () => ({ ok: true }));

    const runner = createRunner({ skipSinglePassMemoryRestore: true });
    const initialization = runner.initialize();

    for (let attempt = 0; attempt < 10 && fakeWorkers.length === 0; attempt += 1) {
      await Promise.resolve();
    }

    const worker = fakeWorkers[0];
    expect(worker.messages[0]).toMatchObject({
      busytex_pipeline_js: "/core/busytex/busytex_pipeline.js?v=2"
    });
    worker.onmessage?.({ data: { initialized: {} } } as MessageEvent);
    await initialization;

    const quickCompile = runner.compile(
      [],
      "main.tex",
      false,
      false,
      false,
      "silent",
      "pdftex_bibtex8",
      null,
      ""
    );
    expect(worker.messages.at(-1)).toMatchObject({ skip_memory_restore: true });
    worker.onmessage?.({
      data: { pdf: new Uint8Array(), exit_code: 0 }
    } as MessageEvent);
    await quickCompile;

    const fullCompile = runner.compile(
      [],
      "main.tex",
      null,
      null,
      true,
      "silent",
      "pdftex_bibtex8",
      null,
      ""
    );
    expect(worker.messages.at(-1)).toMatchObject({ skip_memory_restore: false });
    worker.onmessage?.({
      data: { pdf: new Uint8Array(), exit_code: 0 }
    } as MessageEvent);
    await fullCompile;
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

function createRunner(
  overrides: Partial<ConstructorParameters<typeof BusyTexWorkerRunner>[0]> = {}
): BusyTexWorkerRunner {
  return new BusyTexWorkerRunner({
    busytexBasePath: "/core/busytex",
    preloadDataPackages: [],
    catalogDataPackages: [],
    ...overrides
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
