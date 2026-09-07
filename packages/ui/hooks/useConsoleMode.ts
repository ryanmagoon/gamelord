import { useEffect, useState } from "react";
const key = "gamelord:consoleMode";
export function useConsoleMode() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(key) === "true");
  useEffect(() => {
    const update = () => setEnabled(localStorage.getItem(key) === "true");
    window.addEventListener("storage", update);
    window.addEventListener("gamelord:console-mode", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("gamelord:console-mode", update);
    };
  }, []);
  const set = (value: boolean) => {
    localStorage.setItem(key, String(value));
    setEnabled(value);
    window.dispatchEvent(new Event("gamelord:console-mode"));
  };
  return [enabled, set] as const;
}
