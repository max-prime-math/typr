import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalFolderSyncTree } from "../workspace/localFolderSync";
import { GoogleDriveProjectRemote } from "./googleDriveApi";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function textFile(path: string, content: string): LocalFolderSyncTree {
  return new Map([
    [
      path,
      {
        kind: "file",
        path,
        bytes: new TextEncoder().encode(content),
        modifiedAt: 0
      }
    ]
  ]);
}

describe("Google Drive project adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not bind the browser fetch function to the Drive adapter", async () => {
    const request = vi.fn(
      async function (
        this: unknown,
        _input: RequestInfo | URL,
        _init?: RequestInit
      ) {
        expect(this).not.toBeInstanceOf(GoogleDriveProjectRemote);
        return jsonResponse({
          files: [
            {
              id: "folder-existing",
              name: "Existing writing",
              mimeType: "application/vnd.google-apps.folder",
              parents: ["parent-a"],
              webViewLink:
                "https://drive.google.com/drive/folders/folder-existing"
            }
          ]
        });
      }
    );
    vi.stubGlobal("fetch", request);
    const remote = new GoogleDriveProjectRemote("token");

    await expect(
      remote.findOrCreateManagedProjectFolder({
        parentId: "parent-a",
        projectId: "project-a",
        projectName: "Writing"
      })
    ).resolves.toEqual({
      id: "folder-existing",
      name: "Existing writing",
      parents: ["parent-a"],
      webViewLink:
        "https://drive.google.com/drive/folders/folder-existing"
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reuses an app-managed project folder before creating a new one", async () => {
    let capturedInput: RequestInfo | URL | null = null;
    let capturedInit: RequestInit | undefined;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedInput = input;
        capturedInit = init;
        return jsonResponse({
        files: [
          {
            id: "folder-existing",
            name: "Existing writing",
            mimeType: "application/vnd.google-apps.folder",
            modifiedTime: "2026-07-26T12:00:00.000Z",
            parents: ["parent-a"],
            webViewLink:
              "https://drive.google.com/drive/folders/folder-existing"
          }
        ]
        });
      }
    );
    const remote = new GoogleDriveProjectRemote("token", request);

    await expect(
      remote.findOrCreateManagedProjectFolder({
        parentId: "parent-a",
        projectId: "project-a",
        projectName: "Writing"
      })
    ).resolves.toEqual({
      id: "folder-existing",
      name: "Existing writing",
      parents: ["parent-a"],
      webViewLink:
        "https://drive.google.com/drive/folders/folder-existing"
    });

    const url = new URL(getRequestUrl(capturedInput));
    expect(url.searchParams.get("q")).toContain(
      "key='typrProjectId' and value='project-a'"
    );
    expect(url.searchParams.get("q")).toContain(
      "'parent-a' in parents"
    );
    expect(url.searchParams.get("q")).toContain(
      "key='typrSchema' and value='2'"
    );
    expect(new Headers(capturedInit?.headers).get("Authorization")).toBe(
      "Bearer token"
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("creates the managed project child under the selected parent only", async () => {
    const requests: Array<{ init?: RequestInit; url: URL }> = [];
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(getRequestUrl(input));
        requests.push({ init, url });
        if (!init?.method) {
          return jsonResponse({ files: [] });
        }
        const metadata = JSON.parse(String(init.body));
        return jsonResponse({
          ...metadata,
          id: "managed-child",
          webViewLink:
            "https://drive.google.com/drive/folders/managed-child"
        });
      }
    );
    const remote = new GoogleDriveProjectRemote("token", request);

    await expect(
      remote.findOrCreateManagedProjectFolder({
        parentId: "chosen-parent",
        projectId: "project-a",
        projectName: "Writing"
      })
    ).resolves.toMatchObject({
      id: "managed-child",
      name: "Writing",
      parents: ["chosen-parent"]
    });

    const createRequest = requests.find(
      ({ init }) => init?.method === "POST"
    );
    expect(JSON.parse(String(createRequest?.init?.body))).toEqual({
      name: "Writing",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["chosen-parent"],
      appProperties: {
        typrKind: "project",
        typrProjectId: "project-a",
        typrSchema: "2"
      }
    });
  });

  it("refuses to verify a managed folder from a different parent", async () => {
    const remote = new GoogleDriveProjectRemote(
      "token",
      vi.fn(async () =>
        jsonResponse({
          id: "managed-child",
          name: "Writing",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["other-parent"],
          appProperties: {
            typrKind: "project",
            typrProjectId: "project-a",
            typrSchema: "2"
          },
          webViewLink:
            "https://drive.google.com/drive/folders/managed-child"
        })
      )
    );

    await expect(
      remote.verifyManagedProjectFolder({
        folderId: "managed-child",
        parentId: "chosen-parent",
        projectId: "project-a"
      })
    ).rejects.toThrow("Typr refused to sync");
  });

  it("reads nested Drive folders and downloads ordinary project files", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(getRequestUrl(input));
      const query = url.searchParams.get("q");
      if (query?.includes("'root' in parents")) {
        return jsonResponse({
          files: [
            {
              id: "chapters",
              name: "chapters",
              mimeType: "application/vnd.google-apps.folder",
              modifiedTime: "2026-07-26T12:00:00.000Z"
            },
            {
              id: "main",
              name: "main.typ",
              mimeType: "application/octet-stream",
              modifiedTime: "2026-07-26T12:01:00.000Z"
            }
          ]
        });
      }
      if (query?.includes("'chapters' in parents")) {
        return jsonResponse({
          files: [
            {
              id: "chapter-one",
              name: "one.typ",
              mimeType: "application/octet-stream",
              modifiedTime: "2026-07-26T12:02:00.000Z"
            }
          ]
        });
      }
      if (url.pathname.endsWith("/main")) {
        return new Response("main");
      }
      if (url.pathname.endsWith("/chapter-one")) {
        return new Response("chapter");
      }
      throw new Error(`Unexpected Drive request: ${url}`);
    });
    const remote = new GoogleDriveProjectRemote("token", request);

    const tree = await remote.readTree("root");

    expect([...tree.keys()]).toEqual([
      "chapters",
      "main.typ",
      "chapters/one.typ"
    ]);
    expect(
      new TextDecoder().decode(tree.get("chapters/one.typ")?.bytes)
    ).toBe("chapter");
  });

  it("updates changed files and moves deleted Drive entries to trash", async () => {
    const requests: Array<{ init?: RequestInit; url: URL }> = [];
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(getRequestUrl(input));
        requests.push({ init, url });
        const query = url.searchParams.get("q");
        if (query?.includes("'root' in parents")) {
          return jsonResponse({
            files: [
              {
                id: "main",
                name: "main.typ",
                mimeType: "application/octet-stream",
                modifiedTime: "2026-07-26T12:00:00.000Z"
              },
              {
                id: "old",
                name: "old.typ",
                mimeType: "application/octet-stream",
                modifiedTime: "2026-07-26T12:00:00.000Z"
              }
            ]
          });
        }
        if (
          url.pathname.endsWith("/main") &&
          url.searchParams.get("alt") === "media"
        ) {
          return new Response("old main");
        }
        if (
          url.pathname.endsWith("/old") &&
          url.searchParams.get("alt") === "media"
        ) {
          return new Response("old file");
        }
        return new Response(null, { status: 204 });
      }
    );
    const remote = new GoogleDriveProjectRemote("token", request);
    const current = await remote.readTree("root");

    await remote.writeTree(
      "root",
      current,
      textFile("main.typ", "new main")
    );

    const trashedOld = requests.find(
      ({ url, init }) =>
        url.pathname.endsWith("/old") && init?.method === "PATCH"
    );
    const updatedMain = requests.find(
      ({ url, init }) =>
        url.hostname === "www.googleapis.com" &&
        url.pathname.includes("/upload/drive/v3/files/main") &&
        init?.method === "PATCH"
    );
    expect(trashedOld?.init?.body).toBe(
      JSON.stringify({ trashed: true })
    );
    expect(updatedMain?.url.searchParams.get("uploadType")).toBe("media");
  });
});

function getRequestUrl(input: RequestInfo | URL | null): string {
  if (!input) {
    throw new Error("Expected a captured request.");
  }
  return input instanceof Request ? input.url : String(input);
}
