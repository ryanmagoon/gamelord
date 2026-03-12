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

/** Position as percentage offsets from the container's top-left. */
export interface BadgePosition {
  top: number;
  left: number;
}

/** Per-system controller layout definition. */
export interface ControllerLayout {
  /** Display name for the controller. */
  name: string;
  /** SVG viewBox dimensions. */
  viewBox: { width: number; height: number };
  /** SVG path data for the controller silhouette outline. */
  silhouettePath: string;
  /** Buttons present on this system and their spatial positions. */
  buttons: Partial<Record<Exclude<ControlButtonId, "dpad">, BadgePosition>>;
  /** Position of the D-pad cluster center. */
  dpadCenter: BadgePosition;
}

// ---------------------------------------------------------------------------
// SVG silhouette paths
// ---------------------------------------------------------------------------

const NES_PATH =
  "M 40 60 Q 40 40 60 40 L 340 40 Q 360 40 360 60 L 360 180 Q 360 200 340 200 L 60 200 Q 40 200 40 180 Z";

const SNES_PATH =
  "M 30 80 Q 20 80 15 70 L 10 50 Q 5 35 20 30 L 60 20 Q 80 15 100 20 L 300 20 Q 320 15 340 20 L 380 30 Q 395 35 390 50 L 385 70 Q 380 80 370 80 L 370 170 Q 370 200 340 210 L 260 220 Q 240 222 220 220 L 200 215 Q 195 215 180 220 Q 160 222 140 220 L 60 210 Q 30 200 30 170 Z";

const GENESIS_PATH =
  "M 25 90 Q 15 85 10 70 L 15 45 Q 20 30 40 25 L 90 20 Q 110 18 130 25 L 270 25 Q 290 18 310 20 L 360 25 Q 380 30 385 45 L 390 70 Q 385 85 375 90 L 365 160 Q 355 200 320 210 L 260 215 Q 240 217 230 210 L 200 195 Q 195 193 170 210 Q 160 217 140 215 L 80 210 Q 45 200 35 160 Z";

const GB_PATH =
  "M 80 20 Q 80 10 90 10 L 310 10 Q 320 10 320 20 L 320 250 Q 320 265 305 265 L 95 265 Q 80 265 80 250 Z M 110 30 L 110 120 L 290 120 L 290 30 Z";

const GBA_PATH =
  "M 20 60 Q 10 55 5 40 L 10 25 Q 15 15 30 12 L 100 8 Q 120 5 140 10 L 260 10 Q 280 5 300 8 L 370 12 Q 385 15 390 25 L 395 40 Q 390 55 380 60 L 375 150 Q 370 175 345 180 L 260 185 Q 220 187 200 182 Q 180 187 140 185 L 55 180 Q 30 175 25 150 Z M 100 25 L 100 95 L 300 95 L 300 25 Z";

const N64_PATH =
  "M 30 70 Q 20 60 15 45 L 20 30 Q 25 20 40 15 L 80 10 Q 100 8 115 15 L 145 35 Q 155 42 165 42 L 200 42 Q 195 55 195 75 L 195 160 Q 195 185 175 190 L 230 190 Q 210 185 210 160 L 210 75 Q 210 55 205 42 L 235 42 Q 245 42 255 35 L 285 15 Q 300 8 320 10 L 360 15 Q 375 20 380 30 L 385 45 Q 380 60 370 70 L 360 160 Q 350 200 315 210 L 275 215 Q 255 217 245 210 L 230 195 Q 225 192 200 195 L 175 210 Q 165 217 145 215 L 85 210 Q 50 200 40 160 Z";

const PSX_PATH =
  "M 35 70 Q 25 65 20 50 L 25 35 Q 30 25 45 20 L 90 15 Q 110 12 130 18 L 270 18 Q 290 12 310 15 L 355 20 Q 370 25 375 35 L 380 50 Q 375 65 365 70 L 355 110 Q 352 125 345 135 L 330 170 Q 320 195 290 205 L 260 210 Q 240 212 230 205 L 210 185 Q 200 180 190 185 L 170 205 Q 160 212 140 210 L 110 205 Q 80 195 70 170 L 55 135 Q 48 125 45 110 Z";

const PSP_PATH =
  "M 10 55 Q 5 45 8 35 L 15 22 Q 22 12 40 10 L 360 10 Q 378 12 385 22 L 392 35 Q 395 45 390 55 L 390 145 Q 395 155 392 165 L 385 178 Q 378 188 360 190 L 40 190 Q 22 188 15 178 L 8 165 Q 5 155 10 145 Z M 65 30 L 65 100 L 335 100 L 335 30 Z";

const NDS_PATH =
  "M 70 10 Q 70 5 75 5 L 325 5 Q 330 5 330 10 L 330 125 L 70 125 Z M 60 135 Q 55 135 55 140 L 55 270 Q 55 278 63 278 L 337 278 Q 345 278 345 270 L 345 140 Q 345 135 340 135 Z M 85 15 L 85 115 L 315 115 L 315 15 Z M 75 145 L 75 265 L 325 265 L 325 145 Z";

const SATURN_PATH =
  "M 20 85 Q 10 80 5 65 L 10 40 Q 18 25 35 20 L 95 12 Q 115 8 135 15 L 265 15 Q 285 8 305 12 L 365 20 Q 382 25 390 40 L 395 65 Q 390 80 380 85 L 370 155 Q 362 195 325 208 L 260 215 Q 238 218 225 208 L 205 190 Q 200 187 195 190 L 175 208 Q 162 218 140 215 L 75 208 Q 38 195 30 155 Z";

const ARCADE_PATH =
  "M 30 30 Q 30 15 45 15 L 355 15 Q 370 15 370 30 L 370 190 Q 370 205 355 205 L 45 205 Q 30 205 30 190 Z";

