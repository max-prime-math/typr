const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_OAUTH_AUTHORIZATION_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DRIVE_REDIRECT_STORAGE_KEY =
  "typr.google-drive.redirect.v1";
const GOOGLE_DRIVE_REDIRECT_RESULT_STORAGE_KEY =
  "typr.google-drive.redirect-result.v1";
const GOOGLE_DRIVE_REDIRECT_MAX_AGE_MS = 15 * 60_000;

export interface GoogleDriveAccessToken {
  accessToken: string;
  expiresAt: number;
}

interface PendingGoogleDriveRedirect {
  createdAt: number;
  projectId: string;
  redirectUri: string;
  state: string;
  version: 1;
}

export interface GoogleDriveRedirectResult {
  error: string | null;
  projectId: string | null;
  token: GoogleDriveAccessToken | null;
}

interface StoredGoogleDriveRedirectResult {
  capturedAt: number;
  result: GoogleDriveRedirectResult;
  version: 1;
}

let capturedRedirectResult: GoogleDriveRedirectResult | null | undefined;
let redirectResultClaimed = false;

export async function beginGoogleDriveRedirectAuthorization(
  clientId: string,
  projectId: string
): Promise<void> {
  if (!clientId.trim()) {
    throw new Error(
      "Google Drive sync is not configured on this deployment."
    );
  }
  if (!projectId.trim()) {
    throw new Error("No Typr project was selected for Google Drive sync.");
  }

  const redirectUri = new URL("/", window.location.origin).href;
  const pending: PendingGoogleDriveRedirect = {
    createdAt: Date.now(),
    projectId,
    redirectUri,
    state: crypto.randomUUID(),
    version: 1
  };
  const serializedPending = JSON.stringify(pending);
  clearStoredRedirectResult();
  const pendingStoredInSession = setStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_REDIRECT_STORAGE_KEY,
    serializedPending
  );
  const pendingStoredInLocal = setStorageItem(
    window.localStorage,
    GOOGLE_DRIVE_REDIRECT_STORAGE_KEY,
    serializedPending
  );
  if (!pendingStoredInSession && !pendingStoredInLocal) {
    throw new Error(
      "Typr could not save the Google authorization request in this browser."
    );
  }

  const authorizationUrl = new URL(GOOGLE_OAUTH_AUTHORIZATION_URL);
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "token");
  authorizationUrl.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("state", pending.state);
  await unregisterControllingServiceWorker(redirectUri);
  window.location.assign(authorizationUrl.href);
}

