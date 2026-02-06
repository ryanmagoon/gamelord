import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGamepad } from '../useGamepad'
import { LIBRETRO_BUTTON } from '../../lib/gamepad/mappings'

type GameInputFn = (port: number, id: number, pressed: boolean) => void

/**
 * Create a GamepadEvent that works in happy-dom (which doesn't support
 * the GamepadEvent constructor's `gamepad` property).
 */
function createGamepadEvent(type: string, gamepad: Gamepad): GamepadEvent {
  const event = new Event(type) as GamepadEvent
  Object.defineProperty(event, 'gamepad', { value: gamepad, writable: false })
  return event
}

/** Create a mock Gamepad object matching the W3C standard layout. */
function createMockGamepad(
  index: number,
  overrides: {
    buttons?: (Partial<GamepadButton> | null)[]
    axes?: number[]
  } = {},
): Gamepad {
  const defaultButtons: GamepadButton[] = Array.from({ length: 16 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }))

  if (overrides.buttons) {
    for (let i = 0; i < overrides.buttons.length; i++) {
      const override = overrides.buttons[i]
      if (override) {
        defaultButtons[i] = { ...defaultButtons[i], ...override }
      }
    }
  }

  return {
    id: `Mock Gamepad ${index}`,
    index,
    connected: true,
    mapping: 'standard',
    buttons: defaultButtons,
    axes: overrides.axes ?? [0, 0, 0, 0],
    timestamp: performance.now(),
    vibrationActuator: null as unknown as GamepadHapticActuator,
  } as Gamepad
}

