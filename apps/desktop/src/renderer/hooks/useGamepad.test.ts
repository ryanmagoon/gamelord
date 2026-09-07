import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { getDefaultMapping, saveMapping, clearMapping } from "@gamelord/ui";
import { useGamepad } from "./useGamepad";
import { LIBRETRO_BUTTON } from "../lib/gamepad/mappings";

type GameInputFn = (port: number, id: number, pressed: boolean) => void;

/**
 * Create a GamepadEvent that works in happy-dom (which doesn't support
 * the GamepadEvent constructor's `gamepad` property).
 */
function createGamepadEvent(type: string, gamepad: Gamepad): GamepadEvent {
  const event = new Event(type) as GamepadEvent;
  Object.defineProperty(event, "gamepad", { value: gamepad, writable: false });
  return event;
}

/** Create a mock Gamepad object matching the W3C standard layout. */
function createMockGamepad(
  index: number,
  overrides: {
    axes?: Array<number>;
    buttons?: Array<Partial<GamepadButton> | null>;
  } = {},
): Gamepad {
  const defaultButtons: Array<GamepadButton> = Array.from({ length: 16 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));

  if (overrides.buttons) {
    for (let i = 0; i < overrides.buttons.length; i++) {
      const override = overrides.buttons[i];
      if (override) {
        defaultButtons[i] = { ...defaultButtons[i], ...override };
      }
    }
  }

  return {
    axes: overrides.axes ?? [0, 0, 0, 0],
    buttons: defaultButtons,
    connected: true,
    id: `Mock Gamepad ${index}`,
    index,
    mapping: "standard",
    timestamp: performance.now(),
    vibrationActuator: null as unknown as GamepadHapticActuator,
    hapticActuators: [],
  } as Gamepad;
}

