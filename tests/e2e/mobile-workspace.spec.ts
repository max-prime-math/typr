import { expect, test, type Page } from "@playwright/test";

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function waitForMobileAppReady(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );
}

async function openMobileSourceFile(
  page: Page,
  treeName: RegExp,
  tabName: string
): Promise<void> {
  await page.waitForTimeout(350);
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  const treeItem = page.getByRole("treeitem", { name: treeName });
  await treeItem.waitFor({ state: "visible" });
  await treeItem.click();
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  await expect(
    page
      .getByRole("tablist", { name: "Open source files" })
      .getByRole("tab", { name: tabName, exact: true })
  ).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
}

test.describe.configure({ mode: "serial" });

test.use({
  deviceScaleFactor: 2,
  userAgent: MOBILE_USER_AGENT,
  viewport: { width: 390, height: 844 }
});

test("mobile first load releases controls without a reload", async ({
  browserName,
  page
}) => {
  test.skip(browserName !== "chromium", "Mobile startup regression runs in Chromium.");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const filesTab = page.getByRole("tab", { name: "Files", exact: true });
  await filesTab.click();

  await expect(filesTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#boot-splash")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-typr-app-ready", "true");

  await page.waitForTimeout(2_500);
  const sourceTab = page.getByRole("tab", { name: "Source", exact: true });
  await sourceTab.click();
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await filesTab.click();
  await expect(filesTab).toHaveAttribute("aria-selected", "true");

  const loadedHarperOnMainThread = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .some((entry) => entry.name.includes("binaryInlined"))
  );
  expect(loadedHarperOnMainThread).toBe(false);
});

test("mobile source scrolling keeps pane controls fixed", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Mobile layout regression runs in the Chromium touch harness.");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForMobileAppReady(page);
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.getByRole("treeitem", { name: /README\.md/ }).waitFor();

  const source = Array.from(
    { length: 180 },
    (_, index) => `Line ${index + 1}`
  ).join("\n");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "mobile-scroll.md",
    mimeType: "text/plain",
    buffer: Buffer.from(source)
  });
  await openMobileSourceFile(page, /mobile-scroll\.md/, "mobile-scroll.md");

  const switcher = page.getByRole("tablist", { name: "Workspace panes" });
  const sourcePane = page.getByLabel("Source editor");
  const sourceHeader = sourcePane.locator(":scope > .pane__header");
  const scroller = sourcePane.locator(".cm-scroller");
  const workspace = page.locator(".workspace--mobile");
  const switcherBefore = await switcher.boundingBox();
  const headerBefore = await sourceHeader.boundingBox();

  expect(switcherBefore).not.toBeNull();
  expect(headerBefore).not.toBeNull();
  await scroller.evaluate((element) => {
    element.scrollTop = 600;
    element.dispatchEvent(new Event("scroll"));
  });

  await expect.poll(async () => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(500);
  expect(await workspace.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await sourcePane.evaluate((element) => element.scrollTop)).toBe(0);
  expect((await switcher.boundingBox())?.y).toBeCloseTo(switcherBefore!.y, 1);
  expect((await sourceHeader.boundingBox())?.y).toBeCloseTo(headerBefore!.y, 1);
});

test("mobile Safari gesture scale continuously zooms the preview", async ({
  browserName,
  page
}) => {
  test.skip(browserName !== "chromium", "Synthetic Safari gesture events use the Chromium harness.");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForMobileAppReady(page);
  await page.getByRole("tab", { name: "Preview", exact: true }).click();

  const markdown = page.locator(".preview-markdown");
  const zoomSelect = page.locator('select[aria-label="Preview zoom"]:visible').first();
  await expect(markdown).toBeVisible();
  const before = await markdown.boundingBox();
  expect(before).not.toBeNull();

  const prevention = await markdown.evaluate((target) => {
    const first = new Touch({
      clientX: 140,
      clientY: 360,
      identifier: 1,
      target
    });
    const second = new Touch({
      clientX: 250,
      clientY: 360,
      identifier: 2,
      target
    });
    const touchStart = new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      targetTouches: [first, second],
      touches: [first, second]
    });
    target.dispatchEvent(touchStart);

    const dispatchGesture = (type: string, scale: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "scale", { value: scale });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    return {
      touchStart: touchStart.defaultPrevented,
      gestureStart: dispatchGesture("gesturestart", 1),
      gestureChange: dispatchGesture("gesturechange", 1.8),
      gestureEnd: dispatchGesture("gestureend", 1.8)
    };
  });

  expect(prevention).toEqual({
    gestureChange: true,
    gestureEnd: true,
    gestureStart: true,
    touchStart: true
  });
  await expect(zoomSelect).toHaveValue("180");
  await expect.poll(async () => (await markdown.boundingBox())?.height ?? 0)
    .toBeGreaterThan(before!.height * 1.7);
});

