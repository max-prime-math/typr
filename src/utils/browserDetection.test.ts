import { describe, expect, it } from "vitest";
import { isFirefoxBrowser, isMobileBrowser, shouldUseLowMemoryCompilerMode } from "./browserDetection";

describe("browser detection", () => {
  it("detects desktop and iOS Firefox without matching Chromium", () => {
    expect(isFirefoxBrowser("Mozilla/5.0 Firefox/128.0")).toBe(true);
    expect(isFirefoxBrowser("Mozilla/5.0 FxiOS/128.0")).toBe(true);
    expect(isFirefoxBrowser("Mozilla/5.0 Chrome/128.0 Safari/537.36")).toBe(false);
  });

  it("detects Android, iPhone, and iPadOS desktop-style user agents", () => {
    expect(isMobileBrowser("Mozilla/5.0 (Linux; Android 15) Chrome/128.0 Mobile")).toBe(true);
    expect(isMobileBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Mobile/15E148")).toBe(true);
    expect(isMobileBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148")).toBe(true);
    expect(isMobileBrowser("Mozilla/5.0 (X11; Linux x86_64) Chrome/128.0")).toBe(false);
  });

  it("uses low-memory compiler mode for Firefox and mobile browsers", () => {
    expect(shouldUseLowMemoryCompilerMode("Mozilla/5.0 Firefox/128.0")).toBe(true);
    expect(shouldUseLowMemoryCompilerMode("Mozilla/5.0 (iPhone) Mobile/15E148 Safari/604.1")).toBe(true);
    expect(shouldUseLowMemoryCompilerMode("Mozilla/5.0 (X11; Linux x86_64) Chrome/128.0")).toBe(false);
  });
});
