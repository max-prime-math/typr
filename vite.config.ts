import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const DEPLOYED_BASE = "./";
const INLINE_ASSET_LIMIT = 8 * 1024;
const externalCompilerAssetBaseUrl = process.env.VITE_TYPR_COMPILER_ASSET_BASE_URL
  ?.trim()
  .replace(/\/+$/, "");
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

type DeploymentChannel = "development" | "beta" | "stable";

function resolveDeploymentChannel(): DeploymentChannel {
  const requestedChannel =
    process.env.TYPR_DEPLOYMENT_CHANNEL ??
    process.env.GITHUB_REF_NAME ??
    process.env.CF_PAGES_BRANCH ??
    resolveCurrentBranch();

  switch (requestedChannel?.trim().toLowerCase()) {
    case "main":
    case "stable":
      return "stable";
    case "beta":
      return "beta";
    case "development":
    case "dev":
      return "development";
    default:
      return "development";
  }
}

function resolveCurrentBranch(): string | undefined {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8"
    }).trim();
  } catch {
    return undefined;
  }
}

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
const deploymentChannel = resolveDeploymentChannel();
const deploymentLabel =
  deploymentChannel.charAt(0).toUpperCase() + deploymentChannel.slice(1);

export default defineConfig(({ command }) => {
  const base = command === "build" ? DEPLOYED_BASE : "/";

  return {
    base,
    cacheDir: process.env.TYPR_VITE_CACHE_DIR,
    define: {
      __TYPR_APP_VERSION__: JSON.stringify(appVersion),
      __TYPR_BUILD_SHA__: JSON.stringify(buildSha),
      __TYPR_DEPLOYMENT_CHANNEL__: JSON.stringify(deploymentChannel),
      __TYPR_DEPLOYMENT_LABEL__: JSON.stringify(deploymentLabel)
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
                channel: deploymentChannel,
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
          id: base,
          name: `Typr ${deploymentLabel}`,
          short_name: `Typr ${deploymentLabel}`,
          description: `${deploymentLabel} channel of a local-first, browser-based Typst editor for iPad and desktop.`,
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
            "google-drive-oauth-callback.html",
            "assets/binaryInlined-*.js",
            "core/busytex/**",
            "core/tikz-editor/**",
            "**/*.otf",
            "**/*.ttf"
          ],
          navigateFallbackDenylist: [
            /\/core\/tikz-editor\//,
            /\/google-drive-oauth-callback\.html$/
          ],
          maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern:
                /\/(?:assets\/.*|typst\/typst_ts_web_compiler_bg)\.(?:wasm|otf|ttf)$/,
              handler: "CacheFirst",
              options: {
                cacheName: `typr-${deploymentChannel}-compiler-assets`
              }
            },
            {
              urlPattern: /\/core\/busytex\/.*\.(?:js|wasm)$/,
              handler: "CacheFirst",
              options: {
                cacheName: `typr-${deploymentChannel}-busytex-assets`
              }
            },
            {
              urlPattern: /\/core\/tikz-editor\//,
              handler: "CacheFirst",
              options: {
                cacheName: `typr-${deploymentChannel}-tikz-editor-assets`
              }
            },
            {
              urlPattern: /\/core\/tylax\//,
              handler: "CacheFirst",
              options: {
                cacheName: `typr-${deploymentChannel}-tylax-assets`
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
    experimental: {
      renderBuiltUrl(filename) {
        if (
          externalCompilerAssetBaseUrl &&
          /(?:^|\/)typst_ts_web_compiler_bg-[^/]+\.wasm$/.test(filename)
        ) {
          return `${externalCompilerAssetBaseUrl}/typst/typst_ts_web_compiler_bg.wasm`;
        }

        return undefined;
      }
    },
    build: {
      rollupOptions: {
        input: {
          app: fileURLToPath(new URL("./index.html", import.meta.url)),
          googleDriveOAuthCallback: fileURLToPath(
            new URL(
              "./google-drive-oauth-callback.html",
              import.meta.url
            )
          )
        }
      },
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
