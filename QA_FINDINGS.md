# Typr QA Findings

Scope: document editing and persistence, compiler worker lifecycle, package download/cache behavior, offline/PWA behavior, mobile Safari/iPad input issues, Git/local filesystem workflows, export/preview correctness, and destructive actions/recovery.

## Remediation Baseline (2026-07-10)

This baseline was recorded against the existing dirty working tree on `main`; all pre-existing tracked and untracked changes were preserved. This session changed no product code.

| Command | Result |
| --- | --- |
| `git status --short --branch` | Exit 0; `main...origin/main` with pre-existing tracked modifications/deletions and untracked files, including the retired Graph removal. |
| `npx vitest run src/app/appState.test.ts src/git/pathFilters.test.ts src/compiler/typstCompiler.test.ts` | Exit 0; 3 test files passed, 8 tests passed. |
| `npm test` | Exit 0; 29 test files passed, 141 tests passed. |
| `npm run typecheck` | Exit 0; both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit` completed without diagnostics. |
| `npm run build` | Exit 0; BusyTeX assets were ready, TypeScript checks passed, Vite transformed 510 modules and built in 18.20 s, and the PWA generated a service worker with 226 precache entries. |

Failure classification: no required command failed, so there are no currently failing QA regressions or unrelated pre-existing gate failures to classify. The focused assertions for findings 1, 4, and 5 now pass in the existing working tree and are marked Verified. The production build emitted non-fatal warnings for Harper's browser-externalized `fs` import and chunks over 500 kB; neither warning failed the build or corresponds to a focused QA regression.

### Finding Status

| Finding | Severity | Status | Current evidence |
| ---: | --- | --- | --- |
| 1 | High | Verified | Nested basename preservation, descendant integrity, collision handling, and App dispatch semantics pass focused and full verification. |
| 2 | High | Verified | Latest-state pagehide, hidden-visibility, debounce, and unmount persistence pass focused, App, typecheck, and full-test verification. |
| 3 | High | Verified | Durable deletion tombstone ordering, interrupted OPFS cleanup recovery, reload retry, IndexedDB isolation, and successful cleanup pass focused and broader verification. |
| 4 | High | Verified | Successful module-worker startup and synchronous construction-failure fallback both pass focused and compiler-suite verification. |
| 5 | Medium | Verified | Nested slashless globs, directory segments, root anchoring, path-segment boundaries, and ordered negation pass matcher, Git integration, and typecheck verification. |
| 6 | Medium | Verified | Clear/remove invalidation and ordinary concurrent package downloads pass the focused registry regressions and full unit suite. |
| 7 | Medium | Verified | Compiler-aware offline readiness and first-use offline compilation pass in production Chromium desktop and mobile projects. |
| 8 | Medium | Verified | Incremental byte comparison, stale worktree pruning, nested paths, and write-failure consistency pass focused workspace tests and typecheck. |
| 9 | Medium | Verified | Preview-consistent nested Typst PDF export with complete shadow assets passes focused export tests and the production build. |
| 10 | High | Verified | Idempotent SVG-Edit initialization, loading, callback guards, runtime parking, and repeated Chromium/Firefox remount coverage pass. |
| 12 | Medium | Verified | Serializer snapshots, error-boundary fallback coverage, import/deletion audits, typecheck, build, and Chromium/Firefox Diagram smoke tests pass. |
| 13 | Medium | Verified | The wrapper contract, App wiring cleanup, focused Diagram tests, typecheck, build, and Chromium/Firefox smoke coverage pass. |
| 14 | Medium | Verified | Retired custom-editor and Diagram popup CSS was removed; shared/error/SVG-Edit styles, residual audit, gates, and desktop/mobile smoke checks pass. |
| 15 | Medium | Verified | Compile/preview, workspace selection/tabs/tree/persistence, Git panel, Settings sheet, and Build Log now have extracted tested ownership with full unit, typecheck, build, and production smoke gates passing. |
| 16 | Low | Verified | All baseline and cascaded TypeScript unused-code diagnostics were classified and removed; the strict audit, focused tests, full source unit suite, typecheck, and build pass. |
| 18 | Low | Verified | Both unused WTerm dependencies and their orphaned lockfile subtree were removed after source, dynamic-import, build-config, documentation, generated-bundle, and dependency-tree audits; terminal unit and browser smoke gates pass. |
| 19 | Medium | Verified | Shared relative-path operations, strict project/Git boundaries, focused cross-layer tests, and typecheck pass. |
| 20 | Low | Verified | Docs, preview, and export share one Markdown grammar with focused fixture, sanitization, and source-range coverage. |
| 21 | Low | Verified | Shared full/sampled text/byte hashing and byte equality are inventoried, centralized, compatibility-tested, and verified. |
| 22 | Medium | Verified | One compile/preview transition helper covers cache hits, stale misses, manual compile, source switching, and queue completion. |
| 23 | Low | Verified | Render-output reuse is independent of timing/build metadata, current diagnostics and build-log timing are retained, and focused compile/preview plus typecheck gates pass. |
| 24 | Medium | Verified | Incremental byte comparison, stale worktree pruning, nested paths, and write-failure consistency pass focused workspace tests and typecheck. |
| 25 | Low | Verified | UI icons have one canonical source, stable PWA URLs are build-verified, public-copy drift is rejected, and typecheck/build/browser smoke gates pass. |
| 26 | Low | Verified | Canvas and source-map consumers share retryable renderer initialization and tested session disposal ownership. |
| 27 | Low | Verified | Shared preview header control sizing and accessible zoom labels pass desktop/mobile browser layout checks. |
| 28 | Low | Verified | Git icon actions honor the shared pane-button sizing contract in desktop/mobile browser layout checks. |
| 30 | Low | Verified | Settings and Docs share modal search/close control contracts with Chromium/Firefox behavior and geometry coverage. |
| 31 | Low | Verified | Docs uses one canonical masked SVG icon with desktop/mobile accessibility coverage and production asset validation. |

Finding numbers 11, 17, and 29 remain intentionally absent because the Graph feature is retired.

No product fixes were implemented. I added targeted regression tests for the highest-risk confirmed issues only.

## Tests Added

- `src/app/appState.test.ts`: nested file/folder rename regressions.
- `src/git/pathFilters.test.ts`: nested `.gitignore` glob regressions.
- `src/compiler/typstCompiler.test.ts`: module-worker construction fallback regression.

Verification command:

```sh
npx vitest run src/app/appState.test.ts src/git/pathFilters.test.ts src/compiler/typstCompiler.test.ts
```

Current baseline result: 3 test files passed and all 8 tests passed. This supersedes the earlier expected-failure result for the current working tree.

## Findings

### 1. Nested Rename Moves Files Or Leaves Descendants Behind

- Severity: High
- Files/functions: `src/app/App.tsx` `handleRequestWorkspaceRename` / `handleCommitWorkspaceRename`; `src/app/appState.ts` `renameDocumentById`; `src/app/appState.ts` `renameFolderById`
- Reproduction:
  1. Create `chapters/intro.typ`.
  2. Rename it inline to `overview.typ`.
  3. It becomes root-level `overview.typ`.
  4. Rename `chapters/drafts`; descendant files stay under the old path.
- Why it matters: users can accidentally reorganize project files while only intending a basename rename; nested folder renames can leave stale children behind.
- Suggested test: added in `src/app/appState.test.ts`.
- Minimal fix strategy: preserve the parent path when reducers receive a basename; folder rename should cascade descendants like `moveFolderToFolder`.

- Status: Verified (2026-07-10)
- Remediation: Basename-only document renames retain the document's current parent. Folder renames retain their current parent, choose the next available suffix on collision, and rewrite nested folder and document descendants while leaving prefix-similar and collision-target entries untouched. The App request/commit handlers now use the testable `getWorkspaceRenameDraft` / `renameWorkspaceNode` adapter without restoring any retired Graph behavior.
- Regression coverage: `src/app/appState.test.ts` covers basename-only nested file renames, repeated file collisions, nested folder descendants, repeated folder collisions, and unrelated sibling integrity. `src/app/workspaceRename.test.ts` covers the App handler's basename draft and source-id dispatch semantics.
- Verification evidence:
  - Pre-edit: `npx vitest run src/app/appState.test.ts` — 1 file passed, 5 tests passed; the existing local reducer behavior already fixed both originally reported regressions.
  - `npx vitest run src/app/appState.test.ts src/app/workspaceRename.test.ts src/workspace/workspaceTree.test.ts src/project/projectState.test.ts` — 4 files passed, 20 tests passed.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm test` — 30 files passed, 145 tests passed.
  - `npm run build` — passed; Vite transformed 511 modules and the PWA generated 226 precache entries.

### 2. Debounced Saves Can Lose Latest Edits On Page Close Or iOS Backgrounding

- Severity: High
- Files/functions: `src/app/App.tsx` persistence effect using `saveSnapshot` / `saveProjectStorage`
- Reproduction:
  1. Edit a document.
  2. Close/background the PWA before the 250 ms debounce fires.
  3. Reopen the app.
- Why it matters: mobile Safari can suspend pages aggressively, so the latest edit can be lost.
- Suggested test: fake timers plus mocked `saveSnapshot` / `saveProjectStorage`; dispatch `pagehide` and assert an immediate save.
- Minimal fix strategy: share a `persistNow` path and call it on `pagehide`, `visibilitychange`, and unmount.

- Status: Verified (2026-07-10)
- Remediation: `createLifecyclePersistence` now owns one debounced timer and one `persistNow` path used by debounce expiry, `pagehide`, hidden `visibilitychange`, and disposal. App supplies a render-current payload ref so lifecycle events cannot persist an older effect closure. Immediate saves cancel the pending timer, identical snapshot/storage pairs are deduplicated, save status ignores obsolete completions, and disposal removes both lifecycle listeners before performing the final save.
- Regression coverage: `src/app/lifecyclePersistence.test.ts` uses fake timers and mocked `saveSnapshot` / `saveProjectStorage` functions to cover immediate latest-edit persistence on `pagehide`, mobile Safari/iPad-style hidden visibility, and unmount cleanup. The assertions also prove visible visibility changes do not save, hidden visibility followed by `pagehide` is deduplicated, stale debounces do not fire later, and disposed listeners cannot trigger more writes.
- Verification evidence:
  - Pre-implementation: `npx vitest run src/app/lifecyclePersistence.test.ts` — failed with 1 suite failed because the test-first lifecycle persistence module did not yet exist.
  - `npx vitest run src/app/lifecyclePersistence.test.ts` — 1 file passed, 3 tests passed.
  - `npx vitest run src/app/appState.test.ts src/app/compilePreviewState.test.ts src/app/previewContent.test.ts src/app/keybindings.test.ts src/app/documentStats.test.ts src/app/lifecyclePersistence.test.ts src/app/workspaceRename.test.ts` — 7 files passed, 32 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.
  - `npm test` — 31 files passed, 148 tests passed.

