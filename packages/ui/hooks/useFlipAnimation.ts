import { useState, useRef, useLayoutEffect, useCallback, type CSSProperties } from 'react'

/**
 * Animation state for an item managed by the FLIP hook.
 * - `stable`   — Item existed in both the previous and current list; it will
 *                slide smoothly to its new grid position.
 * - `entering` — Item is new to the list; it will play the entrance animation
 *                with a staggered delay.
 * - `exiting`  — Item was removed from the list; it is rendered at its last
 *                known position with a fade-out animation, then removed from
 *                the DOM.
 */
export type FlipAnimationState = 'stable' | 'entering' | 'exiting'

/** A single item returned by `useFlipAnimation`. */
export interface FlipItem<T> {
  item: T
  key: string
  /** Ref callback — attach to the DOM element for position measurement. */
  ref: (element: HTMLElement | null) => void
  /** Inline styles to apply (transforms, transitions, absolute positioning for exiters). */
  style: CSSProperties
  /** Current animation phase. */
  animationState: FlipAnimationState
  /**
   * Staggered entrance delay in ms (only meaningful when `animationState` is
   * `entering`). Apply as `animationDelay` on the entrance CSS animation.
   */
  enterDelay: number
}

export interface UseFlipAnimationOptions {
  /** Ref to the grid container element. Used to compute relative positions. */
  gridRef: React.RefObject<HTMLElement | null>
  /** Duration of the FLIP slide animation in ms. @default 300 */
  duration?: number
  /** CSS easing for the FLIP slide. @default 'cubic-bezier(0.25, 1, 0.5, 1)' */
  easing?: string
  /** Stagger interval between entering cards in ms. @default 40 */
  staggerEnter?: number
  /** Maximum stagger delay cap in ms. @default 600 */
  maxStaggerDelay?: number
  /** Duration of the exit animation in ms. @default 200 */
  exitDuration?: number
}

/** Shared style for stable (persisting) items — never changes, so React.memo sees the same reference. */
const STABLE_STYLE: CSSProperties = { position: 'relative', zIndex: 1 } as const

interface PositionRecord {
  left: number
  top: number
  width: number
  height: number
}

/**
 * FLIP (First, Last, Invert, Play) animation hook for smoothly transitioning
 * items in a CSS Grid when the list changes (e.g. filter switches).
 *
 * Persisting items slide to their new position, exiting items fade out at
 * their last position, and entering items play a staggered entrance animation.
 */
