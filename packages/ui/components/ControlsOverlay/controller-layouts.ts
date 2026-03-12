/**
 * A single keyboard binding: the keyboard key and the controller button it maps to.
 * This is the prop contract for ControlsOverlay — the parent derives these from
 * the actual KEY_MAP used by the emulator.
 */
export interface KeyboardBinding {
  /** Keyboard key (e.g. "Z", "ArrowUp", "Enter") */
  key: string;
  /** Human-readable button label (e.g. "A", "D-Pad Up", "Start") */
  label: string;
}

/**
 * Display-friendly key label for keyboard keys.
 * Converts code-style key names to readable labels.
 */
export function formatKeyLabel(key: string): string {
  switch (key) {
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case " ":
      return "Space";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

/** D-pad direction labels for grouping. */
const DPAD_LABELS = new Set(["D-Pad Up", "D-Pad Down", "D-Pad Left", "D-Pad Right"]);

/** Check if a binding is a D-pad direction. */
export function isDPadBinding(binding: KeyboardBinding): boolean {
  return DPAD_LABELS.has(binding.label);
}
