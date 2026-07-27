import { describe, expect, it, vi } from "vitest";
import {
  createEmptyProjectRepository,
  readProjectFileBytes
} from "../project/projectState";
import type {
  LocalFolderSyncEntry,
  LocalFolderSyncTree
} from "../workspace/localFolderSync";
import {
  DEFAULT_CLOUD_SYNC_POLICY,
  getCloudSyncPolicyMessage,
  isCloudIntervalSyncDue,
  normalizeCloudSyncPolicy,
  synchronizeCloudProject,
  type CloudProjectBindingRecord,
  type CloudProjectRemote
} from "./cloudSync";

function file(
  path: string,
  content: string,
  modifiedAt = 0
): LocalFolderSyncEntry {
  return {
    kind: "file",
    path,
    bytes: new TextEncoder().encode(content),
    modifiedAt
  };
}

function tree(...entries: LocalFolderSyncEntry[]): LocalFolderSyncTree {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

function binding(
  overrides: Partial<CloudProjectBindingRecord> = {}
): CloudProjectBindingRecord {
  return {
    version: 1,
    projectId: "project-a",
    providerId: "google-drive",
    remoteRootId: "folder-a",
    remoteRootName: "Writing",
    connectedAt: "2026-07-26T12:00:00.000Z",
    lastSyncedAt: null,
    syncMode: "manual",
    syncIntervalMinutes: 15,
    worktreeSignatures: {},
    ...overrides
  };
}

describe("cloud project sync", () => {
  it("uses the shared additive merge and writes the resolved tree remotely", async () => {
    const project = createEmptyProjectRepository({
      displayName: "Writing",
      defaultFileName: "main.typ",
      defaultContent: "browser"
    });
    let writtenTree: LocalFolderSyncTree | null = null;
    const writeTree: CloudProjectRemote["writeTree"] = vi.fn(
      async (_rootId, _currentTree, desiredTree) => {
        writtenTree = desiredTree;
      }
    );
    const remote: CloudProjectRemote = {
      providerId: "google-drive",
      readTree: vi.fn(async () =>
        tree(
          file("main.typ", "drive", 20),
          file("notes.txt", "remote only", 20)
        )
      ),
      writeTree
    };

    const result = await synchronizeCloudProject({
      binding: binding({ projectId: project.id }),
      project,
      remote
    });

    expect(
      new TextDecoder().decode(
        readProjectFileBytes(result.project, "main.typ") ??
          new Uint8Array()
      )
    ).toBe("drive");
    expect(
      new TextDecoder().decode(
        readProjectFileBytes(result.project, "notes.txt") ??
          new Uint8Array()
      )
    ).toBe("remote only");
    expect(writtenTree).not.toBeNull();
    expect(
      (writtenTree as LocalFolderSyncTree | null)?.has(".gitignore")
    ).toBe(true);
    expect(
      (writtenTree as LocalFolderSyncTree | null)?.has("notes.txt")
    ).toBe(true);
    expect(result.binding.worktreeSignatures).toEqual(
      expect.objectContaining({
        "main.typ": expect.any(String),
        "notes.txt": expect.any(String)
      })
    );
  });

  it("rejects an adapter that does not match the persisted provider", async () => {
    const project = createEmptyProjectRepository({
      displayName: "Mismatch",
      defaultFileName: "main.typ"
    });
    const remote: CloudProjectRemote = {
      providerId: "dropbox",
      readTree: vi.fn(),
      writeTree: vi.fn()
    };

    await expect(
      synchronizeCloudProject({
        binding: binding({ projectId: project.id }),
        project,
        remote
      })
    ).rejects.toThrow("cannot use dropbox");
  });

  it("normalizes provider-neutral sync policies", () => {
    expect(normalizeCloudSyncPolicy(undefined)).toEqual(
      DEFAULT_CLOUD_SYNC_POLICY
    );
    expect(
      normalizeCloudSyncPolicy({
        mode: "interval",
        intervalMinutes: 10_000
      })
    ).toEqual({ mode: "interval", intervalMinutes: 1440 });
    expect(
      getCloudSyncPolicyMessage({
        mode: "interval",
        intervalMinutes: 1
      })
    ).toBe("Syncs every 1 minute");

    const now = Date.parse("2026-07-26T12:15:00.000Z");
    expect(
      isCloudIntervalSyncDue(
        { mode: "interval", intervalMinutes: 15 },
        "2026-07-26T12:00:00.000Z",
        now
      )
    ).toBe(true);
    expect(
      isCloudIntervalSyncDue(
        { mode: "manual", intervalMinutes: 15 },
        null,
        now
      )
    ).toBe(false);
  });
});
