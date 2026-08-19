import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { readProjectFileBytes, type TyprProjectRepository } from "../project/projectState";
import type { UpstreamTracking } from "./remoteService";
import type {
  RepoBranch,
  RepoCommit,
  RepoMergeState,
  RepoStatus,
  RepoStatusEntry
} from "./repoBackend";
import type { GitManagedProject } from "./gitState";
import {
  formatGitChangeState,
  getGitChangeKey,
  groupGitWorkspaceChanges,
  type GitWorkspaceChange
} from "./gitWorkspaceState";

type GitWorkspaceSelection =
  | { kind: "change"; change: GitWorkspaceChange }
  | { kind: "commit"; commit: RepoCommit }
  | { kind: "branch"; branch: RepoBranch };

interface GitWorkspaceProps {
  project: TyprProjectRepository | null;
  managedProject: GitManagedProject | null;
  status: RepoStatus | null;
  changes: RepoStatusEntry[];
  commits: RepoCommit[];
  branches: RepoBranch[];
  upstream: UpstreamTracking | null;
  mergeState: RepoMergeState | null;
  isLoading: boolean;
  isSyncing: boolean;
  canPull: boolean;
  canPush: boolean;
  onClose(): void;
  onOpenSettings(): void;
  onRefresh(): void;
  onStage(paths: string[]): void;
  onUnstage(path: string): void;
  onStageAll(): void;
  onCommit(): void;
  onPull(): void;
  onPush(): void;
  onDraftCommitMessageChange(message: string): void;
}

