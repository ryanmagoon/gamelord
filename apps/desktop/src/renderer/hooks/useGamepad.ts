import { useEffect, useRef, useCallback, useState } from "react";
import {
  STANDARD_GAMEPAD_MAPPING,
  ANALOG_DEADZONE,
  LIBRETRO_BUTTON,
} from "../lib/gamepad/mappings";
import { loadMapping, mappingToArray, subscribeMappingChanges } from "@gamelord/ui";

interface UseGamepadOptions {
  /** Active emulator system, used to select its controller bindings. */
  systemId?: string;
  /** Function to send digital button state to the main process via IPC. */
  gameInput: (port: number, id: number, pressed: boolean) => void;
  /** Function to send analog axis values (sticks/triggers) to the main process via IPC. */
  gameInputAnalog?: (port: number, index: number, id: number, value: number) => void;
  /** Whether gamepad polling is active. Set false when paused or not in native mode. */
  enabled: boolean;
}

interface GamepadButtonState {
  /** Effective libretro inputs after combining every physical and analog source. */
  pressed: Set<number>;
  /** Reused scratch set to avoid allocating on each gameplay frame. */
  next: Set<number>;
}

const DPAD_RETRO_IDS = [
  LIBRETRO_BUTTON.UP,
  LIBRETRO_BUTTON.DOWN,
  LIBRETRO_BUTTON.LEFT,
  LIBRETRO_BUTTON.RIGHT,
] as const;

/**
 * Get the effective button mapping for a controller.
 * Checks localStorage for a user-customized mapping, falls back to the standard mapping.
 */
function getEffectiveMapping(gamepadId: string, systemId?: string): Array<number | null> {
  const saved = loadMapping(gamepadId, systemId);
  if (saved) {
    return mappingToArray(saved);
  }
  return STANDARD_GAMEPAD_MAPPING;
}

/**
 * Polls connected gamepads via the browser Gamepad API and forwards button
 * state changes through the existing `gameInput()` IPC pipeline.
 *
 * Only processes gamepads with `mapping === "standard"` (W3C standard layout).
 * Gamepad index maps directly to libretro port (0 or 1, max 2 players).
 * Left analog stick is converted to digital d-pad input using a deadzone.
 *
 * Respects user-customized button mappings saved from the Settings > Controllers panel.
 *
 * @returns The number of currently connected gamepads for UI display.
 */
