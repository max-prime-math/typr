export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_OAUTH_CALLBACK_FILE =
  "google-drive-oauth-callback.html";
export const GOOGLE_DRIVE_PENDING_STORAGE_KEY =
  "typr.google-drive.oauth-pending.v2";
export const GOOGLE_DRIVE_RESULT_STORAGE_KEY =
  "typr.google-drive.oauth-result.v2";
export const GOOGLE_DRIVE_REDIRECT_MAX_AGE_MS = 15 * 60_000;

const GOOGLE_OAUTH_AUTHORIZATION_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

export type GoogleDriveAuthorizationIntent =
  | "connect"
  | "reconnect"
  | "change-location";

export interface GoogleDriveAccessToken {
  accessToken: string;
  expiresAt: number;
}

export interface PendingGoogleDriveAuthorization {
  createdAt: number;
  intent: GoogleDriveAuthorizationIntent;
  projectId: string;
  redirectUri: string;
  returnUri: string;
  state: string;
  version: 2;
}

export interface GoogleDriveAuthorizationResult {
  error: string | null;
  intent: GoogleDriveAuthorizationIntent | null;
  projectId: string | null;
  token: GoogleDriveAccessToken | null;
}

interface StoredGoogleDriveAuthorizationResult {
  capturedAt: number;
  result: GoogleDriveAuthorizationResult;
  version: 2;
}

export function getGoogleDriveOAuthCallbackUri(
  baseUri = document.baseURI
): string {
  return new URL(GOOGLE_DRIVE_OAUTH_CALLBACK_FILE, baseUri).href;
}

export function createGoogleDriveAuthorizationUrl(options: {
  clientId: string;
  intent: GoogleDriveAuthorizationIntent;
  projectId: string;
  redirectUri: string;
  returnUri: string;
  state: string;
}): string {
  const authorizationUrl = new URL(GOOGLE_OAUTH_AUTHORIZATION_URL);
  authorizationUrl.searchParams.set("client_id", options.clientId);
  authorizationUrl.searchParams.set("redirect_uri", options.redirectUri);
  authorizationUrl.searchParams.set("response_type", "token");
  authorizationUrl.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("state", options.state);
  return authorizationUrl.href;
}

export async function beginGoogleDriveRedirectAuthorization(
  clientId: string,
  projectId: string,
  intent: GoogleDriveAuthorizationIntent
): Promise<void> {
  if (!clientId.trim()) {
    throw new Error(
      "Google Drive authorization is not configured on this deployment."
    );
  }
  if (!projectId.trim()) {
    throw new Error("No Typr project was selected for Google Drive sync.");
  }

  const redirectUri = getGoogleDriveOAuthCallbackUri();
  const returnUri = new URL("./", document.baseURI).href;
  const pending: PendingGoogleDriveAuthorization = {
    createdAt: Date.now(),
    intent,
    projectId,
    redirectUri,
    returnUri,
    state: crypto.randomUUID(),
    version: 2
  };
  const serializedPending = JSON.stringify(pending);
  clearGoogleDriveAuthorizationResult();
  const pendingStoredInSession = setStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_PENDING_STORAGE_KEY,
    serializedPending
  );
  const pendingStoredInLocal = setStorageItem(
    window.localStorage,
    GOOGLE_DRIVE_PENDING_STORAGE_KEY,
    serializedPending
  );
  if (!pendingStoredInSession && !pendingStoredInLocal) {
    throw new Error(
      "Typr could not save the Google authorization request in this browser."
    );
  }

  await unregisterGoogleDriveServiceWorker(returnUri);
  window.location.assign(
    createGoogleDriveAuthorizationUrl({
      clientId,
      intent,
      projectId,
      redirectUri,
      returnUri,
      state: pending.state
    })
  );
}

