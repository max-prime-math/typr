/// <reference lib="webworker" />

import { ensureTypstQueueMicrotask } from "./typstPolyfills";

import { createMockCompiler } from "./mockCompiler";
import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { loadFonts } from "@myriaddreamin/typst.ts/options.init";
import {
  loadCoreFontData,
  MAIN_FILE_PATH,
  type TypstFontLoadProgress
} from "./typstAssets";
import { normalizeTypstDiagnostic } from "./diagnostics";
import { DIAGRAM_COMPILER_ROOT } from "../diagram/diagramFiles";
import { extractTypstPackageReferencesFromCompileInputs } from "./typstPackages";
import { createTypstPackageStatusReporter } from "./typstPackageStatus";
import {
  ensureTypstPackageReferences,
  createTypstPackageRegistry
} from "./typstPackageRegistry";
import {
  TYPST_COMPILE_TIMEOUT_MESSAGE,
  TYPST_COMPILE_TIMEOUT_MS,
  TYPST_FIRST_COMPILE_TIMEOUT_MS,
  TYPST_INIT_TIMEOUT_MESSAGE,
  TYPST_INIT_TIMEOUT_MS
} from "./typstTimeouts";
import type {
  CompilerWorkerRequest,
  CompilerWorkerResponse
} from "./protocol";
import type {
  CompileAssetFile,
  CompilerStatus,
  CompileDiagnostic,
  CompileFailure,
  CompileResult,
  CompileSuccess
} from "./types";

declare const self: DedicatedWorkerGlobalScope;

interface TypstSnippetModule {
  TypstSnippet: {
    withAccessModel(accessModel: unknown): unknown;
    withPackageRegistry(registry: unknown): unknown;
  };
  $typst: {
    setCompilerInitOptions(options: { getModule: () => string }): void;
    setRendererInitOptions(options: { getModule: () => string }): void;
    use(...providers: unknown[]): void;
    getCompiler(): Promise<TypstCompilerDriver>;
    svg(options: { vectorData: Uint8Array }): Promise<string>;
  };
}

interface TypstCompilerDriver {
  addSource(path: string, source: string): void;
  mapShadow(path: string, content: Uint8Array): void;
  resetShadow(): void;
  compile(options: {
    mainFilePath: string;
    root?: string;
    diagnostics: "full";
  }): Promise<{
    hasError?: boolean;
    diagnostics?: TypstStructuredDiagnostic[];
    result?: Uint8Array;
  }>;
}

interface TypstStructuredDiagnostic {
  package: string;
  path: string;
  range: string;
  severity: string;
  message: string;
}

ensureTypstQueueMicrotask();

let initConfigured = false;
let bootstrapFailed = false;
let fallbackWarning: CompileDiagnostic | null = null;
let fontsPrimed = false;
let compilerDriverPromise: Promise<TypstCompilerDriver> | null = null;
const packageRegistry = createTypstPackageRegistry();

function emitStatus(id: number, status: CompilerStatus): void {
  postMessageToMain({
    id,
    type: "status",
    status
  });
}

async function loadTypstModule(requestId: number): Promise<TypstSnippetModule> {
  const module = (await import("@myriaddreamin/typst.ts/contrib/snippet")) as unknown as TypstSnippetModule;

  if (!initConfigured) {
    module.$typst.setCompilerInitOptions({
      getModule: () => typstCompilerWasmUrl
    });
    module.$typst.setRendererInitOptions({
      getModule: () => typstRendererWasmUrl
    });
    const coreFontData = await loadCoreFontData({
      onProgress: (progress) => emitFontLoadStatus(requestId, progress)
    });
    if (initConfigured) {
      return module;
    }
    emitStatus(requestId, {
      phase: "loading-fonts",
      mode: "worker",
      label: "Registering Typst fonts",
      detail: "Preparing loaded fonts for the compiler"
    });
    module.$typst.use(createCoreFontProvider(coreFontData));
    module.$typst.use(module.TypstSnippet.withAccessModel(packageRegistry.am));
    module.$typst.use(module.TypstSnippet.withPackageRegistry(packageRegistry));
    initConfigured = true;
  }

  return module;
}

async function getCompilerDriver(requestId: number): Promise<TypstCompilerDriver> {
  if (!compilerDriverPromise) {
    compilerDriverPromise = loadTypstModule(requestId).then((module) => module.$typst.getCompiler());
  }

  return compilerDriverPromise;
}

async function warmCompiler(requestId: number): Promise<void> {
  try {
    emitStatus(requestId, {
      phase: "worker-starting",
      mode: "worker",
      label: "Starting compiler worker"
    });
    emitStatus(requestId, {
      phase: "loading-typst",
      mode: "worker",
      label: "Loading Typst runtime"
    });
    await getCompilerDriver(requestId);
  } catch (error) {
    bootstrapFailed = true;
    fallbackWarning = {
      message: `Typst WASM bootstrap failed, using mock preview instead: ${formatUnknownError(
        error
      )}`,
      severity: "warning"
    };
  }
}