describe("useGamepad", () => {
  let mockGamepads: Array<Gamepad | null>;
  let gameInput: ReturnType<typeof vi.fn<GameInputFn>>;
  let rafCallbacks: Array<FrameRequestCallback>;
  let rafIdCounter: number;

  beforeEach(() => {
    localStorage.clear();
    mockGamepads = [null, null, null, null];
    gameInput = vi.fn<GameInputFn>();
    rafCallbacks = [];
    rafIdCounter = 0;

    // happy-dom doesn't implement navigator.getGamepads, so define it first
    if (!navigator.getGamepads) {
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => mockGamepads,
        writable: true,
      });
    }

    vi.spyOn(navigator, "getGamepads").mockImplementation(
      () => mockGamepads as unknown as ReturnType<typeof navigator.getGamepads>,
    );

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return ++rafIdCounter;
    });

    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
      // noop — cancellation is not exercised in these tests
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Run one cycle of the rAF polling loop. */
  function tickPolling() {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    for (const callback of callbacks) {
      callback(performance.now());
    }
  }

  function swapFaceButtons() {
    const mapping = getDefaultMapping();
    for (const binding of mapping.bindings) {
      if (binding.gamepadButtonIndex === 0) {
        binding.gamepadButtonIndex = 1;
      } else if (binding.gamepadButtonIndex === 1) {
        binding.gamepadButtonIndex = 0;
      }
    }
    return mapping;
  }

  it.each([
    [8, LIBRETRO_BUTTON.SELECT],
    [9, LIBRETRO_BUTTON.START],
  ])(
    "passes a short physical button %i press and release directly to gameplay",
    (physical, retro) => {
      mockGamepads[0] = createMockGamepad(0);
      renderHook(() => useGamepad({ enabled: true, gameInput }));
      act(() => tickPolling());
      const buttons = Array.from({ length: 16 }, (_, index) => ({
        pressed: index === physical,
        value: index === physical ? 1 : 0,
      }));
      mockGamepads[0] = createMockGamepad(0, { buttons });
      act(() => tickPolling());
      mockGamepads[0] = createMockGamepad(0);
      act(() => tickPolling());
      expect(gameInput.mock.calls).toEqual([
        [0, retro, true],
        [0, retro, false],
      ]);
    },
  );

  it("uses a saved mapping on the next press without reconnecting", () => {
    mockGamepads[0] = createMockGamepad(0);
    renderHook(() => useGamepad({ enabled: true, gameInput }));
    act(() => tickPolling());
    act(() => saveMapping("Mock Gamepad 0", swapFaceButtons()));
    mockGamepads[0] = createMockGamepad(0, { buttons: [null, { pressed: true, value: 1 }] });
    act(() => tickPolling());
    expect(gameInput.mock.calls).toEqual([[0, LIBRETRO_BUTTON.B, true]]);
  });

  it("releases the old binding and analog output, then waits for only that controller to be neutral", () => {
    const analog = vi.fn();
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
      axes: [0.8, 0, 0, 0],
    });
    mockGamepads[1] = createMockGamepad(1);
    renderHook(() => useGamepad({ enabled: true, gameInput, gameInputAnalog: analog }));
    act(() => tickPolling());
    gameInput.mockClear();
    analog.mockClear();
    act(() => saveMapping("Mock Gamepad 0", swapFaceButtons()));
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, false);
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.RIGHT, false);
    expect(analog).toHaveBeenCalledWith(0, 0, 0, 0);
    gameInput.mockClear();
    mockGamepads[1] = createMockGamepad(1, { buttons: [null, { pressed: true, value: 1 }] });
    act(() => tickPolling());
    expect(gameInput.mock.calls).toEqual([[1, LIBRETRO_BUTTON.A, true]]);
    gameInput.mockClear();
    mockGamepads[0] = createMockGamepad(0);
    act(() => tickPolling());
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true, value: 1 }] });
    act(() => tickPolling());
    expect(gameInput.mock.calls).toEqual([[0, LIBRETRO_BUTTON.A, true]]);
  });

  it("applies reset defaults without reconnecting", () => {
    saveMapping("Mock Gamepad 0", swapFaceButtons());
    mockGamepads[0] = createMockGamepad(0);
    renderHook(() => useGamepad({ enabled: true, gameInput }));
    act(() => tickPolling());
    act(() => clearMapping("Mock Gamepad 0"));
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true, value: 1 }] });
    act(() => tickPolling());
    expect(gameInput.mock.calls).toEqual([[0, LIBRETRO_BUTTON.B, true]]);
  });

  it("applies mappings changed in another app window", () => {
    mockGamepads[0] = createMockGamepad(0);
    renderHook(() => useGamepad({ enabled: true, gameInput }));
    act(() => tickPolling());
    const key = "gamelord:controller-mapping:Mock Gamepad 0";
    localStorage.setItem(key, JSON.stringify(swapFaceButtons()));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
    mockGamepads[0] = createMockGamepad(0, { buttons: [null, { pressed: true, value: 1 }] });
    act(() => tickPolling());
    expect(gameInput.mock.calls).toEqual([[0, LIBRETRO_BUTTON.B, true]]);
  });

  it("keeps a direction held until both the stick and physical dpad release it", () => {
    mockGamepads[0] = createMockGamepad(0, { axes: [0.8, 0, 0, 0] });
    renderHook(() => useGamepad({ enabled: true, gameInput }));
    act(() => tickPolling());
    gameInput.mockClear();
    const buttons = Array.from({ length: 16 }, (_, index) => ({
      pressed: index === 15,
      value: index === 15 ? 1 : 0,
    }));
    mockGamepads[0] = createMockGamepad(0, { axes: [0.8, 0, 0, 0], buttons });
    act(() => tickPolling());
    mockGamepads[0] = createMockGamepad(0, { axes: [0.8, 0, 0, 0] });
    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
    mockGamepads[0] = createMockGamepad(0);
    act(() => tickPolling());
    expect(gameInput.mock.calls).toEqual([[0, LIBRETRO_BUTTON.RIGHT, false]]);
  });

  it("does not suppress analog direction when the physical dpad has another binding", () => {
    const mapping = getDefaultMapping();
    for (const binding of mapping.bindings) {
      if (binding.retroId === LIBRETRO_BUTTON.B) {
        binding.gamepadButtonIndex = 15;
      } else if (binding.gamepadButtonIndex === 15) {
        binding.gamepadButtonIndex = null;
      }
    }
    saveMapping("Mock Gamepad 0", mapping);
    const buttons = Array.from({ length: 16 }, (_, index) => ({
      pressed: index === 15,
      value: index === 15 ? 1 : 0,
    }));
    mockGamepads[0] = createMockGamepad(0, { axes: [0.8, 0, 0, 0], buttons });
    renderHook(() => useGamepad({ enabled: true, gameInput }));
    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, true);
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.RIGHT, true);
    expect(gameInput).toHaveBeenCalledTimes(2);
  });

  it.each(["disconnect", "unmount", "disable"] as const)(
    "zeros all analog axes on %s",
    (reason) => {
      const analog = vi.fn();
      mockGamepads[0] = createMockGamepad(0, { axes: [0.8, -0.7, 0.4, -0.2] });
      const { unmount, rerender } = renderHook(
        ({ enabled }) => useGamepad({ enabled, gameInput, gameInputAnalog: analog }),
        { initialProps: { enabled: true } },
      );
      act(() => tickPolling());
      analog.mockClear();
      if (reason === "disconnect") {
        act(() =>
          window.dispatchEvent(createGamepadEvent("gamepaddisconnected", createMockGamepad(0))),
        );
      } else if (reason === "unmount") {
        unmount();
      } else {
        rerender({ enabled: false });
      }
      expect(analog.mock.calls).toEqual([
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 1, 0, 0],
        [0, 1, 1, 0],
      ]);
    },
  );

  it("returns 0 connected gamepads initially when none are connected", () => {
    const { result } = renderHook(() => useGamepad({ enabled: true, gameInput }));
    expect(result.current.connectedCount).toBe(0);
  });

  it("detects already-connected gamepads on mount", () => {
    mockGamepads[0] = createMockGamepad(0);
    const { result } = renderHook(() => useGamepad({ enabled: true, gameInput }));
    expect(result.current.connectedCount).toBe(1);
  });

  it("increments connected count on gamepadconnected event", () => {
    const { result } = renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => {
      window.dispatchEvent(createGamepadEvent("gamepadconnected", createMockGamepad(0)));
    });

    expect(result.current.connectedCount).toBe(1);
  });

  it("decrements connected count on gamepaddisconnected event", () => {
    mockGamepads[0] = createMockGamepad(0);
    const { result } = renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => {
      window.dispatchEvent(createGamepadEvent("gamepaddisconnected", createMockGamepad(0)));
    });

    expect(result.current.connectedCount).toBe(0);
  });

  it("sends gameInput on button press transition", () => {
    mockGamepads[0] = createMockGamepad(0);
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    // First tick — no buttons pressed, establishes baseline
    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();

    // Press bottom face button (gamepad index 0 → libretro B = 0)
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    });

    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, true);
  });

  it("sends gameInput on button release transition", () => {
    // Start with bottom face button pressed
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    gameInput.mockClear();

    // Release bottom face button
    mockGamepads[0] = createMockGamepad(0);
    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, false);
  });

  it("does not re-fire for held buttons on subsequent polls", () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledTimes(1);

    // Same state on next poll — should not fire again
    gameInput.mockClear();
    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
  });

  it("maps left analog stick to d-pad when past deadzone", () => {
    // Push stick left (negative X axis past deadzone)
    mockGamepads[0] = createMockGamepad(0, {
      axes: [-0.8, 0, 0, 0],
    });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.LEFT, true);
  });

  it("does not emit d-pad input when analog stick is within deadzone", () => {
    mockGamepads[0] = createMockGamepad(0, {
      axes: [-0.3, 0.2, 0, 0], // within deadzone
    });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
  });

  it("emits d-pad up when stick is pushed up (negative Y axis)", () => {
    mockGamepads[0] = createMockGamepad(0, {
      axes: [0, -0.9, 0, 0],
    });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.UP, true);
  });

  it("does not poll when enabled is false", () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    });
    renderHook(() => useGamepad({ enabled: false, gameInput }));

    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
  });

  it("releases all buttons on gamepad disconnect", () => {
    // Start with multiple buttons pressed
    const buttons: Array<Partial<GamepadButton> | null> = new Array(16).fill(null);
    buttons[0] = { pressed: true, value: 1 }; // bottom face → B
    buttons[9] = { pressed: true, value: 1 }; // Start
    mockGamepads[0] = createMockGamepad(0, { buttons });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    gameInput.mockClear();

    // Disconnect
    act(() => {
      window.dispatchEvent(createGamepadEvent("gamepaddisconnected", createMockGamepad(0)));
    });

    // Should release B (bottom face) and Start
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, false);
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.START, false);
  });

  it("ignores gamepads with non-standard mapping", () => {
    const nonStandardGamepad = {
      ...createMockGamepad(0, {
        buttons: [{ pressed: true, value: 1 }],
      }),
      mapping: "" as GamepadMappingType, // non-standard
    };
    mockGamepads[0] = nonStandardGamepad;
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
  });

  it("supports two gamepads on separate ports", () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }], // bottom face (B) on port 0
    });
    mockGamepads[1] = createMockGamepad(1, {
      buttons: [null, { pressed: true, value: 1 }], // right face (A) on port 1
    });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, true);
    expect(gameInput).toHaveBeenCalledWith(1, LIBRETRO_BUTTON.A, true);
  });

  it("handles multiple simultaneous button presses", () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [
        { pressed: true, value: 1 }, // bottom face → B
        null,
        null,
        null,
        { pressed: true, value: 1 }, // L bumper
      ],
    });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, true);
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.L, true);
    expect(gameInput).toHaveBeenCalledTimes(2);
  });

  it("maps all 16 standard buttons to unique libretro IDs", () => {
    // Press every button at once
    const allPressed: Array<Partial<GamepadButton>> = Array.from({ length: 16 }, () => ({
      pressed: true,
      value: 1,
    }));
    mockGamepads[0] = createMockGamepad(0, { buttons: allPressed });
    renderHook(() => useGamepad({ enabled: true, gameInput }));

    act(() => tickPolling());

    // Should have sent 16 unique button presses
    const calls = gameInput.mock.calls;
    const calledIds = calls
      .filter((call) => call[0] === 0 && call[2] === true)
      .map((call) => call[1]);

    expect(calledIds).toHaveLength(16);
    expect(new Set(calledIds).size).toBe(16);
  });
  it("releases game inputs when a controller menu takes ownership", () => {
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true, value: 1 }] });
    const { rerender } = renderHook(({ enabled }) => useGamepad({ enabled, gameInput }), {
      initialProps: { enabled: true },
    });
    act(() => tickPolling());
    gameInput.mockClear();
    rerender({ enabled: false });
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, false);
    gameInput.mockClear();
    rerender({ enabled: true });
    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
    mockGamepads[0] = createMockGamepad(0);
    act(() => tickPolling());
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true, value: 1 }] });
    act(() => tickPolling());
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.B, true);
  });
  it("uses the active system and ignores other systems' mapping changes", () => {
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true }] });
    const custom = {
      bindings: [{ retroId: LIBRETRO_BUTTON.A, label: "A", gamepadButtonIndex: 0 }],
    };
    saveMapping("Mock Gamepad 0", custom, "nes");
    const { rerender } = renderHook(
      ({ systemId }) => useGamepad({ gameInput, enabled: true, systemId }),
      { initialProps: { systemId: "nes" } },
    );
    act(() => tickPolling());
    expect(gameInput).toHaveBeenLastCalledWith(0, LIBRETRO_BUTTON.A, true);
    gameInput.mockClear();
    act(() => saveMapping("Mock Gamepad 0", custom, "snes"));
    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
    act(() => clearMapping("Mock Gamepad 0", "nes"));
    expect(gameInput).toHaveBeenLastCalledWith(0, LIBRETRO_BUTTON.A, false);
    mockGamepads[0] = createMockGamepad(0);
    act(() => tickPolling());
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true }] });
    act(() => tickPolling());
    expect(gameInput).toHaveBeenLastCalledWith(0, LIBRETRO_BUTTON.B, true);
    rerender({ systemId: "snes" });
    expect(gameInput).toHaveBeenLastCalledWith(0, LIBRETRO_BUTTON.B, false);
    mockGamepads[0] = createMockGamepad(0);
    act(() => tickPolling());
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true }] });
    act(() => tickPolling());
    expect(gameInput).toHaveBeenLastCalledWith(0, LIBRETRO_BUTTON.A, true);
  });

  it("turns N64 C targets into analog input and combines physical stick sources", () => {
    const gameInputAnalog = vi.fn();
    const mapping = getDefaultMapping("n64");
    mapping.bindings = mapping.bindings.map((binding) => ({
      ...binding,
      gamepadButtonIndex: binding.retroId >= 16 ? binding.retroId - 16 : null,
    }));
    saveMapping("Mock Gamepad 0", mapping, "n64");
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true }], axes: [0, 0, 0, -0.6] });
    const { unmount } = renderHook(() =>
      useGamepad({ gameInput, gameInputAnalog, enabled: true, systemId: "n64" }),
    );
    act(() => tickPolling());
    expect(gameInput).not.toHaveBeenCalled();
    expect(gameInputAnalog).toHaveBeenLastCalledWith(0, 1, 1, -32_767);
    mockGamepads[0] = createMockGamepad(0, { axes: [0, 0, 0, -0.6] });
    act(() => tickPolling());
    expect(gameInputAnalog).toHaveBeenLastCalledWith(0, 1, 1, Math.round(-0.6 * 32_767));
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true }, { pressed: true }, { pressed: true }, { pressed: true }],
    });
    act(() => tickPolling());
    expect(gameInputAnalog).toHaveBeenLastCalledWith(0, 1, 1, 0);
    expect(gameInputAnalog).toHaveBeenCalledWith(0, 1, 0, 0);
    mockGamepads[0] = createMockGamepad(0, { buttons: [null, null, null, { pressed: true }] });
    act(() => tickPolling());
    expect(gameInputAnalog).toHaveBeenCalledWith(0, 1, 0, 32_767);
    gameInputAnalog.mockClear();
    unmount();
    expect(gameInputAnalog).toHaveBeenCalledWith(0, 1, 0, 0);
    expect(gameInputAnalog).toHaveBeenCalledWith(0, 1, 1, 0);
  });

  it("reloads a scoped mapping changed by another window", () => {
    mockGamepads[0] = createMockGamepad(0);
    saveMapping("Mock Gamepad 0", getDefaultMapping(), "nes");
    renderHook(() => useGamepad({ gameInput, enabled: true, systemId: "nes" }));
    act(() => tickPolling());
    const key = localStorage.key(0)!;
    localStorage.setItem(
      key,
      JSON.stringify({
        bindings: [{ retroId: LIBRETRO_BUTTON.A, label: "A", gamepadButtonIndex: 0 }],
      }),
    );
    act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
    mockGamepads[0] = createMockGamepad(0, { buttons: [{ pressed: true }] });
    act(() => tickPolling());
    expect(gameInput).toHaveBeenLastCalledWith(0, LIBRETRO_BUTTON.A, true);
  });
});
