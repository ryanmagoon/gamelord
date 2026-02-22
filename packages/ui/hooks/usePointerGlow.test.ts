import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePointerGlow } from './usePointerGlow'

describe('usePointerGlow', () => {
  let container: HTMLDivElement
  let card: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    card = document.createElement('div')
    card.setAttribute('data-game-card', '')
    card.style.width = '200px'
    card.style.height = '300px'
    container.appendChild(card)
    document.body.appendChild(container)
  })

  afterEach(() => {
    delete document.documentElement.dataset.vibe
    document.body.removeChild(container)
  })

  it('does nothing when vibe is not unc', () => {
    const ref = { current: container }
    renderHook(() => usePointerGlow(ref))

    const event = new PointerEvent('pointermove', {
      clientX: 100,
      clientY: 150,
      bubbles: true,
    })
    container.dispatchEvent(event)

    expect(card.style.getPropertyValue('--pointer-x')).toBe('')
    expect(card.style.getPropertyValue('--pointer-y')).toBe('')
  })

  it('sets CSS vars on pointermove when vibe is unc', async () => {
    document.documentElement.dataset.vibe = 'unc'
    const ref = { current: container }
    renderHook(() => usePointerGlow(ref))

    // Mock getBoundingClientRect on the card
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 300,
      right: 200,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    const event = new PointerEvent('pointermove', {
      clientX: 100,
      clientY: 150,
      bubbles: true,
    })
    card.dispatchEvent(event)

    // RAF-throttled — need to flush
    await vi.waitFor(() => {
      expect(card.style.getPropertyValue('--pointer-x')).toBe('0.500')
      expect(card.style.getPropertyValue('--pointer-y')).toBe('0.500')
    })
  })

  it('clears CSS vars on pointerleave', async () => {
    document.documentElement.dataset.vibe = 'unc'
    const ref = { current: container }
    renderHook(() => usePointerGlow(ref))

    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 300,
      right: 200,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    // First move to set vars
    card.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 100, clientY: 150, bubbles: true }),
    )
    await vi.waitFor(() => {
      expect(card.style.getPropertyValue('--pointer-x')).toBe('0.500')
    })

    // Then leave
    container.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))

    expect(card.style.getPropertyValue('--pointer-x')).toBe('')
    expect(card.style.getPropertyValue('--pointer-y')).toBe('')
  })

  it('cleans up listener on unmount', () => {
    document.documentElement.dataset.vibe = 'unc'
    const ref = { current: container }
    const removeSpy = vi.spyOn(container, 'removeEventListener')

    const { unmount } = renderHook(() => usePointerGlow(ref))
    unmount()

    expect(removeSpy).toHaveBeenCalledWith(
      'pointermove',
      expect.any(Function),
    )
    expect(removeSpy).toHaveBeenCalledWith(
      'pointerleave',
      expect.any(Function),
    )
  })

  it('does not throw when ref is null', () => {
    const ref = { current: null }
    expect(() => {
      renderHook(() => usePointerGlow(ref))
    }).not.toThrow()
  })

  it('clears CSS vars on previous card when pointer moves to a different card', async () => {
    document.documentElement.dataset.vibe = 'unc'

    const card2 = document.createElement('div')
    card2.setAttribute('data-game-card', '')
    card2.style.width = '200px'
    card2.style.height = '300px'
    container.appendChild(card2)

    const mockRect = {
      left: 0, top: 0, width: 200, height: 300,
      right: 200, bottom: 300, x: 0, y: 0,
      toJSON: () => ({}),
    }
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(mockRect)
    vi.spyOn(card2, 'getBoundingClientRect').mockReturnValue(mockRect)

    const ref = { current: container }
    renderHook(() => usePointerGlow(ref))

    // Move to first card
    card.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 100, clientY: 150, bubbles: true }),
    )
    await vi.waitFor(() => {
      expect(card.style.getPropertyValue('--pointer-x')).toBe('0.500')
    })

    // Move to second card
    card2.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 100, clientY: 150, bubbles: true }),
    )
    await vi.waitFor(() => {
      expect(card2.style.getPropertyValue('--pointer-x')).toBe('0.500')
    })

    // First card's CSS vars should be cleared
    expect(card.style.getPropertyValue('--pointer-x')).toBe('')
    expect(card.style.getPropertyValue('--pointer-y')).toBe('')
  })

  it('cleans up lastCard CSS vars on unmount', async () => {
    document.documentElement.dataset.vibe = 'unc'
    const ref = { current: container }

    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 200, height: 300,
      right: 200, bottom: 300, x: 0, y: 0,
      toJSON: () => ({}),
    })

    const { unmount } = renderHook(() => usePointerGlow(ref))

    // Move to card to set lastCard
    card.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 100, clientY: 150, bubbles: true }),
    )
    await vi.waitFor(() => {
      expect(card.style.getPropertyValue('--pointer-x')).toBe('0.500')
    })

    unmount()

    // CSS vars should be cleaned up
    expect(card.style.getPropertyValue('--pointer-x')).toBe('')
    expect(card.style.getPropertyValue('--pointer-y')).toBe('')
  })
})
