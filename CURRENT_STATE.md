# Typr repository split and self-hosting current state

Last updated: 2026-08-10 (Canada/Central)

This is the durable execution record for splitting Typr Companion into its own
repository and shipping the Typr frontend as a self-hosted container. Update it
after every completed stage and before every stage commit.

## Objective

- Keep the browser application in `max-prime-math/typr`.
- Move Typr Companion to the public `max-prime-math/typr-server` repository
  while retaining the history of its source, protocol, tests, Docker build,
  release workflow, documentation, and Unraid template.
- Keep the existing image identity `ghcr.io/max-prime-math/typr-server` and
  release Companion `v0.1.2` only after its extracted repository is validated.
- Make Typr consume a reproducibly pinned copy of the Companion protocol owned
  by the Companion repository.
- Publish Typr self-hosted images in `full` and `lite` variants. Full contains
  the compiler assets. Lite may load immutable compiler assets from R2 or from
  a mapped local compiler-assets directory served by the same Typr container.
- Keep IndexedDB/browser-local projects as the default. A mapped Companion
  workspace is optional and is reachable only through a confined file API.
- Compile Google Drive support out of self-hosted images.
- Treat both self-hosted services as unauthenticated trusted-LAN/VPN services.
  They must not be exposed to the public Internet. Document secure-context,
  mixed-content, loopback, and remote HTTP limitations explicitly.
- Publish Typr and Typr Companion independently to GHCR, with optional Docker
  Hub mirrors, and maintain separate Unraid templates.

## Baseline

- Working repository: `/home/max/dev/typr`
- Working branch: `dev` at `d63cb1b` (`origin/dev` matches)
- Worktree at stage start: clean
- GitHub repository: `max-prime-math/typr`, public, default branch `main`
- Remote branches at stage start:
  - `main` at `4f7f2df`
  - `beta` at `e3a909e`
  - `dev` at `d63cb1b`
- Existing annotated release tags:
  - `v0.1.0` tag object `9a2fb7e`, commit `52c5647`
  - `v0.1.1` tag object `4299932`, commit `37ad4b2`
- Standalone checkout: `/home/max/dev/typr-server`, clean `main` at `44d0b7d`.
- GitHub repository: `max-prime-math/typr-server`, public, default `main`.
- Existing Companion image name: `ghcr.io/max-prime-math/typr-server`.
- Docker CLI is installed. Access to the host Docker daemon requires an
  approved unsandboxed command in this environment.
- `gh` is authenticated outside the sandbox as `max-prime-math` with `repo`
  access. No package scopes are shown by `gh auth status`.

The frontend branches are intentionally not linear: `dev`, `beta`, and `main`
contain cherry-picked/promotion commits with different object IDs. The split is
performed from `dev`, where all existing Companion release work lives. It must
not rewrite or force-push any Typr branch.

## Audit findings

### History and ownership

- Companion was introduced by `52c5647` together with the frontend client and
  protocol. `67c6327` added its release/CORS work. `37ad4b2` completed the first
  Docker/Unraid distribution. The only post-`v0.1.1` server change is the
  TeXpresso DPI/render adjustment in `bca5c31`.
- The extracted repository owns `typr-server/**`, the Companion Dockerfile and
  patch/runtime manifests, four Docker harness scripts, `tsconfig.server.json`,
  Companion Compose files, Companion workflow/docs/examples, and the Companion
  Unraid template. The root frontend package/lock remain Typr-owned and will be
  replaced by a purpose-built standalone server package/lock.
- Frontend Companion clients, preview UI, settings, E2E coverage, and user guide
  remain in Typr. The current `src/companion-protocol/**` is the co-owned split
  blocker and becomes Companion-owned before Typr deletes its copy.
- The old Companion workflow must be removed from Typr before a future Typr
  semver tag is pushed, or it could republish the old server tree to the existing
  package.
