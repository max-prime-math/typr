import type { CompileAssetFile } from "../compiler/types";
import type { TyprProjectRepository } from "../project/projectState";
import {
  createCompanionCompileRequest
} from "../compiler/latexCompilerProviders";
import {
  DEFAULT_TEXPRESSO_RENDER_DPI,
  MAX_TEXPRESSO_RENDER_DPI,
  TEXPRESSO_WS_PROTOCOL_VERSION,
  TEXPRESSO_WS_ROUTE,
  type TexpressoChangeMessage,
  type TexpressoDiagnostic,
  type TexpressoPageDescriptor,
  type TexpressoRange,
  type TexpressoServerMessage
} from "@max-prime-math/typr-companion-protocol/texpresso";
import type { ProjectFile } from "@max-prime-math/typr-companion-protocol";
import {
  resolveNativePreviewRasterThemeColors,
  type NativePreviewRasterThemeColors,
  type PreviewRasterThemeColors
} from "./previewRasterTheme";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const MAX_PAGE_BYTES = 16 * 1024 * 1024;
const COMPANION_WEBSOCKET_PROTOCOL = "typr-companion-v1";
const COMPANION_API_KEY_PROTOCOL_PREFIX = "typr-api-key.";

export const SHARP_TEXPRESSO_RENDER_DPI = MAX_TEXPRESSO_RENDER_DPI;

export type TexpressoLiveStatus =
  | "inactive"
  | "connecting"
  | "ready"
  | "updating"
  | "error"
  | "disconnected";

export interface TexpressoProjectSnapshot {
  mainFilePath: string;
  files: ProjectFile[];
  dpi: number;
  nativeTheme?: NativePreviewRasterThemeColors;
}

export interface TexpressoSourceChange {
  range: TexpressoRange;
  text: string;
}

export interface TexpressoLivePage extends TexpressoPageDescriptor {
  revision: number;
  blobUrl: string;
}

export interface TexpressoLiveSnapshot {
  status: TexpressoLiveStatus;
  statusDetail?: string;
  sessionGeneration: number;
  submittedRevision: number;
  latestCompletedRevision: number | null;
  lastGoodRevision: number | null;
  visibleRevision: number | null;
  pages: readonly TexpressoLivePage[];
  diagnostics: readonly TexpressoDiagnostic[];
  nativeThemeRendered: boolean;
  initialCompileMs?: number;
  lastTimings?: { updateMs: number; renderMs: number; serverMs: number };
}

interface WebSocketLike {
  binaryType: BinaryType;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
}

export interface TexpressoClientOptions {
  webSocketFactory?: (url: string, protocols?: string | string[]) => WebSocketLike;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  onSnapshot?: (snapshot: TexpressoLiveSnapshot) => void;
}

interface StagedRevision {
  expectedPageCount: number | null;
  descriptors: Map<number, TexpressoPageDescriptor>;
  pages: Map<number, TexpressoLivePage>;
}

interface PendingPageFrame {
  descriptor: TexpressoPageDescriptor;
  revision: number;
  discard: boolean;
}

export function createTexpressoProjectSnapshot({
  project,
  activeFilePath,
  activeSource,
  assets = [],
  dpi = DEFAULT_TEXPRESSO_RENDER_DPI,
  themeColors
}: {
  project: TyprProjectRepository;
  activeFilePath: string;
  activeSource: string;
  assets?: CompileAssetFile[];
  dpi?: number;
  themeColors?: PreviewRasterThemeColors;
}): TexpressoProjectSnapshot {
  const request = createCompanionCompileRequest({
    project,
    mainFilePath: activeFilePath,
    source: activeSource,
    assets,
    compileMode: "full",
    compileDriver: "pdftex_bibtex8"
  });

  return {
    mainFilePath: request.mainFilePath,
    files: request.files,
    dpi,
    nativeTheme: resolveNativePreviewRasterThemeColors(themeColors)
  };
}

