import { MOSAIC_ROW_UNIT, MOSAIC_GAP } from './mosaicGrid'

export interface MosaicLayoutItem {
  index: number
  x: number
  y: number
  width: number
  height: number
}

export interface MosaicLayoutResult {
  items: MosaicLayoutItem[]
  totalHeight: number
}

export interface MosaicSpan {
  colSpan: number
  rowSpan: number
}

/**
 * Returns the number of grid columns for a given container width,
 * matching the Tailwind responsive breakpoints used in the CSS Grid path.
 */
export function getColumnCount(containerWidth: number): number {
  if (containerWidth >= 1280) return 12
  if (containerWidth >= 1024) return 10
  if (containerWidth >= 768) return 8
  if (containerWidth >= 640) return 6
  return 4
}

/**
 * Computes absolute `{ x, y, width, height }` positions for every item using
 * a greedy column-fill algorithm that mirrors CSS Grid's `dense` packing.
 *
 * The algorithm maintains a heightmap (one entry per column) tracking the next
 * available row. For each item, it finds the column range that allows the item
 * to be placed at the lowest possible row (filling gaps first).
 */
export function computeMosaicLayout(
  spans: MosaicSpan[],
  columnCount: number,
  columnWidth: number,
  gap: number = MOSAIC_GAP,
  rowUnit: number = MOSAIC_ROW_UNIT,
): MosaicLayoutResult {
  if (spans.length === 0 || columnCount <= 0 || columnWidth <= 0) {
    return { items: [], totalHeight: 0 }
  }

  const heightmap = new Array<number>(columnCount).fill(0)
  const items: MosaicLayoutItem[] = []

  for (let i = 0; i < spans.length; i++) {
    const { colSpan: rawColSpan, rowSpan } = spans[i]
    // Clamp colSpan to not exceed column count
    const colSpan = Math.min(rawColSpan, columnCount)

    // Find best starting column: the one where the tallest column in the
    // occupied range is shortest (greedy dense packing).
    let bestCol = 0
    let bestMaxRow = Infinity

    for (let c = 0; c <= columnCount - colSpan; c++) {
      let maxRow = 0
      for (let j = c; j < c + colSpan; j++) {
        if (heightmap[j] > maxRow) maxRow = heightmap[j]
      }
      if (maxRow < bestMaxRow) {
        bestMaxRow = maxRow
        bestCol = c
      }
    }

    const topRow = bestMaxRow
    const x = bestCol * (columnWidth + gap)
    const y = topRow * (rowUnit + gap)
    const width = colSpan * columnWidth + (colSpan - 1) * gap
    const height = rowSpan * rowUnit + (rowSpan - 1) * gap

    items.push({ index: i, x, y, width, height })

    // Update heightmap for occupied columns
    for (let c = bestCol; c < bestCol + colSpan; c++) {
      heightmap[c] = topRow + rowSpan
    }
  }

  const maxRow = Math.max(...heightmap)
  const totalHeight = maxRow > 0 ? maxRow * (rowUnit + gap) - gap : 0

  return { items, totalHeight }
}