- A filtered clone will keep the original path names in historical commits so
  historical Docker/import references remain coherent. Any standalone path
  normalization occurs in a new commit. Old-to-filtered commit IDs will be
  recorded. Historical Typr tag refs will not be pushed to the new repository:
  doing so could run their embedded workflow and mutate existing GHCR aliases.

### Frontend and assets

- IndexedDB database `typr` is already the authoritative startup/autosave store;
  OPFS is a browser-private mirror and local-folder sync is explicit. Server
  workspace support will therefore be an opt-in sync/import binding, not a boot
  storage replacement.
- Empty Google credentials currently mean “unconfigured,” not disabled. Drive
  hooks, disabled UI, callback HTML, redirect handling, and service-worker rules
  still ship. Self-hosted builds need a typed compile-time flag covering all of
  those entry points plus a built-output/no-network regression check.
- External compiler support is currently build-time. It rewrites BusyTeX and the
  Typst compiler WASM to an asset base, while the immutable R2 publisher already
  uses checksum/version keys. A single lite image therefore needs a stable
  same-origin `/compiler-assets/` route whose container runtime selects a
  validated read-only mount or the exact pinned R2 release.
- “Full” means the locked compiler assets are bundled. Self-hosted builds also
  disable BusyTeX's public TeX Live fallback, so their available packages are
  bounded by the bundled Basic, Recommended, and Extra asset packs.
- There is no Typr web image today. The current `.dockerignore`, Compose files,
  and Docker workflow are Companion-only and must be replaced or moved during
  the split.
- Plain LAN HTTP is not a secure context (except browser loopback special cases),
  so PWA install/offline behavior and some filesystem APIs degrade. Hosted HTTPS
  also cannot call an HTTP Companion because of mixed-content rules. These are
  product/documentation requirements, not only deployment footnotes.

### Security, release, and Unraid

- Existing path normalization and request/file limits are a useful baseline,
  but an HTTP-confined workspace is not sufficient: native TeX could otherwise
  read another mounted project or host file. Release requires canary tests for
  shell escape, `/etc`, `/proc`, parent/absolute reads, and writes outside the
  ephemeral compile directory, plus compile/session resource limits.
- CORS is not authentication. Browser workspace mutations will require an exact
  allowed origin, JSON, and a non-simple custom request header, but documentation
  must still say that originless command-line clients and trusted peers can call
  the unauthenticated service.
- Workspace operations require exact relative POSIX paths; symlinks and special
  files are rejected at every component; `.git` and internal paths are reserved;
  recursion/fanout/depth/length/size are bounded; writes are atomic and use an
  ETag/content revision to prevent silent overwrite.
- A writable workspace uses one exact `rw` project directory. Compiler assets
  use one exact `ro` directory. Neither template will suggest `/`, `/mnt`, all of
  `/mnt/user`, the Docker socket, or a broad appdata mapping.
- The optional client-side `AuthGate` is a convenience gate, not an access-
  control boundary: hashes and session state are delivered to/controlled by the
  browser. It must never be cited as protection for Internet exposure.
- Container release requires non-root execution, dropped capabilities,
  `no-new-privileges`, a read-only root where practical, bounded tmpfs, health
  checks, no Docker socket, `nosniff`, frame protection, and a conservative
  referrer policy.
- Lite local assets require a validated manifest, file sizes, and SHA-256 hashes
  before serving. Partial/corrupt mounts fail clearly and may not silently mix
  local and R2 objects. Directory listings stay off and WASM/JS MIME types are
  tested.
- Publishing credentials increase workflow risk. Registry workflows will pin
  third-party Actions to reviewed commit SHAs. Exact GHCR version manifests are
  published and pull-tested before mutable `0.1`, `0`, and `latest` aliases are
  promoted; the optional Docker Hub mirror is a separate job based on the
  verified artifact/digest.
- Existing Companion docs are strong on LAN/VPN and mixed-content constraints,
  but the new Typr guide must add origin-storage silo behavior: changing scheme,
  host, IP, or port creates a different IndexedDB/OPFS/service-worker origin and
  does not migrate browser-local projects.

