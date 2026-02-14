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

  it('becomes visible after scrolling (second scroll change)', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: defaultOptions },
    )

    // First scroll change is skipped (treated as programmatic scroll-to-top)
    rerender({ ...defaultOptions, scrollTop: 100 })
    expect(result.current.isVisible).toBe(false)

    // Second scroll change triggers visibility
    rerender({ ...defaultOptions, scrollTop: 200 })
    expect(result.current.isVisible).toBe(true)
  })

  it('hides after hideDelay expires', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: { ...defaultOptions, hideDelay: 500 } },
    )

    // Skip first scroll, trigger on second
    rerender({ ...defaultOptions, hideDelay: 500, scrollTop: 100 })
    rerender({ ...defaultOptions, hideDelay: 500, scrollTop: 200 })
    expect(result.current.isVisible).toBe(true)

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isVisible).toBe(false)
  })

  it('resets visibility when sortBy changes', () => {
    const { result, rerender } = renderHook(
      (props: UseScrollLetterIndicatorOptions) => useScrollLetterIndicator(props),
      { initialProps: defaultOptions },
    )

    // Scroll to become visible
    rerender({ ...defaultOptions, scrollTop: 100 })
    rerender({ ...defaultOptions, scrollTop: 200 })
    expect(result.current.isVisible).toBe(true)

    // Change sort mode
    rerender({ ...defaultOptions, scrollTop: 200, sortBy: 'platform' })
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
