import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../app/appState";
import {
  createProjectStorageFromSnapshot,
  getSelectedProjectRepository,
  writeProjectFile
} from "../project/projectState";
import { createMemoryGitFileStorage, createRepoBackend } from "./repoBackend";

function createProject() {
  const storage = createProjectStorageFromSnapshot(createDefaultSnapshot());
  const project = getSelectedProjectRepository(storage);
  if (!project) {
    throw new Error("Expected default project.");
  }
  return project;
}

describe("repoBackend", () => {
  it("stages, commits, logs, and reopens a real local repo", async () => {
    const gitStorage = createMemoryGitFileStorage();
    const backend = createRepoBackend(gitStorage);
    let project = createProject();

    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;

    const initialStatus = await backend.status(project);
    expect(initialStatus.ok && initialStatus.value.entries.length).toBeGreaterThan(0);

    const staged = await backend.stagePaths(project, ["."]);
    expect(staged.ok).toBe(true);
    expect(staged.ok && staged.value.entries.every((entry) => entry.staged !== null)).toBe(true);

    const commit = await backend.commit(project, { message: "initial commit" });
    expect(commit.ok).toBe(true);
    expect(commit.ok && commit.value.shortSha).toHaveLength(7);

    project = writeProjectFile(project, "main.typ", "#set page(width: auto)\nChanged\n");
    const modified = await backend.status(project);
    expect(modified.ok && modified.value.entries).toEqual([
      {
        path: "main.typ",
        staged: null,
        worktree: "modified"
      }
    ]);

    const reopenedBackend = createRepoBackend(gitStorage);
    const log = await reopenedBackend.log(project);
    expect(log.ok && log.value[0]?.message).toBe("initial commit");
  });

  it("blocks unsafe branch switches with local changes", async () => {
    const backend = createRepoBackend(createMemoryGitFileStorage());
    let project = createProject();

    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;

    await backend.stagePaths(project, ["."]);
    await backend.commit(project, { message: "initial commit" });
    await backend.createBranch(project, "draft");

    project = writeProjectFile(project, "main.typ", "Uncommitted\n");
    const switched = await backend.switchBranch(project, "draft");
    expect(switched.ok).toBe(false);
    expect(!switched.ok && switched.error.code).toBe("unsafe-worktree");
  });
});