### 3. Project Deletion Deletes Auxiliary Data Before Durable Metadata Save

- Severity: High
- Files/functions: `src/app/App.tsx` `handleDeleteSelectedProject`; `src/workspace/opfsWorkspace.ts` `removeProjectFromOpfs`
- Reproduction:
  1. Confirm local project deletion.
  2. Kill the tab before the debounced project-storage save runs.
  3. Reopen the app.
- Why it matters: project metadata can reappear while browser git data and OPFS mirror files are already deleted.
- Suggested test: mock storage deletes, interrupt before save, reload stored state.
- Minimal fix strategy: persist project deletion/tombstone first, then delete auxiliary git/OPFS data.

- Status: Verified (2026-07-10)
- Remediation: Each confirmed deletion now writes an independent per-project IndexedDB tombstone before browser Git or OPFS cleanup begins. App switches lifecycle persistence to the filtered project state after that tombstone is durable, explicitly saves the filtered project list, and clears the tombstone only after Git cleanup, OPFS cleanup, and project-storage persistence all succeed. Hydration loads retained tombstones, filters deleted projects before presenting the workspace, retries both auxiliary cleanup paths idempotently, and preserves tombstones for any cleanup that remains incomplete. Unexpected OPFS failures now propagate to the retry coordinator while an already absent OPFS directory remains a successful deletion.
- Regression coverage: `src/project/projectDeletion.test.ts` covers successful ordering, reload while OPFS cleanup is interrupted, retained-tombstone state consistency, and retry/clear ordering. `src/storage/indexedDbStorage.test.ts` covers independent tombstone persistence/listing/removal and project-scoped browser Git deletion. `src/workspace/opfsWorkspace.test.ts` covers recursive removal, idempotent missing-directory cleanup, and propagation of interruption errors. `src/app/lifecyclePersistence.test.ts` proves destructive actions can await an already active persistence request before beginning deletion.
- Verification evidence:
  - Pre-implementation: `npx vitest run src/project/projectDeletion.test.ts` — failed with 1 suite failed because the test-first deletion coordinator did not yet exist.
  - Pre-implementation: `npx vitest run src/storage/indexedDbStorage.test.ts src/workspace/opfsWorkspace.test.ts` — 2 files failed in the intended paths because tombstone APIs were absent and interrupted OPFS cleanup was swallowed.
  - `npx vitest run src/app/lifecyclePersistence.test.ts src/project/projectDeletion.test.ts src/project/projectState.test.ts src/storage/indexedDbStorage.test.ts src/workspace/opfsWorkspace.test.ts` — 5 files passed, 21 tests passed.
  - `npm test` — 34 files passed, 157 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

### 4. Typst Compiler Crashes If Module Worker Construction Throws

- Severity: High
- Files/functions: `src/compiler/typstCompiler.ts` `WorkerBackedTypstCompiler` constructor
- Reproduction:
  1. Run in a browser/context where module workers are blocked or make `new Worker()` throw.
  2. Create the Typst compiler.
- Why it matters: preview can fail entirely before the main-thread fallback is reachable.
- Suggested test: added in `src/compiler/typstCompiler.test.ts`.
- Minimal fix strategy: catch worker construction failure, mark worker unavailable, emit fallback status, and use the main-thread compiler.

- Status: Verified (2026-07-10)
- Remediation: `WorkerBackedTypstCompiler` catches synchronous module-worker construction errors, marks worker mode unavailable before any compile request can be created, and emits one `fallback-main-thread` status in `main-thread` mode with the original error detail. Compiles then call the already-created main-thread compiler directly, so the failed worker path is not retried and creates no rejected request promise or registered worker listeners. Successful construction continues to register the worker listeners and compile through the module worker.
- Regression coverage: `src/compiler/typstCompiler.test.ts` now covers both successful module-worker startup and thrown construction. It asserts the module-worker URL/options and worker result path, plus one construction attempt, one accurate fallback status, no fallback status on successful startup, and repeated resolved main-thread compiles after construction failure.
- Verification evidence:
  - Pre-edit: `npx vitest run src/compiler/typstCompiler.test.ts` — 1 file passed, 1 test passed; the existing construction-throw regression confirmed the scenario and the local catch behavior.
  - `npx vitest run src/compiler/typstCompiler.test.ts` — 1 file passed, 2 tests passed.
  - `npx vitest run src/compiler` — 6 files passed, 23 tests passed.
  - Initial `npm run typecheck` — failed on three test-only TS2493 diagnostics because the successful-worker mock inferred a zero-argument constructor; the mock signature was corrected.
  - Final `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

### 5. Git Ignore Patterns Miss Nested Generated Artifacts

- Severity: Medium
- Files/functions: `src/git/pathFilters.ts` `matchesIgnorePattern`
- Reproduction:
  1. Keep default `.gitignore` with `*.pdf`.
  2. Generate or add `build/main.pdf`.
  3. Check browser git status.
- Why it matters: generated PDFs and auxiliary files can be staged and pushed even though default ignore rules imply they should be excluded.
- Suggested test: added in `src/git/pathFilters.test.ts`.
- Minimal fix strategy: implement gitignore-style slashless basename and directory matching across all path segments.

- Status: Verified (2026-07-10)
- Remediation: Ignore rules are parsed into structured path segments. Slashless literals and globs match any complete path segment (including directory ancestors), patterns containing a slash are repository-root relative, a leading slash anchors a single-segment pattern to the root, and wildcards do not cross segment boundaries except for an explicit `**` segment. Pattern order is preserved so a later `!` rule can re-include a matching path, and browser Git status now retains negation rules read from the project `.gitignore`.
- Regression coverage: `src/git/pathFilters.test.ts` covers nested `*.pdf`-style globs, exact directory-segment behavior, root-anchored file and directory rules, slash-containing patterns, wildcard segment boundaries, and ordered/anchored negation. `src/git/repoBackend.test.ts` verifies those semantics through browser Git status for nested ignored files, root-only ignored directories, and a re-included PDF.
- Verification evidence:
  - Pre-edit existing coverage: `npx vitest run src/git/pathFilters.test.ts` — 1 file passed, 2 tests passed; the original nested `*.pdf` and trailing-slash directory examples were already green.
  - Confirmed reproduction after expanding coverage: `npx vitest run src/git/pathFilters.test.ts` — 1 test passed and 4 tests failed on slashless directory segments, root anchoring, wildcard path segments, and negation.
  - Focused matcher: `npx vitest run src/git/pathFilters.test.ts` — 1 file passed, 5 tests passed.
  - Matcher plus Git integration: `npx vitest run src/git/pathFilters.test.ts src/git/repoBackend.test.ts` — 2 files passed, 16 tests passed.
  - Broader Git gate: `npx vitest run src/git` — 4 files passed, 34 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

### 6. Typst Package Cache Clear Can Be Undone By In-Flight Downloads

- Severity: Medium
- Files/functions: `src/compiler/typstPackageRegistry.ts` `ensureTypstPackage`, `clearTypstPackageCache`, `removeTypstPackageFromCache`
- Reproduction:
  1. Start a Typst package download.
  2. Clear package cache before fetch resolves.
  3. Let the fetch resolve.
- Why it matters: cache UI can report cleared while the package is written back immediately afterward.
- Suggested test: deferred `fetch` plus fake IndexedDB/cache.
- Minimal fix strategy: use generation tokens or abort controllers; skip saving in-flight downloads invalidated by clear/remove.

- Status: Verified (2026-07-10)
- Remediation: Package loads capture both a cache-wide generation and a per-package generation. Clear and remove advance the applicable generation synchronously, detach invalidated entries from the pending-load map, and clear their memory/dependency state before deleting IndexedDB data. Every asynchronous load stage checks its captured generation, so all callers sharing a pre-invalidation download reject with an explicit invalidation error, while a caller started after remove can begin a fresh download. IndexedDB puts, deletes, and clears are serialized, preventing a stale put already entering persistence from overtaking its invalidating delete/clear.
- Regression coverage: `src/compiler/typstPackageRegistry.test.ts` uses deferred fetch responses and a fake IndexedDB store to prove clear cannot be undone by an earlier shared download, remove detaches an earlier download and permits a replacement download, and ordinary concurrent successful callers still deduplicate to one fetch and one persisted package.
- Verification evidence:
  - Pre-edit: `npx vitest run src/compiler/typstPackageRegistry.test.ts` — failed as expected; the clear-invalidated callers fulfilled instead of rejecting, and a caller started after remove remained attached to the one stale fetch instead of starting a replacement.
  - `npx vitest run src/compiler/typstPackageRegistry.test.ts` — 1 file passed, 3 tests passed.
  - `npx vitest run src/compiler` — 7 files passed, 26 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

### 7. PWA Offline Ready Can Exclude First-Use Compiler Assets

- Severity: Medium
- Files/functions: `vite.config.ts` Workbox config
- Reproduction:
  1. Install the PWA.
  2. Do not compile while online.
  3. Go offline.
  4. Compile for the first time.
- Why it matters: the app may be advertised as offline ready while required compiler assets are only runtime-cached.
- Suggested test: Playwright production build, service worker installed, offline first compile.
- Minimal fix strategy: precache required compiler assets or explicitly warm/cache them after install.

- Status: Verified (2026-07-10)
- Remediation: Offline readiness now waits for the Workbox precache, explicitly caches the Typst compiler and renderer WASM plus all 16 bundled core fonts, and successfully initializes the compiler worker before publishing `typr:offline-ready`. The service worker claims the installing client so its cache-first compiler route is active immediately. MiTeX, RaTeX, Typst Universe package downloads, and the optional BusyTeX `binaryInlined` chunk are not included in the mandatory compiler warm-up or precache.
- Regression coverage: `tests/e2e/offline-first-compile.spec.ts` installs a fresh production service worker without compiling, waits for Typr's compiler-aware readiness barrier, verifies every required WASM/font asset is cached and optional package/runtime assets are absent, switches Chromium offline, imports the first Typst document, and requires a real rendered preview with no failed requests or browser errors.
- Verification evidence:
  - Source-level reproduction: the previous Workbox configuration excluded `.wasm`, `.otf`, and `.ttf` files from precache, populated its compiler runtime cache only on demand, and reported offline readiness without a compiler-asset readiness barrier.
  - Initial production regression run: `npm run test:e2e:pwa` built successfully (514 modules and 225 precache entries) and exercised the fresh-install/offline-first-compile path; its original retired canvas selector failed, and an online control failed identically. Updating the assertion to the current image-backed Typst preview made the test accurately observe the compile result.
  - `npx vitest run src/compiler` — 7 files passed, 26 tests passed.
  - `npm run test:e2e:pwa` — passed; production build transformed 514 modules in 18.35 s, generated 225 precache entries, and the offline first-compile Playwright test passed in 5.6 s.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

### 8. OPFS Workspace Mirror Does Not Prune Removed Files

- Severity: Medium
- Files/functions: `src/workspace/opfsWorkspace.ts` `syncProjectToOpfs`
- Reproduction:
  1. Sync project to OPFS.
  2. Delete or rename a file in Typr.
  3. Sync again.
  4. Inspect OPFS tree.
- Why it matters: deleted files remain in the local filesystem mirror, which can confuse local filesystem workflows.
- Suggested test: fake OPFS directory handle with stale files.
- Minimal fix strategy: prune OPFS entries absent from the current project, or replace the worktree root atomically.

- Status: Verified (2026-07-10)
- Remediation: OPFS synchronization now compares current and desired bytes before opening a writable, writes and closes every changed file before pruning, and removes only entries absent from the selected project's `worktree`. Desired nested and empty directories are retained, while stale files and whole stale directory subtrees are removed. The consistency strategy is explicitly write-before-prune: a failed file write is aborted and propagated, no pruning occurs after that failure, and a retry can safely converge even though files committed earlier in the write phase may already contain current content. Sibling projects and unrelated OPFS roots are outside the prune boundary.
- Regression coverage: `src/workspace/opfsWorkspace.test.ts` uses a fake OPFS tree to cover byte-identical text and binary files, changed content, stale deleted files, renamed paths, nested stale directories, retained empty directories, sibling projects, unrelated OPFS roots, and failed partial writes. The failure case proves the staged write is aborted without exposing partial bytes and stale entries remain until a complete synchronization succeeds.
- Verification evidence:
  - Pre-implementation: `npx vitest run src/workspace/opfsWorkspace.test.ts` — 1 file failed with 2 intended regression failures and 3 existing tests passed; unchanged content was rewritten and the failed write was not aborted.
  - `npx vitest run src/workspace/opfsWorkspace.test.ts` — 1 file passed, 5 tests passed.
  - `npx vitest run src/workspace` — 2 files passed, 7 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

### 9. Preview PDF Download For Typst Can Use The Wrong Main File

- Severity: Medium
- Files/functions: `src/app/App.tsx` preview PDF download path; `src/compiler/typstRuntime.ts` `exportTypstPdf`; `src/compiler/typstAssets.ts` default main path
- Reproduction:
  1. Preview a nested Typst file with relative imports.
  2. Download the preview as PDF from the preview menu.
- Why it matters: export can compile as `/main.typ` and omit project shadow files, so output can fail or differ from preview.
- Suggested test: mock `exportTypstPdf` and assert `mainFilePath` plus project assets.
- Minimal fix strategy: pass `{ mainFilePath: activePreviewCompileSourcePath ?? sourcePath }` and include `buildTypstProjectShadowFiles`.

- Status: Verified (2026-07-10)
- Remediation: Typst PDF downloads from an SVG preview now export through the visible preview's compile source path, falling back to the selected source path only when no preview compile path is available. The export maps the complete project filesystem into Typst shadow files, preserves binary assets and generated diagram assets, and overlays the visible preview source at the selected main path so unsaved content, nested relative imports, and asset resolution use the same project context as the preview.
- Regression coverage: `src/app/typstPreviewExport.test.ts` mocks `exportTypstPdf` and verifies a nested Typst preview passes its path as `mainFilePath`, retains its relative import and binary image asset alongside every other project file and generated asset, and replaces the saved nested main file with the visible source. A second case verifies fallback to `sourcePath` and its complete shadow context when `activePreviewCompileSourcePath` is unavailable.
- Verification evidence:
  - Pre-implementation: `npx vitest run src/app/typstPreviewExport.test.ts` — 1 file failed because the preview-consistent export path was absent.
  - `npx vitest run src/app/typstPreviewExport.test.ts` — 1 file passed, 2 tests passed.
  - `npx vitest run src/app/typstPreviewExport.test.ts src/app/previewContent.test.ts src/app/compilePreviewState.test.ts src/compiler/typstCompiler.test.ts` — 4 files passed, 18 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.
  - `npm run build` — passed TypeScript checks and the Vite/PWA production build.


## Desktop Browser UI QA

Run against the Vite dev server at `http://127.0.0.1:5174/` with Playwright desktop viewport `1440x1000`. Google Chrome was not installed in this environment, so I used Playwright Chromium for Chrome-engine coverage plus Playwright Firefox. Browser artifacts are copied in `qa-ui-artifacts/`, including `chromium-ui-qa.json`, `firefox-ui-qa.json`, `chromium-inspect.json`, and screenshots for the inspected states.

