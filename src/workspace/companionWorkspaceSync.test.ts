import { describe, expect, it } from "vitest";
import { CompanionClient } from "../compiler/companionClient";
import {
  createEmptyProjectRepository,
  ensureProjectFolder,
  readProjectFileBytes,
  writeProjectFile
} from "../project/projectState";
import {
  applySyncTreeToProject,
  createProjectSyncTree,
  getSyncTreeSignatures
} from "./localFolderSync";
import {
  CompanionWorkspaceConflictError,
  CompanionWorkspacePartialError,
  createCompanionWorkspaceProjectTree,
  createCompanionWorkspaceBinding,
  synchronizeCompanionWorkspace
} from "./companionWorkspaceSync";

const LIMITS = { maxFileBytes: 1024 * 1024, maxEntries: 512, maxWorkspaceBytes: 25 * 1024 * 1024 };

describe("Companion mapped-workspace synchronization", () => {
  it("performs an additive first link with workspace-wins collisions and binary round trips", async () => {
    let project = createEmptyProjectRepository({
      displayName: "Mapped",
      defaultFileName: "main.typ",
      defaultContent: "browser main"
    });
    project = writeProjectFile(project, "assets/browser.bin", new Uint8Array([0, 1, 255]));
    const backend = new MemoryWorkspaceBackend({
      "main.typ": textBytes("workspace main"),
      "nested/remote.txt": textBytes("remote only")
    });
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" });

    const result = await synchronizeCompanionWorkspace({ binding, project, client, workspaceId: "mapped", limits: LIMITS });
    const syncedProject = applySyncTreeToProject(project, result.startedProjectTree, result.desiredTree);

    expect(text(readProjectFileBytes(syncedProject, "main.typ"))).toBe("workspace main");
    expect(text(readProjectFileBytes(syncedProject, "nested/remote.txt"))).toBe("remote only");
    expect(backend.bytes("assets/browser.bin")).toEqual(new Uint8Array([0, 1, 255]));
    expect(result.binding.lastSyncedAt).not.toBeNull();
    expect(result.binding.syncMode).toBe("manual");
  });

  it("reports divergent two-sided edits without mutating either side", async () => {
    let project = createEmptyProjectRepository({ displayName: "Conflict", defaultFileName: "main.typ", defaultContent: "old" });
    const baseline = getSyncTreeSignatures(createProjectSyncTree(project));
    project = writeProjectFile(project, "main.typ", "browser edit");
    const backend = new MemoryWorkspaceBackend({ "main.typ": textBytes("workspace edit") });
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = {
      ...createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" }),
      worktreeSignatures: baseline
    };

    await expect(synchronizeCompanionWorkspace({ binding, project, client, workspaceId: "mapped", limits: LIMITS }))
      .rejects.toEqual(expect.objectContaining<Partial<CompanionWorkspaceConflictError>>({ paths: ["main.typ"] }));
    expect(backend.text("main.typ")).toBe("workspace edit");
    expect(text(readProjectFileBytes(project, "main.typ"))).toBe("browser edit");
    expect(backend.mutationCount).toBe(0);
  });

  it("re-reads and retries one conditional race before succeeding", async () => {
    let project = createEmptyProjectRepository({ displayName: "Retry", defaultFileName: "main.typ", defaultContent: "old" });
    const baseline = getSyncTreeSignatures(createProjectSyncTree(project));
    project = writeProjectFile(project, "main.typ", "browser edit");
    const backend = new MemoryWorkspaceBackend({ "main.typ": textBytes("old") });
    backend.failNextUpdate = true;
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = {
      ...createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" }),
      worktreeSignatures: baseline
    };

    const result = await synchronizeCompanionWorkspace({ binding, project, client, workspaceId: "mapped", limits: LIMITS });
    const syncedProject = applySyncTreeToProject(project, result.startedProjectTree, result.desiredTree);

    expect(backend.text("main.typ")).toBe("browser edit");
    expect(backend.updateAttempts).toBe(2);
    expect(text(readProjectFileBytes(syncedProject, "main.typ"))).toBe("browser edit");
  });

  it("preserves a browser edit made while remote I/O is in flight", async () => {
    const project = createEmptyProjectRepository({ displayName: "Concurrent", defaultFileName: "main.typ", defaultContent: "started" });
    const backend = new MemoryWorkspaceBackend({ "main.typ": textBytes("workspace") });
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" });
    const editedDuringSync = writeProjectFile(project, "main.typ", "late browser edit");

    const result = await synchronizeCompanionWorkspace({
      binding,
      project,
      client,
      workspaceId: "mapped",
      limits: LIMITS
    });
    const syncedProject = applySyncTreeToProject(editedDuringSync, result.startedProjectTree, result.desiredTree);

    expect(text(readProjectFileBytes(syncedProject, "main.typ"))).toBe("late browser edit");
  });

  it("blocks a stale URL or workspace identity before making a request", async () => {
    const project = createEmptyProjectRepository({ displayName: "Mismatch" });
    const backend = new MemoryWorkspaceBackend({});
    const client = new CompanionClient({ baseUrl: "http://localhost:9999", fetch: backend.fetch });
    const binding = createCompanionWorkspaceBinding({
      projectId: project.id,
      baseUrl: "http://localhost:8484",
      workspaceId: "other"
    });

    await expect(synchronizeCompanionWorkspace({ binding, project, client, workspaceId: "mapped", limits: LIMITS }))
      .rejects.toThrow(/does not match/u);
    expect(backend.requestCount).toBe(0);
  });

  it("keeps browser-only empty folders outside the remote baseline across repeated syncs", async () => {
    let project = createEmptyProjectRepository({ displayName: "Folders", defaultFileName: "main.typ", defaultContent: "same" });
    project = ensureProjectFolder(project, "empty-folder");
    const backend = new MemoryWorkspaceBackend({ "main.typ": textBytes("same") });
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" });

    const first = await synchronizeCompanionWorkspace({ binding, project, client, workspaceId: "mapped", limits: LIMITS });
    const afterFirst = applySyncTreeToProject(project, first.startedProjectTree, first.desiredTree);
    const second = await synchronizeCompanionWorkspace({
      binding: first.binding, project: afterFirst, client, workspaceId: "mapped", limits: LIMITS
    });
    const afterSecond = applySyncTreeToProject(afterFirst, second.startedProjectTree, second.desiredTree);

    expect(afterSecond.filesystem.entries["empty-folder"]?.kind).toBe("folder");
    expect(first.binding.worktreeSignatures["empty-folder"]).toBeUndefined();
    expect(second.binding.worktreeSignatures["empty-folder"]).toBeUndefined();
    expect(getSyncTreeSignatures(createCompanionWorkspaceProjectTree(afterSecond)))
      .toEqual(getSyncTreeSignatures(second.desiredTree));
  });

  it("rejects file responses that do not match their listing metadata", async () => {
    const project = createEmptyProjectRepository({ displayName: "Mismatch", defaultFileName: "main.typ", defaultContent: "same" });
    const backend = new MemoryWorkspaceBackend({ "main.typ": textBytes("same") });
    backend.readPathOverride = "substituted.typ";
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" });

    await expect(synchronizeCompanionWorkspace({ binding, project, client, workspaceId: "mapped", limits: LIMITS }))
      .rejects.toEqual(expect.objectContaining({ paths: ["main.typ"] }));
    expect(backend.mutationCount).toBe(0);
  });

  it("enforces advertised limits before upload", async () => {
    const project = createEmptyProjectRepository({ displayName: "Limits", defaultFileName: "main.typ", defaultContent: "too large" });
    const backend = new MemoryWorkspaceBackend({});
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" });

    await expect(synchronizeCompanionWorkspace({
      binding, project, client, workspaceId: "mapped",
      limits: { maxFileBytes: 2, maxEntries: 2, maxWorkspaceBytes: 4 }
    })).rejects.toThrow(/advertised limit/u);
    expect(backend.requestCount).toBe(0);
  });

  it("reports every path applied before a later transport failure", async () => {
    let project = createEmptyProjectRepository({ displayName: "Partial", defaultFileName: "main.typ", defaultContent: "same" });
    project = writeProjectFile(project, "a.txt", "a");
    project = writeProjectFile(project, "b.txt", "b");
    const backend = new MemoryWorkspaceBackend({ "main.typ": textBytes("same") });
    backend.failMutationAt = 3;
    const client = new CompanionClient({ baseUrl: "http://localhost:8484", fetch: backend.fetch });
    const binding = createCompanionWorkspaceBinding({ projectId: project.id, baseUrl: client.baseUrl, workspaceId: "mapped" });

    await expect(synchronizeCompanionWorkspace({ binding, project, client, workspaceId: "mapped", limits: LIMITS }))
      .rejects.toEqual(expect.objectContaining<Partial<CompanionWorkspacePartialError>>({
        partiallyAppliedPaths: [".gitignore", "a.txt"]
      }));
    expect(backend.text("a.txt")).toBe("a");
    expect(backend.text("b.txt")).toBeNull();
  });
});

