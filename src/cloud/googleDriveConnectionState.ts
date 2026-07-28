import {
  DEFAULT_CLOUD_SYNC_POLICY,
  getCloudSyncPolicyMessage,
  type CloudSyncMode
} from "./cloudSync";
import type { GoogleDriveBindingMetadata } from "./googleDriveBinding";

export type GoogleDriveConnectionStatus =
  | "disconnected"
  | "authorizing"
  | "authorization-returned"
  | "choosing-location"
  | "creating-project-folder"
  | "syncing"
  | "synced"
  | "authorization-needed"
  | "error"
  | "unconfigured";

export interface GoogleDriveProjectState {
  status: GoogleDriveConnectionStatus;
  selectedParentName: string | null;
  projectFolderName: string | null;
  projectFolderWebViewLink: string | null;
  lastSyncedAt: string | null;
  message: string;
  migrationRequired: boolean;
  syncMode: CloudSyncMode;
  syncIntervalMinutes: number;
}

export type GoogleDriveConnectionEvent =
  | { type: "authorization-started" }
  | { type: "authorization-returned" }
  | { type: "authorization-needed"; message?: string }
  | { type: "choosing-location" }
  | { type: "creating-project-folder"; parentName: string }
  | {
      type: "failed";
      message: string;
    }
  | {
      type: "legacy-binding-restored";
      folderName: string;
      lastSyncedAt: string | null;
      syncIntervalMinutes: number;
      syncMode: CloudSyncMode;
    }
  | {
      type: "location-cancelled";
      hasBinding: boolean;
      legacyFolderName?: string;
    }
  | {
      type: "policy-updated";
      syncIntervalMinutes: number;
      syncMode: CloudSyncMode;
    }
  | {
      type: "binding-restored";
      configured: boolean;
      lastSyncedAt: string | null;
      metadata: GoogleDriveBindingMetadata;
      syncIntervalMinutes: number;
      syncMode: CloudSyncMode;
    }
  | {
      type: "sync-started";
      metadata: GoogleDriveBindingMetadata;
    }
  | {
      type: "synced";
      lastSyncedAt: string;
      metadata: GoogleDriveBindingMetadata;
      syncIntervalMinutes: number;
      syncMode: CloudSyncMode;
    }
  | { type: "unlinked"; configured: boolean };

export function createGoogleDriveProjectState(
  configured: boolean
): GoogleDriveProjectState {
  return {
    status: configured ? "disconnected" : "unconfigured",
    selectedParentName: null,
    projectFolderName: null,
    projectFolderWebViewLink: null,
    lastSyncedAt: null,
    message: configured
      ? "Authorize Google, then choose a parent destination in Drive."
      : "Google Drive Picker is not configured on this deployment.",
    migrationRequired: false,
    syncMode: DEFAULT_CLOUD_SYNC_POLICY.mode,
    syncIntervalMinutes: DEFAULT_CLOUD_SYNC_POLICY.intervalMinutes
  };
}

export function reduceGoogleDriveConnectionState(
  state: GoogleDriveProjectState,
  event: GoogleDriveConnectionEvent
): GoogleDriveProjectState {
  switch (event.type) {
    case "authorization-started":
      return {
        ...state,
        status: "authorizing",
        message: "Redirecting to Google for authorization…"
      };
    case "authorization-returned":
      return {
        ...state,
        status: "authorization-returned",
        message:
          "Google authorization succeeded. Continue by choosing a Drive destination."
      };
    case "authorization-needed":
      return {
        ...state,
        status: "authorization-needed",
        message:
          event.message ?? "Reconnect to resume Google Drive sync."
      };
    case "choosing-location":
      return {
        ...state,
        status: "choosing-location",
        message: "Choose a parent destination in Google Drive."
      };
    case "creating-project-folder":
      return {
        ...state,
        status: "creating-project-folder",
        selectedParentName: event.parentName,
        projectFolderName: null,
        projectFolderWebViewLink: null,
        message: `Preparing a Typr-managed project folder inside ${event.parentName}…`
      };
    case "sync-started":
      return {
        ...state,
        ...metadataState(event.metadata),
        status: "syncing",
        message: `Syncing ${event.metadata.projectFolderName}…`
      };
    case "synced":
      return {
        ...state,
        ...metadataState(event.metadata),
        status: "synced",
        lastSyncedAt: event.lastSyncedAt,
        message: getCloudSyncPolicyMessage({
          mode: event.syncMode,
          intervalMinutes: event.syncIntervalMinutes
        }),
        migrationRequired: false,
        syncMode: event.syncMode,
        syncIntervalMinutes: event.syncIntervalMinutes
      };
    case "binding-restored":
      return {
        ...state,
        ...metadataState(event.metadata),
        status: event.configured
          ? "authorization-needed"
          : "unconfigured",
        lastSyncedAt: event.lastSyncedAt,
        message: event.configured
          ? "Reconnect to resume Google Drive sync."
          : "Google Drive Picker is not configured on this deployment.",
        migrationRequired: false,
        syncMode: event.syncMode,
        syncIntervalMinutes: event.syncIntervalMinutes
      };
    case "legacy-binding-restored":
      return {
        ...state,
        status: "authorization-needed",
        selectedParentName: null,
        projectFolderName: null,
        projectFolderWebViewLink: null,
        lastSyncedAt: event.lastSyncedAt,
        message:
          `This connection predates destination selection. Reconnect and choose a parent folder. ` +
          `The old “${event.folderName}” test folder will remain in Drive until you remove it manually.`,
        migrationRequired: true,
        syncMode: event.syncMode,
        syncIntervalMinutes: event.syncIntervalMinutes
      };
    case "location-cancelled":
      if (event.legacyFolderName) {
        return {
          ...state,
          status: "authorization-needed",
          message:
            `Location selection cancelled. The old “${event.legacyFolderName}” test folder ` +
            "remains in Drive until you remove it manually.",
          migrationRequired: true
        };
      }
      return {
        ...state,
        status: event.hasBinding ? "synced" : "disconnected",
        message: event.hasBinding
          ? "Location selection cancelled. The existing Drive location is unchanged."
          : "Location selection cancelled. No Drive folder was created.",
        migrationRequired: false
      };
    case "policy-updated":
      return {
        ...state,
        message:
          state.status === "synced"
            ? getCloudSyncPolicyMessage({
                mode: event.syncMode,
                intervalMinutes: event.syncIntervalMinutes
              })
            : state.message,
        syncMode: event.syncMode,
        syncIntervalMinutes: event.syncIntervalMinutes
      };
    case "failed":
      return {
        ...state,
        status: "error",
        message: event.message
      };
    case "unlinked":
      return createGoogleDriveProjectState(event.configured);
  }
}

function metadataState(
  metadata: GoogleDriveBindingMetadata
): Pick<
  GoogleDriveProjectState,
  | "projectFolderName"
  | "projectFolderWebViewLink"
  | "selectedParentName"
> {
  return {
    projectFolderName: metadata.projectFolderName,
    projectFolderWebViewLink: metadata.projectFolderWebViewLink,
    selectedParentName: metadata.selectedParentName
  };
}
