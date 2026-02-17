import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useScrollLetterIndicator,
  getLetterFromTitle,
  type UseScrollLetterIndicatorOptions,
} from './useScrollLetterIndicator'

const makeGames = (titles: string[]) =>
  titles.map((title, i) => ({
    id: String(i),
    title,
    platform: 'NES',
    romPath: `/roms/${i}.nes`,
  }))

const defaultOptions: UseScrollLetterIndicatorOptions = {
  firstVisibleIndex: 0,
  games: makeGames(['Alpha', 'Beta', 'Charlie', 'Delta']),
  sortBy: 'title',
  scrollTop: 0,
}

describe('getLetterFromTitle', () => {
  it('returns uppercase letter for alphabetic titles', () => {
    expect(getLetterFromTitle('mario')).toBe('M')
    expect(getLetterFromTitle('Zelda')).toBe('Z')
  })

  it('returns # for numeric titles', () => {
    expect(getLetterFromTitle('1942')).toBe('#')
    expect(getLetterFromTitle('007 GoldenEye')).toBe('#')
  })

  it('returns # for non-latin characters', () => {
    expect(getLetterFromTitle('!Special')).toBe('#')
    expect(getLetterFromTitle('$Dollar')).toBe('#')
  })

  it('returns # for empty string', () => {
    expect(getLetterFromTitle('')).toBe('#')
  })
})