/**
 * Returns a conservative reason the current upstream VFS cannot safely keep
 * this project live. TeXpresso resolves extensionless includes from disk at
 * startup but does not reliably associate later range edits with that VFS
 * buffer, which can otherwise produce a falsely ready stale preview.
 */
export function getTexpressoProjectCompatibilityIssue(
  project: TexpressoProjectSnapshot
): string | null {
  const extensionlessInclude = /\\(?:input|include)\s*\{\s*([^{}]+?)\s*\}/g;
  for (const file of project.files) {
    if (file.kind !== "text") {
      continue;
    }
    const sourceWithoutComments = file.content.replace(/(^|[^\\])%.*$/gm, "$1");
    for (const match of sourceWithoutComments.matchAll(extensionlessInclude)) {
      const target = match[1]?.trim() ?? "";
      const leaf = target.split("/").at(-1) ?? target;
      if (target && !leaf.includes(".")) {
        return `Live Preview currently requires explicit file extensions in \\input and \\include paths (${target} → ${target}.tex).`;
      }
    }
  }
  return null;
}

/** Converts a UTF-16 string offset to the zero-based position used by LSP. */
export function sourceOffsetToTexpressoPosition(source: string, offset: number): {
  line: number;
  character: number;
} {
  const boundedOffset = Math.max(0, Math.min(source.length, offset));
  let line = 0;
  let lineStart = 0;

  for (let index = 0; index < boundedOffset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return { line, character: boundedOffset - lineStart };
}

export function createTexpressoRangeFromOffsets(
  source: string,
  from: number,
  to: number
): TexpressoRange {
  return {
    start: sourceOffsetToTexpressoPosition(source, from),
    end: sourceOffsetToTexpressoPosition(source, to)
  };
}

export function createMinimalTexpressoChange(
  previous: string,
  next: string
): TexpressoSourceChange | null {
  if (previous === next) {
    return null;
  }

  let prefix = 0;
  const commonLength = Math.min(previous.length, next.length);
  while (prefix < commonLength && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) {
    prefix += 1;
  }

  let previousSuffix = previous.length;
  let nextSuffix = next.length;
  while (
    previousSuffix > prefix &&
    nextSuffix > prefix &&
    previous.charCodeAt(previousSuffix - 1) === next.charCodeAt(nextSuffix - 1)
  ) {
    previousSuffix -= 1;
    nextSuffix -= 1;
  }

  return {
    range: createTexpressoRangeFromOffsets(previous, prefix, previousSuffix),
    text: next.slice(prefix, nextSuffix)
  };
}

export function createTexpressoWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}${TEXPRESSO_WS_ROUTE}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function createTexpressoWebSocketProtocols(apiKey: string): string[] | undefined {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return undefined;
  }
  const encodedKey = btoa(trimmed)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return [
    COMPANION_WEBSOCKET_PROTOCOL,
    `${COMPANION_API_KEY_PROTOCOL_PREFIX}${encodedKey}`
  ];
}

export class TexpressoClient {
  private readonly webSocketFactory: (url: string, protocols?: string | string[]) => WebSocketLike;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly onSnapshot?: (snapshot: TexpressoLiveSnapshot) => void;
  private socket: WebSocketLike | null = null;
  private project: TexpressoProjectSnapshot | null = null;
  private sourceFiles = new Map<string, string>();
  private staged = new Map<number, StagedRevision>();
  private pendingPageFrame: PendingPageFrame | null = null;
  private retiredUrls = new Set<string>();
  private sessionReady = false;
  private sessionNativeThemeRendered = false;
  private intentionalClose = false;
  private visibleSessionGeneration = 0;
  private state: TexpressoLiveSnapshot = {
    status: "inactive",
    sessionGeneration: 0,
    submittedRevision: 0,
    latestCompletedRevision: null,
    lastGoodRevision: null,
    visibleRevision: null,
    pages: [],
    diagnostics: [],
    nativeThemeRendered: false
  };

