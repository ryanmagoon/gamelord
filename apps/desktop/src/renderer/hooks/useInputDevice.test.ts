import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInputDevice } from './useInputDevice'

describe('useInputDevice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to mouse', () => {
    const { result } = renderHook(() => useInputDevice())
    expect(result.current.inputDevice).toBe('mouse')
    expect(result.current.showFocusRing).toBe(false)
  })

  it('shows focus ring when set to gamepad', () => {
    const { result } = renderHook(() => useInputDevice())

    act(() => {
      result.current.setInputDevice('gamepad')
    })

    expect(result.current.inputDevice).toBe('gamepad')
    expect(result.current.showFocusRing).toBe(true)
  })

  it('shows focus ring when set to keyboard', () => {
    const { result } = renderHook(() => useInputDevice())

    act(() => {
      result.current.setInputDevice('keyboard')
    })

    expect(result.current.inputDevice).toBe('keyboard')
    expect(result.current.showFocusRing).toBe(true)
  })

  it('hides focus ring when mouse moves after gamepad input', () => {
    const { result } = renderHook(() => useInputDevice())

    act(() => {
      result.current.setInputDevice('gamepad')
    })
    expect(result.current.showFocusRing).toBe(true)

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'))
    })
    expect(result.current.inputDevice).toBe('mouse')
    expect(result.current.showFocusRing).toBe(false)
  })

  it('does not re-render when same device is set repeatedly', () => {
    const renderCount = { current: 0 }
    const { result } = renderHook(() => {
      renderCount.current++
      return useInputDevice()
    })

    const _initialRenders = renderCount.current

    // Set to gamepad first
    act(() => {
      result.current.setInputDevice('gamepad')
    })
    const afterFirstSet = renderCount.current

    // Set to gamepad again — should not re-render
    act(() => {
      result.current.setInputDevice('gamepad')
    })
    expect(renderCount.current).toBe(afterFirstSet)

    // But setting to a different device should re-render
    act(() => {
      result.current.setInputDevice('keyboard')
    })
    expect(renderCount.current).toBeGreaterThan(afterFirstSet)
  })

  it('does not re-render on mousemove when already in mouse mode', () => {
    const renderCount = { current: 0 }
    renderHook(() => {
      renderCount.current++
      return useInputDevice()
    })

    const initialRenders = renderCount.current

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'))
    })

    // Should not cause extra renders since device was already 'mouse'
    expect(renderCount.current).toBe(initialRenders)
  })
})
