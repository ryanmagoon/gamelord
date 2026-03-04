import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGamepadUI } from './useGamepadUI'
import type { UIAction } from '../lib/gamepad/ui-mappings'

type OnActionFn = (action: UIAction) => void

function createGamepadEvent(type: string, gamepad: Gamepad): GamepadEvent {
  const event = new Event(type) as GamepadEvent
  Object.defineProperty(event, 'gamepad', { value: gamepad, writable: false })
  return event
}

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

describe('useGamepadUI', () => {
  let mockGamepads: (Gamepad | null)[]
  let onAction: ReturnType<typeof vi.fn<OnActionFn>>
  let rafCallbacks: FrameRequestCallback[]
  let rafIdCounter: number

  beforeEach(() => {
    mockGamepads = [null, null, null, null]
    onAction = vi.fn<OnActionFn>()
    rafCallbacks = []
    rafIdCounter = 0

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

    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      /* no-op mock — gamepad polling cleanup */
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function runFrame() {
    const callbacks = [...rafCallbacks]
    rafCallbacks = []
    for (const cb of callbacks) {
      cb(performance.now())
    }
  }

  it('fires select on A button press', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true }],
    })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('select')
  })

  it('fires back on B button press', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    mockGamepads[0] = createMockGamepad(0, {
      buttons: [null, { pressed: true }],
    })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('back')
  })

  it('fires navigate-up on D-pad up', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    const buttons: (Partial<GamepadButton> | null)[] = Array(16).fill(null)
    buttons[12] = { pressed: true }
    mockGamepads[0] = createMockGamepad(0, { buttons })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('navigate-up')
  })

  it('fires navigate-down on D-pad down', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    const buttons: (Partial<GamepadButton> | null)[] = Array(16).fill(null)
    buttons[13] = { pressed: true }
    mockGamepads[0] = createMockGamepad(0, { buttons })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('navigate-down')
  })

  it('fires page-left on left bumper', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    const buttons: (Partial<GamepadButton> | null)[] = Array(16).fill(null)
    buttons[4] = { pressed: true }
    mockGamepads[0] = createMockGamepad(0, { buttons })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('page-left')
  })

  it('fires page-right on right bumper', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    const buttons: (Partial<GamepadButton> | null)[] = Array(16).fill(null)
    buttons[5] = { pressed: true }
    mockGamepads[0] = createMockGamepad(0, { buttons })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('page-right')
  })

  it('fires menu on Start button', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    const buttons: (Partial<GamepadButton> | null)[] = Array(16).fill(null)
    buttons[9] = { pressed: true }
    mockGamepads[0] = createMockGamepad(0, { buttons })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('menu')
  })

  it('fires navigate-left on analog stick left', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    mockGamepads[0] = createMockGamepad(0, { axes: [-0.8, 0, 0, 0] })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('navigate-left')
  })

  it('fires navigate-right on analog stick right', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    mockGamepads[0] = createMockGamepad(0, { axes: [0.8, 0, 0, 0] })
    act(() => runFrame())

    expect(onAction).toHaveBeenCalledWith('navigate-right')
  })

  it('does not fire within analog deadzone', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    mockGamepads[0] = createMockGamepad(0, { axes: [0.3, 0.3, 0, 0] })
    act(() => runFrame())

    expect(onAction).not.toHaveBeenCalled()
  })

  it('does not fire when disabled', () => {
    renderHook(() => useGamepadUI({ enabled: false, onAction }))

    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true }],
    })
    act(() => runFrame())

    expect(onAction).not.toHaveBeenCalled()
  })

  it('only fires on button transitions, not held state', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    mockGamepads[0] = createMockGamepad(0, {
      buttons: [{ pressed: true }],
    })
    act(() => runFrame())
    act(() => runFrame())
    act(() => runFrame())

    // Only called once (on press transition), not on every frame
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('detects gamepad connection', () => {
    const { result } = renderHook(() =>
      useGamepadUI({ enabled: true, onAction }),
    )

    expect(result.current.connectedCount).toBe(0)

    const gp = createMockGamepad(0)
    act(() => {
      window.dispatchEvent(createGamepadEvent('gamepadconnected', gp))
    })

    expect(result.current.connectedCount).toBe(1)
  })

  it('detects gamepad disconnection', () => {
    const { result } = renderHook(() =>
      useGamepadUI({ enabled: true, onAction }),
    )

    const gp = createMockGamepad(0)
    act(() => {
      window.dispatchEvent(createGamepadEvent('gamepadconnected', gp))
    })
    expect(result.current.connectedCount).toBe(1)

    act(() => {
      window.dispatchEvent(createGamepadEvent('gamepaddisconnected', gp))
    })
    expect(result.current.connectedCount).toBe(0)
  })

  it('ignores buttons not mapped to UI actions', () => {
    renderHook(() => useGamepadUI({ enabled: true, onAction }))

    // X button (index 2) and Y button (index 3) are unmapped
    mockGamepads[0] = createMockGamepad(0, {
      buttons: [null, null, { pressed: true }, { pressed: true }],
    })
    act(() => runFrame())

    expect(onAction).not.toHaveBeenCalled()
  })
})