  constructor(options: TexpressoClientOptions = {}) {
    this.webSocketFactory = options.webSocketFactory ?? (
      (url, protocols) => protocols ? new WebSocket(url, protocols) : new WebSocket(url)
    );
    this.createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
    this.onSnapshot = options.onSnapshot;
  }

  get snapshot(): TexpressoLiveSnapshot {
    return this.state;
  }

  start(baseUrl: string, project: TexpressoProjectSnapshot, apiKey = ""): void {
    this.closeSocket(false);
    this.clearStaged();
    this.project = cloneProject(project);
    this.sourceFiles = getTextFileMap(project.files);
    this.sessionReady = false;
    this.sessionNativeThemeRendered = false;
    this.pendingPageFrame = null;
    this.intentionalClose = false;
    const generation = this.state.sessionGeneration + 1;
    this.patchState({
      status: "connecting",
      statusDetail: `Opening ${TEXPRESSO_WS_ROUTE}`,
      sessionGeneration: generation,
      submittedRevision: 1,
      latestCompletedRevision: null,
      lastGoodRevision: null,
      diagnostics: [],
      initialCompileMs: undefined,
      lastTimings: undefined
    });

    let socket: WebSocketLike;
    try {
      socket = this.webSocketFactory(
        createTexpressoWebSocketUrl(baseUrl),
        createTexpressoWebSocketProtocols(apiKey)
      );
    } catch (error) {
      this.handleConnectionFailure(formatError(error));
      return;
    }

    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (this.socket !== socket || !this.project) {
        return;
      }
      this.sendJson({
        type: "initialize",
        protocolVersion: TEXPRESSO_WS_PROTOCOL_VERSION,
        revision: 1,
        mainFilePath: this.project.mainFilePath,
        render: {
          dpi: this.project.dpi,
          ...(this.project.nativeTheme ? { theme: this.project.nativeTheme } : {})
        },
        files: this.project.files
      });
      markDevelopmentTiming(`session-${generation}-socket-open`);
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => {
      if (this.socket === socket && !this.intentionalClose) {
        this.patchState({ statusDetail: "The TeXpresso WebSocket reported a transport error." });
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.sessionReady = false;
      this.clearStaged();
      if (!this.intentionalClose && this.state.status !== "error") {
        this.patchState({
          status: "disconnected",
          statusDetail: "TeXpresso disconnected. The last good preview is retained."
        });
      }
    };
  }

  sendSourceChanges(path: string, changes: readonly TexpressoSourceChange[]): boolean {
    if (!this.sessionReady || !this.socket || this.socket.readyState !== 1 || changes.length === 0) {
      return false;
    }
    const currentSource = this.sourceFiles.get(path);
    if (currentSource === undefined) {
      return false;
    }

    let nextSource = currentSource;
    for (const change of changes) {
      const nextRevision = this.state.submittedRevision + 1;
      const message: TexpressoChangeMessage = {
        type: "change",
        revision: nextRevision,
        path,
        range: change.range,
        text: change.text
      };
      nextSource = applyTexpressoChange(nextSource, change);
      markDevelopmentTiming(`edit-${nextRevision}`);
      this.sendJson(message);
      markDevelopmentTiming(`send-${nextRevision}`);
      this.patchState({
        status: "updating",
        statusDetail: `Rendering revision ${nextRevision}`,
        submittedRevision: nextRevision
      });
    }
    this.sourceFiles.set(path, nextSource);
    return true;
  }

  /**
   * Reconciles changes made outside the active editor. Existing text files are
   * updated incrementally; structure, binary, or root changes require restart.
   */
  synchronizeProject(project: TexpressoProjectSnapshot): "synchronized" | "restart-required" | "queued" {
    if (!this.project || !this.sessionReady) {
      this.project = cloneProject(project);
      return "queued";
    }
    if (
      project.mainFilePath !== this.project.mainFilePath ||
      project.dpi !== this.project.dpi ||
      !sameNativeTheme(project.nativeTheme, this.project.nativeTheme)
    ) {
      return "restart-required";
    }

    const currentFiles = new Map(this.project.files.map((file) => [file.path, file]));
    const nextFiles = new Map(project.files.map((file) => [file.path, file]));
    if (currentFiles.size !== nextFiles.size) {
      return "restart-required";
    }
    for (const [path, current] of currentFiles) {
      const next = nextFiles.get(path);
      if (!next || current.kind !== next.kind) {
        return "restart-required";
      }
      if (current.kind === "binary" && next.kind === "binary" && current.content !== next.content) {
        return "restart-required";
      }
    }

    for (const file of project.files) {
      if (file.kind !== "text") {
        continue;
      }
      const previous = this.sourceFiles.get(file.path);
      if (previous === undefined) {
        return "restart-required";
      }
      const change = createMinimalTexpressoChange(previous, file.content);
      if (change && !this.sendSourceChanges(file.path, [change])) {
        return "queued";
      }
    }

    this.project = cloneProject(project);
    return "synchronized";
  }

  acknowledgeVisibleRevision(sessionGeneration: number, revision: number): void {
    if (
      sessionGeneration !== this.visibleSessionGeneration ||
      revision !== this.state.visibleRevision
    ) {
      return;
    }
    this.revokeUrls(this.retiredUrls);
    this.retiredUrls.clear();
    markDevelopmentTiming(`dom-${sessionGeneration}-${revision}`);
    measureDevelopmentTiming(sessionGeneration, revision);
  }

  stop(options: {
    preserveVisible?: boolean;
    detail?: string;
    status?: "inactive" | "disconnected";
  } = {}): void {
    this.intentionalClose = true;
    if (this.socket?.readyState === 1) {
      this.sendJson({ type: "shutdown" });
    }
    this.closeSocket(true);
    this.sessionReady = false;
    this.clearStaged();
    this.project = null;
    this.sourceFiles.clear();
    if (options.preserveVisible) {
      this.patchState({ status: options.status ?? "inactive", statusDetail: options.detail });
    } else {
      this.clearVisible();
      this.patchState({
        status: "inactive",
        statusDetail: options.detail,
        submittedRevision: 0,
        latestCompletedRevision: null,
        lastGoodRevision: null,
        visibleRevision: null,
        diagnostics: []
      });
    }
  }

  dispose(): void {
    this.stop();
    this.revokeUrls(this.retiredUrls);
    this.retiredUrls.clear();
  }

  private handleMessage(data: unknown): void {
    if (typeof data === "string") {
      if (this.pendingPageFrame) {
        this.protocolFailure("Page metadata was not immediately followed by its PNG frame.");
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch {
        this.protocolFailure("TeXpresso sent malformed JSON.");
        return;
      }
      const message = parseServerMessage(value);
      if (!message) {
        this.protocolFailure("TeXpresso sent an invalid control message.");
        return;
      }
      this.handleControlMessage(message);
      return;
    }

    if (!(data instanceof ArrayBuffer)) {
      this.protocolFailure("TeXpresso sent an unsupported binary frame.");
      return;
    }
    this.handleBinaryFrame(new Uint8Array(data));
  }

  private handleControlMessage(message: TexpressoServerMessage): void {
    switch (message.type) {
      case "session-ready": {
        const acknowledgedTheme = (message.render as {
          dpi: number;
          theme?: NativePreviewRasterThemeColors;
        }).theme;
        if (
          message.protocolVersion !== TEXPRESSO_WS_PROTOCOL_VERSION ||
          message.revision !== 1 ||
          message.render.dpi !== this.project?.dpi
        ) {
          this.protocolFailure("TeXpresso session initialization did not match the request.");
          return;
        }
        this.sessionReady = true;
        this.sessionNativeThemeRendered = Boolean(
          this.project?.nativeTheme && sameNativeTheme(acknowledgedTheme, this.project.nativeTheme)
        );
        this.patchState({
          status: "updating",
          statusDetail: "Rendering initial live preview",
          initialCompileMs: message.initialCompileMs
        });
        markDevelopmentTiming(`session-${this.state.sessionGeneration}-ready`);
        return;
      }
      case "document": {
        if (!validRevision(message.revision) || !validPageCount(message.pageCount)) {
          this.protocolFailure("TeXpresso sent invalid document metadata.");
          return;
        }
        const staged = this.getStaged(message.revision);
        staged.expectedPageCount = message.pageCount;
        staged.descriptors.clear();
        for (const descriptor of message.pages) {
          if (!isValidPageDescriptor(descriptor) || staged.descriptors.has(descriptor.page)) {
            this.protocolFailure("TeXpresso sent invalid or duplicate page descriptors.");
            return;
          }
          staged.descriptors.set(descriptor.page, descriptor);
        }
        if (staged.descriptors.size !== message.pageCount) {
          this.protocolFailure("TeXpresso document metadata did not describe every page.");
        }
        return;
      }
      case "page": {
        if (!isValidPageDescriptor(message)) {
          this.protocolFailure("TeXpresso sent invalid page metadata.");
          return;
        }
        const expected = this.getStaged(message.revision).descriptors.get(message.page);
        if (expected && !sameDescriptor(expected, message)) {
          this.protocolFailure("TeXpresso page metadata did not match its document descriptor.");
          return;
        }
        this.pendingPageFrame = {
          revision: message.revision,
          descriptor: toPageDescriptor(message),
          discard: message.revision < this.state.submittedRevision
        };
        return;
      }
      case "revision-complete":
        this.completeRevision(message);
        return;
      case "compile-error": {
        this.discardStaged(message.revision);
        if (message.revision < this.state.submittedRevision) {
          return;
        }
        const compileErrorDetail = formatDiagnostics(message.diagnostics) || "TeXpresso could not compile this revision.";
        // A native-session timeout is operational, not a source diagnostic.
        // Some TeXpresso builds can surface it through the compile-error path,
        // so classify it as reconnectable instead of leaving the client stuck.
        if (isNativeSessionFailure(compileErrorDetail)) {
          this.sessionFailure(compileErrorDetail);
          return;
        }
        this.patchState({
          status: "error",
          statusDetail: compileErrorDetail,
          latestCompletedRevision: maxRevision(this.state.latestCompletedRevision, message.revision),
          lastGoodRevision: message.lastGoodRevision,
          diagnostics: message.diagnostics
        });
        return;
      }
      case "protocol-error":
        if (message.fatal) {
          this.protocolFailure(message.message);
        } else {
          this.patchState({ status: "error", statusDetail: message.message });
        }
        return;
      case "session-error":
        this.sessionFailure(message.message);
        return;
      case "session-closed":
        if (!this.intentionalClose) {
          this.patchState({
            status: "disconnected",
            statusDetail: "TeXpresso closed the session. The last good preview is retained."
          });
        }
        return;
      case "revision-started":
      case "revision-applied":
        return;
    }
  }

  private handleBinaryFrame(bytes: Uint8Array): void {
    const pending = this.pendingPageFrame;
    this.pendingPageFrame = null;
    if (!pending) {
      this.protocolFailure("TeXpresso sent a PNG frame without page metadata.");
      return;
    }
    if (
      bytes.byteLength !== pending.descriptor.byteLength ||
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_PAGE_BYTES ||
      !hasPngSignature(bytes)
    ) {
      this.protocolFailure("TeXpresso sent a malformed or incorrectly sized PNG frame.");
      return;
    }
    if (pending.discard) {
      return;
    }
    const staged = this.getStaged(pending.revision);
    const previous = staged.pages.get(pending.descriptor.page);
    if (previous) {
      this.protocolFailure("TeXpresso sent the same page twice for one revision.");
      return;
    }
    const pngBuffer = Uint8Array.from(bytes).buffer;
    const blobUrl = this.createObjectUrl(new Blob([pngBuffer], { type: pending.descriptor.mimeType }));
    staged.pages.set(pending.descriptor.page, {
      ...pending.descriptor,
      revision: pending.revision,
      blobUrl
    });
  }

  private completeRevision(message: Extract<TexpressoServerMessage, { type: "revision-complete" }>): void {
    if (message.revision < this.state.submittedRevision) {
      this.discardStaged(message.revision);
      return;
    }
    const staged = this.staged.get(message.revision);
    if (
      !staged ||
      staged.expectedPageCount !== message.pageCount ||
      staged.pages.size !== message.pageCount ||
      message.renderedPages !== message.pageCount
    ) {
      this.protocolFailure("TeXpresso completed a revision before every page was received.");
      return;
    }
    const pages = [...staged.pages.values()].sort((left, right) => left.page - right.page);
    if (pages.some((page, index) => page.page !== index)) {
      this.protocolFailure("TeXpresso completed a revision with non-contiguous pages.");
      return;
    }

    this.staged.delete(message.revision);
    for (const page of this.state.pages) {
      this.retiredUrls.add(page.blobUrl);
    }
    this.visibleSessionGeneration = this.state.sessionGeneration;
    this.discardStagedBefore(message.revision);
    this.patchState({
      status: "ready",
      statusDetail: `Revision ${message.revision} · ${message.pageCount} page${message.pageCount === 1 ? "" : "s"}`,
      latestCompletedRevision: maxRevision(this.state.latestCompletedRevision, message.revision),
      lastGoodRevision: message.lastGoodRevision,
      visibleRevision: message.revision,
      pages,
      diagnostics: [],
      nativeThemeRendered: this.sessionNativeThemeRendered,
      lastTimings: message.timings
    });
    markDevelopmentTiming(`complete-${this.state.sessionGeneration}-${message.revision}`);
  }

  private getStaged(revision: number): StagedRevision {
    let staged = this.staged.get(revision);
    if (!staged) {
      staged = { expectedPageCount: null, descriptors: new Map(), pages: new Map() };
      this.staged.set(revision, staged);
    }
    return staged;
  }

  private discardStaged(revision: number): void {
    const staged = this.staged.get(revision);
    if (!staged) {
      return;
    }
    this.revokeUrls(new Set([...staged.pages.values()].map((page) => page.blobUrl)));
    this.staged.delete(revision);
  }

  private discardStagedBefore(revision: number): void {
    for (const stagedRevision of [...this.staged.keys()]) {
      if (stagedRevision < revision) {
        this.discardStaged(stagedRevision);
      }
    }
  }

  private clearStaged(): void {
    for (const revision of [...this.staged.keys()]) {
      this.discardStaged(revision);
    }
    this.pendingPageFrame = null;
  }

  private clearVisible(): void {
    this.revokeUrls(new Set(this.state.pages.map((page) => page.blobUrl)));
    this.revokeUrls(this.retiredUrls);
    this.retiredUrls.clear();
    this.state = { ...this.state, pages: [] };
  }

  private protocolFailure(detail: string): void {
    this.clearStaged();
    this.patchState({ status: "error", statusDetail: detail });
    this.intentionalClose = true;
    this.closeSocket(true);
    this.sessionReady = false;
  }

  private handleConnectionFailure(detail: string): void {
    this.patchState({
      status: "disconnected",
      statusDetail: detail || "Unable to open the TeXpresso WebSocket."
    });
  }

  private sessionFailure(detail: string): void {
    this.clearStaged();
    this.intentionalClose = true;
    this.closeSocket(true);
    this.sessionReady = false;
    this.patchState({
      status: "disconnected",
      statusDetail: `${detail} Reinitializing the complete current project.`
    });
  }

  private sendJson(message: object): void {
    if (!this.socket || this.socket.readyState !== 1) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private closeSocket(detachHandlers: boolean): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }
    if (detachHandlers) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    try {
      socket.close(1000, "Typr live preview session ended");
    } catch {
      // The browser may already have torn down the transport.
    }
  }

  private revokeUrls(urls: Set<string>): void {
    for (const url of urls) {
      this.revokeObjectUrl(url);
    }
  }

  private patchState(patch: Partial<TexpressoLiveSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.onSnapshot?.(this.state);
  }
}

function cloneProject(project: TexpressoProjectSnapshot): TexpressoProjectSnapshot {
  return {
    ...project,
    files: project.files.map((file) => ({ ...file })),
    nativeTheme: project.nativeTheme ? { ...project.nativeTheme } : undefined
  };
}

function sameNativeTheme(
  left: NativePreviewRasterThemeColors | undefined,
  right: NativePreviewRasterThemeColors | undefined
): boolean {
  return left?.background === right?.background && left?.foreground === right?.foreground;
}

function getTextFileMap(files: readonly ProjectFile[]): Map<string, string> {
  return new Map(
    files
      .filter((file): file is Extract<ProjectFile, { kind: "text" }> => file.kind === "text")
      .map((file) => [file.path, file.content])
  );
}

function applyTexpressoChange(source: string, change: TexpressoSourceChange): string {
  const from = positionToOffset(source, change.range.start.line, change.range.start.character);
  const to = positionToOffset(source, change.range.end.line, change.range.end.character);
  if (from > to) {
    throw new Error("TeXpresso source change range is reversed.");
  }
  return `${source.slice(0, from)}${change.text}${source.slice(to)}`;
}

function positionToOffset(source: string, line: number, character: number): number {
  let currentLine = 0;
  let lineStart = 0;
  while (currentLine < line) {
    const newline = source.indexOf("\n", lineStart);
    if (newline < 0) {
      throw new Error("TeXpresso source change line is outside the file.");
    }
    lineStart = newline + 1;
    currentLine += 1;
  }
  const lineEnd = source.indexOf("\n", lineStart);
  const maxCharacter = (lineEnd < 0 ? source.length : lineEnd) - lineStart;
  if (character < 0 || character > maxCharacter) {
    throw new Error("TeXpresso source change character is outside the line.");
  }
  return lineStart + character;
}

function parseServerMessage(value: unknown): TexpressoServerMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }
  switch (value.type) {
    case "session-ready":
      return typeof value.protocolVersion === "number" && typeof value.sessionId === "string" &&
        validRevision(value.revision) && typeof value.processId === "number" &&
        isRecord(value.render) && typeof value.render.dpi === "number" &&
        typeof value.initialCompileMs === "number" ? value as unknown as TexpressoServerMessage : null;
    case "revision-started":
    case "revision-applied":
      return typeof value.sessionId === "string" && validRevision(value.revision)
        ? value as unknown as TexpressoServerMessage
        : null;
    case "document":
      return typeof value.sessionId === "string" && validRevision(value.revision) &&
        validRevision(value.lastGoodRevision) && validPageCount(value.pageCount) &&
        Array.isArray(value.pages) && value.pages.every(isValidPageDescriptor)
        ? value as unknown as TexpressoServerMessage
        : null;
    case "page":
      return typeof value.sessionId === "string" && validRevision(value.revision) && isValidPageDescriptor(value)
        ? value as unknown as TexpressoServerMessage
        : null;
    case "revision-complete":
      return typeof value.sessionId === "string" && validRevision(value.revision) &&
        validRevision(value.lastGoodRevision) && validPageCount(value.pageCount) &&
        Number.isInteger(value.renderedPages) && isTimings(value.timings)
        ? value as unknown as TexpressoServerMessage
        : null;
    case "compile-error":
      return typeof value.sessionId === "string" && validRevision(value.revision) &&
        (value.lastGoodRevision === null || validRevision(value.lastGoodRevision)) &&
        Array.isArray(value.diagnostics) && value.diagnostics.every(isDiagnostic) &&
        typeof value.log === "string" && typeof value.updateMs === "number"
        ? value as unknown as TexpressoServerMessage
        : null;
    case "protocol-error":
      return typeof value.code === "string" && typeof value.message === "string" && typeof value.fatal === "boolean"
        ? value as unknown as TexpressoServerMessage
        : null;
    case "session-error":
      return typeof value.code === "string" && typeof value.message === "string"
        ? value as unknown as TexpressoServerMessage
        : null;
    case "session-closed":
      return typeof value.reason === "string" ? value as unknown as TexpressoServerMessage : null;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validPageCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 64;
}