export function GitWorkspace({
  project,
  managedProject,
  status,
  changes,
  commits,
  branches,
  upstream,
  mergeState,
  isLoading,
  isSyncing,
  canPull,
  canPush,
  onClose,
  onOpenSettings,
  onRefresh,
  onStage,
  onUnstage,
  onStageAll,
  onCommit,
  onPull,
  onPush,
  onDraftCommitMessageChange
}: GitWorkspaceProps) {
  const workspaceRef = useRef<HTMLElement | null>(null);
  const commitInputRef = useRef<HTMLInputElement | null>(null);
  const groups = useMemo(() => groupGitWorkspaceChanges(changes), [changes]);
  const orderedChanges = useMemo(
    () => [...groups.unstaged, ...groups.staged],
    [groups.staged, groups.unstaged]
  );
  const [selection, setSelection] = useState<GitWorkspaceSelection | null>(null);

  useEffect(() => {
    workspaceRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelection((current) => {
      if (current?.kind === "change") {
        const matching = orderedChanges.find(
          (change) => getGitChangeKey(change) === getGitChangeKey(current.change)
        );
        if (matching) return { kind: "change", change: matching };
      }
      if (current?.kind === "commit") {
        const matching = commits.find((commit) => commit.sha === current.commit.sha);
        if (matching) return { kind: "commit", commit: matching };
      }
      if (current?.kind === "branch") {
        const matching = branches.find((branch) => branch.name === current.branch.name);
        if (matching) return { kind: "branch", branch: matching };
      }
      if (orderedChanges[0]) return { kind: "change", change: orderedChanges[0] };
      if (commits[0]) return { kind: "commit", commit: commits[0] };
      if (branches[0]) return { kind: "branch", branch: branches[0] };
      return null;
    });
  }, [branches, commits, orderedChanges]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (isEditingTarget(event.target)) return;

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "c") {
      event.preventDefault();
      commitInputRef.current?.focus();
      return;
    }
    if (event.key === "r") {
      event.preventDefault();
      onRefresh();
      return;
    }
    if (event.key === " " && selection?.kind === "change") {
      event.preventDefault();
      if (selection.change.side === "worktree") onStage([selection.change.path]);
      else onUnstage(selection.change.path);
      return;
    }
    if ((event.key === "j" || event.key === "k") && orderedChanges.length > 0) {
      event.preventDefault();
      const selectedKey = selection?.kind === "change" ? getGitChangeKey(selection.change) : "";
      const currentIndex = orderedChanges.findIndex(
        (change) => getGitChangeKey(change) === selectedKey
      );
      const direction = event.key === "j" ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? 0
        : Math.max(0, Math.min(orderedChanges.length - 1, currentIndex + direction));
      setSelection({ kind: "change", change: orderedChanges[nextIndex] });
    }
  }

  const currentBranch = status?.branch ?? managedProject?.branch ?? "main";
  const stagedCount = groups.staged.length;
  const canCommit = stagedCount > 0 && Boolean(managedProject?.draftCommitMessage.trim());
  const remoteLabel = managedProject?.owner && managedProject.repo
    ? `${managedProject.owner}/${managedProject.repo}`
    : "Browser repository";

  return (
    <section
      aria-label="Git Workspace"
      className="git-workspace"
      onKeyDown={handleKeyDown}
      ref={workspaceRef}
      tabIndex={-1}
    >
      <header className="git-workspace__toolbar">
        <div className="git-workspace__identity">
          <span className="git-workspace__eyebrow">Git Workspace</span>
          <h2 id="git-workspace-title">{managedProject?.name || project?.displayName || "Repository"}</h2>
          <div className="git-workspace__meta">
            <span className="git-workspace__branch">{currentBranch}</span>
            <span>{remoteLabel}</span>
            {upstream ? <span>{upstream.ahead} ahead · {upstream.behind} behind</span> : null}
          </div>
        </div>
        <div className="git-workspace__toolbar-actions">
          <button className="pane__button pane__button--compact" onClick={onOpenSettings} type="button">
            Settings
          </button>
          <button className="pane__button pane__button--compact" disabled={isLoading} onClick={onRefresh} type="button">
            {isLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="pane__button pane__button--compact" disabled={!canPull} onClick={onPull} type="button">
            {isSyncing ? "Working…" : "Pull"}
          </button>
          <button className="pane__button pane__button--compact" disabled={!canPush} onClick={onPush} type="button">
            {isSyncing ? "Working…" : "Push"}
          </button>
          <button className="pane__button pane__button--compact" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </header>

      {mergeState ? (
        <div className="git-workspace__notice" role="status">
          <span>
            Merge stopped with {mergeState.conflictCount} conflict{mergeState.conflictCount === 1 ? "" : "s"}.
          </span>
          <button className="pane__button pane__button--compact" onClick={onClose} type="button">
            Open conflict resolver
          </button>
        </div>
      ) : null}

      <div className="git-workspace__grid">
        <div className="git-workspace__changes-column">
          <GitChangePanel
            changes={groups.unstaged}
            emptyMessage="Working tree is clean."
            onAction={(change) => onStage([change.path])}
            onSelect={(change) => setSelection({ kind: "change", change })}
            selected={selection?.kind === "change" ? selection.change : null}
            title="Unstaged"
            actionLabel="Stage"
          />
          <GitChangePanel
            changes={groups.staged}
            emptyMessage="No changes staged."
            onAction={(change) => onUnstage(change.path)}
            onSelect={(change) => setSelection({ kind: "change", change })}
            selected={selection?.kind === "change" ? selection.change : null}
            title="Staged"
            actionLabel="Unstage"
          />
        </div>

        <section aria-labelledby="git-workspace-history" className="git-workspace__panel git-workspace__history">
          <div className="git-workspace__panel-header">
            <h3 id="git-workspace-history">Commit history</h3>
            <span>{commits.length}</span>
          </div>
          <div className="git-workspace__list">
            {commits.length > 0 ? commits.map((commit) => {
              const selected = selection?.kind === "commit" && selection.commit.sha === commit.sha;
              return (
                <button
                  aria-current={selected ? "true" : undefined}
                  className={`git-workspace__row git-workspace__commit ${selected ? "git-workspace__row--selected" : ""}`}
                  key={commit.sha}
                  onClick={() => setSelection({ kind: "commit", commit })}
                  type="button"
                >
                  <span className="git-workspace__graph" aria-hidden="true">●</span>
                  <span className="git-workspace__row-main">
                    <strong>{commit.message}</strong>
                    <small>{commit.authorName} · {formatCommitDate(commit.authoredAt)}</small>
                  </span>
                  <code>{commit.shortSha}</code>
                </button>
              );
            }) : <div className="git-workspace__empty">No commits yet.</div>}
          </div>
        </section>

        <section aria-labelledby="git-workspace-branches" className="git-workspace__panel git-workspace__branches">
          <div className="git-workspace__panel-header">
            <h3 id="git-workspace-branches">Branches</h3>
            <span>{branches.length}</span>
          </div>
          <div className="git-workspace__list">
            {branches.length > 0 ? branches.map((branch) => {
              const selected = selection?.kind === "branch" && selection.branch.name === branch.name;
              return (
                <button
                  aria-current={branch.current ? "page" : selected ? "true" : undefined}
                  className={`git-workspace__row ${selected ? "git-workspace__row--selected" : ""}`}
                  key={branch.name}
                  onClick={() => setSelection({ kind: "branch", branch })}
                  type="button"
                >
                  <span className="git-workspace__branch-marker" aria-hidden="true">{branch.current ? "●" : "○"}</span>
                  <span className="git-workspace__row-main"><strong>{branch.name}</strong></span>
                  <code>{branch.sha?.slice(0, 7) ?? "unborn"}</code>
                </button>
              );
            }) : <div className="git-workspace__empty">No branches available.</div>}
          </div>
        </section>

        <GitWorkspaceDetails project={project} selection={selection} />
      </div>

      <footer className="git-workspace__footer">
        <div className="git-workspace__commit-bar">
          <label htmlFor="git-workspace-commit-message">Commit message</label>
          <input
            autoCapitalize="sentences"
            autoCorrect="off"
            id="git-workspace-commit-message"
            onChange={(event) => onDraftCommitMessageChange(event.target.value)}
            placeholder={stagedCount > 0 ? "Describe the staged changes" : "Stage changes before committing"}
            ref={commitInputRef}
            type="text"
            value={managedProject?.draftCommitMessage ?? ""}
          />
          <button className="pane__button pane__button--compact" disabled={changes.length === 0} onClick={onStageAll} type="button">
            Stage all
          </button>
          <button className="pane__button pane__button--compact" disabled={!canCommit} onClick={onCommit} type="button">
            Commit {stagedCount > 0 ? stagedCount : ""}
          </button>
        </div>
        <div className="git-workspace__shortcut-bar" aria-label="Git workspace keyboard shortcuts">
          <span><kbd>j</kbd>/<kbd>k</kbd> select</span>
          <span><kbd>space</kbd> stage or unstage</span>
          <span><kbd>c</kbd> commit message</span>
          <span><kbd>r</kbd> refresh</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </footer>
    </section>
  );
}

