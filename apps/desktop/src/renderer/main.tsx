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

const rootElement = document.getElementById('root')!;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Signal that React has mounted so the inline CSS transition fades #root in.
// Uses requestAnimationFrame to ensure the first paint has the initial opacity: 0,
// then the class toggle triggers the CSS transition to opacity: 1.
requestAnimationFrame(() => {
  rootElement.classList.add('mounted');
});
