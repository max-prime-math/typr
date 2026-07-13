import { describe, expect, it } from "vitest";
import { createDefaultSnapshot, updateActiveDocument } from "./appState";
import {
  applySelectedProjectUpdate,
  applyWorkspaceSnapshotUpdate
} from "./workspacePersistence";
import {
  createProjectStorageFromSnapshot,
  getSelectedProjectRepository
} from "../project/projectState";

describe("workspace persistence coordination", () => {
  it("keeps repository storage synchronized with snapshot edits", () => {
    const snapshot = createDefaultSnapshot();
    const storage = createProjectStorageFromSnapshot(snapshot);
    const next = applyWorkspaceSnapshotUpdate(
      { projectStorage: storage, snapshot },
      (current) => updateActiveDocument(current, "persisted edit")
    );
    const project = getSelectedProjectRepository(next.projectStorage);
    const activeDocument = next.snapshot.project.documents.find(
      (entry) => entry.id === next.snapshot.project.activeDocumentId
    );
    const persistedEntry = project?.filesystem.entries[activeDocument?.name ?? ""];

    expect(activeDocument?.content).toBe("persisted edit");
    expect(persistedEntry?.kind).toBe("file");
    expect(persistedEntry?.kind === "file" ? persistedEntry.content : null).toBe("persisted edit");
  });

  it("mirrors selected repository edits back into the legacy snapshot", () => {
    const snapshot = createDefaultSnapshot();
    const storage = createProjectStorageFromSnapshot(snapshot);
    const next = applySelectedProjectUpdate(
      { projectStorage: storage, snapshot },
      (project) => ({ ...project, displayName: "Renamed workspace" })
    );

    expect(getSelectedProjectRepository(next.projectStorage)?.displayName).toBe(
      "Renamed workspace"
    );
    expect(next.snapshot.project.name).toBe("Renamed workspace");
  });
});
