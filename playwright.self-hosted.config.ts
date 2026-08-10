import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
if (!baseURL) throw new Error("PLAYWRIGHT_BASE_URL is required; use npm run test:e2e:self-hosted to start a tested container.");
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const firefoxExecutablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /self-hosted\.spec\.ts/,
  reporter: [["line"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    deviceScaleFactor: 1,
    headless: true,
    viewport: { width: 1440, height: 1000 }
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {})
      }
    },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
        ...(firefoxExecutablePath ? { launchOptions: { executablePath: firefoxExecutablePath } } : {})
      }
    }
  ]
});
