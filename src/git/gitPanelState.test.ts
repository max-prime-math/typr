import { describe, expect, it } from "vitest";
import {
  addManagedGitProject,
  beginGitRemoteOperation,
  createGitMergePanelState,
  createInitialGitRemoteOperationState,
  finishGitRemoteOperation,
  getGitFileStatuses,
  getSelectedManagedGitProject,
  removeManagedGitProject,
  resolveGitMergePath,
  selectManagedGitProject
} from "./gitPanelState";
import {
  createEmptyGitManagedProject,
  type GitWorkspaceState
} from "./gitState";
import type { RepoStatus } from "./repoBackend";

function createWorkspace(): {
  workspace: GitWorkspaceState;
  algebraPrimaryId: string;
  algebraSecondaryId: string;
  geometryId: string;
} {
  const algebraPrimary = createEmptyGitManagedProject({
    projectId: "algebra",
    projectName: "Algebra primary"
  });
  const algebraSecondary = createEmptyGitManagedProject({
    projectId: "algebra",
    projectName: "Algebra secondary"
  });
  const geometry = createEmptyGitManagedProject({
    projectId: "geometry",
    projectName: "Geometry"
  });

  return {
    workspace: {
      version: 2,
      selectedProjectId: algebraPrimary.id,
      selectedProjectIdsByTyprProjectId: {
        algebra: algebraPrimary.id,
        geometry: geometry.id
      },
      projects: [algebraPrimary, algebraSecondary, geometry]
    },
    algebraPrimaryId: algebraPrimary.id,
    algebraSecondaryId: algebraSecondary.id,
    geometryId: geometry.id
  };
}

describe("gitPanelState", () => {
  it("keeps managed-repo selection scoped while adding, selecting, and removing repos", () => {
    const fixture = createWorkspace();
    const selected = selectManagedGitProject(
      fixture.workspace,
      "algebra",
      fixture.algebraSecondaryId
    );

    expect(getSelectedManagedGitProject(selected, "algebra")?.id).toBe(
      fixture.algebraSecondaryId
    );
    expect(getSelectedManagedGitProject(selected, "geometry")?.id).toBe(fixture.geometryId);

    const addedProject = createEmptyGitManagedProject({
      projectId: "algebra",
      projectName: "Algebra third"
    });
    const added = addManagedGitProject(selected, addedProject);
    expect(getSelectedManagedGitProject(added, "algebra")?.id).toBe(addedProject.id);

    const removed = removeManagedGitProject(added, addedProject.id, {
      projectId: "algebra",
      projectName: "Algebra"
    });
    expect(getSelectedManagedGitProject(removed, "algebra")?.id).toBe(
      fixture.algebraPrimaryId
    );
    expect(getSelectedManagedGitProject(removed, "geometry")?.id).toBe(fixture.geometryId);
  });

  it("projects staged and worktree entries without ignored paths", () => {
    const status = {
      branch: "main",
      headSha: "abc123",
      entries: [
        { path: "main.typ", staged: "modified", worktree: null },
        { path: "notes.tmp", staged: null, worktree: "added" },
        { path: "chapter.typ", staged: null, worktree: "modified" }
      ],
      mergeState: null
    } as RepoStatus;

    expect(getGitFileStatuses(status, ["*.tmp"])).toEqual([
      { path: "main.typ", state: "diverged" },
      { path: "chapter.typ", state: "diverged" }
    ]);
  });

  it("resets merge panel coordination for a new merge and tracks resolutions", () => {
    const merge = {
      branch: "main",
      remoteName: "origin",
      remoteBranch: "main",
      localSha: "local",
      remoteSha: "remote",
      startedAt: "2026-07-11T00:00:00.000Z",
      conflictCount: 1,
      files: [
        {
          path: "main.typ",
          state: "conflict",
          baseOid: "base",
          localOid: "local-blob",
          remoteOid: "remote-blob"
        }
      ]
    } as NonNullable<RepoStatus["mergeState"]>;

    const initial = createGitMergePanelState(merge);
    const resolved = resolveGitMergePath(initial, "main.typ", {
      kind: "oid",
      oid: "remote-blob",
      label: "Remote"
    });

    expect(initial.selectedPath).toBe("main.typ");
    expect(initial.commitMessage).toBe("Merge origin/main into main");
    expect(resolved.resolutionDrafts["main.typ"]).toEqual({
      kind: "oid",
      oid: "remote-blob",
      label: "Remote"
    });
  });

  it("serializes remote operations and clears progress on completion", () => {
    const initial = createInitialGitRemoteOperationState();
    const started = beginGitRemoteOperation(initial, "Fetching origin/main...");

    expect(started.accepted).toBe(true);
    expect(started.state.isRunning).toBe(true);
    expect(beginGitRemoteOperation(started.state, "Pushing...").accepted).toBe(false);

    expect(finishGitRemoteOperation({
      ...started.state,
      progress: { current: 2, total: 3 }
    })).toEqual(initial);
  });
});
