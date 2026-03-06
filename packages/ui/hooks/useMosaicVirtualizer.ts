import { useMemo } from 'react'
import type { MosaicLayoutResult } from '../utils/mosaicLayout'

export interface UseMosaicVirtualizerOptions {
  /** Pre-computed layout from computeMosaicLayout. */
  layout: MosaicLayoutResult
  /** Extra pixels above and below viewport to render. @default 1500 */
  overscan?: number
  /** Current scroll offset of the scroll container, relative to the grid top. */
  scrollTop: number
  /** Height of the visible viewport. */
  viewportHeight: number
}

export interface UseMosaicVirtualizerResult {
  /** Total height of the grid container. */
  totalHeight: number
  /** Indices of items to render (into the original items array). */
  visibleIndices: Array<number>
}

/**
 * Given a pre-computed mosaic layout and the current scroll viewport,
 * returns only the indices of items that are visible (plus overscan).
 */
export function useMosaicVirtualizer(
  options: UseMosaicVirtualizerOptions,
): UseMosaicVirtualizerResult {
  const { layout, overscan = 1500, scrollTop, viewportHeight } = options

  return useMemo(() => {
    const top = scrollTop - overscan
    const bottom = scrollTop + viewportHeight + overscan
    const visibleIndices: Array<number> = []

    for (const item of layout.items) {
      const itemBottom = item.y + item.height
      if (itemBottom > top && item.y < bottom) {
        visibleIndices.push(item.index)
      }
    }

    return { totalHeight: layout.totalHeight, visibleIndices }
  }, [layout, scrollTop, viewportHeight, overscan])
}
