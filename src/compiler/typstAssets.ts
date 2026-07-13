import typstCompilerWasmUrl from "@myriaddreamin/typst-ts-web-compiler/wasm?url";
import typstRendererWasmUrl from "@myriaddreamin/typst-ts-renderer/wasm?url";
import dejaVuSansMonoBoldUrl from "./fonts/DejaVuSansMono-Bold.ttf?url";
import dejaVuSansMonoBoldObliqueUrl from "./fonts/DejaVuSansMono-BoldOblique.ttf?url";
import dejaVuSansMonoObliqueUrl from "./fonts/DejaVuSansMono-Oblique.ttf?url";
import dejaVuSansMonoUrl from "./fonts/DejaVuSansMono.ttf?url";
import libertinusSerifBoldUrl from "./fonts/LibertinusSerif-Bold.otf?url";
import libertinusSerifBoldItalicUrl from "./fonts/LibertinusSerif-BoldItalic.otf?url";
import libertinusSerifItalicUrl from "./fonts/LibertinusSerif-Italic.otf?url";
import libertinusSerifRegularUrl from "./fonts/LibertinusSerif-Regular.otf?url";
import libertinusSerifSemiboldUrl from "./fonts/LibertinusSerif-Semibold.otf?url";
import libertinusSerifSemiboldItalicUrl from "./fonts/LibertinusSerif-SemiboldItalic.otf?url";
import newCm10BoldUrl from "./fonts/NewCM10-Bold.otf?url";
import newCm10BoldItalicUrl from "./fonts/NewCM10-BoldItalic.otf?url";
import newCm10ItalicUrl from "./fonts/NewCM10-Italic.otf?url";
import newCm10RegularUrl from "./fonts/NewCM10-Regular.otf?url";
import newCmMathBookUrl from "./fonts/NewCMMath-Book.otf?url";
import newCmMathRegularUrl from "./fonts/NewCMMath-Regular.otf?url";

export const MAIN_FILE_PATH = "/main.typ";
export const TYPST_PROJECT_ROOT = "/";
export const TYPST_DEFAULT_MAIN_FILE_PATH = MAIN_FILE_PATH;
export const TYPST_OFFLINE_CACHE_NAME = "typr-compiler-assets";
export const TYPST_FONT_CACHE_NAME = TYPST_OFFLINE_CACHE_NAME;
const CORE_FONT_LOAD_CONCURRENCY = 4;

const CORE_FONT_ASSETS = [
  { name: "LibertinusSerif-Regular.otf", url: libertinusSerifRegularUrl },
  { name: "LibertinusSerif-Bold.otf", url: libertinusSerifBoldUrl },
  { name: "LibertinusSerif-Italic.otf", url: libertinusSerifItalicUrl },
  { name: "LibertinusSerif-BoldItalic.otf", url: libertinusSerifBoldItalicUrl },
  { name: "LibertinusSerif-Semibold.otf", url: libertinusSerifSemiboldUrl },
  { name: "LibertinusSerif-SemiboldItalic.otf", url: libertinusSerifSemiboldItalicUrl },
  { name: "NewCM10-Regular.otf", url: newCm10RegularUrl },
  { name: "NewCM10-Bold.otf", url: newCm10BoldUrl },
  { name: "NewCM10-Italic.otf", url: newCm10ItalicUrl },
  { name: "NewCM10-BoldItalic.otf", url: newCm10BoldItalicUrl },
  { name: "NewCMMath-Regular.otf", url: newCmMathRegularUrl },
  { name: "NewCMMath-Book.otf", url: newCmMathBookUrl },
  { name: "DejaVuSansMono.ttf", url: dejaVuSansMonoUrl },
  { name: "DejaVuSansMono-Bold.ttf", url: dejaVuSansMonoBoldUrl },
  { name: "DejaVuSansMono-Oblique.ttf", url: dejaVuSansMonoObliqueUrl },
  { name: "DejaVuSansMono-BoldOblique.ttf", url: dejaVuSansMonoBoldObliqueUrl },
];

const REQUIRED_TYPST_OFFLINE_ASSETS = [
  { name: "Typst compiler WASM", url: typstCompilerWasmUrl },
  { name: "Typst renderer WASM", url: typstRendererWasmUrl },
  ...CORE_FONT_ASSETS
];

export const CORE_FONT_URLS = CORE_FONT_ASSETS.map((font) => font.url);

export function normalizeTypstCompilerPath(path: string | null | undefined): string {
  const normalizedPath = (path ?? "")
    .replace(/^\/?project\/?/, "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");

  return normalizedPath ? `/${normalizedPath}` : TYPST_DEFAULT_MAIN_FILE_PATH;
}

