import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5174/";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /(diagram-lifecycle|firefox-latex-first-compile|git-panel|icon-button-layout|mobile-workspace|modal-controls-docs-icon|preview-zoom|settings-build-log)\.spec\.ts/,
  fullyParallel: true,
  reporter: [["line"]],
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  use: {
    baseURL,
    deviceScaleFactor: 1,
    headless: true,
    viewport: { width: 1440, height: 1000 }
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "TYPR_VITE_CACHE_DIR=/tmp/typr-vite-cache npm run dev -- --host 127.0.0.1 --port 5174",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL
      },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } }
  ]
});
