import {
  TYLAX_CONVERSION_TIMEOUT_MS,
  type TylaxConversionResult,
  type TylaxWorkerRequest,
  type TylaxWorkerResponse
} from "./tylaxTypes";

interface PendingConversion {
  reject: (error: Error) => void;
  resolve: (result: TylaxConversionResult) => void;
  timeout: number;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingConversions = new Map<number, PendingConversion>();

export function convertTikzToCetz(source: string): Promise<TylaxConversionResult> {
  const activeWorker = getWorker();
  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<TylaxConversionResult>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingConversions.delete(id);
      resetWorker();
      reject(new Error("Tylax conversion timed out."));
    }, TYLAX_CONVERSION_TIMEOUT_MS);

    pendingConversions.set(id, { reject, resolve, timeout });
    activeWorker.postMessage({
      id,
      moduleUrl: new URL("core/tylax/tylax.js", document.baseURI).toString(),
      source
    } satisfies TylaxWorkerRequest);
  });
}

export function releaseTylaxWorker(): void {
  resetWorker();
}

function getWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(new URL("./tylax.worker.ts", import.meta.url), {
    name: "typr-tylax",
    type: "module"
  });
  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", handleWorkerError);
  return worker;
}

function handleWorkerMessage(event: MessageEvent<TylaxWorkerResponse>): void {
  const response = event.data;
  const pending = pendingConversions.get(response.id);
  if (!pending) {
    return;
  }

  window.clearTimeout(pending.timeout);
  pendingConversions.delete(response.id);

  if (response.ok) {
    pending.resolve(response.result);
  } else {
    pending.reject(new Error(response.error));
  }
}

function handleWorkerError(event: ErrorEvent): void {
  const error = new Error(event.message || "Tylax worker failed.");
  for (const pending of pendingConversions.values()) {
    window.clearTimeout(pending.timeout);
    pending.reject(error);
  }
  pendingConversions.clear();
  worker?.terminate();
  worker = null;
}

function resetWorker(): void {
  worker?.terminate();
  worker = null;

  for (const pending of pendingConversions.values()) {
    window.clearTimeout(pending.timeout);
    pending.reject(new Error("Tylax conversion was cancelled."));
  }
  pendingConversions.clear();
}
