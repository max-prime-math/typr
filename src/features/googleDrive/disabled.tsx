import type {
  GoogleDriveConnectionCardProps,
  GoogleDriveGlobalNoticeProps,
  GoogleDriveSyncController,
  GoogleDriveSyncOptions
} from "./types";

const resolveVoid = async () => undefined;
const controller: GoogleDriveSyncController = Object.freeze({
  changeLocation: resolveVoid,
  chooseLocation: resolveVoid,
  configured: false,
  configurationMessage: "Cloud sync is unavailable in this build.",
  connect: resolveVoid,
  disconnect: resolveVoid,
  dismissNotice: () => undefined,
  importProject: resolveVoid,
  importedProjectId: null,
  isAuthorized: false,
  notice: null,
  setSyncPolicy: resolveVoid,
  states: Object.freeze({}),
  syncNow: resolveVoid,
  syncOnCompile: resolveVoid
});

export function useGoogleDriveSync(_options: GoogleDriveSyncOptions): GoogleDriveSyncController {
  return controller;
}

export function GoogleDriveConnectionCard(_props: GoogleDriveConnectionCardProps) {
  return null;
}

export function GoogleDriveGlobalNotice(_props: GoogleDriveGlobalNoticeProps) {
  return null;
}