describe('useGamepad', () => {
  let mockGamepads: (Gamepad | null)[]
  let gameInput: ReturnType<typeof vi.fn<GameInputFn>>
  let rafCallbacks: FrameRequestCallback[]
  let rafIdCounter: number

  beforeEach(() => {
    mockGamepads = [null, null, null, null]
    gameInput = vi.fn<GameInputFn>()
    rafCallbacks = []
    rafIdCounter = 0

    // happy-dom doesn't implement navigator.getGamepads, so define it first
    if (!navigator.getGamepads) {
      Object.defineProperty(navigator, 'getGamepads', {
        value: () => mockGamepads,
        writable: true,
        configurable: true,
      })
    }

    vi.spyOn(navigator, 'getGamepads').mockImplementation(
      () => mockGamepads as unknown as ReturnType<typeof navigator.getGamepads>,
    )

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      return ++rafIdCounter
    })

    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Run one cycle of the rAF polling loop. */
  function tickPolling() {
    const callbacks = [...rafCallbacks]
    rafCallbacks = []
    for (const callback of callbacks) {
      callback(performance.now())
    }
  }

  it('returns 0 connected gamepads initially when none are connected', () => {
    const { result } = renderHook(() =>
      useGamepad({ gameInput, enabled: true }),
    )
    expect(result.current.connectedCount).toBe(0)
  })

  it('detects already-connected gamepads on mount', () => {
    mockGamepads[0] = createMockGamepad(0)
    const { result } = renderHook(() =>
      useGamepad({ gameInput, enabled: true }),
    )
    expect(result.current.connectedCount).toBe(1)
  })

  it('increments connected count on gamepadconnected event', () => {
    const { result } = renderHook(() =>
      useGamepad({ gameInput, enabled: true }),
    )

    act(() => {
      window.dispatchEvent(
        createGamepadEvent('gamepadconnected', createMockGamepad(0)),
      )
    })

    expect(result.current.connectedCount).toBe(1)
  })

  it('decrements connected count on gamepaddisconnected event', () => {
    mockGamepads[0] = createMockGamepad(0)
    const { result } = renderHook(() =>
      useGamepad({ gameInput, enabled: true }),
    )

    act(() => {
      window.dispatchEvent(
        createGamepadEvent('gamepaddisconnected', createMockGamepad(0)),
      )
    })

    expect(result.current.connectedCount).toBe(0)
  })

  it('sends gameInput on button press transition', () => {
    mockGamepads[0] = createMockGamepad(0)
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    // First tick — no buttons pressed, establishes baseline
    act(() => tickPolling())
    expect(gameInput).not.toHaveBeenCalled()

    // Press A button (gamepad index 0 → libretro A = 8)
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    })

    act(() => tickPolling())
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.A, true)
  })

  it('sends gameInput on button release transition', () => {
    // Start with A pressed
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    gameInput.mockClear()

    // Release A
    mockGamepads[0] = createMockGamepad(0)
    act(() => tickPolling())
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.A, false)
  })

  it('does not re-fire for held buttons on subsequent polls', () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    expect(gameInput).toHaveBeenCalledTimes(1)

    // Same state on next poll — should not fire again
    gameInput.mockClear()
    act(() => tickPolling())
    expect(gameInput).not.toHaveBeenCalled()
  })

  it('maps left analog stick to d-pad when past deadzone', () => {
    // Push stick left (negative X axis past deadzone)
    mockGamepads[0] = createMockGamepad(0, {
      axes: [-0.8, 0, 0, 0],
    })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.LEFT, true)
  })

  it('does not emit d-pad input when analog stick is within deadzone', () => {
    mockGamepads[0] = createMockGamepad(0, {
      axes: [-0.3, 0.2, 0, 0], // within deadzone
    })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    expect(gameInput).not.toHaveBeenCalled()
  })

  it('emits d-pad up when stick is pushed up (negative Y axis)', () => {
    mockGamepads[0] = createMockGamepad(0, {
      axes: [0, -0.9, 0, 0],
    })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.UP, true)
  })

  it('does not poll when enabled is false', () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }],
    })
    renderHook(() => useGamepad({ gameInput, enabled: false }))

    act(() => tickPolling())
    expect(gameInput).not.toHaveBeenCalled()
  })

  it('releases all buttons on gamepad disconnect', () => {
    // Start with multiple buttons pressed
    const buttons: (Partial<GamepadButton> | null)[] = new Array(16).fill(null)
    buttons[0] = { pressed: true, value: 1 } // A
    buttons[9] = { pressed: true, value: 1 } // Start
    mockGamepads[0] = createMockGamepad(0, { buttons })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    gameInput.mockClear()

    // Disconnect
    act(() => {
      window.dispatchEvent(
        createGamepadEvent('gamepaddisconnected', createMockGamepad(0)),
      )
    })

    // Should release A and Start
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.A, false)
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.START, false)
  })

  it('ignores gamepads with non-standard mapping', () => {
    const nonStandardGamepad = {
      ...createMockGamepad(0, {
        buttons: [{ pressed: true, value: 1 }],
      }),
      mapping: '' as GamepadMappingType, // non-standard
    }
    mockGamepads[0] = nonStandardGamepad
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    expect(gameInput).not.toHaveBeenCalled()
  })

  it('supports two gamepads on separate ports', () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true, value: 1 }], // A on port 0
    })
    mockGamepads[1] = createMockGamepad(1, {
      buttons: [null, { pressed: true, value: 1 }], // B on port 1
    })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.A, true)
    expect(gameInput).toHaveBeenCalledWith(1, LIBRETRO_BUTTON.B, true)
  })

  it('handles multiple simultaneous button presses', () => {
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [
        { pressed: true, value: 1 }, // A
        null,
        null,
        null,
        { pressed: true, value: 1 }, // L bumper
      ],
    })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.A, true)
    expect(gameInput).toHaveBeenCalledWith(0, LIBRETRO_BUTTON.L, true)
    expect(gameInput).toHaveBeenCalledTimes(2)
  })

  it('maps all 16 standard buttons to unique libretro IDs', () => {
    // Press every button at once
    const allPressed: Partial<GamepadButton>[] = Array.from(
      { length: 16 },
      () => ({ pressed: true, value: 1 }),
    )
    mockGamepads[0] = createMockGamepad(0, { buttons: allPressed })
    renderHook(() => useGamepad({ gameInput, enabled: true }))

    act(() => tickPolling())

    // Should have sent 16 unique button presses
    const calls = gameInput.mock.calls
    const calledIds = calls
      .filter((call) => call[0] === 0 && call[2] === true)
      .map((call) => call[1])

    expect(calledIds).toHaveLength(16)
    expect(new Set(calledIds).size).toBe(16)
  })
})
