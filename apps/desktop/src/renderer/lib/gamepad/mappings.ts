/**
 * Libretro joypad button IDs matching RETRO_DEVICE_ID_JOYPAD_* from libretro.h.
 */
export const LIBRETRO_BUTTON = {
  B: 0,
  Y: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
  L2: 12,
  R2: 13,
  L3: 14,
  R3: 15,
} as const

/**
 * Maps W3C Standard Gamepad API button indices to libretro joypad button IDs.
 * Array index = Gamepad API button index, value = libretro button ID.
 *
 * The W3C standard mapping uses Xbox positional layout:
 *   buttons[0] = A (bottom face)  -> libretro A (8)
 *   buttons[1] = B (right face)   -> libretro B (0)
 *   buttons[2] = X (left face)    -> libretro X (9)
 *   buttons[3] = Y (top face)     -> libretro Y (1)
 *
 * This works correctly with 8BitDo SN30 Pro in XInput mode and any
 * controller reporting mapping: "standard".
 */
export const STANDARD_GAMEPAD_MAPPING: (number | null)[] = [
  LIBRETRO_BUTTON.A,      // buttons[0]  - A / Cross (bottom face)
  LIBRETRO_BUTTON.B,      // buttons[1]  - B / Circle (right face)
  LIBRETRO_BUTTON.X,      // buttons[2]  - X / Square (left face)
  LIBRETRO_BUTTON.Y,      // buttons[3]  - Y / Triangle (top face)
  LIBRETRO_BUTTON.L,      // buttons[4]  - Left bumper
  LIBRETRO_BUTTON.R,      // buttons[5]  - Right bumper
  LIBRETRO_BUTTON.L2,     // buttons[6]  - Left trigger
  LIBRETRO_BUTTON.R2,     // buttons[7]  - Right trigger
  LIBRETRO_BUTTON.SELECT, // buttons[8]  - Select / Back
  LIBRETRO_BUTTON.START,  // buttons[9]  - Start / Forward
  LIBRETRO_BUTTON.L3,     // buttons[10] - Left stick press
  LIBRETRO_BUTTON.R3,     // buttons[11] - Right stick press
  LIBRETRO_BUTTON.UP,     // buttons[12] - D-pad up
  LIBRETRO_BUTTON.DOWN,   // buttons[13] - D-pad down
  LIBRETRO_BUTTON.LEFT,   // buttons[14] - D-pad left
  LIBRETRO_BUTTON.RIGHT,  // buttons[15] - D-pad right
]

/** Deadzone threshold for analog stick to digital d-pad conversion. */
export const ANALOG_DEADZONE = 0.5
