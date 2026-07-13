import { afterEach, describe, expect, it, vi } from "vitest";

describe("Typst compiler worker lifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("uses the module worker when construction succeeds", async () => {
    const workerResult = {
      ok: true as const,
      engine: "typst-ts" as const,
      diagnostics: [],
      output: {
        kind: "svg" as const,
        content: "<svg>worker</svg>"
      }
    };
    const fallbackCompile = vi.fn();
    const statusListener = vi.fn();
    const workerListeners = new Map<string, EventListener>();
    const worker = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        workerListeners.set(type, listener);
      }),
      removeEventListener: vi.fn(),
      terminate: vi.fn(),
      postMessage: vi.fn((request: { id: number }) => {
        workerListeners.get("message")?.({
          data: {
            id: request.id,
            type: "result",
            result: workerResult
          }
        } as unknown as Event);
      })
    };
    const WorkerMock = vi.fn(function WorkerMock(
      _scriptUrl: string | URL,
      _options?: WorkerOptions
    ) {
      return worker;
    });

    vi.doMock("./typstCompilerMainThread", () => ({
      createMainThreadTypstCompiler: () => ({
        compileDocument: fallbackCompile,
        dispose: vi.fn()
      })
    }));
    vi.stubGlobal("Worker", WorkerMock);
    vi.stubGlobal("window", {
      setTimeout: vi.fn()
    });

    const { createTypstCompiler } = await import("./typstCompiler");
    const compiler = createTypstCompiler({ onStatusChange: statusListener });
    const result = await compiler.compileDocument("Hello from the worker");

    expect(result).toEqual(workerResult);
    expect(WorkerMock).toHaveBeenCalledTimes(1);
    expect(WorkerMock.mock.calls[0]?.[0]).toBeInstanceOf(URL);
    expect(String(WorkerMock.mock.calls[0]?.[0])).toContain(
      "typstCompiler.worker.ts"
    );
    expect(WorkerMock.mock.calls[0]?.[1]).toEqual({ type: "module" });
    expect(worker.addEventListener).toHaveBeenCalledWith(
      "message",
      expect.any(Function)
    );
    expect(worker.addEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function)
    );
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "compile",
        source: "Hello from the worker"
      })
    );
    expect(fallbackCompile).not.toHaveBeenCalled();
    expect(statusListener).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: "fallback-main-thread" })
    );
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it("falls back to the main-thread compiler when module worker construction is blocked", async () => {
    const fallbackResult = {
      ok: true as const,
      engine: "mock" as const,
      diagnostics: [],
      output: {
        kind: "svg" as const,
        content: "<svg></svg>"
      }
    };
    const fallbackCompile = vi.fn(async () => fallbackResult);
    const statusListener = vi.fn();
    const WorkerMock = vi.fn(function WorkerMock() {
      throw new Error("Module workers are blocked");
    });

    vi.doMock("./typstCompilerMainThread", () => ({
      createMainThreadTypstCompiler: () => ({
        compileDocument: fallbackCompile,
        dispose: vi.fn()
      })
    }));
    vi.stubGlobal("Worker", WorkerMock);

    const { createTypstCompiler } = await import("./typstCompiler");
    const compiler = createTypstCompiler({ onStatusChange: statusListener });

    await expect(
      compiler.compileDocument("#set page(width: auto)\nHello")
    ).resolves.toEqual(fallbackResult);
    await expect(compiler.compileDocument("Hello again")).resolves.toEqual(
      fallbackResult
    );

    expect(WorkerMock).toHaveBeenCalledTimes(1);
    expect(WorkerMock.mock.results[0]?.type).toBe("throw");
    expect(fallbackCompile).toHaveBeenCalledTimes(2);
    expect(statusListener).toHaveBeenCalledTimes(1);
    expect(statusListener).toHaveBeenCalledWith({
      phase: "fallback-main-thread",
      mode: "main-thread",
      label: "Using main-thread fallback",
      detail: "Module workers are blocked"
    });
  });
});


describe("Typst compiler memory release", () => {
  it("recreates the shared worker after memory is released", async () => {
    const workerResult = {
      ok: true as const,
      engine: "typst-ts" as const,
      diagnostics: [],
      output: { kind: "svg" as const, content: "<svg />" }
    };
    const workers: Array<{
      listeners: Map<string, EventListener>;
      terminate: ReturnType<typeof vi.fn>;
    }> = [];
    const WorkerMock = vi.fn(function WorkerMock() {
      const listeners = new Map<string, EventListener>();
      const worker = {
        listeners,
        addEventListener: vi.fn((type: string, listener: EventListener) => {
          listeners.set(type, listener);
        }),
        removeEventListener: vi.fn(),
        terminate: vi.fn(),
        postMessage: vi.fn((request: { id: number }) => {
          listeners.get("message")?.({
            data: { id: request.id, type: "result", result: workerResult }
          } as unknown as Event);
        })
      };
      workers.push(worker);
      return worker;
    });

    vi.doMock("./typstCompilerMainThread", () => ({
      createMainThreadTypstCompiler: () => ({
        compileDocument: vi.fn(),
        dispose: vi.fn()
      })
    }));
    vi.stubGlobal("Worker", WorkerMock);
    vi.stubGlobal("window", { setTimeout: vi.fn() });

    const { createTypstCompiler, releaseTypstCompilerMemory } = await import("./typstCompiler");
    const compiler = createTypstCompiler();

    await expect(compiler.compileDocument("first")).resolves.toEqual(workerResult);
    releaseTypstCompilerMemory();
    await expect(compiler.compileDocument("second")).resolves.toEqual(workerResult);

    expect(WorkerMock).toHaveBeenCalledTimes(2);
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1);
    compiler.dispose();
    releaseTypstCompilerMemory();
  });
});
