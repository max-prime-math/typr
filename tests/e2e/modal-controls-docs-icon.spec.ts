import { expect, test, type Locator, type Page } from "@playwright/test";

async function readControlGeometry(control: Locator) {
  await expect(control).toBeVisible();
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      borderRadius: style.borderRadius,
      height: Math.round(box.height * 100) / 100,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      paddingTop: style.paddingTop
    };
  });
}

async function expectMaskedDocsButton(button: Locator) {
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName("Docs");
  const icon = button.locator(".activity-icon");
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect(icon).toHaveText("");
  await expect(icon).toHaveClass(/activity-icon--docs/);
  expect(
    await icon.evaluate((element) => getComputedStyle(element).maskImage)
  ).toMatch(/docs(?:-[\w-]+)?\.svg/);
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const sheet = page.getByRole("region", { name: "Typr settings" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("Settings and Docs use the shared modal control contract", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const settings = await openSettings(page);
  const settingsHeader = settings.locator(".settings-sheet__header");
  const settingsSearch = settings.getByRole("searchbox", { name: "Search settings" });
  const settingsClose = settings.getByRole("button", { name: "Close", exact: true });
  await expect(settingsHeader).toHaveClass(/modal-control-header/);
  await expect(settingsSearch.locator("..")).toHaveClass(/modal-search-field/);
  await expect(settingsClose).toHaveClass(/modal-close-button/);
  await expect(settings.getByRole("tablist", { name: "Settings tabs" })).toBeVisible();
  const settingsSearchGeometry = await readControlGeometry(settingsSearch);
  const settingsCloseGeometry = await readControlGeometry(settingsClose);
  await settingsSearch.fill("theme");
  const settingsClear = settings.getByRole("button", { name: "Clear settings search" });
  await expect(settingsClear).toHaveClass(/modal-search-field__clear/);
  const settingsClearGeometry = await readControlGeometry(settingsClear);
  await settingsClose.click();

  await page.getByRole("button", { name: "Docs", exact: true }).first().click();
  const docs = page.getByRole("dialog", { name: "Typr documentation" });
  await expect(docs).toBeVisible();
  const docsHeader = docs.locator(".docs-modal__header");
  const docsSearch = docs.getByRole("searchbox", { name: "Search documentation" });
  const docsClose = docs.getByRole("button", { name: "Close", exact: true });
  await expect(docsHeader).toHaveClass(/modal-control-header/);
  await expect(docsSearch.locator("..")).toHaveClass(/modal-search-field/);
  await expect(docsClose).toHaveClass(/modal-close-button/);
  await expect(docs.getByRole("navigation", { name: "Documentation pages" })).toBeVisible();

  const docsSearchGeometry = await readControlGeometry(docsSearch);
  const docsCloseGeometry = await readControlGeometry(docsClose);
  await docsSearch.fill("theme");
  const docsClear = docs.getByRole("button", { name: "Clear documentation search" });
  await expect(docsClear).toHaveClass(/modal-search-field__clear/);
  const docsClearGeometry = await readControlGeometry(docsClear);
  expect(docsSearchGeometry).toEqual(settingsSearchGeometry);
  expect(docsCloseGeometry).toEqual(settingsCloseGeometry);
  expect(docsClearGeometry).toEqual(settingsClearGeometry);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
] as const) {
  test(`Docs uses one accessible masked icon at the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    if (viewport.name === "mobile") {
      await page.getByRole("tab", { name: "Files", exact: true }).click();
    }

    const docsButton = page.getByRole("button", { name: "Docs", exact: true }).first();
    await expectMaskedDocsButton(docsButton);
    await docsButton.click();
    const docs = page.getByLabel("Typr documentation");
    await expect(docs).toBeVisible();
    if (viewport.name === "mobile") {
      const tocToggle = docs.locator(".docs-modal__mobile-toc-toggle");
      await expect(tocToggle).toBeVisible();
      await tocToggle.click();
      await expect(tocToggle).toHaveAttribute("aria-expanded", "true");
      await expect(docs.getByRole("navigation", { name: "Documentation pages" })).toBeVisible();
    }
  });
}
