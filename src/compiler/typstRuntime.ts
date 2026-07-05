import { ensureTypstQueueMicrotask } from "./typstPolyfills";
import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { loadCoreFontData, normalizeTypstCompilerPath, TYPST_PROJECT_ROOT } from "./typstAssets";
import type { CompileAssetFile, CompileDocumentOptions } from "./types";
import type { TypstCompiler, TypstRenderer } from "@myriaddreamin/typst.ts";

ensureTypstQueueMicrotask();

let compilerPromise: Promise<TypstCompiler> | null = null;
let rendererPromise: Promise<TypstRenderer> | null = null;

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