function GitChangePanel({
  title,
  changes,
  selected,
  actionLabel,
  emptyMessage,
  onSelect,
  onAction
}: {
  title: string;
  changes: GitWorkspaceChange[];
  selected: GitWorkspaceChange | null;
  actionLabel: "Stage" | "Unstage";
  emptyMessage: string;
  onSelect(change: GitWorkspaceChange): void;
  onAction(change: GitWorkspaceChange): void;
}) {
  return (
    <section aria-label={`${title} changes`} className="git-workspace__panel git-workspace__change-panel">
      <div className="git-workspace__panel-header">
        <h3>{title}</h3>
        <span>{changes.length}</span>
      </div>
      <div className="git-workspace__list" role="list">
        {changes.length > 0 ? changes.map((change) => {
          const isSelected = selected ? getGitChangeKey(selected) === getGitChangeKey(change) : false;
          return (
            <div
              className={`git-workspace__row ${isSelected ? "git-workspace__row--selected" : ""}`}
              key={getGitChangeKey(change)}
              role="listitem"
            >
              <button
                aria-current={isSelected ? "true" : undefined}
                aria-label={`Inspect ${change.path}`}
                className="git-workspace__row-select"
                onClick={() => onSelect(change)}
                title={change.path}
                type="button"
              >
                <span className={`git-workspace__status-code git-workspace__status-code--${change.state}`}>
                  {formatGitChangeState(change.state)}
                </span>
                <span className="git-workspace__row-main"><strong>{change.path}</strong></span>
              </button>
              <button
                aria-label={`${actionLabel} ${change.path}`}
                className="git-workspace__row-action"
                onClick={() => onAction(change)}
                type="button"
              >
                {actionLabel}
              </button>
            </div>
          );
        }) : <div className="git-workspace__empty">{emptyMessage}</div>}
      </div>
    </section>
  );
}

