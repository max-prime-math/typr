/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

import { ensureTypstQueueMicrotask } from "./compiler/typstPolyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import { AuthGate } from "./auth/AuthGate";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/global.css";

ensureTypstQueueMicrotask();

const APP_READY_EVENT = "typr:app-ready";
const BOOT_PROGRESS_EVENT = "typr:boot-progress";
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

if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info("typr is ready for offline use.");
    }
  });
}

function TyprApp() {
  return <App />;
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

function dismissBootSplash() {
  const splash = document.getElementById("boot-splash");
  if (!splash) {
    return;
  }

  splash.classList.add("boot-splash--hidden");
  window.setTimeout(() => {
    splash.remove();
  }, 220);
}

window.addEventListener(APP_READY_EVENT, () => {
  updateBootProgress(1);
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      dismissBootSplash();
    });
  }, 160);
}, { once: true });
