# Typr

![Typr](https://raw.githubusercontent.com/max-prime-math/typr/main/public/icons/icon-512.png)

Typr is a browser-based mathematics editor for Typst, LaTeX, diagrams, and live preview.

## Images

- `maxprimemath/typr:0.1.1` — full image with the pinned compiler assets bundled.
- `maxprimemath/typr:0.1.1-lite` — smaller image; compiler assets are fetched from the pinned Typr asset release, or supplied through the documented read-only local-assets mount.
- `maxprimemath/typr:latest` and `maxprimemath/typr:latest-lite` — moving aliases; use an exact version or digest for reproducible deployments.

The images support `linux/amd64` and `linux/arm64`.

## Quick start

```sh
docker run --detach --name typr \
  --publish 127.0.0.1:8080:8080 \
  --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=33554432 \
  maxprimemath/typr:0.1.1
```

Open `http://127.0.0.1:8080`. Typr keeps projects in the browser's IndexedDB/OPFS by default; the container is not a project database.

## Security and networking

Typr is intended for a trusted LAN or private VPN only. Never expose it directly to the public Internet. The optional client-side AuthGate is not authentication or an access-control boundary.

For remote access, use a trusted HTTPS reverse proxy or host-level Tailscale Serve. Keep per-container Tailscale hooks disabled; the hardened image is non-root, read-only, and stateless. Disable Tailscale Funnel/public sharing.

Non-loopback HTTP is not a secure browser context, so PWA/offline and local-folder features may be reduced. Choose the final origin early: changing scheme, hostname, or port creates a separate browser storage silo.

## Documentation

- [Self-hosting guide](https://github.com/max-prime-math/typr/blob/main/docs/self-hosting.md)
- [Typr Server integration](https://github.com/max-prime-math/typr/blob/main/docs/user-guide/settings.self-hosted.md)
- [Typr repository](https://github.com/max-prime-math/typr)

Typr is licensed under AGPL-3.0-or-later.
