import { expect, test, type Locator, type Page } from "@playwright/test";

async function dispatchPreviewZoom(
  page: Page,
  target: Locator,
  viewport: Locator,
  xRatio: number,
  yRatio: number
) {
  const before = await target.boundingBox();
  const viewportBox = await viewport.boundingBox();

  expect(before).not.toBeNull();
  expect(viewportBox).not.toBeNull();

  const clientX = Math.min(
    before!.x + before!.width * xRatio,
    viewportBox!.x + viewportBox!.width - 30
  );
  const clientY = Math.min(
    before!.y + before!.height * yRatio,
    viewportBox!.y + viewportBox!.height - 30
  );
  const anchorBefore = {
    x: (clientX - before!.x) / before!.width,
    y: (clientY - before!.y) / before!.height
  };

  await target.dispatchEvent("wheel", {
    altKey: true,
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    deltaY: -300
  });
  await page.waitForTimeout(150);

  const after = await target.boundingBox();
  expect(after).not.toBeNull();

  return {
    after: after!,
    anchorAfter: {
      x: (clientX - after!.x) / after!.width,
      y: (clientY - after!.y) / after!.height
    },
    anchorBefore,
    before: before!
  };
}

test("preview zoom is continuous and cursor anchored across document types", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const zoomSelect = page.locator('select[aria-label="Preview zoom"]:visible').first();
  const markdown = page.locator(".preview-markdown");
  await expect(markdown).toBeVisible();
  const markdownViewport = page.locator(".preview-document--markdown");
  const markdownZoom = await dispatchPreviewZoom(page, markdown, markdownViewport, 0.62, 0.5);

  expect(markdownZoom.after.height).toBeGreaterThan(markdownZoom.before.height * 1.5);
  expect(markdownZoom.anchorAfter.y).toBeCloseTo(markdownZoom.anchorBefore.y, 1);
  expect(await zoomSelect.inputValue()).toBe("171.6");

  await page.getByText("main.typ", { exact: true }).first().click();
  const compileButton = page.getByRole("button", { name: "Compile", exact: true });
  await expect(compileButton).toBeVisible();
  await compileButton.click();
  await zoomSelect.selectOption("fit-width");
  const typst = page.locator(".preview-document__object");
  await expect(typst).toBeVisible();
  const typstViewport = page.locator(".preview-document").filter({ has: typst });
  const typstZoom = await dispatchPreviewZoom(page, typst, typstViewport, 0.68, 0.48);

  expect(typstZoom.after.width).toBeGreaterThan(typstZoom.before.width * 1.5);
  expect(typstZoom.anchorAfter.x).toBeCloseTo(typstZoom.anchorBefore.x, 1);
  expect(typstZoom.anchorAfter.y).toBeCloseTo(typstZoom.anchorBefore.y, 1);

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">',
    '<rect width="800" height="600" fill="white"/>',
    '<rect x="80" y="70" width="640" height="460" fill="#167d89"/>',
    '<circle cx="520" cy="260" r="120" fill="#e6543c"/>',
    "</svg>"
  ].join("");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "zoom-test.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg)
  });
  await page.getByText("zoom-test.svg", { exact: true }).first().click();
  await zoomSelect.selectOption("fit-width");
  const image = page.locator(".preview-file-preview__image");
  await expect(image).toBeVisible();
  await expect.poll(async () => (await image.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  const imageViewport = page.locator(".preview-document--asset");
  const imageZoom = await dispatchPreviewZoom(page, image, imageViewport, 0.7, 0.45);

  expect(imageZoom.after.width).toBeGreaterThan(imageZoom.before.width * 1.5);
  expect(imageZoom.anchorAfter.x).toBeCloseTo(imageZoom.anchorBefore.x, 1);
});

test("mobile preview pinch zoom is continuous", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Synthetic Touch construction is Chromium-only.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Preview", exact: true }).click();

  const markdown = page.locator(".preview-markdown");
  await expect(markdown).toBeVisible();
  const before = await markdown.boundingBox();
  expect(before).not.toBeNull();

  await markdown.evaluate((target) => {
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
    target.dispatchEvent(new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      targetTouches: [first, second],
      touches: [first, second]
    }));

    const movedFirst = new Touch({
      clientX: 105,
      clientY: 360,
      identifier: 1,
      target
    });
    const movedSecond = new Touch({
      clientX: 285,
      clientY: 360,
      identifier: 2,
      target
    });
    target.dispatchEvent(new TouchEvent("touchmove", {
      bubbles: true,
      cancelable: true,
      targetTouches: [movedFirst, movedSecond],
      touches: [movedFirst, movedSecond]
    }));
    target.dispatchEvent(new TouchEvent("touchend", {
      bubbles: true,
      cancelable: true,
      targetTouches: [],
      touches: []
    }));
  });
  await page.waitForTimeout(150);

  const after = await markdown.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.height).toBeGreaterThan(before!.height * 1.4);
  await expect(page.locator('select[aria-label="Preview zoom"]:visible').first()).toHaveValue("163.6");
});

test("mobile Typst pinch applies every scale update before release", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByText("main.typ", { exact: true }).first().click();
  const compileButton = page.getByRole("button", { name: "Compile", exact: true });
  await expect(compileButton).toBeVisible();
  await compileButton.click();
  const typstImage = page.getByRole("img", { name: "Typst preview document" });
  await expect(typstImage).toBeVisible({ timeout: 60_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  const zoomSelect = page.locator('select[aria-label="Preview zoom"]:visible').first();
  await zoomSelect.selectOption("fit-width");
  const canvas = page.locator(".preview-document__canvas--transformed");
  const sizer = page.locator(".preview-document__canvas-sizer");
  await expect(canvas).toBeVisible();
  const stableLayoutWidth = await canvas.evaluate((element) => element.offsetWidth);
  const initialWidth = (await typstImage.boundingBox())?.width ?? 0;
  expect(initialWidth).toBeGreaterThan(0);
  const dispatchGesture = async (type: string, scale: number) => {
    await typstImage.evaluate((target, detail) => {
      const event = new Event(detail.type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "scale", { value: detail.scale });
      target.dispatchEvent(event);
    }, { type, scale });
  };

  await dispatchGesture("gesturestart", 1);
  await dispatchGesture("gesturechange", 1.2);
  await expect(zoomSelect).toHaveValue("120");
  const widthAt120 = (await typstImage.boundingBox())?.width ?? 0;
  await dispatchGesture("gesturechange", 1.6);
  await expect(zoomSelect).toHaveValue("160");
  const widthAt160 = (await typstImage.boundingBox())?.width ?? 0;
  await dispatchGesture("gesturechange", 2);
  await expect(zoomSelect).toHaveValue("200");
  const widthAt200 = (await typstImage.boundingBox())?.width ?? 0;
  await dispatchGesture("gestureend", 2);

  expect(widthAt120).toBeGreaterThan(initialWidth * 1.15);
  expect(widthAt160).toBeGreaterThan(widthAt120 * 1.25);
  expect(widthAt200).toBeGreaterThan(widthAt160 * 1.2);
  expect(await canvas.evaluate((element) => element.offsetWidth)).toBe(stableLayoutWidth);
  expect(await sizer.evaluate((element) => element.offsetWidth)).toBeGreaterThan(stableLayoutWidth * 1.9);
});
