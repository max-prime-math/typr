import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_FOLDER_SYNC_POLICY,
  getLocalFolderSyncPolicyMessage,
  isLocalFolderIntervalSyncDue,
  normalizeLocalFolderSyncPolicy
} from "./localFolderSyncPolicy";

describe("local folder sync policy", () => {
  it("defaults invalid persisted values to manual sync", () => {
    expect(normalizeLocalFolderSyncPolicy(undefined)).toEqual(
      DEFAULT_LOCAL_FOLDER_SYNC_POLICY
    );
    expect(
      normalizeLocalFolderSyncPolicy({
        mode: "sometimes",
        intervalMinutes: Number.NaN
      })
    ).toEqual(DEFAULT_LOCAL_FOLDER_SYNC_POLICY);
    expect(DEFAULT_LOCAL_FOLDER_SYNC_POLICY).toEqual({
      mode: "manual",
      intervalMinutes: 5
    });
  });

  it("normalizes interval bounds and describes each mode", () => {
    expect(
      normalizeLocalFolderSyncPolicy({
        mode: "interval",
        intervalMinutes: 0
      })
    ).toEqual({ mode: "interval", intervalMinutes: 1 });
    expect(
      normalizeLocalFolderSyncPolicy({
        mode: "interval",
        intervalMinutes: 10_000
      })
    ).toEqual({ mode: "interval", intervalMinutes: 1440 });
    expect(
      getLocalFolderSyncPolicyMessage({
        mode: "compile",
        intervalMinutes: 5
      })
    ).toBe("Syncs on compile");
    expect(
      getLocalFolderSyncPolicyMessage({
        mode: "interval",
        intervalMinutes: 1
      })
    ).toBe("Syncs every 1 minute");
  });

  it("runs interval sync only when the configured period has elapsed", () => {
    const now = Date.parse("2026-07-26T12:10:00.000Z");
    const policy = { mode: "interval" as const, intervalMinutes: 5 };

    expect(
      isLocalFolderIntervalSyncDue(
        policy,
        "2026-07-26T12:06:00.000Z",
        now
      )
    ).toBe(false);
    expect(
      isLocalFolderIntervalSyncDue(
        policy,
        "2026-07-26T12:05:00.000Z",
        now
      )
    ).toBe(true);
    expect(isLocalFolderIntervalSyncDue(policy, null, now)).toBe(true);
    expect(
      isLocalFolderIntervalSyncDue(
        { mode: "manual", intervalMinutes: 5 },
        null,
        now
      )
    ).toBe(false);
  });
});
