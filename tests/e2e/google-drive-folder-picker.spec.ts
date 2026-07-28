import { expect, test } from "@playwright/test";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

test("completes the reload-safe Picker flow inside a managed child folder", async ({
  page
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const driveRequests: Array<{
    method: string;
    postData: string | null;
    url: string;
  }> = [];
  let createdEntryCount = 0;

  await page.route("https://apis.google.com/js/api.js", async (route) => {
    await route.fulfill({
      body: googlePickerMockScript(),
      contentType: "application/javascript",
      status: 200
    });
  });
  await page.route("https://www.googleapis.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    driveRequests.push({
      method: request.method(),
      postData: request.postData(),
      url: url.href
    });
    const headers = {
      "access-control-allow-origin": "*",
      "content-type": "application/json"
    };

    if (
      request.method() === "GET" &&
      url.pathname.endsWith("/drive/v3/files/parent-picked")
    ) {
      await route.fulfill({
        body: JSON.stringify({
          id: "parent-picked",
          name: "Course work",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["root"],
          trashed: false,
          webViewLink:
            "https://drive.google.com/drive/folders/parent-picked"
        }),
        headers,
        status: 200
      });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === "/drive/v3/files"
    ) {
      await route.fulfill({
        body: JSON.stringify({ files: [] }),
        headers,
        status: 200
      });
      return;
    }

    if (
      request.method() === "POST" &&
      url.pathname === "/drive/v3/files"
    ) {
      const metadata = request.postDataJSON() as {
        appProperties?: Record<string, string>;
        mimeType: string;
        name: string;
        parents?: string[];
      };
      const managed =
        metadata.appProperties?.typrKind === "project";
      const id = managed
        ? "managed-project-folder"
        : `created-entry-${++createdEntryCount}`;
      await route.fulfill({
        body: JSON.stringify({
          ...metadata,
          id,
          trashed: false,
          webViewLink: managed
            ? "https://drive.google.com/drive/folders/managed-project-folder"
            : undefined
        }),
        headers,
        status: 200
      });
      return;
    }

    if (
      request.method() === "POST" &&
      url.pathname.includes("/upload/drive/v3/files")
    ) {
      await route.fulfill({
        body: JSON.stringify({
          id: `uploaded-entry-${++createdEntryCount}`,
          name: "project-file",
          mimeType: "application/octet-stream",
          parents: ["managed-project-folder"],
          trashed: false
        }),
        headers,
        status: 200
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({}),
      headers,
      status: 200
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const project = await page.evaluate(async () => {
    return new Promise<{ id: string; name: string }>((resolve, reject) => {
      const openRequest = indexedDB.open("typr");
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction("app", "readonly");
        const request = transaction.objectStore("app").get("project-storage");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const storage = request.result as {
            projects: Array<{ displayName: string; id: string }>;
            selectedProjectId: string;
          };
          const selected =
            storage.projects.find(
              (entry) => entry.id === storage.selectedProjectId
            ) ?? storage.projects[0];
          database.close();
          resolve({ id: selected.id, name: selected.displayName });
        };
      };
    });
  });

  await page.evaluate(
    ({ projectId }) => {
      const pending = JSON.stringify({
        createdAt: Date.now(),
        intent: "connect",
        projectId,
        redirectUri: `${location.origin}/google-drive-oauth-callback.html`,
        returnUri: `${location.origin}/`,
        state: "browser-oauth-state",
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
    },
    { projectId: project.id }
  );

  await page.goto(
    `/google-drive-oauth-callback.html#access_token=mock-token&expires_in=3600&scope=${encodeURIComponent(
      DRIVE_SCOPE
    )}&state=browser-oauth-state`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(
    page.getByText("Google authorization complete", { exact: true })
  ).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Google authorization complete", { exact: true })
  ).toBeVisible();

  const mobileFilesTab = page.getByRole("tab", {
    name: "Files",
    exact: true
  });
  if (await mobileFilesTab.isVisible()) {
    await mobileFilesTab.click();
  }
  await page
    .getByRole("button", { name: "Projects", exact: true })
    .first()
    .click();
  const projectRow = page
    .locator(".project-manager__row")
    .filter({ hasText: project.name });
  const optionsButton = projectRow.getByRole("button", {
    name: `Show options for ${project.name}`,
    exact: true
  });
  if (await optionsButton.isVisible()) {
    await optionsButton.click();
  }
  const driveCard = projectRow.locator(".google-drive-card");
  await expect(
    driveCard.getByRole("button", {
      name: "Choose Drive location",
      exact: true
    })
  ).toBeVisible();
  await driveCard
    .getByRole("button", {
      name: "Choose Drive location",
      exact: true
    })
    .click();

  await expect(driveCard).toContainText("Course work");
  await expect(driveCard).toContainText(project.name);
  await expect(driveCard).toContainText("Connected");
  await expect(
    driveCard.getByRole("link", {
      name: "Open in Google Drive",
      exact: true
    })
  ).toHaveAttribute(
    "href",
    "https://drive.google.com/drive/folders/managed-project-folder"
  );
  await expect(
    page.getByText("Google Drive connected", { exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("typr.google-drive.oauth-result.v2")
    )
  ).toBeNull();

  const managedFolderCreate = driveRequests.find(
    (entry) =>
      entry.method === "POST" &&
      entry.postData?.includes('"typrKind":"project"')
  );
  expect(managedFolderCreate?.postData).toContain(
    '"parents":["parent-picked"]'
  );
  expect(managedFolderCreate?.postData).toContain(
    '"typrProjectId"'
  );
  expect(managedFolderCreate?.postData).toContain('"typrSchema":"2"');

  const driveRequestCountBeforeUnlink = driveRequests.length;
  await driveCard
    .getByRole("button", { name: "Unlink", exact: true })
    .click();
  await expect(driveCard).toContainText("Not connected");
  expect(driveRequests).toHaveLength(driveRequestCountBeforeUnlink);
});

function googlePickerMockScript(): string {
  return `
    window.gapi = {
      load: function (_library, options) {
        class DocsView {
          setIncludeFolders() { return this; }
          setSelectFolderEnabled() { return this; }
          setMimeTypes() { return this; }
          setMode() { return this; }
        }
        class PickerBuilder {
          addView() { return this; }
          setOAuthToken() { return this; }
          setDeveloperKey() { return this; }
          setAppId() { return this; }
          setOrigin() { return this; }
          setCallback(callback) { this.callback = callback; return this; }
          build() {
            const callback = this.callback;
            return {
              setVisible: function (visible) {
                if (visible) {
                  setTimeout(function () {
                    callback({
                      action: "picked",
                      documents: [{
                        id: "parent-picked",
                        name: "Course work",
                        mimeType: "application/vnd.google-apps.folder",
                        url: "https://drive.google.com/drive/folders/parent-picked"
                      }]
                    });
                  }, 0);
                }
              }
            };
          }
        }
        window.google = {
          picker: {
            Action: { CANCEL: "cancel", PICKED: "picked" },
            DocsView: DocsView,
            DocsViewMode: { LIST: "list" },
            Document: {
              ID: "id",
              MIME_TYPE: "mimeType",
              NAME: "name",
              URL: "url"
            },
            PickerBuilder: PickerBuilder,
            Response: { ACTION: "action", DOCUMENTS: "documents" },
            ViewId: { DOCS: "docs" }
          }
        };
        options.callback();
      }
    };
  `;
}
