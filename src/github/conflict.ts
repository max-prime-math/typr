export interface SyncSnapshot {
  [documentName: string]: string;
}

export interface DocumentConflict {
  id: string;
  name: string;
  localContent: string;
  remoteContent: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

export interface ConflictSet {
  conflicts: DocumentConflict[];
  addedLocally: Array<{ id: string; name: string; content: string; updatedAt: string }>;
  addedRemotely: Array<{ name: string; content: string }>;
  autoResolved: Array<{ id: string; name: string; content: string; updatedAt: string }>;
}

export type ConflictChoice = "local" | "remote" | "delete";

export interface ConflictResolution {
  documentName: string;
  choice: ConflictChoice;
}

export function buildSyncSnapshot(
  documents: Array<{ name: string; updatedAt: string }>
): SyncSnapshot {
  const snapshot: SyncSnapshot = {};
  for (const doc of documents) {
    snapshot[doc.name] = doc.updatedAt;
  }
  return snapshot;
}

export function detectConflicts(
  local: Array<{ id: string; name: string; content: string; updatedAt: string }>,
  remote: Array<{ name: string; content: string }>,
  lastSnapshot: SyncSnapshot
): ConflictSet {
  const conflictSet: ConflictSet = {
    conflicts: [],
    addedLocally: [],
    addedRemotely: [],
    autoResolved: []
  };

  const localMap = new Map(local.map((d) => [d.name, d]));
  const remoteMap = new Map(remote.map((d) => [d.name, d]));

  const allNames = new Set([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...Object.keys(lastSnapshot)
  ]);

  for (const name of allNames) {
    const localDoc = localMap.get(name);
    const remoteDoc = remoteMap.get(name);
    const snapshotTime = lastSnapshot[name];

    if (localDoc && !remoteDoc) {
      if (snapshotTime === undefined) {
        conflictSet.addedLocally.push(localDoc);
      } else {
        conflictSet.conflicts.push({
          id: localDoc.id,
          name: localDoc.name,
          localContent: localDoc.content,
          remoteContent: "",
          localUpdatedAt: localDoc.updatedAt,
          remoteUpdatedAt: ""
        });
      }
      continue;
    }

    if (remoteDoc && !localDoc) {
      conflictSet.addedRemotely.push(remoteDoc);
      continue;
    }

    if (localDoc && remoteDoc) {
      const localTime = localDoc.updatedAt;
      const remoteTime = new Date().toISOString();
      const lastTime = snapshotTime ?? "";

      const localChanged = localTime > lastTime;
      const remoteChanged = remoteTime > lastTime;

      if (localChanged && remoteChanged) {
        if (localDoc.content !== remoteDoc.content) {
          conflictSet.conflicts.push({
            id: localDoc.id,
            name: localDoc.name,
            localContent: localDoc.content,
            remoteContent: remoteDoc.content,
            localUpdatedAt: localTime,
            remoteUpdatedAt: remoteTime
          });
        } else {
          conflictSet.autoResolved.push(localDoc);
        }
      } else if (localChanged) {
        conflictSet.autoResolved.push(localDoc);
      } else if (remoteChanged) {
        conflictSet.autoResolved.push({
          id: localDoc.id,
          name: localDoc.name,
          content: remoteDoc.content,
          updatedAt: localDoc.updatedAt
        });
      } else {
        conflictSet.autoResolved.push(localDoc);
      }
      continue;
    }
  }

  return conflictSet;
}

export function applyResolutions(
  local: Array<{ id: string; name: string; content: string; updatedAt: string }>,
  remote: Array<{ name: string; content: string }>,
  resolutions: ConflictResolution[]
): Array<{ id: string; name: string; content: string; updatedAt: string }> {
  const localMap = new Map(local.map((d) => [d.name, d]));
  const remoteMap = new Map(remote.map((d) => [d.name, d]));
  const resolutionMap = new Map(resolutions.map((r) => [r.documentName, r.choice]));

  const result = new Map<string, { id: string; name: string; content: string; updatedAt: string }>();

  for (const d of local) {
    result.set(d.id, d);
  }

  for (const d of remote) {
    const resolution = resolutionMap.get(d.name);

    if (resolution === "remote") {
      const existing = localMap.get(d.name);
      result.set(existing?.id ?? d.name, {
        id: existing?.id ?? d.name,
        name: d.name,
        content: d.content,
        updatedAt: existing?.updatedAt ?? new Date().toISOString()
      });
    } else if (resolution === "delete") {
      const existing = localMap.get(d.name);
      if (existing) {
        result.delete(existing.id);
      }
    } else if (resolution === "local") {
      // keep local
    } else if (!localMap.has(d.name)) {
      result.set(d.name, {
        id: d.name,
        name: d.name,
        content: d.content,
        updatedAt: new Date().toISOString()
      });
    }
  }

  return Array.from(result.values());
}
