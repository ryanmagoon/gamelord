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
  /** Delay in ms before hiding the letter after scrolling stops. @default 800 */
  hideDelay?: number
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
 * Only activates when `sortBy === 'title'`. Returns `letter: null` otherwise.
 */
export function useScrollLetterIndicator(
  options: UseScrollLetterIndicatorOptions,
): ScrollLetterIndicatorState {
  const { firstVisibleIndex, games, sortBy, scrollTop, hideDelay = 800 } = options
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const prevScrollTopRef = useRef(scrollTop)
  const hasScrolledRef = useRef(false)

  const letter = useMemo(() => {
    if (sortBy !== 'title' || firstVisibleIndex < 0 || firstVisibleIndex >= games.length) {
      return null
    }
    return getLetterFromTitle(games[firstVisibleIndex].title)
  }, [sortBy, firstVisibleIndex, games])

  // Scroll activity detection
  useEffect(() => {
    if (scrollTop === prevScrollTopRef.current) return
    prevScrollTopRef.current = scrollTop

    // Skip the first scroll change (e.g. programmatic scroll-to-top on filter change)
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true
      return
    }

    if (sortBy !== 'title' || letter === null) return

    setIsVisible(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setIsVisible(false), hideDelay)
  }, [scrollTop, sortBy, letter, hideDelay])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current)
  }, [])

  // Reset when sort mode or games change
  useEffect(() => {
    setIsVisible(false)
    hasScrolledRef.current = false
  }, [sortBy, games])

  return { letter, isVisible }
}
