import { describe, expect, it } from "vitest";
import {
  createGoogleDriveBinding,
  getGoogleDriveDestinationLabel,
  isGoogleDriveBindingV2,
  isLegacyGoogleDriveBinding,
  readGoogleDriveBindingMetadata
} from "./googleDriveBinding";
import type { CloudProjectBindingRecord } from "./cloudSync";

describe("Google Drive binding v2", () => {
  it("stores truthful parent, managed-folder, and Drive-link metadata", () => {
    const binding = createGoogleDriveBinding({
      connectedAt: "2026-07-27T12:00:00.000Z",
      folder: {
        id: "child-id",
        name: "Linear algebra",
        parents: ["parent-id"],
        webViewLink:
          "https://drive.google.com/drive/folders/child-id"
      },
      parent: {
        id: "parent-id",
        name: "School"
      },
      policy: { mode: "manual", intervalMinutes: 15 },
      projectId: "project-a"
    });

    expect(isGoogleDriveBindingV2(binding)).toBe(true);
    const metadata = readGoogleDriveBindingMetadata(binding);
    expect(metadata).toEqual({
      projectFolderId: "child-id",
      projectFolderName: "Linear algebra",
      projectFolderWebViewLink:
        "https://drive.google.com/drive/folders/child-id",
      selectedParentId: "parent-id",
      selectedParentName: "School"
    });
    expect(getGoogleDriveDestinationLabel(metadata!)).toBe(
      "School / Linear algebra"
    );
  });

  it("marks v1 root-created bindings for reconnect without mutating them", () => {
    const legacy: CloudProjectBindingRecord = {
      version: 1,
      projectId: "project-a",
      providerId: "google-drive",
      remoteRootId: "old-folder",
      remoteRootName: "Old test folder",
      connectedAt: "2026-07-01T12:00:00.000Z",
      lastSyncedAt: null,
      syncMode: "manual",
      syncIntervalMinutes: 15,
      worktreeSignatures: {}
    };

    expect(isLegacyGoogleDriveBinding(legacy)).toBe(true);
    expect(isGoogleDriveBindingV2(legacy)).toBe(false);
    expect(readGoogleDriveBindingMetadata(legacy)).toBeNull();
    expect(legacy.remoteRootId).toBe("old-folder");
  });
});
