import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppSnapshot } from "../app/appState";
import {
  SETTINGS_FILE_NAMES,
  createSettingsFileContents,
  parseSettingsFile,
  readSettingsFileContents,
  serializeSettingsFile,
  writeSettingsFileContents,
  type SettingsFileContents,
  type SettingsFileErrors,
  type SettingsFileName
} from "./settingsFiles";

export function useSettingsFiles(
  snapshot: AppSnapshot,
  setSnapshot: Dispatch<SetStateAction<AppSnapshot>>,
  isHydrated: boolean
) {
  const [contents, setContents] = useState<SettingsFileContents>(() =>
    readSettingsFileContents(
      typeof window === "undefined" ? undefined : window.localStorage,
      snapshot.preferences
    )
  );
  const [errors, setErrors] = useState<SettingsFileErrors>({});
  const contentsRef = useRef(contents);
  const snapshotRef = useRef(snapshot);
  const hasAppliedStoredFilesRef = useRef(false);
  const skipFirstPreferenceSyncRef = useRef(true);
  contentsRef.current = contents;
  snapshotRef.current = snapshot;

  const changeFile = useCallback((fileName: SettingsFileName, source: string) => {
    const nextContents = { ...contentsRef.current, [fileName]: source };
    contentsRef.current = nextContents;
    setContents(nextContents);
    writeSettingsFileContents(
      typeof window === "undefined" ? undefined : window.localStorage,
      nextContents
    );
    const current = snapshotRef.current;
    const result = parseSettingsFile(fileName, source, current);
    const nextSnapshot = { ...current, preferences: result.preferences };
    snapshotRef.current = nextSnapshot;
    setErrors((currentErrors) => ({ ...currentErrors, [fileName]: result.error ?? undefined }));
    setSnapshot(nextSnapshot);
  }, [setSnapshot]);

  const repairFile = useCallback((fileName: SettingsFileName) => {
    changeFile(fileName, serializeSettingsFile(fileName, snapshot.preferences));
  }, [changeFile, snapshot.preferences]);

  useEffect(() => {
    if (!isHydrated || hasAppliedStoredFilesRef.current) return;
    hasAppliedStoredFilesRef.current = true;
    // Apply persisted files once. Invalid source is deliberately kept available for repair.
    for (const fileName of SETTINGS_FILE_NAMES) {
      changeFile(fileName, contentsRef.current[fileName]);
    }
    // Initial validation only; later edits go through changeFile.
  }, [changeFile, isHydrated]);

  useEffect(() => {
    if (!hasAppliedStoredFilesRef.current) return;
    if (skipFirstPreferenceSyncRef.current) {
      skipFirstPreferenceSyncRef.current = false;
      return;
    }
    let changed = false;
    const next = { ...contentsRef.current };
    for (const fileName of SETTINGS_FILE_NAMES) {
      if (errors[fileName]) continue;
      const serialized = serializeSettingsFile(fileName, snapshot.preferences);
      if (next[fileName] !== serialized) {
        next[fileName] = serialized;
        changed = true;
      }
    }
    if (!changed) return;
    contentsRef.current = next;
    setContents(next);
    writeSettingsFileContents(
      typeof window === "undefined" ? undefined : window.localStorage,
      next
    );
  }, [errors, snapshot.preferences]);

  return { changeFile, contents, errors, repairFile };
}
