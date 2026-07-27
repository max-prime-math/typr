import { expect, test, type Page } from "@playwright/test";

const LAYOUT_CONTAINER_SELECTOR =
  ".app-shell, .workspace-shell, .workspace-main, .workspace";
const PANE_CONTAINER_SELECTOR = ".workspace > .pane";

async function getLayoutScrollOffsets(page: Page) {
  return page.locator(LAYOUT_CONTAINER_SELECTOR).evaluateAll((elements) =>
    elements.map((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop
    }))
  );
}

async function getPaneScrollOffsets(page: Page) {
  return page.locator(PANE_CONTAINER_SELECTOR).evaluateAll((elements) =>
    elements.map((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop
    }))
  );
}

test("Markdown cursor sync scrolls only the preview viewport", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  const source = Array.from(
    { length: 120 },
    (_, index) => `## Section ${index + 1}\n\nParagraph ${index + 1}.`
  ).join("\n\n");

  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "cursor-scroll.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(source)
  });

  const treeItem = page.getByRole("treeitem", { name: /cursor-scroll\.md/ });
  await treeItem.click();
  await treeItem.dblclick();
  await expect(
    page
      .getByRole("tablist", { name: "Open source files" })
      .getByRole("tab", { name: "cursor-scroll.md", exact: true })
  ).toHaveAttribute("aria-selected", "true");

  const workspace = page.locator(".workspace");
  const panes = page.locator(".workspace > .pane");
  const previewScroller = page.locator(".preview-document--markdown");
  const previewBlocks = page.locator(".preview-markdown__source-block");
  const editor = page.locator(".cm-content");
  await expect(previewScroller).toBeVisible();
  await editor.click({ position: { x: 100, y: 24 } });
  await page.keyboard.press("Control+Home");

  const paneTopsBefore = await panes.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top)
  );
  expect(paneTopsBefore).toHaveLength(3);
  expect(await getLayoutScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);
  expect(await getPaneScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);

  await page.keyboard.press("Control+End");

  await expect
    .poll(() => previewScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await workspace.evaluate((element) => element.scrollTop)).toBe(0);

  await previewBlocks.last().evaluate((element) => {
    element.scrollIntoView({ block: "center" });
  });

  expect(await getLayoutScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);
  expect(await getPaneScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);
  const paneTopsAfter = await panes.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top)
  );
  paneTopsAfter.forEach((top, index) => {
    expect(top).toBeCloseTo(paneTopsBefore[index], 1);
  });
});

test("file-tree and tab reveals stay inside their own scrollers", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  const files = Array.from({ length: 40 }, (_, index) => ({
    name: `scroll-audit-${String(index + 1).padStart(2, "0")}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(`# Scroll audit ${index + 1}`)
  }));
  await page.locator('input[type="file"][multiple]').setInputFiles(files);

  const panes = page.locator(".workspace > .pane");
  const paneTopsBefore = await panes.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top)
  );

  for (let index = 0; index < 12; index += 1) {
    const fileName = `scroll-audit-${String(index + 1).padStart(2, "0")}.md`;
    await page.getByRole("treeitem", { name: new RegExp(fileName) }).dblclick();
  }
  await page.getByRole("treeitem", { name: /scroll-audit-40\.md/ }).click();

  const fileScroller = page.locator(".sidebar-section--files");
  const sourceTabs = page.locator(".pane--editor .pane-tabs");
  await expect
    .poll(() => fileScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect
    .poll(() => sourceTabs.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(await getLayoutScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);
  expect(await getPaneScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);

  const paneTopsAfter = await panes.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top)
  );
  paneTopsAfter.forEach((top, index) => {
    expect(top).toBeCloseTo(paneTopsBefore[index], 1);
  });
});

test("plain-text cursor movement and terminal focus cannot move pane containers", async ({
  page
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  const source = Array.from(
    { length: 300 },
    (_, index) => `Plain text line ${index + 1}`
  ).join("\n");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "cursor-scroll.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(source)
  });
  await page.getByRole("treeitem", { name: /cursor-scroll\.txt/ }).dblclick();

  const editor = page.locator(".cm-content");
  const editorScroller = page.locator(".cm-scroller");
  await editor.click({ position: { x: 100, y: 24 } });
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+End");
  await expect
    .poll(() => editorScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await page.keyboard.press("Control+'");
  const terminalInput = page.getByRole("textbox", {
    name: "Terminal command input"
  });
  await expect(terminalInput).toBeFocused();
  expect(await getLayoutScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);
  expect(await getPaneScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);
});