## Non-negotiable safeguards

1. Never move, recreate, delete, or force-push `v0.1.0` or `v0.1.1` in Typr.
2. Do not transfer the old Typr tags to the new repository. The new repository
   receives a fresh annotated `v0.1.2` only after all release checks pass.
3. Do not publish a container from a partially tested tree. Tag workflows must
   depend on architecture-specific image tests and then verify the published
   manifest/image.
4. Preserve `ghcr.io/max-prime-math/typr-server`. Changing its source repository
   label must not accidentally create a differently named package.
5. Inspect package access before pushing `v0.1.2`. A workflow in the new
   repository may need explicit write access to the existing personal GHCR
   package. If GitHub cannot grant that through available APIs, request exactly
   that package-setting change from the user.
6. Browser-local IndexedDB storage stays enabled and selected by default in all
   hosted variants. A mapped workspace is explicit opt-in configuration.
7. The mapped workspace API must reject traversal, absolute paths, NUL bytes,
   symlinks, oversized requests/files, unsupported methods, and access outside
   its single configured root. It must expose no shell, Git, package manager,
   arbitrary URL fetch, or unrestricted host filesystem operation.
   Native TeX must compile from an isolated temporary copy, never directly from
   the persistent mount, with shell escape disabled, paranoid TeX file access,
   deadlines, concurrency limits, and bounded output/log/temp usage.
8. Self-hosted builds must not contain an active Google OAuth client, Picker
   key, Drive UI, Drive callback flow, or service-worker callback route.
9. Default container port publishing is loopback-only. Unraid documentation may
   use a LAN address only with explicit trusted-LAN/VPN-only warnings. Neither
   unauthenticated service is suitable for public Internet exposure.
10. Docker Hub publication remains disabled unless both the namespace/repository
    and token are deliberately configured.
11. Community Applications submission remains blocked until both templates are
    tested on an actual Unraid host, stable public image tags exist, support
    destinations exist, and the user gives final submission approval.

## Reconstructed implementation decisions

These decisions combine the requested outcomes with the already shipped
Companion v0.1.1 architecture. Amend this section before implementation if a
repository audit reveals a conflict.

- History split: build a filtered clone from Typr `dev`, retaining only
  Companion-owned paths and their relevant commits. Rename paths into a clean
  standalone layout in the filtered clone. Do not run history rewriting in the
  original Typr checkout.
- Shared protocol: the Companion repository is authoritative. Typr consumes its
  transport-neutral exports from the immutable full-commit archive URL for
  `597ba9173df5e07be4a8df17c2353b0b847c1bb8`; `package-lock.json` also pins the
  archive SHA-512 integrity. `.npmrc` permits URL dependencies only when they are
  declared by the root project (`allow-remote=root`), leaving transitive remote
  URLs blocked under npm 12.
- Workspace: extend the advertised filesystem capability only when a root is
  explicitly configured and mounted. The API operates on project-relative
  paths beneath that root. Disabled is the default.
- Typr image: serve the static PWA and optional local compiler assets from one
  unprivileged web container. Runtime configuration is generated from a narrow
  allowlist, not arbitrary environment-to-JavaScript interpolation.
- Full/lite naming: the version tag denotes the full image; `-full` is an
  explicit alias and `-lite` is the smaller external-assets image. CI also emits
  immutable SHA tags for diagnosis. Exact floating aliases will be documented
  before the first Typr image release.
- R2/local assets: lite defaults to the existing immutable R2 compiler release.
  A mapped compiler-assets directory overrides that base with a same-origin URL
  after startup validation. It is read-only in the container.
- Feature flags: hosted channels retain their existing Google Drive behavior;
  self-hosted Docker builds use a compile-time self-hosted flag that removes the
  Drive entry points and callback from the built output.
