import { describe, expect, it } from "vitest";
import { getVersionedServiceWorkerUrl } from "./registerServiceWorker";

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
