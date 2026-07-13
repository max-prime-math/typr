export interface PersistencePayload<Snapshot, ProjectStorage> {
  snapshot: Snapshot;
  projectStorage: ProjectStorage;
}

interface LifecycleEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface VisibilityEventTarget extends LifecycleEventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

export interface LifecyclePersistence<Snapshot, ProjectStorage> {
  update(payload: PersistencePayload<Snapshot, ProjectStorage>): void;
  persistNow(): Promise<void>;
  dispose(): void;
}

interface LifecyclePersistenceOptions<Snapshot, ProjectStorage> {
  debounceMs: number;
  documentTarget: VisibilityEventTarget;
  getCurrentPayload?: () => PersistencePayload<Snapshot, ProjectStorage> | null;
  onStatusChange?: (status: "saving" | "saved" | "error") => void;
  saveProjectStorage: (projectStorage: ProjectStorage) => Promise<void>;
  saveSnapshot: (snapshot: Snapshot) => Promise<void>;
  windowTarget: LifecycleEventTarget;
}

function isSamePayload<Snapshot, ProjectStorage>(
  left: PersistencePayload<Snapshot, ProjectStorage> | null,
  right: PersistencePayload<Snapshot, ProjectStorage> | null
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.snapshot === right.snapshot &&
    left.projectStorage === right.projectStorage
  );
}

export function createLifecyclePersistence<Snapshot, ProjectStorage>({
  debounceMs,
  documentTarget,
  getCurrentPayload,
  onStatusChange,
  saveProjectStorage,
  saveSnapshot,
  windowTarget
}: LifecyclePersistenceOptions<Snapshot, ProjectStorage>): LifecyclePersistence<
  Snapshot,
  ProjectStorage
> {
  let disposed = false;
  let latestPayload: PersistencePayload<Snapshot, ProjectStorage> | null = null;
  let lastPersistedPayload: PersistencePayload<Snapshot, ProjectStorage> | null = null;
  let lastPersistRequest: Promise<void> | null = null;
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let saveRequestId = 0;

  const clearPendingDebounce = () => {
    if (debounceHandle === null) {
      return;
    }

    clearTimeout(debounceHandle);
    debounceHandle = null;
  };

  const readLatestPayload = () => getCurrentPayload?.() ?? latestPayload;

  const persistNow = (): Promise<void> => {
    if (disposed) {
      return Promise.resolve();
    }

    clearPendingDebounce();
    const payload = readLatestPayload();
    if (payload === null) {
      return Promise.resolve();
    }
    if (isSamePayload(payload, lastPersistedPayload)) {
      return lastPersistRequest ?? Promise.resolve();
    }

    lastPersistedPayload = payload;
    saveRequestId += 1;
    const requestId = saveRequestId;
    onStatusChange?.("saving");

    let request: Promise<void>;
    try {
      request = Promise.all([
        saveSnapshot(payload.snapshot),
        saveProjectStorage(payload.projectStorage)
      ]).then(() => undefined);
    } catch {
      if (isSamePayload(payload, lastPersistedPayload)) {
        lastPersistedPayload = null;
      }
      lastPersistRequest = null;
      onStatusChange?.("error");
      return Promise.resolve();
    }
    lastPersistRequest = request;

    void request.then(
      () => {
        if (lastPersistRequest === request) {
          lastPersistRequest = null;
        }
        if (!disposed && requestId === saveRequestId) {
          onStatusChange?.("saved");
        }
      },
      () => {
        if (lastPersistRequest === request) {
          lastPersistRequest = null;
        }
        if (isSamePayload(payload, lastPersistedPayload)) {
          lastPersistedPayload = null;
        }
        if (!disposed && requestId === saveRequestId) {
          onStatusChange?.("error");
        }
      }
    );
    return request;
  };

  const handlePageHide = () => {
    persistNow();
  };
  const handleVisibilityChange = () => {
    if (documentTarget.visibilityState === "hidden") {
      persistNow();
    }
  };

  windowTarget.addEventListener("pagehide", handlePageHide);
  documentTarget.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    update(payload) {
      if (disposed) {
        return;
      }

      latestPayload = payload;
      clearPendingDebounce();
      if (isSamePayload(readLatestPayload(), lastPersistedPayload)) {
        return;
      }

      debounceHandle = setTimeout(persistNow, debounceMs);
    },
    persistNow,
    dispose() {
      if (disposed) {
        return;
      }

      windowTarget.removeEventListener("pagehide", handlePageHide);
      documentTarget.removeEventListener("visibilitychange", handleVisibilityChange);
      void persistNow();
      disposed = true;
    }
  };
}
