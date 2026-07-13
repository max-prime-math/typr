import { describe, expect, it } from "vitest";
import {
  BUILD_LOG_STORAGE_KEY,
  createBuildLogStorageKey,
  filterBuildLogEntries,
  formatBuildLogEntriesText,
  readStoredBuildLogEntries,
  type BuildLogEntry
} from "./buildLogState";

const entries: BuildLogEntry[] = [
  {
    id: "latest",
    sourcePath: "chapters/main.tex",
    language: "latex",
    engine: "busytex",
    ok: false,
    startedAt: "2026-07-11T12:00:00.000Z",
    durationMs: 120,
    diagnostics: [{ severity: "error", message: "Undefined control sequence", path: "chapters/main.tex" }],
    trigger: "manual",
    compileMode: "full",
    cached: false,
    outputChanged: false,
    rawLog: "TeX packages unresolved: demo",
    packageDetails: ["TeX packages unresolved: demo"],
    shellEscapeUnavailable: false
  },
  {
    id: "older",
    sourcePath: "notes.typ",
    language: "typst",
    engine: "typst-ts",
    ok: true,
    startedAt: "2026-07-11T11:00:00.000Z",
    durationMs: 30,
    diagnostics: [{ severity: "warning", message: "Unused label", path: "notes.typ" }],
    trigger: "auto",
    compileMode: "none",
    cached: true,
    outputChanged: true,
    packageDetails: [],
    shellEscapeUnavailable: false
  }
];

describe("build log state", () => {
  it("retains project-scoped storage and normalizes stored entries", () => {
    expect(BUILD_LOG_STORAGE_KEY).toBe("typr.build-log.v1");
    expect(createBuildLogStorageKey("project-a")).toBe("typr.build-log.v1:project-a");

    const storage = {
      getItem: () => JSON.stringify(entries.map(({ packageDetails: _packages, ...entry }) => entry))
    };
    expect(readStoredBuildLogEntries(storage, "typr.build-log.v1:project-a")[0]?.packageDetails).toEqual([]);
  });

  it("filters by diagnostics, file, language, and searchable formatted output", () => {
    expect(filterBuildLogEntries(entries, "errors", "notes.typ", "")).toEqual([entries[0]]);
    expect(filterBuildLogEntries(entries, "warnings", "notes.typ", "")).toEqual([entries[1]]);
    expect(filterBuildLogEntries(entries, "current-file", "notes.typ", "")).toEqual([entries[1]]);
    expect(filterBuildLogEntries(entries, "latex", "notes.typ", "")).toEqual([entries[0]]);
    expect(filterBuildLogEntries(entries, "all", "notes.typ", "undefined control")).toEqual([entries[0]]);
    expect(formatBuildLogEntriesText(entries)).toContain("ERROR chapters/main.tex");
  });
});
