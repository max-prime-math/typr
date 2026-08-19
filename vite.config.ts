import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const DEPLOYED_BASE = "./";
const INLINE_ASSET_LIMIT = 8 * 1024;
const HOSTED_CHANNEL_ORIGINS = [
  "https://typr.ca",
  "https://beta.typr.ca",
  "https://dev.typr.ca"
] as const;
const buildTarget = resolveBuildTarget();
const selfHosted = buildTarget === "self-hosted";
const compilerAssetLock = JSON.parse(
  readFileSync(fileURLToPath(new URL("./compiler-assets.lock.json", import.meta.url)), "utf8")
) as { releaseId?: string };
if (typeof compilerAssetLock.releaseId !== "string" || !/^[a-zA-Z0-9._-]+$/.test(compilerAssetLock.releaseId)) {
  throw new Error("compiler-assets.lock.json has an invalid release ID.");
}
const compilerAssetReleaseId = compilerAssetLock.releaseId;
const externalCompilerAssetBaseUrl = (selfHosted
  ? `/compiler-assets/${compilerAssetReleaseId}`
  : process.env.VITE_TYPR_COMPILER_ASSET_BASE_URL)
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

function resolveBuildTarget(): "hosted" | "self-hosted" {
  const value = process.env.TYPR_BUILD_TARGET?.trim() || "hosted";
  if (value !== "hosted" && value !== "self-hosted") {
    throw new Error("TYPR_BUILD_TARGET must be hosted or self-hosted.");
  }
  return value;
}

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

function resolveBuildCommit(): string {
  const environmentSha =
    process.env.TYPR_BUILD_SHA ??
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA;

  if (environmentSha) {
    const normalizedSha = environmentSha.trim().toLowerCase();
    if (!/^[a-f0-9]{7,64}$/.test(normalizedSha)) {
      throw new Error("TYPR build SHA must be a hexadecimal commit identifier.");
    }
    return normalizedSha;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim();
  } catch (error) {
    const capturedStdout = (error as { stdout?: Buffer | string }).stdout;
    const recoveredSha =
      typeof capturedStdout === "string"
        ? capturedStdout.trim()
        : capturedStdout?.toString("utf8").trim();

    if (recoveredSha) {
      return recoveredSha;
    }

    return "unknown";
  }
}

const appVersion = packageMetadata.version;
const buildCommit = resolveBuildCommit();
const buildSha = buildCommit === "unknown" ? buildCommit : buildCommit.slice(0, 7);
const deploymentChannel = resolveDeploymentChannel();
const deploymentLabel =
  deploymentChannel.charAt(0).toUpperCase() + deploymentChannel.slice(1);

export default defineConfig(({ command }) => {
  const base = command === "build" && !selfHosted ? DEPLOYED_BASE : "/";
  const buildInputs = {
    app: fileURLToPath(new URL("./index.html", import.meta.url)),
    ...(selfHosted ? {} : {
      googleDriveOAuthCallback: fileURLToPath(new URL("./google-drive-oauth-callback.html", import.meta.url)),
      channelTransfer: fileURLToPath(new URL("./channel-transfer.html", import.meta.url))
    })
  };

  return {
    base,
    cacheDir: process.env.TYPR_VITE_CACHE_DIR,
    define: {
      __TYPR_APP_VERSION__: JSON.stringify(appVersion),
      __TYPR_BUILD_SHA__: JSON.stringify(buildSha),
      __TYPR_DEPLOYMENT_CHANNEL__: JSON.stringify(deploymentChannel),
      __TYPR_DEPLOYMENT_LABEL__: JSON.stringify(deploymentLabel),
      __TYPR_SELF_HOSTED__: JSON.stringify(selfHosted),
      __TYPR_GOOGLE_DRIVE_ENABLED__: JSON.stringify(!selfHosted),
      __TYPR_COMPILER_ASSET_RELEASE_ID__: JSON.stringify(compilerAssetReleaseId)
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
                commit: buildCommit,
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
          if (!selfHosted) {
            this.emitFile({
              type: "asset",
              fileName: ".well-known/web-app-origin-association",
              source: JSON.stringify(
                {
                  web_apps: HOSTED_CHANNEL_ORIGINS.map((origin) => ({
                    web_app_identity: `${origin}/`
                  }))
                },
                null,
                2
              )
            });
          }
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
          ...(!selfHosted ? {
            scope_extensions: HOSTED_CHANNEL_ORIGINS.map((origin) => ({ origin }))
          } : {}),
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
            ...(!selfHosted ? ["google-drive-oauth-callback.html"] : []),
            "assets/binaryInlined-*.js",
            "core/busytex/**",
            "core/tikz-editor/**",
            "**/*.otf",
            "**/*.ttf"
          ],
          navigateFallbackDenylist: [
            /\/core\/tikz-editor\//,
            ...(!selfHosted ? [/\/google-drive-oauth-callback\.html$/] : [])
          ],
          maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern:
                /\/(?:assets\/.*|typst\/typst_ts_web_compiler_bg)\.(?:wasm|otf|ttf)$/,
              handler: "CacheFirst",
              options: {
                cacheName: `typr-${deploymentChannel}-${compilerAssetReleaseId}-compiler-assets`
              }
            },
            {
              urlPattern: /\/core\/busytex\/.*\.(?:js|wasm)$/,
              handler: "CacheFirst",
              options: {
                cacheName: `typr-${deploymentChannel}-${compilerAssetReleaseId}-busytex-assets`
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
        input: buildInputs
      },
      assetsInlineLimit(filePath, content) {
        if (filePath.endsWith(".svg")) {
          return false;
        }

        return content.length < INLINE_ASSET_LIMIT;
      }
    },
    resolve: {
      alias: [{
        find: "@typr/google-drive-feature",
        replacement: fileURLToPath(new URL(
          selfHosted ? "./src/features/googleDrive/disabled.tsx" : "./src/features/googleDrive/hosted.tsx",
          import.meta.url
        ))
      }, {
        find: /^@typr\/user-guide-settings\?raw$/,
        replacement: `${fileURLToPath(new URL(
          selfHosted ? "./docs/user-guide/settings.self-hosted.md" : "./docs/user-guide/settings.md",
          import.meta.url
        ))}?raw`
      }, {
        find: /^@typr\/user-guide-workspace\?raw$/,
        replacement: `${fileURLToPath(new URL(
          selfHosted ? "./docs/user-guide/workspace.self-hosted.md" : "./docs/user-guide/workspace.md",
          import.meta.url
        ))}?raw`
      }, {
        find: "node:zlib",
        replacement: fileURLToPath(new URL("./src/shims/browserZlib.ts", import.meta.url))
      }]
    },
    server: {
      host: true
    },
    preview: {
      host: true
    }
  };
});