Verification command:

```sh
npx playwright test --config=/tmp/typr-pw/playwright.config.js
```

Result: failed on confirmed `pageerror` events when opening the Diagram panel in both Chromium and Firefox.

### 10. Diagram Panel Throws SVG-Edit Runtime Errors In Chromium And Firefox

- Severity: High
- Files/functions: `src/diagram/SvgEditDiagramEditor.tsx` `DiagramEditor` mount effect; `mountEditor` dynamic import/init at lines 130-153; `loadSvgString(initialSvg)` at line 161; cleanup at lines 177-188; diagram reload effect at lines 191-207
- Reproduction:
  1. Open Typr in desktop Chromium or Firefox.
  2. Open the Diagram side-panel tool.
  3. Watch browser page errors.
  4. Chromium reports `Cannot read properties of null (reading setAttribute)` from `svgedit.js:49244`.
  5. Firefox reports `Pe(...) is null` from `togglePathEditMode`, with the stack passing through `mountEditor` and `DiagramEditor`.
- Why it matters: an uncaught cross-browser runtime error can leave the diagram editor in an unstable state, especially under React dev StrictMode where the mount effect is invoked twice.
- Suggested test: add a Playwright smoke test for Chromium and Firefox that opens Diagram and fails on `pageerror`; also assert the SVG editor canvas remains present after switching away and back.
- Minimal fix strategy: make SVG-Edit mount/load/cleanup idempotent. Do not call `loadSvgString` into a torn-down editor, guard delayed SVG-Edit callbacks after unmount, and only clear the host after any editor-owned cleanup/destroy path has completed.

