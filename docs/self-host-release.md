---
title: Release self-hosted Typr
---

# Release self-hosted Typr

This is the maintainer policy for `ghcr.io/max-prime-math/typr`. It is separate
from hosted PWA channel promotion and from Typr Server releases.

## Tag namespace and provenance

The original `v0.1.0` and `v0.1.1` refs are immutable historical Typr Server
releases from before the repository split. Never move, copy, or reinterpret
them as frontend releases. Self-hosted Typr uses annotated tags with the exact
form `typr-vMAJOR.MINOR.PATCH`; the numeric version must equal `package.json`.
The tag commit must be reachable from the current protected `main` branch.

For example, after every release gate passes from a clean `main` checkout:

```bash
git tag -a typr-vX.Y.Z -m "Typr X.Y.Z"
git push origin typr-vX.Y.Z
```

Pushing the annotated tag is the publication trigger. A manual workflow run,
branch push, or pull request never logs into a registry. Never move or reuse a
release tag; if a published release needs a correction, use a new version.

## Staged publication boundary

The Docker workflow performs these stages in order:

1. Clean install, zero-advisory audit, typecheck, unit tests, self-hosted artifact
   audit, Compose validation, and Unraid-template validation.
2. Native amd64 and arm64 full/lite builds and container/Compose tests. The
   amd64 job also runs Chromium and Firefox against full, lite/R2, and
   lite/local.
3. A multi-platform full candidate and lite candidate are pushed under
   run-unique `candidate-*` tags with BuildKit provenance and SPDX SBOM
   attestations. No user-facing tag moves.
4. Both registry candidate digests are pulled and tested on native amd64 and
   arm64 runners. Their OCI indexes must contain both runnable platforms and an
   attestation manifest for each.
5. Exact version and 12-character SHA tags are created from those verified
   digests without rebuilding. Native jobs pull the exact tags anonymously and
   verify their source revision, version, user, and variant.
6. Only then are GHCR moving aliases promoted, with `latest` written last.
   Promotion refuses a semantic-version downgrade.
7. An optional Docker Hub mirror copies the already verified GHCR digests in a
   separate downstream job. It never rebuilds the images.

Candidate objects are staging artifacts, not releases. Exact version tags and
Git tags are immutable. Alias promotion is idempotent but multiple registry tags
cannot be updated transactionally, so a failed run must be inspected and safely
retried; never rebuild over an existing exact version.

## Published names

For version `X.Y.Z`, the full image uses the canonical `X.Y.Z` tag and explicit
`X.Y.Z-full`; lite uses `X.Y.Z-lite`. Full moving aliases are `X.Y`, `X`, and
`latest`, with matching explicit `-full` aliases. Lite uses `X.Y-lite`,
`X-lite`, and `latest-lite`. Immutable diagnostic aliases are
`sha-<12 characters>`, `sha-<12 characters>-full`, and
`sha-<12 characters>-lite`. Bare tags always mean full.

The Unraid template deliberately follows GHCR `latest`, which is promoted only
after the exact full image passes the registry gates. Production administrators
should prefer exact versions or digests for reproducible rollback.

## First GHCR publication

The first candidate creates the `typr` container package. Before exact-tag
verification can pass, open the package settings, keep or set visibility to
**Public**, connect it to `max-prime-math/typr`, and grant that repository's
Actions workflow **Write** access if inheritance is not already active. Confirm
an anonymous platform pull succeeds. Do not delete and recreate the package.

Configure the GitHub `container-release` environment with required reviewers and
restrict it to the `typr-v*` protected tag rule before the first tag is pushed.
The workflow itself also requires the official repository, an annotated tag,
an exact package-version match, and a tag target reachable from current `main`.

## Optional Docker Hub mirror

GHCR is canonical and sufficient for Compose and Unraid. A mirror is enabled
only when all of these repository settings exist:

- variable `DOCKERHUB_NAMESPACE`: destination user or organization;
- variable `DOCKERHUB_USERNAME`: service account used to log in;
- secret `DOCKERHUB_TOKEN`: a scoped token that can write only the intended
  `typr` repository.

The workflow uses a digest-pinned Skopeo image to copy both architecture images
and their attestations recursively while preserving the verified index digest;
it does not rebuild or attempt a cross-registry retag. The registry operations
are not atomic. A Docker Hub failure does not roll back
or invalidate the already verified GHCR release; inspect any partial mirror
tags before retrying. Never put placeholder Docker Hub names in user templates.

## External gates

Image publication does not submit Community Applications. A real Unraid install,
trusted-LAN/VPN and HTTPS tests, a public support destination, completed profile XML,
portal Validate/Scan, and explicit maintainer approval remain separate manual
gates. Public Internet exposure remains prohibited.
