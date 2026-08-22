import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";

const CONTAINER = "typr-live-preview-e2e";
const IMAGE = process.env.TYPR_COMPANION_DOCKER_IMAGE ?? "typr-server:dev";
const RUN_ARGS = [
  "run", "--rm", "--name", CONTAINER,
  "-e", "TYPR_COMPANION_ALLOWED_ORIGINS=http://127.0.0.1:5177",
  "-p", "127.0.0.1:18484:8484", "-d", IMAGE
];

function stopCompanion() {
  spawnSync("docker", ["stop", CONTAINER], { encoding: "utf8" });
}

function startCompanion() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = spawnSync("docker", RUN_ARGS, { encoding: "utf8" });
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  }
  throw new Error("Unable to start the temporary TeXpresso E2E container.");
}

async function replaceEditor(page: Page, source: string) {
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(source);
}

async function imageSources(page: Page) {
  return page.locator(".texpresso-page [data-source-url]").evaluateAll((rasters) =>
    rasters.map((raster) => (raster as HTMLElement).dataset.sourceUrl ?? "")
  );
}

async function waitForChangedPages(page: Page, previous: string[]) {
  await page.waitForFunction((sources) => {
    const rasters = [...document.querySelectorAll<HTMLElement>(".texpresso-page [data-source-url]")];
    return rasters.length > 0 && rasters.some((raster, index) => raster.dataset.sourceUrl !== sources[index]);
  }, previous, { timeout: 45_000 });
}

async function pageCornerColor(page: Page) {
  return page.locator(".texpresso-page [data-source-url]").first().evaluate(async (raster) => {
    if (raster instanceof HTMLImageElement) await raster.decode();
    const canvas = raster instanceof HTMLCanvasElement ? raster : document.createElement("canvas");
    if (raster instanceof HTMLImageElement) {
      canvas.width = raster.naturalWidth;
      canvas.height = raster.naturalHeight;
      canvas.getContext("2d")!.drawImage(raster, 0, 0);
    }
    const context = canvas.getContext("2d")!;
    return [...context.getImageData(4, 4, 1, 1).data.slice(0, 3)];
  });
}

async function activeThemeBackground(page: Page) {
  return page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--editor-background").trim();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.fillStyle = value;
    const normalized = context.fillStyle.match(/^#([0-9a-f]{6})$/i)?.[1];
    if (!normalized) throw new Error(`Expected a six-digit theme color, received ${context.fillStyle}.`);
    const numeric = Number.parseInt(normalized, 16);
    return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
  });
}

async function hasVisibleSourceRaster(page: Page) {
  return page.locator(".texpresso-page__source").evaluateAll((images) =>
    images.some((image) => {
      const style = getComputedStyle(image);
      return style.visibility !== "hidden" && style.opacity !== "0";
    })
  );
}

test.beforeAll(() => {
  stopCompanion();
  startCompanion();
});

test.afterAll(() => {
  stopCompanion();
});

