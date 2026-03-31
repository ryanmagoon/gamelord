/**
 * Libretro joypad button IDs matching RETRO_DEVICE_ID_JOYPAD_* from libretro.h.
 */
export const LIBRETRO_BUTTON = {
  A: 8,
  B: 0,
  DOWN: 5,
  L: 10,
  L2: 12,
  L3: 14,
  LEFT: 6,
  R: 11,
  R2: 13,
  R3: 15,
  RIGHT: 7,
  SELECT: 2,
  START: 3,
  UP: 4,
  X: 9,
  Y: 1,
} as const;

/**
 * Maps W3C Standard Gamepad API button indices to libretro joypad button IDs.
 * Array index = Gamepad API button index, value = libretro button ID.
 *
 * The W3C standard mapping is positional (Xbox physical layout):
 *   buttons[0] = bottom face  -> libretro B (0)  = SNES B / PS Cross
 *   buttons[1] = right face   -> libretro A (8)  = SNES A / PS Circle
 *   buttons[2] = left face    -> libretro Y (1)  = SNES Y / PS Square
 *   buttons[3] = top face     -> libretro X (9)  = SNES X / PS Triangle
 *
 * Libretro uses SNES positional naming: B=bottom, A=right, Y=left, X=top.
 * The mapping must be by POSITION, not by name — Xbox A (bottom) maps to
 * libretro B (bottom), not libretro A (right).
 */
export const STANDARD_GAMEPAD_MAPPING: Array<number | null> = [
  LIBRETRO_BUTTON.B, // buttons[0]  - bottom face (Xbox A / PS Cross)
  LIBRETRO_BUTTON.A, // buttons[1]  - right face  (Xbox B / PS Circle)
  LIBRETRO_BUTTON.Y, // buttons[2]  - left face   (Xbox X / PS Square)
  LIBRETRO_BUTTON.X, // buttons[3]  - top face    (Xbox Y / PS Triangle)
  LIBRETRO_BUTTON.L, // buttons[4]  - Left bumper
  LIBRETRO_BUTTON.R, // buttons[5]  - Right bumper
  LIBRETRO_BUTTON.L2, // buttons[6]  - Left trigger
  LIBRETRO_BUTTON.R2, // buttons[7]  - Right trigger
  LIBRETRO_BUTTON.SELECT, // buttons[8]  - Select / Back
  LIBRETRO_BUTTON.START, // buttons[9]  - Start / Forward
  LIBRETRO_BUTTON.L3, // buttons[10] - Left stick press
  LIBRETRO_BUTTON.R3, // buttons[11] - Right stick press
  LIBRETRO_BUTTON.UP, // buttons[12] - D-pad up
  LIBRETRO_BUTTON.DOWN, // buttons[13] - D-pad down
  LIBRETRO_BUTTON.LEFT, // buttons[14] - D-pad left
  LIBRETRO_BUTTON.RIGHT, // buttons[15] - D-pad right
];

/** Deadzone threshold for analog stick to digital d-pad conversion. */
export const ANALOG_DEADZONE = 0.5;
