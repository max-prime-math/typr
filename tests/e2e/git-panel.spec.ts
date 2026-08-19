import { expect, test } from "@playwright/test";

test("Git panel initializes and completes local stage/commit transitions", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n// Git panel smoke change");

  const gitButton = page.getByRole("button", { name: "Git", exact: true }).first();
  await expect(gitButton).toBeVisible();
  await gitButton.click();

  const panel = page.locator(".sidebar-section--sync");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add repo" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Remove repo" })).toBeEnabled();
  await expect(panel.getByRole("button", { name: "Pull", exact: true })).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Push", exact: true })).toBeDisabled();
  await expect(panel.getByText("Working tree", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Stage", exact: true }).first()).toBeVisible();

  await panel.getByRole("button", { name: "Stage all", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Unstage", exact: true }).first()).toBeVisible();

  const commitMessage = panel.getByLabel("Commit message", { exact: true });
  await commitMessage.fill("QA Git panel smoke");
  const commitButton = panel.getByRole("button", { name: "Commit", exact: true });
  await expect(commitButton).toBeEnabled();
  await commitButton.click();

  await expect(panel.getByText("QA Git panel smoke", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/1 stored/)).toBeVisible();

  await panel.getByRole("button", { name: "Add repo" }).click();
  await expect(panel.getByRole("button", { name: "Remove repo" })).toBeEnabled();
  await panel.getByRole("button", { name: "Remove repo" }).click();
  await expect(panel.getByRole("button", { name: "Remove repo" })).toBeEnabled();

  expect(pageErrors).toEqual([]);
});

test("expanded Git Workspace stages and commits through the shared controller", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n// Expanded Git Workspace smoke change");

  await page.getByRole("button", { name: "Git", exact: true }).first().click();
  const compactPanel = page.locator(".sidebar-section--sync");
  await compactPanel.getByRole("button", { name: "Open Git Workspace" }).click();

  const workspace = page.getByRole("region", { name: "Git Workspace" });
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("heading", { name: "Unstaged" })).toBeVisible();
  await expect(workspace.getByRole("heading", { name: "Staged", exact: true })).toBeVisible();
  await expect(workspace.getByText("main", { exact: true }).first()).toBeVisible();

  const stageButton = workspace.getByRole("button", { name: /^Stage / }).first();
  await expect(stageButton).toBeVisible();
  await stageButton.click();
  await expect(workspace.getByRole("button", { name: /^Unstage / }).first()).toBeVisible();

  await workspace.getByLabel("Commit message", { exact: true }).fill("QA expanded Git Workspace");
  const commitButton = workspace.getByRole("button", { name: /^Commit/ });
  await expect(commitButton).toBeEnabled();
  await commitButton.click();

  await expect(workspace.getByText("QA expanded Git Workspace", { exact: true }).first()).toBeVisible();
  await expect(workspace.getByText("Working tree is clean.", { exact: true })).toBeVisible();

  await workspace.getByRole("button", { name: "Close", exact: true }).click();
  await expect(compactPanel.getByRole("button", { name: "Open Git Workspace" })).toBeVisible();
  await expect(compactPanel.getByText("QA expanded Git Workspace", { exact: true }).first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});
