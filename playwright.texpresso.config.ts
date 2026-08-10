import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:5177/";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /texpresso-live-preview\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    browserName: "chromium",
    deviceScaleFactor: 1,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    viewport: { width: 1440, height: 1000 }
  },
  webServer: {
    command: "VITE_TYPR_COMPANION_URL=http://127.0.0.1:18484 npm run dev -- --host 127.0.0.1 --port 5177",
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL
  },
  projects: [{ name: "chromium" }]
});
