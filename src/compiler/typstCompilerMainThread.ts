import { createMockCompiler } from "./mockCompiler";
import * as typstSnippetModule from "@myriaddreamin/typst.ts/contrib/snippet";
import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { CORE_FONT_URLS, MAIN_FILE_PATH } from "./typstAssets";
import { DIAGRAM_COMPILER_ROOT } from "../diagram/diagramFiles";
import { normalizeTypstDiagnostic } from "./diagnostics";
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
    preloadFonts(fonts: (string | Uint8Array)[]): unknown;
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
const COMPILER_TIMEOUT_MS = 15000;

export function createMainThreadTypstCompiler(
  options: TypstCompilerOptions = {}
): TypstCompiler {
  const notifyStatus = options.onStatusChange ?? (() => {});
  let initConfigured = false;
  let bootstrapFailed = false;
  let fallbackWarning: CompileDiagnostic | null = null;
  let fontsPrimed = false;
  let compilerDriverPromise: Promise<TypstCompilerDriver> | null = null;

  function emitStatus(status: CompilerStatus): void {
    notifyStatus(status);
  }

  async function loadTypstModule(): Promise<TypstSnippetModule> {
    emitStatus({
      phase: "loading-typst",
      mode: "main-thread",
      label: "Loading Typst runtime"
    });
    const module = typstSnippetModule as unknown as TypstSnippetModule;

    if (!initConfigured) {
      module.$typst.setCompilerInitOptions({
        getModule: () => typstCompilerWasmUrl
      });
      module.$typst.setRendererInitOptions({
        getModule: () => typstRendererWasmUrl
      });
      module.$typst.use(module.TypstSnippet.preloadFonts(CORE_FONT_URLS));
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
      await loadTypstModule();
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
        COMPILER_TIMEOUT_MS,
        "Timed out initializing Typst. WASM or font assets may be blocked."
      );

      if (bootstrapFailed) {
        return compileWithMock(source, assets);
      }

      try {
        return await withTimeout(
          (async () => {
            const module = await loadTypstModule();
            const compiler = await getCompilerDriver();
            compiler.resetShadow();
            compiler.addSource(MAIN_FILE_PATH, source);
            for (const asset of assets) {
              compiler.mapShadow(asset.path, asset.content);
            }

            if (!fontsPrimed) {
              emitStatus({
                phase: "loading-fonts",
                mode: "main-thread",
                label: "Loading Typst fonts",
                detail: "Fetching core text fonts"
              });
            }
            emitStatus({
              phase: "compiling",
              mode: "main-thread",
              label: "Compiling Typst document"
            });
            const compileOutput = await compiler.compile({
              mainFilePath: MAIN_FILE_PATH,
              root: DIAGRAM_COMPILER_ROOT,
              diagnostics: "full"
            });
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

            emitStatus({
              phase: "ready",
              mode: "main-thread",
              label: "Preview ready"
            });
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
          COMPILER_TIMEOUT_MS,
          "Timed out compiling Typst. Font asset loading may be blocked or very slow."
        );
      } catch (error) {
        emitStatus({
          phase: "error",
          mode: "main-thread",
          label: "Compile failed",
          detail: formatUnknownError(error)
        });
        return {
          ok: false,
          engine: "typst-ts",
          errors: [
            {
              message: formatUnknownError(error),
              severity: "error"
            }
          ]
        };
      }
    },
    dispose(): void {}
  };
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
