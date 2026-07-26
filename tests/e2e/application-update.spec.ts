import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("an unsafe installed PWA shows a quiet badge and activates on request", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The service-worker mutation runs once.");

  const serviceWorkerPath = path.join(process.cwd(), "dist", "sw.js");
  const originalServiceWorker = await readFile(serviceWorkerPath, "utf8");

  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "New file", exact: true }).click();
    const renameInput = page.getByRole("textbox", { name: /^Rename / });
    await expect(renameInput).toBeVisible();

    await writeFile(
      serviceWorkerPath,
      `${originalServiceWorker}\n/* typr-update-e2e-${Date.now()} */\n`,
      "utf8"
    );

    const infoButton = page.getByRole("button", {
      name: "Application info",
      exact: true
    });
    await infoButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });

    const info = page.getByRole("dialog", { name: "Typr application information" });
    const checkButton = info.getByRole("button", { name: "Check for updates" });
    await checkButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });

    await expect(info.getByText(/update is ready|Typr .* is ready/i)).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByTestId("application-update-badge")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.waiting)
        )
      )
      .toBe(true);

    await page.evaluate(() => {
      sessionStorage.setItem("typr-update-e2e", "waiting");
    });
    const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await info.getByRole("button", { name: "Update", exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await navigation;

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return Boolean(navigator.serviceWorker.controller) && !registration?.waiting;
        })
      )
      .toBe(true);
    expect(
      await page.evaluate(() => sessionStorage.getItem("typr-update-e2e"))
    ).toBe("waiting");
  } finally {
    await writeFile(serviceWorkerPath, originalServiceWorker, "utf8");
  }
});
