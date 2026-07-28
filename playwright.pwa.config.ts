import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4199/";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /(application-update|google-drive-callback-pwa|offline-first-compile)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  timeout: 120_000,
  expect: {
    timeout: 60_000
  },
  use: {
    baseURL,
    browserName: "chromium",
    deviceScaleFactor: 1,
    headless: true,
    launchOptions: chromiumExecutablePath
      ? { executablePath: chromiumExecutablePath }
      : undefined,
    serviceWorkers: "allow",
    viewport: { width: 1440, height: 1000 }
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 4199",
        reuseExistingServer: false,
        timeout: 120_000,
        url: baseURL
      },
  projects: [
    { name: "chromium" },
    {
      name: "chromium-mobile",
      use: {
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 }
      }
    }
  ]
});
