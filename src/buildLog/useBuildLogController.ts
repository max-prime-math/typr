import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createBuildLogStorageKey,
  filterBuildLogEntries,
  formatBuildLogEntriesText,
  formatBuildLogEntryText,
  persistBuildLogEntries,
  readStoredBuildLogEntries,
  type BuildLogEntry,
  type BuildLogFilter
} from "./buildLogState";

export interface BuildLogController {
  appendEntry: (entry: Omit<BuildLogEntry, "id">) => void;
  clear: () => void;
  copyDiagnostics: () => void;
  copyEntries: () => void;
  copyEntry: (entry: BuildLogEntry) => void;
  entries: BuildLogEntry[];
  exportJson: (download: DownloadBuildLogFile) => void;
  exportText: (download: DownloadBuildLogFile) => void;
  feedback: string;
  filter: BuildLogFilter;
  filteredEntries: BuildLogEntry[];
  hideRepeatedWarnings: boolean;
  searchQuery: string;
  setFilter: React.Dispatch<React.SetStateAction<BuildLogFilter>>;
  setHideRepeatedWarnings: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

export type DownloadBuildLogFile = (name: string, content: string, type: string) => void;

export function useBuildLogController(options: {
  currentPath: string;
  projectKey: string;
}): BuildLogController {
  const [entries, setEntries] = useState<BuildLogEntry[]>([]);
  const [filter, setFilter] = useState<BuildLogFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [hideRepeatedWarnings, setHideRepeatedWarnings] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const storageKey = createBuildLogStorageKey(options.projectKey);
  const filteredEntries = useMemo(
    () => filterBuildLogEntries(entries, filter, options.currentPath, searchQuery),
    [entries, filter, options.currentPath, searchQuery]
  );

  useEffect(() => {
    setIsHydrated(false);
    setEntries(readStoredBuildLogEntries(
      typeof window === "undefined" ? undefined : window.localStorage,
      storageKey
    ));
    setIsHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!isHydrated) return;
    persistBuildLogEntries(
      typeof window === "undefined" ? undefined : window.localStorage,
      storageKey,
      entries
    );
  }, [entries, isHydrated, storageKey]);

  const appendEntry = useCallback((entry: Omit<BuildLogEntry, "id">) => {
    setEntries((currentEntries) => [{
      ...entry,
      id: entry.startedAt + ":" + entry.sourcePath + ":" + currentEntries.length
    }, ...currentEntries].slice(0, 20));
  }, []);

  const copyText = useCallback(async (text: string, successFeedback: string) => {
    if (!text.trim()) {
      setFeedback("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(successFeedback);
    } catch {
      setFeedback("Clipboard access is unavailable.");
    }
  }, []);

  return {
    appendEntry,
    clear: () => setEntries([]),
    copyDiagnostics: () => void copyText(
      filteredEntries.flatMap((entry) => entry.diagnostics.map((diagnostic) =>
        `${entry.sourcePath}: ${diagnostic.severity}: ${diagnostic.message}`
      )).join("\n"),
      "Diagnostics copied."
    ),
    copyEntries: () => void copyText(formatBuildLogEntriesText(filteredEntries), "Build log copied."),
    copyEntry: (entry) => void copyText(formatBuildLogEntryText(entry), "Build entry copied."),
    entries,
    exportJson: (download) => {
      download(`typr-build-log-${options.projectKey}.json`, JSON.stringify(filteredEntries, null, 2), "application/json");
      setFeedback("Build log exported.");
    },
    exportText: (download) => {
      download(`typr-build-log-${options.projectKey}.txt`, formatBuildLogEntriesText(filteredEntries), "text/plain");
      setFeedback("Build log text exported.");
    },
    feedback,
    filter,
    filteredEntries,
    hideRepeatedWarnings,
    searchQuery,
    setFilter,
    setHideRepeatedWarnings,
    setSearchQuery
  };
}
