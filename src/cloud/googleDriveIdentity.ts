const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCRIPT_ELEMENT_ID = "typr-google-identity-services";
const GOOGLE_AUTHORIZATION_TIMEOUT_MS = 120_000;
const GOOGLE_AUTHORIZATION_RETURN_GRACE_MS = 5_000;
const GOOGLE_AUTHORIZATION_FOCUS_POLL_MS = 250;

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
        let sawWindowBlur = false;
        let sawDocumentHidden = false;
        let sawWindowFocusAfterDeparture = false;
        let sawDocumentVisibleAfterDeparture = false;
        let sawFocusPollingDeparture = false;
        let sawFocusPollingReturn = false;
        let googleMessageCount = 0;
        let returnTimeoutId: number | null = null;
        let focusPollId: number | null = null;
        const formatDiagnostics = () =>
          [
            `origin=${window.location?.origin ?? "unknown"}`,
            `window-blurred=${sawWindowBlur ? "yes" : "no"}`,
            `document-hidden=${sawDocumentHidden ? "yes" : "no"}`,
            `window-refocused=${sawWindowFocusAfterDeparture ? "yes" : "no"}`,
            `document-visible=${sawDocumentVisibleAfterDeparture ? "yes" : "no"}`,
            `focus-poll-left=${sawFocusPollingDeparture ? "yes" : "no"}`,
            `focus-poll-returned=${sawFocusPollingReturn ? "yes" : "no"}`,
            `google-messages=${googleMessageCount}`
          ].join("; ");
        const cleanup = () => {
          window.clearTimeout(timeoutId);
          if (returnTimeoutId !== null) {
            window.clearTimeout(returnTimeoutId);
          }
          if (focusPollId !== null) {
            window.clearInterval(focusPollId);
          }
          window.removeEventListener("blur", handleWindowBlur);
          window.removeEventListener("focus", handleWindowFocus);
          window.removeEventListener("message", handleWindowMessage);
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
          );
        };
        const beginSettling = () => {
          if (settled) {
            return false;
          }
          settled = true;
          cleanup();
          return true;
        };
        const rejectWithDiagnostics = (message: string) => {
          if (!beginSettling()) {
            return;
          }
          reject(new Error(`${message} Diagnostics: ${formatDiagnostics()}.`));
        };
        const scheduleMissingCallbackFailure = () => {
          if (
            settled ||
            returnTimeoutId !== null ||
            (!sawWindowBlur &&
              !sawDocumentHidden &&
              !sawFocusPollingDeparture)
          ) {
            return;
          }
          returnTimeoutId = window.setTimeout(
            () =>
              rejectWithDiagnostics(
                "Google authorization closed without returning credentials to Typr."
              ),
            GOOGLE_AUTHORIZATION_RETURN_GRACE_MS
          );
        };
        function handleWindowBlur() {
          sawWindowBlur = true;
        }
        function handleWindowFocus() {
          if (!sawWindowBlur && !sawDocumentHidden) {
            return;
          }
          sawWindowFocusAfterDeparture = true;
          scheduleMissingCallbackFailure();
        }
        function handleWindowMessage(event: MessageEvent) {
          if (
            event.origin === "https://accounts.google.com" ||
            event.origin.endsWith(".google.com")
          ) {
            googleMessageCount += 1;
          }
        }
        function handleVisibilityChange() {
          if (document.visibilityState === "hidden") {
            sawDocumentHidden = true;
            return;
          }
          if (!sawWindowBlur && !sawDocumentHidden) {
            return;
          }
          sawDocumentVisibleAfterDeparture = true;
          scheduleMissingCallbackFailure();
        }
        function pollDocumentFocus() {
          if (typeof document.hasFocus !== "function") {
            return;
          }
          if (!document.hasFocus()) {
            sawFocusPollingDeparture = true;
            return;
          }
          if (!sawFocusPollingDeparture) {
            return;
          }
          sawFocusPollingReturn = true;
          scheduleMissingCallbackFailure();
        }
        window.addEventListener("blur", handleWindowBlur);
        window.addEventListener("focus", handleWindowFocus);
        window.addEventListener("message", handleWindowMessage);
        document.addEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
        focusPollId = window.setInterval(
          pollDocumentFocus,
          GOOGLE_AUTHORIZATION_FOCUS_POLL_MS
        );
        const timeoutId = window.setTimeout(
          () =>
            rejectWithDiagnostics(
              "Google authorization did not return to Typr."
            ),
          options.timeoutMs ?? GOOGLE_AUTHORIZATION_TIMEOUT_MS
        );
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
