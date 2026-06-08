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

export const CORE_FONT_URLS = [
  libertinusSerifRegularUrl,
  libertinusSerifBoldUrl,
  libertinusSerifItalicUrl,
  libertinusSerifBoldItalicUrl,
  libertinusSerifSemiboldUrl,
  libertinusSerifSemiboldItalicUrl,
  newCm10RegularUrl,
  newCm10BoldUrl,
  newCm10ItalicUrl,
  newCm10BoldItalicUrl,
  newCmMathRegularUrl,
  newCmMathBookUrl,
  dejaVuSansMonoUrl,
  dejaVuSansMonoBoldUrl,
  dejaVuSansMonoObliqueUrl,
  dejaVuSansMonoBoldObliqueUrl
];

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
