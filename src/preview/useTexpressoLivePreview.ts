import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TypstEditorTextChange } from "../editor/TypstEditor";
import type { CompanionConnectionStatus } from "../compiler/companionClient";
import {
  TexpressoClient,
  createTexpressoRangeFromOffsets,
  type TexpressoLiveSnapshot,
  type TexpressoProjectSnapshot
} from "./texpressoClient";

const INITIAL_STATE: TexpressoLiveSnapshot = {
  status: "inactive",
  sessionGeneration: 0,
  submittedRevision: 0,
  latestCompletedRevision: null,
  lastGoodRevision: null,
  visibleRevision: null,
  pages: [],
  diagnostics: []
};

export function useTexpressoLivePreview({
  enabled,
  companion,
  apiKey,
  project,
  sessionKey
}: {
  enabled: boolean;
  companion: CompanionConnectionStatus;
  apiKey: string;
  project: TexpressoProjectSnapshot | null;
  sessionKey: string | null;
}) {
  const [snapshot, setSnapshot] = useState<TexpressoLiveSnapshot>(INITIAL_STATE);
  const projectRef = useRef(project);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  projectRef.current = project;

  const client = useMemo(
    () => new TexpressoClient({ onSnapshot: setSnapshot }),
    []
  );

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    const currentProject = projectRef.current;
    if (!enabled || companion.state !== "available" || !currentProject) {
      return;
    }
    clearRetry();
    client.start(companion.baseUrl, currentProject, apiKey);
  }, [apiKey, clearRetry, client, companion.baseUrl, companion.state, enabled]);

  useEffect(() => {
    if (!enabled || !project || !sessionKey) {
      clearRetry();
      client.stop({ preserveVisible: Boolean(project), detail: "Live preview is off." });
      return;
    }
    if (companion.state !== "available") {
      clearRetry();
      client.stop({
        preserveVisible: true,
        status: "disconnected",
        detail: companion.state === "checking"
          ? "Waiting for Typr Companion."
          : companion.message ?? "Typr Companion is unavailable."
      });
      return;
    }
    retryCountRef.current = 0;
    start();
    return clearRetry;
  }, [
    clearRetry,
    client,
    companion.message,
    companion.state,
    enabled,
    project === null,
    sessionKey,
    start
  ]);

  useEffect(() => {
    if (!enabled || companion.state !== "available" || !project || snapshot.status === "connecting") {
      return;
    }
    if (snapshot.status === "inactive") {
      return;
    }
    const result = client.synchronizeProject(project);
    if (result === "restart-required") {
      client.start(companion.baseUrl, project, apiKey);
    }
  }, [apiKey, client, companion.baseUrl, companion.state, enabled, project, snapshot.status]);

  useEffect(() => {
    const reconnectableFailure = snapshot.status === "disconnected" || (
      snapshot.status === "error" &&
      /timed out waiting for texpresso flush|texpresso exited unexpectedly/i.test(snapshot.statusDetail ?? "")
    );
    if (!enabled || companion.state !== "available" || !project || !reconnectableFailure) {
      return;
    }
    clearRetry();
    const retryIndex = retryCountRef.current++;
    const delay = Math.min(10_000, retryIndex === 0 ? 1_500 : 2_500 * 2 ** (retryIndex - 1));
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      start();
    }, delay);
    return clearRetry;
  }, [clearRetry, companion.state, enabled, project, snapshot.status, start]);

  useEffect(() => () => {
    clearRetry();
    client.dispose();
  }, [clearRetry, client]);

  const sendEditorChanges = useCallback((
    path: string,
    changes: readonly TypstEditorTextChange[],
    previousValue: string
  ) => {
    client.sendSourceChanges(
      path,
      changes.map((change) => ({
        range: createTexpressoRangeFromOffsets(previousValue, change.from, change.to),
        text: change.text
      }))
    );
  }, [client]);

  const acknowledgeVisibleRevision = useCallback((generation: number, revision: number) => {
    client.acknowledgeVisibleRevision(generation, revision);
  }, [client]);

  return {
    snapshot,
    sendEditorChanges,
    acknowledgeVisibleRevision,
    reconnect: start
  };
}
