import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5174/";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const firefoxExecutablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /(cetz-conversion|companion-workspace|diagram-lifecycle|firefox-latex-first-compile|git-panel|google-drive-folder-picker|icon-button-layout|markdown-cursor-scroll|markdown-preview|mobile-workspace|modal-controls-docs-icon|preview-zoom|project-creation|settings-build-log)\.spec\.ts/,
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
        command: "TYPR_VITE_CACHE_DIR=/tmp/typr-vite-cache VITE_GOOGLE_DRIVE_CLIENT_ID=test-client.apps.googleusercontent.com VITE_GOOGLE_PICKER_API_KEY=test-picker-key VITE_GOOGLE_CLOUD_PROJECT_NUMBER=320318238451 npm run dev -- --host 127.0.0.1 --port 5174",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: baseURL
      },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(chromiumExecutablePath
          ? { launchOptions: { executablePath: chromiumExecutablePath } }
          : {})
      }
    },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        ...(firefoxExecutablePath
          ? { launchOptions: { executablePath: firefoxExecutablePath } }
          : {})
      }
    }
  ]
});
