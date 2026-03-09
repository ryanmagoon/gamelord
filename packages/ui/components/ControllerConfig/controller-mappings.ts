import {
  LIBRETRO_BUTTON,
  STANDARD_GAMEPAD_MAPPING,
} from "../../gamepad/mappings";

/**
 * Controller type detected from the Gamepad API `id` string.
 * Used to show appropriate button glyphs and labels.
 */
export type ControllerType = "xbox" | "playstation" | "generic";

/** A single button binding: which gamepad button index maps to which libretro button. */
export interface ButtonBinding {
  /** Libretro button ID (RETRO_DEVICE_ID_JOYPAD_*) */
  retroId: number;
  /** Human-readable name for display */
  label: string;
  /** W3C Standard Gamepad button index (0-15), or null if unbound */
  gamepadButtonIndex: number | null;
}

/** Complete mapping for a controller: an ordered list of button bindings. */
export interface ControllerMapping {
  bindings: Array<ButtonBinding>;
}

/** Info about a connected controller for display. */
export interface ConnectedController {
  /** Gamepad API index (0-3) */
  index: number;
  /** Raw Gamepad API `id` string */
  id: string;
  /** Detected controller type */
  type: ControllerType;
  /** Friendly display name */
  name: string;
  /** Whether the controller is currently connected */
  connected: boolean;
}

/** Libretro buttons in a user-friendly display order. */
const BUTTON_ORDER: Array<{ retroId: number; label: string }> = [
  { retroId: LIBRETRO_BUTTON.UP, label: "D-Pad Up" },
  { retroId: LIBRETRO_BUTTON.DOWN, label: "D-Pad Down" },
  { retroId: LIBRETRO_BUTTON.LEFT, label: "D-Pad Left" },
  { retroId: LIBRETRO_BUTTON.RIGHT, label: "D-Pad Right" },
  { retroId: LIBRETRO_BUTTON.A, label: "A" },
  { retroId: LIBRETRO_BUTTON.B, label: "B" },
  { retroId: LIBRETRO_BUTTON.X, label: "X" },
  { retroId: LIBRETRO_BUTTON.Y, label: "Y" },
  { retroId: LIBRETRO_BUTTON.L, label: "L" },
  { retroId: LIBRETRO_BUTTON.R, label: "R" },
  { retroId: LIBRETRO_BUTTON.L2, label: "L2" },
  { retroId: LIBRETRO_BUTTON.R2, label: "R2" },
  { retroId: LIBRETRO_BUTTON.L3, label: "L3" },
  { retroId: LIBRETRO_BUTTON.R3, label: "R3" },
  { retroId: LIBRETRO_BUTTON.SELECT, label: "Select" },
  { retroId: LIBRETRO_BUTTON.START, label: "Start" },
];

/**
 * Detect controller type from the Gamepad API `id` string.
 * The id contains vendor/product info that identifies the manufacturer.
 */
export function detectControllerType(gamepadId: string): ControllerType {
  const lower = gamepadId.toLowerCase();

  if (
    lower.includes("xbox") ||
    lower.includes("xinput") ||
    lower.includes("045e") // Microsoft vendor ID
  ) {
    return "xbox";
  }

  if (
    lower.includes("playstation") ||
    lower.includes("dualsense") ||
    lower.includes("dualshock") ||
    lower.includes("054c") // Sony vendor ID
  ) {
    return "playstation";
  }

  return "generic";
}

/**
 * Get a friendly display name for a controller from its Gamepad API `id`.
 * Extracts the meaningful part, stripping vendor/product hex codes.
 */
export function getControllerDisplayName(gamepadId: string): string {
  // The id format varies by browser, e.g.:
  // Chrome: "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)"
  // Firefox: "045e-02fd-Xbox Wireless Controller"
  // Try to extract the human-readable part
  const parenIndex = gamepadId.indexOf("(");
  if (parenIndex > 0) {
    return gamepadId.slice(0, parenIndex).trim();
  }

  // Firefox format: strip leading vendor-product prefix
  const match = /^\w{4}-\w{4}-(.+)$/.exec(gamepadId);
  if (match) {
    return match[1].trim();
  }

  return gamepadId;
}

/**
 * Get the appropriate button glyph/label for a controller type.
 * Returns the button name as it appears on that controller.
 */