describe('useScrollLetterIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns correct letter for first visible game', () => {
    const { result } = renderHook(() => useScrollLetterIndicator(defaultOptions))
    expect(result.current.letter).toBe('A')
  })

  it('returns letter matching the firstVisibleIndex', () => {
    const { result } = renderHook(() =>
      useScrollLetterIndicator({ ...defaultOptions, firstVisibleIndex: 2 }),
    )
    expect(result.current.letter).toBe('C')
  })

  it('returns null letter when sortBy is not title', () => {
    for (const sortBy of ['platform', 'lastPlayed', 'recent']) {
      const { result } = renderHook(() =>
        useScrollLetterIndicator({ ...defaultOptions, sortBy }),
      )
      expect(result.current.letter).toBeNull()
    }
  })

  it('returns null letter when firstVisibleIndex is -1', () => {
    const { result } = renderHook(() =>
      useScrollLetterIndicator({ ...defaultOptions, firstVisibleIndex: -1 }),
    )
    expect(result.current.letter).toBeNull()
  })

  it('returns null letter when games array is empty', () => {
    const { result } = renderHook(() =>
      useScrollLetterIndicator({ ...defaultOptions, games: [], firstVisibleIndex: 0 }),
    )
    expect(result.current.letter).toBeNull()
  })

  it('returns # for games starting with numbers', () => {
    const games = makeGames(['1942', 'Alpha'])
    const { result } = renderHook(() =>
      useScrollLetterIndicator({ ...defaultOptions, games, firstVisibleIndex: 0 }),
    )
    expect(result.current.letter).toBe('#')
  })

  it('is not visible initially', () => {
    const { result } = renderHook(() => useScrollLetterIndicator(defaultOptions))
    expect(result.current.isVisible).toBe(false)
  })

  it('stays hidden when scrolling without crossing a letter boundary', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: defaultOptions },
    )

    // First scroll (skipped as programmatic)
    rerender({ ...defaultOptions, scrollTop: 100 })
    expect(result.current.isVisible).toBe(false)

    // Second scroll — still letter A, no boundary crossed
    rerender({ ...defaultOptions, scrollTop: 200 })
    expect(result.current.isVisible).toBe(false)
  })

  it('becomes visible when fast-scrolling across a letter boundary', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: { ...defaultOptions, minSpeedPxPerMs: 0 } },
    )

    // First scroll (skipped as programmatic)
    rerender({ ...defaultOptions, minSpeedPxPerMs: 0, scrollTop: 100 })
    expect(result.current.isVisible).toBe(false)

    // Second scroll crosses letter boundary (A -> B)
    rerender({
      ...defaultOptions,
      minSpeedPxPerMs: 0,
      scrollTop: 500,
      firstVisibleIndex: 1,
    })
    expect(result.current.isVisible).toBe(true)
  })

  it('stays hidden when scrolling slowly across a letter boundary', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: { ...defaultOptions, minSpeedPxPerMs: 5 } },
    )

    // First scroll (skipped)
    vi.setSystemTime(now + 100)
    rerender({ ...defaultOptions, minSpeedPxPerMs: 5, scrollTop: 10 })

    // Slow scroll that crosses letter boundary: 20px in 100ms = 0.2 px/ms (< 5)
    vi.setSystemTime(now + 200)
    rerender({
      ...defaultOptions,
      minSpeedPxPerMs: 5,
      scrollTop: 30,
      firstVisibleIndex: 1,
    })
    expect(result.current.isVisible).toBe(false)
  })

  it('shows indicator when scrolling fast enough across a letter boundary', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: { ...defaultOptions, minSpeedPxPerMs: 2 } },
    )

    // First scroll (skipped)
    vi.setSystemTime(now + 10)
    rerender({ ...defaultOptions, minSpeedPxPerMs: 2, scrollTop: 100 })

    // Fast scroll crossing letter boundary: 500px in 10ms = 50 px/ms (> 2)
    vi.setSystemTime(now + 20)
    rerender({
      ...defaultOptions,
      minSpeedPxPerMs: 2,
      scrollTop: 600,
      firstVisibleIndex: 1,
    })
    expect(result.current.isVisible).toBe(true)
  })

  it('stays visible while fast-scrolling within a letter section', () => {
    const now = Date.now()
    vi.setSystemTime(now)

    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: { ...defaultOptions, hideDelay: 300, minSpeedPxPerMs: 1 } },
    )

    // First scroll (skipped)
    vi.setSystemTime(now + 10)
    rerender({ ...defaultOptions, hideDelay: 300, minSpeedPxPerMs: 1, scrollTop: 100 })

    // Fast scroll crossing letter boundary A -> B (triggers indicator)
    vi.setSystemTime(now + 20)
    rerender({
      ...defaultOptions,
      hideDelay: 300,
      minSpeedPxPerMs: 1,
      scrollTop: 600,
      firstVisibleIndex: 1,
    })
    expect(result.current.isVisible).toBe(true)

    // Advance 200ms (within hideDelay), keep fast-scrolling within letter B
    vi.setSystemTime(now + 220)
    rerender({
      ...defaultOptions,
      hideDelay: 300,
      minSpeedPxPerMs: 1,
      scrollTop: 1200,
      firstVisibleIndex: 1,
    })
    // Should still be visible — timer was reset
    expect(result.current.isVisible).toBe(true)

    // Advance another 200ms, still scrolling fast within B
    vi.setSystemTime(now + 420)
    rerender({
      ...defaultOptions,
      hideDelay: 300,
      minSpeedPxPerMs: 1,
      scrollTop: 1800,
      firstVisibleIndex: 1,
    })
    expect(result.current.isVisible).toBe(true)

    // Now stop scrolling — hideDelay (300ms) elapses
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.isVisible).toBe(false)
  })

  it('hides after hideDelay expires', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: { ...defaultOptions, hideDelay: 500, minSpeedPxPerMs: 0 } },
    )

    // Skip first scroll, trigger on second with letter change
    rerender({ ...defaultOptions, hideDelay: 500, minSpeedPxPerMs: 0, scrollTop: 100 })
    rerender({
      ...defaultOptions,
      hideDelay: 500,
      minSpeedPxPerMs: 0,
      scrollTop: 500,
      firstVisibleIndex: 1,
    })
    expect(result.current.isVisible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isVisible).toBe(false)
  })

  it('resets visibility when sortBy changes', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: { ...defaultOptions, minSpeedPxPerMs: 0 } },
    )

    // Scroll to become visible (with letter change)
    rerender({ ...defaultOptions, minSpeedPxPerMs: 0, scrollTop: 100 })
    rerender({
      ...defaultOptions,
      minSpeedPxPerMs: 0,
      scrollTop: 500,
      firstVisibleIndex: 1,
    })
    expect(result.current.isVisible).toBe(true)

    // Change sort mode
    rerender({
      ...defaultOptions,
      minSpeedPxPerMs: 0,
      scrollTop: 500,
      firstVisibleIndex: 1,
      sortBy: 'platform',
    })
    expect(result.current.isVisible).toBe(false)
  })

  it('updates letter when firstVisibleIndex changes', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: defaultOptions },
    )

    expect(result.current.letter).toBe('A')
    rerender({ ...defaultOptions, firstVisibleIndex: 3 })
    expect(result.current.letter).toBe('D')
  })
})
