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

async function expectMaskedInfoButton(button: Locator) {
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName("Application info");
  const icon = button.locator(".activity-icon");
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect(icon).toHaveText("");
  await expect(icon).toHaveClass(/activity-icon--info/);
  expect(
    await icon.evaluate((element) => getComputedStyle(element).maskImage)
  ).toMatch(/info(?:-[\w-]+)?\.svg/);
}

async function expectDocsButton(button: Locator) {
  await expect(button).toBeVisible();
  const icon = button.locator(".activity-icon");
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect(icon).toHaveClass(/activity-icon--docs/);
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const sheet = page.getByRole("region", { name: "Typr settings" });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("Settings uses the shared modal control contract", async ({ page }) => {
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
  expect(settingsSearchGeometry.height).toBeGreaterThan(0);
  expect(settingsCloseGeometry.height).toBeGreaterThan(0);
  expect(settingsClearGeometry.height).toBeGreaterThan(0);
  await settingsClose.click();
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 }
] as const) {
  test(`Application Info uses Lucide Info at the ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    if (viewport.name === "mobile") {
      await page.getByRole("tab", { name: "Files", exact: true }).click();
    }

    const infoButton = page
      .getByRole("button", { name: "Application info", exact: true })
      .first();
    const docsButton = page.getByRole("button", { name: "Docs", exact: true }).first();
    await expectDocsButton(docsButton);
    await expectMaskedInfoButton(infoButton);
    await infoButton.click();

    const info = page.getByRole("dialog", { name: "Typr application information" });
    await expect(info).toBeVisible();
    await expect(info.locator("h2")).toHaveText("Typr");
    await expect(info.getByText("Version", { exact: true })).toBeVisible();
    await expect(info.getByText("Build", { exact: true })).toBeVisible();
    await expect(info.getByText("Service worker", { exact: true })).toBeVisible();

    for (const name of ["GitHub repository", "Issue tracker"]) {
      const link = info.getByRole("link", { name: new RegExp(name) });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
    }
    await expect(info.getByRole("link", { name: /Documentation/ })).toHaveCount(0);
  });
}
