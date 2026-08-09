import {
  TYPR_COMPANION_PROTOCOL_VERSION,
  TYPR_COMPANION_ROUTES,
  type CompanionCapabilities,
  type CompanionStatusResponse,
  type CompileRequest,
  type CompileResult
} from "../companion-protocol";

export const DEFAULT_COMPANION_BASE_URL =
  import.meta.env.VITE_TYPR_COMPANION_URL?.trim() || "http://127.0.0.1:8484";
export const COMPANION_BASE_URL_STORAGE_KEY = "typr.companion-base-url.v1";

type CompanionUrlStorage = Pick<Storage, "getItem" | "setItem">;

export type CompanionBaseUrlValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

export type CompanionConnectionState =
  | "checking"
  | "available"
  | "unavailable"
  | "incompatible";

export interface CompanionConnectionStatus {
  state: CompanionConnectionState;
  baseUrl: string;
  checkedAt?: number;
  status?: CompanionStatusResponse;
  message?: string;
}

export type CompanionClientErrorKind = "transport" | "server" | "protocol";

export class CompanionClientError extends Error {
  constructor(
    readonly kind: CompanionClientErrorKind,
    message: string
  ) {
    super(message);
    this.name = "CompanionClientError";
  }
}

export interface CompanionClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** The only browser-facing HTTP boundary for the Companion protocol. */
export class CompanionClient {
  readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: CompanionClientOptions = {}) {
    this.baseUrl = normalizeCompanionBaseUrl(options.baseUrl ?? DEFAULT_COMPANION_BASE_URL);
    // Firefox's native fetch verifies its Window receiver. Keep the browser
    // global call bound while still permitting an injected mock in tests.
    this.fetchImplementation = options.fetch ?? ((input, init) => fetch(input, init));
  }

  async getConnectionStatus(): Promise<CompanionConnectionStatus> {
    try {
      const response = await this.fetchImplementation(this.url(TYPR_COMPANION_ROUTES.status));
      if (!response.ok) {
        return this.status("unavailable", `Companion status request failed (${response.status}).`);
      }

      const payload = await readJson(response);
      const parsed = parseCompanionStatus(payload);
      if (!parsed.ok) {
        return this.status("unavailable", parsed.message);
      }
      if (parsed.value.protocolVersion !== TYPR_COMPANION_PROTOCOL_VERSION) {
        return this.status(
          "incompatible",
          `Companion protocol ${parsed.value.protocolVersion} is incompatible with Typr protocol ${TYPR_COMPANION_PROTOCOL_VERSION}.`,
          parsed.value
        );
      }
      return this.status("available", undefined, parsed.value);
    } catch (error) {
      return this.status("unavailable", formatTransportError(error));
    }
  }

  async compile(request: CompileRequest): Promise<CompileResult> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.url(TYPR_COMPANION_ROUTES.compile), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });
    } catch (error) {
      throw new CompanionClientError("transport", formatTransportError(error));
    }

    const payload = await readJson(response).catch((error: unknown) => {
      throw new CompanionClientError(
        "protocol",
        error instanceof Error ? error.message : "Companion returned invalid JSON."
      );
    });
    if (!response.ok) {
      throw new CompanionClientError("server", readServerError(payload, response.status));
    }
    const parsed = parseCompileResult(payload);
    if (!parsed.ok) {
      throw new CompanionClientError("protocol", parsed.message);
    }
    return parsed.value;
  }

  private status(
    state: CompanionConnectionState,
    message?: string,
    status?: CompanionStatusResponse
  ): CompanionConnectionStatus {
    return { state, baseUrl: this.baseUrl, checkedAt: Date.now(), status, message };
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

export function normalizeCompanionBaseUrl(value: string): string {
  const validation = validateCompanionBaseUrl(value);
  return validation.ok
    ? validation.value
    : DEFAULT_COMPANION_BASE_URL.replace(/\/$/, "");
}

export function validateCompanionBaseUrl(value: string): CompanionBaseUrlValidation {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter the HTTP or HTTPS URL of Typr Companion." };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, message: "The Companion URL must start with http:// or https://." };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, message: "The Companion URL must not contain credentials." };
    }
    if (parsed.search || parsed.hash) {
      return { ok: false, message: "The Companion URL must not contain a query string or fragment." };
    }
    return { ok: true, value: parsed.toString().replace(/\/$/, "") };
  } catch {
    return { ok: false, message: "Enter a valid Companion URL." };
  }
}

