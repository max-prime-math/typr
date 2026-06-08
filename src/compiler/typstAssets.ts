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
export const TYPST_FONT_CACHE_NAME = "typst-font-assets";

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
  { name: "DejaVuSansMono-BoldOblique.ttf", url: dejaVuSansMonoBoldObliqueUrl }
];

export const CORE_FONT_URLS = CORE_FONT_ASSETS.map((font) => font.url);

let coreFontDataPromise: Promise<Uint8Array[]> | null = null;

export function loadCoreFontData(): Promise<Uint8Array[]> {
  if (!coreFontDataPromise) {
    coreFontDataPromise = loadCoreFontDataSequentially();
  }

  return coreFontDataPromise;
}

async function loadCoreFontDataSequentially(): Promise<Uint8Array[]> {
  const fonts: Uint8Array[] = [];

  for (const font of CORE_FONT_ASSETS) {
    fonts.push(await fetchFontDataWithRetry(font));
  }

  return fonts;
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
  if (
    typeof window === "undefined" ||
    !window.navigator.onLine ||
    typeof caches === "undefined"
  ) {
    return;
  }

  try {
    const cache = await caches.open(TYPST_FONT_CACHE_NAME);

    for (const font of CORE_FONT_ASSETS) {
      const existingResponse = await cache.match(font.url);

      if (existingResponse) {
        continue;
      }

      const response = await fetch(font.url, {
        cache: "force-cache",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error(`Unable to cache ${font.name}.`);
      }

      await cache.put(font.url, response.clone());
    }
  } catch {
    // Offline font priming is best-effort. The compiler still attempts to load
    // the same assets lazily during preview compilation.
  }
}
