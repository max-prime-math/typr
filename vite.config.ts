import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const GITHUB_PAGES_BASE = "/typr/";

export default defineConfig(({ command }) => {
  const base = command === "build" ? GITHUB_PAGES_BASE : "/";

  return {
    base,
    worker: {
      format: "es"
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        includeAssets: ["icons/icon-192.svg", "icons/icon-512.svg"],
        manifest: {
          name: "typst-pad",
          short_name: "typst-pad",
          description: "A local-first Typst editor for iPad and desktop browsers.",
          theme_color: "#f5f2ea",
          background_color: "#f5f2ea",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            {
              src: `${base}icons/icon-192.svg`,
              sizes: "192x192",
              type: "image/svg+xml",
              purpose: "any"
            },
            {
              src: `${base}icons/icon-512.svg`,
              sizes: "512x512",
              type: "image/svg+xml",
              purpose: "any maskable"
            }
          ]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
          maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/typst\/typst-assets@v0\.13\.1\/files\/fonts\/.+$/,
              handler: "CacheFirst",
              options: {
                cacheName: "typst-font-assets",
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 24,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    server: {
      host: true
    }
  };
});
