export const MAIN_FILE_PATH = "/main.typ";
export const TYPST_FONT_CACHE_NAME = "typst-font-assets";
export const FONT_ASSET_BASE_URL =
  "https://cdn.jsdelivr.net/gh/typst/typst-assets@v0.13.1/files/fonts/";

export const CORE_FONT_URLS = [
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

    await Promise.all(
      CORE_FONT_URLS.map(async (fontUrl) => {
        const existingResponse = await cache.match(fontUrl);

        if (existingResponse) {
          return;
        }

        const response = await fetch(fontUrl, {
          cache: "reload",
          mode: "cors"
        });

        if (!response.ok) {
          throw new Error(`Unable to cache ${fontUrl}.`);
        }

        await cache.put(fontUrl, response.clone());
      })
    );
  } catch {
    // Offline font priming is best-effort. The compiler still attempts to load
    // the same assets lazily during preview compilation.
  }
}
