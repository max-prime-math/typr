import { describe, expect, it } from "vitest";
import { createDefaultSnapshot, DEFAULT_DOCUMENT_NAME } from "../app/appState";
import {
  createProjectStorageFromSnapshot,
  createEmptyProjectRepository,
  getSelectedProjectRepository,
  readProjectFileBytes,
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

async function initAndCommitDefault(project = createProject()) {
  const backend = createRepoBackend(createMemoryGitFileStorage());
  const init = await backend.initRepository(project);
  expect(init.ok).toBe(true);
  if (!init.ok) {
    throw new Error("init failed");
  }
  const initializedProject = init.value;
  const stage = await backend.stagePaths(initializedProject, ["."]);
  expect(stage.ok).toBe(true);
  const commit = await backend.commit(initializedProject, { message: "initial commit" });
  expect(commit.ok).toBe(true);
  if (!commit.ok) {
    throw new Error("commit failed");
  }
  return { backend, project: initializedProject, commit: commit.value };
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

    project = writeProjectFile(project, DEFAULT_DOCUMENT_NAME, "#set page(width: auto)\nChanged\n");
    const modified = await backend.status(project);
    expect(modified.ok && modified.value.entries).toEqual([
      {
        path: DEFAULT_DOCUMENT_NAME,
        staged: null,
        worktree: "modified"
      }
    ]);

    const reopenedBackend = createRepoBackend(gitStorage);
    const log = await reopenedBackend.log(project);
    expect(log.ok && log.value[0]?.message).toBe("initial commit");
  });

  it("reports git object storage and prunes unreachable loose objects", async () => {
    const gitStorage = createMemoryGitFileStorage();
    const backend = createRepoBackend(gitStorage);
    let project = createProject();

    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;

    const orphan = await backend.writeObject(project, "blob", new TextEncoder().encode("orphan\n"));
    expect(orphan.ok).toBe(true);

    const before = await backend.getStorageStats(project);
    expect(before.ok).toBe(true);
    expect(before.ok && before.value.objectCounts.blob).toBeGreaterThan(0);

    const pruned = await backend.pruneObjects(project);
    expect(pruned.ok).toBe(true);
    expect(pruned.ok && pruned.value.deletedObjectCount).toBe(1);

    if (orphan.ok) {
      const hasOrphan = await backend.hasObject(project, orphan.value);
      expect(hasOrphan.ok && hasOrphan.value).toBe(false);
    }
  });

  it("ignores untracked files matched by project .gitignore", async () => {
    const projectWithIgnore = writeProjectFile(
      createProject(),
      ".gitignore",
      "*.pdf\n!keep.pdf\n/build/\n"
    );
    let { backend, project } = await initAndCommitDefault(projectWithIgnore);

    project = writeProjectFile(project, "chapters/generated.pdf", new Uint8Array([1]));
    project = writeProjectFile(project, "build/output.log", new Uint8Array([2]));
    project = writeProjectFile(project, "chapters/build/keep.log", new Uint8Array([3]));
    project = writeProjectFile(project, "output/keep.pdf", new Uint8Array([4]));

    const status = await backend.status(project);

    expect(status.ok && status.value.entries).toEqual([
      { path: "chapters/build/keep.log", staged: null, worktree: "untracked" },
      { path: "output/keep.pdf", staged: null, worktree: "untracked" }
    ]);
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

  it("keeps git objects and refs isolated per Typr project", async () => {
    const gitStorage = createMemoryGitFileStorage();
    const backend = createRepoBackend(gitStorage);
    let firstProject = createEmptyProjectRepository({
      displayName: "First",
      defaultFileName: "main.typ",
      defaultContent: "first\n"
    });
    let secondProject = createEmptyProjectRepository({
      displayName: "Second",
      defaultFileName: "main.typ",
      defaultContent: "second\n"
    });

    const firstInit = await backend.initRepository(firstProject);
    const secondInit = await backend.initRepository(secondProject);
    expect(firstInit.ok).toBe(true);
    expect(secondInit.ok).toBe(true);
    if (!firstInit.ok || !secondInit.ok) return;
    firstProject = firstInit.value;
    secondProject = secondInit.value;

    await backend.stagePaths(firstProject, ["."]);
    await backend.stagePaths(secondProject, ["."]);
    const firstCommit = await backend.commit(firstProject, { message: "first commit" });
    const secondCommit = await backend.commit(secondProject, { message: "second commit" });

    const firstLog = await backend.log(firstProject);
    const secondLog = await backend.log(secondProject);
    expect(firstCommit.ok && secondCommit.ok).toBe(true);
    expect(firstLog.ok && firstLog.value.map((commit) => commit.message)).toEqual(["first commit"]);
    expect(secondLog.ok && secondLog.value.map((commit) => commit.message)).toEqual(["second commit"]);
  });

  it("preserves staged changes after backend reload", async () => {
    const gitStorage = createMemoryGitFileStorage();
    const backend = createRepoBackend(gitStorage);
    let project = createProject();
    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;
    await backend.stagePaths(project, ["."]);

    const reloadedBackend = createRepoBackend(gitStorage);
    const status = await reloadedBackend.status(project);
    expect(status.ok).toBe(true);
    expect(status.ok && status.value.entries.some((entry) => entry.staged === "added")).toBe(true);
  });

  it("recovers repository init when HEAD exists but index is missing", async () => {
    const gitStorage = createMemoryGitFileStorage();
    const backend = createRepoBackend(gitStorage);
    const project = createProject();
    await gitStorage.writeFile(project.id, "HEAD", new TextEncoder().encode("ref: refs/heads/main\n"));

    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    const status = await backend.status(init.value);
    expect(status.ok).toBe(true);
    expect(status.ok && status.value.branch).toBe("main");
  });

  it("switches branches by replacing the selected project worktree only", async () => {
    const { backend, project: initialProject } = await initAndCommitDefault();
    await backend.createBranch(initialProject, "draft");
    const draftSwitch = await backend.switchBranch(initialProject, "draft");
    expect(draftSwitch.ok).toBe(true);
    if (!draftSwitch.ok) return;
    let draftProject = writeProjectFile(draftSwitch.value.project, "main.typ", "draft\n");
    await backend.stagePaths(draftProject, ["."]);
    await backend.commit(draftProject, { message: "draft edit" });

    const mainSwitch = await backend.switchBranch(draftProject, "main");
    expect(mainSwitch.ok).toBe(true);
    expect(mainSwitch.ok && new TextDecoder().decode(readProjectFileBytes(mainSwitch.value.project, "main.typ") ?? new Uint8Array())).not.toBe("draft\n");
  });

  it("persists a diverged pull merge stop and clears it with abort", async () => {
    const gitStorage = createMemoryGitFileStorage();
    const backend = createRepoBackend(gitStorage);
    let project = createProject();
    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;
    await backend.stagePaths(project, ["."]);
    const baseCommit = await backend.commit(project, { message: "base" });
    expect(baseCommit.ok).toBe(true);
    if (!baseCommit.ok) return;

    await backend.createBranch(project, "remote-main");
    const remoteSwitch = await backend.switchBranch(project, "remote-main");
    expect(remoteSwitch.ok).toBe(true);
    if (!remoteSwitch.ok) return;
    project = writeProjectFile(remoteSwitch.value.project, "main.typ", "remote\n");
    await backend.stagePaths(project, ["."]);
    const remoteCommit = await backend.commit(project, { message: "remote" });
    expect(remoteCommit.ok).toBe(true);
    if (!remoteCommit.ok) return;

    const mainSwitch = await backend.switchBranch(project, "main");
    expect(mainSwitch.ok).toBe(true);
    if (!mainSwitch.ok) return;
    project = writeProjectFile(mainSwitch.value.project, "main.typ", "local\n");
    await backend.stagePaths(project, ["."]);
    const localCommit = await backend.commit(project, { message: "local" });
    expect(localCommit.ok).toBe(true);
    if (!localCommit.ok) return;

    const mergeState = await backend.beginDivergedPull(project, {
      branch: "main",
      remoteName: "origin",
      remoteBranch: "main",
      localSha: localCommit.value.sha,
      remoteSha: remoteCommit.value.sha
    });
    expect(mergeState.ok).toBe(true);
    expect(mergeState.ok && mergeState.value.baseSha).toBe(baseCommit.value.sha);
    expect(mergeState.ok && mergeState.value.conflictCount).toBe(1);

    const reloadedBackend = createRepoBackend(gitStorage);
    const reloadedStatus = await reloadedBackend.status(project);
    expect(reloadedStatus.ok && reloadedStatus.value.mergeState?.remoteSha).toBe(remoteCommit.value.sha);

    const abort = await reloadedBackend.abortMerge(project);
    expect(abort.ok).toBe(true);
    expect(abort.ok && abort.value.mergeState).toBe(null);
  });

  it("continues a diverged pull with explicit conflict resolutions", async () => {
    const gitStorage = createMemoryGitFileStorage();
    const backend = createRepoBackend(gitStorage);
    let project = createProject();
    const init = await backend.initRepository(project);
    expect(init.ok).toBe(true);
    if (!init.ok) return;
    project = init.value;
    await backend.stagePaths(project, ["."]);
    const baseCommit = await backend.commit(project, { message: "base" });
    expect(baseCommit.ok).toBe(true);
    if (!baseCommit.ok) return;

    await backend.createBranch(project, "remote-main");
    const remoteSwitch = await backend.switchBranch(project, "remote-main");
    expect(remoteSwitch.ok).toBe(true);
    if (!remoteSwitch.ok) return;
    project = writeProjectFile(remoteSwitch.value.project, "main.typ", "remote\n");
    await backend.stagePaths(project, ["."]);
    const remoteCommit = await backend.commit(project, { message: "remote" });
    expect(remoteCommit.ok).toBe(true);
    if (!remoteCommit.ok) return;

    const mainSwitch = await backend.switchBranch(project, "main");
    expect(mainSwitch.ok).toBe(true);
    if (!mainSwitch.ok) return;
    project = writeProjectFile(mainSwitch.value.project, "main.typ", "local\n");
    await backend.stagePaths(project, ["."]);
    const localCommit = await backend.commit(project, { message: "local" });
    expect(localCommit.ok).toBe(true);
    if (!localCommit.ok) return;

    const mergeState = await backend.beginDivergedPull(project, {
      branch: "main",
      remoteName: "origin",
      remoteBranch: "main",
      localSha: localCommit.value.sha,
      remoteSha: remoteCommit.value.sha
    });
    expect(mergeState.ok).toBe(true);
    if (!mergeState.ok) return;

    const unresolved = await backend.continueMerge(project, {
      message: "merge remote",
      resolutions: []
    });
    expect(unresolved.ok).toBe(false);
    expect(!unresolved.ok && unresolved.error.code).toBe("merge-conflict");

    const continued = await backend.continueMerge(project, {
      message: "merge remote",
      resolutions: [{ path: "main.typ", content: "resolved\n" }]
    });
    expect(continued.ok).toBe(true);
    if (!continued.ok) return;

    expect(continued.value.commit.parentShas).toEqual([
      localCommit.value.sha,
      remoteCommit.value.sha
    ]);
    expect(
      new TextDecoder().decode(readProjectFileBytes(continued.value.project, "main.typ") ?? new Uint8Array())
    ).toBe("resolved\n");
    expect(continued.value.status.mergeState).toBe(null);
  });

  it("blocks .git internals and path traversal in repo operations", async () => {
    const { backend, project } = await initAndCommitDefault();
    const gitPath = await backend.stagePaths(project, [".git/config"]);
    const traversal = await backend.stagePaths(project, ["../escape.typ"]);

    expect(gitPath.ok).toBe(false);
    expect(!gitPath.ok && gitPath.error.code).toBe("invalid-path");
    expect(traversal.ok).toBe(false);
    expect(!traversal.ok && traversal.error.code).toBe("invalid-path");
  });
});
