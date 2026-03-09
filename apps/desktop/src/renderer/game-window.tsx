import { initSentryRenderer } from "./sentry";

// Initialize Sentry before React mounts so it captures all errors.
initSentryRenderer();

import React from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GameWindow } from "./components/GameWindow";
import { DevAgentation } from "./components/DevAgentation";
import "../game-window.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <GameWindow />
        <DevAgentation />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