- Status: Verified (2026-07-10)
- Remediation: SVG-Edit now has one page-lifetime lifecycle owner. Initialization is shared across React StrictMode effect replay, SVG loads are queued until an attached initialized runtime exists, duplicate reloads are keyed by diagram ID and SVG content, and change callbacks update the loaded-content key before propagating state. Detach cancels wrapper-owned delayed callbacks and moves the intact editor runtime to a connected offscreen parking host; the React host is never cleared out from under SVG-Edit, whose current API exposes no editor-level destroy method. Reattachment moves that same runtime back before pending loads or ready callbacks run.
- Regression coverage: `tests/e2e/diagram-lifecycle.spec.ts` listens for and fails on every `pageerror`, verifies the initialized SVG content and visible editor canvas, exercises the development `React.StrictMode` mount/unmount replay, repeatedly switches from Diagram to Files and back at callback-sensitive delays, confirms exactly one parked canvas while detached, and confirms the original canvas remains visible and intact after reattachment. `playwright.config.ts` runs the spec in both Chromium and Firefox.
- Verification evidence:
  - Pre-implementation reproduction: the documented desktop-browser run `npx playwright test --config=/tmp/typr-pw/playwright.config.js` failed in both Chromium and Firefox with the SVG-Edit `setAttribute` / `togglePathEditMode` pageerrors recorded above.
  - Focused stress check: Chromium repeated the lifecycle spec 3 times successfully (`3 passed`).
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173/ npx playwright test --config=playwright.config.ts tests/e2e/diagram-lifecycle.spec.ts` — Chromium and Firefox passed (`2 passed`).
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

## Repository Optimization Audit

Scope: static source review for simplification, unused code, duplicated helpers/assets, and likely performance hotspots. No production code changes were made during this audit.

Verification command used:

```sh
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
```

Result: expected unused-code diagnostics across the current working tree. This was used only to identify cleanup candidates.

### 12. Retired Custom Diagram Editor Still Dominates The Codebase

- Severity: Medium
- Files/functions: `src/app/App.tsx` imports `DiagramEditor` from `src/diagram/SvgEditDiagramEditor.tsx`; `src/diagram/DiagramEditor.tsx` still exports a separate custom `DiagramEditor`; `src/diagram/DiagramEditor.tsx` `serializeDiagramSvg`; `src/diagram/DiagramEditor.tsx` `DiagramEditorErrorBoundary`
- Why it matters: the old custom diagram editor is about 6.2k lines. Current app wiring uses the SVG-Edit wrapper, while the old file appears to be kept mainly for SVG serialization and the error boundary.
- Suggested test: keep focused serializer snapshot tests before extraction.
- Minimal fix strategy: extract `serializeDiagramSvg` and `DiagramEditorErrorBoundary` into small modules, verify no custom-editor UI call sites remain, then remove the old editor component and unused geometry/UI helpers.

- Status: Verified (2026-07-10)
- Remediation: `serializeDiagramSvg` now lives in `src/diagram/diagramSvgSerializer.ts`, and `DiagramEditorErrorBoundary` now lives in `src/diagram/DiagramEditorErrorBoundary.tsx`. App, workspace serialization, and SVG-Edit call sites import those owned modules directly. The retired 6,216-line `src/diagram/DiagramEditor.tsx` custom editor and its unused custom toolbar icon assets were removed; current Diagram UI wiring remains on `src/diagram/SvgEditDiagramEditor.tsx`, and no Graph code or runtime dependencies were restored.
- Regression coverage: `src/diagram/diagramSvgSerializer.test.ts` snapshots legacy stroke/shape serialization and derived framing while asserting SVG-Edit content is preserved byte-for-byte. `src/diagram/DiagramEditorErrorBoundary.test.ts` covers normal child rendering and the isolated Diagram fallback after an editor error.
- Verification evidence:
  - Initial focused confirmation: `npx vitest run src/diagram/diagramSvgSerializer.test.ts src/diagram/DiagramEditorErrorBoundary.test.ts` — 2 files passed, 5 tests passed.
  - Import/deletion audit: production references resolve only to `diagramSvgSerializer`, `DiagramEditorErrorBoundary`, and `SvgEditDiagramEditor`; `src/diagram/DiagramEditor.tsx` and the custom `src/icons/diagram` toolbar assets are deleted.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm run build` — passed; Vite transformed 501 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - Initial `npm run test:e2e:diagram` infrastructure attempt — Playwright did not start because the Vite dev server could not unlink a root-owned `node_modules/.vite` cache file. No user-owned cache files were changed.
  - Production-preview smoke: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/ npx playwright test --config=playwright.config.ts` — Chromium and Firefox both passed the SVG-Edit StrictMode/repeated-remount Diagram test (2 tests passed).

### 13. SVG-Edit Diagram Wrapper Keeps Obsolete Stroke/Shape Props

- Severity: Medium
- Files/functions: `src/diagram/SvgEditDiagramEditor.tsx` `SvgEditDiagramEditorProps`; `src/app/App.tsx` diagram handlers and props passed to `DiagramEditor`
- Why it matters: `SvgEditDiagramEditor` only uses SVG-string callbacks, but its props still require the old stroke/shape editor contract. `App.tsx` therefore keeps handlers for strokes, shapes, frame updates, color controls, and undo paths that the current wrapper does not use.
- Suggested test: TypeScript unused-code check after relaxing or removing obsolete props.
- Minimal fix strategy: make the SVG-Edit wrapper API match what it actually consumes, then remove unused diagram handlers/state from `App.tsx`.

- Status: Verified (2026-07-10)
- Remediation: `SvgEditDiagramEditorProps` now contains only the 11 values and callbacks destructured by the SVG-Edit wrapper. App no longer creates or passes the obsolete ink/fill/stroke/marker palette state, stroke/shape add-update-remove callbacks, frame update callback, undo callback, or unused expansion/paper props. The audit intentionally retains legacy stroke/shape model types, normalization, reducers, and serialization because stored pre-SVG-Edit diagrams still use them. SVG-string load/change/new/save/insert/download wiring is unchanged.
- Regression coverage: `src/diagram/SvgEditDiagramEditor.test.ts` enforces the exact component prop contract and the SVG-string callback signatures at compile time.
- Verification evidence:
  - Pre-implementation reproduction: `npx vitest run src/diagram/SvgEditDiagramEditor.test.ts` — 1 file failed, 2 tests failed; the wrapper exposed 24 surplus props and App retained all 14 audited obsolete symbols.
  - Call-site audit: repository-wide searches found the obsolete App-local state and callbacks only in their declarations and unused `DiagramEditor` props. Legacy diagram model symbols remain live in `appState` normalization/reducers and `diagramSvgSerializer`.
  - `npx vitest run src/diagram/SvgEditDiagramEditor.test.ts src/diagram/diagramSvgSerializer.test.ts src/diagram/DiagramEditorErrorBoundary.test.ts` — 3 files passed, 7 tests passed.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm run build` — passed; Vite transformed 501 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - Initial `npm run test:e2e:diagram` infrastructure attempt — Playwright could not start the Vite dev server because it could not unlink the pre-existing root-owned `node_modules/.vite/deps/@codemirror_autocomplete.js` cache file. No unrelated cache files were modified.
  - Production-preview smoke: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/ npx playwright test --config=playwright.config.ts tests/e2e/diagram-lifecycle.spec.ts` — Chromium and Firefox passed (2 tests passed).

### 14. Global CSS Contains Old And New Diagram Editor Style Blocks

- Severity: Medium
- Files/functions: `src/styles/global.css` old `.diagram-editor` styles around lines 3537-4218; current `.diagram-editor--svgedit` styles around lines 9070-9318
- Why it matters: dead styles increase maintenance cost and make visual regressions harder to reason about.
- Suggested test: visual smoke test for the current SVG-Edit diagram panel after cleanup.
- Minimal fix strategy: after removing the retired custom editor, delete the old diagram-specific CSS while keeping shared/error/SVG-Edit styles that still apply.

- Status: Verified (2026-07-10)
- Remediation: Removed 650 lines of retired custom Diagram CSS, including the old header controls, toolbar/palette, surface/crop, paper/expanded variants, generic action rules, and obsolete Diagram popup. The live `.diagram-editor` shell, error-boundary header styles, shared inline-pane expansion controls, and all `.diagram-editor--svgedit` wrapper/runtime/theme/error styles remain. No Graph code, UI, state, or dependencies were restored.
- Regression coverage: A boundary-aware repository search confirms the removed custom-editor and popup selectors have no residual definitions or call sites. Production-preview Playwright checks cover the live SVG-Edit lifecycle in desktop Chromium and Firefox, plus fresh desktop and mobile Chromium visual smoke at 1440x1000 and 390x844 with page-error, control-presence, and horizontal-overflow assertions.
- Verification evidence:
  - Prerequisite audit: Findings 12 and 13 are both Verified.
  - Residual selector/call-site search: no retired custom header, palette/tool, surface/crop, paper/expanded, or Diagram popup selectors remain; current shared/error and SVG-Edit selectors still resolve to `SvgEditDiagramEditor`, `svgEditLifecycle`, and `DiagramEditorErrorBoundary`.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm run build` — passed; Vite transformed 501 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/ npx playwright test --config=playwright.config.ts tests/e2e/diagram-lifecycle.spec.ts` — Chromium and Firefox passed (2 tests passed).
  - Desktop/mobile visual smoke — Chromium passed at 1440x1000 and 390x844 with no page errors, all five Diagram actions present, and the panel contained within each viewport. Fresh screenshots: `qa-ui-artifacts/finding-14-diagram-desktop.png` and `qa-ui-artifacts/finding-14-diagram-mobile.png`.

### 15. Main App Component Is A Large Cross-Cutting Module

- Severity: Medium
- Files/functions: `src/app/App.tsx`
- Why it matters: `App.tsx` is about 22.9k lines and mixes persistence, compile scheduling, preview tabs, Git, settings, build log, packages, workspace tree, docs, and UI rendering. This makes small changes harder to review and increases accidental coupling.
- Suggested test: preserve current focused reducer/helper tests, then add hook/component tests around extracted behavior.
- Minimal fix strategy: extract feature hooks and panels incrementally, starting with compile/preview state, workspace tabs/tree actions, Git panel state, settings sheet, and build log.

- Status: Verified (2026-07-11)
- Extracted ownership boundary: `src/app/useCompilePreviewController.ts` now owns compiler creation/disposal, the mounted guard, compile result and last-successful state, per-preview-source result/status state, timer/debounce scheduling, queued preview activity, stale LaTeX cancellation, and application of restored results. `src/app/compilePreviewCache.ts` owns Typst cache signatures/serialization and saved LaTeX PDF/SyncTeX freshness restoration. `src/app/compilePreviewState.ts` owns preview-state construction and idle/completed status transitions. `App.tsx` retains project-aware compile execution and UI orchestration while consuming those boundaries.
- Finding 15D Settings ownership boundary: `src/settings/settingsSheetState.ts` owns the unchanged `typr.settings-menu.v1` key, persisted tab/scroll normalization, tab metadata, and search vocabulary. `useSettingsSheetController.ts` owns active-tab, search, mobile-navigation, per-tab scroll save/restore, matching-tab navigation, and keybinding-recorder focus state. `SettingsSheet.tsx` owns the accessible sheet shell used by both desktop overlay and embedded mobile layouts, while `SettingsPanelContent.tsx` owns all six tab render surfaces. `App.tsx` now supplies settings business data/commands through one binding boundary and retains only open/close and sidebar orchestration.
- Finding 15D Build Log ownership boundary: `src/buildLog/buildLogState.ts` owns the unchanged `typr.build-log.v1:<project>` key, entry/filter contracts, stored-entry normalization, filtering, export formatting, package/shell-escape extraction, diagnostic grouping, and warning deduplication. `useBuildLogController.ts` owns project-scoped hydration/persistence, entries, filters, search, warning visibility, clipboard feedback, clearing, and text/JSON export actions. `BuildLogPanel.tsx` owns the complete Debug sidebar Build Log surface. `App.tsx` retains only compile-result append calls plus app-level rerun, diagnostic-jump, download, raw-log excerpt, and compile-strategy adapters. No Graph code, state, UI, or runtime dependency was restored.
- Finding 15B extracted ownership boundary: `useWorkspaceSelection.ts` owns file-tree selection state and reconciliation; `useWorkspaceTabs.ts` owns source/preview tab and drag state; `useWorkspaceTabPersistence.ts` owns project-specific tab restoration, availability reconciliation, transient preview cleanup, and preview-tab persistence; `useWorkspacePersistence.ts` owns synchronized snapshot/project-repository state, selected-repository refs, lifecycle save scheduling, and current persistence payloads. `workspaceTabs.ts`, `workspaceSelection.ts`, and `workspaceTreeActions.ts` own tested tab transitions, selection ranges, copy/paste domains, subtree copies, path remapping, moves, and trash reducers. Existing keyboard, mobile, drag/drop, and project-repository call sites remain in `App.tsx` and consume these boundaries.
- Finding 15C extracted ownership boundary: `src/app/useGitPanelController.ts` now owns managed Git project selection, local repository initialization/status/branch/history refresh, stage/unstage/stage-all/commit transitions, upstream tracking, merge-stop initialization/resolution/continuation/abort state, synchronized merge-version pane scrolling, remote-operation serialization/progress, and fetch/pull/push/sync/quick-save execution. `src/git/gitPanelState.ts` owns the pure scoped-selection, status projection, merge initialization/resolution, and remote-operation lock transitions. `App.tsx` retains IndexedDB credential/workspace hydration and persistence, legacy GitHub config migration, Typr project lifecycle/import/clone/create orchestration, and thin online/connection validation wrappers, so credential and repository persistence boundaries are unchanged.
- Regression coverage: `src/app/compilePreviewCache.test.ts` verifies signature-matched Typst restoration and fresh LaTeX PDF/SyncTeX restoration while rejecting an unsaved source mismatch. `workspaceTabs.test.ts`, `workspaceSelection.test.ts`, `workspaceTreeActions.test.ts`, and `workspacePersistence.test.ts` cover normalized tab insertion, close/reorder/reconciliation, stale and Trash selection fallback, inclusive ranges, subtree copies, moves, trash cleanup, and snapshot/project-repository synchronization. Existing compile/preview, workspace rename, appState, OPFS, lifecycle persistence, and project fixtures remain passing.
- Finding 15C regression coverage: `src/git/gitPanelState.test.ts` covers Typr-project-scoped managed-repo add/select/remove transitions, ignored working-tree projection, merge-panel reset and resolution drafts, and serialized remote-operation completion. `tests/e2e/git-panel.spec.ts` covers production-rendered Git panel initialization, an editor change through stage and commit, local history refresh, disabled unauthenticated pull/push controls, managed-repo add/remove, and page-error absence.
- Finding 15D regression coverage: `src/settings/settingsSheetState.test.ts` covers the stable storage key, persisted tab/scroll normalization, invalid-storage fallback, and retained search vocabulary. `src/buildLog/buildLogState.test.ts` covers the stable project-scoped storage key, legacy entry normalization, diagnostic/current-file/language/search filters, and text export formatting. `tests/e2e/settings-build-log.spec.ts` covers desktop overlay tabs/close/persistence, embedded mobile nav/search/tab collapse, a real editor-triggered compile rendered in Build Log, filter/search/clear actions, and page-error absence.
- Verification evidence:
  - Pre-edit focused baseline: `npx vitest run src/app/compilePreviewState.test.ts src/app/previewContent.test.ts src/app/typstPreviewExport.test.ts src/compiler/typstCompiler.test.ts` — 4 files passed, 25 tests passed.
  - Test-first extraction check: `npx vitest run src/app/compilePreviewCache.test.ts` — failed as expected because `./compilePreviewCache` did not yet exist.
  - Final focused compile/preview gate: `npx vitest run src/app/compilePreviewCache.test.ts src/app/compilePreviewState.test.ts src/app/previewContent.test.ts src/app/typstPreviewExport.test.ts src/compiler/typstCompiler.test.ts` — 5 files passed, 27 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.
  - Unit gate: `npx vitest run src` — 41 files passed, 190 tests passed.
  - Repository `npm test` attempt — all 41 unit files and 190 unit tests passed, but Vitest also collected the two separately configured Playwright specs under `tests/e2e`; both failed at collection with Playwright's expected “test() called here” guard. No compile/preview or unit assertion failed.
  - `npm run build` — passed; Vite transformed 504 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.

  - Finding 15C confirmed failing baseline: `npm run typecheck` reproduced duplicate App/controller staging declarations before the stale App-owned handlers were removed.
  - Finding 15C Git gate: `npx vitest run src/git` — 5 files passed, 39 tests passed.
  - Finding 15C `npm run typecheck` — passed both TypeScript configurations.
  - Finding 15C `npm run build` — passed; Vite transformed 513 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - Finding 15C Git panel smoke: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/ npx playwright test --config=playwright.config.ts tests/e2e/git-panel.spec.ts --project=chromium` — 1 test passed against the production preview.
  - Finding 15D test-first extraction check: `npx vitest run src/settings/settingsSheetState.test.ts src/buildLog/buildLogState.test.ts` — both suites failed as expected because the feature modules did not yet exist.
  - Finding 15D focused Settings/Build Log gate: `npx vitest run src/settings src/buildLog` — 2 files passed, 4 tests passed.
  - Finding 15D full unit gate: `npm test -- --exclude 'tests/e2e/**'` — 48 files passed, 210 tests passed; repository audit confirmed every Vitest `*.test.ts` / `*.test.tsx` suite is under `src`, while `tests/e2e` remains Playwright-owned.
  - Finding 15D `npm run typecheck` — passed both TypeScript configurations.
  - Finding 15D `npm run build` — passed; Vite transformed 520 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - Finding 15D Settings/Build Log smoke: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/ npx playwright test --config=playwright.config.ts tests/e2e/settings-build-log.spec.ts --project=chromium` — 2 tests passed against the production preview.
  - Finding 15D ownership audit: `App.tsx` is now 19,640 lines; Settings storage/controller/shell/all-tab JSX live under `src/settings`, Build Log storage/controller/full-panel JSX live under `src/buildLog`, and no retired Graph reference was introduced in App, either feature directory, or `package.json`.

### 16. Unused-Code Checks Find Many Concrete Removal Candidates
  - Finding 15B test-first extraction check: `npx vitest run src/app/workspaceTabs.test.ts src/app/workspaceSelection.test.ts src/app/workspaceTreeActions.test.ts src/app/workspacePersistence.test.ts` — all 4 suites failed as expected because the extracted modules did not yet exist.
  - Finding 15B focused workspace/appState/project gate: `npx vitest run src/workspace src/app/appState.test.ts src/app/workspaceRename.test.ts src/app/workspaceTabs.test.ts src/app/workspaceSelection.test.ts src/app/workspaceTreeActions.test.ts src/app/workspacePersistence.test.ts src/app/lifecyclePersistence.test.ts src/project` — 11 files passed, 44 tests passed.
  - Finding 15B broader unit gate: `npx vitest run src` — 45 files passed, 202 tests passed.
  - Finding 15B `npm run typecheck` — passed both TypeScript configurations.
  - Finding 15B `npm run build` — passed; Vite transformed 511 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - Finding 15B retired-Graph guard: no `src/graph`, `GraphEditor`, `graphRuntime`, or `graph-runtimes` references were introduced in App, workspace, project, or `package.json`.

- Severity: Low
- Files/functions: `src/app/App.tsx`; `src/diagram/DiagramEditor.tsx`; `src/preview/PreviewPane.tsx`; `src/editor/editorTools.ts`; `src/git/remoteService.ts`; `src/git/repoBackend.ts`; `src/terminal/browserBackend.ts`
- Why it matters: unused imports, handlers, helpers, and parameters make live behavior harder to identify. The diagnostic pass found dozens of candidates, especially in `App.tsx` and the retired diagram editor.
- Suggested test: run `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` in CI once the current set is resolved.
- Minimal fix strategy: enable unused checks in a separate cleanup PR or run the command periodically until it is clean.

- Status: Verified (2026-07-11)
- Confirmed reproduction and classification: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` initially exited 2 with 69 diagnostics: 56 App-owned imports, controller bindings, helpers, handlers, derived values, and components; 13 test, editor, Git, preview, renderer, and terminal diagnostics. After those direct removals, 12 additional App imports, state bindings, controller bindings, constants, and helpers were exposed and removed as dead cascades.
- Remediation: Removed declaration-only App menu, GitHub, file/download/export, table, preview, trash, and navigation code in ownership-based batches; removed dead imports/helpers from editor tooling, Git, preview rendering, terminal, and one test. Public inputs that remain meaningful to callers were preserved without binding unused values, and the live outer preview debug callback contract was retained while its unused inner prop was removed. No Graph source, state, UI, or runtime dependency was restored.
- Retained-diagnostic rationale: none. The strict unused-code command now exits 0 with no diagnostics. No new regression test was needed because ownership was unambiguous and existing focused suites cover every touched non-App subsystem.
- Verification evidence:
  - Confirmed reproduction: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` — exited 2 with the 69 diagnostics classified above.
  - Focused ownership gate: `npx vitest run src/editor/editorTools.test.ts src/preview/PreviewPane.test.ts src/preview/typstRendererConsumers.test.ts src/git/remoteService.test.ts src/git/repoBackend.test.ts src/terminal/browserBackend.test.ts src/diagnostics/externalDiagnostics.test.ts` — 7 files passed, 51 tests passed.
  - Full source unit gate: `npx vitest run src` — 57 files passed, 233 tests passed.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm run build` — passed; icon assets and BusyTeX assets verified, Vite transformed 525 modules, and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - Final unused-code gate: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` — passed with no diagnostics.
  - Broader-command classification: `npm test` ran all 57 source unit files successfully (233 tests) but exited 1 because Vitest also collected four pre-existing Playwright files under `tests/e2e`, where Playwright rejects `test()` calls outside its runner. This is the same unrelated discovery issue already documented under Finding 18 and was preserved.

### 18. Package Manifest Includes Apparent Unused WTerm Dependencies

- Severity: Low
- Files/functions: `package.json` dependencies `@wterm/just-bash` and `@wterm/react`
- Why it matters: source imports use `just-bash` directly; `@wterm/just-bash` and `@wterm/react` appear only in `package.json`.
- Suggested test: `npm run build` and terminal drawer smoke test after dependency removal.
- Minimal fix strategy: remove unused dependencies and update `package-lock.json`.

- Status: Verified (2026-07-11)
- Dependency audit: A repository-wide case-insensitive search found WTerm names only in `package.json`, `package-lock.json`, and this finding (plus its preserved `.orig` copy); there were no runtime, test, dynamic-import, Vite/build configuration, script, README, or documentation call sites. `npm explain` showed each package was present only because it was a root dependency. A post-build search also found no WTerm reference in `dist`.
- Remediation: Removed `@wterm/just-bash` and `@wterm/react` with `npm uninstall --ignore-scripts`, mechanically updating `package-lock.json`. Their now-orphaned `@wterm/core` and `@wterm/dom` lockfile entries were removed as part of the same operation.
- Retained dependency rationale: `just-bash@2.14.5` remains deliberate. `src/terminal/browserBackend.ts`, `src/terminal/projectFilesystemAdapter.ts`, and `src/terminal/commandRegistry.ts` import it directly to implement the active browser shell; post-removal `npm ls` contains that package and no WTerm subtree.
- Verification evidence:
  - Confirmed reproduction/audit: pre-removal `npm ls @wterm/just-bash @wterm/react @wterm/core @wterm/dom just-bash --all` showed both root WTerm packages and their WTerm subtree; repository and build-configuration searches found no application consumer.
  - Post-removal dependency/bundle audit: `npm ls @wterm/just-bash @wterm/react @wterm/core @wterm/dom just-bash --all` reports only `just-bash@2.14.5`; package/lock/source/test/script/documentation and generated-`dist` searches contain no WTerm call site.
  - `npx vitest run src/terminal` — 3 files passed, 10 tests passed, covering the browser backend, terminal autocomplete, and terminal hotkey.
  - `npx vitest run src` — 57 files passed, 233 tests passed.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm run build` — passed; Vite transformed 526 modules and the PWA generated 212 precache entries. Existing non-fatal browser-externalized `fs` and large-chunk warnings remained.
  - Production terminal smoke — Chromium and Firefox both opened the terminal drawer with the keyboard shortcut, displayed `Browser Shell ready in /project`, executed `pwd` with `/project` output, closed the drawer, and emitted no page errors.
  - Broader-command note: `npm test` ran all 57 source unit files successfully (233 tests) but exited 1 because Vitest also collected four pre-existing Playwright files under `tests/e2e`, where Playwright rejects `test()` calls outside its runner. The clean source-only unit gate above passes; this unrelated test-discovery configuration was preserved.

