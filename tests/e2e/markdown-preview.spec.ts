import { expect, test } from "@playwright/test";

const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

test("Markdown preview renders and styles the supported GFM surface", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-typr-app-ready",
    "true",
    { timeout: 15_000 }
  );

  const longCell = "responsive-table-content-".repeat(12);
  const source = [
    "# GFM preview",
    "",
    "| Left | Center | Right |",
    "| :--- | :----: | ----: |",
    `| ${longCell} | **ready** | 12 |`,
    "",
    "- [x] shipped",
    "- [ ] pending",
    "",
    "~~removed~~ and www.example.com",
    "",
    "![Workspace pixel](pixel.png)"
  ].join("\n");

  await page.locator('input[type="file"][multiple]').setInputFiles([
    {
      name: "complete-markdown.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(source)
    },
    {
      name: "pixel.png",
      mimeType: "image/png",
      buffer: PIXEL_PNG
    }
  ]);

  const treeItem = page.getByRole("treeitem", { name: /complete-markdown\.md/ });
  await treeItem.dblclick();

  const preview = page.getByRole("article", {
    name: "complete-markdown.md preview"
  });
  const tableBlock = preview.locator(".preview-markdown__table-block");
  const table = tableBlock.locator("table");
  await expect(table).toBeVisible();
  await expect(table.locator("th")).toHaveText(["Left", "Center", "Right"]);
  await expect(table.locator("td").nth(1)).toContainText("ready");

  expect(
    await tableBlock.evaluate((element) => getComputedStyle(element).overflowX)
  ).toBe("auto");
  expect(
    await table.locator('th[align="center"]').evaluate(
      (element) => getComputedStyle(element).textAlign
    )
  ).toBe("center");
  expect(
    await table.locator('td[align="right"]').evaluate(
      (element) => getComputedStyle(element).textAlign
    )
  ).toBe("right");
  expect(
    await table.locator("th").first().evaluate(
      (element) => getComputedStyle(element).borderBottomStyle
    )
  ).toBe("solid");
  expect(
    await tableBlock.evaluate(
      (element) => element.scrollWidth > element.clientWidth
    )
  ).toBe(true);

  const taskItems = preview.locator('input[type="checkbox"]');
  await expect(taskItems).toHaveCount(2);
  await expect(taskItems.first()).toBeChecked();
  await expect(taskItems.last()).not.toBeChecked();
  await expect(preview.locator("del")).toHaveText("removed");
  await expect(preview.locator('a[href="http://www.example.com"]')).toBeVisible();

  const workspaceImage = preview.getByRole("img", { name: "Workspace pixel" });
  await expect(workspaceImage).toBeVisible();
  await expect
    .poll(() =>
      workspaceImage.evaluate((image) => ({
        naturalHeight: (image as HTMLImageElement).naturalHeight,
        naturalWidth: (image as HTMLImageElement).naturalWidth,
        src: (image as HTMLImageElement).src
      }))
    )
    .toMatchObject({
      naturalHeight: 1,
      naturalWidth: 1,
      src: expect.stringMatching(/^blob:/)
    });
});
