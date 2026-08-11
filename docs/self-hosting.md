---
title: Self-host Typr
---

# Self-host Typr

Typr's self-hosted image serves the browser application; it is not a project
server. Projects, settings, browser Git data, and sync bindings remain in each
browser's IndexedDB and OPFS by default. The container has no project or appdata
volume, and replacing it does not migrate or delete browser data.

Self-hosted Typr and Typr Companion are separate images and repositories:

- `ghcr.io/max-prime-math/typr` serves the Typr PWA.
- `ghcr.io/max-prime-math/typr-server` is the optional native Companion.

Both are unauthenticated trusted-environment services. Run them only on a
trusted machine, trusted LAN, or private VPN. **Never expose either service to
the public Internet.** A reverse proxy and TLS improve transport and browser
compatibility; they do not add application authentication or make public
exposure safe.
Any optional client-side sign-in screen is a convenience layer, not a network
security boundary.

## Choose an image

The full and lite variants contain the same application files and disable
Google Drive at build time. Browser-local storage remains the default in both.

| Variant | Moving tag | Exact tag | Compiler assets | Network needed to load the pinned compiler core |
|---|---|---|---|---|
| Full | `latest` (`latest-full` is explicit) | `X.Y.Z` or `X.Y.Z-full` | Exact release bundled in the image | No |
| Lite, R2 | `latest-lite` | `X.Y.Z-lite` | Exact release proxied from `assets.typr.ca` through the Typr origin | Yes |
| Lite, local | `latest-lite` | `X.Y.Z-lite` | Exact release mounted read-only at `/compiler-assets` | No |

For reproducible deployment and rollback, replace moving tags with the complete
`X.Y.Z` and `X.Y.Z-lite` tags or a registry digest. Bare tags always select the
full image. `X.Y`, `X`, and `latest` are moving full aliases; their `-full` and
`-lite` forms make the variant explicit. `sha-<12 characters>` is an immutable
full-image diagnostic alias and the suffixed SHA aliases select an explicit
variant. Do not mix an asset directory from one release with another image:
lite/local validates the manifest, exact file set, sizes, and SHA-256 hashes
before it becomes healthy.

"Full" means the pinned Typst compiler and BusyTeX bundles are included. Some
user-selected packages, external images, links, GitHub operations, and optional
services can still require a network connection.

## Docker Compose

The default [`compose.yaml`](../compose.yaml) runs the full image on loopback:

```bash
docker compose up -d
curl -fsS http://127.0.0.1:8080/healthz
```

Open `http://127.0.0.1:8080`. The Compose file uses a non-root image, read-only
root filesystem, bounded no-exec tmpfs, dropped capabilities, no-new-privileges,
and PID/memory/CPU limits.

Run the lite image with its pinned R2 source by selecting it in the same Compose
file:

```bash
TYPR_IMAGE=ghcr.io/max-prime-math/typr:X.Y.Z-lite docker compose up -d
```

To run the same lite image with a local compiler release, first download and
extract the exact release directory described by that image's release notes.
Put both persistent selections in `.env` so every later Compose command uses the
same variant and mount:

```dotenv
TYPR_IMAGE=ghcr.io/max-prime-math/typr:X.Y.Z-lite
TYPR_COMPILER_ASSETS_DIR=/srv/typr/compiler-assets
```

```bash
docker compose -f compose.yaml -f compose.local-assets.yaml up -d
```

One way to obtain the exact pack without broad host mounts is to copy it from
the matching full image. Use the same complete version for both image variants:

```bash
mkdir -p /srv/typr/compiler-assets
docker create --name typr-asset-source ghcr.io/max-prime-math/typr:X.Y.Z
docker cp typr-asset-source:/compiler-assets/. /srv/typr/compiler-assets
docker rm typr-asset-source
```

The directory must contain `manifest.json`, `core/busytex/...`, and
`typst/typst_ts_web_compiler_bg.wasm` at its root. It must be mounted read-only;
the container rejects writable or nested writable mounts, symlinks, special
files, missing files, extra files, wrong sizes, and wrong hashes.

Set `TYPR_IMAGE` to an exact image tag or digest before a Compose command to pin
or roll back. Put the selection in a local `.env` file so every later Compose
command keeps the same variant:

```dotenv
TYPR_IMAGE=ghcr.io/max-prime-math/typr:X.Y.Z-lite
```

Update that selected variant with:

