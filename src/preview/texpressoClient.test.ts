import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import {
  createProjectStorageFromSnapshot,
  getSelectedProjectRepository,
  writeProjectFile
} from "../project/projectState";
import {
  TexpressoClient,
  createMinimalTexpressoChange,
  createTexpressoProjectSnapshot,
  createTexpressoRangeFromOffsets,
  createTexpressoWebSocketProtocols,
  createTexpressoWebSocketUrl,
  getTexpressoProjectCompatibilityIssue,
  sourceOffsetToTexpressoPosition,
  type TexpressoLiveSnapshot
} from "./texpressoClient";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class MockWebSocket {
  binaryType: BinaryType = "blob";
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];

  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(String(data));
  }

  close() {
    this.readyState = 3;
  }

  json(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }

  binary(bytes = PNG) {
    const copy = Uint8Array.from(bytes);
    this.onmessage?.({ data: copy.buffer } as MessageEvent);
  }
}

function fixtureProject() {
  const storage = createProjectStorageFromSnapshot(createDefaultSnapshot());
  const initial = getSelectedProjectRepository(storage);
  if (!initial) throw new Error("Missing fixture project");
  return writeProjectFile(
    writeProjectFile(
      writeProjectFile(
        initial,
        "main.tex",
        "\\documentclass{article}\n\\begin{document}\n\\input{sections/one.tex}\n\\includegraphics{assets/pixel.png}\n\\end{document}"
      ),
      "sections/one.tex",
      "Hello 😀"
    ),
    "assets/pixel.png",
    new Uint8Array([0, 1, 2, 255])
  );
}

function createHarness() {
  const sockets: MockWebSocket[] = [];
  const connections: Array<{ url: string; protocols?: string | string[] }> = [];
  const snapshots: TexpressoLiveSnapshot[] = [];
  const revoked: string[] = [];
  let urlIndex = 0;
  const client = new TexpressoClient({
    webSocketFactory: (url, protocols) => {
      connections.push({ url, protocols });
      const socket = new MockWebSocket();
      sockets.push(socket);
      return socket;
    },
    createObjectUrl: () => `blob:test-${++urlIndex}`,
    revokeObjectUrl: (url) => revoked.push(url),
    onSnapshot: (snapshot) => snapshots.push(snapshot)
  });
  return { client, connections, sockets, snapshots, revoked };
}

function projectSnapshot() {
  return createTexpressoProjectSnapshot({
    project: fixtureProject(),
    activeFilePath: "sections/one.tex",
    activeSource: "Unsaved 😀 chapter"
  });
}

function ready(socket: MockWebSocket, initialCompileMs = 7) {
  socket.json({
    type: "session-ready",
    protocolVersion: 1,
    sessionId: "session-1",
    revision: 1,
    processId: 42,
    render: { dpi: 240 },
    initialCompileMs
  });
}

function emitRevision(socket: MockWebSocket, revision: number, pageCount = 1, dpi = 240) {
  const pages = Array.from({ length: pageCount }, (_, page) => ({
    page,
    width: 1632,
    height: 2112,
    dpi,
    mimeType: "image/png",
    byteLength: PNG.byteLength
  }));
  socket.json({
    type: "document",
    sessionId: "session-1",
    revision,
    lastGoodRevision: revision,
    pageCount,
    pages
  });
  for (const page of pages) {
    socket.json({ type: "page", sessionId: "session-1", revision, ...page });
    socket.binary();
  }
  socket.json({
    type: "revision-complete",
    sessionId: "session-1",
    revision,
    lastGoodRevision: revision,
    pageCount,
    renderedPages: pageCount,
    timings: { updateMs: 6, renderMs: 49, serverMs: 55 }
  });
}

