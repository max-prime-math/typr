import { expect, test } from "@playwright/test";

test("Settings preserves accessible desktop and mobile sheet behavior", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();

  const desktopSheet = page.getByRole("region", { name: "Typr settings" });
  await expect(desktopSheet).toBeVisible();
  await expect(desktopSheet.getByRole("tablist", { name: "Settings tabs" })).toBeVisible();
  await desktopSheet.getByRole("tab", { name: "Themes", exact: true }).click();
  await expect(desktopSheet.getByRole("tab", { name: "Themes", exact: true })).toHaveAttribute("aria-selected", "true");
  await desktopSheet.getByRole("button", { name: "Close", exact: true }).click();

  expect(await page.evaluate(() => localStorage.getItem("typr.settings-menu.v1"))).toContain('"tab":"themes"');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();

  const mobileSheet = page.getByRole("region", { name: "Typr settings" });
  await expect(mobileSheet).toBeVisible();
  const mobileNavToggle = mobileSheet.locator(".settings-sheet__mobile-nav-toggle");
  await expect(mobileNavToggle).toContainText("Themes");
  await mobileNavToggle.click();
  await expect(mobileNavToggle).toHaveAttribute("aria-expanded", "true");
  await expect(mobileSheet.locator(".settings-sheet__mobile-search").getByLabel("Search settings")).toBeVisible();
  await mobileSheet.getByRole("tab", { name: "Packages", exact: true }).click();
  await expect(mobileNavToggle).toContainText("Packages");
  await expect(mobileNavToggle).toHaveAttribute("aria-expanded", "false");

  expect(pageErrors).toEqual([]);
});

test("Build Log renders, filters, and clears compile history", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const sourceFile = page.getByRole("treeitem", { name: /main\.typ/ });
  await expect(sourceFile).toBeVisible();
  await sourceFile.click();

  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n// Build Log smoke change");

  const compileButton = page.getByRole("button", { name: "Compile", exact: true });
  await expect(compileButton).toBeVisible();
  await compileButton.click();

  await page.getByRole("button", { name: "Debug", exact: true }).first().click();
  const buildLog = page.locator("details.debug-section").filter({ hasText: "Build log" }).first();
  await expect(buildLog).toBeVisible();
  await expect(buildLog.locator(".build-log-entry").first()).toBeVisible({ timeout: 30_000 });
  await expect(buildLog.getByRole("button", { name: "Copy filtered build log" })).toBeVisible();
  await buildLog.getByLabel("Filter").selectOption("current-file");
  await buildLog.getByLabel("Search").fill("main.typ");
  await expect(buildLog.locator(".build-log-entry").first()).toBeVisible();
  await buildLog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(buildLog.getByText("No builds match the current filters.")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
