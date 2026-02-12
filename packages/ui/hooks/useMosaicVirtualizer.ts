import { useMemo } from 'react'
import type { MosaicLayoutResult } from '../utils/mosaicLayout'

export interface UseMosaicVirtualizerOptions {
  /** Pre-computed layout from computeMosaicLayout. */
  layout: MosaicLayoutResult
  /** Current scroll offset of the scroll container, relative to the grid top. */
  scrollTop: number
  /** Height of the visible viewport. */
  viewportHeight: number
  /** Extra pixels above and below viewport to render. @default 200 */
  overscan?: number
}

export interface UseMosaicVirtualizerResult {
  /** Indices of items to render (into the original items array). */
  visibleIndices: number[]
  /** Total height of the grid container. */
  totalHeight: number
}

/**
 * Given a pre-computed mosaic layout and the current scroll viewport,
 * returns only the indices of items that are visible (plus overscan).
 */
export function useMosaicVirtualizer(
  options: UseMosaicVirtualizerOptions,
): UseMosaicVirtualizerResult {
  const { layout, scrollTop, viewportHeight, overscan = 200 } = options

  return useMemo(() => {
    const top = scrollTop - overscan
    const bottom = scrollTop + viewportHeight + overscan
    const visibleIndices: number[] = []

    for (const item of layout.items) {
      const itemBottom = item.y + item.height
      if (itemBottom > top && item.y < bottom) {
        visibleIndices.push(item.index)
      }
    }

    return { visibleIndices, totalHeight: layout.totalHeight }
  }, [layout, scrollTop, viewportHeight, overscan])
}
