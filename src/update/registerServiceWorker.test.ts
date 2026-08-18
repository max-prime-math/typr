import { describe, expect, it } from "vitest";
import {
  getVersionedServiceWorkerUrl,
  shouldReloadAfterServiceWorkerUpdate
} from "./registerServiceWorker";

describe("getVersionedServiceWorkerUrl", () => {
  it("uses the current build as a cache-busting service worker query", () => {
    expect(getVersionedServiceWorkerUrl("https://typr.ca/", "4e52167")).toBe(
      "https://typr.ca/sw.js?build=4e52167"
    );
  });

  it("retains a deployed subdirectory when resolving the worker path", () => {
    expect(getVersionedServiceWorkerUrl("https://example.test/typr/", "abcdef0")).toBe(
      "https://example.test/typr/sw.js?build=abcdef0"
    );
  });
});

describe("shouldReloadAfterServiceWorkerUpdate", () => {
  it("reloads when the current page and controlling worker are from the same build", () => {
    expect(
      shouldReloadAfterServiceWorkerUpdate(
        "https://typr.ca/sw.js?build=4e52167",
        "4e52167"
      )
    ).toBe(true);
  });

  it("does not reload a page that already advanced beyond its controlling worker", () => {
    expect(
      shouldReloadAfterServiceWorkerUpdate(
        "https://typr.ca/sw.js?build=previous",
        "4e52167"
      )
    ).toBe(false);
  });

  it("falls back to reloading when the controller URL cannot identify its build", () => {
    expect(shouldReloadAfterServiceWorkerUpdate(null, "4e52167")).toBe(true);
    expect(shouldReloadAfterServiceWorkerUpdate("not a URL", "4e52167")).toBe(true);
  });
});
