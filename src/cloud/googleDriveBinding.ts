import type {
  CloudProjectBindingRecord,
  CloudSyncPolicy
} from "./cloudSync";
import type { GoogleDriveProjectFolder } from "./googleDriveApi";

const GOOGLE_DRIVE_PROVIDER_ID = "google-drive";
export const GOOGLE_DRIVE_BINDING_SCHEMA = "2";

const PARENT_ID_KEY = "selectedParentId";
const PARENT_NAME_KEY = "selectedParentName";
const PROJECT_FOLDER_LINK_KEY = "projectFolderWebViewLink";
const SCHEMA_KEY = "googleDriveBindingSchema";

export interface GoogleDriveBindingMetadata {
  projectFolderId: string;
  projectFolderName: string;
  projectFolderWebViewLink: string;
  selectedParentId: string;
  selectedParentName: string;
}

export interface GoogleDriveBindingV2
  extends CloudProjectBindingRecord {
  version: 2;
  providerId: typeof GOOGLE_DRIVE_PROVIDER_ID;
}

export function createGoogleDriveBinding(options: {
  connectedAt: string;
  folder: GoogleDriveProjectFolder;
  parent: {
    id: string;
    name: string;
  };
  policy: CloudSyncPolicy;
  projectId: string;
}): GoogleDriveBindingV2 {
  return {
    version: 2,
    projectId: options.projectId,
    providerId: GOOGLE_DRIVE_PROVIDER_ID,
    remoteRootId: options.folder.id,
    remoteRootName: options.folder.name,
    connectedAt: options.connectedAt,
    lastSyncedAt: null,
    syncMode: options.policy.mode,
    syncIntervalMinutes: options.policy.intervalMinutes,
    worktreeSignatures: {},
    providerData: {
      [PARENT_ID_KEY]: options.parent.id,
      [PARENT_NAME_KEY]: options.parent.name,
      [PROJECT_FOLDER_LINK_KEY]: options.folder.webViewLink,
      [SCHEMA_KEY]: GOOGLE_DRIVE_BINDING_SCHEMA
    }
  };
}

export function isGoogleDriveBindingV2(
  binding: CloudProjectBindingRecord | null | undefined
): binding is GoogleDriveBindingV2 {
  return Boolean(
    binding &&
      binding.version === 2 &&
      binding.providerId === GOOGLE_DRIVE_PROVIDER_ID &&
      readGoogleDriveBindingMetadata(binding)
  );
}

export function isLegacyGoogleDriveBinding(
  binding: CloudProjectBindingRecord | null | undefined
): boolean {
  return Boolean(
    binding &&
      binding.version === 1 &&
      binding.providerId === GOOGLE_DRIVE_PROVIDER_ID
  );
}

export function readGoogleDriveBindingMetadata(
  binding: CloudProjectBindingRecord
): GoogleDriveBindingMetadata | null {
  const providerData = binding.providerData;
  if (
    binding.version !== 2 ||
    binding.providerId !== GOOGLE_DRIVE_PROVIDER_ID ||
    providerData?.[SCHEMA_KEY] !== GOOGLE_DRIVE_BINDING_SCHEMA
  ) {
    return null;
  }
  const selectedParentId = providerData[PARENT_ID_KEY];
  const selectedParentName = providerData[PARENT_NAME_KEY];
  const projectFolderWebViewLink =
    providerData[PROJECT_FOLDER_LINK_KEY];
  if (
    !selectedParentId ||
    !selectedParentName ||
    !projectFolderWebViewLink ||
    !isGoogleDriveWebViewLink(projectFolderWebViewLink) ||
    !binding.remoteRootId ||
    !binding.remoteRootName
  ) {
    return null;
  }
  return {
    projectFolderId: binding.remoteRootId,
    projectFolderName: binding.remoteRootName,
    projectFolderWebViewLink,
    selectedParentId,
    selectedParentName
  };
}

export function getGoogleDriveDestinationLabel(
  metadata: GoogleDriveBindingMetadata
): string {
  return `${metadata.selectedParentName} / ${metadata.projectFolderName}`;
}

function isGoogleDriveWebViewLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "drive.google.com" ||
        url.hostname.endsWith(".drive.google.com"))
    );
  } catch {
    return false;
  }
}
