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

Protect all three branches. Require a passing build and a pull request for `beta` and `main`; require at least a passing build for `development`. Keep the branches linear where practical: merge `development` into `beta`, then `beta` into `main`, rather than merging in the opposite direction.

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

## Operating tips

- Put the release channel and short commit SHA in bug reports and screenshots.
- Promote the same commit between channels whenever possible; avoid rebuilding a different commit by hand.
- Test PWA upgrade, offline open, and first compile in a clean browser profile before promotion.
- Never use a production custom domain or its `CNAME` file for Beta or Development.
- Keep a rollback target: the previously known-good Stable commit or deployment artifact.
