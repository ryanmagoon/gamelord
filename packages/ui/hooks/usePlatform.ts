/**
 * Detect whether the current platform is macOS.
 * Works in both browser (navigator) and SSR/Storybook environments.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  // navigator.platform is deprecated but universally supported;
  // navigator.userAgentData is the modern replacement but not yet in all browsers.
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/** Returns the platform-appropriate modifier key label ("⌘" on macOS, "Ctrl" elsewhere). */
export function modifierKey(): string {
  return isMacPlatform() ? "⌘" : "Ctrl+";
}
