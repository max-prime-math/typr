/// <reference lib="webworker" />

import { createMockCompiler } from "./mockCompiler";
import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import type {
  CompilerWorkerRequest,
  CompilerWorkerResponse
} from "./protocol";
import type {
  CompilerStatus,
  CompileDiagnostic,
  CompileFailure,
  CompileResult,
  CompileSuccess
} from "./types";

declare const self: DedicatedWorkerGlobalScope;

interface TypstSnippetModule {
  TypstSnippet: {
    preloadFonts(fonts: (string | Uint8Array)[]): unknown;
  };
  $typst: {
    setCompilerInitOptions(options: { getModule: () => string }): void;
    setRendererInitOptions(options: { getModule: () => string }): void;
    use(...providers: unknown[]): void;
    addSource(path: string, content: string): Promise<void>;
    getCompilerReset(): Promise<{
      compile(options: {
        mainFilePath: string;
        diagnostics: "full";
      }): Promise<{
        hasError?: boolean;
        diagnostics?: TypstStructuredDiagnostic[];
        result?: Uint8Array;
      }>;
    }>;
    svg(options: { vectorData: Uint8Array }): Promise<string>;
  };
}

interface TypstStructuredDiagnostic {
  package: string;
  path: string;
  range: string;
  severity: string;
  message: string;
}

const MAIN_FILE_PATH = "/main.typ";
const COMPILER_TIMEOUT_MS = 15000;
const FONT_ASSET_BASE_URL =
  "https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.13.1/files/fonts/";
const CORE_FONT_URLS = [
  "LibertinusSerif-Regular.otf",
  "LibertinusSerif-Bold.otf",
  "LibertinusSerif-Italic.otf",
  "LibertinusSerif-BoldItalic.otf",
  "LibertinusSerif-Semibold.otf",
  "LibertinusSerif-SemiboldItalic.otf",
  "NewCM10-Regular.otf",
  "NewCM10-Bold.otf",
  "NewCM10-Italic.otf",
  "NewCM10-BoldItalic.otf",
  "NewCMMath-Regular.otf",
  "NewCMMath-Book.otf",
  "DejaVuSansMono.ttf",
  "DejaVuSansMono-Bold.ttf",
  "DejaVuSansMono-Oblique.ttf",
  "DejaVuSansMono-BoldOblique.ttf"
].map((fontFile) => `${FONT_ASSET_BASE_URL}${fontFile}`);

let loadPromise: Promise<TypstSnippetModule> | null = null;
let initConfigured = false;
let bootstrapFailed = false;
let fallbackWarning: CompileDiagnostic | null = null;
let fontsPrimed = false;

function emitStatus(id: number, status: CompilerStatus): void {
  postMessageToMain({
    id,
    type: "status",
    status
  });
}

async function loadTypstModule(): Promise<TypstSnippetModule> {
  if (!loadPromise) {
    loadPromise = import(
      "@myriaddreamin/typst.ts/contrib/snippet"
    ) as unknown as Promise<TypstSnippetModule>;
  }

  const module = await loadPromise;

  if (!initConfigured) {
    module.$typst.setCompilerInitOptions({
      getModule: () => typstCompilerWasmUrl
    });
    module.$typst.setRendererInitOptions({
      getModule: () => typstRendererWasmUrl
    });
    module.$typst.use(
      module.TypstSnippet.preloadFonts(CORE_FONT_URLS)
    );
    initConfigured = true;
  }

  return module;
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

async function compileWithTypst(
  requestId: number,
  source: string
): Promise<CompileResult> {
  await withTimeout(
    warmCompiler(requestId),
    COMPILER_TIMEOUT_MS,
    "Timed out initializing Typst. WASM or font assets may be blocked."
  );

  if (bootstrapFailed) {
    return compileWithMock(source);
  }

  try {
    return await withTimeout(
      (async () => {
        const module = await loadTypstModule();
        await module.$typst.addSource(MAIN_FILE_PATH, source);

        if (!fontsPrimed) {
          emitStatus(requestId, {
            phase: "loading-fonts",
            mode: "worker",
            label: "Loading Typst fonts",
            detail: "Fetching core text fonts"
          });
        }

        emitStatus(requestId, {
          phase: "compiling",
          mode: "worker",
          label: "Compiling Typst document"
        });
        const compiler = await module.$typst.getCompilerReset();
        const compileOutput = await compiler.compile({
          mainFilePath: MAIN_FILE_PATH,
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

        emitStatus(requestId, {
          phase: "ready",
          mode: "worker",
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
    emitStatus(requestId, {
      phase: "error",
      mode: "worker",
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
}

async function compileWithMock(source: string): Promise<CompileResult> {
  const result = await createMockCompiler().compileDocument(source);

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

  return diagnostics.map((diagnostic) => ({
    message: diagnostic.message,
    severity:
      diagnostic.severity.toLowerCase() === "warning" ? "warning" : "error",
    path: diagnostic.path || undefined,
    range: diagnostic.range || undefined,
    packageName: diagnostic.package || undefined
  }));
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

  if (request.type === "warmup") {
    void warmCompiler(request.id)
      .then(() => {
        postMessageToMain({
          id: request.id,
          type: "warmup-result",
          ok: true
        });
      })
      .catch((error) => {
        postMessageToMain({
          id: request.id,
          type: "error",
          message: formatUnknownError(error)
        });
      });
    return;
  }

  if (request.type === "compile") {
    void compileWithTypst(request.id, request.source)
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
  }
});