class MemoryWorkspaceBackend {
  readonly fetch: typeof fetch;
  requestCount = 0;
  mutationCount = 0;
  updateAttempts = 0;
  failNextUpdate = false;
  failMutationAt: number | null = null;
  readPathOverride: string | null = null;
  private revision = 1;
  private readonly files = new Map<string, { bytes: Uint8Array; etag: string; modifiedAt: number }>();

  constructor(files: Record<string, Uint8Array>) {
    for (const [path, bytes] of Object.entries(files)) this.set(path, bytes);
    this.fetch = async (input, init) => this.handle(String(input), init);
  }

  bytes(path: string): Uint8Array | undefined {
    const bytes = this.files.get(path)?.bytes;
    return bytes ? new Uint8Array(bytes) : undefined;
  }

  text(path: string): string | null {
    const bytes = this.bytes(path);
    return bytes ? text(bytes) : null;
  }

  private async handle(input: string, init?: RequestInit): Promise<Response> {
    this.requestCount += 1;
    const url = new URL(input);
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/workspace/files")) {
      return jsonResponse({
        workspaceId: "mapped",
        files: [...this.files.entries()].map(([path, file]) => ({
          path,
          size: file.bytes.byteLength,
          modifiedAt: file.modifiedAt,
          etag: file.etag
        })).sort((left, right) => left.path.localeCompare(right.path))
      });
    }
    const path = url.searchParams.get("path")!;
    const current = this.files.get(path);
    if (method === "GET") {
      if (!current) return jsonResponse({ error: { code: "not-found", message: "missing" } }, 404);
      return jsonResponse({
        path: this.readPathOverride ?? path,
        size: current.bytes.byteLength,
        modifiedAt: current.modifiedAt,
        etag: current.etag,
        encoding: "base64",
        content: bytesBase64(current.bytes)
      });
    }
    const headers = new Headers(init?.headers);
    if (method === "DELETE") {
      if (!current || headers.get("If-Match") !== current.etag) return conflictResponse();
      this.files.delete(path);
      this.mutationCount += 1;
      return new Response(null, { status: 204 });
    }
    if (method === "PUT") {
      this.updateAttempts += current ? 1 : 0;
      if (this.failMutationAt === this.mutationCount + 1) {
        return jsonResponse({ error: { code: "injected", message: "injected mutation failure" } }, 500);
      }
      if (current && this.failNextUpdate) {
        this.failNextUpdate = false;
        return conflictResponse();
      }
      if ((current && headers.get("If-Match") !== current.etag) || (!current && headers.get("If-None-Match") !== "*")) {
        return conflictResponse();
      }
      const body = JSON.parse(String(init?.body)) as { content: string };
      const file = this.set(path, base64Bytes(body.content));
      this.mutationCount += 1;
      return jsonResponse({ path, size: file.bytes.byteLength, modifiedAt: file.modifiedAt, etag: file.etag }, current ? 200 : 201);
    }
    return jsonResponse({ error: { message: "unsupported" } }, 405);
  }

  private set(path: string, bytes: Uint8Array) {
    const revision = this.revision++;
    const file = { bytes: new Uint8Array(bytes), etag: `"etag-${revision}"`, modifiedAt: revision };
    this.files.set(path, file);
    return file;
  }
}

function conflictResponse(): Response {
  return jsonResponse({ error: { code: "workspace-precondition-failed", message: "changed" } }, 412);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function text(value: Uint8Array | null | undefined): string | null {
  return value ? new TextDecoder().decode(value) : null;
}

function bytesBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64Bytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