describe("TeXpresso frontend client", () => {
  it("initializes the dependency-scoped project with the detected root, unsaved source, binary assets, and 240 DPI", () => {
    const harness = createHarness();
    const project = projectSnapshot();
    expect(project.mainFilePath).toBe("main.tex");
    expect(project.dpi).toBe(240);
    expect(project.files.find((file) => file.path === "sections/one.tex")).toMatchObject({
      kind: "text",
      content: "Unsaved 😀 chapter"
    });
    expect(project.files.find((file) => file.path === "assets/pixel.png")).toMatchObject({
      kind: "binary",
      encoding: "base64",
      content: "AAEC/w=="
    });

    harness.client.start("http://127.0.0.1:8484", project);
    harness.sockets[0]!.open();
    const initialize = JSON.parse(harness.sockets[0]!.sent[0]!);
    expect(initialize).toMatchObject({
      type: "initialize",
      protocolVersion: 1,
      revision: 1,
      mainFilePath: "main.tex",
      render: { dpi: 240 }
    });
    expect(initialize.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(["main.tex", "sections/one.tex", "assets/pixel.png"])
    );
  });

  it("negotiates a 300 DPI native dark raster and enables it only after a complete revision", () => {
    const harness = createHarness();
    const project = createTexpressoProjectSnapshot({
      project: fixtureProject(),
      activeFilePath: "sections/one.tex",
      activeSource: "Unsaved chapter",
      dpi: 300,
      themeColors: { background: "#1e1e2e", foreground: "#cdd6f4" }
    });
    harness.client.start("http://localhost:8484", project);
    const socket = harness.sockets[0]!;
    socket.open();
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({
      render: { dpi: 300, theme: { background: 0x1e1e2e, foreground: 0xcdd6f4 } }
    });
    socket.json({
      type: "session-ready",
      protocolVersion: 1,
      sessionId: "session-1",
      revision: 1,
      processId: 42,
      render: { dpi: 300, theme: { background: 0x1e1e2e, foreground: 0xcdd6f4 } },
      initialCompileMs: 7
    });
    expect(harness.client.snapshot.nativeThemeRendered).toBe(false);
    emitRevision(socket, 1, 1, 300);
    expect(harness.client.snapshot.nativeThemeRendered).toBe(true);
    expect(harness.client.snapshot.nativeTheme).toEqual({
      background: 0x1e1e2e,
      foreground: 0xcdd6f4
    });
  });

  it("converts UTF-16 offsets correctly and creates a minimal external-file replacement", () => {
    const source = "a😀b\nsecond";
    expect(sourceOffsetToTexpressoPosition(source, 3)).toEqual({ line: 0, character: 3 });
    expect(createTexpressoRangeFromOffsets(source, 1, 3)).toEqual({
      start: { line: 0, character: 1 },
      end: { line: 0, character: 3 }
    });
    expect(createMinimalTexpressoChange("alpha\nbeta", "alpha\nBETa")).toEqual({
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } },
      text: "BET"
    });
  });

  it("rejects extensionless includes that TeXpresso cannot update reliably", () => {
    const supported = projectSnapshot();
    expect(getTexpressoProjectCompatibilityIssue(supported)).toBeNull();
    const unsupported = {
      ...supported,
      files: supported.files.map((file) => file.path === "main.tex" && file.kind === "text"
        ? { ...file, content: file.content.replace("sections/one.tex", "sections/one") }
        : file)
    };
    expect(getTexpressoProjectCompatibilityIssue(unsupported)).toContain("explicit file extensions");
  });

  it("sends prompt incremental changes with monotonically increasing revisions", () => {
    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot());
    const socket = harness.sockets[0]!;
    socket.open();
    ready(socket);
    expect(harness.client.sendSourceChanges("sections/one.tex", [
      { range: { start: { line: 0, character: 8 }, end: { line: 0, character: 10 } }, text: "X" },
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: "!" }
    ])).toBe(true);
    expect(socket.sent.slice(1).map((message) => JSON.parse(message).revision)).toEqual([2, 3]);
    expect(harness.client.snapshot.submittedRevision).toBe(3);
  });

  it("pairs metadata with the next binary frame and publishes only at revision-complete", () => {
    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot());
    const socket = harness.sockets[0]!;
    socket.open();
    ready(socket);
    socket.json({
      type: "document", sessionId: "session-1", revision: 1, lastGoodRevision: 1,
      pageCount: 1,
      pages: [{ page: 0, width: 100, height: 200, dpi: 240, mimeType: "image/png", byteLength: 8 }]
    });
    socket.json({
      type: "page", sessionId: "session-1", revision: 1,
      page: 0, width: 100, height: 200, dpi: 240, mimeType: "image/png", byteLength: 8
    });
    socket.binary();
    expect(harness.client.snapshot.pages).toEqual([]);
    socket.json({
      type: "revision-complete", sessionId: "session-1", revision: 1, lastGoodRevision: 1,
      pageCount: 1, renderedPages: 1, timings: { updateMs: 1, renderMs: 2, serverMs: 3 }
    });
    expect(harness.client.snapshot).toMatchObject({
      status: "ready",
      visibleRevision: 1,
      latestCompletedRevision: 1,
      lastGoodRevision: 1
    });
    expect(harness.client.snapshot.pages[0]).toMatchObject({ page: 0, blobUrl: "blob:test-1" });
  });

  it("suppresses stale completed output when a newer revision has been submitted", () => {
    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot());
    const socket = harness.sockets[0]!;
    socket.open();
    ready(socket);
    harness.client.sendSourceChanges("sections/one.tex", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: "a" }
    ]);
    harness.client.sendSourceChanges("sections/one.tex", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: "b" }
    ]);
    emitRevision(socket, 2);
    expect(harness.client.snapshot.visibleRevision).toBeNull();
    emitRevision(socket, 3);
    expect(harness.client.snapshot.visibleRevision).toBe(3);
  });

  it("keeps the last-good pages on compile error and replaces them after recovery", () => {
    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot());
    const socket = harness.sockets[0]!;
    socket.open();
    ready(socket);
    emitRevision(socket, 1);
    harness.client.sendSourceChanges("sections/one.tex", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: "{" }
    ]);
    socket.json({
      type: "compile-error",
      sessionId: "session-1",
      revision: 2,
      lastGoodRevision: 1,
      diagnostics: [{ severity: "error", message: "Runaway argument", path: "sections/one.tex", line: 1, column: 1 }],
      log: "! Runaway argument",
      updateMs: 4
    });
    expect(harness.client.snapshot).toMatchObject({ status: "error", visibleRevision: 1, lastGoodRevision: 1 });
    expect(harness.client.snapshot.pages[0]?.blobUrl).toBe("blob:test-1");

    harness.client.sendSourceChanges("sections/one.tex", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, text: "" }
    ]);
    emitRevision(socket, 3, 2);
    expect(harness.client.snapshot).toMatchObject({ status: "ready", visibleRevision: 3, lastGoodRevision: 3 });
    expect(harness.client.snapshot.pages).toHaveLength(2);
    expect(harness.client.snapshot.diagnostics).toEqual([]);
    harness.client.acknowledgeVisibleRevision(1, 3);
    expect(harness.revoked).toContain("blob:test-1");
  });

  it("retains visible pages on disconnect, reinitializes at revision 1, and cleans URLs on disposal", () => {
    const harness = createHarness();
    const project = projectSnapshot();
    harness.client.start("http://localhost:8484", project);
    const first = harness.sockets[0]!;
    first.open();
    ready(first);
    emitRevision(first, 1);
    first.onclose?.({} as CloseEvent);
    expect(harness.client.snapshot).toMatchObject({ status: "disconnected", visibleRevision: 1 });
    expect(harness.client.snapshot.pages).toHaveLength(1);

    harness.client.start("http://localhost:8484", project);
    const second = harness.sockets[1]!;
    second.open();
    expect(JSON.parse(second.sent[0]!)).toMatchObject({ type: "initialize", revision: 1 });
    ready(second);
    emitRevision(second, 1, 2);
    expect(harness.client.snapshot.pages).toHaveLength(2);
    harness.client.acknowledgeVisibleRevision(2, 1);
    expect(harness.revoked).toContain("blob:test-1");
    harness.client.dispose();
    expect(harness.revoked).toEqual(expect.arrayContaining(["blob:test-2", "blob:test-3"]));
  });

  it("terminates safely when framing is malformed", () => {
    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot());
    const socket = harness.sockets[0]!;
    socket.open();
    ready(socket);
    socket.binary();
    expect(harness.client.snapshot.status).toBe("error");
    expect(harness.client.snapshot.statusDetail).toContain("without page metadata");
  });

  it("can start again after cleanup for React Strict Mode effect replay", () => {
    const harness = createHarness();
    const project = projectSnapshot();
    harness.client.start("http://localhost:8484", project);
    harness.client.dispose();
    harness.client.start("http://localhost:8484", project);
    expect(harness.sockets).toHaveLength(2);
    expect(harness.client.snapshot.status).toBe("connecting");
  });

  it("treats a dead server session as reconnectable while retaining visible pages", () => {
    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot());
    const socket = harness.sockets[0]!;
    socket.open();
    ready(socket);
    emitRevision(socket, 1);
    socket.json({
      type: "session-error",
      sessionId: "session-1",
      code: "session-failed",
      message: "Timed out waiting for a TeXpresso flush.",
      revision: 2
    });
    expect(harness.client.snapshot).toMatchObject({
      status: "disconnected",
      visibleRevision: 1
    });
    expect(harness.client.snapshot.pages).toHaveLength(1);
  });

  it("treats a native flush timeout surfaced as a compile error as reconnectable", () => {
    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot());
    const socket = harness.sockets[0]!;
    socket.open();
    ready(socket);
    emitRevision(socket, 1);
    socket.json({
      type: "compile-error",
      sessionId: "session-1",
      revision: 2,
      lastGoodRevision: 1,
      diagnostics: [{ severity: "error", message: "Timed out waiting for TeXpresso flush after 30000 ms." }],
      log: "",
      updateMs: 30_000
    });
    expect(harness.client.snapshot).toMatchObject({
      status: "disconnected",
      visibleRevision: 1
    });
  });

  it("constructs ws and wss endpoint URLs without changing the private route", () => {
    expect(createTexpressoWebSocketUrl("http://localhost:8484")).toBe("ws://localhost:8484/ws/texpresso");
    expect(createTexpressoWebSocketUrl("https://companion.example/base/")).toBe("wss://companion.example/base/ws/texpresso");
  });

  it("authenticates WebSockets with a non-echoed API-key subprotocol", () => {
    const apiKey = `typr_${"z".repeat(43)}`;
    expect(createTexpressoWebSocketProtocols(" ")).toBeUndefined();
    const protocols = createTexpressoWebSocketProtocols(apiKey);
    expect(protocols?.[0]).toBe("typr-companion-v1");
    expect(protocols?.[1]).toMatch(/^typr-api-key\.[A-Za-z0-9_-]+$/);

    const encoded = protocols![1]!.slice("typr-api-key.".length);
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(encoded.length + (4 - encoded.length % 4) % 4, "=");
    expect(atob(padded)).toBe(apiKey);

    const harness = createHarness();
    harness.client.start("http://localhost:8484", projectSnapshot(), apiKey);
    expect(harness.connections[0]).toEqual({
      url: "ws://localhost:8484/ws/texpresso",
      protocols
    });
  });
});
