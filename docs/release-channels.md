# Release channels

Typr has three long-lived release branches:

| Channel | Git branch | Purpose | Recommended URL |
|---|---|---|---|
| Development | `dev` | Daily integration and feature testing | `https://dev.typr.ca` |
| Beta | `beta` | Release-candidate validation | `https://beta.typr.ca` |
| Stable | `main` | Public production release | `https://typr.ca` |

`main` intentionally retains its conventional Git name. In the app, documentation, release notes, and user-facing copy it is called **Stable**.

## Promotion policy

Development changes move to Beta through a pull request after automated checks and a manual smoke test. Beta moves to Stable through a second pull request after release notes, compatibility, and upgrade behavior have been reviewed. Fixes that must be released immediately may be made on Stable, then back-merged into Beta and Development promptly.

Protect all three branches. Require a passing build and a pull request for `beta` and `main`; require at least a passing build for `dev`. Keep the branches linear where practical: merge `dev` into `beta`, then `beta` into `main`, rather than merging in the opposite direction.

## Independent builds

The build reads `TYPR_DEPLOYMENT_CHANNEL`. GitHub Actions supplies the branch name automatically, while local builds can select a channel explicitly:

```bash
npm run build:development
npm run build:beta
npm run build:stable
```

Every generated manifest has a channel-specific display name and every runtime compiler cache has a channel-specific name. The App Info panel records the channel, version, and commit.

## Deployment requirement

Do not host the three PWAs under paths of one origin, such as `typr.ca/beta` and `typr.ca/development`. A service worker registered by Stable at `/` controls every path below that origin, so it can serve Stable assets to the other channels.

Use separate origins instead. The cleanest option is branch deployments on a host that provides dedicated subdomains, with GitHub Actions reporting each as a GitHub Environment deployment. If GitHub Pages must be the host, use three separate Pages sites (normally separate repositories) and assign the three domains above. A single GitHub Pages site cannot host three independent deployments for one repository.

Keep Google Drive OAuth configuration separate per environment: each deployment URL needs its own authorized JavaScript origin and callback URL. Use GitHub Environment-scoped variables and secrets so Development, Beta, and Stable never accidentally share production credentials or auth user lists.

## Recommended Cloudflare Pages rollout

The lowest-risk migration keeps the working Stable GitHub Pages deployment in place while Development and Beta are introduced as two Cloudflare Pages projects connected to this repository:

| Pages project | Production branch | Custom domain | Explicit build channel |
|---|---|---|---|
| `typr-dev` | `dev` | `dev.typr.ca` | `development` |
| `typr-beta` | `beta` | `beta.typr.ca` | `beta` |
| `typr-stable` (optional later) | `main` | `typr.ca` | `stable` |

For each project, use `npm run build` as the build command and `dist` as the output directory. Set `TYPR_DEPLOYMENT_CHANNEL` to the value in the table; the build also recognizes Cloudflare's `CF_PAGES_BRANCH` when the explicit value is absent. Disable automatic preview-branch deployments so each project builds only its production branch.

Cloudflare Pages cannot accept Typr's largest compiler files directly. Store one immutable compiler release in the `typr-assets` R2 bucket using this layout:

```text
releases/busytex-1.1.1-typr.1-typst-0.7.0-rc2/
├── core/busytex/...
└── typst/typst_ts_web_compiler_bg.wasm
```

After `assets.typr.ca` serves that bucket, set this build variable on every Cloudflare Pages project:

```text
VITE_TYPR_COMPILER_ASSET_BASE_URL=https://assets.typr.ca/releases/busytex-1.1.1-typr.1-typst-0.7.0-rc2
```

That setting redirects both compilers to the versioned release, omits their oversized local copies from `dist`, and rejects any remaining Pages file over 25 MiB. Builds without the setting remain self-contained for local preview and GitHub Pages.

The **Publish compiler assets** GitHub Actions workflow runs when its publishing inputs change on `dev` and can also be started manually after it reaches the default branch. It reads the repository secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_ENDPOINT`, derives the release name from the installed package versions plus the explicit Typr asset revision, and refuses to replace an immutable object with different contents. Increment that revision whenever Typr's BusyTeX optimization changes without an upstream package-version change.

Configure `VITE_TYPR_AUTH_USERS_SHA256`, `VITE_GOOGLE_DRIVE_CLIENT_ID`, `VITE_GOOGLE_PICKER_API_KEY`, and `VITE_GOOGLE_CLOUD_PROJECT_NUMBER` separately in each project. Authorize the exact origin and callback for each channel, including `/google-drive-oauth-callback.html`.

Attach each custom domain through the Pages project's **Custom domains** screen rather than creating a DNS record by hand. Because `typr.ca` is already a Cloudflare-managed zone, Pages can create and validate the proxied record. Confirm a successful `release.json` on the project's `pages.dev` URL before attaching its public domain. The existing Stable deployment can remain untouched until a separate `typr-stable` project has passed the same check.

## Operating tips

- Put the release channel and short commit SHA in bug reports and screenshots.
- Promote the same commit between channels whenever possible; avoid rebuilding a different commit by hand.
- Test PWA upgrade, offline open, and first compile in a clean browser profile before promotion.
- Never use a production custom domain or its `CNAME` file for Beta or Development.
- Keep a rollback target: the previously known-good Stable commit or deployment artifact.
