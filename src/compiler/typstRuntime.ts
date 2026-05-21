import {
  createTypstCompiler as createTypstCompilerImpl,
  createTypstRenderer as createTypstRendererImpl,
  loadFonts,
  type TypstRenderer
} from "@myriaddreamin/typst.ts";
import type { TypstCompiler } from "@myriaddreamin/typst.ts/compiler";
import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { CORE_FONT_URLS } from "./typstAssets";

let compilerPromise: Promise<TypstCompiler> | null = null;
let rendererPromise: Promise<TypstRenderer> | null = null;

export async function getTypstCompiler(): Promise<TypstCompiler> {
  if (!compilerPromise) {
    const compiler = createTypstCompilerImpl();
    compilerPromise = compiler.init({
      beforeBuild: [loadFonts(CORE_FONT_URLS)],
      getModule: () => typstCompilerWasmUrl
    }).then(() => compiler);
  }

  return compilerPromise;
}

export async function getTypstRenderer(): Promise<TypstRenderer> {
  if (!rendererPromise) {
    const renderer = createTypstRendererImpl();
    rendererPromise = renderer.init({
      beforeBuild: [loadFonts(CORE_FONT_URLS)],
      getModule: () => typstRendererWasmUrl
    }).then(() => renderer);
  }

  return rendererPromise;
}
