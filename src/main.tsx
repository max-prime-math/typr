/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

import { warmTypstOfflineAssets } from "./compiler/typstAssets";
import { ensureTypstQueueMicrotask } from "./compiler/typstPolyfills";
import { shouldUseLowMemoryCompilerMode } from "./utils/browserDetection";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { AuthGate } from "./auth/AuthGate";
import { ThemeProvider } from "./theme/ThemeProvider";
import { registerVersionedServiceWorker } from "./update/registerServiceWorker";
import { updateManager } from "./update/updateManager";
import "./styles/global.css";

ensureTypstQueueMicrotask();

const APP_READY_EVENT = "typr:app-ready";
const BOOT_PROGRESS_EVENT = "typr:boot-progress";
const OFFLINE_READY_EVENT = "typr:offline-ready";
let bootProgress = 0.08;

function updateBootProgress(progress: number) {
  const splashProgress = document.querySelector<HTMLElement>(".boot-splash__progress");
  if (!splashProgress) {
    return;
  }

  bootProgress = Math.max(bootProgress, Math.min(1, Math.max(0, progress)));
  splashProgress.style.setProperty("--boot-splash-progress", `${Math.round(bootProgress * 100)}%`);
  splashProgress.setAttribute("aria-valuenow", String(Math.round(bootProgress * 100)));
}

window.addEventListener(BOOT_PROGRESS_EVENT, (event) => {
  const progress =
    event instanceof CustomEvent && typeof event.detail?.progress === "number"
      ? event.detail.progress
      : bootProgress;
  updateBootProgress(progress);
});

updateBootProgress(0.18);

async function prepareOfflineCompilerAssets() {
  if (!shouldUseLowMemoryCompilerMode()) {
    await warmTypstOfflineAssets();
  }

  document.documentElement.dataset.typrOfflineReady = "true";
  window.dispatchEvent(new Event(OFFLINE_READY_EVENT));
  console.info("typr is ready for offline use.");
}

if (import.meta.env.PROD) {
  updateManager.initialize(
    registerVersionedServiceWorker,
    () => {
      void prepareOfflineCompilerAssets().catch((error) => {
        console.error(
          "typr could not prepare the compiler for offline use.",
          error
        );
      });
    }
  );
}

function TyprApp() {
  return <App />;
}

function dismissBootSplash() {
  const splash = document.getElementById("boot-splash");
  if (!splash) {
    return;
  }

  splash.style.pointerEvents = "none";
  splash.setAttribute("inert", "");
  splash.classList.add("boot-splash--hidden");
  window.setTimeout(() => {
    splash.remove();
  }, 220);
}

const bootSplashFallback = window.setTimeout(() => {
  updateBootProgress(1);
  dismissBootSplash();
}, 5000);

function handleAppReady() {
  window.clearTimeout(bootSplashFallback);
  document.documentElement.dataset.typrAppReady = "true";
  updateBootProgress(1);
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      dismissBootSplash();
    });
  }, 160);
}

window.addEventListener(APP_READY_EVENT, handleAppReady, { once: true });

if (document.documentElement.dataset.typrAppReady === "true") {
  handleAppReady();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthGate>
        <TyprApp />
      </AuthGate>
    </ThemeProvider>
  </React.StrictMode>
);
