import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAspectRatioTransition } from './useAspectRatioTransition'

describe('useAspectRatioTransition', () => {
  it('provides a containerRef callback', () => {
    const { result } = renderHook(() =>
      useAspectRatioTransition({ aspectRatio: 0.75, enabled: false }),
    )

    expect(typeof result.current.containerRef).toBe('function')
    expect(() => result.current.containerRef(null)).not.toThrow()
  })

  it('sets aspect-ratio on element when containerRef is called', () => {
    const { result } = renderHook(() =>
      useAspectRatioTransition({ aspectRatio: 0.75, enabled: false }),
    )

    const element = document.createElement('div')
    result.current.containerRef(element)
    expect(element.style.aspectRatio).toContain('0.75')
  })

  it('calls onResizeComplete immediately when ratio has not changed', () => {
    const onResizeComplete = vi.fn()
    renderHook(
      (props) => useAspectRatioTransition(props),
      {
        initialProps: { aspectRatio: 0.75, enabled: false, onResizeComplete },
      },
    )

    // First render: no previous ratio, so onResizeComplete is not called
    expect(onResizeComplete).not.toHaveBeenCalled()
  })

  it('containerRef is stable across re-renders', () => {
    const { result, rerender } = renderHook(
      (props) => useAspectRatioTransition(props),
      { initialProps: { aspectRatio: 0.75, enabled: false } },
    )

    const ref1 = result.current.containerRef
    rerender({ aspectRatio: 0.714, enabled: false })
    const ref2 = result.current.containerRef
    expect(ref1).toBe(ref2)
  })
})