- Releases: Companion and Typr have independent workflows, versions, tags,
  documentation, GHCR packages, optional Docker Hub credentials, and Unraid
  templates.

## Stages and gates

### Stage 0 — Baseline and durable state

Status: complete (`12636ae`, pushed to `origin/dev`)

- [x] Confirm the clean local branch and remote branch/tag objects.
- [x] Confirm GitHub authentication and repository visibility.
- [x] Confirm the new local/GitHub repository is absent.
- [x] Complete independent frontend, split/history, and security/Unraid audits;
  material findings are recorded above.
- [x] Commit and push the state record to `dev` after audit findings were folded
  in.

Gate: no architectural mutation before all three audits are recorded.

### Stage 1 — Standalone Companion repository and protocol boundary

Status: complete (`597ba91`, pushed to standalone `origin/main`)

- [x] Filter relevant history into `/home/max/dev/typr-server`.
- [x] Normalize the standalone metadata, documentation, CI, and source URLs
  without relocating paths inside historical commits.
- [x] Export the authoritative `@max-prime-math/typr-companion-protocol`
  package boundary.
- [x] Run clean install, typecheck, unit, XML, package, history, Docker build,
  native compile, TeXpresso POC/render, and WebSocket checks.
- [x] Create the public GitHub repository and push its initial `main` branch
  without tags.
- [x] Record immutable protocol commit
  `597ba9173df5e07be4a8df17c2353b0b847c1bb8` for Typr.
- [x] Confirm initial GitHub amd64/arm64 CI run `31353414702` passes.

Gate: public repository exists, history is inspectable, no old tags were copied,
and source tests pass.

### Stage 2 — Frontend consumes pinned protocol

Status: complete

- [x] Pin the Companion-owned protocol by immutable commit archive and lock
  integrity.
- [x] Switch stable frontend and experimental TeXpresso imports to the package
  exports.
- [x] Remove Companion server/build/release/Compose/Unraid/docs ownership from
  Typr while retaining only frontend integration and Typr-specific guidance.
- [x] Run a clean locked install, typecheck, unit tests, production build, and
  stale ownership/import audit.

Gate: no stable protocol implementation is duplicated in Typr and a clean
install/build works from the pin.

### Stage 3 — Optional mapped Companion workspace

Status: complete

- [x] Implement disabled-by-default capability/configuration and confined file API.
- [x] Add traversal, symlink, size, encoding, conflict, CORS, and method tests.
- [x] Add an exact-root `rw` workspace mount, isolate compilers from it, and add an
  adversarial integration harness. Compiler-asset mounts remain exact-root `ro`.
- [x] Add frontend opt-in manual synchronization without changing the
  browser-local default, with strict conflict detection and atomic IndexedDB
  persistence of the browser project, legacy snapshot, and sync baseline.

Gate: unit and container adversarial tests demonstrate that only the configured
root is reachable.

### Stage 4 — Typr full/lite containers

Status: complete (`63c1997`; immutable asset run `31365938472`)

- [x] Add one digest-pinned, unprivileged static web image with full and lite
  targets, a non-root health check, read-only-root support, dropped
  capabilities, and no-new-privileges operation.
- [x] Commit a deterministic 20-file / 707,826,081-byte compiler lock. The
  release is `busytex-1.1.1-typr.2-typst-0.7.0-rc2-sha256-6dc1638d51b3ea3131117559`;
  the manifest SHA-256 is
  `e42ce8b6a26e45c59cf49881671d8626101bd30698cbf487984aaa7fde4d2744`.
- [x] Build full with the verified compiler pack and lite without a compiler
  payload. Lite selects either fixed same-origin R2 routes or an exact read-only
  `/compiler-assets` mount at startup; missing, extra, corrupt, special,
  symlinked, top-level RW, and nested RW mounts fail before health.
- [x] Compile the Google Drive graph, UI, CSS, callback, documentation, and
  OAuth/network markers out of self-hosted output while retaining hosted Drive
  behavior and its callback.
