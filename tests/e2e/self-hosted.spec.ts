import { expect, test } from "@playwright/test";
const EDIT_MARKER = "// self-hosted browser-local persistence";

async function persistedProjectContains(page: import("@playwright/test").Page, marker: string) {
  return page.evaluate(async (expectedMarker) => new Promise<boolean>((resolve, reject) => {
    const containsMarker = (value: unknown, seen = new Set<object>()): boolean => {
      if (typeof value === "string") return value.includes(expectedMarker);
      if (value instanceof ArrayBuffer) return new TextDecoder().decode(value).includes(expectedMarker);
      if (ArrayBuffer.isView(value)) {
        return new TextDecoder().decode(
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        ).includes(expectedMarker);
      }
      if (!value || typeof value !== "object" || seen.has(value)) return false;
      seen.add(value);
      return Object.values(value).some((entry) => containsMarker(entry, seen));
    };
    const openRequest = indexedDB.open("typr");
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction("app", "readonly");
      const request = transaction.objectStore("app").get("project-storage");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(containsMarker(request.result));
        database.close();
      };
    };
  }), marker);
}

test("self-hosted image excludes cloud Drive code and keeps browser storage authoritative", async ({ page }, testInfo) => {
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;
  const unexpectedCrossOriginRequests: string[] = [];
  const workspaceRequests: string[] = [];
  let blockNetwork = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    if (blockNetwork && isHttp) {
      await route.abort("internetdisconnected");
      return;
    }
    if (isHttp && url.origin !== appOrigin) {
      unexpectedCrossOriginRequests.push(request.url());
      await route.abort("blockedbyclient");
      return;
    }
    if (url.pathname.startsWith("/api/v1/workspace/")) workspaceRequests.push(request.url());
    await route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const sourceFile = page.getByRole("treeitem", { name: /typst\.typ/ });
  await expect(sourceFile).toBeVisible();
  await sourceFile.click();

  await page.getByRole("button", { name: "Compile", exact: true }).click();
  await expect(page.getByRole("img", { name: "Typst preview document" })).toBeVisible({ timeout: 60_000 });

  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.pressSequentially(EDIT_MARKER);
  await expect(editor).toContainText(EDIT_MARKER);
  await expect.poll(() => persistedProjectContains(page, EDIT_MARKER)).toBe(true);

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("region", { name: "Typr settings" });
  await settings.getByRole("tab", { name: "Sync", exact: true }).click();
  await expect(settings.getByText("Google Drive", { exact: true })).toHaveCount(0);
  await expect(settings.getByRole("button", { name: /Google Drive/i })).toHaveCount(0);
  await settings.getByRole("tab", { name: "Editor", exact: true }).click();
  await expect(settings.getByText(/Google Drive/i)).toHaveCount(0);
  await settings.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Projects", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /Import Drive project/i })).toHaveCount(0);
  await expect(page.locator(".project-manager").getByText(/Google Drive/i)).toHaveCount(0);

  expect(unexpectedCrossOriginRequests).toEqual([]);
  expect(workspaceRequests).toEqual([]);

  const release = await page.request.get("/release.json").then((response) => response.json()) as {
    channel: string;
  };
  const obsoleteCache = `typr-${release.channel}-obsolete-compiler-assets`;
  await page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    await cache.put("/obsolete-compiler", new Response("obsolete"));
  }, obsoleteCache);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-content").first()).toContainText(EDIT_MARKER);
  await expect.poll(() => page.evaluate((cacheName) => caches.has(cacheName), obsoleteCache)).toBe(false);
  expect(unexpectedCrossOriginRequests).toEqual([]);
  expect(workspaceRequests).toEqual([]);

  const callback = await page.request.get("/google-drive-oauth-callback.html");
  expect(callback.status()).toBe(404);

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  blockNetwork = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-content").first()).toContainText(EDIT_MARKER);
  blockNetwork = false;
  expect(unexpectedCrossOriginRequests).toEqual([]);
  expect(workspaceRequests).toEqual([]);
});
