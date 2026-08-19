import type { RepoStatusEntry } from "./repoBackend";

export interface GitWorkspaceChange {
  path: string;
  side: "worktree" | "index";
  state: NonNullable<RepoStatusEntry["worktree"] | RepoStatusEntry["staged"]>;
}

export interface GitWorkspaceChangeGroups {
  unstaged: GitWorkspaceChange[];
  staged: GitWorkspaceChange[];
}

export function groupGitWorkspaceChanges(
  entries: readonly RepoStatusEntry[]
): GitWorkspaceChangeGroups {
  const unstaged: GitWorkspaceChange[] = [];
  const staged: GitWorkspaceChange[] = [];

  for (const entry of entries) {
    if (entry.worktree) {
      unstaged.push({ path: entry.path, side: "worktree", state: entry.worktree });
    }
    if (entry.staged) {
      staged.push({ path: entry.path, side: "index", state: entry.staged });
    }
  }

  return { unstaged, staged };
}

export function getGitChangeKey(change: GitWorkspaceChange): string {
  return `${change.side}:${change.path}`;
}

export function formatGitChangeState(state: GitWorkspaceChange["state"]): string {
  switch (state) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "modified":
      return "M";
    case "untracked":
      return "?";
  }
}
