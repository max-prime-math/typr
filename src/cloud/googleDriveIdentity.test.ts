import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestGoogleDriveAccessToken,
  type GoogleDriveAccessTokenRequestOptions
} from "./googleDriveIdentity";

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
}

interface TokenClientConfig {
  callback: (response: TokenResponse) => void;
  client_id: string;
  error_callback?: (error: { type?: string; message?: string }) => void;
  scope: string;
}

function createGoogleIdentityHarness() {
  let config: TokenClientConfig | null = null;
  let documentHasFocus = true;
  let visibilityState: DocumentVisibilityState = "visible";
  const documentTarget = new EventTarget();
  const windowTarget = new EventTarget();
  const requestAccessToken = vi.fn();
  const initTokenClient = vi.fn((nextConfig: TokenClientConfig) => {
    config = nextConfig;
    return { requestAccessToken };
  });
  vi.stubGlobal("document", {
    addEventListener: documentTarget.addEventListener.bind(documentTarget),
    hasFocus() {
      return documentHasFocus;
    },
    get visibilityState() {
      return visibilityState;
    },
    removeEventListener:
      documentTarget.removeEventListener.bind(documentTarget)
  });
  vi.stubGlobal("window", {
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    clearTimeout,
    google: {
      accounts: {
        oauth2: {
          initTokenClient,
          revoke: vi.fn()
        }
      }
    },
    location: {
      origin: "https://typr.test"
    },
    removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    clearInterval,
    setInterval,
    setTimeout
  });

  return {
    documentTarget,
    getConfig() {
      if (!config) {
        throw new Error("Google token client was not initialized.");
      }
      return config;
    },
    initTokenClient,
    requestAccessToken,
    setDocumentFocus(hasFocus: boolean) {
      documentHasFocus = hasFocus;
    },
    setVisibility(nextVisibilityState: DocumentVisibilityState) {
      visibilityState = nextVisibilityState;
      documentTarget.dispatchEvent(new Event("visibilitychange"));
    },
    windowTarget
  };
}

async function startRequest(
  options?: GoogleDriveAccessTokenRequestOptions
) {
  const harness = createGoogleIdentityHarness();
  const request = requestGoogleDriveAccessToken("client-id", options);
  await Promise.resolve();
  return { harness, request };
}

describe("Google Drive identity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests consent when establishing a new token session", async () => {
    const { harness, request } = await startRequest();

    expect(harness.requestAccessToken).toHaveBeenCalledWith({
      prompt: "consent"
    });
    harness.getConfig().callback({
      access_token: "access-token",
      expires_in: 3600
    });

    await expect(request).resolves.toEqual({
      accessToken: "access-token",
      expiresAt: Date.now() + 3_600_000
    });
  });

  it("can skip repeated consent when renewing an existing session", async () => {
    const { harness, request } = await startRequest({ prompt: "" });

    expect(harness.requestAccessToken).toHaveBeenCalledWith({ prompt: "" });
    harness.getConfig().callback({
      access_token: "renewed-token",
      expires_in: 60
    });

    await expect(request).resolves.toMatchObject({
      accessToken: "renewed-token"
    });
  });

  it("surfaces popup failures with a retryable message", async () => {
    const { harness, request } = await startRequest();

    harness.getConfig().error_callback?.({
      type: "popup_failed_to_open"
    });

    await expect(request).rejects.toThrow(
      "Allow popups and try again."
    );
  });

  it("times out when Google never invokes either callback", async () => {
    const { request } = await startRequest({ timeoutMs: 1_000 });
    const rejection = expect(request).rejects.toThrow(
      "Google authorization did not return to Typr."
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
  });

  it("reports lifecycle diagnostics when the popup closes without a callback", async () => {
    const { harness, request } = await startRequest();
    const rejection = expect(request).rejects.toThrow(
      /origin=https:\/\/typr\.test; window-blurred=yes; document-hidden=no; window-refocused=yes; document-visible=no; focus-poll-left=no; focus-poll-returned=no; google-messages=1/
    );

    harness.windowTarget.dispatchEvent(new Event("blur"));
    const googleMessage = new Event("message");
    Object.defineProperty(googleMessage, "origin", {
      value: "https://accounts.google.com"
    });
    harness.windowTarget.dispatchEvent(googleMessage);
    harness.windowTarget.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
  });

  it("detects popup return by polling focus when browsers omit focus events", async () => {
    const { harness, request } = await startRequest();
    const rejection = expect(request).rejects.toThrow(
      /focus-poll-left=yes; focus-poll-returned=yes/
    );

    harness.setDocumentFocus(false);
    await vi.advanceTimersByTimeAsync(250);
    harness.setDocumentFocus(true);
    await vi.advanceTimersByTimeAsync(5_250);

    await rejection;
  });

  it("waits for the callback grace period after returning from a hidden tab", async () => {
    const { harness, request } = await startRequest();

    harness.setVisibility("hidden");
    harness.setVisibility("visible");
    await vi.advanceTimersByTimeAsync(4_999);
    harness.getConfig().callback({
      access_token: "returned-token",
      expires_in: 60
    });

    await expect(request).resolves.toMatchObject({
      accessToken: "returned-token"
    });
  });
});
