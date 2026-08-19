import type { Dispatch, SetStateAction } from "react";
import type { AppSnapshot } from "../../app/appState";
import type { CloudSyncMode } from "../../cloud/cloudSync";
import type { GoogleDriveProjectState } from "../../cloud/googleDriveConnectionState";
import type { TyprProjectStorageState } from "../../project/projectState";

export interface GoogleDriveSyncOptions {
  clientId: string;
  cloudProjectNumber: string;
  isHydrated: boolean;
  pickerApiKey: string;
  projectStorage: TyprProjectStorageState;
  setProjectStorage: Dispatch<SetStateAction<TyprProjectStorageState>>;
  setRawSnapshot: Dispatch<SetStateAction<AppSnapshot>>;
}

export interface GoogleDriveNotice {
  message: string;
  projectId: string | null;
  title: string;
  tone: "error" | "info" | "success";
}

export interface GoogleDriveSyncController {
  changeLocation(projectId: string): Promise<void>;
  chooseLocation(projectId: string): Promise<void>;
  configured: boolean;
  configurationMessage: string;
  connect(projectId: string): Promise<void>;
  disconnect(projectId: string): Promise<void>;
  dismissNotice(): void;
  importProject(projectName?: string): Promise<void>;
  importedProjectId: string | null;
  isAuthorized: boolean;
  notice: GoogleDriveNotice | null;
  setSyncPolicy(projectId: string, policy: { intervalMinutes?: number; mode: CloudSyncMode }): Promise<void>;
  states: Record<string, GoogleDriveProjectState>;
  syncNow(projectId: string): Promise<void>;
  syncOnCompile(projectId: string): Promise<void>;
}

export interface GoogleDriveConnectionCardProps {
  className?: string;
  controller: GoogleDriveSyncController;
  projectId: string;
  projectName: string;
  state?: GoogleDriveProjectState;
}

export interface GoogleDriveGlobalNoticeProps {
  dismiss(): void;
  notice: GoogleDriveNotice;
  placement?: "top" | "bottom-left";
}
