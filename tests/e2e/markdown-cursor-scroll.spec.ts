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

async function getDocumentScrollOffset(page: Page) {
  return page.evaluate(() => ({
    bodyLeft: document.body.scrollLeft,
    bodyTop: document.body.scrollTop,
    documentLeft: document.documentElement.scrollLeft,
    documentTop: document.documentElement.scrollTop,
    windowX: window.scrollX,
    windowY: window.scrollY
  }));
}

test("typing scrolls only the editor viewport, never the document", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  const editor = page.locator(".cm-content").first();
  const editorScroller = page.locator(".cm-scroller").first();
  await editor.click();
  await page.keyboard.press("Control+End");

  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.insertText(`\nTyping line ${index + 1}`);
  }

  await expect.poll(() => editorScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await getDocumentScrollOffset(page)).toEqual({
    bodyLeft: 0,
    bodyTop: 0,
    documentLeft: 0,
    documentTop: 0,
    windowX: 0,
    windowY: 0
  });
  expect(await getLayoutScrollOffsets(page)).toEqual([
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 },
    { left: 0, top: 0 }
  ]);
});

test("toggling line wrap preserves highlighting and the active line position", async ({
  page
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  const source = Array.from({ length: 80 }, (_, index) =>
    index === 44
      ? "#let focused = 45"
      : `#let long_value_${index + 1} = "${"word ".repeat(100)}"`
  ).join("\n");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "line-wrap-scroll.typ",
    mimeType: "application/x-typst",
    buffer: Buffer.from(source)
  });
  await page.getByRole("treeitem", { name: /line-wrap-scroll\.typ/ }).dblclick();

  const editor = page.locator(".cm-content");
  await editor.click({ position: { x: 100, y: 24 } });
  await page.keyboard.press("Control+Alt+g");
  const lineInput = page.getByRole("textbox", { name: "Go to line" });
  await lineInput.fill("45");
  await lineInput.press("Enter");

  const activeLine = page.locator(".cm-line", { hasText: "#let focused = 45" });
  await expect(activeLine).toHaveText("#let focused = 45");
  await expect(activeLine.locator("span").first()).toBeVisible();
  await expect
    .poll(() => activeLine.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(900);
  const editorView = page.locator(".cm-editor");
  const editorScroller = page.locator(".cm-scroller");
  const visibleLinesAreHighlighted = () =>
    editorScroller.evaluate((scroller) => {
      const viewport = scroller.getBoundingClientRect();
      const visibleLines = [...scroller.querySelectorAll(".cm-line")].filter((line) => {
        const lineRect = line.getBoundingClientRect();
        return lineRect.bottom > viewport.top && lineRect.top < viewport.bottom;
      });
      return visibleLines.length > 0 && visibleLines.every((line) => line.querySelector("span"));
    });
  await editorView.evaluate((element) => {
    element.setAttribute("data-wrap-test-editor", "original");
  });
  const initialTop = await activeLine.evaluate(
    (element) => element.getBoundingClientRect().top
  );

  await page.keyboard.press("Alt+w");
  expect(await editorView.getAttribute("data-wrap-test-editor")).toBe("original");
  await expect.poll(visibleLinesAreHighlighted).toBe(true);
  await expect(activeLine).toHaveText("#let focused = 45");
  expect(await activeLine.locator("span").count()).toBeGreaterThan(0);
  await expect(activeLine.locator("span").first()).toBeVisible();
  await expect
    .poll(() => activeLine.evaluate((element) => element.getBoundingClientRect().top))
    .toBeCloseTo(initialTop, 0);

  const unwrappedTop = await activeLine.evaluate(
    (element) => element.getBoundingClientRect().top
  );
  await page.keyboard.press("Alt+w");
  expect(await editorView.getAttribute("data-wrap-test-editor")).toBe("original");
  await expect.poll(visibleLinesAreHighlighted).toBe(true);
  await expect(activeLine).toHaveText("#let focused = 45");
  expect(await activeLine.locator("span").count()).toBeGreaterThan(0);
  await expect(activeLine.locator("span").first()).toBeVisible();
  await expect
    .poll(() => activeLine.evaluate((element) => element.getBoundingClientRect().top))
    .toBeCloseTo(unwrappedTop, 0);
});

