import { expect, test, type Locator, type Page } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
] as const;

async function getButtonSize(button: Locator) {
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  return { width: box!.width, height: box!.height };
}

async function expectContractMatches(page: Page, size: { width: number; height: number }) {
  const contractSize = await page.evaluate(() => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--pane-header-icon-button-size")
      .trim();
    if (!value) {
      return 0;
    }
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;display:block;width:${value}`;
    document.body.append(probe);
    const pixels = probe.getBoundingClientRect().width;
    probe.remove();
    return pixels;
  });

  expect(contractSize).toBeGreaterThan(0);
  expect(size.width).toBeCloseTo(contractSize, 1);
  expect(size.height).toBeCloseTo(contractSize, 1);
}

for (const viewport of viewports) {
  test(`preview icon buttons share deliberate sizing at the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    if (viewport.name === "mobile") {
      await page.getByRole("tab", { name: "Preview", exact: true }).click();
    }

    const previewPane = page.getByRole("region", { name: "Document preview" });
    const zoomButtons = previewPane.locator(".preview-zoom-button:visible");
    await expect(zoomButtons).toHaveCount(2);
    const expectedSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.4);
    const referenceSize = { width: expectedSize, height: expectedSize };
    if (viewport.name === "desktop") {
      const downloadSize = await getButtonSize(
        previewPane.getByRole("button", { name: "Download preview", exact: true })
      );
      expect(downloadSize.width).toBeCloseTo(expectedSize, 1);
      expect(downloadSize.height).toBeCloseTo(expectedSize, 1);
    }

    for (const zoomButton of await zoomButtons.all()) {
      const zoomSize = await getButtonSize(zoomButton);
      expect(zoomSize.width).toBeCloseTo(referenceSize.width, 1);
      expect(zoomSize.height).toBeCloseTo(referenceSize.height, 1);
    }
    await expect(zoomButtons.nth(0)).toHaveAttribute("aria-label", "Zoom out");
    await expect(zoomButtons.nth(1)).toHaveAttribute("aria-label", "Zoom in");
    await expectContractMatches(page, referenceSize);
  });

  test(`Git icon buttons cannot override shared sizing at the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    if (viewport.name === "mobile") {
      await page.getByRole("tab", { name: /Files|Git/, exact: true }).click();
    }

    const referenceSize = await getButtonSize(page.getByRole("button", { name: "New file", exact: true }));
    await page.getByRole("button", { name: "Git", exact: true }).first().click();

    const gitPanel = page.locator(".sidebar-section--sync");
    for (const button of [
      gitPanel.getByRole("button", { name: "Add repo", exact: true }),
      gitPanel.getByRole("button", { name: "Remove repo", exact: true })
    ]) {
      const gitSize = await getButtonSize(button);
      expect(gitSize.width).toBeCloseTo(referenceSize.width, 1);
      expect(gitSize.height).toBeCloseTo(referenceSize.height, 1);
    }
    await expectContractMatches(page, referenceSize);
  });
}
