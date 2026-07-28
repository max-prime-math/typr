import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_DRIVE_PENDING_STORAGE_KEY,
  GOOGLE_DRIVE_RESULT_STORAGE_KEY,
  GOOGLE_DRIVE_SCOPE,
  beginGoogleDriveRedirectAuthorization,
  captureGoogleDriveOAuthCallback,
  clearGoogleDriveAuthorizationResult,
  createGoogleDriveAuthorizationUrl,
  isGoogleDriveAccessTokenFresh,
  parseGoogleDriveAuthorizationResponse,
  readGoogleDriveAuthorizationResult
} from "./googleDriveIdentity";

const NOW = Date.parse("2026-07-27T12:00:00.000Z");
const REDIRECT_PENDING = JSON.stringify({
  createdAt: Date.parse("2026-07-27T11:59:00.000Z"),
  intent: "connect",
  projectId: "project-1",
  redirectUri: "https://typr.ca/google-drive-oauth-callback.html",
  returnUri: "https://typr.ca/",
  state: "oauth-state",
  version: 2
});

describe("Google Drive redirect identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds an authorization URL with the exact dedicated callback and drive.file only", () => {
    const url = new URL(
      createGoogleDriveAuthorizationUrl({
        clientId: "client-id",
        intent: "connect",
        projectId: "project-1",
        redirectUri:
          "https://typr.ca/google-drive-oauth-callback.html",
        returnUri: "https://typr.ca/",
        state: "oauth-state"
      })
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://typr.ca/google-drive-oauth-callback.html"
    );
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_DRIVE_SCOPE);
    expect(url.searchParams.get("state")).toBe("oauth-state");
  });

  it("stores a reload-safe request before navigating to Google", async () => {
    const sessionStorage = memoryStorage();
    const localStorage = memoryStorage();
    const assign = vi.fn();
    const unregister = vi.fn(async () => true);
    vi.stubGlobal("crypto", { randomUUID: () => "oauth-state" });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({ unregister }))
      }
    });
    vi.stubGlobal("document", {
      baseURI: "https://typr.ca/"
    });
    vi.stubGlobal("window", {
      localStorage,
      location: { assign },
      sessionStorage
    });

    await beginGoogleDriveRedirectAuthorization(
      "client-id",
      "project-1",
      "change-location"
    );

    const pending = JSON.parse(
      sessionStorage.getItem(GOOGLE_DRIVE_PENDING_STORAGE_KEY) ?? ""
    );
    expect(pending).toMatchObject({
      intent: "change-location",
      projectId: "project-1",
      redirectUri:
        "https://typr.ca/google-drive-oauth-callback.html",
      returnUri: "https://typr.ca/",
      state: "oauth-state",
      version: 2
    });
    expect(
      localStorage.getItem(GOOGLE_DRIVE_PENDING_STORAGE_KEY)
    ).toBe(JSON.stringify(pending));
    expect(new URL(assign.mock.calls[0][0] as string).searchParams.get(
      "redirect_uri"
    )).toBe("https://typr.ca/google-drive-oauth-callback.html");
    expect(unregister).toHaveBeenCalledOnce();
    expect(unregister.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0]
    );
  });

  it("validates state, scope, lifetime, and expiry", () => {
    expect(
      parseGoogleDriveAuthorizationResponse(
        successfulResponse(),
        REDIRECT_PENDING,
        NOW
      )
    ).toEqual({
      error: null,
      intent: "connect",
      projectId: "project-1",
      token: {
        accessToken: "redirect-token",
        expiresAt: NOW + 3_600_000
      }
    });

    expect(
      parseGoogleDriveAuthorizationResponse(
        successfulResponse({ state: "wrong" }),
        REDIRECT_PENDING,
        NOW
      ).error
    ).toBe("Google authorization could not be verified. Try connecting again.");
    expect(
      parseGoogleDriveAuthorizationResponse(
        successfulResponse({ scope: "openid" }),
        REDIRECT_PENDING,
        NOW
      ).error
    ).toBe("Google Drive file access was not granted.");
    expect(
      parseGoogleDriveAuthorizationResponse(
        successfulResponse(),
        REDIRECT_PENDING,
        Date.parse("2026-07-27T12:15:01.000Z")
      ).error
    ).toBe("Google authorization took too long. Try connecting again.");

    const tamperedPending = JSON.stringify({
      ...JSON.parse(REDIRECT_PENDING),
      returnUri: "https://example.com/"
    });
    expect(
      parseGoogleDriveAuthorizationResponse(
        successfulResponse(),
        tamperedPending,
        NOW
      ).error
    ).toContain("without a matching Typr connection request");
  });

  it("captures the callback, clears pending state, and keeps the token through multiple startup reads", () => {
    const sessionStorage = memoryStorage([
      [GOOGLE_DRIVE_PENDING_STORAGE_KEY, REDIRECT_PENDING]
    ]);
    const localStorage = memoryStorage([
      [GOOGLE_DRIVE_PENDING_STORAGE_KEY, REDIRECT_PENDING]
    ]);
    vi.stubGlobal("document", { baseURI: "https://typr.ca/" });
    vi.stubGlobal("window", { localStorage, sessionStorage });

    const captured = captureGoogleDriveOAuthCallback({
      hash: `#${successfulResponse().toString()}`,
      localStorage,
      now: NOW,
      sessionStorage
    });

    expect(captured.returnUri).toBe("https://typr.ca/");
    expect(captured.result.token?.accessToken).toBe("redirect-token");
    expect(
      sessionStorage.getItem(GOOGLE_DRIVE_PENDING_STORAGE_KEY)
    ).toBeNull();
    expect(
      localStorage.getItem(GOOGLE_DRIVE_PENDING_STORAGE_KEY)
    ).toBeNull();
    expect(readGoogleDriveAuthorizationResult(NOW + 1_000)).toMatchObject({
      projectId: "project-1",
      token: { accessToken: "redirect-token" }
    });
    expect(readGoogleDriveAuthorizationResult(NOW + 2_000)).toMatchObject({
      projectId: "project-1",
      token: { accessToken: "redirect-token" }
    });

    clearGoogleDriveAuthorizationResult();
    expect(
      sessionStorage.getItem(GOOGLE_DRIVE_RESULT_STORAGE_KEY)
    ).toBeNull();
    expect(readGoogleDriveAuthorizationResult(NOW + 3_000)).toBeNull();
  });

  it("stores a visible authorization error without retaining a token", () => {
    const sessionStorage = memoryStorage([
      [GOOGLE_DRIVE_PENDING_STORAGE_KEY, REDIRECT_PENDING]
    ]);
    const localStorage = memoryStorage();
    vi.stubGlobal("document", { baseURI: "https://typr.ca/" });
    vi.stubGlobal("window", { localStorage, sessionStorage });

    const captured = captureGoogleDriveOAuthCallback({
      hash:
        "#error=access_denied&error_description=The+user+declined&state=oauth-state",
      localStorage,
      now: NOW,
      sessionStorage
    });

    expect(captured.result).toMatchObject({
      error: "The user declined",
      projectId: "project-1",
      token: null
    });
  });

  it("treats tokens with no more than one minute remaining as expired", () => {
    expect(
      isGoogleDriveAccessTokenFresh(
        { accessToken: "token", expiresAt: NOW + 60_001 },
        NOW
      )
    ).toBe(true);
    expect(
      isGoogleDriveAccessTokenFresh(
        { accessToken: "token", expiresAt: NOW + 60_000 },
        NOW
      )
    ).toBe(false);
  });
});

function successfulResponse(
  overrides: Record<string, string> = {}
): URLSearchParams {
  return new URLSearchParams({
    access_token: "redirect-token",
    expires_in: "3600",
    scope: GOOGLE_DRIVE_SCOPE,
    state: "oauth-state",
    token_type: "Bearer",
    ...overrides
  });
}

function memoryStorage(
  entries: Array<[string, string]> = []
): Storage {
  const values = new Map(entries);
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}