function isValidPageDescriptor(value: unknown): value is TexpressoPageDescriptor {
  return isRecord(value) && Number.isInteger(value.page) && Number(value.page) >= 0 &&
    Number.isFinite(value.width) && Number(value.width) > 0 &&
    Number.isFinite(value.height) && Number(value.height) > 0 &&
    Number.isInteger(value.dpi) && Number(value.dpi) >= 72 && Number(value.dpi) <= 300 &&
    value.mimeType === "image/png" && Number.isInteger(value.byteLength) &&
    Number(value.byteLength) > 0 && Number(value.byteLength) <= MAX_PAGE_BYTES;
}

function isDiagnostic(value: unknown): boolean {
  return isRecord(value) && ["error", "warning", "info"].includes(String(value.severity)) &&
    typeof value.message === "string" &&
    (value.path === undefined || typeof value.path === "string") &&
    (value.line === undefined || Number.isInteger(value.line)) &&
    (value.column === undefined || Number.isInteger(value.column));
}

function isTimings(value: unknown): boolean {
  return isRecord(value) && typeof value.updateMs === "number" &&
    typeof value.renderMs === "number" && typeof value.serverMs === "number";
}

function toPageDescriptor(value: TexpressoPageDescriptor): TexpressoPageDescriptor {
  return {
    page: value.page,
    width: value.width,
    height: value.height,
    dpi: value.dpi,
    mimeType: value.mimeType,
    byteLength: value.byteLength
  };
}

