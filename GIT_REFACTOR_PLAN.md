# Git Refactor Plan

This document explains how to use the phase prompts in this repository to drive the refactor from the current Typr sync model to a real repo-backed git model.

## Objective

The target end state is:

- one Typr project = one real git repo
- a real working tree and `.git` state per project
- real staging, commits, branches, and history
- real remote git behavior using token auth
- no primary dependence on the GitHub Contents API sync model

These prompts are intentionally split into phases because the current codebase is not starting from a real git architecture. It currently has:

- a monolithic `AppSnapshot`
- an app-centric `snapshot.project`
- a synthesized workspace tree
- a browser shell that projects app state into a virtual filesystem
- a GitHub Contents API sync path
- transitional fake local git behavior

Trying to do the full rewrite in one step is high risk. The prompts are structured to preserve app behavior while changing the architecture underneath.

## Files

Run these in order:

1. [GIT_REFACTOR_PROMPT_1.txt](/home/max/typr/GIT_REFACTOR_PROMPT_1.txt)
2. [GIT_REFACTOR_PROMPT_2.txt](/home/max/typr/GIT_REFACTOR_PROMPT_2.txt)
3. [GIT_REFACTOR_PROMPT_3.txt](/home/max/typr/GIT_REFACTOR_PROMPT_3.txt)
4. [GIT_REFACTOR_PROMPT_4.txt](/home/max/typr/GIT_REFACTOR_PROMPT_4.txt)

## How To Use The Prompts

For each phase:

1. Start a fresh LLM task with the prompt file contents.
2. Require the model to read the named source files first.
3. Require code changes, not just analysis.
4. Require it to run the automated verification listed in the prompt.
5. Stop after that phase only.
6. Perform the human QA listed in the prompt before moving on.
7. If QA fails, fix that phase before starting the next one.

Do not skip the QA gate between phases. Each later phase assumes the prior migration and persistence behavior is solid.

## Non-Negotiable Engineering Gates

Every phase must preserve these guarantees. If a phase cannot satisfy them, stop and revise the phase instead of continuing.

1. Data safety comes first. Migrations must be reversible or recoverable, legacy data must remain readable until the replacement path is proven, and no code may recursively clear a repo root that can contain `.git`.
2. Browser storage must have one clear owner per project. The current `workspace-v1` OPFS mirroring clears and rewrites the workspace from `AppSnapshot`; a repo-backed design must replace that with project-scoped roots and must never mirror over `.git`.
3. Remote git must have an explicit transport decision before Phase 3 implementation. Direct browser smart-HTTP git to GitHub is usually blocked by CORS, and third-party CORS proxies are not acceptable for user tokens. Acceptable strategies are a vetted same-origin backend/local agent, an approved CORS-capable git host, or a GitHub Git Database API adapter that operates on commits/trees/refs rather than the Contents API.
4. Secrets must be isolated. Tokens must not live in general project/git workspace JSON, must never be written into commit data, command output, logs, screenshots, thrown errors, or exported files, and all displayed remote URLs must be redacted.
5. Expensive git work must not run on the React render path. Hashing, status scans, pack/object work, fetch/push/pull, and migration of large trees must run behind an async service boundary, preferably a Web Worker, with debouncing, cancellation, and progress/error reporting.
6. Path and ref handling must be defensive. Reject absolute paths, `..`, NUL bytes, `.git` working-tree edits from the UI/shell, unsafe branch/ref names, and any path that escapes the selected project root.
7. Git behavior must be honest. If an operation is simulated, metadata-only, or limited by the browser transport, the UI and shell must say so. Do not label a feature as real git unless it is backed by real object/index/ref state.

## Recommended Handoff Instructions

When you hand one of these prompts to another LLM, prepend a short instruction block like this:

```text
Work only on the current phase described below.
Read the referenced files before editing.
Make code changes directly in the repository.
Do not skip migrations or persistence concerns.
Run the required automated verification before stopping.
When complete, summarize the changes, call out risks, and repeat the QA steps I should perform manually.
If you discover a mismatch between the prompt and the current codebase, adapt carefully and explain why.
```

That keeps the model focused on implementation rather than generic planning.

## Phase Boundaries

### Phase 1

Purpose:
Move the app from an app-centric project object toward a repo-centric, filesystem-first model without yet implementing true git.

Must be true before Phase 2:

- legacy saved projects still load
- file edits still persist
- workspace tree still works
- shell file operations still work
- diagram and graph flows still round-trip
- OPFS persistence no longer depends on clearing a shared global workspace root that could later contain `.git`
- project ids map to stable, project-scoped storage roots

Do not proceed to Phase 2 if migration or persistence feels unstable.

### Phase 2

Purpose:
Introduce a true local git repository backend in browser-managed storage and replace the fake local staging/commit model.

Must be true before Phase 3:

- `git status`, `git add`, `git reset`, `git commit -m`, `git branch`, `git switch`, and `git log` operate on a real repo backend
- history persists after reload
- the shell, files pane, and editor are operating on the same working tree
- `.git` is stored outside normal editable workspace paths or is protected from shell/UI edits
- status/log/branch work is asynchronous and cannot block typing or preview

Do not proceed to Phase 3 if local repo state is still partly simulated.

### Phase 3

Purpose:
Replace file-by-file GitHub sync with real remote git operations on top of the local repo.

Must be true before Phase 4:

- push/pull/fetch operate through the repo backend
- the Git UI reflects real local and remote repo state
- token-based remote setup is understandable
- the app does not depend on `.typr-project.json` for normal remote behavior
- the selected remote transport has been proven in-browser without leaking tokens through an untrusted proxy
- failure modes leave local commits, refs, index, and working tree recoverable

Do not proceed to Phase 4 if the app is still primarily using the Contents API path.

### Phase 4

Purpose:
Finish cleanup, conflict handling, test coverage, docs, and repo-per-project consistency.

This phase should remove temporary compatibility code where safe and align the UI, shell, and persistence model with the final architecture.

## QA Workflow

After each phase:

1. Run the exact manual QA steps from that phase prompt.
2. Record what passed and what failed.
3. If something fails, feed the result back into the same phase rather than jumping ahead.

Recommended evidence to collect after each phase:

- short notes on pass/fail results
- screenshots if the UI behavior changed
- exact shell commands that misbehaved
- any console/runtime errors

That gives the next LLM pass concrete debugging input.

## What To Ask For In The Completion Report

At the end of each phase, require the LLM to report:

- what changed architecturally
- what migrations were added
- what tests were run
- what manual QA you should perform next
- what known risks remain for the next phase

This matters because later phases depend heavily on the earlier storage and migration decisions.

## Suggested Human Review Focus

Pay special attention to these areas across all phases:

- persistence and reload behavior
- whether one source of truth is emerging for files
- whether diagrams and graphs are still being duplicated in app-only structures
- whether the shell and UI are truly seeing the same filesystem state
- whether git behavior is real or still partially simulated
- whether any old sync terminology remains misleading after remotes become real git

## Final Note

If a phase uncovers a serious architectural mismatch, it is better to revise that phase than to force the later prompts through unchanged. The prompts are thorough, but they should serve the real codebase, not the other way around.
