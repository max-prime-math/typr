import {
  GoogleDriveConnectionCard as HostedConnectionCard,
  GoogleDriveGlobalNotice as HostedGlobalNotice
} from "../../app/GoogleDriveConnectionCard";
import { useGoogleDriveSync as useHostedGoogleDriveSync } from "../../app/useGoogleDriveSync";
import type {
  GoogleDriveConnectionCardProps,
  GoogleDriveGlobalNoticeProps,
  GoogleDriveSyncController,
  GoogleDriveSyncOptions
} from "./types";
import "./hosted.css";

export function useGoogleDriveSync(options: GoogleDriveSyncOptions): GoogleDriveSyncController {
  return useHostedGoogleDriveSync(options);
}

export function GoogleDriveConnectionCard(props: GoogleDriveConnectionCardProps) {
  return <HostedConnectionCard {...props} />;
}

export function GoogleDriveGlobalNotice(props: GoogleDriveGlobalNoticeProps) {
  return <HostedGlobalNotice {...props} />;
}
