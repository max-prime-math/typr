import {
  TYPR_COMPANION_PROTOCOL_VERSION,
  TYPR_COMPANION_ROUTES,
  TYPR_WORKSPACE_MUTATION_HEADER,
  type CompanionCapabilities,
  type CompanionStatusResponse,
  type CompileRequest,
  type CompileResult,
  type WorkspaceFileListResponse,
  type WorkspaceFileMetadata,
  type WorkspaceFileResponse
} from "@max-prime-math/typr-companion-protocol";

export const DEFAULT_COMPANION_BASE_URL =
  import.meta.env.VITE_TYPR_COMPANION_URL?.trim() || "http://127.0.0.1:8484";
export const COMPANION_BASE_URL_STORAGE_KEY = "typr.companion-base-url.v1";
const COMPANION_BASE_URL_CONFIGURED_BY_BUILD = Boolean(
  import.meta.env.VITE_TYPR_COMPANION_URL?.trim()
);

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

export type CompanionClientErrorKind = "transport" | "server" | "protocol" | "conflict";

export class CompanionClientError extends Error {
  constructor(
    readonly kind: CompanionClientErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string
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

  async listWorkspaceFiles(): Promise<WorkspaceFileListResponse> {
    const payload = await this.workspaceRequest(TYPR_COMPANION_ROUTES.workspaceFiles);
    const parsed = parseWorkspaceFileList(payload);
    if (!parsed.ok) throw new CompanionClientError("protocol", parsed.message);
    return parsed.value;
  }

  async readWorkspaceFile(path: string, maxFileBytes?: number): Promise<WorkspaceFileResponse> {
    const payload = await this.workspaceRequest(this.workspaceFilePath(path));
    const parsed = parseWorkspaceFile(payload, maxFileBytes);
    if (!parsed.ok) throw new CompanionClientError("protocol", parsed.message);
    return parsed.value;
  }

  async createWorkspaceFile(path: string, bytes: Uint8Array): Promise<WorkspaceFileMetadata> {
    return this.writeWorkspaceFile(path, bytes, { "If-None-Match": "*" });
  }

  async updateWorkspaceFile(path: string, bytes: Uint8Array, etag: string): Promise<WorkspaceFileMetadata> {
    if (!isStrongEtag(etag)) throw new CompanionClientError("protocol", "Workspace update requires a strong ETag.");
    return this.writeWorkspaceFile(path, bytes, { "If-Match": etag });
  }

  async deleteWorkspaceFile(path: string, etag: string): Promise<void> {
    if (!isStrongEtag(etag)) throw new CompanionClientError("protocol", "Workspace deletion requires a strong ETag.");
    await this.workspaceRequest(this.workspaceFilePath(path), {
      method: "DELETE",
      headers: {
        [TYPR_WORKSPACE_MUTATION_HEADER]: "1",
        "If-Match": etag
      }
    });
  }

  private async writeWorkspaceFile(
    path: string,
    bytes: Uint8Array,
    precondition: Record<string, string>
  ): Promise<WorkspaceFileMetadata> {
    const payload = await this.workspaceRequest(this.workspaceFilePath(path), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        [TYPR_WORKSPACE_MUTATION_HEADER]: "1",
        ...precondition
      },
      body: JSON.stringify({ encoding: "base64", content: bytesToBase64(bytes) })
    });
    const parsed = parseWorkspaceFileMetadata(payload);
    if (!parsed.ok) throw new CompanionClientError("protocol", parsed.message);
    return parsed.value;
  }

  private async workspaceRequest(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.url(path), init);
    } catch (error) {
      throw new CompanionClientError("transport", formatTransportError(error));
    }
    if (response.status === 204 && response.ok) return undefined;
    const payload = await readJson(response).catch((error: unknown) => {
      throw new CompanionClientError(
        "protocol",
        error instanceof Error ? error.message : "Companion returned invalid JSON."
      );
    });
    if (!response.ok) {
      const detail = readServerErrorDetail(payload, response.status);
      throw new CompanionClientError(
        response.status === 409 || response.status === 412 ? "conflict" : "server",
        detail.message,
        response.status,
        detail.code
      );
    }
    return payload;
  }

  private workspaceFilePath(path: string): string {
    const parsed = parseWorkspacePath(path);
    if (!parsed.ok) throw new CompanionClientError("protocol", parsed.message);
    return `${TYPR_COMPANION_ROUTES.workspaceFile}?path=${encodeURIComponent(parsed.value)}`;
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

export function isCompanionBaseUrlConfigured(
  storage: Pick<CompanionUrlStorage, "getItem"> | undefined = getDefaultStorage()
): boolean {
  if (COMPANION_BASE_URL_CONFIGURED_BY_BUILD) return true;
  if (!storage) return false;
  try {
    return Boolean(storage.getItem(COMPANION_BASE_URL_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function writeStoredCompanionBaseUrl(
  value: string,
  storage: Pick<CompanionUrlStorage, "setItem"> | undefined = getDefaultStorage()
): void {
  try {
    storage?.setItem(COMPANION_BASE_URL_STORAGE_KEY, normalizeCompanionBaseUrl(value));
  } catch {
    // IndexedDB remains the durable source when localStorage is unavailable.
  }
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
  if (!isRecord(value) || !isRecord(value.compile) || !Array.isArray(value.compile.engines) || !value.compile.engines.every((engine) => typeof engine === "string") || !isRecord(value.filesystem) || !isFilesystemCapability(value.filesystem) || !isRecord(value.lsp) || !Array.isArray(value.lsp.languages) || !value.lsp.languages.every((language) => typeof language === "string") || !isRecord(value.git) || typeof value.git.enabled !== "boolean" || !isRecord(value.terminal) || typeof value.terminal.enabled !== "boolean") {
    return invalid("Companion status response has invalid capabilities.");
  }
  return { ok: true, value: value as unknown as CompanionCapabilities };
}

export function parseWorkspaceFileList(value: unknown): Result<WorkspaceFileListResponse> {
  if (!isRecord(value) || typeof value.workspaceId !== "string" || value.workspaceId.length === 0 || !Array.isArray(value.files)) {
    return invalid("Companion workspace listing has an invalid shape.");
  }
  const files: WorkspaceFileMetadata[] = [];
  const paths = new Set<string>();
  for (const candidate of value.files) {
    const parsed = parseWorkspaceFileMetadata(candidate);
    if (!parsed.ok) return parsed;
    if (paths.has(parsed.value.path)) return invalid("Companion workspace listing contains duplicate paths.");
    paths.add(parsed.value.path);
    files.push(parsed.value);
  }
  return { ok: true, value: { workspaceId: value.workspaceId, files } };
}

export function parseWorkspaceFile(value: unknown, maxFileBytes?: number): Result<WorkspaceFileResponse> {
  const metadata = parseWorkspaceFileMetadata(value);
  if (!metadata.ok || !isRecord(value) || value.encoding !== "base64" || typeof value.content !== "string") {
    return invalid("Companion workspace file has invalid metadata or content.");
  }
  if (maxFileBytes !== undefined && metadata.value.size > maxFileBytes) {
    return invalid("Companion workspace file exceeds the advertised file-size limit.");
  }
  const expectedEncodedLength = Math.ceil(metadata.value.size / 3) * 4;
  const expectedPadding = metadata.value.size % 3 === 1 ? 2 : metadata.value.size % 3 === 2 ? 1 : 0;
  if (value.content.length !== expectedEncodedLength ||
      (expectedPadding === 2 && !value.content.endsWith("==")) ||
      (expectedPadding === 1 && (!value.content.endsWith("=") || value.content.endsWith("=="))) ||
      (expectedPadding === 0 && value.content.endsWith("=")) ||
      !isBase64(value.content)) {
    return invalid("Companion workspace file has invalid metadata or content.");
  }
  const bytes = base64ToBytes(value.content);
  if (bytes.byteLength !== metadata.value.size) {
    return invalid("Companion workspace file size does not match its content.");
  }
  return { ok: true, value: { ...metadata.value, encoding: "base64", content: value.content } };
}

export function parseWorkspaceFileMetadata(value: unknown): Result<WorkspaceFileMetadata> {
  if (!isRecord(value) || typeof value.path !== "string" || !parseWorkspacePath(value.path).ok || !isNonNegativeInteger(value.size) || !isFiniteNumber(value.modifiedAt) || value.modifiedAt < 0 || !isStrongEtag(value.etag)) {
    return invalid("Companion workspace file metadata is invalid.");
  }
  return { ok: true, value: value as unknown as WorkspaceFileMetadata };
}

function isFilesystemCapability(value: Record<string, unknown>): boolean {
  if (value.projectStorage === false) return true;
  return value.projectStorage === true && value.workspaceApiVersion === 1 &&
    typeof value.workspaceId === "string" && value.workspaceId.length > 0 && value.writable === true &&
    isRecord(value.limits) && isPositiveInteger(value.limits.maxFileBytes) &&
    isPositiveInteger(value.limits.maxEntries) && isPositiveInteger(value.limits.maxWorkspaceBytes) &&
    value.limits.maxFileBytes <= value.limits.maxWorkspaceBytes;
}

function parseWorkspacePath(value: string): Result<string> {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0") || value.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment === ".git")) {
    return invalid("Workspace path must be a safe relative POSIX path.");
  }
  return { ok: true, value };
}

function isCompileError(value: unknown): boolean {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string" && (value.path === undefined || typeof value.path === "string") && (value.line === undefined || isInteger(value.line)) && (value.column === undefined || isInteger(value.column));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBase64(value: unknown): value is string {
  if (typeof value !== "string" || value.length % 4 !== 0) return false;
  let paddingStarted = false;
  let padding = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 61) {
      paddingStarted = true;
      padding += 1;
      if (padding > 2 || index < value.length - 2) return false;
      continue;
    }
    if (paddingStarted || !(
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 || code === 47
    )) return false;
  }
  return true;
}

function isStrongEtag(value: unknown): value is string {
  return typeof value === "string" && /^"[^"\r\n]+"$/u.test(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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

function readServerErrorDetail(payload: unknown, status: number): { message: string; code?: string } {
  if (isRecord(payload) && isRecord(payload.error)) {
    return {
      message: typeof payload.error.message === "string"
        ? `Companion server error (${status}): ${payload.error.message}`
        : `Companion server error (${status}).`,
      ...(typeof payload.error.code === "string" ? { code: payload.error.code } : {})
    };
  }
  return { message: `Companion server error (${status}).` };
}

function formatTransportError(error: unknown): string {
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return `Typr Companion is unavailable${detail}`;
}
