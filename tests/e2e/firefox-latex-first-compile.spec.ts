import { expect, test } from "@playwright/test";

test("first Firefox LaTeX compile preserves the page and open tabs", async ({
  browserName,
  page
}) => {
  test.skip(browserName !== "firefox", "This regression covers Firefox process restarts.");
  test.setTimeout(120_000);

  const pageErrors: string[] = [];
  const navigations: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navigations.push(frame.url());
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("treeitem", { name: /README\.md/ }).waitFor();
  await page.locator('input[type="file"][multiple]').setInputFiles([
    {
      name: "firefox-pinned.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Pinned before compile")
    },
    {
      name: "firefox-first.tex",
      mimeType: "text/x-tex",
      buffer: Buffer.from(
        [
          "\\documentclass{article}",
          "\\begin{document}",
          "Firefox first compile",
          "\\end{document}",
          ""
        ].join("\n")
      )
    }
  ]);

  const pinnedMarkdown = page.getByRole("treeitem", { name: /firefox-pinned\.md/ });
  await pinnedMarkdown.waitFor();
  await pinnedMarkdown.dblclick();
  await page.getByRole("treeitem", { name: /firefox-first\.tex/ }).dblclick();

  const sourceTabs = page
    .getByRole("tablist", { name: "Open source files" })
    .getByRole("tab");
  const sourceLabelsBefore = await sourceTabs.allTextContents();
  const compileButton = page.getByRole("button", { name: "Compile", exact: true });

  if (await compileButton.isEnabled()) {
    await compileButton.click();
  }

  const pdfCanvas = page
    .locator(".preview-document--pdf-canvas .pdf-page.canvas canvas")
    .first();
  await expect(pdfCanvas).toBeVisible({ timeout: 90_000 });
  await expect
    .poll(async () => Number(await pdfCanvas.getAttribute("data-pdf-raster-scale")))
    .toBeGreaterThan(2.5);

  const backingSizeBeforeZoom = await pdfCanvas.evaluate((canvas) => ({
    height: canvas.height,
    width: canvas.width
  }));
  const canvasBoxBeforeZoom = await pdfCanvas.boundingBox();
  expect(canvasBoxBeforeZoom).not.toBeNull();
  await pdfCanvas.dispatchEvent("wheel", {
    altKey: true,
    bubbles: true,
    cancelable: true,
    clientX: canvasBoxBeforeZoom!.x + canvasBoxBeforeZoom!.width / 2,
    clientY: canvasBoxBeforeZoom!.y + canvasBoxBeforeZoom!.height / 2,
    deltaY: -300
  });
  await expect
    .poll(async () => (await pdfCanvas.boundingBox())?.width ?? 0)
    .toBeGreaterThan(canvasBoxBeforeZoom!.width * 1.5);
  await page.waitForTimeout(400);
  expect(
    await pdfCanvas.evaluate((canvas) => ({
      height: canvas.height,
      width: canvas.width
    }))
  ).toEqual(backingSizeBeforeZoom);

  await expect(sourceTabs).toHaveText(sourceLabelsBefore);
  await expect(
    page.getByRole("tablist", { name: "Open previews" }).getByRole("tab", {
      name: "firefox-first.pdf"
    })
  ).toBeVisible();
  expect(navigations).toEqual([page.url()]);
  expect(pageErrors).toEqual([]);
});
