import type {
  CompilerWorkerRequest,
  CompilerWorkerResponse
} from "./protocol";
import { createMainThreadTypstCompiler } from "./typstCompilerMainThread";
import { TYPST_WORKER_REQUEST_TIMEOUT_MS } from "./typstTimeouts";
import type {
  CompileAssetFile,
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

  const compiler = getSharedCompilerInstance();

  return {
    compileDocument(source: string, assets?: CompileAssetFile[]): Promise<CompileResult> {
      return compiler.compileDocument(source, assets);
    },
    dispose(): void {
      if (options.onStatusChange) {
        statusListeners.delete(options.onStatusChange);
      }
    }
  };
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
  private readonly fallbackCompiler: TypstCompiler;
  private readonly worker: Worker;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private workerAvailable = true;
  private readonly workerRequestTimeoutMs = TYPST_WORKER_REQUEST_TIMEOUT_MS;
  private readonly notifyStatus: (status: CompilerStatus) => void;

  constructor(options: TypstCompilerOptions) {
    this.notifyStatus = options.onStatusChange ?? (() => {});
    this.fallbackCompiler = createMainThreadTypstCompiler({
      onStatusChange: this.notifyStatus
    });
    this.worker = new Worker(
      new URL("./typstCompiler.worker.ts", import.meta.url),
      {
        type: "module"
      }
    );

    this.worker.addEventListener(
      "message",
      this.handleWorkerMessage as EventListener
    );
    this.worker.addEventListener("error", this.handleWorkerError);
  }

  compileDocument(source: string, assets: CompileAssetFile[] = []): Promise<CompileResult> {
    if (!this.workerAvailable) {
      return this.fallbackCompiler.compileDocument(source, assets);
    }

    return this.sendRequest({
      id: this.createRequestId(),
      type: "compile",
      source,
      assets
    })
      .then((result) => result as CompileResult)
      .catch(() => {
        this.disableWorker();
        this.notifyStatus({
          phase: "fallback-main-thread",
          mode: "main-thread",
          label: "Using main-thread fallback",
          detail: "Worker timed out or failed"
        });
        return this.fallbackCompiler.compileDocument(source, assets);
      });
  }

  dispose(): void {
    this.worker.removeEventListener(
      "message",
      this.handleWorkerMessage as EventListener
    );
    this.worker.removeEventListener("error", this.handleWorkerError);
    this.worker.terminate();
    this.fallbackCompiler.dispose();

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

    pendingRequest.resolve(response.result);
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    const error = new Error(event.message || "Typst compiler worker crashed.");
    this.disableWorker();
    this.notifyStatus({
      phase: "fallback-main-thread",
      mode: "main-thread",
      label: "Using main-thread fallback",
      detail: event.message || "Worker crashed"
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
    this.worker.terminate();
  }
}
