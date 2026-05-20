/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import { warmTypstOfflineAssets } from "./compiler/typstAssets";
import { primeTypstCompiler } from "./compiler/typstCompiler";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/global.css";

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info("typr is ready for offline use.");
  }
});

primeTypstCompiler();
void warmTypstOfflineAssets();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
