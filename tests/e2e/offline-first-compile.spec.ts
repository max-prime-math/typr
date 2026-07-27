import { expect, test } from "@playwright/test";

const CORE_FONT_ASSET_PATTERNS = [
  /\/LibertinusSerif-Regular-[\w-]{8}\.otf$/,
  /\/LibertinusSerif-Bold-[\w-]{8}\.otf$/,
  /\/LibertinusSerif-Italic-[\w-]{8}\.otf$/,
  /\/LibertinusSerif-BoldItalic-[\w-]{8}\.otf$/,
  /\/LibertinusSerif-Semibold-[\w-]{8}\.otf$/,
  /\/LibertinusSerif-SemiboldItalic-[\w-]{8}\.otf$/,
  /\/NewCM10-Regular-[\w-]{8}\.otf$/,
  /\/NewCM10-Bold-[\w-]{8}\.otf$/,
  /\/NewCM10-Italic-[\w-]{8}\.otf$/,
  /\/NewCM10-BoldItalic-[\w-]{8}\.otf$/,
  /\/NewCMMath-Regular-[\w-]{8}\.otf$/,
  /\/NewCMMath-Book-[\w-]{8}\.otf$/,
  /\/DejaVuSansMono-[\w-]{8}\.ttf$/,
  /\/DejaVuSansMono-Bold-[\w-]{8}\.ttf$/,
  /\/DejaVuSansMono-Oblique-[\w-]{8}\.ttf$/,
  /\/DejaVuSansMono-BoldOblique-[\w-]{8}\.ttf$/
];

test("the installed PWA can perform its first Typst compile offline", async ({
  context,
  page
}) => {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? "unknown error"})`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const filesTab = page.getByRole("tab", { name: "Files", exact: true });
  if ((page.viewportSize()?.width ?? 0) <= 700) {
    await expect(filesTab).toBeVisible();
    await filesTab.click();
  }

  await expect
    .poll(() => page.locator("html").getAttribute("data-typr-offline-ready"))
    .toBe("true");

  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  expect(
    page.workers().some((worker) => worker.url().includes("typstCompiler.worker"))
  ).toBe(false);
  expect(
    page.workers().some((worker) => worker.url().includes("harperDiagnostics.worker"))
  ).toBe(false);
  const cachedAssetUrls = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const entries = await Promise.all(
      cacheNames.map(async (cacheName) =>
        (await (await caches.open(cacheName)).keys()).map((request) => request.url)
      )
    );
    return entries.flat();
  });

  expect(
    cachedAssetUrls.some((url) => /\/typst_ts_web_compiler_bg-[^/]+\.wasm$/.test(url))
  ).toBe(true);
  expect(
    cachedAssetUrls.some((url) => /\/typst_ts_renderer_bg-[^/]+\.wasm$/.test(url))
  ).toBe(true);

  for (const fontPattern of CORE_FONT_ASSET_PATTERNS) {
    expect(
      cachedAssetUrls.some((url) => fontPattern.test(url))
    ).toBe(true);
  }

  expect(
    cachedAssetUrls.some((url) => /\/(?:mitex|ratex)_wasm_bg-[^/]+\.wasm$/.test(url))
  ).toBe(false);

  expect(
    cachedAssetUrls.some((url) => new URL(url).hostname === "packages.typst.org")
  ).toBe(false);
  expect(
    cachedAssetUrls.some((url) => /\/binaryInlined-[^/]+\.js$/.test(url))
  ).toBe(false);

  await context.setOffline(true);
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "offline-first.typ",
    mimeType: "text/plain",
    buffer: Buffer.from("Hello from an offline first compile")
  });

  const importedFile = page.getByRole("treeitem", { name: /offline-first\.typ/ });
  await expect(importedFile).toBeVisible();
  await importedFile.click();
  if ((page.viewportSize()?.width ?? 0) <= 700) {
    await page.getByRole("tab", { name: "Source", exact: true }).click();
  }

  const compileButton = page.getByRole("button", { name: "Compile", exact: true });
  await expect(compileButton).toBeVisible();
  await compileButton.click();

  const previewTab = page.getByRole("tab", { name: "Preview", exact: true });
  if (await previewTab.isVisible()) {
    await previewTab.click();
  }

  const renderedPreview = page.getByRole("img", { name: "Typst preview document" });
  await expect
    .poll(async () => {
      if (await renderedPreview.count()) {
        const isLoaded = await renderedPreview.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
        );
        return isLoaded ? "preview" : "pending preview image";
      }
      if (await page.getByText("Mock preview", { exact: true }).count()) {
        return "mock";
      }
      if (await page.getByText("The preview could not be generated.", { exact: true }).count()) {
        const details = await page.locator(".preview-status__details").allTextContents();
        return `failure: ${details.join(" ")}`;
      }

      const activity = await page.locator(".preview-activity").allTextContents();
      if (failedRequests.length > 0) {
        return `failed requests: ${failedRequests.join(" ")}`;
      }
      if (pageErrors.length > 0) {
        return `page errors: ${pageErrors.join(" ")}`;
      }
      if (consoleErrors.length > 0) {
        return `console errors: ${consoleErrors.join(" ")}`;
      }
      const status = await page.locator(".preview-state, .preview-status").allTextContents();
      return activity.length > 0
        ? `pending: ${activity.join(" ")}`
        : status.length > 0
          ? `pending: ${status.join(" ")}`
          : "pending";
    })
    .toBe("preview");
  await expect(renderedPreview).toBeVisible();
  expect(
    page.workers().some((worker) => worker.url().includes("typstCompiler.worker"))
  ).toBe(true);
  expect(failedRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
