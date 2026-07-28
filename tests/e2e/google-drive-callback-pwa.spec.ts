import { expect, test } from "@playwright/test";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

test("the active PWA worker lets the dedicated OAuth callback capture before app startup", async ({
  page
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    )
    .toBe(true);

  const projectId = await page.evaluate(async () => {
    return new Promise<string>((resolve, reject) => {
      const openRequest = indexedDB.open("typr");
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction("app", "readonly");
        const request = transaction.objectStore("app").get("project-storage");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const storage = request.result as {
            projects: Array<{ id: string }>;
            selectedProjectId: string;
          };
          database.close();
          resolve(storage.selectedProjectId ?? storage.projects[0].id);
        };
      };
    });
  });
  await page.evaluate((selectedProjectId) => {
    const pending = JSON.stringify({
      createdAt: Date.now(),
      intent: "connect",
      projectId: selectedProjectId,
      redirectUri: `${location.origin}/google-drive-oauth-callback.html`,
      returnUri: `${location.origin}/`,
      state: "pwa-oauth-state",
      version: 2
    });
    sessionStorage.setItem(
      "typr.google-drive.oauth-pending.v2",
      pending
    );
    localStorage.setItem(
      "typr.google-drive.oauth-pending.v2",
      pending
    );
  }, projectId);

  await page.goto(
    `/google-drive-oauth-callback.html#access_token=pwa-token&expires_in=3600&scope=${encodeURIComponent(
      DRIVE_SCOPE
    )}&state=pwa-oauth-state`,
    { waitUntil: "domcontentloaded" }
  );

  await expect(
    page.getByText("Google authorization complete", { exact: true })
  ).toBeVisible();
  expect(page.url()).not.toContain("access_token");
  expect(page.url()).not.toContain("google-drive-oauth-callback.html");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("typr.google-drive.oauth-result.v2")
    )
  ).toContain("pwa-token");
});
