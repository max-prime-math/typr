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

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    dismissBootSplash();
  });
});