export interface TypstFontLoadProgress {
  name: string;
  loaded: number;
  total: number;
}

interface LoadCoreFontDataOptions {
  onProgress?: (progress: TypstFontLoadProgress) => void;
}

let coreFontDataPromise: Promise<Uint8Array[]> | null = null;
let coreFontDataResult: Uint8Array[] | null = null;
let lastCoreFontProgress: TypstFontLoadProgress | null = null;
const coreFontProgressListeners = new Set<(progress: TypstFontLoadProgress) => void>();

export function loadCoreFontData(
  options: LoadCoreFontDataOptions = {}
): Promise<Uint8Array[]> {
  if (options.onProgress) {
    coreFontProgressListeners.add(options.onProgress);
    if (lastCoreFontProgress) {
      options.onProgress(lastCoreFontProgress);
    }
  }

  if (coreFontDataResult) {
    emitCoreFontProgress({
      name: "Core fonts ready",
      loaded: CORE_FONT_ASSETS.length,
      total: CORE_FONT_ASSETS.length
    });
    if (options.onProgress) {
      coreFontProgressListeners.delete(options.onProgress);
    }
    return Promise.resolve(coreFontDataResult);
  }

  if (!coreFontDataPromise) {
    coreFontDataPromise = loadCoreFontDataConcurrently().then((fonts) => {
      coreFontDataResult = fonts;
      return fonts;
    });
  }

  if (!options.onProgress) {
    return coreFontDataPromise;
  }

  return coreFontDataPromise.finally(() => {
    coreFontProgressListeners.delete(options.onProgress!);
  });
}

async function loadCoreFontDataConcurrently(): Promise<Uint8Array[]> {
  const fonts = new Array<Uint8Array>(CORE_FONT_ASSETS.length);
  let nextIndex = 0;
  let loaded = 0;

  emitCoreFontProgress({
    name: "Preparing bundled fonts",
    loaded: 0,
    total: CORE_FONT_ASSETS.length
  });

  async function loadNextFont(): Promise<void> {
    while (nextIndex < CORE_FONT_ASSETS.length) {
      const fontIndex = nextIndex;
      nextIndex += 1;
      const font = CORE_FONT_ASSETS[fontIndex];

      emitCoreFontProgress({
        name: font.name,
        loaded,
        total: CORE_FONT_ASSETS.length
      });

      fonts[fontIndex] = await fetchFontDataWithRetry(font);
      loaded += 1;

      emitCoreFontProgress({
        name: font.name,
        loaded,
        total: CORE_FONT_ASSETS.length
      });
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CORE_FONT_LOAD_CONCURRENCY, CORE_FONT_ASSETS.length) },
      loadNextFont
    )
  );

  return fonts;
}

function emitCoreFontProgress(progress: TypstFontLoadProgress): void {
  lastCoreFontProgress = progress;
  for (const listener of coreFontProgressListeners) {
    listener(progress);
  }
}

async function fetchFontDataWithRetry(font: { name: string; url: string }): Promise<Uint8Array> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const cached = await matchCachedFont(font.url);
      if (cached) {
        return cached;
      }

      const response = await fetch(font.url, {
        cache: "force-cache",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;

      if (attempt < 2) {
        await wait(250);
      }
    }
  }

  throw new Error(`Unable to load Typst font ${font.name}: ${formatFontLoadError(lastError)}`);
}

async function matchCachedFont(fontUrl: string): Promise<Uint8Array | null> {
  if (typeof caches === "undefined") {
    return null;
  }

  const cachedResponse = await caches.match(fontUrl);

  if (!cachedResponse || !cachedResponse.ok) {
    return null;
  }

  return new Uint8Array(await cachedResponse.arrayBuffer());
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function formatFontLoadError(error: unknown): string {
  return error instanceof Error ? error.message : "Load failed";
}

export async function warmTypstOfflineAssets(): Promise<void> {
  if (typeof window === "undefined" || typeof caches === "undefined") {
    throw new Error("Browser cache storage is unavailable.");
  }

  if (!window.navigator.onLine) {
    throw new Error("Compiler assets cannot be prepared while offline.");
  }

  const cache = await caches.open(TYPST_OFFLINE_CACHE_NAME);

  for (const asset of REQUIRED_TYPST_OFFLINE_ASSETS) {
    const existingResponse = await cache.match(asset.url);

    if (existingResponse?.ok) {
      continue;
    }

    const response = await fetch(asset.url, {
      cache: "force-cache",
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error(
        `Unable to cache ${asset.name}: ${response.status} ${response.statusText}`.trim()
      );
    }

    await cache.put(asset.url, response.clone());
  }
}