// ---------------------------------------------------------------------------
// Per-system layouts
// ---------------------------------------------------------------------------

const NES_LAYOUT: ControllerLayout = {
  name: "NES",
  viewBox: { width: 400, height: 240 },
  silhouettePath: NES_PATH,
  dpadCenter: { top: 50, left: 18 },
  buttons: {
    b: { top: 50, left: 72 },
    a: { top: 50, left: 84 },
    select: { top: 55, left: 42 },
    start: { top: 55, left: 55 },
  },
};

const GB_LAYOUT: ControllerLayout = {
  name: "Game Boy",
  viewBox: { width: 400, height: 280 },
  silhouettePath: GB_PATH,
  dpadCenter: { top: 65, left: 30 },
  buttons: {
    b: { top: 60, left: 65 },
    a: { top: 55, left: 77 },
    select: { top: 82, left: 40 },
    start: { top: 82, left: 55 },
  },
};

const SNES_LAYOUT: ControllerLayout = {
  name: "SNES",
  viewBox: { width: 400, height: 240 },
  silhouettePath: SNES_PATH,
  dpadCenter: { top: 50, left: 15 },
  buttons: {
    y: { top: 42, left: 78 },
    x: { top: 30, left: 70 },
    a: { top: 42, left: 90 },
    b: { top: 55, left: 78 },
    l: { top: 8, left: 12 },
    r: { top: 8, left: 85 },
    select: { top: 52, left: 42 },
    start: { top: 52, left: 56 },
  },
};

const GBA_LAYOUT: ControllerLayout = {
  name: "GBA",
  viewBox: { width: 400, height: 200 },
  silhouettePath: GBA_PATH,
  dpadCenter: { top: 65, left: 17 },
  buttons: {
    b: { top: 60, left: 75 },
    a: { top: 60, left: 87 },
    l: { top: 8, left: 10 },
    r: { top: 8, left: 87 },
    select: { top: 82, left: 40 },
    start: { top: 82, left: 55 },
  },
};

const GENESIS_LAYOUT: ControllerLayout = {
  name: "Genesis",
  viewBox: { width: 400, height: 240 },
  silhouettePath: GENESIS_PATH,
  dpadCenter: { top: 45, left: 16 },
  buttons: {
    a: { top: 48, left: 68 },
    b: { top: 42, left: 78 },
    x: { top: 36, left: 88 },
    start: { top: 20, left: 50 },
  },
};

const SATURN_LAYOUT: ControllerLayout = {
  name: "Saturn",
  viewBox: { width: 400, height: 240 },
  silhouettePath: SATURN_PATH,
  dpadCenter: { top: 48, left: 15 },
  buttons: {
    a: { top: 52, left: 68 },
    b: { top: 46, left: 78 },
    x: { top: 40, left: 88 },
    y: { top: 38, left: 68 },
    l: { top: 8, left: 12 },
    r: { top: 8, left: 85 },
    start: { top: 20, left: 50 },
  },
};

const N64_LAYOUT: ControllerLayout = {
  name: "N64",
  viewBox: { width: 400, height: 240 },
  silhouettePath: N64_PATH,
  dpadCenter: { top: 45, left: 12 },
  buttons: {
    a: { top: 35, left: 82 },
    b: { top: 52, left: 75 },
    l: { top: 6, left: 10 },
    r: { top: 6, left: 85 },
    start: { top: 28, left: 50 },
  },
};

const PSX_LAYOUT: ControllerLayout = {
  name: "PS1",
  viewBox: { width: 400, height: 230 },
  silhouettePath: PSX_PATH,
  dpadCenter: { top: 48, left: 15 },
  buttons: {
    y: { top: 30, left: 78 },
    x: { top: 42, left: 68 },
    a: { top: 42, left: 90 },
    b: { top: 55, left: 78 },
    l: { top: 8, left: 12 },
    r: { top: 8, left: 85 },
    select: { top: 50, left: 40 },
    start: { top: 50, left: 58 },
  },
};

const PSP_LAYOUT: ControllerLayout = {
  name: "PSP",
  viewBox: { width: 400, height: 200 },
  silhouettePath: PSP_PATH,
  dpadCenter: { top: 70, left: 10 },
  buttons: {
    y: { top: 58, left: 82 },
    x: { top: 70, left: 72 },
    a: { top: 70, left: 92 },
    b: { top: 82, left: 82 },
    l: { top: 8, left: 8 },
    r: { top: 8, left: 88 },
    select: { top: 85, left: 40 },
    start: { top: 85, left: 58 },
  },
};

const NDS_LAYOUT: ControllerLayout = {
  name: "NDS",
  viewBox: { width: 400, height: 285 },
  silhouettePath: NDS_PATH,
  dpadCenter: { top: 68, left: 22 },
  buttons: {
    y: { top: 58, left: 72 },
    x: { top: 52, left: 62 },
    a: { top: 58, left: 82 },
    b: { top: 65, left: 72 },
    l: { top: 45, left: 15 },
    r: { top: 45, left: 82 },
    select: { top: 82, left: 40 },
    start: { top: 82, left: 58 },
  },
};

const ARCADE_LAYOUT: ControllerLayout = {
  name: "Arcade",
  viewBox: { width: 400, height: 220 },
  silhouettePath: ARCADE_PATH,
  dpadCenter: { top: 50, left: 15 },
  buttons: {
    a: { top: 55, left: 55 },
    b: { top: 55, left: 68 },
    x: { top: 55, left: 81 },
    y: { top: 35, left: 55 },
    l: { top: 35, left: 68 },
    r: { top: 35, left: 81 },
    select: { top: 82, left: 42 },
    start: { top: 82, left: 58 },
  },
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