- [x] Keep browser IndexedDB authoritative and make even Companion status
  polling opt-in: a clean self-hosted profile performs no cross-origin request
  until a user explicitly applies a Companion URL.
- [x] Validate local and R2-offline container behavior: byte-identical full/lite
  app trees, correct real Vite-asset/compiler MIME and status-aware cache
  headers, Range support, PWA routing, health, bounded no-store R2 failures, and
  all adversarial mount cases. The final development images were approximately
  61 MB lite and 580 MB full by Docker's image-size accounting.
- [x] Validate full and lite/local in Chromium and Firefox: a real Typst compile
  uses the versioned same-origin compiler route; Drive is absent; no implicit
  cross-origin or workspace request occurs; browser edits survive reload; old
  compiler caches are removed without affecting IndexedDB; offline reload works.
- [x] Publish the exact lock to R2 with the manual immutable workflow. GitHub
  run `31365938472` rebuilt the pack, uploaded the manifest last, and publicly
  re-downloaded and verified all 20 objects. The exact-commit Docker matrix then
  passed full, lite/local, lite/R2-offline, and live lite/R2; Chromium and
  Firefox both completed a real Typst compile through the live same-origin R2
  proxy. No Typr image or release tag was published.

Gate: clean full and lite builds pass browser smoke tests, including lite in both
R2 and local-assets modes.

### Stage 5 — Compose, documentation, and Unraid

Status: complete (`54ccebe` Typr; `87f53e4` Companion; final state record in
the following Typr checkpoint)

- [x] Add a separate hardened Typr Compose definition and exact lite/local
  read-only compiler-asset override; keep projects and appdata out of the web
  container.
- [x] Add the separate Typr Unraid template and Community Applications profile
  with semantic validation. It defaults to the full image and makes lite modes
  advanced explicit choices.
- [x] Document ports, volumes, variants, updates, pinning, rollback, HTTP/HTTPS,
  trusted-LAN/VPN boundaries, and the public-exposure prohibition.
- [x] Integrate the reviewed Companion Compose workspace override, strengthened
  Companion Unraid template/profile, documentation, workflow checks, and smoke
  harness into the canonical `typr-server` checkout.
- [x] Run both repositories' full Compose smoke matrices and the exact-commit
  native/container adversarial gates before pushing either milestone.
- [x] Validate templates as XML, audit repository/image URLs, and retain an
  explicit submission-readiness mode that fails until real Unraid forum support
  topics exist.

Gate: examples are internally consistent and both containers pass Compose smoke
tests; real Unraid validation remains an explicit external gate.

### Stage 6 — Independent publishing workflows

Status: pending

- Companion repository publishes only `typr-server` after native amd64/arm64
  tests, with optional Docker Hub mirror.
- Typr repository publishes full/lite `typr` manifests after source/container
  tests, with optional Docker Hub mirror.
- Add strict tag parsing, semver aliases, OCI metadata, provenance, SBOM,
  concurrency, and post-publish verification.

Gate: workflows lint/review cleanly; no publication trigger is exercised until
the complete local validation stage passes.

### Stage 7 — Complete validation

Status: pending

- Run clean installs, typechecks, unit tests, frontend builds, Docker builds,
  container integration/adversarial tests, Compose checks, and XML checks.
- Inspect image users, mounts, ports, labels, sizes, architectures, and contents.
- Confirm Google Drive is absent from self-hosted output and browser-local storage
  remains the default.
- Record limitations and exact evidence here.

Gate: every automatable check passes, or a documented external/manual gate is
the only remaining blocker.

### Stage 8 — Releases and external gates

Status: pending

- Commit and push every verified repository milestone.
- Verify `v0.1.2` does not exist locally or remotely.
- Verify the new repository can write the existing GHCR package.
- Create and push one annotated Companion `v0.1.2` tag from the tested commit.
- Monitor publication and verify public anonymous pulls by digest/platform.
- Publish Typr only from its separately tested release tag.
- Do not enable Docker Hub or submit Community Applications without the required
  user-owned credentials, environment, support topic, and approval.