test("real Docker live preview edits, stages, recovers, reconnects, and leaves Compile authoritative", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    // The existing optional WebAssembly diagnostics worker can fail to load
    // under Vite's traced dev server. It is unrelated to TeXpresso preview.
    if (!error.message.includes("WebAssembly.instantiate()")) pageErrors.push(error.message);
  });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  console.log("live-e2e: app loaded");
  await page.getByRole("treeitem", { name: /markdown\.md/ }).waitFor();
  const mode = page.locator('[data-preview-mode-toggle="texpresso"]');
  await expect(mode).toHaveCount(0);
  await page.getByRole("treeitem", { name: /typst\.typ/ }).click();
  await expect(mode).toHaveCount(0);
  await page.locator('input[type="file"][multiple]').setInputFiles([
    {
      name: "main.tex",
      mimeType: "text/x-tex",
      buffer: Buffer.from([
        "\\documentclass{article}",
        "\\usepackage[margin=1in]{geometry}",
        "\\begin{document}",
        "\\input{chapter.tex}",
        "\\newpage Second page",
        "\\newpage Third page",
        "\\end{document}",
        ""
      ].join("\n"))
    },
    { name: "chapter.tex", mimeType: "text/x-tex", buffer: Buffer.from("Initial chapter.\n") }
  ]);
  await page.getByRole("treeitem", { name: /main\.tex/ }).dblclick();
  console.log("live-e2e: project imported");
  await expect(mode).toBeVisible();
  await expect(mode).toHaveAttribute("aria-pressed", "false");

  const startupStartedAt = performance.now();
  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  console.log("live-e2e: live mode selected");
  await expect(page.locator(".texpresso-page")).toHaveCount(3);
  expect(await hasVisibleSourceRaster(page)).toBe(false);
  await expect(page.locator(".texpresso-page__native").first()).toBeVisible();
  expect(await pageCornerColor(page)).toEqual(await activeThemeBackground(page));

  const contrast = page.getByRole("button", { name: "Paper contrast" });
  await contrast.click();
  await expect.poll(() => pageCornerColor(page)).toEqual([255, 255, 255]);
  await page.getByRole("button", { name: "Theme contrast" }).click();
  expect(await hasVisibleSourceRaster(page)).toBe(false);
  await expect.poll(() => pageCornerColor(page)).toEqual(await activeThemeBackground(page));
  console.log("live-e2e: initial pages ready");
  await expect(page.locator(".texpresso-status--ready")).toBeVisible();
  const startupMs = performance.now() - startupStartedAt;
  const initial = await imageSources(page);

  await page.getByRole("treeitem", { name: /chapter\.tex/ }).dblclick();
  const ordinaryStartedAt = performance.now();
  await replaceEditor(page, "Ordinary edit visible in live preview.\n");
  await waitForChangedPages(page, initial);
  console.log("live-e2e: ordinary edit ready");
  await expect(page.locator(".texpresso-status--ready")).toBeVisible();
  const ordinaryMs = performance.now() - ordinaryStartedAt;

  const lastGood = await imageSources(page);
  await replaceEditor(page, "Before \\undefinedTyprFrontendCommand after.\n");
  await expect(page.locator(".texpresso-status--error")).toBeVisible({ timeout: 5_000 });
  expect(await imageSources(page)).toEqual(lastGood);
  console.log("live-e2e: last good retained");
  await replaceEditor(page, "Recovered chapter.\n");
  await waitForChangedPages(page, lastGood);
  await expect(page.locator(".texpresso-status--ready")).toBeVisible();

  const editor = page.locator(".cm-content").first();

  await replaceEditor(page, "One\\newpage Two\\newpage Three\\newpage Four\\newpage Five\n");
  await expect(page.locator(".texpresso-page")).toHaveCount(7);
  await replaceEditor(page, "One page chapter again.\n");
  await expect(page.locator(".texpresso-page")).toHaveCount(3);
  console.log("live-e2e: page count changed");

  await page.locator(".texpresso-preview").evaluate((viewport) => {
    const target = viewport.querySelector<HTMLElement>('[data-texpresso-page="2"]')!;
    viewport.scrollTop = target.offsetTop + target.offsetHeight * 0.4;
    viewport.dispatchEvent(new Event("scroll"));
  });
  const scrollTopBefore = await page.locator(".texpresso-preview").evaluate((viewport) => viewport.scrollTop);
  const beforeScrollEdit = await imageSources(page);
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" scroll anchor edit");
  await waitForChangedPages(page, beforeScrollEdit);
  const scrollTopAfter = await page.locator(".texpresso-preview").evaluate((viewport) => viewport.scrollTop);
  expect(scrollTopAfter).toBeGreaterThan(scrollTopBefore * 0.65);
  console.log("live-e2e: scroll preserved", { scrollTopBefore, scrollTopAfter });

  const beforeRapid = await imageSources(page);
  await editor.click();
  await page.keyboard.press("Control+End");
  const rapidStartedAt = performance.now();
  // Keep real key events flowing for several seconds. If upstream misses a
  // flush, the recovery path must still converge on this complete source.
  await page.keyboard.type("Rapid typing settles.", { delay: 80 });
  await waitForChangedPages(page, beforeRapid);
  await expect(page.locator(".texpresso-status--ready")).toBeVisible();
  const rapidSettleMs = performance.now() - rapidStartedAt;
  console.log("live-e2e: rapid edit ready");

  // The first completed revision can become visible while later key-event
  // revisions are still draining. Wait for the coalesced queue to settle
  // before taking the disconnect-retention baseline.
  await page.waitForTimeout(600);
  await expect(page.locator(".texpresso-status--ready")).toBeVisible();
  const beforeDisconnect = await imageSources(page);
  stopCompanion();
  await expect(page.locator(".texpresso-status--disconnected")).toBeVisible();
  expect(await imageSources(page)).toEqual(beforeDisconnect);
  console.log("live-e2e: disconnect retained");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(" edited while disconnected");

  const reconnectStartedAt = performance.now();
  startCompanion();
  await expect(page.locator(".texpresso-status--ready")).toBeVisible({ timeout: 45_000 });
  await waitForChangedPages(page, beforeDisconnect);
  const reconnectMs = performance.now() - reconnectStartedAt;
  console.log("live-e2e: reconnect ready");
  await page.screenshot({ path: "test-results/texpresso-live-preview.png", fullPage: true });

  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".texpresso-preview")).toHaveCount(0);
  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".texpresso-page [data-source-url]").first()).toBeVisible();

  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("treeitem", { name: /main\.tex/ }).dblclick();
  const compileRequest = page.waitForRequest((request) => request.url().includes("/api/v1/compile"));
  const compileResponse = page.waitForResponse((response) => response.url().includes("/api/v1/compile"));
  await page.getByRole("button", { name: "Compile", exact: true }).click();
  await compileRequest;
  expect((await compileResponse).ok()).toBe(true);

  await page.screenshot({ path: "test-results/texpresso-authoritative-compile.png", fullPage: true });

  stopCompanion();
  await page.waitForTimeout(16_000);
  await expect(mode).toHaveCount(0);
  await page.getByRole("button", { name: "Choose compile mode" }).click();
  const selectedCompileMode = page.getByRole("menuitemradio", { checked: true });
  await expect(selectedCompileMode.locator(".compile-options-menu__provider")).toContainText("BusyTeX");
  await selectedCompileMode.click();
  await replaceEditor(page, [
    "\\documentclass{article}",
    "\\begin{document}",
    "BusyTeX fallback compile after Companion loss.",
    "\\end{document}",
    ""
  ].join("\n"));
  await page.getByRole("button", { name: "Compile", exact: true }).click();
  await expect.poll(() => page.workers().some((worker) =>
    worker.url().includes("typr-busytex-worker.js")), { timeout: 30_000 }).toBe(true);

  const browserMeasures = await page.evaluate(() => performance.getEntriesByType("measure")
    .filter((entry) => entry.name.startsWith("typr-texpresso"))
    .map((entry) => ({ name: entry.name, duration: entry.duration })));
  console.log("TeXpresso browser timing", { startupMs, ordinaryMs, rapidSettleMs, reconnectMs, browserMeasures });
  expect(pageErrors).toEqual([]);
});
