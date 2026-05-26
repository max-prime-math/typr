import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const GITHUB_PAGES_BASE = "/typr/";

export default defineConfig(({ command }) => {
  const base = command === "build" ? GITHUB_PAGES_BASE : "/";

  return {
    base,
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: [
          "apple-touch-icon.png",
          "icons/icon-192.svg",
          "icons/icon-512.svg",
          "icons/icon-192.png",
          "icons/icon-512.png"
        ],
        manifest: {
          name: "Typr",
          short_name: "Typr",
          description: "A local-first, browser-based Typst editor for iPad and desktop.",
          theme_color: "#f5f2ea",
          background_color: "#f5f2ea",
          display: "standalone",
          scope: base,
          start_url: base,
          icons: [
            {
              src: `${base}icons/icon-192.png`,
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: `${base}icons/icon-512.png`,
              sizes: "512x512",
              type: "image/png"
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 30 * 1024 * 1024
        }
      })
    ],
    worker: {
      format: "es"
    },
    server: {
      host: true
    }
  };
});