export function captureGoogleDriveRedirectResult(): GoogleDriveRedirectResult | null {
  if (capturedRedirectResult !== undefined) {
    return capturedRedirectResult;
  }

  const response = new URLSearchParams(
    window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash
  );
  const serializedPending =
    getStorageItem(
      window.sessionStorage,
      GOOGLE_DRIVE_REDIRECT_STORAGE_KEY
    ) ??
    getStorageItem(
      window.localStorage,
      GOOGLE_DRIVE_REDIRECT_STORAGE_KEY
    );
  if (
    !response.has("access_token") &&
    !response.has("error") &&
    !serializedPending
  ) {
    capturedRedirectResult = restoreStoredRedirectResult(Date.now());
    return capturedRedirectResult;
  }

  if (window.location.hash) {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`
    );
  }
  removeStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_REDIRECT_STORAGE_KEY
  );
  removeStorageItem(
    window.localStorage,
    GOOGLE_DRIVE_REDIRECT_STORAGE_KEY
  );
  capturedRedirectResult = parseGoogleDriveRedirectResponse(
    response,
    serializedPending,
    Date.now()
  );
  storeRedirectResult(capturedRedirectResult);
  return capturedRedirectResult;
}

export function claimGoogleDriveRedirectResult(): GoogleDriveRedirectResult | null {
  if (redirectResultClaimed) {
    return null;
  }
  redirectResultClaimed = true;
  const result =
    capturedRedirectResult === undefined
      ? captureGoogleDriveRedirectResult()
      : capturedRedirectResult;
  capturedRedirectResult = null;
  return result;
}

export function clearGoogleDriveRedirectResult(): void {
  clearStoredRedirectResult();
}

export function parseGoogleDriveRedirectResponse(
  response: URLSearchParams,
  serializedPending: string | null,
  now = Date.now()
): GoogleDriveRedirectResult {
  const pending = parsePendingGoogleDriveRedirect(serializedPending);
  if (!pending) {
    return {
      error:
        "Google authorization returned without a matching Typr connection request. Try connecting again.",
      projectId: null,
      token: null
    };
  }
  if (now - pending.createdAt > GOOGLE_DRIVE_REDIRECT_MAX_AGE_MS) {
    return {
      error: "Google authorization took too long. Try connecting again.",
      projectId: pending.projectId,
      token: null
    };
  }
  if (response.get("state") !== pending.state) {
    if (!response.has("access_token") && !response.has("error")) {
      return {
        error:
          "Google returned to Typr without authorization details. The browser may have loaded a cached app version. Try connecting again.",
        projectId: pending.projectId,
        token: null
      };
    }
    return {
      error:
        "Google authorization could not be verified. Try connecting again.",
      projectId: pending.projectId,
      token: null
    };
  }

  const oauthError = response.get("error");
  if (oauthError) {
    return {
      error:
        response.get("error_description") ||
        `Google authorization failed: ${oauthError}.`,
      projectId: pending.projectId,
      token: null
    };
  }

  const accessToken = response.get("access_token");
  const grantedScopes = new Set(
    (response.get("scope") ?? "").split(/\s+/).filter(Boolean)
  );
  const lifetimeSeconds = Number(response.get("expires_in"));
  if (!accessToken) {
    return {
      error: "Google authorization did not return an access token.",
      projectId: pending.projectId,
      token: null
    };
  }
  if (!grantedScopes.has(GOOGLE_DRIVE_SCOPE)) {
    return {
      error: "Google Drive file access was not granted.",
      projectId: pending.projectId,
      token: null
    };
  }
  if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0) {
    return {
      error: "Google returned an invalid authorization lifetime.",
      projectId: pending.projectId,
      token: null
    };
  }

  return {
    error: null,
    projectId: pending.projectId,
    token: {
      accessToken,
      expiresAt: now + lifetimeSeconds * 1000
    }
  };
}

export function isGoogleDriveAccessTokenFresh(
  token: GoogleDriveAccessToken | null,
  now = Date.now()
): token is GoogleDriveAccessToken {
  return Boolean(token && token.expiresAt - now > 60_000);
}

function parsePendingGoogleDriveRedirect(
  serializedPending: string | null
): PendingGoogleDriveRedirect | null {
  if (!serializedPending) {
    return null;
  }
  try {
    const pending = JSON.parse(serializedPending) as Partial<
      PendingGoogleDriveRedirect
    >;
    if (
      pending.version !== 1 ||
      typeof pending.createdAt !== "number" ||
      !Number.isFinite(pending.createdAt) ||
      typeof pending.projectId !== "string" ||
      !pending.projectId ||
      typeof pending.redirectUri !== "string" ||
      !pending.redirectUri ||
      typeof pending.state !== "string" ||
      !pending.state
    ) {
      return null;
    }
    return pending as PendingGoogleDriveRedirect;
  } catch {
    return null;
  }
}

function storeRedirectResult(result: GoogleDriveRedirectResult): void {
  setStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_REDIRECT_RESULT_STORAGE_KEY,
    JSON.stringify({
      capturedAt: Date.now(),
      result,
      version: 1
    } satisfies StoredGoogleDriveRedirectResult)
  );
}

function restoreStoredRedirectResult(
  now: number
): GoogleDriveRedirectResult | null {
  const serialized = getStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_REDIRECT_RESULT_STORAGE_KEY
  );
  if (!serialized) {
    return null;
  }

  try {
    const stored = JSON.parse(serialized) as Partial<
      StoredGoogleDriveRedirectResult
    >;
    if (
      stored.version !== 1 ||
      typeof stored.capturedAt !== "number" ||
      !Number.isFinite(stored.capturedAt) ||
      now - stored.capturedAt > GOOGLE_DRIVE_REDIRECT_MAX_AGE_MS ||
      !isGoogleDriveRedirectResult(stored.result)
    ) {
      clearStoredRedirectResult();
      return null;
    }
    return stored.result;
  } catch {
    clearStoredRedirectResult();
    return null;
  }
}

function isGoogleDriveRedirectResult(
  value: unknown
): value is GoogleDriveRedirectResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const result = value as Partial<GoogleDriveRedirectResult>;
  const projectIdIsValid =
    result.projectId === null || typeof result.projectId === "string";
  const errorIsValid =
    result.error === null || typeof result.error === "string";
  const tokenIsValid =
    result.token === null ||
    (typeof result.token === "object" &&
      typeof result.token.accessToken === "string" &&
      Boolean(result.token.accessToken) &&
      typeof result.token.expiresAt === "number" &&
      Number.isFinite(result.token.expiresAt));
  return projectIdIsValid && errorIsValid && tokenIsValid;
}

function clearStoredRedirectResult(): void {
  removeStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_REDIRECT_RESULT_STORAGE_KEY
  );
}

function getStorageItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(
  storage: Storage,
  key: string,
  value: string
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage cleanup is best effort when browser privacy settings block it.
  }
}

async function unregisterControllingServiceWorker(
  redirectUri: string
): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const registration =
    await navigator.serviceWorker.getRegistration(redirectUri);
  await registration?.unregister();
}
