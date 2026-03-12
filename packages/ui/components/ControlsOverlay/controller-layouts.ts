/** Button IDs used in the controls overlay. */
export type ControlButtonId = "dpad" | "a" | "b" | "x" | "y" | "l" | "r" | "select" | "start";

/** Keyboard key mapped to each button. */
export const KEYBOARD_KEYS: Record<ControlButtonId, string> = {
  dpad: "Arrow Keys",
  a: "Z",
  b: "X",
  x: "A",
  y: "S",
  l: "Q",
  r: "W",
  select: "Shift",
  start: "Enter",
};

/** Per-system controller layout definition. */
export interface ControllerLayout {
  /** Display name for the controller. */
  name: string;
  /** Which face/action buttons are present on this controller. */
  faceButtons: ReadonlyArray<Exclude<ControlButtonId, "dpad" | "l" | "r" | "select" | "start">>;
  /** Whether the controller has shoulder buttons (L/R). */
  hasShoulders: boolean;
  /** Whether the controller has a Select button. */
  hasSelect: boolean;
}

// ---------------------------------------------------------------------------
// Per-system layouts
// ---------------------------------------------------------------------------

const NES_LAYOUT: ControllerLayout = {
  name: "NES",
  faceButtons: ["b", "a"],
  hasShoulders: false,
  hasSelect: true,
};

const GB_LAYOUT: ControllerLayout = {
  name: "Game Boy",
  faceButtons: ["b", "a"],
  hasShoulders: false,
  hasSelect: true,
};

const SNES_LAYOUT: ControllerLayout = {
  name: "SNES",
  faceButtons: ["y", "x", "b", "a"],
  hasShoulders: true,
  hasSelect: true,
};

const GBA_LAYOUT: ControllerLayout = {
  name: "GBA",
  faceButtons: ["b", "a"],
  hasShoulders: true,
  hasSelect: true,
};

const GENESIS_LAYOUT: ControllerLayout = {
  name: "Genesis",
  faceButtons: ["a", "b", "x"],
  hasShoulders: false,
  hasSelect: false,
};

const SATURN_LAYOUT: ControllerLayout = {
  name: "Saturn",
  faceButtons: ["a", "b", "x", "y"],
  hasShoulders: true,
  hasSelect: false,
};

const N64_LAYOUT: ControllerLayout = {
  name: "N64",
  faceButtons: ["b", "a"],
  hasShoulders: true,
  hasSelect: false,
};

const PSX_LAYOUT: ControllerLayout = {
  name: "PS1",
  faceButtons: ["y", "x", "b", "a"],
  hasShoulders: true,
  hasSelect: true,
};

const PSP_LAYOUT: ControllerLayout = {
  name: "PSP",
  faceButtons: ["y", "x", "b", "a"],
  hasShoulders: true,
  hasSelect: true,
};

const NDS_LAYOUT: ControllerLayout = {
  name: "NDS",
  faceButtons: ["y", "x", "b", "a"],
  hasShoulders: true,
  hasSelect: true,
};

const ARCADE_LAYOUT: ControllerLayout = {
  name: "Arcade",
  faceButtons: ["a", "b", "x", "y"],
  hasShoulders: true,
  hasSelect: true,
};

// ---------------------------------------------------------------------------
// Layout registry
// ---------------------------------------------------------------------------

const CONTROLLER_LAYOUTS: Record<string, ControllerLayout> = {
  nes: NES_LAYOUT,
  gb: GB_LAYOUT,
  snes: SNES_LAYOUT,
  gba: GBA_LAYOUT,
  genesis: GENESIS_LAYOUT,
  saturn: SATURN_LAYOUT,
  n64: N64_LAYOUT,
  psx: PSX_LAYOUT,
  psp: PSP_LAYOUT,
  nds: NDS_LAYOUT,
  arcade: ARCADE_LAYOUT,
};

/** Returns the controller layout for a system, falling back to SNES for unknown systems. */
export function getControllerLayout(systemId: string | undefined): ControllerLayout {
  if (systemId && systemId in CONTROLLER_LAYOUTS) {
    return CONTROLLER_LAYOUTS[systemId];
  }
  return SNES_LAYOUT;
}
