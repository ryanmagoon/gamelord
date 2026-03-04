import { useState, useCallback, useRef, useEffect } from 'react'

export interface UseEdgeAwareHoverOptions {
  /** Scale factor applied on hover. @default 1.25 */
  scaleFactor?: number
  /** Extra padding in px to keep clear of container edges (border + glow). @default 18 */
  glowPadding?: number
  /** Disable the effect (e.g. during launch or when card is disabled). */
  disabled?: boolean
  /** Lock the current translate in place (e.g. while launching). Prevents onPointerLeave from clearing the offset. */
  locked?: boolean
}

export interface UseEdgeAwareHoverResult {
  onPointerEnter: (e: React.PointerEvent) => void
  onPointerLeave: () => void
  /** Pixel offset to shift the card inward. `null` when no shift is needed. */
  edgeTranslate: { x: number; y: number } | null
}

/**
 * Finds the nearest scrollable ancestor of an element by checking computed
 * overflow styles. Returns `document.documentElement` as fallback.
 */
export function findScrollContainer(el: HTMLElement): HTMLElement {
  let parent = el.parentElement
  while (parent && parent !== document.documentElement) {
    const style = getComputedStyle(parent)
    if (/auto|scroll|hidden/.test(style.overflow + style.overflowX + style.overflowY)) {
      return parent
    }
    parent = parent.parentElement
  }
  return document.documentElement
}

/**
 * Computes how much a card needs to shift so its scaled-up version
 * (plus glow padding) stays within the container bounds.
 *
 * Returns `null` if no shift is needed.
 */
export function computeEdgeTranslate(
  cardRect: DOMRect,
  containerRect: DOMRect,
  scaleFactor: number,
  glowPadding: number,
): { x: number; y: number } | null {
  const extraW = (cardRect.width * (scaleFactor - 1)) / 2
  const extraH = (cardRect.height * (scaleFactor - 1)) / 2

  const scaledLeft = cardRect.left - extraW
  const scaledRight = cardRect.right + extraW
  const scaledTop = cardRect.top - extraH
  const scaledBottom = cardRect.bottom + extraH

  let shiftX = 0
  let shiftY = 0

  // Left edge overflow
  if (scaledLeft - glowPadding < containerRect.left) {
    shiftX = containerRect.left - (scaledLeft - glowPadding)
  }
  // Right edge overflow (only if not already shifting right)
  if (scaledRight + glowPadding > containerRect.right) {
    shiftX = containerRect.right - (scaledRight + glowPadding)
  }
  // Top edge overflow
  if (scaledTop - glowPadding < containerRect.top) {
    shiftY = containerRect.top - (scaledTop - glowPadding)
  }
  // Bottom edge overflow
  if (scaledBottom + glowPadding > containerRect.bottom) {
    shiftY = containerRect.bottom - (scaledBottom + glowPadding)
  }

  if (shiftX === 0 && shiftY === 0) return null
  return { x: Math.round(shiftX), y: Math.round(shiftY) }
}

/**
 * Hook that computes a translate offset on hover so scaled-up cards don't
 * get clipped by the nearest scroll container. Mimics NSO-style behavior
 * where edge cards shift inward to remain fully visible.
 */
export function useEdgeAwareHover({
  scaleFactor = 1.25,
  glowPadding = 18,
  disabled = false,
  locked = false,
}: UseEdgeAwareHoverOptions = {}): UseEdgeAwareHoverResult {
  const [edgeTranslate, setEdgeTranslate] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  const onPointerEnter = useCallback((e: React.PointerEvent) => {
    if (disabled) return

    const el = e.currentTarget as HTMLElement
    // Cache the scroll container — it doesn't change between hovers
    if (!containerRef.current) {
      containerRef.current = findScrollContainer(el)
    }

    const cardRect = el.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    setEdgeTranslate(computeEdgeTranslate(cardRect, containerRect, scaleFactor, glowPadding))
  }, [disabled, scaleFactor, glowPadding])

  const onPointerLeave = useCallback(() => {
    if (locked) return
    setEdgeTranslate(null)
  }, [locked])

  // Clear translate when lock releases (launch ended, pointer already left)
  const prevLockedRef = useRef(locked)
  useEffect(() => {
    if (prevLockedRef.current && !locked) {
      setEdgeTranslate(null)
    }
    prevLockedRef.current = locked
  }, [locked])

  return { onPointerEnter, onPointerLeave, edgeTranslate }
}
