import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMapping, getDefaultMapping } from "@gamelord/ui";
import { useControllerConfig } from "./useControllerConfig";

// Exercise the real hook against a controllable Gamepad API clock.
describe("controller input publishing", () => {
  const originalGetGamepads = Object.getOwnPropertyDescriptor(navigator, "getGamepads");
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalGetGamepads) {
      Object.defineProperty(navigator, "getGamepads", originalGetGamepads);
    } else {
      Reflect.deleteProperty(navigator, "getGamepads");
    }
  });
  it("publishes analog changes, preserves unchanged input references, and clears a lost device", () => {
    let nextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let connected = true;
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const gamepad = {
      id: "Xbox Test",
      index: 0,
      connected: true,
      buttons,
      axes: [0, 0, 0, 0],
      mapping: "standard",
      timestamp: 0,
      vibrationActuator: null as unknown as GamepadHapticActuator,
      hapticActuators: [],
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => (connected ? [gamepad as Gamepad] : []),
    });
    const { result, unmount } = renderHook(() => useControllerConfig());
    const tick = () => act(() => nextFrame?.(16));
    tick();
    const before = {
      buttons: result.current.buttonStates,
      values: result.current.buttonValues,
      axes: result.current.axisValues,
    };
    tick();
    expect(result.current.buttonStates).toBe(before.buttons);
    expect(result.current.buttonValues).toBe(before.values);
    expect(result.current.axisValues).toBe(before.axes);
    buttons[6].value = 0.4;
    tick();
    expect(result.current.buttonValues[6]).toBe(0.4);
    expect(result.current.buttonStates).toBe(before.buttons);
    connected = false;
    tick();
    expect(result.current.buttonValues).toEqual({});
    expect(result.current.axisValues).toEqual([]);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  function connectedPad(index: number, id = `Xbox ${index}`): Gamepad {
    return {
      id,
      index,
      connected: true,
      buttons: [],
      axes: [0, 0, 0, 0],
      mapping: "standard",
      timestamp: 0,
      vibrationActuator: null as unknown as GamepadHapticActuator,
      hapticActuators: [],
    };
  }

  it("preserves the selected device when an earlier controller disconnects", () => {
    let pads: Array<Gamepad | null> = [connectedPad(0), connectedPad(1), connectedPad(2)];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { result } = renderHook(() => useControllerConfig());
    act(() => result.current.selectController(1));
    pads = [null, connectedPad(1), connectedPad(2)];
    act(() => window.dispatchEvent(new Event("gamepaddisconnected")));
    expect(result.current.selectedControllerIndex).toBe(0);
    expect(result.current.controllers[result.current.selectedControllerIndex].index).toBe(1);
  });

  it("chooses a remaining device and cancels remapping when the selected device disconnects", () => {
    let pads: Array<Gamepad | null> = [connectedPad(0), connectedPad(1), connectedPad(2)];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { result } = renderHook(() => useControllerConfig());
    act(() => result.current.selectController(1));
    act(() => result.current.startRemap(0));
    pads = [connectedPad(0), { ...connectedPad(1), connected: false }, connectedPad(2)];
    act(() => window.dispatchEvent(new Event("gamepaddisconnected")));
    expect(result.current.controllers[result.current.selectedControllerIndex].index).toBe(0);
    expect(result.current.remappingButton).toBeNull();
    pads = [connectedPad(0), connectedPad(1), connectedPad(2)];
    act(() => window.dispatchEvent(new Event("gamepadconnected")));
    expect(result.current.controllers[result.current.selectedControllerIndex].index).toBe(0);
  });

  it("distinguishes identical controller names and preserves an active remap when another device leaves", () => {
    let pads: Array<Gamepad | null> = [
      connectedPad(0, "Xbox"),
      connectedPad(1, "Xbox"),
      connectedPad(2, "Xbox"),
    ];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { result } = renderHook(() => useControllerConfig());
    act(() => result.current.selectController(2));
    act(() => result.current.startRemap(0));
    pads = [null, connectedPad(1, "Xbox"), connectedPad(2, "Xbox")];
    act(() => window.dispatchEvent(new Event("gamepaddisconnected")));
    expect(result.current.selectedControllerIndex).toBe(1);
    expect(result.current.controllers[result.current.selectedControllerIndex].index).toBe(2);
    expect(result.current.remappingButton).toBe(0);
  });
  it("switches system mappings, cancels capture, persists fresh captures and isolates reset", () => {
    localStorage.clear();
    let nextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = { ...connectedPad(0, "scoped-pad"), buttons };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
    const { result, rerender, unmount } = renderHook(({ system }) => useControllerConfig(system), {
      initialProps: { system: "nes" },
    });
    act(() => result.current.changeBinding(8, 3));
    const nes = result.current.mapping;
    act(() => result.current.startRemap(8));
    rerender({ system: "snes" });
    expect(result.current.remappingButton).toBeNull();
    expect(result.current.buttonStates).toEqual({});
    expect(result.current.mapping).toEqual(getDefaultMapping());
    act(() => result.current.startRemap(8));
    act(() => nextFrame?.(16));
    buttons[4].pressed = true;
    act(() => nextFrame?.(32));
    const snes = result.current.mapping;
    expect(loadMapping("scoped-pad", "snes")).toEqual(snes);
    expect(loadMapping("scoped-pad", "nes")).toEqual(nes);
    rerender({ system: "nes" });
    expect(result.current.mapping).toEqual(nes);
    act(() => result.current.resetDefaults());
    expect(loadMapping("scoped-pad", "nes")).toEqual(getDefaultMapping());
    expect(loadMapping("scoped-pad", "snes")).toEqual(snes);
    unmount();
  });
});