function sameDescriptor(left: TexpressoPageDescriptor, right: TexpressoPageDescriptor): boolean {
  return left.page === right.page && left.width === right.width && left.height === right.height &&
    left.dpi === right.dpi && left.mimeType === right.mimeType && left.byteLength === right.byteLength;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function formatDiagnostics(diagnostics: readonly TexpressoDiagnostic[]): string {
  const diagnostic = diagnostics.find((entry) => entry.severity === "error") ?? diagnostics[0];
  if (!diagnostic) {
    return "";
  }
  const location = diagnostic.path
    ? `${diagnostic.path}${diagnostic.line === undefined ? "" : `:${diagnostic.line}${diagnostic.column === undefined ? "" : `:${diagnostic.column}`}`}`
    : "";
  return `${location ? `${location} · ` : ""}${diagnostic.message}`;
}

function isNativeSessionFailure(detail: string): boolean {
  return /timed out waiting for texpresso flush|texpresso exited unexpectedly/i.test(detail);
}

function maxRevision(current: number | null, next: number): number {
  return current === null ? next : Math.max(current, next);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to open the TeXpresso WebSocket.";
}

function markDevelopmentTiming(label: string): void {
  if (import.meta.env.DEV && typeof performance !== "undefined") {
    performance.mark(`typr-texpresso-${label}`);
  }
}

function measureDevelopmentTiming(sessionGeneration: number, revision: number): void {
  if (!import.meta.env.DEV || typeof performance === "undefined") {
    return;
  }
  const start = `typr-texpresso-edit-${revision}`;
  const complete = `typr-texpresso-complete-${sessionGeneration}-${revision}`;
  const dom = `typr-texpresso-dom-${sessionGeneration}-${revision}`;
  if (performance.getEntriesByName(start).length > 0) {
    performance.measure(`typr-texpresso-edit-to-complete-${revision}`, start, complete);
    performance.measure(`typr-texpresso-edit-to-visible-${revision}`, start, dom);
  }
  const socketOpen = `typr-texpresso-session-${sessionGeneration}-socket-open`;
  if (revision === 1 && performance.getEntriesByName(socketOpen).length > 0) {
    performance.measure(`typr-texpresso-session-startup-${sessionGeneration}`, socketOpen, dom);
  }
}