### 19. Path Normalization Helpers Are Duplicated With Slightly Different Semantics

- Severity: Medium
- Files/functions: `src/app/App.tsx` local workspace path helpers; `src/app/appState.ts` path helpers; `src/workspace/workspaceTree.ts` `normalizeWorkspacePath`; `src/project/projectState.ts` `normalizeProjectPath`; `src/git/gitState.ts` `normalizeProjectPath`; `src/git/pathFilters.ts`
- Why it matters: path handling differences can become bugs around nested folders, root-relative paths, `.git` paths, and user input sanitization.
- Suggested test: shared path utility tests covering slash normalization, dot segments, basename-only renames, and reserved paths.
- Minimal fix strategy: centralize common relative-path operations while preserving stricter project/git-specific validators.
- Status: Verified (2026-07-11)
- Inventory/classification:
  - Shared semantics: slash and root-relative normalization, whitespace and dot-segment cleanup, basename, parent, join, segment-aware prefix removal, and subtree move now live in `src/utils/relativePath.ts`.
  - Shared consumers: App workspace actions, appState rename/move reducers, workspace-tree normalization, Git ignore matching, and Git managed-workspace settings use the common operations.
  - Project validation remains stricter: `normalizeProjectPath` still rejects NUL bytes, drive-root input, and every `..` segment before delegating generic cleanup; `assertSafeProjectPath` still rejects empty and reserved `.git` paths.
  - Git repository storage/ref normalization remains purpose-specific so unsafe `..` input is visible to ref validation instead of being resolved away. Repository operations continue to reject project traversal and `.git` internals.
  - App reference resolution and pasted-image naming/directory sanitizers remain purpose-specific user-input policies rather than generic path operations.
