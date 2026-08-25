import { expect, test } from "@playwright/test";

test("Diagram SVG-Edit survives StrictMode and repeated panel remounts", async ({ page }) => {
  const pageErrors: Array<{ message: string; stack?: string }> = [];
  page.on("pageerror", (error) => {
    pageErrors.push({ message: error.message, stack: error.stack });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const diagramButton = page.getByRole("button", { name: "Diagram", exact: true }).first();
  const filesButton = page.getByRole("button", { name: "Files", exact: true }).first();
  const editorCanvas = page.locator(".diagram-editor__svgedit-host #svgcanvas");

  await expect(diagramButton).toBeVisible();
  await diagramButton.click();
  await expect(editorCanvas).toBeVisible();
  await expect(page.locator(".diagram-editor__svgedit-host #svgcontent")).toHaveCount(1);
  await editorCanvas.evaluate((canvas) => {
    canvas.setAttribute("data-finding-10-runtime", "stable");
  });

  await filesButton.click();
  await page.waitForTimeout(1_100);
  await expect(page.locator(".diagram-editor__svgedit-host #svgcanvas")).toHaveCount(0);
  await expect(page.locator("#typr-svgedit-parking #svgcanvas")).toHaveCount(1);

  for (const delay of [100, 300, 600, 800]) {
    await diagramButton.click();
    await expect(editorCanvas).toBeVisible();
    await page.waitForTimeout(delay);
    await filesButton.click();
    await page.waitForTimeout(1_100);
    await expect(page.locator("#typr-svgedit-parking #svgcanvas")).toHaveCount(1);
  }

  await diagramButton.click();
  await expect(editorCanvas).toBeVisible();
  await page.waitForTimeout(1_250);

  expect(pageErrors).toEqual([]);
  await expect(page.locator("#svgcanvas")).toHaveCount(1);
  await expect(editorCanvas).toHaveAttribute("data-finding-10-runtime", "stable");
});

test("Diagram restores the last selected Draw or TikZ tab after reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  await page.getByRole("button", { name: "Diagram", exact: true }).first().click();
  const diagramTabs = page.getByRole("tablist", { name: "Diagram editor" });
  const drawTab = diagramTabs.getByRole("tab", { name: "Draw", exact: true });
  const tikzTab = diagramTabs.getByRole("tab", { name: "TikZ", exact: true });

  await tikzTab.click();
  await expect(tikzTab).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("typr.left-pane.v1")))
    .toContain('"diagramPaneMode":"tikz"');

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "TikZ", exact: true })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await page.getByRole("tab", { name: "Draw", exact: true }).click();
  await expect(drawTab).toHaveAttribute("aria-selected", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Draw", exact: true })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("New TikZ figure starts blank and selects its default name for replacement", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  await page.getByRole("button", { name: "Diagram", exact: true }).first().click();
  await page.getByRole("tab", { name: "TikZ", exact: true }).click();
  await page.getByRole("button", { name: "New TikZ figure", exact: true }).click();

  const fileName = page.getByRole("textbox", { name: "TikZ file name" });
  await expect(fileName).toBeFocused();
  await expect(fileName).toHaveValue("diagram.tikz");
  await expect.poll(() => fileName.evaluate((input: HTMLInputElement) => ({
    start: input.selectionStart,
    end: input.selectionEnd,
    length: input.value.length
  }))).toEqual({ start: 0, end: 7, length: 12 });

  await page.keyboard.insertText("orbit");
  await page.keyboard.press("Enter");
  await expect(fileName).toHaveValue("orbit.tikz");

  await page.locator(".tikz-editor").getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(fileName).toBeFocused();
  await expect(fileName).toHaveValue("orbit-copy.tikz");
  await expect.poll(() => fileName.evaluate((input: HTMLInputElement) => ({
    start: input.selectionStart,
    end: input.selectionEnd,
    length: input.value.length
  }))).toEqual({ start: 0, end: 10, length: 15 });

  await page.keyboard.press("Enter");

  await page.locator(".tikz-editor").getByRole("button", { name: "New", exact: true }).click();
  await expect(fileName).toBeFocused();
  await expect(fileName).toHaveValue("diagram.tikz");
  await expect.poll(() => fileName.evaluate((input: HTMLInputElement) => ({
    start: input.selectionStart,
    end: input.selectionEnd,
    length: input.value.length
  }))).toEqual({ start: 0, end: 7, length: 12 });
});

test("Sidebar resize ends when the pointer is released over the TikZ iframe", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  await page.getByRole("button", { name: "Diagram", exact: true }).first().click();
  await page.getByRole("tab", { name: "TikZ", exact: true }).click();
  await page.getByRole("button", { name: "New TikZ figure", exact: true }).click();

  const sidebar = page.locator(".pane--sidebar");
  const resizeHandle = page.getByRole("button", { name: "Resize sidebar" });
  const tikzFrame = page.locator(".tikz-editor__frame");
  await expect(tikzFrame).toBeVisible();

  const handleBox = await resizeHandle.boundingBox();
  const frameBox = await tikzFrame.boundingBox();
  if (!handleBox || !frameBox) {
    throw new Error("Expected the sidebar resize handle and TikZ iframe to have bounds.");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    frameBox.x + frameBox.width / 2,
    frameBox.y + frameBox.height / 2,
    { steps: 4 }
  );
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => document.body.style.userSelect)).toBe("");
  await page.waitForTimeout(250);
  const widthAfterRelease = await sidebar.evaluate((element) => element.getBoundingClientRect().width);

  await page.mouse.move(handleBox.x + 160, handleBox.y + handleBox.height / 2);
  await page.waitForTimeout(250);
  const widthAfterMove = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(widthAfterMove - widthAfterRelease)).toBeLessThan(2);
});
