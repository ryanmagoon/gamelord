import { useEffect, useRef, useCallback, useState } from 'react'
import {
  STANDARD_GAMEPAD_MAPPING,
  ANALOG_DEADZONE,
  LIBRETRO_BUTTON,
} from '../lib/gamepad/mappings'

interface UseGamepadOptions {
  /** Function to send input state to the main process via IPC. */
  gameInput: (port: number, id: number, pressed: boolean) => void
  /** Whether gamepad polling is active. Set false when paused or not in native mode. */
  enabled: boolean
}

interface GamepadButtonState {
  /** Tracked digital button states for change detection. Index = gamepad button index. */
  buttons: boolean[]
  /** Tracked analog stick d-pad states: [up, down, left, right]. */
  analogDpad: [boolean, boolean, boolean, boolean]
}

const DPAD_RETRO_IDS = [
  LIBRETRO_BUTTON.UP,
  LIBRETRO_BUTTON.DOWN,
  LIBRETRO_BUTTON.LEFT,
  LIBRETRO_BUTTON.RIGHT,
] as const

/**
 * Polls connected gamepads via the browser Gamepad API and forwards button
 * state changes through the existing `gameInput()` IPC pipeline.
 *
 * Only processes gamepads with `mapping === "standard"` (W3C standard layout).
 * Gamepad index maps directly to libretro port (0 or 1, max 2 players).
 * Left analog stick is converted to digital d-pad input using a deadzone.
 *
 * @returns The number of currently connected gamepads for UI display.
 */
export function useGamepad({ gameInput, enabled }: UseGamepadOptions): {
  connectedCount: number
} {
  const [connectedCount, setConnectedCount] = useState(0)
  const previousStatesRef = useRef<Map<number, GamepadButtonState>>(new Map())
  const animationFrameRef = useRef<number | null>(null)
  const enabledRef = useRef(enabled)

  // Keep ref in sync so the rAF loop reads the latest value without restarting
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  // Stable ref for gameInput to avoid restarting the polling loop on every render
  const gameInputRef = useRef(gameInput)
  useEffect(() => {
    gameInputRef.current = gameInput
  }, [gameInput])

  const releaseAllButtons = useCallback((port: number) => {
    const previousState = previousStatesRef.current.get(port)
    if (!previousState || port >= 2) return

    for (
      let buttonIndex = 0;
      buttonIndex < previousState.buttons.length &&
      buttonIndex < STANDARD_GAMEPAD_MAPPING.length;
      buttonIndex++
    ) {
      const retroId = STANDARD_GAMEPAD_MAPPING[buttonIndex]
      if (retroId !== null && previousState.buttons[buttonIndex]) {
        gameInputRef.current(port, retroId, false)
      }
    }

    for (let directionIndex = 0; directionIndex < 4; directionIndex++) {
      if (previousState.analogDpad[directionIndex]) {
        gameInputRef.current(port, DPAD_RETRO_IDS[directionIndex], false)
      }
    }

    previousStatesRef.current.delete(port)
  }, [])

  const pollGamepads = useCallback(() => {
    if (enabledRef.current) {
      const gamepads = navigator.getGamepads()

      for (
        let gamepadIndex = 0;
        gamepadIndex < gamepads.length && gamepadIndex < 2;
        gamepadIndex++
      ) {
        const gamepad = gamepads[gamepadIndex]
        if (!gamepad) continue
        if (gamepad.mapping !== 'standard') continue

        const port = gamepadIndex
        let previousState = previousStatesRef.current.get(gamepadIndex)
        if (!previousState) {
          previousState = {
            buttons: new Array(gamepad.buttons.length).fill(false),
            analogDpad: [false, false, false, false],
          }
          previousStatesRef.current.set(gamepadIndex, previousState)
        }

        // Poll digital buttons
        for (
          let buttonIndex = 0;
          buttonIndex < gamepad.buttons.length &&
          buttonIndex < STANDARD_GAMEPAD_MAPPING.length;
          buttonIndex++
        ) {
          const retroId = STANDARD_GAMEPAD_MAPPING[buttonIndex]
          if (retroId === null) continue

          const pressed = gamepad.buttons[buttonIndex].pressed
          if (pressed !== previousState.buttons[buttonIndex]) {
            previousState.buttons[buttonIndex] = pressed
            gameInputRef.current(port, retroId, pressed)
          }
        }

        // Poll left analog stick for d-pad emulation
        const leftStickX = gamepad.axes[0] ?? 0
        const leftStickY = gamepad.axes[1] ?? 0

        const stickDirections: [boolean, boolean, boolean, boolean] = [
          leftStickY < -ANALOG_DEADZONE, // up
          leftStickY > ANALOG_DEADZONE, // down
          leftStickX < -ANALOG_DEADZONE, // left
          leftStickX > ANALOG_DEADZONE, // right
        ]

        // D-pad button indices in the standard gamepad layout (12-15)
        const DPAD_BUTTON_START_INDEX = 12

        for (let directionIndex = 0; directionIndex < 4; directionIndex++) {
          if (
            stickDirections[directionIndex] !==
            previousState.analogDpad[directionIndex]
          ) {
            previousState.analogDpad[directionIndex] =
              stickDirections[directionIndex]

            // Only send analog d-pad input if the physical d-pad button
            // for this direction is not already pressed (avoid conflicts)
            const dpadButtonIndex = DPAD_BUTTON_START_INDEX + directionIndex
            const physicalDpadPressed =
              gamepad.buttons[dpadButtonIndex]?.pressed ?? false
            if (!physicalDpadPressed) {
              gameInputRef.current(
                port,
                DPAD_RETRO_IDS[directionIndex],
                stickDirections[directionIndex],
              )
            }
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(pollGamepads)
  }, [])

  useEffect(() => {
    const handleConnect = (_event: GamepadEvent) => {
      setConnectedCount((count) => count + 1)
    }

    const handleDisconnect = (event: GamepadEvent) => {
      const port = event.gamepad.index
      if (port < 2) {
        releaseAllButtons(port)
      }
      setConnectedCount((count) => Math.max(0, count - 1))
    }

    window.addEventListener('gamepadconnected', handleConnect)
    window.addEventListener('gamepaddisconnected', handleDisconnect)

    // Start the polling loop
    animationFrameRef.current = requestAnimationFrame(pollGamepads)

    // Detect gamepads that were already connected before this hook mounted
    const existingGamepads = navigator.getGamepads()
    let initialCount = 0
    for (const gamepad of existingGamepads) {
      if (gamepad) {
        initialCount++
      }
    }
    if (initialCount > 0) {
      setConnectedCount(initialCount)
    }

    return () => {
      window.removeEventListener('gamepadconnected', handleConnect)
      window.removeEventListener('gamepaddisconnected', handleDisconnect)
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      // Release all buttons on unmount
      for (const port of previousStatesRef.current.keys()) {
        releaseAllButtons(port)
      }
      previousStatesRef.current.clear()
    }
  }, [pollGamepads, releaseAllButtons])

  return { connectedCount }
}
