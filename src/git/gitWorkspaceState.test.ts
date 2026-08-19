import { describe, expect, it } from "vitest";
import { groupGitWorkspaceChanges } from "./gitWorkspaceState";

describe("groupGitWorkspaceChanges", () => {
  it("keeps index and worktree states separate for the same path", () => {
    const groups = groupGitWorkspaceChanges([
      { path: "both.typ", staged: "modified", worktree: "modified" },
      { path: "new.typ", staged: null, worktree: "untracked" },
      { path: "gone.typ", staged: "deleted", worktree: null }
    ]);

    expect(groups.unstaged).toEqual([
      { path: "both.typ", side: "worktree", state: "modified" },
      { path: "new.typ", side: "worktree", state: "untracked" }
    ]);
    expect(groups.staged).toEqual([
      { path: "both.typ", side: "index", state: "modified" },
      { path: "gone.typ", side: "index", state: "deleted" }
    ]);
  });
});
