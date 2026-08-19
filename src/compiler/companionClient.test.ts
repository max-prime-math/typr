import { describe, expect, it } from "vitest";
import {
  COMPANION_BASE_URL_STORAGE_KEY,
  CompanionClient,
  CompanionClientError,
  DEFAULT_COMPANION_BASE_URL,
  isCompanionBaseUrlConfigured,
  normalizeCompanionBaseUrl,
  parseCompanionStatus,
  parseWorkspaceFile,
  parseWorkspaceFileList,
  readStoredCompanionBaseUrl,
  validateCompanionApiKey,
  validateCompanionBaseUrl,
  writeStoredCompanionBaseUrl
} from "./companionClient";

const validStatus = {
  protocolVersion: 1,
  serverVersion: "0.1.0",
  capabilities: {
    compile: { engines: ["pdflatex"] },
    filesystem: { projectStorage: false },
    lsp: { languages: [] },
    git: { enabled: false },
    terminal: { enabled: false }
  }
};

describe("CompanionClient", () => {
  it("accepts a valid compatible status response", async () => {
    let capturedInit: RequestInit | undefined;
    const apiKey = `typr_${"a".repeat(43)}`;
    const client = new CompanionClient({
      baseUrl: "http://localhost:8484/",
      apiKey,
      fetch: async (_input, init) => {
        capturedInit = init;
        return jsonResponse(validStatus);
      }
    });

    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      state: "available",
      baseUrl: "http://localhost:8484",
      status: validStatus
    });
    expect(new Headers(capturedInit?.headers).get("Authorization")).toBe(`Bearer ${apiKey}`);
  });

  it("reports a rejected API key without exposing it in the connection message", async () => {
    const apiKey = `typr_${"b".repeat(43)}`;
    const client = new CompanionClient({
      apiKey,
      fetch: async () => jsonResponse({ error: { message: "unauthorized" } }, 401)
    });

    const status = await client.getConnectionStatus();
    expect(status).toMatchObject({
      state: "unavailable",
      message: "The Typr Server API key is missing or was rejected."
    });
    expect(status.message).not.toContain(apiKey);
  });

  it("rejects an incompatible protocol without treating the server as available", async () => {
    const client = new CompanionClient({
      fetch: async () => jsonResponse({ ...validStatus, protocolVersion: 2 })
    });

    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      state: "incompatible"
    });
  });

  it("keeps an unreachable Typr Server non-fatal", async () => {
    const client = new CompanionClient({
      fetch: async () => { throw new TypeError("connection refused"); }
    });

    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      state: "unavailable",
      message: expect.stringContaining("connection refused")
    });
  });

  it("returns typed compiler failures and rejects HTTP server errors distinctly", async () => {
    const compileFailure = {
      ok: false,
      engine: "pdflatex",
      errors: [{ code: "latex-compile-failed", message: "Undefined control sequence", path: "main.tex", line: 4 }],
      log: "! Undefined control sequence.",
      durationMs: 12
    };
    let compileInit: RequestInit | undefined;
    const apiKey = `typr_${"d".repeat(43)}`;
    const client = new CompanionClient({
      apiKey,
      fetch: async (_input, init) => {
        compileInit = init;
        return jsonResponse(compileFailure);
      }
    });
    await expect(client.compile({ protocolVersion: 1, engine: "pdflatex", mainFilePath: "main.tex", files: [] })).resolves.toEqual(compileFailure);
    expect(new Headers(compileInit?.headers).get("Authorization")).toBe(`Bearer ${apiKey}`);
    expect(new Headers(compileInit?.headers).get("content-type")).toBe("application/json");

    const serverFailure = new CompanionClient({
      fetch: async () => jsonResponse({ error: { message: "bad request" } }, 400)
    });
    await expect(serverFailure.compile({ protocolVersion: 1, engine: "pdflatex", mainFilePath: "main.tex", files: [] }))
      .rejects.toMatchObject({ kind: "server" } satisfies Partial<CompanionClientError>);
  });

  it("runtime-validates status capabilities", () => {
    expect(parseCompanionStatus({ ...validStatus, capabilities: { compile: {} } }).ok).toBe(false);
    expect(parseCompanionStatus({
      ...validStatus,
      capabilities: {
        ...validStatus.capabilities,
        filesystem: {
          projectStorage: true,
          workspaceApiVersion: 1,
          workspaceId: "mapped",
          writable: true,
          limits: { maxFileBytes: 16, maxEntries: 4, maxWorkspaceBytes: 64 }
        }
      }
    }).ok).toBe(true);
    expect(parseCompanionStatus({
      ...validStatus,
      capabilities: { ...validStatus.capabilities, filesystem: { projectStorage: true } }
    }).ok).toBe(false);
    expect(parseCompanionStatus({
      ...validStatus,
      capabilities: {
        ...validStatus.capabilities,
        filesystem: {
          projectStorage: true,
          workspaceApiVersion: 1,
          workspaceId: "mapped",
          writable: true,
          limits: { maxFileBytes: Number.MAX_SAFE_INTEGER + 1, maxEntries: 4, maxWorkspaceBytes: Number.MAX_SAFE_INTEGER + 1 }
        }
      }
    }).ok).toBe(false);
  });

  it("uses exact workspace routes, intent headers, and conditional ETags", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      jsonResponse({ workspaceId: "mapped", files: [{ path: "nested/file.bin", size: 3, modifiedAt: 1, etag: '"sha256-one"' }] }),
      jsonResponse({ path: "nested/file.bin", size: 3, modifiedAt: 1, etag: '"sha256-one"', encoding: "base64", content: "AAEC" }),
      jsonResponse({ path: "new.bin", size: 2, modifiedAt: 2, etag: '"sha256-two"' }, 201),
      jsonResponse({ path: "new.bin", size: 1, modifiedAt: 3, etag: '"sha256-three"' }),
      new Response(null, { status: 204 })
    ];
    const apiKey = `typr_${"c".repeat(43)}`;
    const client = new CompanionClient({
      baseUrl: "http://localhost:8484",
      apiKey,
      fetch: async (input, init) => {
        requests.push({ url: String(input), init });
        return responses.shift()!;
      }
    });

    await client.listWorkspaceFiles();
    await client.readWorkspaceFile("nested/file.bin");
    await client.createWorkspaceFile("new.bin", new Uint8Array([1, 2]));
    await client.updateWorkspaceFile("new.bin", new Uint8Array([3]), '"sha256-two"');
    await client.deleteWorkspaceFile("new.bin", '"sha256-three"');

    expect(requests.map((request) => request.url)).toEqual([
      "http://localhost:8484/api/v1/workspace/files",
      "http://localhost:8484/api/v1/workspace/file?path=nested%2Ffile.bin",
      "http://localhost:8484/api/v1/workspace/file?path=new.bin",
      "http://localhost:8484/api/v1/workspace/file?path=new.bin",
      "http://localhost:8484/api/v1/workspace/file?path=new.bin"
    ]);
    expect(requests[2].init).toMatchObject({ method: "PUT" });
    expect(requests[3].init).toMatchObject({ method: "PUT" });
    expect(requests[4].init).toMatchObject({ method: "DELETE" });
    expect(new Headers(requests[2].init?.headers).get("X-Typr-Workspace-Mutation")).toBe("1");
    expect(new Headers(requests[2].init?.headers).get("If-None-Match")).toBe("*");
    expect(new Headers(requests[3].init?.headers).get("If-Match")).toBe('"sha256-two"');
    expect(new Headers(requests[4].init?.headers).get("If-Match")).toBe('"sha256-three"');
    for (const request of requests) {
      expect(new Headers(request.init?.headers).get("Authorization")).toBe(`Bearer ${apiKey}`);
    }
  });

  it("maps conditional workspace failures to typed conflicts", async () => {
    const client = new CompanionClient({
      fetch: async () => jsonResponse({ error: { code: "workspace-precondition-failed", message: "changed" } }, 412)
    });

    await expect(client.updateWorkspaceFile("main.typ", new Uint8Array(), '"sha256-old"'))
      .rejects.toMatchObject({ kind: "conflict", status: 412, code: "workspace-precondition-failed" });
  });

  it("rejects malformed workspace metadata, duplicate paths, and base64 size mismatches", () => {
    expect(parseWorkspaceFileList({
      workspaceId: "mapped",
      files: [
        { path: "same", size: 1, modifiedAt: 1, etag: '"one"' },
        { path: "same", size: 1, modifiedAt: 1, etag: '"two"' }
      ]
    }).ok).toBe(false);
    expect(parseWorkspaceFile({
      path: "../escape",
      size: 3,
      modifiedAt: 1,
      etag: '"one"',
      encoding: "base64",
      content: "AAEC"
    }).ok).toBe(false);
    expect(parseWorkspaceFile({
      path: "file.bin",
      size: 4,
      modifiedAt: 1,
      etag: '"one"',
      encoding: "base64",
      content: "AAEC"
    }).ok).toBe(false);
    expect(parseWorkspaceFile({
      path: "file.bin",
      size: 3,
      modifiedAt: 1,
      etag: '"one"',
      encoding: "base64",
      content: "AAEC"
    }, 2).ok).toBe(false);
    expect(parseWorkspaceFileList({
      workspaceId: "mapped",
      files: [{ path: "unsafe.bin", size: Number.MAX_SAFE_INTEGER + 1, modifiedAt: 1, etag: '"one"' }]
    }).ok).toBe(false);
    expect(parseWorkspaceFile({
      path: "large.bin",
      size: 1,
      modifiedAt: 1,
      etag: '"one"',
      encoding: "base64",
      content: "A".repeat(1_000_000)
    }, 16).ok).toBe(false);
  });

  it("validates and normalizes user-configured Typr Server URLs", () => {
    expect(validateCompanionBaseUrl(" https://companion.example.test/typr/ ")).toEqual({
      ok: true,
      value: "https://companion.example.test/typr"
    });
    expect(validateCompanionBaseUrl("ws://companion.example.test")).toMatchObject({ ok: false });
    expect(validateCompanionBaseUrl("https://user:secret@companion.example.test")).toMatchObject({ ok: false });
    expect(validateCompanionBaseUrl("https://companion.example.test?token=secret")).toMatchObject({ ok: false });
    expect(normalizeCompanionBaseUrl("not a URL")).toBe(normalizeCompanionBaseUrl(DEFAULT_COMPANION_BASE_URL));
  });

  it("accepts blank or complete Companion API keys and rejects partial secrets", () => {
    const key = `typr_${"A0_-".repeat(10)}A0_`;
    expect(validateCompanionApiKey("  ")).toEqual({ ok: true, value: "" });
    expect(validateCompanionApiKey(` ${key} `)).toEqual({ ok: true, value: key });
    expect(validateCompanionApiKey("typr_partial")).toMatchObject({ ok: false });
    expect(validateCompanionApiKey("not-a-companion-key")).toMatchObject({ ok: false });
  });

  it("persists a validated Typr Server URL and safely ignores invalid stored data", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    expect(isCompanionBaseUrlConfigured(storage)).toBe(false);

    writeStoredCompanionBaseUrl("https://companion.example.test/", storage);
    expect(isCompanionBaseUrlConfigured(storage)).toBe(true);
    expect(values.get(COMPANION_BASE_URL_STORAGE_KEY)).toBe("https://companion.example.test");
    expect(readStoredCompanionBaseUrl(storage)).toBe("https://companion.example.test");

    values.set(COMPANION_BASE_URL_STORAGE_KEY, "javascript:alert(1)");
    expect(readStoredCompanionBaseUrl(storage)).toBe(normalizeCompanionBaseUrl(DEFAULT_COMPANION_BASE_URL));
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}
