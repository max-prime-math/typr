import type { TyprProjectRepository } from "../project/projectState";
import {
  applySyncTreeToProject,
  createProjectSyncTree,
  resolveSyncTrees,
  type LocalFolderSyncTree
} from "../workspace/localFolderSync";

export type CloudStorageProviderId =
  | "google-drive"
  | "dropbox"
  | "onedrive"
  | "typr-companion";

export type CloudSyncMode =
  | "manual"
  | "compile"
  | "interval"
  | "constant";

export interface CloudSyncPolicy {
  mode: CloudSyncMode;
  intervalMinutes: number;
}

export interface CloudProjectBindingRecord {
  version: 1 | 2;
  projectId: string;
  providerId: CloudStorageProviderId;
  remoteRootId: string;
  remoteRootName: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  syncMode: CloudSyncMode;
  syncIntervalMinutes: number;
  worktreeSignatures: Record<string, string>;
  providerData?: Record<string, string>;
}

export interface CloudProjectRemote {
  readonly providerId: CloudStorageProviderId;
  readTree(remoteRootId: string): Promise<LocalFolderSyncTree>;
  writeTree(
    remoteRootId: string,
    currentTree: LocalFolderSyncTree,
    desiredTree: LocalFolderSyncTree
  ): Promise<void>;
}

export const DEFAULT_CLOUD_SYNC_POLICY: CloudSyncPolicy = {
  mode: "manual",
  intervalMinutes: 15
};

const MIN_CLOUD_SYNC_INTERVAL_MINUTES = 1;
const MAX_CLOUD_SYNC_INTERVAL_MINUTES = 24 * 60;

export function normalizeCloudSyncPolicy(
  policy:
    | {
        mode?: unknown;
        intervalMinutes?: unknown;
      }
    | null
    | undefined
): CloudSyncPolicy {
  const mode =
    policy?.mode === "manual" ||
    policy?.mode === "compile" ||
    policy?.mode === "interval" ||
    policy?.mode === "constant"
      ? policy.mode
      : DEFAULT_CLOUD_SYNC_POLICY.mode;
  const intervalMinutes =
    typeof policy?.intervalMinutes === "number" &&
    Number.isFinite(policy.intervalMinutes)
      ? Math.max(
          MIN_CLOUD_SYNC_INTERVAL_MINUTES,
          Math.min(
            MAX_CLOUD_SYNC_INTERVAL_MINUTES,
            Math.round(policy.intervalMinutes)
          )
        )
      : DEFAULT_CLOUD_SYNC_POLICY.intervalMinutes;

  return { mode, intervalMinutes };
}

export function getCloudSyncPolicyMessage(policy: CloudSyncPolicy): string {
  switch (policy.mode) {
    case "manual":
      return "Manual sync";
    case "compile":
      return "Syncs on compile";
    case "interval":
      return `Syncs every ${policy.intervalMinutes} ${
        policy.intervalMinutes === 1 ? "minute" : "minutes"
      }`;
    case "constant":
      return "Watching for browser changes";
  }
}

export function isCloudIntervalSyncDue(
  policy: CloudSyncPolicy,
  lastSyncedAt: string | null,
  now = Date.now()
): boolean {
  if (policy.mode !== "interval") {
    return false;
  }

  const lastSyncedTime = lastSyncedAt ? Date.parse(lastSyncedAt) : Number.NaN;
  return (
    !Number.isFinite(lastSyncedTime) ||
    now - lastSyncedTime >= policy.intervalMinutes * 60_000
  );
}

export async function synchronizeCloudProject(options: {
  binding: CloudProjectBindingRecord;
  project: TyprProjectRepository;
  remote: CloudProjectRemote;
}): Promise<{
  binding: CloudProjectBindingRecord;
  desiredTree: LocalFolderSyncTree;
  project: TyprProjectRepository;
  startedProjectTree: LocalFolderSyncTree;
}> {
  if (options.binding.providerId !== options.remote.providerId) {
    throw new Error(
      `Cloud binding provider ${options.binding.providerId} cannot use ${options.remote.providerId}.`
    );
  }

  const startedProjectTree = createProjectSyncTree(options.project);
  const remoteTree = await options.remote.readTree(
    options.binding.remoteRootId
  );
  const resolution = resolveSyncTrees({
    baseline: options.binding.worktreeSignatures,
    browser: startedProjectTree,
    local: remoteTree
  });

  await options.remote.writeTree(
    options.binding.remoteRootId,
    remoteTree,
    resolution.desired
  );

  const lastSyncedAt = new Date().toISOString();
  return {
    desiredTree: resolution.desired,
    project: applySyncTreeToProject(
      options.project,
      startedProjectTree,
      resolution.desired
    ),
    startedProjectTree,
    binding: {
      ...options.binding,
      lastSyncedAt,
      worktreeSignatures: resolution.signatures
    }
  };
}