test("mobile first LaTeX compile stays alive and renders its PDF", async ({
  browserName,
  page
}) => {
  test.skip(browserName !== "chromium", "Mobile compiler regression uses an iPhone user agent.");
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForMobileAppReady(page);
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.getByRole("treeitem", { name: /latex-starter\.tex/ }).waitFor();
  await openMobileSourceFile(page, /latex-starter\.tex/, "latex-starter.tex");

  const compileButton = page.getByRole("button", { name: "Compile", exact: true });
  if (await compileButton.isEnabled()) {
    await compileButton.click();
  }
  await page.getByRole("tab", { name: "Preview", exact: true }).click();

  await expect(
    page.locator(".preview-document--pdf-canvas .pdf-page.canvas canvas").first()
  ).toBeVisible({ timeout: 90_000 });

  const pdfViewport = page.locator(".preview-document--pdf-canvas");
  const pdfCanvas = pdfViewport.locator(".pdf-page.canvas canvas").first();
  const zoomSelect = page.locator('select[aria-label="Preview zoom"]:visible').first();
  const initialCanvasWidth = (await pdfCanvas.boundingBox())?.width ?? 0;
  const dispatchGesture = async (scale: number) => {
    await pdfCanvas.evaluate((target, nextScale) => {
      const dispatch = (type: string, eventScale: number) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "scale", { value: eventScale });
        target.dispatchEvent(event);
      };

      dispatch("gesturestart", 1);
      dispatch("gesturechange", nextScale);
      dispatch("gestureend", nextScale);
    }, scale);
  };

  await dispatchGesture(2);
  await expect(zoomSelect).toHaveValue("200");
  await expect.poll(async () => (await pdfCanvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initialCanvasWidth * 1.9);

  const maxUiGap = await page.evaluate(async () => {
    let maxGap = 0;
    let lastTick = performance.now();
    await new Promise<void>((resolve) => {
      const interval = window.setInterval(() => {
        const now = performance.now();
        maxGap = Math.max(maxGap, now - lastTick);
        lastTick = now;
      }, 16);
      window.setTimeout(() => {
        window.clearInterval(interval);
        resolve();
      }, 900);
    });
    return maxGap;
  });
  expect(maxUiGap).toBeLessThan(300);

  const scrollMetrics = await pdfViewport.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    touchAction: getComputedStyle(element).touchAction
  }));
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
  expect(scrollMetrics.touchAction).toBe("pan-x pan-y");

  const viewportBounds = await pdfViewport.boundingBox();
  expect(viewportBounds).not.toBeNull();
  const touchSession = await page.context().newCDPSession(page);
  const touchStart = {
    x: viewportBounds!.x + viewportBounds!.width * 0.75,
    y: viewportBounds!.y + viewportBounds!.height * 0.75
  };
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchStart]
  });
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchStart.x - 120, y: touchStart.y - 160 }]
  });
  await touchSession.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await expect.poll(async () => pdfViewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(50);
  await expect.poll(async () => pdfViewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(30);

  await dispatchGesture(0.5);
  await expect(zoomSelect).toHaveValue("100");
  await expect.poll(async () => (await pdfCanvas.boundingBox())?.width ?? 0)
    .toBeLessThan(initialCanvasWidth * 1.1);

  await expect(
    page.getByRole("tablist", { name: "Open previews" }).getByRole("tab", {
      name: "latex-starter.pdf"
    })
  ).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(
    page.locator(".preview-document--pdf-canvas .pdf-page.canvas canvas").first()
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("tablist", { name: "Open previews" }).getByRole("tab", {
      name: "latex-starter.pdf"
    })
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
