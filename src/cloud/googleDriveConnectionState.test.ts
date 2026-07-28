import { describe, expect, it } from "vitest";
import {
  createGoogleDriveProjectState,
  reduceGoogleDriveConnectionState
} from "./googleDriveConnectionState";

const metadata = {
  projectFolderId: "child-id",
  projectFolderName: "Algebra",
  projectFolderWebViewLink:
    "https://drive.google.com/drive/folders/child-id",
  selectedParentId: "parent-id",
  selectedParentName: "School"
};

describe("Google Drive connection state machine", () => {
  it("keeps every authorization and folder-selection transition visible", () => {
    let state = createGoogleDriveProjectState(true);
    expect(state.status).toBe("disconnected");

    state = reduceGoogleDriveConnectionState(state, {
      type: "authorization-started"
    });
    expect(state.status).toBe("authorizing");
    state = reduceGoogleDriveConnectionState(state, {
      type: "authorization-returned"
    });
    expect(state.status).toBe("authorization-returned");
    state = reduceGoogleDriveConnectionState(state, {
      type: "choosing-location"
    });
    expect(state.status).toBe("choosing-location");
    state = reduceGoogleDriveConnectionState(state, {
      type: "creating-project-folder",
      parentName: "School"
    });
    expect(state.status).toBe("creating-project-folder");
    state = reduceGoogleDriveConnectionState(state, {
      type: "sync-started",
      metadata
    });
    expect(state.status).toBe("syncing");
    state = reduceGoogleDriveConnectionState(state, {
      type: "synced",
      lastSyncedAt: "2026-07-27T12:00:00.000Z",
      metadata,
      syncIntervalMinutes: 15,
      syncMode: "manual"
    });
    expect(state).toMatchObject({
      status: "synced",
      selectedParentName: "School",
      projectFolderName: "Algebra",
      projectFolderWebViewLink:
        "https://drive.google.com/drive/folders/child-id"
    });
  });

  it("restores expired-token bindings as reconnectable, not disconnected", () => {
    const state = reduceGoogleDriveConnectionState(
      createGoogleDriveProjectState(true),
      {
        type: "binding-restored",
        configured: true,
        lastSyncedAt: "2026-07-27T12:00:00.000Z",
        metadata,
        syncIntervalMinutes: 10,
        syncMode: "interval"
      }
    );

    expect(state).toMatchObject({
      status: "authorization-needed",
      message: "Reconnect to resume Google Drive sync.",
      projectFolderName: "Algebra",
      syncMode: "interval"
    });
  });

  it("requires legacy bindings to choose a location and explains that Drive data remains", () => {
    const state = reduceGoogleDriveConnectionState(
      createGoogleDriveProjectState(true),
      {
        type: "legacy-binding-restored",
        folderName: "Old folder",
        lastSyncedAt: null,
        syncIntervalMinutes: 15,
        syncMode: "manual"
      }
    );

    expect(state.status).toBe("authorization-needed");
    expect(state.migrationRequired).toBe(true);
    expect(state.projectFolderName).toBeNull();
    expect(state.message).toContain("will remain in Drive");
    expect(state.message).toContain("remove it manually");
  });

  it("preserves an existing binding when location selection is cancelled", () => {
    const connected = reduceGoogleDriveConnectionState(
      createGoogleDriveProjectState(true),
      {
        type: "synced",
        lastSyncedAt: "2026-07-27T12:00:00.000Z",
        metadata,
        syncIntervalMinutes: 15,
        syncMode: "manual"
      }
    );
    const cancelled = reduceGoogleDriveConnectionState(connected, {
      type: "location-cancelled",
      hasBinding: true
    });

    expect(cancelled.status).toBe("synced");
    expect(cancelled.projectFolderName).toBe("Algebra");
    expect(cancelled.message).toContain("existing Drive location is unchanged");
  });

  it("keeps a legacy binding reconnectable when location selection is cancelled", () => {
    const cancelled = reduceGoogleDriveConnectionState(
      createGoogleDriveProjectState(true),
      {
        type: "location-cancelled",
        hasBinding: false,
        legacyFolderName: "Old test folder"
      }
    );

    expect(cancelled.status).toBe("authorization-needed");
    expect(cancelled.migrationRequired).toBe(true);
    expect(cancelled.message).toContain("Old test folder");
    expect(cancelled.message).toContain("remains in Drive");
  });

  it("renders failures as an error state instead of silently disconnecting", () => {
    const failed = reduceGoogleDriveConnectionState(
      createGoogleDriveProjectState(true),
      {
        type: "failed",
        message: "Picker could not load."
      }
    );

    expect(failed.status).toBe("error");
    expect(failed.message).toBe("Picker could not load.");
  });
});