export function parseGoogleDriveAuthorizationResponse(
  response: URLSearchParams,
  serializedPending: string | null,
  now = Date.now()
): GoogleDriveAuthorizationResult {
  const pending = parsePendingGoogleDriveAuthorization(serializedPending);
  if (!pending) {
    return {
      error:
        "Google authorization returned without a matching Typr connection request. Try connecting again.",
      intent: null,
      projectId: null,
      token: null
    };
  }
  if (
    now < pending.createdAt ||
    now - pending.createdAt > GOOGLE_DRIVE_REDIRECT_MAX_AGE_MS
  ) {
    return resultError(
      pending,
      "Google authorization took too long. Try connecting again."
    );
  }
  if (response.get("state") !== pending.state) {
    return resultError(
      pending,
      "Google authorization could not be verified. Try connecting again."
    );
  }

  const oauthError = response.get("error");
  if (oauthError) {
    return resultError(
      pending,
      response.get("error_description") ||
        `Google authorization failed: ${oauthError}.`
    );
  }

  const accessToken = response.get("access_token");
  const grantedScopes = new Set(
    (response.get("scope") ?? "").split(/\s+/).filter(Boolean)
  );
  const lifetimeSeconds = Number(response.get("expires_in"));
  if (!accessToken) {
    return resultError(
      pending,
      "Google authorization did not return an access token."
    );
  }
  if (!grantedScopes.has(GOOGLE_DRIVE_SCOPE)) {
    return resultError(
      pending,
      "Google Drive file access was not granted."
    );
  }
  if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0) {
    return resultError(
      pending,
      "Google returned an invalid authorization lifetime."
    );
  }

  return {
    error: null,
    intent: pending.intent,
    projectId: pending.projectId,
    token: {
      accessToken,
      expiresAt: now + lifetimeSeconds * 1000
    }
  };
}

export function captureGoogleDriveOAuthCallback(options: {
  hash?: string;
  localStorage?: Storage;
  now?: number;
  sessionStorage?: Storage;
} = {}): {
  result: GoogleDriveAuthorizationResult;
  returnUri: string;
} {
  const sessionStorage = options.sessionStorage ?? window.sessionStorage;
  const localStorage = options.localStorage ?? window.localStorage;
  const serializedPending =
    getStorageItem(sessionStorage, GOOGLE_DRIVE_PENDING_STORAGE_KEY) ??
    getStorageItem(localStorage, GOOGLE_DRIVE_PENDING_STORAGE_KEY);
  const pending = parsePendingGoogleDriveAuthorization(serializedPending);
  const hash = options.hash ?? window.location.hash;
  const response = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );
  const result = parseGoogleDriveAuthorizationResponse(
    response,
    serializedPending,
    options.now ?? Date.now()
  );

  removeStorageItem(sessionStorage, GOOGLE_DRIVE_PENDING_STORAGE_KEY);
  removeStorageItem(localStorage, GOOGLE_DRIVE_PENDING_STORAGE_KEY);
  setStorageItem(
    sessionStorage,
    GOOGLE_DRIVE_RESULT_STORAGE_KEY,
    JSON.stringify({
      capturedAt: options.now ?? Date.now(),
      result,
      version: 2
    } satisfies StoredGoogleDriveAuthorizationResult)
  );

  return {
    result,
    returnUri: pending?.returnUri ?? new URL("./", document.baseURI).href
  };
}

export function readGoogleDriveAuthorizationResult(
  now = Date.now()
): GoogleDriveAuthorizationResult | null {
  const serialized = getStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_RESULT_STORAGE_KEY
  );
  if (!serialized) {
    return null;
  }

  try {
    const stored = JSON.parse(serialized) as Partial<
      StoredGoogleDriveAuthorizationResult
    >;
    if (
      stored.version !== 2 ||
      typeof stored.capturedAt !== "number" ||
      !Number.isFinite(stored.capturedAt) ||
      now < stored.capturedAt ||
      now - stored.capturedAt > GOOGLE_DRIVE_REDIRECT_MAX_AGE_MS ||
      !isGoogleDriveAuthorizationResult(stored.result)
    ) {
      clearGoogleDriveAuthorizationResult();
      return null;
    }
    return stored.result;
  } catch {
    clearGoogleDriveAuthorizationResult();
    return null;
  }
}

