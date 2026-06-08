import { ensureTypstQueueMicrotask } from "./typstPolyfills";
import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { loadCoreFontData, MAIN_FILE_PATH } from "./typstAssets";
import { DIAGRAM_COMPILER_ROOT } from "../diagram/diagramFiles";
import type { CompileAssetFile } from "./types";
import type { TypstCompiler, TypstRenderer } from "@myriaddreamin/typst.ts";

ensureTypstQueueMicrotask();

let compilerPromise: Promise<TypstCompiler> | null = null;
let rendererPromise: Promise<TypstRenderer> | null = null;

export async function getTypstCompiler(): Promise<TypstCompiler> {
  if (!compilerPromise) {
    const { createTypstCompiler: createTypstCompilerImpl, loadFonts } = await import("@myriaddreamin/typst.ts");
    const { disableDefaultFontAssets } = await import("@myriaddreamin/typst.ts/options.init");
    const compiler = createTypstCompilerImpl();
    const coreFontData = await loadCoreFontData();
    compilerPromise = compiler.init({
      beforeBuild: [loadFonts(coreFontData), disableDefaultFontAssets()],
      getModule: () => typstCompilerWasmUrl
    }).then(() => compiler);
  }

  return compilerPromise;
}

export async function getTypstRenderer(): Promise<TypstRenderer> {
  if (!rendererPromise) {
    const { createTypstRenderer: createTypstRendererImpl, loadFonts } = await import("@myriaddreamin/typst.ts");
    const { disableDefaultFontAssets } = await import("@myriaddreamin/typst.ts/options.init");
    const renderer = createTypstRendererImpl();
    const coreFontData = await loadCoreFontData();
    rendererPromise = renderer.init({
      beforeBuild: [loadFonts(coreFontData), disableDefaultFontAssets()],
      getModule: () => typstRendererWasmUrl
    }).then(() => renderer);
  }

  return rendererPromise;
}

export async function exportTypstPdf(
  source: string,
  assets: CompileAssetFile[] = []
): Promise<Uint8Array> {
  const { CompileFormatEnum } = await import("@myriaddreamin/typst.ts/compiler");
  const compiler = await getTypstCompiler();
  await compiler.reset();
  compiler.resetShadow();
  compiler.addSource(MAIN_FILE_PATH, source);
  for (const asset of assets) {
    compiler.mapShadow(asset.path, asset.content);
  }

  const result = await compiler.compile({
    mainFilePath: MAIN_FILE_PATH,
    root: DIAGRAM_COMPILER_ROOT,
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