export function readStoredCompanionBaseUrl(
  storage: Pick<CompanionUrlStorage, "getItem"> | undefined = getDefaultStorage()
): string {
  if (!storage) return normalizeCompanionBaseUrl(DEFAULT_COMPANION_BASE_URL);

  try {
    const stored = storage.getItem(COMPANION_BASE_URL_STORAGE_KEY);
    return stored ? normalizeCompanionBaseUrl(stored) : normalizeCompanionBaseUrl(DEFAULT_COMPANION_BASE_URL);
  } catch {
    return normalizeCompanionBaseUrl(DEFAULT_COMPANION_BASE_URL);
  }
}

export function writeStoredCompanionBaseUrl(
  value: string,
  storage: Pick<CompanionUrlStorage, "setItem"> | undefined = getDefaultStorage()
): void {
  storage?.setItem(COMPANION_BASE_URL_STORAGE_KEY, normalizeCompanionBaseUrl(value));
}

function getDefaultStorage(): CompanionUrlStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function parseCompanionStatus(value: unknown): Result<CompanionStatusResponse> {
  if (!isRecord(value) || !isInteger(value.protocolVersion) || typeof value.serverVersion !== "string") {
    return invalid("Companion status response is missing protocolVersion or serverVersion.");
  }
  const capabilities = parseCapabilities(value.capabilities);
  return capabilities.ok
    ? { ok: true, value: { protocolVersion: value.protocolVersion, serverVersion: value.serverVersion, capabilities: capabilities.value } }
    : capabilities;
}

export function parseCompileResult(value: unknown): Result<CompileResult> {
  if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.engine !== "string" || typeof value.log !== "string") {
    return invalid("Companion compile response has an invalid shape.");
  }
  if (value.ok) {
    if (!isRecord(value.output) || value.output.mediaType !== "application/pdf" || value.output.encoding !== "base64" || typeof value.output.path !== "string" || !isBase64(value.output.content) || !isFiniteNumber(value.durationMs)) {
      return invalid("Companion success response is missing a valid PDF output.");
    }
    return { ok: true, value: value as unknown as CompileResult };
  }
  if (!Array.isArray(value.errors) || !value.errors.every(isCompileError) || (value.durationMs !== undefined && !isFiniteNumber(value.durationMs))) {
    return invalid("Companion failure response has invalid errors.");
  }
  return { ok: true, value: value as unknown as CompileResult };
}

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

function invalid<T = never>(message: string): Result<T> {
  return { ok: false, message };
}

function parseCapabilities(value: unknown): Result<CompanionCapabilities> {
  if (!isRecord(value) || !isRecord(value.compile) || !Array.isArray(value.compile.engines) || !value.compile.engines.every((engine) => typeof engine === "string") || !isRecord(value.filesystem) || typeof value.filesystem.projectStorage !== "boolean" || !isRecord(value.lsp) || !Array.isArray(value.lsp.languages) || !value.lsp.languages.every((language) => typeof language === "string") || !isRecord(value.git) || typeof value.git.enabled !== "boolean" || !isRecord(value.terminal) || typeof value.terminal.enabled !== "boolean") {
    return invalid("Companion status response has invalid capabilities.");
  }
  return { ok: true, value: value as unknown as CompanionCapabilities };
}

function isCompileError(value: unknown): boolean {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string" && (value.path === undefined || typeof value.path === "string") && (value.line === undefined || isInteger(value.line)) && (value.column === undefined || isInteger(value.column));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBase64(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Companion returned invalid JSON.");
  }
}

function readServerError(payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return `Companion server error (${status}): ${payload.error.message}`;
  }
  return `Companion server error (${status}).`;
}

function formatTransportError(error: unknown): string {
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return `Typr Companion is unavailable${detail}`;
}
