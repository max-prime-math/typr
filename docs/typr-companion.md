---
title: Typr Companion
---

# Typr Companion

Typr Companion is an optional service that runs separately from the Typr web
app. Typr continues to work without it and uses BusyTeX for browser-local LaTeX
compilation. Connecting Companion adds:

- Native `latexmk`/pdfLaTeX compilation.
- Experimental TeXpresso live preview for supported LaTeX projects.
- Optional manual synchronization with one administrator-mapped workspace.

The official image is `ghcr.io/max-prime-math/typr-server`. See the
[Companion repository](https://github.com/max-prime-math/typr-server) for the
complete installation, protocol, release, and troubleshooting references.

## Security boundary

Companion has no authentication. Run it only on a trusted machine, trusted LAN,
or private VPN with mutually trusted users and documents. **Never expose it to
the public Internet**, enable Tailscale Funnel for it, or use a public tunnel.
TLS improves browser compatibility and protects transport; it does not add
authentication.

Companion is stateless by default. Browser storage remains Typr's primary
project copy, and no host files are exposed unless an administrator explicitly
maps one narrowly scoped workspace.

## Install and verify

Use the [Companion installation guide](https://github.com/max-prime-math/typr-server/blob/main/docs/companion-installation.md)
for Docker and Compose instructions, version pinning, rollback, and platform
requirements. After starting the container, verify its status from its host:

```bash
curl -fsS http://127.0.0.1:8484/api/v1/status
```

The response should report protocol version 1 and native compilation
capabilities. Port `8484` is the default. A Docker service name is not a browser
URL; the URL configured in Typr must be reachable directly from the device
running the browser.

## Connect Typr

1. Open **Settings → Editor → Typr Companion**.
2. Enter Companion's browser-reachable base URL with no path or trailing slash.
3. Select **Apply**.

The URL is stored only in that browser. `http://127.0.0.1:8484` works when the
browser and Companion run on the same machine. From another device, `127.0.0.1`
refers to that device—not the server—so use a trusted LAN/VPN address that the
browser can reach.

An HTTPS Typr page cannot connect to a plain HTTP or WebSocket Companion because
the browser blocks mixed content. For cross-device use, put Companion behind a
client-trusted HTTPS endpoint that forwards WebSocket upgrades. If Typr uses a
custom origin, add its exact `scheme://host[:port]` value to
`TYPR_COMPANION_ALLOWED_ORIGINS`. This setting replaces the default allowlist,
so include every Typr origin that should connect.

## Unraid and Tailscale

Install **Typr-Companion** from Community Applications and keep bridge
networking with container port `8484`. The
[Unraid guide](https://github.com/max-prime-math/typr-server/blob/main/docs/companion-unraid.md)
documents the template fields and stock-Unraid sandbox constraints.

For private remote access, run Tailscale on the Unraid host. Leave the
container's **Use Tailscale** switch off and proxy Companion with host-level
Tailscale Serve:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:8484
tailscale serve status
```

Enter the resulting URL, such as
`https://UNRAID-NAME.TAILNET.ts.net:8443`, in Typr. The browser device must be
connected to the tailnet. Keep Funnel disabled, and add Typr's exact HTTPS
origin to **Allowed Typr origins** in the Companion template.

## Native compilation and live preview

When Companion is available, the normal Compile action uses its native
`latexmk`/pdfLaTeX path. If Companion becomes unavailable, editing continues and
Typr falls back to BusyTeX where supported.

For a LaTeX project with a detectable root `.tex` file, the Preview header also
offers **Live Preview (Experimental)**. This uses a private WebSocket connection
to TeXpresso. The regular PDF Compile action remains the authoritative build;
see [Editing and Preview](./user-guide/editing-preview.md) for behavior and
current limitations.

## Optional mapped workspace

An administrator can map one dedicated host directory into Companion for
explicit manual synchronization. This is not automatic backup or arbitrary
server browsing. In Typr, link the selected project under **Settings → Sync**
and start synchronization manually.

Use a newly created, narrowly scoped directory—never `/`, `/mnt`, `/mnt/user`,
an entire share, an appdata root, or the Docker socket. Browser-local storage
remains authoritative, and independent host backups are still required. A
mapped workspace requires Companion's native filesystem sandbox; on a stock
Unraid kernel where that sandbox is unavailable, keep Companion stateless.

## If Companion is unavailable

Check each layer in order:

1. Confirm the container is healthy and `/api/v1/status` works from its host.
2. Confirm the configured URL is reachable from the browser device.
3. If Typr uses HTTPS, confirm Companion also uses trusted HTTPS and the reverse
   proxy forwards WebSocket upgrades.
4. Confirm Companion allows Typr's exact origin, including scheme and port.
5. Check browser certificate trust, Local Network Access permission, firewall or
   tailnet rules, reverse-proxy logs, and Companion container logs.

An error that says BusyTeX is active while Companion is unavailable means the
browser-local compiler is still usable; only the optional Companion connection
failed.
