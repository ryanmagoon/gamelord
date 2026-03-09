import { initSentryRenderer } from "./sentry";

// Initialize Sentry before React mounts so it captures all errors.
initSentryRenderer();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "../app.css";

// Restore theme preference before React mounts (prevents flash).
// Three-state: 'system' (default) | 'dark' | 'light'
const savedTheme = localStorage.getItem("gamelord:theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

const shouldBeDark = savedTheme === "dark" || (savedTheme !== "light" && prefersDark); // 'system' or null → follow OS

document.documentElement.classList.toggle("dark", shouldBeDark);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
