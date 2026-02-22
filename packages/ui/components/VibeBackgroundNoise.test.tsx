import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { VibeBackgroundNoise } from './VibeBackgroundNoise'

/** Minimal mock canvas context that satisfies the component's needs. */
function mockCanvasContext() {
  const putImageDataSpy = vi.fn()
  const mockCtx = {
    createImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(64 * 64 * 4),
    })),
    putImageData: putImageDataSpy,
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  )

  return { mockCtx, putImageDataSpy }
}

describe('VibeBackgroundNoise', () => {
  let rafCallbacks: FrameRequestCallback[] = []
  let rafId = 1

  beforeEach(() => {
    rafCallbacks = []
    rafId = 1
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafId++
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a canvas element with the vibe-background-noise class', () => {
    const { container } = render(<VibeBackgroundNoise />)
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    expect(canvas!.className).toBe('vibe-background-noise')
  })

  it('sets aria-hidden="true" for accessibility', () => {
    const { container } = render(<VibeBackgroundNoise />)
    const canvas = container.querySelector('canvas')
    expect(canvas!.getAttribute('aria-hidden')).toBe('true')
  })

  it('sets canvas dimensions to 64x64', () => {
    mockCanvasContext()
    const { container } = render(<VibeBackgroundNoise />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(64)
    expect(canvas.height).toBe(64)
  })

  it('starts a requestAnimationFrame loop on mount', () => {
    mockCanvasContext()
    render(<VibeBackgroundNoise />)
    expect(rafCallbacks.length).toBeGreaterThan(0)
  })

  it('cancels the animation frame on unmount', () => {
    mockCanvasContext()
    const { unmount } = render(<VibeBackgroundNoise />)
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('draws noise to canvas via putImageData on each frame', () => {
    const { putImageDataSpy } = mockCanvasContext()
    render(<VibeBackgroundNoise />)

    // Simulate a frame
    expect(rafCallbacks.length).toBeGreaterThan(0)
    rafCallbacks[rafCallbacks.length - 1](0)

    expect(putImageDataSpy).toHaveBeenCalledTimes(1)
  })

  it('schedules the next frame after drawing', () => {
    mockCanvasContext()
    render(<VibeBackgroundNoise />)

    const countAfterMount = rafCallbacks.length

    // Simulate the first frame
    rafCallbacks[countAfterMount - 1](0)

    // Should have requested another frame
    expect(rafCallbacks.length).toBe(countAfterMount + 1)
  })
})
