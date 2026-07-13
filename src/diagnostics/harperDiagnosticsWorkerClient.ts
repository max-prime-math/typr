import type {
  HarperWorkerLanguage,
  HarperWorkerLint,
  HarperWorkerRequest,
  HarperWorkerResponse
} from "./harperDiagnostics.protocol";

interface PendingRequest {
  resolve: (lints: HarperWorkerLint[]) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  handleAbort?: () => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

export function releaseHarperDiagnosticsMemory(): void {
  worker?.terminate();
  worker = null;

  for (const id of [...pendingRequests.keys()]) {
    settleRequest(id, (pending) => pending.reject(createAbortError()));
  }
}

export function lintWithHarperWorker(
  text: string,
  language: HarperWorkerLanguage,
  signal?: AbortSignal
): Promise<HarperWorkerLint[]> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  const activeWorker = getWorker();
  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    const pending: PendingRequest = { resolve, reject, signal };

    if (signal) {
      pending.handleAbort = () => {
        pendingRequests.delete(id);
        reject(createAbortError());
      };
      signal.addEventListener("abort", pending.handleAbort, { once: true });
    }

    pendingRequests.set(id, pending);

    const request: HarperWorkerRequest = { id, text, language };
    try {
      activeWorker.postMessage(request);
    } catch (error) {
      settleRequest(id, () => {
        reject(error instanceof Error ? error : new Error("Unable to start Harper diagnostics."));
      });
    }
  });
}

function getWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(new URL("./harperDiagnostics.worker.ts", import.meta.url), {
    type: "module",
    name: "typr-harper-diagnostics"
  });
  worker.addEventListener("message", (event: MessageEvent<HarperWorkerResponse>) => {
    const response = event.data;
    settleRequest(response.id, (pending) => {
      if (response.ok) {
        pending.resolve(response.lints);
      } else {
        pending.reject(new Error(response.error));
      }
    });
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Harper diagnostics worker failed.");
    worker?.terminate();
    worker = null;
    for (const id of [...pendingRequests.keys()]) {
      settleRequest(id, (pending) => pending.reject(error));
    }
  });

  return worker;
}

function settleRequest(
  id: number,
  settle: (pending: PendingRequest) => void
): void {
  const pending = pendingRequests.get(id);
  if (!pending) {
    return;
  }

  pendingRequests.delete(id);
  if (pending.signal && pending.handleAbort) {
    pending.signal.removeEventListener("abort", pending.handleAbort);
  }
  settle(pending);
}

function createAbortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}
