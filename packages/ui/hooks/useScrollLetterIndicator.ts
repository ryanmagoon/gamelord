import { useState, useEffect, useRef, useMemo } from 'react'
import type { Game } from '../components/GameCard'

export interface UseScrollLetterIndicatorOptions {
  /** Index of the first visible game in the games array. -1 if unknown/empty. */
  firstVisibleIndex: number
  /** The sorted/filtered games array. */
  games: Game[]
  /** Current sort mode. Indicator only shows for 'title'. */
  sortBy: string
  /** Current scrollTop from useScrollContainer. Used to detect scroll activity. */
  scrollTop: number
  /** Delay in ms before hiding the letter after scrolling stops. @default 400 */
  hideDelay?: number
  /**
   * Minimum scroll speed in px/ms required to show the indicator.
   * Below this threshold the indicator stays hidden even when crossing
   * letter boundaries.
   * @default 2.5
   */
  minSpeedPxPerMs?: number
}

export interface ScrollLetterIndicatorState {
  /** The current letter to display, or null if nothing to show. */
  letter: string | null
  /** Whether the indicator is currently visible (actively scrolling). */
  isVisible: boolean
}

/**
 * Computes a display letter from a game title's first character.
 * A-Z letters are returned uppercase; everything else becomes '#'.
 */
export function getLetterFromTitle(title: string): string {
  const char = title[0]?.toUpperCase() ?? ''
  return /[A-Z]/.test(char) ? char : '#'
}

/**
 * Tracks which alphabetical section is visible during scrolling and controls
 * the visibility of a letter overlay indicator (Steam-style).
 *
 * The indicator only appears when scrolling fast enough AND crossing a letter
 * boundary. Slow browsing within a single letter section won't trigger it.
 *
 * Only activates when `sortBy === 'title'`. Returns `letter: null` otherwise.
 */
export function useScrollLetterIndicator(
  options: UseScrollLetterIndicatorOptions,
): ScrollLetterIndicatorState {
  const {
    firstVisibleIndex,
    games,
    sortBy,
    scrollTop,
    hideDelay = 400,
    minSpeedPxPerMs = 2.5,
  } = options
  const [isVisible, setIsVisible] = useState(false)
  const isVisibleRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const prevScrollTopRef = useRef(scrollTop)
  const prevLetterRef = useRef<string | null>(null)
  const prevScrollTimeRef = useRef(Date.now())
  const hasScrolledRef = useRef(false)

  const letter = useMemo(() => {
    if (sortBy !== 'title' || firstVisibleIndex < 0 || firstVisibleIndex >= games.length) {
      return null
    }
    return getLetterFromTitle(games[firstVisibleIndex].title)
  }, [sortBy, firstVisibleIndex, games])

  // Scroll activity detection — only show when fast-scrolling across letter boundaries
  useEffect(() => {
    if (scrollTop === prevScrollTopRef.current) return

    const now = Date.now()
    const deltaTime = now - prevScrollTimeRef.current
    const deltaScroll = Math.abs(scrollTop - prevScrollTopRef.current)
    prevScrollTopRef.current = scrollTop
    prevScrollTimeRef.current = now

    // Skip the first scroll change (e.g. programmatic scroll-to-top on filter change)
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true
      prevLetterRef.current = letter
      return
    }

    if (sortBy !== 'title' || letter === null) return

    // Compute scroll speed (px/ms). Guard against deltaTime === 0.
    const speed = deltaTime > 0 ? deltaScroll / deltaTime : 0
    const isFast = speed >= minSpeedPxPerMs

    const crossedLetterBoundary = letter !== prevLetterRef.current
    prevLetterRef.current = letter

    // Trigger: fast scroll across a letter boundary
    if (crossedLetterBoundary && isFast) {
      isVisibleRef.current = true
      setIsVisible(true)
    }

    // Reset the hide timer whenever scrolling fast while indicator is up.
    // This keeps the indicator alive during continuous fast scrolling, even
    // within a single letter section. The countdown only begins once scrolling
    // slows down or stops.
    if (isVisibleRef.current && isFast) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        isVisibleRef.current = false
        setIsVisible(false)
      }, hideDelay)
    }
  }, [scrollTop, sortBy, letter, hideDelay, minSpeedPxPerMs])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current)
  }, [])

  // Reset when sort mode or games change
  useEffect(() => {
    isVisibleRef.current = false
    setIsVisible(false)
    hasScrolledRef.current = false
    prevLetterRef.current = null
  }, [sortBy, games])

  return { letter, isVisible }
}
