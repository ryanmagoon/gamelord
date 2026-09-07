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
  buttonValues: Record<number, number>;
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
export function useControllerConfig(systemId?: string): UseControllerConfigResult {
  const [{ controllers, selectedControllerIndex }, setControllerSelection] = useState<{
    controllers: Array<ConnectedController>;
    selectedControllerIndex: number;
  }>({ controllers: [], selectedControllerIndex: 0 });
  const [mapping, setMapping] = useState<ControllerMapping>(() => getDefaultMapping(systemId));
  const [buttonStates, setButtonStates] = useState<Record<number, boolean>>({});
  const [buttonValues, setButtonValues] = useState<Record<number, number>>({});
  const lastInput = useRef({ buttons: "", values: "", axes: "" });
  const [axisValues, setAxisValues] = useState<Array<number>>([0, 0, 0, 0]);
  const [remappingButton, setRemappingButton] = useState<number | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const remappingRef = useRef<number | null>(null);
  const remapReady = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    remappingRef.current = remappingButton;
  }, [remappingButton]);

  // Scan for connected gamepads
  const refreshControllers = useCallback(() => {
    const gamepads = navigator.getGamepads();
    const found: Array<ConnectedController> = [];
    for (const gp of gamepads) {
      if (gp?.connected) {
        found.push({
          index: gp.index,
          id: gp.id,
          type: detectControllerType(gp.id),
          name: getControllerDisplayName(gp.id),
          connected: gp.connected,
        });
      }
    }
    setControllerSelection((previous) => {
      const selected = previous.controllers[previous.selectedControllerIndex];
      const nextIndex = found.findIndex(
        (controller) => controller.index === selected?.index && controller.id === selected?.id,
      );
      return { controllers: found, selectedControllerIndex: Math.max(0, nextIndex) };
    });
  }, []);

  const selectedControllerId = controllers[selectedControllerIndex]?.id;
  const selectedGamepadIndex = controllers[selectedControllerIndex]?.index;
  // A list position may change while the same physical device remains selected.
  useEffect(() => {
    setMapping(
      selectedControllerId === undefined
        ? getDefaultMapping(systemId)
        : (loadMapping(selectedControllerId, systemId) ?? getDefaultMapping(systemId)),
    );
    remappingRef.current = null;
    remapReady.current = false;
    setRemappingButton(null);
    setButtonStates({});
    setButtonValues({});
    setAxisValues([]);
    lastInput.current = { buttons: "{}", values: "{}", axes: "[]" };
  }, [selectedControllerId, selectedGamepadIndex, systemId]);

  // Poll gamepad state
  useEffect(() => {
    const publishInput = (
      buttons: Record<number, boolean>,
      values: Record<number, number>,
      axes: Array<number>,
    ) => {
      const next = {
        buttons: JSON.stringify(buttons),
        values: JSON.stringify(values),
        axes: JSON.stringify(axes),
      };
      if (next.buttons !== lastInput.current.buttons) {
        setButtonStates(buttons);
      }
      if (next.values !== lastInput.current.values) {
        setButtonValues(values);
      }
      if (next.axes !== lastInput.current.axes) {
        setAxisValues(axes);
      }
      lastInput.current = next;
    };
    const poll = () => {
      const gamepads = navigator.getGamepads();
      const controller = controllers[selectedControllerIndex];
      if (!controller) {
        publishInput({}, {}, []);
        animationFrameRef.current = requestAnimationFrame(poll);
        return;
      }

      const gp = gamepads[controller.index];
      if (!gp) {
        publishInput({}, {}, []);
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
      const values: Record<number, number> = {};
      gp.buttons.forEach((button, index) => {
        values[index] = button.value;
      });
      publishInput(newButtonStates, values, Array.from(gp.axes));

      // Handle remap: capture first button press
      if (remappingRef.current !== null) {
        if (!gp.buttons.some((button) => button.pressed)) {
          remapReady.current = true;
        }
        if (!remapReady.current) {
          animationFrameRef.current = requestAnimationFrame(poll);
          return;
        }
        if (gp.buttons[16]?.pressed) {
          setRemappingButton(null);
          animationFrameRef.current = requestAnimationFrame(poll);
          return;
        }
        for (let i = 0; i < Math.min(16, gp.buttons.length); i++) {
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
  }, [controllers, selectedControllerIndex, systemId]);

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
          saveMapping(controller.id, newMapping, systemId);
        }

        return newMapping;
      });
    },
    [controllers, selectedControllerIndex, systemId],
  );

  const changeBinding = useCallback(
    (retroId: number, gamepadButtonIndex: number | null) => {
      changeBindingDirect(retroId, gamepadButtonIndex);
    },
    [changeBindingDirect],
  );

  const startRemap = useCallback((retroId: number) => {
    remappingRef.current = retroId;
    remapReady.current = false;
    setRemappingButton(retroId);
  }, []);

  useEffect(() => {
    if (remappingButton === null) {
      return;
    }
    const timeout = setTimeout(() => setRemappingButton(null), 10_000);
    return () => clearTimeout(timeout);
  }, [remappingButton]);

  const cancelRemap = useCallback(() => {
    remappingRef.current = null;
    setRemappingButton(null);
  }, []);

  const resetDefaults = useCallback(() => {
    remappingRef.current = null;
    remapReady.current = false;
    setRemappingButton(null);
    const defaultMapping = getDefaultMapping(systemId);
    setMapping(defaultMapping);

    const controller = controllers[selectedControllerIndex];
    if (controller) {
      clearMapping(controller.id, systemId);
    }
  }, [controllers, selectedControllerIndex, systemId]);

  const selectController = useCallback((index: number) => {
    setControllerSelection((previous) =>
      previous.controllers[index] ? { ...previous, selectedControllerIndex: index } : previous,
    );
    setRemappingButton(null);
  }, []);

  return {
    controllers,
    mapping,
    selectedControllerIndex,
    selectController,
    buttonStates,
    buttonValues,
    axisValues,
    remappingButton,
    startRemap,
    cancelRemap,
    changeBinding,
    resetDefaults,
  };
}
