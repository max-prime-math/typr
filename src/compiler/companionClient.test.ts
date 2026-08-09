import { describe, expect, it } from "vitest";
import {
  CompanionClient,
  CompanionClientError,
  parseCompanionStatus
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
    const client = new CompanionClient({
      baseUrl: "http://localhost:8484/",
      fetch: async () => jsonResponse(validStatus)
    });

    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      state: "available",
      baseUrl: "http://localhost:8484",
      status: validStatus
    });
  });

  it("rejects an incompatible protocol without treating the server as available", async () => {
    const client = new CompanionClient({
      fetch: async () => jsonResponse({ ...validStatus, protocolVersion: 2 })
    });

    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      state: "incompatible"
    });
  });

  it("keeps an unreachable Companion non-fatal", async () => {
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
    const client = new CompanionClient({ fetch: async () => jsonResponse(compileFailure) });
    await expect(client.compile({ protocolVersion: 1, engine: "pdflatex", mainFilePath: "main.tex", files: [] })).resolves.toEqual(compileFailure);

    const serverFailure = new CompanionClient({
      fetch: async () => jsonResponse({ error: { message: "bad request" } }, 400)
    });
    await expect(serverFailure.compile({ protocolVersion: 1, engine: "pdflatex", mainFilePath: "main.tex", files: [] }))
      .rejects.toMatchObject({ kind: "server" } satisfies Partial<CompanionClientError>);
  });

  it("runtime-validates status capabilities", () => {
    expect(parseCompanionStatus({ ...validStatus, capabilities: { compile: {} } }).ok).toBe(false);
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}