export function useFlipAnimation<T>(
  items: T[],
  getKey: (item: T) => string,
  options: UseFlipAnimationOptions,
): FlipItem<T>[] {
  const {
    gridRef,
    duration = 300,
    easing = 'cubic-bezier(0.25, 1, 0.5, 1)',
    staggerEnter = 40,
    maxStaggerDelay = 600,
    exitDuration = 200,
  } = options

  // ---- Refs (mutable across renders) ----

  /** Map of key -> DOM element, populated by ref callbacks. */
  const elementMapRef = useRef<Map<string, HTMLElement>>(new Map())
  /** Cached positions from the previous committed render. */
  const previousPositionsRef = useRef<Map<string, PositionRecord>>(new Map())
  /** Item snapshots from the previous render (needed to render exiters). */
  const previousItemsRef = useRef<Map<string, T>>(new Map())
  /** Ordered key list from the previous render — used to detect reordering vs property-only changes. */
  const previousKeyOrderRef = useRef<string[]>([])
  /** Whether any render has committed yet. */
  const isFirstRenderRef = useRef(true)
  /** Active cleanup timeouts. */
  const cleanupTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  // ---- State: exiting items that are still animating out ----
  const [exiters, setExiters] = useState<
    Map<string, { item: T; position: PositionRecord }>
  >(() => new Map())

  /** Measures element position relative to grid container. */
  const measurePosition = useCallback(
    (element: HTMLElement): PositionRecord | null => {
      const grid = gridRef.current
      if (!grid) return null
      const gridRect = grid.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()
      return {
        left: elementRect.left - gridRect.left,
        top: elementRect.top - gridRect.top,
        width: elementRect.width,
        height: elementRect.height,
      }
    },
    [gridRef],
  )

  /** Captures positions of all tracked elements. */
  const capturePositions = useCallback((): Map<string, PositionRecord> => {
    const positions = new Map<string, PositionRecord>()
    for (const [key, element] of elementMapRef.current) {
      const position = measurePosition(element)
      if (position) {
        positions.set(key, position)
      }
    }
    return positions
  }, [measurePosition])

  /** Creates a stable ref callback for a given item key. */
  const refCallbackCacheRef = useRef<Map<string, (element: HTMLElement | null) => void>>(new Map())

  const getRefCallback = useCallback((key: string) => {
    let callback = refCallbackCacheRef.current.get(key)
    if (!callback) {
      callback = (element: HTMLElement | null) => {
        if (element) {
          elementMapRef.current.set(key, element)
        } else {
          elementMapRef.current.delete(key)
        }
      }
      refCallbackCacheRef.current.set(key, callback)
    }
    return callback
  }, [])

  // ---- Single useLayoutEffect for all FLIP logic ----
  useLayoutEffect(() => {
    const currentKeys = items.map(getKey)
    const currentKeySet = new Set(currentKeys)

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false

      // Snapshot items for next transition
      const itemMap = new Map<string, T>()
      for (const item of items) {
        itemMap.set(getKey(item), item)
      }
      previousItemsRef.current = itemMap
      previousKeyOrderRef.current = currentKeys

      // Capture initial positions after first paint
      requestAnimationFrame(() => {
        previousPositionsRef.current = capturePositions()
      })
      return
    }

    const previousPositions = previousPositionsRef.current
    const previousItems = previousItemsRef.current
    const previousKeyOrder = previousKeyOrderRef.current

    // Detect whether the key sequence actually changed (items added, removed,
    // or reordered). If only item properties changed (e.g. coverArtAspectRatio
    // updated after artwork loads), skip the FLIP animation and just re-capture
    // positions so the grid reflows naturally without every card sliding around.
    const keysChanged =
      currentKeys.length !== previousKeyOrder.length ||
      currentKeys.some((key, i) => key !== previousKeyOrder[i])

    if (!keysChanged) {
      // Property-only change — just update refs and re-capture positions
      const itemMap = new Map<string, T>()
      for (const item of items) {
        itemMap.set(getKey(item), item)
      }
      previousItemsRef.current = itemMap
      requestAnimationFrame(() => {
        previousPositionsRef.current = capturePositions()
      })
      return
    }

    // ---- Classify items ----
    const newExiters = new Map<string, { item: T; position: PositionRecord }>()
    for (const [key, item] of previousItems) {
      if (!currentKeySet.has(key)) {
        const position = previousPositions.get(key)
        if (position) {
          newExiters.set(key, { item, position })
        }
      }
    }

    // Collect persisting items
    const persistingKeys: string[] = []
    for (const item of items) {
      const key = getKey(item)
      if (previousItems.has(key)) {
        persistingKeys.push(key)
      }
    }

    // ---- Exiting items ----
    if (newExiters.size > 0) {
      setExiters((previous) => {
        const next = new Map(previous)
        for (const [key, value] of newExiters) {
          next.set(key, value)
        }
        return next
      })

      const timer = setTimeout(() => {
        setExiters((previous) => {
          const next = new Map(previous)
          for (const key of newExiters.keys()) {
            next.delete(key)
          }
          return next
        })
        cleanupTimersRef.current.delete(timer)
      }, exitDuration + 16)

      cleanupTimersRef.current.add(timer)
    }

    // ---- FLIP persisting items ----
    const elementsToAnimate: Array<{
      element: HTMLElement
      deltaX: number
      deltaY: number
    }> = []

    for (const key of persistingKeys) {
      const element = elementMapRef.current.get(key)
      const oldPosition = previousPositions.get(key)
      if (!element || !oldPosition) continue

      const newPosition = measurePosition(element)
      if (!newPosition) continue

      const deltaX = oldPosition.left - newPosition.left
      const deltaY = oldPosition.top - newPosition.top

      // Skip if the delta is sub-pixel (no visible movement)
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue

      elementsToAnimate.push({ element, deltaX, deltaY })
    }

    if (elementsToAnimate.length > 0) {
      // Invert: snap to old position with no transition
      for (const { element, deltaX, deltaY } of elementsToAnimate) {
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`
        element.style.transition = 'none'
      }

      // Force synchronous reflow so the browser registers the inverted position.
      // Reading offsetHeight is the canonical way to trigger this.
      void gridRef.current?.offsetHeight

      // Play: animate from inverted position to natural position.
      // Use a brief delay (roughly half the exit duration) so exiting cards
      // begin fading out before persisting cards start sliding, preventing
      // the sliding cards from visually cutting through the fading ones.
      const slideDelay = Math.round(exitDuration * 0.4)
      setTimeout(() => {
        requestAnimationFrame(() => {
          for (const { element } of elementsToAnimate) {
            element.style.transition = `transform ${duration}ms ${easing}`
            element.style.transform = ''
          }
        })
      }, slideDelay)

      // Clean up inline styles after the slide animation completes
      const cleanupTimer = setTimeout(() => {
        for (const { element } of elementsToAnimate) {
          element.style.transition = ''
          element.style.transform = ''
        }
        previousPositionsRef.current = capturePositions()
        cleanupTimersRef.current.delete(cleanupTimer)
      }, slideDelay + duration + 16)

      cleanupTimersRef.current.add(cleanupTimer)
    } else {
      // No FLIP animation — just capture new positions
      requestAnimationFrame(() => {
        previousPositionsRef.current = capturePositions()
      })
    }

    // Snapshot current items for next transition
    const itemMap = new Map<string, T>()
    for (const item of items) {
      itemMap.set(getKey(item), item)
    }
    previousItemsRef.current = itemMap
    previousKeyOrderRef.current = currentKeys
  }, [items, getKey, duration, easing, exitDuration, capturePositions, measurePosition, gridRef])

  // ---- Build the output list ----

  const previousItems = previousItemsRef.current
  const isFirstRender = isFirstRenderRef.current

  // Memoize entering item styles keyed by delay so the same delay always
  // returns the same object reference (React.memo-friendly).
  const enteringStyleCache = useRef<Map<number, CSSProperties>>(new Map())

  let enterIndex = 0
  const result: FlipItem<T>[] = []

  // Current items
  for (const item of items) {
    const key = getKey(item)
    const isEntering = isFirstRender || !previousItems.has(key)
    const delay = isEntering ? Math.min(enterIndex * staggerEnter, maxStaggerDelay) : 0

    let style: CSSProperties
    if (isEntering) {
      // Cache entering styles by delay value so the same delay always yields
      // the same object reference across renders.
      let cached = enteringStyleCache.current.get(delay)
      if (!cached) {
        cached = { position: 'relative', zIndex: 1, animationDelay: `${delay}ms` }
        enteringStyleCache.current.set(delay, cached)
      }
      style = cached
    } else {
      style = STABLE_STYLE
    }

    result.push({
      item,
      key,
      ref: getRefCallback(key),
      style,
      animationState: isEntering ? 'entering' : 'stable',
      enterDelay: delay,
    })

    if (isEntering) enterIndex++
  }

  // Exiting items (absolute-positioned at their last known location)
  const currentKeySet = new Set(items.map(getKey))
  for (const [key, { item, position }] of exiters) {
    if (currentKeySet.has(key)) continue

    result.push({
      item,
      key,
      ref: getRefCallback(key),
      style: {
        position: 'absolute',
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
        zIndex: 0,
      },
      animationState: 'exiting',
      enterDelay: 0,
    })
  }

  return result
}
