import { useEffect, useRef, useCallback, useState } from 'react'
import {
  UI_BUTTON_MAPPING,
  REPEATABLE_ACTIONS,
  REPEAT_INITIAL_DELAY,
  REPEAT_INTERVAL,
  type UIAction,
} from '../lib/gamepad/ui-mappings'
import { ANALOG_DEADZONE } from '../lib/gamepad/mappings'

interface UseGamepadUIOptions {
  /** Whether gamepad polling is active. False when a game is running. */
  enabled: boolean
  /** Callback fired on UI action press. */
  onAction: (action: UIAction) => void
}

interface ButtonRepeatState {
  /** The action currently being held, or null. */
  action: UIAction | null
  /** Timestamp when the button was first pressed. */
  pressedAt: number
  /** Timestamp of the last repeat fire. */
  lastRepeatAt: number
}

/**
 * Polls connected gamepads and fires abstract UI actions for library navigation.
 *
 * Modeled on the existing `useGamepad` hook (rAF polling, transition-only
 * detection, ref-stabilized callbacks), but outputs UI actions instead of
 * IPC calls to the emulation worker.
 *
 * Implements D-pad repeat: when a navigation direction is held, fires once
 * immediately, then after REPEAT_INITIAL_DELAY, then every REPEAT_INTERVAL.
 */
export function useGamepadUI({
  enabled,
  onAction,
}: UseGamepadUIOptions): { connectedCount: number } {
  const [connectedCount, setConnectedCount] = useState(0)
  const previousButtonsRef = useRef<Map<number, boolean[]>>(new Map())
  const previousAnalogRef = useRef<Map<number, [boolean, boolean, boolean, boolean]>>(new Map())
  const animationFrameRef = useRef<number | null>(null)
  const onActionRef = useRef(onAction)
  const repeatRef = useRef<ButtonRepeatState>({
    action: null,
    pressedAt: 0,
    lastRepeatAt: 0,
  })

  useEffect(() => {
    onActionRef.current = onAction
  }, [onAction])

  /** Analog stick direction indices → UI actions */
  const ANALOG_ACTIONS: UIAction[] = [
    'navigate-up',
    'navigate-down',
    'navigate-left',
    'navigate-right',
  ]

  const pollGamepads = useCallback(() => {
    const gamepads = navigator.getGamepads()
    const now = performance.now()

    for (let gi = 0; gi < gamepads.length && gi < 2; gi++) {
      const gamepad = gamepads[gi]
      if (!gamepad || gamepad.mapping !== 'standard') continue

      // Initialize previous state if needed
      if (!previousButtonsRef.current.has(gi)) {
        previousButtonsRef.current.set(
          gi,
          new Array(gamepad.buttons.length).fill(false),
        )
      }
      if (!previousAnalogRef.current.has(gi)) {
        previousAnalogRef.current.set(gi, [false, false, false, false])
      }

      const prevButtons = previousButtonsRef.current.get(gi)!
      const prevAnalog = previousAnalogRef.current.get(gi)!

      // Poll digital buttons
      for (
        let bi = 0;
        bi < gamepad.buttons.length && bi < UI_BUTTON_MAPPING.length;
        bi++
      ) {
        const action = UI_BUTTON_MAPPING[bi]
        if (action === null) continue

        const pressed = gamepad.buttons[bi].pressed
        if (pressed !== prevButtons[bi]) {
          prevButtons[bi] = pressed

          if (pressed) {
            onActionRef.current(action)

            // Start repeat tracking for navigation actions
            if (REPEATABLE_ACTIONS.has(action)) {
              repeatRef.current = {
                action,
                pressedAt: now,
                lastRepeatAt: now,
              }
            }
          } else {
            // Clear repeat if the released button matches the repeating action
            if (repeatRef.current.action === action) {
              repeatRef.current.action = null
            }
          }
        }
      }

      // Poll left analog stick for d-pad emulation
      const lx = gamepad.axes[0] ?? 0
      const ly = gamepad.axes[1] ?? 0

      const stickDirs: [boolean, boolean, boolean, boolean] = [
        ly < -ANALOG_DEADZONE,  // up
        ly > ANALOG_DEADZONE,   // down
        lx < -ANALOG_DEADZONE,  // left
        lx > ANALOG_DEADZONE,   // right
      ]

      const DPAD_BUTTON_START = 12

      for (let di = 0; di < 4; di++) {
        if (stickDirs[di] !== prevAnalog[di]) {
          prevAnalog[di] = stickDirs[di]

          // Skip if physical d-pad is already pressed for this direction
          const physicalPressed =
            gamepad.buttons[DPAD_BUTTON_START + di]?.pressed ?? false
          if (physicalPressed) continue

          const action = ANALOG_ACTIONS[di]

          if (stickDirs[di]) {
            onActionRef.current(action)

            if (REPEATABLE_ACTIONS.has(action)) {
              repeatRef.current = {
                action,
                pressedAt: now,
                lastRepeatAt: now,
              }
            }
          } else {
            if (repeatRef.current.action === action) {
              repeatRef.current.action = null
            }
          }
        }
      }
    }

    // Handle D-pad repeat
    const repeat = repeatRef.current
    if (repeat.action !== null) {
      const now2 = performance.now()
      const elapsed = now2 - repeat.pressedAt

      if (elapsed >= REPEAT_INITIAL_DELAY) {
        const sinceLast = now2 - repeat.lastRepeatAt
        if (sinceLast >= REPEAT_INTERVAL) {
          onActionRef.current(repeat.action)
          repeat.lastRepeatAt = now2
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(pollGamepads)
  }, [])

  /**
   * Starts the rAF polling loop. Safe to call when already running.
   * Clears stale button state so held buttons from a previous session
   * don't fire phantom actions.
   */
  const startPolling = useCallback(() => {
    if (animationFrameRef.current !== null) return
    // Reset previous state so buttons held during game mode don't fire
    // as transitions when polling resumes.
    previousButtonsRef.current.clear()
    previousAnalogRef.current.clear()
    repeatRef.current.action = null
    animationFrameRef.current = requestAnimationFrame(pollGamepads)
  }, [pollGamepads])

  /** Stops the rAF polling loop. Safe to call when already stopped. */
  const stopPolling = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    repeatRef.current.action = null
  }, [])

  // Start/stop the rAF loop when `enabled` changes.
  useEffect(() => {
    if (enabled) {
      startPolling()
    } else {
      stopPolling()
    }
  }, [enabled, startPolling, stopPolling])

  useEffect(() => {
    const handleConnect = () => {
      setConnectedCount((c) => c + 1)
    }

    const handleDisconnect = (event: GamepadEvent) => {
      const port = event.gamepad.index
      previousButtonsRef.current.delete(port)
      previousAnalogRef.current.delete(port)
      repeatRef.current.action = null
      setConnectedCount((c) => Math.max(0, c - 1))
    }

    window.addEventListener('gamepadconnected', handleConnect)
    window.addEventListener('gamepaddisconnected', handleDisconnect)

    // Detect already-connected gamepads
    const existing = navigator.getGamepads()
    let count = 0
    for (const gp of existing) {
      if (gp) count++
    }
    if (count > 0) setConnectedCount(count)

    return () => {
      window.removeEventListener('gamepadconnected', handleConnect)
      window.removeEventListener('gamepaddisconnected', handleDisconnect)
      stopPolling()
    }
  }, [pollGamepads, stopPolling])

  return { connectedCount }
}
