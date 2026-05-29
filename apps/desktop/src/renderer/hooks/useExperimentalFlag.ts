import { useCallback, useEffect, useState } from "react";

/**
 * Lightweight experimental feature flags persisted in localStorage under the
 * `gamelord:experimental:*` namespace (mirrors the existing `gamelord:*`
 * settings convention used across the renderer).
 *
 * These gate in-progress UI that isn't ready for general use. There is no
 * remote flag service — flags are local to the machine and toggled from the
 * Settings → General → Experimental section.
 */

/** Known experimental flag keys. Add new flags here as they're introduced. */
export const EXPERIMENTAL_FLAGS = {
  /** Render the controller configurator as a staged 3D model. */
  controller3d: "gamelord:experimental:controller3d",
} as const;

export type ExperimentalFlag = keyof typeof EXPERIMENTAL_FLAGS;

/** Read the current persisted value for a flag. */
function readFlag(flag: ExperimentalFlag): boolean {
  return localStorage.getItem(EXPERIMENTAL_FLAGS[flag]) === "true";
}

/**
 * Subscribe to an experimental flag's value. Returns the current state and a
 * setter that persists to localStorage. Stays in sync across components (and
 * other windows) via the `storage` event and a same-window custom event.
 */
export function useExperimentalFlag(
  flag: ExperimentalFlag,
): [enabled: boolean, setEnabled: (value: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => readFlag(flag));

  useEffect(() => {
    const storageKey = EXPERIMENTAL_FLAGS[flag];
    const sync = () => setEnabled(readFlag(flag));

    // Cross-window updates (localStorage `storage` only fires in *other* tabs).
    window.addEventListener("storage", sync);
    // Same-window updates from the setter below.
    window.addEventListener("gamelord:experimental-change", sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("gamelord:experimental-change", sync);
    };
  }, [flag]);

  const setFlag = useCallback(
    (value: boolean) => {
      localStorage.setItem(EXPERIMENTAL_FLAGS[flag], String(value));
      window.dispatchEvent(new Event("gamelord:experimental-change"));
      setEnabled(value);
    },
    [flag],
  );

  return [enabled, setFlag];
}