```bash
docker compose pull
docker compose up -d
```

Use the same `-f` arguments for lite/local. There is no in-container updater.
Export project backups before an update even though replacing the container
does not itself touch browser data.

## Network and browser-origin rules

The Compose examples bind `127.0.0.1` by default. This is the safest single-host
configuration, and browsers treat loopback HTTP as a secure-context exception.
To listen on a LAN interface, set `TYPR_BIND_ADDRESS` deliberately—for example,
`TYPR_BIND_ADDRESS=192.168.1.20`—and enforce trusted-LAN/VPN access with the host
firewall. Do not bind a publicly reachable interface.

Plain HTTP on a non-loopback LAN address is not a secure context. Normal editing
and IndexedDB storage can still work, but service-worker installation/offline
updates, File System Access/local-folder sync, and other secure-context features
may be unavailable. Trusted HTTPS is required for the full cross-device PWA
experience.

Browser storage belongs to the exact origin: scheme, hostname, and port. Moving
from `http://nas:8080` to `https://typr.example`, changing a port, or changing a
hostname creates a different storage silo. Export a Typr project backup from the
old origin before changing the URL, then import it at the new origin. Clearing
site data can remove the browser's only project copy.

An HTTPS Typr page cannot call a plain HTTP/WS Companion because the browser
blocks mixed content. For cross-device Companion use, give both services trusted
HTTPS endpoints restricted to the LAN/VPN, forward Companion WebSocket upgrades,
and add the exact Typr origin to the Companion allowlist. HTTPS is not permission
to expose either endpoint publicly.

### Private HTTPS with Tailscale on Unraid

On Unraid, use the official Tailscale plugin on the **host** and Tailscale Serve
as the private HTTPS reverse proxy. Keep the per-container **Use Tailscale**
switch off for both Typr images: Unraid's injected container hook needs a
different privilege and mount model than these non-root, read-only containers.

For example, if Typr is published on host port `7080`, run this from an Unraid
terminal:

```bash
tailscale serve --bg --https=8444 http://127.0.0.1:7080
tailscale serve status
```

Open the resulting `https://UNRAID-NAME.TAILNET.ts.net:8444` URL only from a
device joined to the authorized tailnet. Use a different private HTTPS port for
Companion as documented in its Unraid guide. Changing from the LAN URL to the
Tailscale URL creates a new browser-storage origin, so export projects from the
old origin before moving. Tailscale **Serve** stays within the tailnet;
**Funnel must remain disabled** because these services must never be public.

## Optional Typr Companion and mapped workspace

Typr works without Companion. A fresh self-hosted browser profile makes no
Companion or mapped-workspace request. To opt in, install Companion from its
[separate repository](https://github.com/max-prime-math/typr-server), enter its
URL under **Settings → Editor → Typr Companion**, and apply it.

The optional host workspace is mounted into the Companion container—not the Typr
web container. When an administrator enables that single scoped directory, a
user may explicitly link the selected browser-local project under
**Settings → Sync** and run a manual synchronization. Unlinking never deletes
server files, and browser autosave continues if Companion is unavailable.

## Unraid

[`unraid/typr.xml`](../unraid/typr.xml) is the separate Typr template. It uses
the full image and needs only port 8080; project files are not stored in Unraid
appdata. To use lite, manually select its Repository tag and then choose R2 mode
or an exact read-only compiler pack in the advanced fields; never map project
files or a broad share there. The
[Typr Companion template](https://github.com/max-prime-math/typr-server/blob/main/unraid/typr-companion.xml)
is installed independently when native LaTeX or a mapped workspace is wanted.
For private Tailscale access, leave each container's **Use Tailscale** switch off
and follow the host-level Serve setup above.

Before Community Applications submission, validate both templates on a real
Unraid host, including install, health, browser access, update, rollback, and
removal. Put a maintained support destination in each template's `Support`
field; an optional profile `Forum` field may point to the same destination. Then run
`npm run test:unraid -- --submission-ready` plus the portal's Validate and Scan
actions. Until then these are direct user templates, not Community Applications
listings.

## Verify and remove

```bash
docker compose ps
curl -fsS http://127.0.0.1:8080/healthz
docker compose logs typr
```

Remove the container with `docker compose down`, using the same `-f` arguments
used to start it. This removes no browser projects. To remove a browser project
copy, use Typr's project controls or the browser's site-data controls only after
exporting any required backup.
