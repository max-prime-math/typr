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
  persistAtomic(
    payload: PersistencePayload<Snapshot, ProjectStorage>,
    save: () => Promise<void>
  ): Promise<void>;
  hasPendingChanges(): boolean;
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
  let atomicRequest: Promise<void> | null = null;
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
    if (atomicRequest) {
      return atomicRequest;
    }
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
      const save = () => Promise.all([
          saveSnapshot(payload.snapshot),
          saveProjectStorage(payload.projectStorage)
        ]).then(() => undefined);
      const previousRequest = lastPersistRequest;
      request = previousRequest
        ? previousRequest.catch(() => undefined).then(save)
        : save();
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

  const persistAtomic = (
    payload: PersistencePayload<Snapshot, ProjectStorage>,
    save: () => Promise<void>
  ): Promise<void> => {
    if (disposed) return Promise.reject(new Error("Workspace persistence is disposed."));
    if (atomicRequest) return Promise.reject(new Error("Another atomic workspace persistence request is active."));

    clearPendingDebounce();
    latestPayload = payload;
    saveRequestId += 1;
    const requestId = saveRequestId;
    const previousRequest = lastPersistRequest;
    onStatusChange?.("saving");
    const request = Promise.resolve().then(async () => {
      if (previousRequest) await previousRequest.catch(() => undefined);
      await save();
    });
    atomicRequest = request;
    lastPersistRequest = request;

    void request.then(
      () => {
        lastPersistedPayload = payload;
        if (!disposed && requestId === saveRequestId) onStatusChange?.("saved");
      },
      () => {
        if (!disposed && requestId === saveRequestId) onStatusChange?.("error");
      }
    ).finally(() => {
      if (atomicRequest === request) atomicRequest = null;
      if (lastPersistRequest === request) lastPersistRequest = null;
      if (!disposed && !isSamePayload(readLatestPayload(), lastPersistedPayload)) {
        clearPendingDebounce();
        debounceHandle = setTimeout(persistNow, debounceMs);
      }
    });
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
      if (atomicRequest) return;
      if (isSamePayload(readLatestPayload(), lastPersistedPayload)) {
        return;
      }

      debounceHandle = setTimeout(persistNow, debounceMs);
    },
    persistNow,
    persistAtomic,
    hasPendingChanges() {
      const payload = readLatestPayload();
      return (
        atomicRequest !== null || lastPersistRequest !== null ||
        (payload !== null && !isSamePayload(payload, lastPersistedPayload))
      );
    },
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
