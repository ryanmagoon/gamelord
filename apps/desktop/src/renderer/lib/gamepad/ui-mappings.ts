/**
 * Abstract UI actions that can be triggered by a gamepad or keyboard.
 * These are decoupled from libretro button IDs — they drive focus
 * navigation and activation in the library UI.
 */
export type UIAction =
  | 'navigate-up'
  | 'navigate-down'
  | 'navigate-left'
  | 'navigate-right'
  | 'select'
  | 'back'
  | 'menu'
  | 'page-left'
  | 'page-right'

/**
 * Maps W3C Standard Gamepad API button indices to UI actions.
 * Array index = Gamepad API button index, value = UI action or null (unmapped).
 *
 * Layout follows the same Xbox positional convention as the libretro mapping:
 *   A (bottom face) = select/activate
 *   B (right face)  = back/close
 */
export const UI_BUTTON_MAPPING: (UIAction | null)[] = [
  'select',         // buttons[0]  - A / Cross (bottom face)
  'back',           // buttons[1]  - B / Circle (right face)
  null,             // buttons[2]  - X / Square
  null,             // buttons[3]  - Y / Triangle
  'page-left',      // buttons[4]  - Left bumper
  'page-right',     // buttons[5]  - Right bumper
  null,             // buttons[6]  - Left trigger
  null,             // buttons[7]  - Right trigger
  null,             // buttons[8]  - Select / Back
  'menu',           // buttons[9]  - Start / Forward
  null,             // buttons[10] - Left stick press
  null,             // buttons[11] - Right stick press
  'navigate-up',    // buttons[12] - D-pad up
  'navigate-down',  // buttons[13] - D-pad down
  'navigate-left',  // buttons[14] - D-pad left
  'navigate-right', // buttons[15] - D-pad right
]

/**
 * Maps keyboard keys to UI actions for testing and keyboard-only navigation.
 */
export const KEYBOARD_UI_MAPPING: Record<string, UIAction> = {
  ArrowUp: 'navigate-up',
  ArrowDown: 'navigate-down',
  ArrowLeft: 'navigate-left',
  ArrowRight: 'navigate-right',
  Enter: 'select',
  Escape: 'back',
}

/** Navigation actions that support D-pad repeat when held. */
export const REPEATABLE_ACTIONS = new Set<UIAction>([
  'navigate-up',
  'navigate-down',
  'navigate-left',
  'navigate-right',
])

/** Initial delay before D-pad repeat starts (ms). */
export const REPEAT_INITIAL_DELAY = 400

/** Interval between repeated D-pad actions when held (ms). */
export const REPEAT_INTERVAL = 120
