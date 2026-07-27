/// <reference lib="webworker" />

import {
  TYLAX_VERSION,
  type TylaxCheckSummary,
  type TylaxWorkerRequest,
  type TylaxWorkerResponse
} from "./tylaxTypes";

declare const self: DedicatedWorkerGlobalScope;

interface TylaxModule {
  default(options?: { module_or_path?: string | URL }): Promise<WebAssembly.Exports>;
  checkLatex(source: string): TylaxCheckSummary;
  getVersion(): string;
  tikzToCetz(source: string): string;
}

let modulePromise: Promise<TylaxModule> | null = null;
let loadedModuleUrl: string | null = null;

self.addEventListener("message", (event: MessageEvent<TylaxWorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: TylaxWorkerRequest): Promise<void> {
  try {
    const module = await loadTylaxModule(request.moduleUrl);
    const diagnostics = normalizeDiagnostics(module.checkLatex(request.source));
    const cetz = module.tikzToCetz(request.source).trim();

    postResponse({
      id: request.id,
      ok: true,
      result: {
        cetz: cetz ? `${cetz}\n` : "",
        diagnostics,
        version: module.getVersion()
      }
    });
  } catch (error) {
    postResponse({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function loadTylaxModule(moduleUrl: string): Promise<TylaxModule> {
  if (modulePromise && loadedModuleUrl === moduleUrl) {
    return modulePromise;
  }

  loadedModuleUrl = moduleUrl;
  modulePromise = import(/* @vite-ignore */ moduleUrl)
    .then(async (module) => {
      const tylax = module as TylaxModule;
      await tylax.default();
      const version = tylax.getVersion();
      if (version !== TYLAX_VERSION) {
        throw new Error(
          `Tylax runtime version mismatch (expected ${TYLAX_VERSION}, received ${version}).`
        );
      }
      return tylax;
    })
    .catch((error) => {
      modulePromise = null;
      loadedModuleUrl = null;
      throw error;
    });

  return modulePromise;
}

function normalizeDiagnostics(value: TylaxCheckSummary): TylaxCheckSummary {
  return {
    errors: Array.isArray(value?.errors) ? value.errors.map(String) : [],
    warnings: Array.isArray(value?.warnings) ? value.warnings.map(String) : [],
    infos: Array.isArray(value?.infos) ? value.infos.map(String) : [],
    has_errors: Boolean(value?.has_errors)
  };
}

function postResponse(response: TylaxWorkerResponse): void {
  self.postMessage(response);
}
