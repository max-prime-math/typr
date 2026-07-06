import { ensureTypstQueueMicrotask } from "./typstPolyfills";
import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { loadCoreFontData, normalizeTypstCompilerPath, TYPST_PROJECT_ROOT } from "./typstAssets";
import type { CompileAssetFile, CompileDocumentOptions } from "./types";
import type { TypstCompiler, TypstRenderer } from "@myriaddreamin/typst.ts";

interface TypstSnippetRuntimeModule {
  $typst: {
    setCompilerInitOptions(options: { getModule: () => string }): void;
    setRendererInitOptions(options: { getModule: () => string }): void;
    svg(options: { vectorData: Uint8Array }): Promise<string>;
  };
}

ensureTypstQueueMicrotask();

let compilerPromise: Promise<TypstCompiler> | null = null;
let rendererPromise: Promise<TypstRenderer> | null = null;
let snippetRuntimePromise: Promise<TypstSnippetRuntimeModule> | null = null;

export async function getTypstCompiler(): Promise<TypstCompiler> {
  if (!compilerPromise) {
    const { createTypstCompiler: createTypstCompilerImpl, loadFonts } = await import("@myriaddreamin/typst.ts");
    const compiler = createTypstCompilerImpl();
    const coreFontData = await loadCoreFontData();
    compilerPromise = compiler.init({
      beforeBuild: [loadFonts(coreFontData, { assets: false })],
      getModule: () => typstCompilerWasmUrl
    }).then(() => compiler);
  }

  return compilerPromise;
}

export async function getTypstRenderer(): Promise<TypstRenderer> {
  if (!rendererPromise) {
    const { createTypstRenderer: createTypstRendererImpl, loadFonts } = await import("@myriaddreamin/typst.ts");
    const renderer = createTypstRendererImpl();
    const coreFontData = await loadCoreFontData();
    rendererPromise = renderer.init({
      beforeBuild: [loadFonts(coreFontData, { assets: false })],
      getModule: () => typstRendererWasmUrl
    }).then(() => renderer);
  }

  return rendererPromise;
}


async function getTypstSnippetRuntime(): Promise<TypstSnippetRuntimeModule> {
  if (!snippetRuntimePromise) {
    snippetRuntimePromise = import("@myriaddreamin/typst.ts/contrib/snippet").then((module) => {
      const snippetModule = module as unknown as TypstSnippetRuntimeModule;
      snippetModule.$typst.setCompilerInitOptions({
        getModule: () => typstCompilerWasmUrl
      });
      snippetModule.$typst.setRendererInitOptions({
        getModule: () => typstRendererWasmUrl
      });
      return snippetModule;
    });
  }

  return snippetRuntimePromise;
}

export async function renderTypstSourceToSvg(
  source: string,
  assets: CompileAssetFile[] = [],
  options: CompileDocumentOptions = {}
): Promise<string> {
  const compiler = await getTypstCompiler();
  const snippetModule = await getTypstSnippetRuntime();
  await compiler.reset();
  compiler.resetShadow();
  for (const asset of assets) {
    compiler.mapShadow(normalizeTypstCompilerPath(asset.path), asset.content);
  }
  const mainFilePath = normalizeTypstCompilerPath(options.mainFilePath);
  compiler.addSource(mainFilePath, source);

  const result = await compiler.withIncrementalServer(async (server) => {
    server.setAttachDebugInfo(false);
    return compiler.compile({
      mainFilePath,
      root: TYPST_PROJECT_ROOT,
      format: "vector",
      diagnostics: "full",
      incrementalServer: server
    });
  });

  if (!result.result) {
    const summary = summarizeDiagnostics(result.diagnostics);
    throw new Error(summary ?? "Typst SVG render failed.");
  }

  return sanitizeSvg(await snippetModule.$typst.svg({ vectorData: result.result }));
}

export async function exportTypstPdf(
  source: string,
  assets: CompileAssetFile[] = [],
  options: CompileDocumentOptions = {}
): Promise<Uint8Array> {
  const { CompileFormatEnum } = await import("@myriaddreamin/typst.ts/compiler");
  const compiler = await getTypstCompiler();
  await compiler.reset();
  compiler.resetShadow();
  for (const asset of assets) {
    compiler.mapShadow(normalizeTypstCompilerPath(asset.path), asset.content);
  }
  const mainFilePath = normalizeTypstCompilerPath(options.mainFilePath);
  compiler.addSource(mainFilePath, source);

  const result = await compiler.compile({
    mainFilePath,
    root: TYPST_PROJECT_ROOT,
    format: CompileFormatEnum.pdf,
    diagnostics: "full"
  });

  if (!result.result) {
    const summary = summarizeDiagnostics(result.diagnostics);
    throw new Error(summary ?? "Typst PDF export failed.");
  }

  return result.result;
}

function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
}

function summarizeDiagnostics(
  diagnostics: Array<{ message?: string }> | undefined
): string | null {
  if (!diagnostics || diagnostics.length === 0) {
    return null;
  }

  return diagnostics
    .map((diagnostic) => diagnostic.message?.trim())
    .filter((message): message is string => Boolean(message))
    .join("\n");
}