Gate: released manifests match the tested commits and no existing tag moved.

## External/manual gates

Only these are expected to require the user:

- Configure a Docker Hub namespace, public repositories, and access token if the
  optional mirrors are wanted.
- Grant the new repository Actions write access to the existing
  `ghcr.io/max-prime-math/typr-server` package if GitHub does not expose an
  automatable setting with the available credentials.
- Provide an Unraid host for real template and remote HTTPS testing.
- Create/approve support topics and give final Community Applications submission
  approval.

## Validation log

- 2026-08-09: `git status -sb` clean on `dev`; local branch matched
  `origin/dev` at `d63cb1b`.
- 2026-08-09: unsandboxed `gh auth status` succeeded for
  `max-prime-math`; Typr is public/default `main`; `max-prime-math/typr-server`
  was not found.
- 2026-08-09: unsandboxed `git ls-remote --heads --tags origin` confirmed the
  three branch tips and the two annotated tag objects/peeled commits recorded
  above.
- 2026-08-09: Docker client 29.7.1 is installed; sandboxed daemon access is
  denied, so container validation will use approved unsandboxed Docker commands.
- 2026-08-09: `npm run build` passed from the baseline tree. The emitted build
  still includes Google Drive callback/code, confirming the self-host feature
  gap recorded above.
- 2026-08-09: sandboxed `npm test` ran 406 tests; 396 passed and the ten tests
  that require a loopback listener failed with `listen EPERM`. The identical
  suite was rerun unsandboxed and all 92 files / 406 tests passed.
- 2026-08-09: filtered `dev` into seven Companion-relevant commits with no tag
  refs. Release mappings: `52c5647 → f9abc88`, `67c6327 → f6baa0d`,
  `37ad4b2 → 5f15073`, and `bca5c31 → 2d2a536`.
- 2026-08-09: standalone `npm ci`, `npm run typecheck`, XML parsing, protocol
  package dry-run, and all 4 files / 22 unit tests passed.
- 2026-08-09: built local image `typr-server:split-stage1` as non-root `node`
  with source `https://github.com/max-prime-math/typr-server` and version
  `0.1.2-dev`. Native REST compile, persistent TeXpresso, 144/240/300 DPI
  raster, and private WebSocket integration harnesses all passed. Observed local
  amd64 compressed image size: 396.0 MiB.
- 2026-08-09: committed standalone split as `597ba91`, created public
  `max-prime-math/typr-server`, pushed only `main`, verified no remote tags, and
  moved the clean checkout to `/home/max/dev/typr-server`.
- 2026-08-09: standalone GitHub run `31353414702` passed source/XML checks and
  the complete native amd64 and arm64 image/harness matrix. Publish jobs were
  correctly skipped because no tag was pushed.
- 2026-08-09: the available CLI token cannot read package metadata (`403`,
  missing `read:packages`). New repository ID `1329393163` is recorded for the
  later GHCR Actions-access setting; no package setting was changed.
- 2026-08-09: npm 12 rejected Git and URL dependencies by default. A throwaway
  consumer proved the exact public commit archive works with the narrow
  `allow-remote=root` policy and typechecked both stable and experimental package
  exports. Typr's lock records archive integrity
  `sha512-mEetPhmpagrUymKdGJaBN9p61VoKRcUjZZH/Hcg3hhNbaDR0ptUwkUKFIJPtCQV5rjb9yXr+tEroxAGcv31fPQ==`.
- 2026-08-09: after removing server-owned paths from Typr, `npm ci`,
  `npm run typecheck`, all 88 files / 384 frontend tests, and `npm run build`
  passed. A repository audit found no remaining old relative protocol imports or
  server Docker/script/config/template references outside this state record.
