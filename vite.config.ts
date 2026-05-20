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
        includeAssets: ["icons/icon-192.svg", "icons/icon-512.svg"]
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
