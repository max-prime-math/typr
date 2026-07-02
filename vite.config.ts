import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const DEPLOYED_BASE = "./";
const INLINE_ASSET_LIMIT = 8 * 1024;

export default defineConfig(({ command }) => {
  const base = command === "build" ? DEPLOYED_BASE : "/";

  return {
    base,
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: [
          "favicon.svg",
          "apple-touch-icon.png",
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
          globPatterns: ["**/*.{js,css,html}", "assets/**/*.svg"],
          globIgnores: ["core/busytex/**", "**/*.wasm", "**/*.otf", "**/*.ttf"],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.*\.(?:wasm|otf|ttf)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "typr-compiler-assets"
              }
            },
            {
              urlPattern: /\/core\/busytex\/.*\.(?:js|wasm|data)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "typr-busytex-assets"
              }
            }
          ]
        }
      })
    ],
    optimizeDeps: {
      exclude: ["ratex-wasm"]
    },
    worker: {
      format: "es"
    },
    build: {
      assetsInlineLimit(filePath, content) {
        if (filePath.endsWith(".svg")) {
          return false;
        }

        return content.length < INLINE_ASSET_LIMIT;
      }
    },
    resolve: {
      alias: {
        "node:zlib": fileURLToPath(new URL("./src/shims/browserZlib.ts", import.meta.url))
      }
    },
    server: {
      host: true
    }
  };
});
