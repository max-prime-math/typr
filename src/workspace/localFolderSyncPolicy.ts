export type LocalFolderSyncMode =
  | "manual"
  | "compile"
  | "interval"
  | "constant";

export interface LocalFolderSyncPolicy {
  mode: LocalFolderSyncMode;
  intervalMinutes: number;
}

export const DEFAULT_LOCAL_FOLDER_SYNC_POLICY: LocalFolderSyncPolicy = {
  mode: "manual",
  intervalMinutes: 5
};
export const MIN_LOCAL_FOLDER_SYNC_INTERVAL_MINUTES = 1;
export const MAX_LOCAL_FOLDER_SYNC_INTERVAL_MINUTES = 24 * 60;

export function normalizeLocalFolderSyncMode(
  value: unknown
): LocalFolderSyncMode {
  return value === "manual" ||
    value === "compile" ||
    value === "interval" ||
    value === "constant"
    ? value
    : DEFAULT_LOCAL_FOLDER_SYNC_POLICY.mode;
}

export function normalizeLocalFolderSyncIntervalMinutes(
  value: unknown
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LOCAL_FOLDER_SYNC_POLICY.intervalMinutes;
  }

  return Math.max(
    MIN_LOCAL_FOLDER_SYNC_INTERVAL_MINUTES,
    Math.min(MAX_LOCAL_FOLDER_SYNC_INTERVAL_MINUTES, Math.round(value))
  );
}

export function normalizeLocalFolderSyncPolicy(
  policy:
    | {
        mode?: unknown;
        intervalMinutes?: unknown;
      }
    | null
    | undefined
): LocalFolderSyncPolicy {
  return {
    mode: normalizeLocalFolderSyncMode(policy?.mode),
    intervalMinutes: normalizeLocalFolderSyncIntervalMinutes(
      policy?.intervalMinutes
    )
  };
}

export function getLocalFolderSyncPolicyMessage(
  policy: LocalFolderSyncPolicy
): string {
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
      return "Watching for changes";
  }
}

export function isLocalFolderIntervalSyncDue(
  policy: LocalFolderSyncPolicy,
  lastSyncedAt: string | null,
  now = Date.now()
): boolean {
  if (policy.mode !== "interval") {
    return false;
  }

  const lastSyncedTime = lastSyncedAt ? Date.parse(lastSyncedAt) : Number.NaN;
  if (!Number.isFinite(lastSyncedTime)) {
    return true;
  }

  return now - lastSyncedTime >= policy.intervalMinutes * 60_000;
}
