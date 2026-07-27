import { expect, test, type Page } from "@playwright/test";

const PROJECT_NAME = "Empty project regression";

async function hasPersistedProject(page: Page): Promise<boolean> {
  return page.evaluate(async (projectName) => {
    return new Promise<boolean>((resolve, reject) => {
      const openRequest = indexedDB.open("typr");

      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => {
        const database = openRequest.result;
        const transaction = database.transaction("app", "readonly");
        const request = transaction.objectStore("app").get("project-storage");

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const storage = request.result as {
            projects?: Array<{ displayName?: string }>;
          } | undefined;
          resolve(
            storage?.projects?.some((project) => project.displayName === projectName) ?? false
          );
          database.close();
        };
      };
    });
  }, PROJECT_NAME);
}

test("creates and persists an empty local project without blanking the app", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Projects", exact: true }).first().click();

  page.once("dialog", async (dialog) => {
    await dialog.accept(PROJECT_NAME);
  });
  await page.getByRole("button", { name: "New local project", exact: true }).click();

  const projectRow = page.locator(".project-manager__row").filter({ hasText: PROJECT_NAME });
  await expect(projectRow).toBeVisible();
  await expect(projectRow).toContainText("0 files");
  const optionsButton = projectRow.getByRole("button", {
    name: `Show options for ${PROJECT_NAME}`,
    exact: true
  });
  await expect(optionsButton).toBeVisible();
  await optionsButton.click();
  await expect(
    projectRow.getByRole("button", {
      name: `Hide options for ${PROJECT_NAME}`,
      exact: true
    })
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    projectRow.getByRole("button", { name: "Open project", exact: true })
  ).toHaveCount(0);

  const otherProjectRow = page.locator(".project-manager__row").filter({
    hasNotText: PROJECT_NAME
  }).first();
  await otherProjectRow.getByRole("button", {
    name: /Open project /
  }).click();
  await projectRow.getByRole("button", {
    name: `Open project ${PROJECT_NAME}`,
    exact: true
  }).click();
  await expect(
    projectRow.locator(".project-manager__summary-badge--active")
  ).toHaveText("Open");
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect.poll(() => hasPersistedProject(page)).toBe(true);
  expect(pageErrors.join("\n")).not.toContain(
    "Cannot read properties of undefined (reading 'content')"
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  const newProjectButton = page.getByRole("button", {
    name: "New local project",
    exact: true
  });
  if (!(await newProjectButton.isVisible())) {
    await page.getByRole("button", { name: "Projects", exact: true }).first().click();
  }

  await expect(page.locator(".project-manager__row").filter({ hasText: PROJECT_NAME })).toBeVisible();
  await expect(page.locator(".app-shell")).toBeVisible();
  expect(pageErrors.join("\n")).not.toContain(
    "Cannot read properties of undefined (reading 'content')"
  );
});
