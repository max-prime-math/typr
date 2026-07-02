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
import { DIAGRAM_COMPILER_ROOT } from "../diagram/diagramFiles";
import { extractTypstPackageReferencesFromCompileInputs } from "./typstPackages";
import { normalizeTypstDiagnostic } from "./diagnostics";
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
  CompileAssetFile,
  CompilerStatus,
  CompileDiagnostic,
  CompileFailure,
  CompileResult,
  CompileSuccess,
  TypstCompiler,
  TypstCompilerOptions
} from "./types";

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

interface TypstIncrementalServer {
  setAttachDebugInfo(enable: boolean): void;
}

interface TypstCompilerDriver {
  addSource(path: string, source: string): void;
  mapShadow(path: string, content: Uint8Array): void;
  resetShadow(): void;
  compile(options: {
    mainFilePath: string;
    root?: string;
    diagnostics: "full";
    format?: "vector";
    incrementalServer?: TypstIncrementalServer;
  }): Promise<{
    hasError?: boolean;
    diagnostics?: TypstStructuredDiagnostic[];
    result?: Uint8Array;
  }>;
  withIncrementalServer<T>(callback: (server: TypstIncrementalServer) => Promise<T>): Promise<T>;
}

interface TypstStructuredDiagnostic {
  package: string;
  path: string;
  range: string;
  severity: string;
  message: string;
}

ensureTypstQueueMicrotask();

export function createMainThreadTypstCompiler(
  options: TypstCompilerOptions = {}
): TypstCompiler {
  const notifyStatus = options.onStatusChange ?? (() => {});
  let initConfigured = false;
  let bootstrapFailed = false;
  let fallbackWarning: CompileDiagnostic | null = null;
  let fontsPrimed = false;
  let compilerDriverPromise: Promise<TypstCompilerDriver> | null = null;
  const packageRegistry = createTypstPackageRegistry();

  function emitStatus(status: CompilerStatus): void {
    notifyStatus(status);
  }

  async function loadTypstModule(): Promise<TypstSnippetModule> {
    emitStatus({
      phase: "loading-typst",
      mode: "main-thread",
      label: "Loading Typst runtime"
    });
    const module = (await import("@myriaddreamin/typst.ts/contrib/snippet")) as unknown as TypstSnippetModule;

    if (!initConfigured) {
      module.$typst.setCompilerInitOptions({
        getModule: () => typstCompilerWasmUrl
      });
      module.$typst.setRendererInitOptions({
        getModule: () => typstRendererWasmUrl
      });
      const coreFontData = await loadCoreFontData({
        onProgress: (progress) => emitStatus(createFontLoadStatus(progress))
      });
      if (initConfigured) {
        return module;
      }
      emitStatus({
        phase: "loading-fonts",
        mode: "main-thread",
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

  async function getCompilerDriver(): Promise<TypstCompilerDriver> {
    if (!compilerDriverPromise) {
      compilerDriverPromise = loadTypstModule().then((module) => module.$typst.getCompiler());
    }

    return compilerDriverPromise;
  }

  async function warmCompiler(): Promise<void> {
    try {
      emitStatus({
        phase: "fallback-main-thread",
        mode: "main-thread",
        label: "Using main-thread fallback"
      });
      await getCompilerDriver();
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

  return {
    async compileDocument(
      source: string,
      assets: CompileAssetFile[] = []
    ): Promise<CompileResult> {
      await withTimeout(
        warmCompiler(),
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
                "main-thread",
                packageReferences,
                emitStatus
              );
              packageStatusReporter.emitInitial();
              await ensureTypstPackageReferences(packageReferences, {
                onStatus: (status) => packageStatusReporter.handle(status)
              });
            }
            const module = await loadTypstModule();
            const compiler = await getCompilerDriver();
            compiler.resetShadow();
            compiler.addSource(MAIN_FILE_PATH, source);
            for (const asset of assets) {
              compiler.mapShadow(asset.path, asset.content);
            }

            emitStatus({
              phase: "compiling",
              mode: "main-thread",
              label: "Compiling Typst document"
            });
            const compileOutput = await compileTypstVectorWithSourceMap(compiler);
            fontsPrimed = true;

            const diagnostics = normalizeTypstDiagnostics(
              compileOutput.diagnostics
            );

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

            emitStatus({
              phase: "rendering",
              mode: "main-thread",
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
        emitStatus({
          phase: "error",
          mode: "main-thread",
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
    },
    dispose(): void {}
  };
}

function compileTypstVectorWithSourceMap(
  compiler: TypstCompilerDriver
): Promise<{
  hasError?: boolean;
  diagnostics?: TypstStructuredDiagnostic[];
  result?: Uint8Array;
}> {
  return compiler.withIncrementalServer(async (server) => {
    server.setAttachDebugInfo(true);
    return compiler.compile({
      mainFilePath: MAIN_FILE_PATH,
      root: DIAGRAM_COMPILER_ROOT,
      diagnostics: "full",
      format: "vector",
      incrementalServer: server
    });
  });
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

function createFontLoadStatus(progress: TypstFontLoadProgress): CompilerStatus {
  return {
    phase: "loading-fonts",
    mode: "main-thread",
    label: "Loading Typst fonts",
    detail: `${progress.name} (${progress.loaded}/${progress.total})`,
    progress: {
      current: progress.loaded,
      total: progress.total,
      label: progress.name
    }
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}