- Regression coverage: `src/utils/relativePath.test.ts` covers single and repeated backslashes, redundant slashes, root-relative input, dot segments, basename/parent/join, basename-only renames, nested moves without sibling-prefix collisions, figures prefix semantics, and the boundary between generic normalization and reserved Git validation. `src/git/gitState.test.ts`, `src/project/projectState.test.ts`, and `src/git/repoBackend.test.ts` cover the stricter consumers.
- Confirmed reproduction: before the fix, `npx vitest run src/utils/relativePath.test.ts` failed 1 of 5 tests because a single-backslash Windows-style path remained backslash-delimited.
- Verification evidence:
  - `npx vitest run src/utils/relativePath.test.ts` — 1 file passed, 5 tests passed.
  - `npx vitest run src/utils/relativePath.test.ts src/app/appState.test.ts src/app/workspaceRename.test.ts src/workspace/workspaceTree.test.ts src/workspace/opfsWorkspace.test.ts src/project/projectState.test.ts src/git/gitState.test.ts src/git/pathFilters.test.ts src/git/repoBackend.test.ts` — 9 files passed, 49 tests passed.
  - `npm run typecheck` — both TypeScript checks completed without diagnostics.

### 20. Markdown Rendering Exists In Three Separate Implementations

- Severity: Low
- Files/functions: `src/app/DocsModal.tsx` uses `marked`; `src/app/App.tsx` custom Markdown HTML export helpers; `src/preview/PreviewPane.tsx` custom Markdown React renderer
- Why it matters: link parsing, inline formatting, block parsing, and sanitization behavior can diverge between docs, preview, and export.
- Suggested test: shared Markdown fixtures asserting preview/export/docs behavior where they should match.
- Minimal fix strategy: introduce a shared Markdown block/parser layer or standardize on `marked` with a small adapter for source mapping where needed.

- Status: Verified (2026-07-11)
- Behavior contract:
  - Shared parsing: Docs, workspace preview, and rendered HTML export use the same `marked` CommonMark/GFM block and inline grammar, including headings, paragraphs, quotes, lists, tables, fenced/inline code, emphasis, deletion, links, and Markdown escaping.
  - Docs retain their pre-existing trusted bundled-content policy: raw HTML and all parsed link/image targets are emitted.
  - Preview retains its restricted policy explicitly: raw HTML is escaped; only `http`, `https`, `mailto`, fragment, root-relative, and dot-relative links are active; external HTTP(S) links keep `rel="noreferrer"` and `target="_blank"`; images remain literal Markdown instead of initiating requests.
  - HTML export retains its pre-existing policy explicitly: raw HTML is escaped while parsed link and image targets are emitted.
- Remediation: `src/markdown/markdownParser.ts` now owns lexing, HTML rendering modes, top-level block ranges, and active-line lookup. `src/markdown/MarkdownPreviewBlocks.tsx` adapts shared blocks to React while preserving source-line metadata, active highlighting, forward/reverse synchronization keys, and double-click source jumps. `DocsModal.tsx`, `App.tsx`, and `PreviewPane.tsx` no longer contain separate Markdown parsers.
- Regression coverage: shared fixtures in `src/markdown/__fixtures__/sharedMarkdownFixtures.ts` cover blocks, inline formatting, links, fenced/inline code, escaping, raw HTML, unsafe link/image targets, and source ranges. Dedicated Docs, export, preview-parser, and preview-source-block suites assert both converged grammar and intentional sanitization differences.
- Confirmed reproduction: before the adapter existed, `npm test -- --run src/markdown/markdownPreview.test.ts src/markdown/markdownExport.test.ts src/markdown/markdownDocs.test.ts` failed all 3 suites because the shared parser module was absent.
- Verification evidence:
  - `npm test -- --run src/markdown/markdownPreview.test.ts src/markdown/MarkdownPreviewBlocks.test.tsx src/markdown/markdownExport.test.ts src/markdown/markdownDocs.test.ts src/preview/PreviewPane.test.ts` — 5 files passed, 6 tests passed.
  - `npm test -- --run --exclude tests/e2e/**` — 57 files passed, 233 tests passed.
  - `npm run typecheck` — both TypeScript checks completed without diagnostics.
  - `npm run build` — TypeScript checks passed, Vite transformed 526 modules and built in 16.00 s, and the PWA generated a service worker with 212 precache entries.
  - Unrelated gate classification: plain `npm test` passed the same 57 unit files / 233 tests but exited nonzero because Vitest collected 4 Playwright-owned `tests/e2e/*.spec.ts` files; each failed before test definition with Playwright runner-context errors. The scoped unit command above excludes those Playwright specs and passes.


### 21. Hashing And Byte Comparison Helpers Are Reimplemented In Multiple Modules

- Severity: Low
- Files/functions: `src/compiler/latexCompiler.ts` `hashString` / `hashBytes`; `src/compiler/busytexWorkerRunner.ts` `hashString` / `hashBytes`; `src/app/App.tsx` `bytesEqual` / `areBytesEqual` / `getCompileArtifactSignature` / `hashText`; `src/preview/PreviewPane.tsx` `createPdfPreviewCacheKey`; `src/utils/hash.ts`
- Why it matters: duplicated hashing makes cache-key behavior inconsistent and harder to audit.
- Suggested test: utility tests for text hash, byte hash, sampled/full hash behavior, and byte equality.
- Minimal fix strategy: add shared `utils/contentHash.ts` and `utils/bytes.ts`, then migrate callers.

- Status: Verified (2026-07-11)
- Semantics inventory:

| Previous helper/caller | Required semantics | Shared implementation / disposition |
| --- | --- | --- |
| `latexCompiler.ts` and `busytexWorkerRunner.ts` file signatures | Full text for strings (JavaScript UTF-16 code units) and full byte traversal for `Uint8Array`; retain kind and length prefixes | `createFullContentSignature` in `src/utils/contentHash.ts` |
| `compilePreviewCache.ts` `hashText` (previously in App) | Full text using legacy UTF-16 FNV-1a plus the JavaScript string length | `hashTextContent`; caller retains the existing `length:hex` field |
| `PreviewPane.tsx` PDF cache key | Sampled bytes: at most 128 evenly spaced bytes, including endpoints, formatted base-36 | `hashSampledByteContent` via `src/preview/pdfPreviewCacheKey.ts`; explicitly not equality or security semantics |
| App pasted-image and generated PDF/SyncTeX comparisons | Full byte equality | `areBytesEqual` in `src/utils/bytes.ts` |
| `compileResultReuse.ts` optional artifact/source-map comparison | Full byte equality while distinguishing absent data from an empty array | `areOptionalBytesEqual` in `src/utils/bytes.ts` |
| `opfsWorkspace.ts` incremental-write comparison | Full byte equality | `areBytesEqual` in `src/utils/bytes.ts` |
| Git SHA-1 and byte-to-hex helpers in `utils/hash.ts`, `repoBackend.ts`, and `remoteService.ts` | Full bytes with cryptographic SHA-1 object-ID semantics; full byte-to-hex encoding | `sha1Hex` in `contentHash.ts` and `bytesToHex` in `bytes.ts`; `utils/hash.ts` is a compatibility re-export only |
| `AuthGate.tsx` SHA-256 / `timingSafeEqual` | Full UTF-8 credential digest and timing-safe hexadecimal comparison | Remains security-specific and local; it must not use sampled/content-cache helpers |

  Domain equality helpers for paths, diagnostics, and editor ranges compare structured application state rather than byte content and remain local.
- Remediation: Added focused `contentHash` and `bytes` modules, moved the compiler and BusyTeX file signatures to one typed full-content helper, moved Typst and PDF preview cache hashing to explicit full-text and sampled-byte helpers, and migrated App, compile-result reuse, OPFS, and Git callers. No retired Graph code or runtime dependency was restored.
- Cache-key compatibility: The legacy unpadded FNV-1a formats are locked by regression fixtures: `text:3:1a47e90b`, `bytes:3:1a47e90b`, Typst's `3:1a47e90b` field, and PDF preview key `workspace:paper.pdf:256:xq2t6t`. The PDF algorithm still samples exactly 128 evenly spaced bytes for content longer than 128 bytes.
- Regression coverage: `src/utils/contentHash.test.ts` covers full UTF-16 text hashing, full byte hashing, typed compiler signatures, sampled versus full behavior, base-36 formatting, and full SHA-1. `src/utils/bytes.test.ts` covers complete views, offsets, length/content differences, optional values, and byte-to-hex. `src/preview/PreviewPane.test.ts` and `src/app/compilePreviewCache.test.ts` lock the PDF and Typst caller formats.
- Confirmed reproduction: before implementation, `npx vitest run src/utils/contentHash.test.ts src/utils/bytes.test.ts` failed both suites because `./contentHash` and `./bytes` did not exist.
- Verification evidence:
  - `npx vitest run src/utils src/preview/PreviewPane.test.ts src/app/compilePreviewCache.test.ts src/app/compileResultReuse.test.ts src/workspace/opfsWorkspace.test.ts` — 8 files passed, 26 tests passed.
  - `npx vitest run src/compiler src/preview src/app/previewContent.test.ts src/app/compilePreviewCache.test.ts src/app/compileResultReuse.test.ts src/utils` — 15 files passed, 52 tests passed.
  - `npx vitest run src/git/repoBackend.test.ts src/git/remoteService.test.ts` — 2 files passed, 27 tests passed.
  - `npm run typecheck` — both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit` completed without diagnostics.


### 22. Compile And Preview Cache Restoration Logic Is Duplicated

- Severity: Medium
- Files/functions: `src/app/App.tsx` `loadSavedLatexPdfCompileResult`; `loadTypstPreviewCacheResult`; live compile effects; `runCompile`; `handleCompile`
- Why it matters: saved LaTeX PDF reuse and Typst preview cache restoration are checked in multiple effects/handlers. Divergence can cause inconsistent preview state or unnecessary compile scheduling.
- Suggested test: compile state tests for Typst cache hit, LaTeX saved PDF hit, stale PDF miss, and manual compile behavior.
- Minimal fix strategy: move this logic into a small compile/preview state machine that returns one state transition per event.

- Status: Verified (2026-07-11)
- Remediation: `decideCompilePreviewTransition` now maps each restoration or scheduling event to one explicit `restore`, `schedule`, `reset`, `preserve`, or `settle` transition. App uses the helper for Typst cache restoration/stale misses, saved LaTeX PDF restoration and manual quick-compile reuse, source switches, and queued compile completion. A shared `applyRestoredCompilePreview` path updates the active result, last successful result, compiler status, per-source preview state, and Typst signature; the duplicate Typst restoration effect was removed.
- Regression coverage: `src/app/compilePreviewState.test.ts` covers a matching Typst cache hit, stale Typst cache miss, fresh saved LaTeX PDF hit, stale saved PDF miss, quick versus full manual compile, source-switch reset, and queued compile completion. Existing completion and compile-activity coverage remains in the same suite.
- Confirmed reproduction: before the helper existed, `npm test -- --run src/app/compilePreviewState.test.ts` failed all 7 new transition tests with `decideCompilePreviewTransition is not a function` while the 10 existing tests passed.
- Verification evidence:
  - `npm test -- --run src/app/compilePreviewState.test.ts` — 1 file passed, 17 tests passed.
  - `npm test -- --run src/app` — 8 files passed, 42 tests passed.
  - `npm run typecheck` — both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit` completed without diagnostics.

