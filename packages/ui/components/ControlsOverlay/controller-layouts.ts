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
  /** Libretro joypad button ID (e.g. 8 for A, 0 for B). Used for system filtering. */
  retroId: number;
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

/** Shoulder button labels. */
const SHOULDER_LABELS = new Set(["L", "R"]);

/** Check if a binding is a shoulder button. */
export function isShoulderBinding(binding: KeyboardBinding): boolean {
  return SHOULDER_LABELS.has(binding.label);
}

/** Center button labels (Select, Start). */
const CENTER_LABELS = new Set(["Select", "Start"]);

/** Check if a binding is a center button (Select/Start). */
export function isCenterBinding(binding: KeyboardBinding): boolean {
  return CENTER_LABELS.has(binding.label);
}

/** Check if a binding is a face button (single-letter labels like A, B, X, Y). */
export function isFaceBinding(binding: KeyboardBinding): boolean {
  return !isDPadBinding(binding) && !isShoulderBinding(binding) && !isCenterBinding(binding);
}

/**
 * Libretro button indices for reference:
 * B(0), Y(1), Select(2), Start(3), Up(4), Down(5), Left(6), Right(7),
 * A(8), X(9), L(10), R(11), L2(12), R2(13), L3(14), R3(15)
 */

/** Maps systemId → set of libretro button indices that the system's controller has. */
export const SYSTEM_BUTTONS: Record<string, ReadonlySet<number>> = {
  /* NES: D-pad, A, B, Select, Start */
  nes: new Set([0, 2, 3, 4, 5, 6, 7, 8]),
  /* Game Boy: same as NES */
  gb: new Set([0, 2, 3, 4, 5, 6, 7, 8]),
  /* SNES: all standard buttons */
  snes: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  /* GBA: D-pad, A, B, L, R, Select, Start (no X/Y) */
  gba: new Set([0, 2, 3, 4, 5, 6, 7, 8, 10, 11]),
  /* Genesis/Mega Drive: D-pad, A, B, C(→X), Start */
  genesis: new Set([0, 3, 4, 5, 6, 7, 8, 9]),
  /* Saturn: D-pad, A, B, X, Y, L, R, Start (no Select) */
  saturn: new Set([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  /* N64: D-pad, A, B, L, R, Start (no X/Y, no Select) */
  n64: new Set([0, 3, 4, 5, 6, 7, 8, 10, 11]),
  /* PS1: all standard buttons */
  psx: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  /* PSP: all standard buttons */
  psp: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  /* NDS: all standard buttons */
  nds: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  /* Arcade: all standard buttons */
  arcade: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
};

/** Fallback button set when systemId is unknown (shows all standard buttons). */
const ALL_STANDARD_BUTTONS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

/**
 * Filter bindings to only include buttons that exist on the given system's controller.
 * Falls back to showing all standard buttons for unknown systems or when systemId is undefined.
 */
export function filterBindingsForSystem(
  bindings: ReadonlyArray<KeyboardBinding>,
  systemId?: string,
): ReadonlyArray<KeyboardBinding> {
  if (!systemId) {
    return bindings;
  }
  const allowed = SYSTEM_BUTTONS[systemId] ?? ALL_STANDARD_BUTTONS;
  return bindings.filter((b) => allowed.has(b.retroId));
}
