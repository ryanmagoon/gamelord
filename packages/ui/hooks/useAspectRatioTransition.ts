import { useRef, useCallback, useLayoutEffect, useEffect } from 'react'

/** Duration of the height transition in ms. */
const DEFAULT_DURATION = 400
const DEFAULT_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)'

export interface UseAspectRatioTransitionOptions {
  /** Target aspect ratio (width / height). */
  aspectRatio: number
  /**
   * When true, triggers the height transition if the aspect ratio changed
   * since the previous render. Typically set to `true` when artwork just
   * loaded (e.g. `artworkSyncPhase === 'done'`).
   */
  enabled: boolean
  /** Duration of the height transition in ms. @default 400 */
  duration?: number
  /** CSS easing for the height transition. @default 'cubic-bezier(0.25, 1, 0.5, 1)' */
  easing?: string
  /**
   * Called just before the height transition starts, with the current height.
   * Use this to pin overlay elements so they don't stretch during the resize.
   */
  onResizeStart?: (currentHeight: number) => void
  /**
   * Called once the height transition finishes (or immediately if no height
   * change was needed). Use this to sequence the cross-fade after the resize.
   */
  onResizeComplete?: () => void
  /**
   * Whether to animate the container height when the aspect ratio changes.
   * When `false`, the hook fires `onResizeComplete` immediately without
   * animating — useful when the grid controls card height via row-span.
   * @default true
   */
  animateHeight?: boolean
}

export interface UseAspectRatioTransitionResult {
  /** Ref callback — attach to the container element. */
  containerRef: (element: HTMLElement | null) => void
}

/**
 * Smoothly animates a container's height when its aspect ratio changes.
 *
 * Entirely imperative: sets `aspect-ratio` on the element via the ref and
 * uses direct `element.style` manipulation for the height transition.
 * Zero React state changes during animation — the TV static canvas keeps
 * running without any frame drops.
 */
export function useAspectRatioTransition(
  options: UseAspectRatioTransitionOptions,
): UseAspectRatioTransitionResult {
  const {
    aspectRatio,
    enabled,
    duration = DEFAULT_DURATION,
    easing = DEFAULT_EASING,
    onResizeStart,
    onResizeComplete,
    animateHeight = true,
  } = options

  const elementRef = useRef<HTMLElement | null>(null)
  const previousRatioRef = useRef<number | null>(null)
  /** Active cleanup timeout so we can cancel on unmount. */
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Track the latest callbacks so closures always call the current ones. */
  const onResizeStartRef = useRef(onResizeStart)
  onResizeStartRef.current = onResizeStart
  const onResizeCompleteRef = useRef(onResizeComplete)
  onResizeCompleteRef.current = onResizeComplete
  const animateHeightRef = useRef(animateHeight)
  animateHeightRef.current = animateHeight

  const containerRef = useCallback((element: HTMLElement | null) => {
    elementRef.current = element
    // Set initial aspect ratio imperatively (skip when grid controls height)
    if (element && animateHeightRef.current) {
      element.style.aspectRatio = String(previousRatioRef.current ?? options.aspectRatio)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally stable

  // Apply aspect ratio changes imperatively — either animate or set directly.
  useLayoutEffect(() => {
    const element = elementRef.current
    const previousRatio = previousRatioRef.current
    previousRatioRef.current = aspectRatio

    if (!element) return

    // If not enabled or first render, just set the aspect ratio directly
    if (!enabled || previousRatio === null) {
      if (animateHeight) {
        element.style.aspectRatio = String(aspectRatio)
      }
      return
    }

    // Grid controls height via row-span — skip height animation, just signal
    // completion so the cross-fade can proceed.
    if (!animateHeight) {
      onResizeCompleteRef.current?.()
      return
    }

    // No change
    if (Math.abs(previousRatio - aspectRatio) < 0.001) {
      onResizeCompleteRef.current?.()
      return
    }

    // Measure current height BEFORE changing anything — element still has
    // the old aspect-ratio since we control it imperatively (React never
    // touches it).
    const currentHeight = element.getBoundingClientRect().height
    const currentWidth = element.getBoundingClientRect().width
    const targetHeight = currentWidth / aspectRatio

    // No visible difference
    if (Math.abs(currentHeight - targetHeight) < 1) {
      element.style.aspectRatio = String(aspectRatio)
      onResizeCompleteRef.current?.()
      return
    }

    // Cancel any in-flight transition
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current)
      cleanupRef.current = null
    }

    // --- Imperative FLIP: zero React re-renders ---

    // Notify caller so it can pin overlay elements (e.g. TVStatic canvas)
    onResizeStartRef.current?.(currentHeight)

    // Pin at current height, remove aspect-ratio so height is authoritative
    element.style.aspectRatio = 'auto'
    element.style.height = `${currentHeight}px`
    element.style.transition = 'none'

    // Force reflow so the browser registers the pinned state
    void element.offsetHeight

    // Animate to target height
    element.style.transition = `height ${duration}ms ${easing}`
    element.style.height = `${targetHeight}px`

    // After transition: release height, set final aspect-ratio
    cleanupRef.current = setTimeout(() => {
      element.style.height = ''
      element.style.transition = ''
      element.style.aspectRatio = String(aspectRatio)
      cleanupRef.current = null
      onResizeCompleteRef.current?.()
    }, duration + 16)
  }, [aspectRatio, enabled, duration, easing, animateHeight])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        clearTimeout(cleanupRef.current)
      }
    }
  }, [])

  return { containerRef }
}