### 23. Compile Result Reuse Is Sensitive To Timing Metadata

- Severity: Low
- Files/functions: `src/app/App.tsx` `shouldReuseCompileResult`; `reuseCompileOutputIfUnchanged`; `didCompileOutputChange`; `areCompileMetadataEqual`
- Why it matters: output may be identical while timing metadata naturally changes, causing unnecessary result object churn and preview updates.
- Suggested test: identical output with different timing durations should preserve render output identity while still recording build log timing.
- Minimal fix strategy: compare render output separately from diagnostics/build metadata; keep timing data in build log state rather than as part of preview identity.

- Status: Verified (2026-07-11)
- Remediation: `resolveCompileResultCompletion` now resolves preview identity, diagnostic state, output-change reporting, and build-log data independently. Byte-identical SVG/PDF output reuses the existing preview result and output object even when compile timing or other build metadata changes. Changed diagnostics produce a current diagnostic result while retaining the unchanged output object, and each build-log append receives diagnostics and metadata from the just-completed compile rather than the reused preview result. Rendered SVG changes and changed PDF artifact bytes still replace preview identity and report `outputChanged: true`; changed source-map bytes can refresh the result without being mislabeled as a render-output change.
- Regression coverage: `src/app/compileResultReuse.test.ts` covers timing-only SVG reuse with current build-log metadata, independent diagnostic updates, changed SVG output, byte-identical PDF reuse, and changed PDF detection.
- Confirmed reproduction: before the completion resolver existed, `npm test -- --run src/app/compileResultReuse.test.ts` failed because `./compileResultReuse` was absent, demonstrating that no tested separation between preview identity and current build-log metadata existed.
- Verification evidence:
  - `npm test -- --run src/app/compileResultReuse.test.ts` — 1 file passed, 4 tests passed.
  - `npm test -- --run src/app/compileResultReuse.test.ts src/app/compilePreviewState.test.ts src/app/compilePreviewCache.test.ts src/compiler/typstCompiler.test.ts` — 4 files passed, 25 tests passed.
  - `npm test -- --run src/app` — 14 files passed, 60 tests passed.
  - `npm run typecheck` — both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit` completed without diagnostics.

### 24. OPFS Mirror Rewrites Current Files And Does Not Prune Stale Files

- Severity: Medium
- Files/functions: `src/app/App.tsx` workspace sync effect; `src/workspace/opfsWorkspace.ts` `syncProjectToOpfs`; `src/workspace/opfsWorkspace.ts` `writeWorkspaceFile`
- Why it matters: sync writes current entries sequentially and does not remove OPFS files deleted or renamed in Typr. It can waste work and leave stale files in the local filesystem mirror.
- Suggested test: fake OPFS tree with stale files and unchanged files; assert sync skips identical writes and removes paths absent from the project.
- Minimal fix strategy: track dirty paths or content signatures, skip identical writes, and prune entries absent from the current project. If consistency matters, replace the worktree root atomically.

- Status: Verified (2026-07-10)
- Remediation: OPFS synchronization now compares current and desired bytes before opening a writable, writes and closes every changed file before pruning, and removes only entries absent from the selected project's `worktree`. Desired nested and empty directories are retained, while stale files and whole stale directory subtrees are removed. The consistency strategy is explicitly write-before-prune: a failed file write is aborted and propagated, no pruning occurs after that failure, and a retry can safely converge even though files committed earlier in the write phase may already contain current content. Sibling projects and unrelated OPFS roots are outside the prune boundary.
- Regression coverage: `src/workspace/opfsWorkspace.test.ts` uses a fake OPFS tree to cover byte-identical text and binary files, changed content, stale deleted files, renamed paths, nested stale directories, retained empty directories, sibling projects, unrelated OPFS roots, and failed partial writes. The failure case proves the staged write is aborted without exposing partial bytes and stale entries remain until a complete synchronization succeeds.
- Verification evidence:
  - Pre-implementation: `npx vitest run src/workspace/opfsWorkspace.test.ts` — 1 file failed with 2 intended regression failures and 3 existing tests passed; unchanged content was rewritten and the failed write was not aborted.
  - `npx vitest run src/workspace/opfsWorkspace.test.ts` — 1 file passed, 5 tests passed.
  - `npx vitest run src/workspace` — 2 files passed, 7 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

### 25. Icons Are Duplicated Between `src/icons` And `public/icons`

- Severity: Low
- Files/functions: `src/icons/**`; `public/icons/**`; `src/styles/global.css` icon mask URLs; `vite.config.ts` PWA public icons
- Why it matters: most duplicate icon paths are byte-identical, with at least one divergent `files/folder.svg`. Maintaining two sources invites drift.
- Suggested test: small script that compares duplicated icon paths or generates public icons from one source.
- Minimal fix strategy: keep one canonical icon directory and copy/generate the public subset during build if static public paths are required.

- Status: Verified (2026-07-11)
- Remediation: `src/icons` is now the canonical source for UI masks imported by `src/styles/global.css`. All duplicate `public/icons` UI copies and unreferenced public SVGs were removed, including retired diagram/Graph assets. The one divergent pair, `files/folder.svg`, was resolved in favor of the source version actually consumed by the UI (the current 24px two-tone folder); the obsolete unreferenced 32px gray public copy was deleted. Only `public/icons/icon-192.png` and `public/icons/icon-512.png` remain because the manifest and document require stable URLs.
- Drift/build coverage: `scripts/verify-icon-assets.mjs` deterministically walks both trees, rejects any duplicated or unexpected public path, requires both stable PNGs, and verifies their PNG signatures and exact dimensions. `predev` and `prebuild` run `npm run icons:check`, so local serving and production builds fail on icon drift.
- Verification evidence:
  - Pre-cleanup: `node scripts/verify-icon-assets.mjs` — failed as intended on the duplicate source/public paths and unexpected public-only legacy assets.
  - `npm run icons:check` — passed with 52 canonical source assets and 2 stable public assets.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.
  - `npm run build` — passed; the prebuild icon check passed, Vite transformed 526 modules, and PWA generation precached 212 entries.
  - Production Chromium icon/UI smoke — passed: 10 rendered activity icons resolved to 10 unique hashed SVG mask assets with HTTP 200 responses; stable PWA icons loaded at 192×192 and 512×512; no page errors occurred.


### 26. Typst Renderer Initialization Is Duplicated Across Preview Modules

- Severity: Low
- Files/functions: `src/preview/typstCanvasRenderer.ts` `getRenderer`; `src/preview/sourceMappingOverlay.ts` `getRenderer`
- Why it matters: both modules initialize the same Typst renderer/WASM path independently, making renderer caching and lifecycle harder to reason about.
- Suggested test: preview/source-map smoke tests after extraction.
- Minimal fix strategy: share a renderer loader/session utility between canvas preview and source mapping overlay.

- Status: Verified (2026-07-11)
- Remediation: `src/preview/typstRendererSession.ts` now owns the renderer module/WASM initialization used by both canvas preview and source mapping. Concurrent consumers share one module-lifetime initialization promise; a rejected module import or `init` attempt is evicted so the next call creates and initializes a fresh renderer. Source-map artifacts use the renderer's `runWithSession` ownership boundary: the session remains live until the overlay is disposed, repeated disposal is idempotent, and render failures dispose before propagating.
- Regression coverage: `src/preview/typstRendererConsumers.test.ts` uses focused renderer/WASM mocks to prove concurrent canvas and source-map consumers create and initialize one renderer, both observe the same initialization failure, both recover through one fresh retry, repeated overlay disposal releases one session exactly once, and a failed source-map render also releases its session.
- Verification evidence:
  - Pre-implementation: `npm test -- --run src/preview/typstRendererConsumers.test.ts` — 1 file failed, 3 tests failed; the consumers created two renderers, did not share an initialization failure, and disposed the mocked source-map session twice.
  - `npm test -- --run src/preview/typstRendererConsumers.test.ts` — 1 file passed, 4 tests passed.
  - `npm test -- --run src/preview/typstRendererConsumers.test.ts src/preview/PreviewPane.test.ts src/app/previewContent.test.ts` — 3 files passed, 9 tests passed.
  - `npm run typecheck` — passed both `tsc --noEmit` and `tsc -p tsconfig.node.json --noEmit`.

## UI Consistency Audit

Scope: visual consistency review of repeated controls and panels. I used a static source/CSS pass plus a current Chromium layout capture at `1440x1000` against the local Vite app. No product fixes were implemented.

Verification command used:

```sh
BASE_URL=http://127.0.0.1:5175/ npx playwright test --config=/tmp/typr-pw/current-ui-layout.config.js --project=chromium
```

Result: layout collection completed. The local dev server still reported unrelated Harper optimize-dependency 504s, so these findings focus on rendered dimensions and source/CSS consistency rather than console cleanliness.

### 27. Preview Header Zoom Buttons Do Not Match Adjacent Header Controls

- Severity: Low
- Files/functions: `src/preview/PreviewPane.tsx` `PreviewZoomControls`; `src/app/App.tsx` preview header around `PreviewZoomControls` / `preview-download-button`; `src/styles/global.css` `.pane__header .pane__icon-button`; `.preview-zoom-button`
- Evidence: current Chromium layout measured preview `-` / `+` buttons at `34x38`, while the adjacent download icon button is `38x38` and the other pane-header icon buttons also render `38x38`.
- Why it matters: the preview toolbar mixes two button systems in the same row, so the zoom buttons look slightly undersized next to equivalent icon-like actions.
- Minimal fix strategy: make zoom buttons use the shared pane header icon-button sizing, or define one toolbar control size token and apply it to zoom, download, and file-action buttons. Also consider explicit `aria-label`s instead of relying on `title` for the `-` / `+` buttons.

- Status: Verified (2026-07-11)
- Remediation: Added one explicit `--pane-header-icon-button-size: 2.4rem` contract and made the shared `.pane__icon-button` class enforce that fixed width, height, minimum dimensions, and flex basis. `PreviewZoomControls` now uses the shared pane icon-button class, keeps its responsive controls visible, and gives Zoom out / Zoom in explicit accessible labels. The adjacent preview download action uses the same token.
- Regression coverage: `tests/e2e/icon-button-layout.spec.ts` measures the visible zoom buttons and preview download against the shared token in Chromium at 1440x1000 and 390x844, and asserts the explicit zoom labels.
- Verification evidence:
  - Pre-implementation: focused Chromium layout checks failed at both viewports; zoom buttons measured `34.390625px` wide versus the `38.390625px` adjacent download/header control.
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174/ npx playwright test --config=playwright.config.ts tests/e2e/icon-button-layout.spec.ts --project=chromium` — 4 tests passed across desktop and mobile preview/Git cases.
  - `npx vitest run src/preview/PreviewPane.test.ts` — 1 file passed, 1 test passed.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm run build` — passed TypeScript checks and the Vite/PWA production build; 525 modules transformed and 212 precache entries generated. Existing browser-externalized `fs` and large-chunk warnings remained non-fatal.

### 28. Git Panel Icon Buttons Are Smaller Than Other Icon-Only Pane Buttons

- Severity: Low
- Files/functions: `src/app/App.tsx` Git panel `Add repo` / `Remove repo` buttons; `src/styles/global.css` `.sidebar-section--sync .pane__button`; `.sidebar-section--sync .pane__icon-button`
- Evidence: current Chromium layout measured Files header icon buttons and preview download at `38x38`, but Git panel `Add repo` / `Remove repo` icon buttons render `31x31` even though they use the same `pane__button pane__button--compact pane__icon-button` classes.
- Why it matters: identical button classes produce different sizes depending on panel context, making the shared component vocabulary less predictable.
- Minimal fix strategy: avoid shrinking `.pane__icon-button` under `.sidebar-section--sync`, or introduce an explicit `sidebar-icon-button` variant so the size difference is intentional and not hidden behind the shared class name.

- Status: Verified (2026-07-11)
- Remediation: Git Add repo / Remove repo actions now inherit the same explicit `2.4rem` `.pane__icon-button` contract as Files header and preview icon actions. Sync-panel compact-button styling uses `:not(.pane__icon-button)`, and the former `.sidebar-section--sync .pane__icon-button` size override was removed, so panel context cannot silently resize the shared icon class.
- Regression coverage: `tests/e2e/icon-button-layout.spec.ts` opens Files and Git at 1440x1000 and 390x844, uses New file as the shared-size reference, and requires Add repo / Remove repo to match it and the root sizing token.
- Verification evidence:
  - Pre-implementation: focused Chromium layout checks failed at both viewports; Git icon actions measured `31.1875px` square versus the `38.390625px` Files header reference.
  - Selector audit: no `.sidebar-section--sync .pane__icon-button` rule remains; both sync-panel compact and active selectors explicitly exclude `.pane__icon-button`.
  - Focused Chromium layout regression — 4 tests passed across desktop and mobile preview/Git cases.
  - Existing `tests/e2e/git-panel.spec.ts` Chromium behavior regression — 1 test passed.
  - `npm run typecheck` and `npm run build` — passed.

### 30. Settings And Docs Modal Controls Use Different Sizing For Similar Patterns

- Severity: Low
- Files/functions: `src/app/App.tsx` `renderSettingsSheet`; `src/app/DocsModal.tsx` `DocsPanel`; `src/styles/global.css` `.settings-sheet__header`; `.settings-search-field`; `.docs-modal__header`; `.docs-modal__search`
- Evidence: current Chromium layout measured Settings modal `Close` at `55x30`, while Docs modal `Close` renders `68x39`. Settings search is styled as a `32px` high header field, while Docs search is a separate sticky nav field with different border radius, padding, and clear-button shape.
- Why it matters: Settings and Docs are the two large app-level modal surfaces, but their close/search affordances do not share the same visual rhythm.
- Minimal fix strategy: extract shared modal header/search/close-button classes, then let Settings and Docs vary only layout-specific pieces like tab strip vs docs navigation.

- Status: Verified (2026-07-11)
- Remediation: Settings and Docs now share `modal-control-header`, `modal-search-field`, `modal-search-field__clear`, and `modal-close-button` contracts. Search inputs and Close actions use the same `2.25rem` control height, padding, radius, focus treatment, and clear-button shape, while Settings tabs and the sticky Docs navigation remain layout-specific.
- Regression coverage: `tests/e2e/modal-controls-docs-icon.spec.ts` compares rendered search, clear, and Close geometry; checks shared class use; and confirms the independent Settings tablist plus Docs desktop/mobile navigation remain usable.
- Verification evidence:
  - Pre-implementation focused Chromium regression — failed as expected because neither modal used the shared control classes; the original audit measured Settings Close at `55x30`, Docs Close at `68x39`, and Settings search at `32px` high.
  - Focused visual-layout/accessibility smoke in Chromium and Firefox — 6 tests passed across shared modal controls plus desktop/mobile Docs cases.
  - Existing Settings desktop/mobile behavior regression in Chromium and Firefox — 2 tests passed.
  - `npm run typecheck` — passed both TypeScript configurations.
  - `npm run build` — passed icon validation, TypeScript checks, and the Vite/PWA production build; 525 modules transformed. Existing browser-externalized `fs` and large-chunk warnings remained non-fatal.

### 31. Docs Activity-Bar Icon Uses A Text Glyph While Neighboring Icons Use SVG Masks

- Severity: Low
- Files/functions: `src/app/App.tsx` desktop/mobile activity-bar Docs buttons; `src/styles/global.css` `.activity-icon`; `.activity-icon--help`
- Evidence: all main activity icons use `mask-image` SVG assets, while Docs uses inline `?` text via `.activity-icon--help`. Current layout text extraction reports the button as `? Docs`, whereas neighboring buttons are icon masks plus visually hidden labels.
- Why it matters: the help icon can render with different font weight, optical size, and baseline behavior than the rest of the activity bar, especially across platforms.
- Minimal fix strategy: add a real help/docs sidebar SVG and render it through the same `.activity-icon` mask path as the rest of the activity bar.

- Status: Verified (2026-07-11)
- Remediation: Added canonical `src/icons/sidebar/docs.svg`, replaced `.activity-icon--help` with the SVG-backed `.activity-icon--docs` mask, and removed the inline question-mark content from both desktop and mobile activity buttons. Each button retains an explicit Docs accessible name, a visually hidden label, and an `aria-hidden` decorative icon.
- Regression coverage: `tests/e2e/modal-controls-docs-icon.spec.ts` requires an empty decorative icon span, the Docs mask URL, and the accessible Docs button name at 1440x1000 and 390x844 in both browser engines; the mobile case also opens the Docs table of contents.
- Verification evidence:
  - Pre-implementation focused Chromium regression — both desktop and mobile cases failed as expected because the icon span contained `?` and used `.activity-icon--help`.
  - Selector/markup audit — no active `.activity-icon--help` rule or inline Docs question-mark remains; both live call sites use `.activity-icon--docs`.
  - Focused visual/accessibility smoke in Chromium and Firefox — 6 tests passed across the shared modal contract and desktop/mobile Docs icon cases.
  - `npm run build` icon validation reported 53 canonical source assets and emitted the Docs SVG into the production bundle.

## Notes

- The workspace already had unrelated local modifications before this audit; those were left intact.
- Browser compatibility references checked: MDN `DecompressionStream` and `StorageManager.getDirectory`.

## QA Program Closure (2026-07-12)

Closure conclusion: all 28 active findings are Verified against their focused regressions and the current broader gates. No active finding is Not started, Blocked, or Retained. Finding numbers 11, 17, and 29 remain absent by design.

### Direct closure verification

| Gate | Closure result |
| --- | --- |
| `npm test` | Passed: 57 files, 233 tests. Vite excludes Playwright-owned `tests/e2e/**` from Vitest collection. |
| `npm run typecheck` | Passed both TypeScript configurations without diagnostics, including a final rerun after the mobile PWA test correction. |
| `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | Passed without diagnostics; finding 16 has no retained unused-code exceptions. |
| `npm run icons:check` | Passed: 53 canonical source assets and 2 stable public PWA assets. |
| `npm run build` | Passed: 525 modules transformed and 213 PWA precache entries generated. |
| Production UI Playwright | Passed: 22 tests against the built app in Chromium and Firefox, covering Diagram lifecycle, Git, Settings, Build Log, modal controls, Docs icon accessibility, and desktop/mobile layout cases. |
| Production PWA Playwright | Passed: 2 tests in Chromium desktop and Chromium mobile; both performed a real first Typst compile offline after compiler-aware service-worker readiness. |
| Dependency audit | `npm ls @wterm/just-bash @wterm/react @wterm/core @wterm/dom gnuplot-wasm plotly.js-dist-min just-bash --all` reports only the intentionally retained `just-bash@2.14.5`. |
| Residual deletion audit | Exact searches across source, tests, scripts, docs, manifests, Vite config, and `dist` found no deleted Graph modules/runtime names, WTerm packages, Graph plotting packages, retired Graph icons, or stale Diagram-and-Graph documentation paths. |

The first Chromium-mobile PWA run exposed a test-flow defect: it asserted a transient pre-hydration empty workspace and remained in the Files pane while querying the Source-only Compile control. The test now waits on the real offline-ready barrier, imports collision-free `offline-first.typ`, and switches to Source on mobile. The formerly failing mobile project and the final two-project PWA matrix pass.

### Graph retirement evidence

- Tracker headings contain 1-10, 12-16, 18-28, and 30-31 only; findings 11, 17, and 29 were not recreated.
- `src/graph`, `src/types/graph-runtimes.d.ts`, both Graph sidebar icons, and the retired Graph documentation page remain deleted. Production and generated-bundle searches find no Graph editor/runtime/module identifiers.
- `gnuplot-wasm` and `plotly.js-dist-min` are absent from the manifest, lockfile, dependency tree, source, and production bundle.
- The only documentation uses of “graphs” are correct browser-Git commit-graph terminology, not the retired visual Graph feature.
- The only production Graph-shaped data handling is the compatibility-only legacy snapshot migration in `appState.ts` and `projectState.ts`; it converts old Graph entries to ordinary documents and removes legacy Graph preference/state fields. Focused migration tests pass, and no Graph UI or runtime consumes that data.

### Retained decisions

No active finding has Retained status.

- `just-bash@2.14.5` is retained because the active browser shell imports it directly; no WTerm wrapper or subtree remains.
- Legacy Graph snapshot readers are retained solely to prevent data loss when opening old saved projects; normalized current state contains ordinary documents rather than a Graph feature model.
- “Commit graph” wording is retained in Git architecture/transport documentation because it describes Git object traversal.
- Pre-existing untracked `.orig` backup files and QA artifacts are not part of the TypeScript/Vite inputs or production bundle and were preserved under the unattended no-discard rule; residual product searches intentionally target build inputs and `dist`.

### Final risk and test gaps

- No open QA finding or failing required runnable gate remains.
- WebKit lifecycle/PWA execution is a host gap: Playwright WebKit 18.2 was downloaded, but launch is blocked by missing system libraries (`libwoff`, GStreamer, Flite, and AVIF dependencies). No WebKit result is claimed as verification.
- Lifecycle persistence has deterministic unit coverage for `pagehide`, hidden `visibilitychange`, debounce cancellation, and disposal, plus Chromium-mobile production PWA coverage; a real iOS/iPadOS Safari background/suspension run remains outside this Linux environment.
- The production build still emits non-fatal Harper browser-`fs` externalization and large-chunk warnings. They are performance/packaging risks, not failures of the remediated behaviors.
