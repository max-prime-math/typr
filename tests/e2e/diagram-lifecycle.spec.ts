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