test("wrapped continuation rows preserve the source line indentation", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("region", { name: "Typr settings" });
  await settings.getByRole("tab", { name: "Editor", exact: true }).click();
  await settings.getByRole("checkbox", { name: /^Line wrap/ }).check();
  await settings.getByRole("button", { name: "Close", exact: true }).click();

  const source = `    ${"alpha beta gamma delta ".repeat(40)}`;
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "wrapped-indent.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(source)
  });
  await page.getByRole("treeitem", { name: /wrapped-indent\.txt/ }).dblclick();

  const line = page.locator(".cm-line", { hasText: "alpha beta gamma delta" });
  await expect(line).toHaveClass(/cm-wrapped-line-indent/);

  const rowStarts = await line.evaluate((element) => {
    const starts: Array<{ left: number; top: number }> = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      for (let offset = 0; offset < node.data.length; offset += 1) {
        if (/\s/.test(node.data[offset] ?? "")) continue;

        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        const rect = range.getBoundingClientRect();
        if (!starts.some((start) => Math.abs(start.top - rect.top) < 1)) {
          starts.push({ left: rect.left, top: rect.top });
        }
      }
    }

    return starts.sort((left, right) => left.top - right.top);
  });

  expect(rowStarts.length).toBeGreaterThan(1);
  for (const row of rowStarts.slice(1)) {
    expect(row.left).toBeCloseTo(rowStarts[0].left, 0);
  }
});

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

test("source and Markdown preview scroll positions survive a reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  const source = Array.from(
    { length: 240 },
    (_, index) => `## Persistent section ${index + 1}\n\nPersistent paragraph ${index + 1}.`
  ).join("\n\n");

  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(source);
  const editorScroller = page.locator(".cm-scroller");
  const previewScroller = page.locator(".preview-document--markdown");
  await expect(previewScroller).toBeVisible();
  await expect(page.locator(".preview-markdown")).toContainText("Persistent section 240");
  await editorScroller.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
    element.scrollTop = Math.min(1300, element.scrollHeight - element.clientHeight);
  });
  await previewScroller.evaluate((element) => {
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
    element.scrollTop = Math.min(1700, element.scrollHeight - element.clientHeight);
  });

  const beforeReload = {
    editor: await editorScroller.evaluate((element) => element.scrollTop),
    preview: await previewScroller.evaluate((element) => element.scrollTop)
  };
  expect(beforeReload.editor).toBeGreaterThan(500);
  expect(beforeReload.preview).toBeGreaterThan(500);
  await page.waitForTimeout(180);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );
  await expect(page.locator(".preview-document--markdown")).toBeVisible();

  await expect.poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(beforeReload.editor - 30);
  await expect.poll(() => page.locator(".preview-document--markdown").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(beforeReload.preview - 30);
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

test("smooth Vim cursor stays aligned with its document position while scrolling", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("region", { name: "Typr settings" });
  await settings.getByRole("tab", { name: "Themes", exact: true }).click();
  await settings.getByRole("checkbox", { name: /Smear Cursor/ }).check();
  await settings.getByRole("tab", { name: "Editor", exact: true }).click();
  await settings.getByRole("checkbox", { name: /^Vim mode\b/ }).check();
  await settings.getByRole("button", { name: "Close", exact: true }).click();

  const source = Array.from(
    { length: 200 },
    (_, index) => `Line ${index + 1}: smooth cursor scrolling regression coverage.`
  ).join("\n");

  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "smooth-cursor-scroll.typ",
    mimeType: "text/plain",
    buffer: Buffer.from(source)
  });

  const treeItem = page.getByRole("treeitem", { name: /smooth-cursor-scroll\.typ/ });
  await treeItem.click();
  await treeItem.dblclick();

  const editor = page.locator(".cm-content");
  await editor.click({ position: { x: 180, y: 300 } });
  await page.keyboard.press("Escape");

  const smoothCursor = page.locator(".cm-smooth-cursor");
  await expect(smoothCursor).toHaveClass(/cm-smooth-cursor--visible/);
  await page.waitForTimeout(400);
  const cursorBefore = await smoothCursor.boundingBox();
  expect(cursorBefore).not.toBeNull();

  const scroller = page.locator(".cm-scroller");
  const scrollDelta = 48;
  await scroller.evaluate((element, delta) => {
    element.scrollTop += delta;
  }, scrollDelta);

  await expect.poll(async () => (await smoothCursor.boundingBox())?.y ?? Number.NaN)
    .toBeLessThan(cursorBefore!.y - 30);
  const cursorAfter = await smoothCursor.boundingBox();
  expect(cursorAfter).not.toBeNull();
  expect(cursorAfter!.y).toBeCloseTo(cursorBefore!.y - scrollDelta, 0);

  const cursorHeightBeforeCommand = cursorAfter!.height;
  await page.keyboard.press(":");
  await expect(page.locator(".cm-vim-panel input")).toBeFocused();
  await expect(smoothCursor).toBeVisible();
  await expect(smoothCursor).toHaveCSS("opacity", "1");
  await expect(smoothCursor).toHaveClass(/cm-smooth-cursor--vim-command/);
  await expect(smoothCursor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(smoothCursor).toHaveCSS("border-color", "rgb(255, 150, 150)");
  await expect.poll(async () => (await smoothCursor.boundingBox())?.height ?? 0)
    .toBeCloseTo(cursorHeightBeforeCommand, 0);
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await expect(smoothCursor).not.toHaveClass(/cm-smooth-cursor--vim-command/);
  await expect.poll(async () => (await smoothCursor.boundingBox())?.height ?? 0)
    .toBeCloseTo(cursorHeightBeforeCommand, 0);
});

