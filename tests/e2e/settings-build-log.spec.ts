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

test("Settings controls remain within the mobile pane", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();

  const mobileSheet = page.getByRole("region", { name: "Typr settings" });
  const mobileNavToggle = mobileSheet.locator(".settings-sheet__mobile-nav-toggle");
  const tabNames = ["Sync", "Git", "Themes", "Editor", "Keybindings", "Packages", "Snippets"];

  for (const tabName of tabNames) {
    await mobileNavToggle.click();
    await mobileSheet.getByRole("tab", { name: tabName, exact: true }).click();
    await expect(mobileNavToggle).toContainText(tabName);
    await expect.poll(() => mobileSheet.locator(".settings-sheet__body").evaluate((element) =>
      element.scrollWidth <= element.clientWidth + 1
    )).toBe(true);
  }

  const tokenField = mobileSheet.getByLabel("Fine-grained token");
  await expect(tokenField).toBeVisible();
  await expect.poll(() => tokenField.locator("xpath=..").evaluate((element) =>
    element.scrollWidth <= element.clientWidth + 1
  )).toBe(true);
});

test("Companion API key stays masked, persists, and authenticates connection checks", async ({ page }) => {
  const apiKey = `typr_${"k".repeat(43)}`;
  let authorization: string | undefined;
  await page.route("http://127.0.0.1:8484/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Origin": "http://127.0.0.1:5174"
        }
      });
      return;
    }
    authorization = request.headers().authorization;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5174" },
      body: JSON.stringify({
        protocolVersion: 1,
        serverVersion: "test",
        capabilities: {
          compile: { engines: ["pdflatex"] },
          filesystem: { projectStorage: false },
          lsp: { languages: [] },
          git: { enabled: false },
          terminal: { enabled: false }
        }
      })
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("region", { name: "Typr settings" });
  await settings.getByRole("tab", { name: "Editor", exact: true }).click();
  const apiKeyField = settings.getByLabel("API key");
  await expect(apiKeyField).toHaveAttribute("type", "password");
  await apiKeyField.fill(apiKey);
  await settings.getByRole("button", { name: "Show", exact: true }).click();
  await expect(apiKeyField).toHaveAttribute("type", "text");
  await settings.getByRole("button", { name: "Hide", exact: true }).click();
  await settings.getByRole("button", { name: "Apply", exact: true }).click();
  await expect.poll(() => authorization).toBe(`Bearer ${apiKey}`);
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open("typr");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("app", "readonly");
    const getRequest = transaction.objectStore("app").get("companion-api-key");
    const value = await new Promise<unknown>((resolve, reject) => {
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    });
    database.close();
    return value;
  })).toBe(apiKey);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const reloadedSettings = page.getByRole("region", { name: "Typr settings" });
  await reloadedSettings.getByRole("tab", { name: "Editor", exact: true }).click();
  const reloadedApiKeyField = reloadedSettings.getByLabel("API key");
  await expect(reloadedApiKeyField).toHaveAttribute("type", "password");
  await expect(reloadedApiKeyField).toHaveValue(apiKey);
});

test("Build Log renders, filters, and clears compile history", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const sourceFile = page.getByRole("treeitem", { name: /typst\.typ/ });
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
  await buildLog.getByLabel("Search").fill("typst.typ");
  await expect(buildLog.locator(".build-log-entry").first()).toBeVisible();
  await buildLog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(buildLog.getByText("No builds match the current filters.")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