export function useGamepad({ gameInput, gameInputAnalog, enabled, systemId }: UseGamepadOptions): {
  connectedCount: number;
} {
  const [connectedCount, setConnectedCount] = useState(0);
  const previousStatesRef = useRef<Map<number, GamepadButtonState>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const systemIdRef = useRef(systemId);
  const waitForNeutral = useRef(false);
  const mappingNeutralPortsRef = useRef(new Set<number>());
  /** Cached mappings per gamepad index to avoid reading localStorage every frame. */
  const mappingCacheRef = useRef<Map<number, Array<number | null>>>(new Map());

  // Stable refs for input callbacks to avoid restarting the polling loop on every render
  const gameInputRef = useRef(gameInput);
  useEffect(() => {
    gameInputRef.current = gameInput;
  }, [gameInput]);

  const gameInputAnalogRef = useRef(gameInputAnalog);
  useEffect(() => {
    gameInputAnalogRef.current = gameInputAnalog;
  }, [gameInputAnalog]);

  const releaseAllInputs = useCallback((port: number) => {
    const previousState = previousStatesRef.current.get(port);
    if (!previousState || port >= 2) {
      return;
    }

    for (const retroId of previousState.pressed) {
      gameInputRef.current(port, retroId, false);
    }

    for (const stick of [0, 1]) {
      for (const axis of [0, 1]) {
        gameInputAnalogRef.current?.(port, stick, axis, 0);
      }
    }
    previousStatesRef.current.delete(port);
  }, []);

  useEffect(() => {
    if (systemIdRef.current === systemId) {
      return;
    }
    systemIdRef.current = systemId;
    for (const port of previousStatesRef.current.keys()) {
      releaseAllInputs(port);
    }
    mappingCacheRef.current.clear();
    mappingNeutralPortsRef.current.clear();
    waitForNeutral.current = true;
  }, [systemId, releaseAllInputs]);

  // Keep ref in sync so the rAF loop reads the latest value without restarting
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      waitForNeutral.current = true;
      for (const port of previousStatesRef.current.keys()) {
        releaseAllInputs(port);
      }
      previousStatesRef.current.clear();
    }
  }, [enabled, releaseAllInputs]);

  const pollGamepads = useCallback(() => {
    if (enabledRef.current) {
      const gamepads = navigator.getGamepads();
      if (waitForNeutral.current) {
        const held = Array.from(gamepads).some(
          (pad) =>
            pad &&
            pad.index < 2 &&
            (pad.buttons.some((button) => button.pressed) ||
              pad.axes.some((axis) => Math.abs(axis) > ANALOG_DEADZONE)),
        );
        if (held) {
          animationFrameRef.current = requestAnimationFrame(pollGamepads);
          return;
        }
        waitForNeutral.current = false;
      }

      for (
        let gamepadIndex = 0;
        gamepadIndex < gamepads.length && gamepadIndex < 2;
        gamepadIndex++
      ) {
        const gamepad = gamepads[gamepadIndex];
        if (!gamepad) {
          continue;
        }
        if (gamepad.mapping !== "standard") {
          continue;
        }

        const port = gamepadIndex;
        if (mappingNeutralPortsRef.current.has(port)) {
          if (
            gamepad.buttons.some((button) => button.pressed) ||
            gamepad.axes.some((axis) => Math.abs(axis) > ANALOG_DEADZONE)
          ) {
            continue;
          }
          mappingNeutralPortsRef.current.delete(port);
        }

        // Load/cache effective mapping for this controller
        if (!mappingCacheRef.current.has(gamepadIndex)) {
          mappingCacheRef.current.set(
            gamepadIndex,
            getEffectiveMapping(gamepad.id, systemIdRef.current),
          );
        }
        const mapping = mappingCacheRef.current.get(gamepadIndex) ?? STANDARD_GAMEPAD_MAPPING;

        let state = previousStatesRef.current.get(gamepadIndex);
        if (!state) {
          state = { pressed: new Set(), next: new Set() };
          previousStatesRef.current.set(gamepadIndex, state);
        }
        const next = state.next;
        next.clear();
        let rightStickButtonX = 0;
        let rightStickButtonY = 0;
        for (
          let buttonIndex = 0;
          buttonIndex < gamepad.buttons.length && buttonIndex < mapping.length;
          buttonIndex++
        ) {
          const retroId = mapping[buttonIndex];
          if (retroId !== null && gamepad.buttons[buttonIndex].pressed) {
            // N64 C-button targets are analog right-stick directions, never joypad IDs.
            if (systemIdRef.current === "n64" && retroId >= 16 && retroId <= 19) {
              if (retroId === 16) {
                rightStickButtonY -= 1;
              }
              if (retroId === 17) {
                rightStickButtonY += 1;
              }
              if (retroId === 18) {
                rightStickButtonX -= 1;
              }
              if (retroId === 19) {
                rightStickButtonX += 1;
              }
            } else if (retroId < 16) {
              next.add(retroId);
            }
          }
        }

        const leftStickX = gamepad.axes[0] ?? 0;
        const leftStickY = gamepad.axes[1] ?? 0;
        const stickDirections = [
          leftStickY < -ANALOG_DEADZONE,
          leftStickY > ANALOG_DEADZONE,
          leftStickX < -ANALOG_DEADZONE,
          leftStickX > ANALOG_DEADZONE,
        ];
        for (let direction = 0; direction < 4; direction++) {
          if (stickDirections[direction]) {
            next.add(DPAD_RETRO_IDS[direction]);
          }
        }

        // A libretro input stays held while ANY mapped button or stick owns it.
        // Compare the combined result, never independent source transitions.
        for (const retroId of state.pressed) {
          if (!next.has(retroId)) {
            gameInputRef.current(port, retroId, false);
          }
        }
        for (const retroId of next) {
          if (!state.pressed.has(retroId)) {
            gameInputRef.current(port, retroId, true);
          }
        }
        state.next = state.pressed;
        state.pressed = next;

        // Send raw analog stick values for cores that need them (e.g. Dolphin)
        if (gameInputAnalogRef.current) {
          const analogFn = gameInputAnalogRef.current;

          // Left stick (index 0): axes 0=X, 1=Y
          const lx = Math.round((gamepad.axes[0] ?? 0) * 32_767);
          const ly = Math.round((gamepad.axes[1] ?? 0) * 32_767);
          analogFn(port, 0, 0, lx); // left stick X
          analogFn(port, 0, 1, ly); // left stick Y

          // Right stick (index 1): axes 2=X, 3=Y
          const rx = Math.round(
            Math.max(-1, Math.min(1, (gamepad.axes[2] ?? 0) + rightStickButtonX)) * 32_767,
          );
          const ry = Math.round(
            Math.max(-1, Math.min(1, (gamepad.axes[3] ?? 0) + rightStickButtonY)) * 32_767,
          );
          analogFn(port, 1, 0, rx); // right stick X
          analogFn(port, 1, 1, ry); // right stick Y
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(pollGamepads);
  }, []);

  useEffect(() => {
    const unsubscribeMappingChanges = subscribeMappingChanges((controllerId, changedSystemId) => {
      if (changedSystemId !== undefined && changedSystemId !== systemIdRef.current) {
        return;
      }
      for (const gamepad of navigator.getGamepads()) {
        if (
          !gamepad ||
          gamepad.index >= 2 ||
          (controllerId !== null && gamepad.id !== controllerId)
        ) {
          continue;
        }
        const port = gamepad.index;
        // Release using the old mapping before invalidating it. Held physical input
        // must return to neutral before it can press anything under the new mapping.
        releaseAllInputs(port);
        mappingCacheRef.current.delete(port);
        if (
          gamepad.buttons.some((button) => button.pressed) ||
          gamepad.axes.some((axis) => Math.abs(axis) > ANALOG_DEADZONE)
        ) {
          mappingNeutralPortsRef.current.add(port);
        } else {
          mappingNeutralPortsRef.current.delete(port);
        }
      }
    });
    const handleConnect = (event: GamepadEvent) => {
      // Invalidate mapping cache so new mapping is loaded for this controller
      mappingCacheRef.current.delete(event.gamepad.index);
      mappingNeutralPortsRef.current.delete(event.gamepad.index);
      setConnectedCount((count) => count + 1);
    };

    const handleDisconnect = (event: GamepadEvent) => {
      const port = event.gamepad.index;
      if (port < 2) {
        releaseAllInputs(port);
      }
      mappingCacheRef.current.delete(port);
      mappingNeutralPortsRef.current.delete(port);
      setConnectedCount((count) => Math.max(0, count - 1));
    };

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    // Start the polling loop
    animationFrameRef.current = requestAnimationFrame(pollGamepads);

    // Detect gamepads that were already connected before this hook mounted
    const existingGamepads = navigator.getGamepads();
    let initialCount = 0;
    for (const gamepad of existingGamepads) {
      if (gamepad) {
        initialCount++;
      }
    }
    if (initialCount > 0) {
      setConnectedCount(initialCount);
    }

    return () => {
      unsubscribeMappingChanges();
      mappingNeutralPortsRef.current.clear();
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Release digital buttons and analog axes on unmount
      for (const port of previousStatesRef.current.keys()) {
        releaseAllInputs(port);
      }
      previousStatesRef.current.clear();
      mappingCacheRef.current.clear();
    };
  }, [pollGamepads, releaseAllInputs]);

  return { connectedCount };
}
