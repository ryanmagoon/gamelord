import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { sfxEngine } from "./lib/audio/SfxEngine";
import "../app.css";

// Restore theme preference before React mounts (prevents flash).
// Three-state: 'system' (default) | 'dark' | 'light'
const savedTheme = localStorage.getItem("gamelord:theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

const shouldBeDark = savedTheme === "dark" || (savedTheme !== "light" && prefersDark); // 'system' or null → follow OS

document.documentElement.classList.toggle("dark", shouldBeDark);

// Pre-initialize the audio engine on the first user gesture so the ~50-100ms
// of AudioContext creation + buffer synthesis doesn't block the first
// dialog/modal open. AbortController removes both listeners after either fires.
{
  const ac = new AbortController();
  const warmup = () => {
    sfxEngine.warmup();
    ac.abort();
  };
  document.addEventListener("click", warmup, { signal: ac.signal });
  document.addEventListener("keydown", warmup, { signal: ac.signal });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