test("Vim block cursor remains full-height in normal mode", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("region", { name: "Typr settings" });
  await settings.getByRole("tab", { name: "Editor", exact: true }).click();
  await settings.getByRole("checkbox", { name: /^Vim mode/ }).check();
  await settings.getByRole("button", { name: "Close", exact: true }).click();

  const editor = page.locator(".cm-content");
  await editor.click({ position: { x: 120, y: 80 } });
  await expect(editor).toBeFocused();
  await page.keyboard.press("Escape");

  const blockCursor = page.locator(".cm-vimCursorLayer .cm-fat-cursor").first();
  await expect(blockCursor).toBeAttached();
  const normalHeight = await blockCursor.evaluate(
    (element) => element.getBoundingClientRect().height
  );
  expect(normalHeight).toBeGreaterThan(0);

  await page.keyboard.press("d");
  await expect.poll(async () => (await blockCursor.boundingBox())?.height ?? 0)
    .toBeCloseTo(normalHeight, 0);

  await page.keyboard.press("Escape");
  await expect.poll(async () => (await blockCursor.boundingBox())?.height ?? 0)
    .toBeCloseTo(normalHeight, 0);
});

test("Vim visual selections cycle through inline and display math delimiters", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  const settings = page.getByRole("region", { name: "Typr settings" });
  await settings.getByRole("tab", { name: "Editor", exact: true }).click();
  await settings.getByRole("checkbox", { name: /^Vim mode/ }).check();
  await settings.getByRole("button", { name: "Close", exact: true }).click();

  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "vim-math-selection.typ",
    mimeType: "text/plain",
    buffer: Buffer.from("alpha beta")
  });

  const treeItem = page.getByRole("treeitem", { name: /vim-math-selection\.typ/ });
  await treeItem.click();
  await treeItem.dblclick();

  const editor = page.locator(".cm-content");
  const line = page.locator(".cm-line").first();
  await editor.click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("0");
  await page.keyboard.press("v");
  await page.keyboard.press("4");
  await page.keyboard.press("l");
  await expect(page.locator(".cm-selectionBackground")).toHaveCount(1);

  await page.keyboard.press("$");
  await expect(line).toHaveText("$alpha$ beta");

  await page.keyboard.press("$");
  await expect(line).toHaveText("$$alpha$$ beta");

  await page.keyboard.press("$");
  await expect(line).toHaveText("alpha beta");
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
