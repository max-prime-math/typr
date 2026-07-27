import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginGoogleDriveRedirectAuthorization,
  captureGoogleDriveRedirectResult,
  isGoogleDriveAccessTokenFresh,
  parseGoogleDriveRedirectResponse
} from "./googleDriveIdentity";

const NOW = Date.parse("2026-07-27T12:00:00.000Z");
const REDIRECT_PENDING = JSON.stringify({
  createdAt: Date.parse("2026-07-27T11:59:00.000Z"),
  projectId: "project-1",
  redirectUri: "https://typr.ca/",
  state: "oauth-state",
  version: 1
});
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

describe("Google Drive redirect identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("unregisters the app worker before starting an exact root redirect", async () => {
    const assign = vi.fn();
    const setItem = vi.fn();
    const unregister = vi.fn(async () => true);
    vi.stubGlobal("crypto", {
      randomUUID: () => "oauth-state"
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({ unregister }))
      }
    });
    vi.stubGlobal("window", {
      location: {
        assign,
        origin: "https://typr.ca"
      },
      sessionStorage: {
        setItem
      }
    });

    await beginGoogleDriveRedirectAuthorization("client-id", "project-1");

    const authorizationUrl = new URL(assign.mock.calls[0][0] as string);
    expect(authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(authorizationUrl.pathname).toBe("/o/oauth2/v2/auth");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://typr.ca/"
    );
    expect(authorizationUrl.searchParams.get("response_type")).toBe("token");
    expect(authorizationUrl.searchParams.get("scope")).toBe(DRIVE_SCOPE);
    expect(authorizationUrl.searchParams.get("state")).toBe("oauth-state");
    expect(setItem).toHaveBeenCalledWith(
      "typr.google-drive.redirect.v1",
      expect.stringContaining('"projectId":"project-1"')
    );
    expect(unregister).toHaveBeenCalledOnce();
    expect(unregister.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0]
    );
  });

  it("captures a redirect token and removes it from the address bar and storage", () => {
    const removeItem = vi.fn();
    const replaceState = vi.fn();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.stubGlobal("window", {
      history: {
        replaceState,
        state: { existing: true }
      },
      location: {
        hash: `#access_token=redirect-token&expires_in=3600&scope=${encodeURIComponent(
          DRIVE_SCOPE
        )}&state=oauth-state`,
        pathname: "/",
        search: ""
      },
      sessionStorage: {
        getItem: () => REDIRECT_PENDING,
        removeItem
      }
    });

    expect(captureGoogleDriveRedirectResult()).toMatchObject({
      error: null,
      projectId: "project-1",
      token: {
        accessToken: "redirect-token"
      }
    });
    expect(replaceState).toHaveBeenCalledWith(
      { existing: true },
      "",
      "/"
    );
    expect(removeItem).toHaveBeenCalledWith(
      "typr.google-drive.redirect.v1"
    );
  });

  it("accepts a verified token with Drive file access", () => {
    const result = parseGoogleDriveRedirectResponse(
      new URLSearchParams({
        access_token: "redirect-token",
        expires_in: "3600",
        scope: `openid ${DRIVE_SCOPE}`,
        state: "oauth-state",
        token_type: "Bearer"
      }),
      REDIRECT_PENDING,
      NOW
    );

    expect(result).toEqual({
      error: null,
      projectId: "project-1",
      token: {
        accessToken: "redirect-token",
        expiresAt: Date.parse("2026-07-27T13:00:00.000Z")
      }
    });
  });

  it("rejects a response whose state does not match", () => {
    const result = parseGoogleDriveRedirectResponse(
      new URLSearchParams({
        access_token: "redirect-token",
        expires_in: "3600",
        scope: DRIVE_SCOPE,
        state: "different-state"
      }),
      REDIRECT_PENDING,
      NOW
    );

    expect(result).toMatchObject({
      error: "Google authorization could not be verified. Try connecting again.",
      projectId: "project-1",
      token: null
    });
  });

  it("surfaces a cached return that lost Google's authorization details", () => {
    const result = parseGoogleDriveRedirectResponse(
      new URLSearchParams(),
      REDIRECT_PENDING,
      NOW
    );

    expect(result).toMatchObject({
      error:
        "Google returned to Typr without authorization details. The browser may have loaded a cached app version. Try connecting again.",
      projectId: "project-1",
      token: null
    });
  });

  it("surfaces errors returned by Google's authorization server", () => {
    const result = parseGoogleDriveRedirectResponse(
      new URLSearchParams({
        error: "access_denied",
        error_description: "The user declined Drive access.",
        state: "oauth-state"
      }),
      REDIRECT_PENDING,
      NOW
    );

    expect(result).toMatchObject({
      error: "The user declined Drive access.",
      projectId: "project-1",
      token: null
    });
  });

  it("rejects stale authorization responses", () => {
    const result = parseGoogleDriveRedirectResponse(
      new URLSearchParams({
        access_token: "redirect-token",
        expires_in: "3600",
        scope: DRIVE_SCOPE,
        state: "oauth-state"
      }),
      REDIRECT_PENDING,
      Date.parse("2026-07-27T12:15:01.000Z")
    );

    expect(result.error).toBe(
      "Google authorization took too long. Try connecting again."
    );
    expect(result.token).toBeNull();
  });

  it("requires the Drive file scope in the response", () => {
    const result = parseGoogleDriveRedirectResponse(
      new URLSearchParams({
        access_token: "redirect-token",
        expires_in: "3600",
        scope: "openid",
        state: "oauth-state"
      }),
      REDIRECT_PENDING,
      NOW
    );

    expect(result.error).toBe("Google Drive file access was not granted.");
    expect(result.token).toBeNull();
  });

  it("treats tokens with more than one minute remaining as fresh", () => {
    expect(
      isGoogleDriveAccessTokenFresh(
        {
          accessToken: "access-token",
          expiresAt: NOW + 60_001
        },
        NOW
      )
    ).toBe(true);
    expect(
      isGoogleDriveAccessTokenFresh(
        {
          accessToken: "access-token",
          expiresAt: NOW + 60_000
        },
        NOW
      )
    ).toBe(false);
  });
});