function GitWorkspaceDetails({
  project,
  selection
}: {
  project: TyprProjectRepository | null;
  selection: GitWorkspaceSelection | null;
}) {
  let content;
  if (selection?.kind === "change") {
    const preview = readWorkingTreePreview(project, selection.change.path);
    content = (
      <>
        <div className="git-workspace__detail-heading">
          <div>
            <span className="git-workspace__eyebrow">
              {selection.change.side === "worktree" ? "Working tree" : "Staging area"}
            </span>
            <h3>{selection.change.path}</h3>
          </div>
          <span className={`git-workspace__status-code git-workspace__status-code--${selection.change.state}`}>
            {selection.change.state}
          </span>
        </div>
        <p className="git-workspace__detail-copy">
          Prototype preview of the current working-tree file. A precise index-versus-worktree diff will follow.
        </p>
        {preview.kind === "text" ? (
          <pre className="git-workspace__preview"><code>{preview.text || "(empty file)"}</code></pre>
        ) : (
          <div className="git-workspace__empty">{preview.message}</div>
        )}
      </>
    );
  } else if (selection?.kind === "commit") {
    content = (
      <>
        <div className="git-workspace__detail-heading">
          <div>
            <span className="git-workspace__eyebrow">Commit</span>
            <h3>{selection.commit.message}</h3>
          </div>
          <code>{selection.commit.shortSha}</code>
        </div>
        <dl className="git-workspace__facts">
          <div><dt>Author</dt><dd>{selection.commit.authorName} &lt;{selection.commit.authorEmail}&gt;</dd></div>
          <div><dt>Date</dt><dd>{new Date(selection.commit.authoredAt).toLocaleString()}</dd></div>
          <div><dt>Parents</dt><dd>{selection.commit.parentShas.map((sha) => sha.slice(0, 7)).join(", ") || "Root commit"}</dd></div>
          <div><dt>Object</dt><dd><code>{selection.commit.sha}</code></dd></div>
        </dl>
      </>
    );
  } else if (selection?.kind === "branch") {
    content = (
      <>
        <div className="git-workspace__detail-heading">
          <div>
            <span className="git-workspace__eyebrow">Branch</span>
            <h3>{selection.branch.name}</h3>
          </div>
          <span>{selection.branch.current ? "Current" : "Local"}</span>
        </div>
        <dl className="git-workspace__facts">
          <div><dt>Tip</dt><dd><code>{selection.branch.sha ?? "Unborn branch"}</code></dd></div>
          <div><dt>Status</dt><dd>{selection.branch.current ? "Checked out" : "Available locally"}</dd></div>
        </dl>
        <p className="git-workspace__detail-copy">
          Branch switching and creation remain in the Browser Shell while this workspace interaction is prototyped.
        </p>
      </>
    );
  } else {
    content = <div className="git-workspace__empty">Select a change, commit, or branch to inspect it.</div>;
  }

  return (
    <section aria-label="Selection details" className="git-workspace__panel git-workspace__details">
      {content}
    </section>
  );
}

function readWorkingTreePreview(
  project: TyprProjectRepository | null,
  path: string
): { kind: "text"; text: string } | { kind: "message"; message: string } {
  if (!project) return { kind: "message", message: "No project is open." };
  const bytes = readProjectFileBytes(project, path);
  if (!bytes) return { kind: "message", message: "This file is deleted from the working tree." };
  if (bytes.byteLength > 128 * 1024) {
    return { kind: "message", message: "Preview is unavailable for files larger than 128 KB." };
  }
  try {
    return { kind: "text", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { kind: "message", message: "Binary file preview is unavailable." };
  }
}

function formatCommitDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isEditingTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest("input, textarea, select, button, [contenteditable='true']")
  );
}
