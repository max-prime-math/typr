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
  const requestAccessToken = vi.fn();
  const initTokenClient = vi.fn((nextConfig: TokenClientConfig) => {
    config = nextConfig;
    return { requestAccessToken };
  });
  vi.stubGlobal("window", {
    clearTimeout,
    google: {
      accounts: {
        oauth2: {
          initTokenClient,
          revoke: vi.fn()
        }
      }
    },
    setTimeout
  });

  return {
    getConfig() {
      if (!config) {
        throw new Error("Google token client was not initialized.");
      }
      return config;
    },
    initTokenClient,
    requestAccessToken
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
});
