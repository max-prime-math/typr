import { defineConfig } from "vite";

const GITHUB_PAGES_BASE = "/typr/";

export default defineConfig(({ command }) => {
  const base = command === "build" ? GITHUB_PAGES_BASE : "/";

  return {
    base,
    worker: {
      format: "es"
    },
    server: {
      host: true
    }
  };
});
