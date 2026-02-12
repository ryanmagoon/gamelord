import { useState, useEffect, type RefObject } from 'react'

export interface ScrollContainerState {
  scrollTop: number
  viewportHeight: number
}

/**
 * Tracks scroll position (RAF-throttled) and viewport height of a scroll container.
 * Returns `{ scrollTop, viewportHeight }` that update reactively.
 */
export function useScrollContainer(
  scrollRef: RefObject<HTMLElement | null> | undefined,
): ScrollContainerState {
  const [state, setState] = useState<ScrollContainerState>({
    scrollTop: 0,
    viewportHeight: 0,
  })

  useEffect(() => {
    const element = scrollRef?.current
    if (!element) return

    // Measure initial viewport height
    setState(prev => ({ ...prev, viewportHeight: element.clientHeight }))

    // Track viewport height changes
    const ro = new ResizeObserver(() => {
      setState(prev => ({ ...prev, viewportHeight: element.clientHeight }))
    })
    ro.observe(element)

    // Track scroll position, throttled to one update per animation frame
    let rafId = 0
    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        setState(prev => ({ ...prev, scrollTop: element.scrollTop }))
        rafId = 0
      })
    }
    element.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      ro.disconnect()
      element.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [scrollRef])

  return state
}