export function clearGoogleDriveAuthorizationResult(): void {
  removeStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_RESULT_STORAGE_KEY
  );
}

export function clearGoogleDrivePendingAuthorization(): void {
  removeStorageItem(
    window.sessionStorage,
    GOOGLE_DRIVE_PENDING_STORAGE_KEY
  );
  removeStorageItem(
    window.localStorage,
    GOOGLE_DRIVE_PENDING_STORAGE_KEY
  );
}

export function isGoogleDriveAccessTokenFresh(
  token: GoogleDriveAccessToken | null,
  now = Date.now()
): token is GoogleDriveAccessToken {
  return Boolean(token && token.expiresAt - now > 60_000);
}

export function parsePendingGoogleDriveAuthorization(
  serializedPending: string | null
): PendingGoogleDriveAuthorization | null {
  if (!serializedPending) {
    return null;
  }
  try {
    const pending = JSON.parse(serializedPending) as Partial<
      PendingGoogleDriveAuthorization
    >;
    if (
      pending.version !== 2 ||
      typeof pending.createdAt !== "number" ||
      !Number.isFinite(pending.createdAt) ||
      !isGoogleDriveAuthorizationIntent(pending.intent) ||
      typeof pending.projectId !== "string" ||
      !pending.projectId ||
      typeof pending.redirectUri !== "string" ||
      !pending.redirectUri ||
      typeof pending.returnUri !== "string" ||
      !pending.returnUri ||
      typeof pending.state !== "string" ||
      !pending.state ||
      !isValidGoogleDriveRedirectPair(
        pending.redirectUri,
        pending.returnUri
      )
    ) {
      return null;
    }
    return pending as PendingGoogleDriveAuthorization;
  } catch {
    return null;
  }
}

function resultError(
  pending: PendingGoogleDriveAuthorization,
  error: string
): GoogleDriveAuthorizationResult {
  return {
    error,
    intent: pending.intent,
    projectId: pending.projectId,
    token: null
  };
}

function isGoogleDriveAuthorizationResult(
  value: unknown
): value is GoogleDriveAuthorizationResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const result = value as Partial<GoogleDriveAuthorizationResult>;
  const projectIdIsValid =
    result.projectId === null || typeof result.projectId === "string";
  const intentIsValid =
    result.intent === null ||
    isGoogleDriveAuthorizationIntent(result.intent);
  const errorIsValid =
    result.error === null || typeof result.error === "string";
  const tokenIsValid =
    result.token === null ||
    (typeof result.token === "object" &&
      typeof result.token.accessToken === "string" &&
      Boolean(result.token.accessToken) &&
      typeof result.token.expiresAt === "number" &&
      Number.isFinite(result.token.expiresAt));
  return projectIdIsValid && intentIsValid && errorIsValid && tokenIsValid;
}

function isGoogleDriveAuthorizationIntent(
  value: unknown
): value is GoogleDriveAuthorizationIntent {
  return (
    value === "connect" ||
    value === "reconnect" ||
    value === "change-location"
  );
}

function isValidGoogleDriveRedirectPair(
  redirectUri: string,
  returnUri: string
): boolean {
  try {
    const redirect = new URL(redirectUri);
    const returnUrl = new URL(returnUri);
    const expectedRedirect = new URL(
      GOOGLE_DRIVE_OAUTH_CALLBACK_FILE,
      returnUrl
    );
    return (
      redirect.origin === returnUrl.origin &&
      redirect.href === expectedRedirect.href &&
      !returnUrl.hash
    );
  } catch {
    return false;
  }
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
    // Browser privacy settings can block storage cleanup.
  }
}

async function unregisterGoogleDriveServiceWorker(
  appUri: string
): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const registration =
    await navigator.serviceWorker.getRegistration(appUri);
  await registration?.unregister();
}
