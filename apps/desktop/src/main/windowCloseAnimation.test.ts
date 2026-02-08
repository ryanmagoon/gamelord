import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  animateWindowClose,
  WINDOW_CLOSE_ANIMATION_DURATION,
  WINDOW_CLOSE_ANIMATION_STEPS,
} from './windowCloseAnimation'
import type { BrowserWindow } from 'electron'

/** Create a mock BrowserWindow with sensible defaults. */
function createMockWindow(overrides: Partial<Record<keyof BrowserWindow, unknown>> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 800, height: 600 })),
    setOpacity: vi.fn(),
    setBounds: vi.fn(),
    ...overrides,
  } as unknown as BrowserWindow
}

describe('animateWindowClose', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drives opacity from 1 toward 0 over the animation duration', async () => {
    const window = createMockWindow()
    const promise = animateWindowClose(window)

    // Advance through all steps
    await vi.advanceTimersByTimeAsync(WINDOW_CLOSE_ANIMATION_DURATION + 50)
    await promise

    const setOpacity = window.setOpacity as ReturnType<typeof vi.fn>
    expect(setOpacity).toHaveBeenCalled()

    // First call should have opacity close to 1 (just started)
    const firstOpacity = setOpacity.mock.calls[0][0] as number
    expect(firstOpacity).toBeGreaterThan(0.5)

    // Last call should be at or near 0
    const lastOpacity = setOpacity.mock.calls[setOpacity.mock.calls.length - 1][0] as number
    expect(lastOpacity).toBe(0)
  })

  it('shrinks bounds symmetrically toward the center', async () => {
    const window = createMockWindow()
    const promise = animateWindowClose(window)

    await vi.advanceTimersByTimeAsync(WINDOW_CLOSE_ANIMATION_DURATION + 50)
    await promise

    const setBounds = window.setBounds as ReturnType<typeof vi.fn>
    expect(setBounds).toHaveBeenCalled()

    // The initial bounds are 800×600 at (100, 100).
    // Center is (500, 400). Final scale is 0.92 → 736×552.
    // Final position: x = 500 - 368 = 132, y = 400 - 276 = 124
    const lastCall = setBounds.mock.calls[setBounds.mock.calls.length - 1][0] as {
      x: number; y: number; width: number; height: number
    }
    expect(lastCall.width).toBeLessThan(800)
    expect(lastCall.height).toBeLessThan(600)
    // Window should have shrunk roughly 8% (to ~736×552)
    expect(lastCall.width).toBeCloseTo(736, 0)
    expect(lastCall.height).toBeCloseTo(552, 0)
    // Should be centered on the same point
    const finalCenterX = lastCall.x + lastCall.width / 2
    const finalCenterY = lastCall.y + lastCall.height / 2
    expect(finalCenterX).toBeCloseTo(500, 0)
    expect(finalCenterY).toBeCloseTo(400, 0)
  })

  it('resolves immediately if window is already destroyed', async () => {
    const window = createMockWindow({ isDestroyed: vi.fn(() => true) })
    const promise = animateWindowClose(window)

    // Should resolve without needing to advance timers
    await promise

    expect(window.setOpacity).not.toHaveBeenCalled()
    expect(window.setBounds).not.toHaveBeenCalled()
  })

  it('stops the animation if window is destroyed mid-way', async () => {
    let destroyed = false
    const window = createMockWindow({
      isDestroyed: vi.fn(() => destroyed),
    })
    const promise = animateWindowClose(window)

    // Run a few steps
    const halfDuration = WINDOW_CLOSE_ANIMATION_DURATION / 2
    await vi.advanceTimersByTimeAsync(halfDuration)

    // Destroy the window mid-animation
    destroyed = true
    await vi.advanceTimersByTimeAsync(WINDOW_CLOSE_ANIMATION_DURATION)
    await promise

    // setOpacity should have been called for the steps before destruction,
    // but not for all steps
    const setOpacity = window.setOpacity as ReturnType<typeof vi.fn>
    expect(setOpacity.mock.calls.length).toBeLessThan(WINDOW_CLOSE_ANIMATION_STEPS)
  })

  it('skips bounds animation when window is fullscreen', async () => {
    const window = createMockWindow({
      isFullScreen: vi.fn(() => true),
    })
    const promise = animateWindowClose(window)

    await vi.advanceTimersByTimeAsync(WINDOW_CLOSE_ANIMATION_DURATION + 50)
    await promise

    // Opacity should still animate
    expect(window.setOpacity).toHaveBeenCalled()
    // Bounds should NOT be set
    expect(window.setBounds).not.toHaveBeenCalled()
  })

  it('calls setOpacity exactly WINDOW_CLOSE_ANIMATION_STEPS times', async () => {
    const window = createMockWindow()
    const promise = animateWindowClose(window)

    await vi.advanceTimersByTimeAsync(WINDOW_CLOSE_ANIMATION_DURATION + 50)
    await promise

    const setOpacity = window.setOpacity as ReturnType<typeof vi.fn>
    expect(setOpacity).toHaveBeenCalledTimes(WINDOW_CLOSE_ANIMATION_STEPS)
  })

  it('produces monotonically decreasing opacity values', async () => {
    const window = createMockWindow()
    const promise = animateWindowClose(window)

    await vi.advanceTimersByTimeAsync(WINDOW_CLOSE_ANIMATION_DURATION + 50)
    await promise

    const setOpacity = window.setOpacity as ReturnType<typeof vi.fn>
    const opacities = setOpacity.mock.calls.map((call: unknown[]) => call[0] as number)

    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1])
    }
  })
})
