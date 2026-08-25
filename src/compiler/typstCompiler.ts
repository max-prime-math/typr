import type {
  CompilerWorkerRequest,
  CompilerWorkerResponse
} from "./protocol";
import { TYPST_WORKER_REQUEST_TIMEOUT_MS } from "./typstTimeouts";
import type {
  CompileAssetFile,
  CompileDocumentOptions,
  CompilerStatus,
  CompileResult,
  TypstCompiler,
  TypstCompilerOptions
} from "./types";

interface PendingRequest {
  resolve: (value: CompileResult | void) => void;
  reject: (reason?: unknown) => void;
}

export { type CompileResult } from "./types";
export { type CompilerStatus } from "./types";

const statusListeners = new Set<(status: CompilerStatus) => void>();
let sharedCompilerInstance: WorkerBackedTypstCompiler | null = null;

export function createTypstCompiler(options: TypstCompilerOptions = {}): TypstCompiler {
  if (options.onStatusChange) {
    statusListeners.add(options.onStatusChange);
  }

  return {
    compileDocument(
      source: string,
      assets?: CompileAssetFile[],
      options?: CompileDocumentOptions
    ): Promise<CompileResult> {
      return getSharedCompilerInstance().compileDocument(source, assets, options);
    },
    dispose(): void {
      if (options.onStatusChange) {
        statusListeners.delete(options.onStatusChange);
      }
    }
  };
}

/**
 * Creates a dedicated compiler worker for latency-sensitive secondary work.
 * Its requests and status messages stay isolated from the document compiler.
 */
export function createIsolatedTypstCompiler(
  options: TypstCompilerOptions = {}
): TypstCompiler {
  return new WorkerBackedTypstCompiler(options);
}

export function warmTypstCompilerForOffline(): Promise<void> {
  return getSharedCompilerInstance().warmForOffline();
}

export function releaseTypstCompilerMemory(): void {
  sharedCompilerInstance?.dispose();
  sharedCompilerInstance = null;
}

function getSharedCompilerInstance(): WorkerBackedTypstCompiler {
  if (!sharedCompilerInstance) {
    sharedCompilerInstance = new WorkerBackedTypstCompiler({
      onStatusChange: broadcastStatus
    });
  }

  return sharedCompilerInstance;
}

function broadcastStatus(status: CompilerStatus): void {
  for (const listener of statusListeners) {
    listener(status);
  }
}

class WorkerBackedTypstCompiler implements TypstCompiler {
  private readonly worker: Worker | null = null;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private workerAvailable = true;
  private workerFailureDetail = "Typst compiler worker is unavailable.";
  private readonly workerRequestTimeoutMs = TYPST_WORKER_REQUEST_TIMEOUT_MS;
  private readonly notifyStatus: (status: CompilerStatus) => void;

  constructor(options: TypstCompilerOptions) {
    this.notifyStatus = options.onStatusChange ?? (() => {});
    try {
      this.worker = new Worker(
        new URL("./typstCompiler.worker.ts", import.meta.url),
        {
          type: "module"
        }
      );
    } catch (error) {
      this.workerAvailable = false;
      this.workerFailureDetail =
        error instanceof Error ? error.message : "Worker construction failed";
      this.notifyStatus({
        phase: "error",
        mode: "worker",
        label: "Compiler worker unavailable",
        detail: this.workerFailureDetail
      });
      return;
    }

    this.worker.addEventListener(
      "message",
      this.handleWorkerMessage as EventListener
    );
    this.worker.addEventListener("error", this.handleWorkerError);
  }

  warmForOffline(): Promise<void> {
    if (!this.workerAvailable || !this.worker) {
      return Promise.reject(new Error("Typst compiler worker is unavailable."));
    }

    return this.sendRequest({
      id: this.createRequestId(),
      type: "warm"
    }).then(() => undefined);
  }

  compileDocument(
    source: string,
    assets: CompileAssetFile[] = [],
    options: CompileDocumentOptions = {}
  ): Promise<CompileResult> {
    if (!this.workerAvailable) {
      return Promise.resolve(createWorkerUnavailableResult(this.workerFailureDetail));
    }

    return this.sendRequest({
      id: this.createRequestId(),
      type: "compile",
      source,
      assets,
      options
    })
      .then((result) => result as CompileResult)
      .catch((error: unknown) => {
        this.disableWorker();
        this.workerFailureDetail =
          error instanceof Error ? error.message : "Worker timed out or failed";
        this.notifyStatus({
          phase: "error",
          mode: "worker",
          label: "Compiler worker unavailable",
          detail: this.workerFailureDetail
        });
        return createWorkerUnavailableResult(this.workerFailureDetail);
      });
  }

  dispose(): void {
    this.worker?.removeEventListener(
      "message",
      this.handleWorkerMessage as EventListener
    );
    this.worker?.removeEventListener("error", this.handleWorkerError);
    this.worker?.terminate();

    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(new Error("Typst compiler worker was disposed."));
    }

    this.pendingRequests.clear();
  }

  private createRequestId(): number {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return requestId;
  }

  private sendRequest(request: CompilerWorkerRequest): Promise<CompileResult | void> {
    return new Promise<CompileResult | void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Typst compiler worker is unavailable."));
        return;
      }

      this.pendingRequests.set(request.id, { resolve, reject });
      this.worker.postMessage(request);

      window.setTimeout(() => {
        const pendingRequest = this.pendingRequests.get(request.id);

        if (!pendingRequest) {
          return;
        }

        this.pendingRequests.delete(request.id);
        reject(new Error("Typst compiler worker timed out."));
      }, this.workerRequestTimeoutMs);
    });
  }

  private handleWorkerMessage = (
    event: MessageEvent<CompilerWorkerResponse>
  ): void => {
    const response = event.data;
    if (response.type === "status") {
      this.notifyStatus(response.status);
      return;
    }

    const pendingRequest = this.pendingRequests.get(response.id);

    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.type === "error") {
      pendingRequest.reject(new Error(response.message));
      return;
    }

    if (response.type === "warm-result") {
      pendingRequest.resolve();
      return;
    }

    pendingRequest.resolve(response.result);
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "Typst compiler worker crashed.");
    this.workerFailureDetail = error.message;
    this.disableWorker();
    this.notifyStatus({
      phase: "error",
      mode: "worker",
      label: "Compiler worker unavailable",
      detail: this.workerFailureDetail
    });

    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(error);
    }

    this.pendingRequests.clear();
  };

  private disableWorker(): void {
    if (!this.workerAvailable) {
      return;
    }

    this.workerAvailable = false;
    this.worker?.terminate();
  }
}

function createWorkerUnavailableResult(detail: string): CompileResult {
  return {
    ok: false,
    engine: "typst-ts",
    errors: [
      {
        severity: "error",
        message: `Typst compilation requires a background worker. ${detail}`
      }
    ]
  };
}
