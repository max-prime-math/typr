import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const DEPLOYED_BASE = "./";
const INLINE_ASSET_LIMIT = 8 * 1024;
const packageMetadata = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")
) as { version: string };
const releaseMetadata = JSON.parse(
  readFileSync(fileURLToPath(new URL("./release-metadata.json", import.meta.url)), "utf8")
) as {
  backupRecommended?: boolean;
  breaking?: boolean;
  notes?: string[];
};

function resolveBuildSha(): string {
  const environmentSha =
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA;

  if (environmentSha) {
    return environmentSha.slice(0, 7);
  }

  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8"
    }).trim();
  } catch (error) {
    const capturedStdout = (error as { stdout?: Buffer | string }).stdout;
    const recoveredSha =
      typeof capturedStdout === "string"
        ? capturedStdout.trim()
        : capturedStdout?.toString("utf8").trim();

    if (recoveredSha) {
      return recoveredSha.slice(0, 7);
    }

    return "unknown";
  }
}

const appVersion = packageMetadata.version;
const buildSha = resolveBuildSha();

export default defineConfig(({ command }) => {
  const base = command === "build" ? DEPLOYED_BASE : "/";

  return {
    base,
    cacheDir: process.env.TYPR_VITE_CACHE_DIR,
    define: {
      __TYPR_APP_VERSION__: JSON.stringify(appVersion),
      __TYPR_BUILD_SHA__: JSON.stringify(buildSha)
    },
    plugins: [
      {
        name: "typr-release-metadata",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "release.json",
            source: JSON.stringify(
              {
                version: appVersion,
                build: buildSha,
                breaking: Boolean(releaseMetadata.breaking),
                backupRecommended: Boolean(releaseMetadata.backupRecommended),
                notes: Array.isArray(releaseMetadata.notes)
                  ? releaseMetadata.notes.filter((note) => typeof note === "string")
                  : []
              },
              null,
              2
            )
          });
        }
      },
      VitePWA({
        registerType: "prompt",
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
          clientsClaim: true,
          skipWaiting: false,
          globPatterns: [
            "**/*.{js,css,html}",
            "assets/**/*.svg",
            "core/tylax/**/*.{js,wasm,json,txt}",
            "svgedit/images/**/*"
          ],
          globIgnores: [
            "assets/binaryInlined-*.js",
            "core/busytex/**",
            "core/tikz-editor/**",
            "**/*.otf",
            "**/*.ttf"
          ],
          navigateFallbackDenylist: [/\/core\/tikz-editor\//],
          maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.*\.(?:wasm|otf|ttf)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "typr-compiler-assets"
              }
            },
            {
              urlPattern: /\/core\/busytex\/.*\.(?:js|wasm)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "typr-busytex-assets"
              }
            },
            {
              urlPattern: /\/core\/tikz-editor\//,
              handler: "CacheFirst",
              options: {
                cacheName: "typr-tikz-editor-assets"
              }
            },
            {
              urlPattern: /\/core\/tylax\//,
              handler: "CacheFirst",
              options: {
                cacheName: "typr-tylax-assets"
              }
            }
          ]
        }
      })
    ],
    optimizeDeps: {
      exclude: ["ratex-wasm"],
      include: ["pdfjs-dist/build/pdf.worker.mjs"]
    },
    test: {
      exclude: [...configDefaults.exclude, "tests/e2e/**"]
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
    },
    preview: {
      host: true
    }
  };
});
