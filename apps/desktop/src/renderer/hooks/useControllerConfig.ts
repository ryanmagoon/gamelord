import { useState, useEffect, useRef, useCallback } from "react";
import {
  type ConnectedController,
  type ControllerMapping,
  detectControllerType,
  getControllerDisplayName,
  getDefaultMapping,
  loadMapping,
  saveMapping,
  clearMapping,
} from "@gamelord/ui";

interface UseControllerConfigResult {
  /** List of currently connected controllers. */
  controllers: Array<ConnectedController>;
  /** Mapping for the currently selected controller. */
  mapping: ControllerMapping;
  /** Index of the selected controller in the controllers array. */
  selectedControllerIndex: number;
  /** Select a different controller. */
  selectController: (index: number) => void;
  /** Live button pressed states (gamepad button index → pressed). */
  buttonStates: Record<number, boolean>;
  /** Live axis values. */
  axisValues: Array<number>;
  /** The retroId currently being remapped, or null. */
  remappingButton: number | null;
  /** Start remapping a button. */
  startRemap: (retroId: number) => void;
  /** Cancel the current remap. */
  cancelRemap: () => void;
  /** Change a single binding. */
  changeBinding: (retroId: number, gamepadButtonIndex: number | null) => void;
  /** Reset the current controller's mapping to defaults. */
  resetDefaults: () => void;
}

/**
 * Hook that bridges the Gamepad API with the ControllerConfig component.
 * Handles controller detection, live input polling, remapping flow,
 * and localStorage persistence.
 */
export function useControllerConfig(): UseControllerConfigResult {
  const [controllers, setControllers] = useState<Array<ConnectedController>>([]);
  const [selectedControllerIndex, setSelectedControllerIndex] = useState(0);
  const [mapping, setMapping] = useState<ControllerMapping>(getDefaultMapping);
  const [buttonStates, setButtonStates] = useState<Record<number, boolean>>({});
  const [axisValues, setAxisValues] = useState<Array<number>>([0, 0, 0, 0]);
  const [remappingButton, setRemappingButton] = useState<number | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const remappingRef = useRef<number | null>(null);

  // Keep ref in sync
  useEffect(() => {
    remappingRef.current = remappingButton;
  }, [remappingButton]);

  // Scan for connected gamepads
  const refreshControllers = useCallback(() => {
    const gamepads = navigator.getGamepads();
    const found: Array<ConnectedController> = [];
    for (const gp of gamepads) {
      if (gp) {
        found.push({
          index: gp.index,
          id: gp.id,
          type: detectControllerType(gp.id),
          name: getControllerDisplayName(gp.id),
          connected: gp.connected,
        });
      }
    }
    setControllers(found);
  }, []);

  // Load mapping when selected controller changes
  useEffect(() => {
    const controller = controllers[selectedControllerIndex];
    if (controller) {
      const saved = loadMapping(controller.id);
      setMapping(saved ?? getDefaultMapping());
    } else {
      setMapping(getDefaultMapping());
    }
  }, [controllers, selectedControllerIndex]);

  // Poll gamepad state
  useEffect(() => {
    const poll = () => {
      const gamepads = navigator.getGamepads();
      const controller = controllers[selectedControllerIndex];
      if (!controller) {
        animationFrameRef.current = requestAnimationFrame(poll);
        return;
      }

      const gp = gamepads[controller.index];
      if (!gp) {
        animationFrameRef.current = requestAnimationFrame(poll);
        return;
      }

      // Update button states
      const newButtonStates: Record<number, boolean> = {};
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i].pressed) {
          newButtonStates[i] = true;
        }
      }
      setButtonStates(newButtonStates);

      // Update axes
      const newAxes = Array.from(gp.axes);
      setAxisValues(newAxes);

      // Handle remap: capture first button press
      if (remappingRef.current !== null) {
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            const retroId = remappingRef.current;
            changeBindingDirect(retroId, i);
            setRemappingButton(null);
            break;
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(poll);
    };

    animationFrameRef.current = requestAnimationFrame(poll);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [controllers, selectedControllerIndex]);

  // Listen for gamepad connect/disconnect
  useEffect(() => {
    const handleConnect = () => refreshControllers();
    const handleDisconnect = () => refreshControllers();

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    // Initial scan
    refreshControllers();

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
    };
  }, [refreshControllers]);

  const changeBindingDirect = useCallback(
    (retroId: number, gamepadButtonIndex: number | null) => {
      setMapping((prev) => {
        const newBindings = prev.bindings.map((b) => {
          if (b.retroId === retroId) {
            return { ...b, gamepadButtonIndex };
          }
          // If another binding already uses this gamepad button, unbind it
          if (gamepadButtonIndex !== null && b.gamepadButtonIndex === gamepadButtonIndex) {
            return { ...b, gamepadButtonIndex: null };
          }
          return b;
        });
        const newMapping = { bindings: newBindings };

        // Persist
        const controller = controllers[selectedControllerIndex];
        if (controller) {
          saveMapping(controller.id, newMapping);
        }

        return newMapping;
      });
    },
    [controllers, selectedControllerIndex],
  );

  const changeBinding = useCallback(
    (retroId: number, gamepadButtonIndex: number | null) => {
      changeBindingDirect(retroId, gamepadButtonIndex);
    },
    [changeBindingDirect],
  );

  const startRemap = useCallback((retroId: number) => {
    setRemappingButton(retroId);
  }, []);

  const cancelRemap = useCallback(() => {
    setRemappingButton(null);
  }, []);

  const resetDefaults = useCallback(() => {
    const defaultMapping = getDefaultMapping();
    setMapping(defaultMapping);

    const controller = controllers[selectedControllerIndex];
    if (controller) {
      clearMapping(controller.id);
    }
  }, [controllers, selectedControllerIndex]);

  const selectController = useCallback((index: number) => {
    setSelectedControllerIndex(index);
    setRemappingButton(null);
  }, []);

  return {
    controllers,
    mapping,
    selectedControllerIndex,
    selectController,
    buttonStates,
    axisValues,
    remappingButton,
    startRemap,
    cancelRemap,
    changeBinding,
    resetDefaults,
  };
}
