const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCRIPT_ELEMENT_ID = "typr-google-identity-services";
const GOOGLE_AUTHORIZATION_TIMEOUT_MS = 120_000;

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleOAuth2Api {
  initTokenClient(options: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }): GoogleTokenClient;
  revoke(accessToken: string, callback?: () => void): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2Api;
      };
    };
  }
}

export interface GoogleDriveAccessToken {
  accessToken: string;
  expiresAt: number;
}

export interface GoogleDriveAccessTokenRequestOptions {
  prompt?: "" | "consent";
  timeoutMs?: number;
}

let identityScriptPromise: Promise<void> | null = null;

export function requestGoogleDriveAccessToken(
  clientId: string,
  options: GoogleDriveAccessTokenRequestOptions = {}
): Promise<GoogleDriveAccessToken> {
  if (!clientId.trim()) {
    return Promise.reject(
      new Error("Google Drive sync is not configured on this deployment.")
    );
  }

  return loadGoogleIdentityServices().then(
    () =>
      new Promise<GoogleDriveAccessToken>((resolve, reject) => {
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) {
          reject(new Error("Google authorization did not finish loading."));
          return;
        }

        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          reject(
            new Error(
              "Google authorization did not return to Typr. Close the Google window and try again."
            )
          );
        }, options.timeoutMs ?? GOOGLE_AUTHORIZATION_TIMEOUT_MS);
        const beginSettling = () => {
          if (settled) {
            return false;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          return true;
        };
        const client = oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPE,
          callback: (response) => {
            if (!beginSettling()) {
              return;
            }
            if (!response.access_token || response.error) {
              reject(
                new Error(
                  response.error_description ||
                    response.error ||
                    "Google Drive access was not granted."
                )
              );
              return;
            }
            const lifetimeSeconds =
              typeof response.expires_in === "number"
                ? response.expires_in
                : 3600;
            resolve({
              accessToken: response.access_token,
              expiresAt: Date.now() + lifetimeSeconds * 1000
            });
          },
          error_callback: (error) => {
            if (!beginSettling()) {
              return;
            }
            reject(
              new Error(
                error.message ||
                  (error.type === "popup_closed"
                    ? "Google authorization was cancelled."
                    : error.type === "popup_failed_to_open"
                      ? "Unable to open Google authorization. Allow popups and try again."
                    : "Unable to open Google authorization.")
              )
            );
          }
        });

        client.requestAccessToken({ prompt: options.prompt ?? "consent" });
      })
  );
}

export function revokeGoogleDriveAccessToken(accessToken: string): void {
  window.google?.accounts?.oauth2?.revoke(accessToken);
}

export function isGoogleDriveAccessTokenFresh(
  token: GoogleDriveAccessToken | null,
  now = Date.now()
): token is GoogleDriveAccessToken {
  return Boolean(token && token.expiresAt - now > 60_000);
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (identityScriptPromise) {
    return identityScriptPromise;
  }

  identityScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      SCRIPT_ELEMENT_ID
    ) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");
    const handleLoad = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        identityScriptPromise = null;
        reject(new Error("Google authorization did not finish loading."));
      }
    };
    const handleError = () => {
      identityScriptPromise = null;
      reject(new Error("Unable to load Google authorization."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existingScript) {
      script.id = SCRIPT_ELEMENT_ID;
      script.async = true;
      script.defer = true;
      script.src = GOOGLE_IDENTITY_SCRIPT_URL;
      document.head.append(script);
    }
  });

  return identityScriptPromise;
}
