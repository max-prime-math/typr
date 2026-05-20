/// <reference types="vite/client" />

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { primeTypstCompiler } from "./compiler/typstCompiler";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/global.css";

primeTypstCompiler();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