export function getButtonLabel(retroId: number, controllerType: ControllerType): string {
  if (controllerType === "playstation") {
    const psLabels: Record<number, string> = {
      [LIBRETRO_BUTTON.A]: "Cross",
      [LIBRETRO_BUTTON.B]: "Circle",
      [LIBRETRO_BUTTON.X]: "Square",
      [LIBRETRO_BUTTON.Y]: "Triangle",
      [LIBRETRO_BUTTON.L]: "L1",
      [LIBRETRO_BUTTON.R]: "R1",
      [LIBRETRO_BUTTON.SELECT]: "Share",
      [LIBRETRO_BUTTON.START]: "Options",
    };
    return psLabels[retroId] ?? getDefaultButtonLabel(retroId);
  }

  if (controllerType === "xbox") {
    const xboxLabels: Record<number, string> = {
      [LIBRETRO_BUTTON.SELECT]: "View",
      [LIBRETRO_BUTTON.START]: "Menu",
    };
    return xboxLabels[retroId] ?? getDefaultButtonLabel(retroId);
  }

  return getDefaultButtonLabel(retroId);
}

function getDefaultButtonLabel(retroId: number): string {
  const entry = BUTTON_ORDER.find((b) => b.retroId === retroId);
  return entry?.label ?? `Button ${retroId}`;
}

/**
 * W3C Standard Gamepad button index labels.
 * Used to show which physical button is bound.
 */
const GAMEPAD_BUTTON_LABELS: Array<string> = [
  "A / Cross", // 0
  "B / Circle", // 1
  "X / Square", // 2
  "Y / Triangle", // 3
  "LB / L1", // 4
  "RB / R1", // 5
  "LT / L2", // 6
  "RT / R2", // 7
  "Back / Share", // 8
  "Start / Options", // 9
  "L3", // 10
  "R3", // 11
  "D-Pad Up", // 12
  "D-Pad Down", // 13
  "D-Pad Left", // 14
  "D-Pad Right", // 15
];

/** Get a human-readable label for a W3C gamepad button index. */
export function getGamepadButtonLabel(buttonIndex: number): string {
  return GAMEPAD_BUTTON_LABELS[buttonIndex] ?? `Button ${buttonIndex}`;
}

/** Build the default mapping from the existing STANDARD_GAMEPAD_MAPPING. */
export function getDefaultMapping(): ControllerMapping {
  const bindings: Array<ButtonBinding> = BUTTON_ORDER.map(({ retroId, label }) => {
    // Find which gamepad button maps to this retroId in the standard mapping
    const gamepadButtonIndex = STANDARD_GAMEPAD_MAPPING.indexOf(retroId);
    return {
      retroId,
      label,
      gamepadButtonIndex: gamepadButtonIndex >= 0 ? gamepadButtonIndex : null,
    };
  });
  return { bindings };
}

/** localStorage key for persisted controller mappings. */
function getMappingStorageKey(controllerId: string): string {
  return `gamelord:controller-mapping:${controllerId}`;
}

/** Load a saved mapping from localStorage, or return null if none exists. */
export function loadMapping(controllerId: string): ControllerMapping | null {
  const stored = localStorage.getItem(getMappingStorageKey(controllerId));
  if (!stored) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "bindings" in parsed &&
      Array.isArray((parsed as ControllerMapping).bindings)
    ) {
      return parsed as ControllerMapping;
    }
  } catch {
    // Invalid JSON, ignore
  }
  return null;
}

/** Save a mapping to localStorage keyed by controller id. */
export function saveMapping(controllerId: string, mapping: ControllerMapping): void {
  localStorage.setItem(getMappingStorageKey(controllerId), JSON.stringify(mapping));
}

/** Remove a saved mapping from localStorage. */
export function clearMapping(controllerId: string): void {
  localStorage.removeItem(getMappingStorageKey(controllerId));
}

/**
 * Convert a ControllerMapping to the array format used by useGamepad
 * (index = gamepad button index, value = libretro ID or null).
 */
export function mappingToArray(mapping: ControllerMapping): Array<number | null> {
  // Start with all nulls for 16 standard buttons
  const result: Array<number | null> = new Array(16).fill(null);
  for (const binding of mapping.bindings) {
    if (binding.gamepadButtonIndex !== null && binding.gamepadButtonIndex < 16) {
      result[binding.gamepadButtonIndex] = binding.retroId;
    }
  }
  return result;
}

/** Re-export for convenience. */
export { LIBRETRO_BUTTON, STANDARD_GAMEPAD_MAPPING };
export { BUTTON_ORDER };