- 2026-08-10: standalone Companion commits `f5ddaca` through `44d0b7d` added
  protocol 1.1.0 workspace routes, an exact-root no-follow file store, strict
  route-specific CORS and mutation preconditions, bounded native execution,
  fail-closed Landlock startup probing, and hardened Compose/container limits.
  No release tag or image alias was published.
- 2026-08-10: all 8 Companion unit files / 57 tests, typecheck, production and
  development Compose parsing, Unraid XML parsing, and the production Docker
  REST/TeXpresso POC/raster/WebSocket adversarial harnesses passed locally.
  Canaries cover traversal, symlinks, special files, stale/missing conditions,
  oversized payloads, CORS/method/header rejection, mapped-workspace and
  application-tree read denial, write/shell/latexmk denial, output/time limits,
  admission recovery, capability dropping, cleanup, and process-orphan checks.
- 2026-08-10: standalone GitHub run `31358958726` passed the complete source,
  metadata, amd64, and arm64 build/adversarial matrix at `44d0b7d`; publish and
  verification jobs were correctly skipped because no tag was pushed.
- 2026-08-10: Typr pins the Companion protocol archive at immutable commit
  `44d0b7d4e773209c21ddba7b15e64a5f236e7c7a` with lock integrity
  `sha512-7ywq2fN7mS3sPerYu77Qyx2X4S7Q+Q6dp3AAufgHAdW8+6X3pis10+OGz5yrxSKcTfQIGdqXWVIeN20VqUKhzA==`.
- 2026-08-10: frontend mapped-workspace validation passed typecheck, all 89
  unit files / 402 tests, production build, and the manual browser-local-first
  E2E in Chromium and Firefox. Two independent read-only reviews found no
  remaining Stage 3 blocker after durability, race, limit, and confinement
  fixes.
- 2026-08-10: Typr commit `63c1997` passed all 91 unit files / 413 tests,
  typecheck, hosted/self-hosted builds and artifact audits, clean full/lite
  image builds, full/lite/local/R2/offline container gates, and Chromium/Firefox
  first-compile, browser-storage, no-Drive/no-implicit-network, cache-upgrade,
  and offline-reload E2E. Immutable compiler-asset run `31365938472` published
  and publicly reverified all 20 objects before the live lite/R2 gates passed.
- 2026-08-10: Typr Stage 5 Compose normalization and semantic Unraid/profile
  lint pass at `54ccebed7fe6c8252fac7c26d8d988ef83e1053d`. Typecheck, all
  91 unit files / 413 tests, and a fresh self-hosted build/artifact audit pass
  with the embedded administrator guidance. Exact full and lite images carry
  that source revision and passed the adversarial Docker matrix, production
  Compose full/lite-R2/lite-local smoke, and Chromium plus Firefox self-hosted
  E2E in all three modes.
- 2026-08-10: the reviewed Companion Stage 5 patch was integrated byte-for-byte
  into the canonical `typr-server` checkout at
  `87f53e4cb5e2670cfcda274d59db4c247b779fc1`. `npm ci`, typecheck, all 8
  unit files / 57 tests, Compose normalization, XML/profile semantic lint, and
  diff checks pass. The exact image identifies that revision and version
  `0.1.2-dev.87f53e4cb5e2`; stateless/mapped-workspace Compose, REST sandbox,
  TeXpresso POC, raster, and private WebSocket adversarial harnesses all pass.
  The image runs as `node`, and no tag or public image alias was published.

## Current next action

Push both verified Stage 5 milestones and confirm their non-publishing CI. Then
implement Stage 6 as separate Typr full/lite and Companion publishing workflows
with immutable action pins, strict tag/version semantics, pre-publish multiarch
tests, provenance/SBOM, concurrency, and post-publish verification. Keep real
Unraid installation, support topics, Community Applications submission, Docker
Hub credentials, and any GHCR package-access change as explicit external gates.
Do not publish images or create release tags yet.