async function compileWithTypst(
  requestId: number,
  source: string,
  assets: CompileAssetFile[] = []
): Promise<CompileResult> {
  await withTimeout(
    warmCompiler(requestId),
    TYPST_INIT_TIMEOUT_MS,
    TYPST_INIT_TIMEOUT_MESSAGE
  );

  if (bootstrapFailed) {
    return compileWithMock(source, assets);
  }

  try {
    return await withTimeout(
      (async () => {
        const packageReferences = extractTypstPackageReferencesFromCompileInputs(source, assets);
        if (packageReferences.length > 0) {
          const packageStatusReporter = createTypstPackageStatusReporter(
            "worker",
            packageReferences,
            (status) => emitStatus(requestId, status)
          );
          packageStatusReporter.emitInitial();
          await ensureTypstPackageReferences(packageReferences, {
            onStatus: (status) => packageStatusReporter.handle(status)
          });
        }

        const module = await loadTypstModule(requestId);
        const compiler = await getCompilerDriver(requestId);
        compiler.resetShadow();
        compiler.addSource(MAIN_FILE_PATH, source);
        for (const asset of assets) {
          compiler.mapShadow(asset.path, asset.content);
        }

        emitStatus(requestId, {
          phase: "compiling",
          mode: "worker",
          label: "Compiling Typst document"
        });
        const compileOutput = await compiler.compile({
          mainFilePath: MAIN_FILE_PATH,
          root: DIAGRAM_COMPILER_ROOT,
          diagnostics: "full"
        });
        fontsPrimed = true;

        const diagnostics = normalizeTypstDiagnostics(compileOutput.diagnostics);

        if (compileOutput.hasError) {
          return {
            ok: false,
            engine: "typst-ts",
            errors:
              diagnostics.length > 0
                ? diagnostics
                : [
                    {
                      message: "Typst compilation failed.",
                      severity: "error"
                    }
                  ]
          } satisfies CompileFailure;
        }

        if (!compileOutput.result) {
          return {
            ok: false,
            engine: "typst-ts",
            errors: [
              {
                message: "Typst compilation produced no renderable output.",
                severity: "error"
              }
            ]
          } satisfies CompileFailure;
        }

        emitStatus(requestId, {
          phase: "rendering",
          mode: "worker",
          label: "Rendering preview"
        });
        const svg = sanitizePreviewSvg(
          await module.$typst.svg({ vectorData: compileOutput.result })
        );

        return {
          ok: true,
          engine: "typst-ts",
          diagnostics,
          output: {
            kind: "svg",
            content: svg,
            artifactData: compileOutput.result
          }
        } satisfies CompileSuccess;
      })(),
      fontsPrimed ? TYPST_COMPILE_TIMEOUT_MS : TYPST_FIRST_COMPILE_TIMEOUT_MS,
      TYPST_COMPILE_TIMEOUT_MESSAGE
    );
  } catch (error) {
    const detail = formatUnknownError(error);
    const isPackageDownloadFailure = detail.includes("Failed to download Typst package");
    emitStatus(requestId, {
      phase: "error",
      mode: "worker",
      label: isPackageDownloadFailure ? "Failed Typst package download" : "Compile failed",
      detail
    });
    return {
      ok: false,
      engine: "typst-ts",
      errors: [
        {
          message: detail,
          severity: "error"
        }
      ]
    };
  }
}

async function compileWithMock(
  source: string,
  assets: CompileAssetFile[] = []
): Promise<CompileResult> {
  const result = await createMockCompiler().compileDocument(source, assets);

  if (fallbackWarning && result.ok) {
    return {
      ...result,
      diagnostics: [fallbackWarning, ...result.diagnostics]
    } satisfies CompileSuccess;
  }

  if (fallbackWarning && !result.ok) {
    return {
      ok: false,
      engine: result.engine,
      errors: [fallbackWarning, ...result.errors]
    } satisfies CompileFailure;
  }

  return result;
}

function normalizeTypstDiagnostics(
  diagnostics: TypstStructuredDiagnostic[] | undefined
): CompileDiagnostic[] {
  if (!diagnostics) {
    return [];
  }

  return diagnostics.map(normalizeTypstDiagnostic);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Typst compilation error.";
}

function sanitizePreviewSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
}

function createCoreFontProvider(coreFontData: Uint8Array[]): unknown {
  return {
    key: "typr-core-fonts",
    forRoles: ["compiler", "renderer"],
    provides: [loadFonts(coreFontData, { assets: false })]
  };
}

function emitFontLoadStatus(requestId: number, progress: TypstFontLoadProgress): void {
  emitStatus(requestId, {
    phase: "loading-fonts",
    mode: "worker",
    label: "Loading Typst fonts",
    detail: `${progress.name} (${progress.loaded}/${progress.total})`,
    progress: {
      current: progress.loaded,
      total: progress.total,
      label: progress.name
    }
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = self.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        self.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        self.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function postMessageToMain(message: CompilerWorkerResponse) {
  self.postMessage(message);
}

self.addEventListener("message", (event: MessageEvent<CompilerWorkerRequest>) => {
  const request = event.data;

  void compileWithTypst(request.id, request.source, request.assets ?? [])
    .then((result) => {
      postMessageToMain({
        id: request.id,
        type: "compile-result",
        result
      });
    })
    .catch((error) => {
      postMessageToMain({
        id: request.id,
        type: "error",
        message: formatUnknownError(error)
      });
    });
});
