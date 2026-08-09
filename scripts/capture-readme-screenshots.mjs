import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDirectory = resolve(repositoryRoot, "screenshots");
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:5175/";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium";

await mkdir(screenshotDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: { width: 1440, height: 960 }
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".app-shell").waitFor();
  await page.getByLabel("markdown.md preview").waitFor();
  await page.screenshot({
    path: resolve(screenshotDirectory, "typr-markdown-workspace.png")
  });

  await page.getByText("typst.typ", { exact: true }).first().click();
  const compileButton = page.getByRole("button", { name: "Compile", exact: true });
  await compileButton.waitFor();
  await compileButton.click();
  await page.getByRole("img", { name: "Typst preview document" }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const preview = document.querySelector("img.preview-document__object");
    return preview instanceof HTMLImageElement && preview.complete && preview.naturalWidth > 0;
  }, undefined, { timeout: 60_000 });
  await page.screenshot({
    path: resolve(screenshotDirectory, "typr-typst-workspace.png")
  });
} finally {
  await browser.close();
}

console.log(`README screenshots written to ${screenshotDirectory}`);
