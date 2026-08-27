import { expect, test, type Route } from "@playwright/test";

test("project pane links the exact mapped workspace and keeps browser storage authoritative", async ({ page }) => {
  const workspaceRequests: string[] = [];
  const files = new Map<string, { bytes: Buffer; etag: string; modifiedAt: number }>();
  let revision = 1;

  await page.addInitScript(() => {
    localStorage.setItem("typr.companion-base-url.v1", "http://127.0.0.1:8484");
  });

  await page.route("http://127.0.0.1:8484/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/status") {
      await json(route, {
        protocolVersion: 1,
        serverVersion: "0.1.2-e2e",
        capabilities: {
          compile: { engines: ["pdflatex"] },
          filesystem: {
            projectStorage: true,
            workspaceApiVersion: 1,
            workspaceId: "e2e-workspace",
            writable: true,
            limits: { maxFileBytes: 16 * 1024 * 1024, maxEntries: 4096, maxWorkspaceBytes: 256 * 1024 * 1024 }
          },
          lsp: { languages: [] },
          git: { enabled: false },
          terminal: { enabled: false }
        }
      });
      return;
    }

    workspaceRequests.push(`${request.method()} ${url.pathname}`);
    if (url.pathname === "/api/v1/workspace/files") {
      await json(route, {
        workspaceId: "e2e-workspace",
        files: [...files.entries()].map(([path, file]) => ({
          path,
          size: file.bytes.byteLength,
          modifiedAt: file.modifiedAt,
          etag: file.etag
        })).sort((left, right) => left.path.localeCompare(right.path))
      });
      return;
    }

    const path = url.searchParams.get("path");
    if (!path) return json(route, { error: { message: "missing path" } }, 400);
    const current = files.get(path);
    if (request.method() === "GET") {
      if (!current) return json(route, { error: { message: "missing" } }, 404);
      await json(route, {
        path,
        size: current.bytes.byteLength,
        modifiedAt: current.modifiedAt,
        etag: current.etag,
        encoding: "base64",
        content: current.bytes.toString("base64")
      });
      return;
    }
    if (request.method() === "PUT") {
      const headers = request.headers();
      if ((current && headers["if-match"] !== current.etag) || (!current && headers["if-none-match"] !== "*")) {
        return json(route, { error: { code: "workspace-precondition-failed", message: "changed" } }, 412);
      }
      const body = request.postDataJSON() as { content: string };
      const file = {
        bytes: Buffer.from(body.content, "base64"),
        etag: `"etag-${revision}"`,
        modifiedAt: revision++
      };
      files.set(path, file);
      await json(route, { path, size: file.bytes.byteLength, modifiedAt: file.modifiedAt, etag: file.etag }, current ? 200 : 201, { ETag: file.etag });
      return;
    }
    if (request.method() === "DELETE") {
      if (!current || request.headers()["if-match"] !== current.etag) {
        return json(route, { error: { code: "workspace-precondition-failed", message: "changed" } }, 412);
      }
      files.delete(path);
      await route.fulfill({ status: 204 });
      return;
    }
    await json(route, { error: { message: "unsupported" } }, 405);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("treeitem", { name: /typst\.typ/ })).toBeVisible();
  await page.waitForTimeout(750);
  expect(workspaceRequests).toEqual([]);

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("region", { name: "Typr settings" });
  await expect(settings.getByRole("tab", { name: "Sync", exact: true })).toHaveCount(0);
  await settings.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Projects", exact: true }).first().click();
  const projectRow = page.locator(".project-manager__row--active");
  await projectRow.getByRole("button", { name: /Show options for/ }).click();
  const companion = projectRow.locator(".project-manager__connection").filter({
    hasText: "Companion workspace"
  });
  await expect(companion).toContainText("http://127.0.0.1:8484");
  await expect(companion).toContainText("e2e-workspace");
  const link = companion.getByRole("button", { name: "Link Companion workspace" });
  await expect(link).toBeEnabled();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain('Companion workspace "e2e-workspace"');
    expect(dialog.message()).toContain("http://127.0.0.1:8484");
    await dialog.accept();
  });
  await link.click();

  await expect(companion).toContainText(/Companion workspace "e2e-workspace" at http:\/\/127\.0\.0\.1:8484 synced \d+ files/);
  expect(files.size).toBeGreaterThan(0);
  const fileCountAfterLink = files.size;
  const requestsBeforeUnlink = workspaceRequests.length;
  await companion.getByRole("button", { name: "Unlink", exact: true }).click();
  await expect(companion.getByRole("button", { name: "Link Companion workspace" })).toBeVisible();
  expect(files.size).toBe(fileCountAfterLink);
  expect(workspaceRequests.length).toBe(requestsBeforeUnlink);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Files", exact: true }).first().click();
  await expect(page.getByRole("treeitem", { name: /typst\.typ/ })).toBeVisible();
});

async function json(
  route: Route,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body)
  });
}
