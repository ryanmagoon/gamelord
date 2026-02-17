import { ROW_HEIGHT, MOSAIC_GAP } from './mosaicGrid'

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

/**
 * Maximum allowed height for a justified row, as a multiple of the base
 * row height. Rows that would exceed this cap get more items packed in
 * to keep the height reasonable (e.g. systems with uniformly tall art).
 */
const MAX_ROW_HEIGHT_FACTOR = 1.4

/**
 * Computes absolute `{ x, y, width, height }` positions for every item using
 * a justified row layout (like Google Photos or Flickr).
 *
 * Cards are packed left-to-right. At each step we compute what the justified
 * row height *would be* if we finalized the row at the current card. A row is
 * finalized when adding the next card would push the justified height below
 * the base row height (meaning the row is packed tightly enough). The last
 * row is left unjustified to avoid grotesquely stretched cards when only one
 * or two remain.
 */
export function computeRowLayout(
  aspectRatios: number[],
  containerWidth: number,
  gap: number = MOSAIC_GAP,
  baseRowHeight: number = ROW_HEIGHT,
): MosaicLayoutResult {
  if (aspectRatios.length === 0 || containerWidth <= 0) {
    return { items: [], totalHeight: 0 }
  }

  const maxRowHeight = baseRowHeight * MAX_ROW_HEIGHT_FACTOR

  const items: MosaicLayoutItem[] = []
  let y = 0

  let rowStart = 0

  for (let i = 0; i < aspectRatios.length; i++) {
    // Placeholder — justified rows overwrite these values
    items.push({ index: i, x: 0, y, width: 0, height: baseRowHeight })

    // Compute what the justified height would be if we finalized at item i
    const rowHeight = justifiedRowHeight(aspectRatios, rowStart, i + 1, containerWidth, gap)

    // If adding this card made the row tight enough (height ≤ target), finalize
    if (rowHeight <= baseRowHeight) {
      // Finalize row rowStart..i
      y = justifyRow(items, aspectRatios, rowStart, i + 1, containerWidth, gap, y)
      rowStart = i + 1
    } else if (i === aspectRatios.length - 1) {
      // Last item: don't justify the final row. If the row would be too tall
      // (not enough items to fill the width), cap it at maxRowHeight.
      if (rowHeight > maxRowHeight) {
        // Use capped height and scale widths proportionally
        y = layoutRowAtHeight(items, aspectRatios, rowStart, i + 1, Math.round(maxRowHeight), gap, y)
      } else {
        // Lay out at natural base height (unjustified)
        let x = 0
        for (let j = rowStart; j <= i; j++) {
          const w = Math.round(baseRowHeight * aspectRatios[j])
          items[j].x = x
          items[j].y = y
          items[j].width = Math.max(80, w)
          items[j].height = baseRowHeight
          x += items[j].width + gap
        }
        y += baseRowHeight
      }
    }
  }

  return { items, totalHeight: y }
}

/**
 * Computes what the row height would be if items[rowStart..rowEnd) were
 * justified to fill the container width.
 *
 * The idea: total aspect ratio of the row = sum of individual ARs.
 * Justified height = (containerWidth - totalGap) / totalAR
 */
function justifiedRowHeight(
  aspectRatios: number[],
  rowStart: number,
  rowEnd: number,
  containerWidth: number,
  gap: number,
): number {
  const count = rowEnd - rowStart
  const totalGap = (count - 1) * gap
  let totalAR = 0
  for (let i = rowStart; i < rowEnd; i++) {
    totalAR += Math.max(80 / ROW_HEIGHT, aspectRatios[i])
  }
  return (containerWidth - totalGap) / totalAR
}

/**
 * Justify a row by computing the exact height that makes all cards fill the
 * container width, then laying out each card. Returns the y for the next row.
 */
function justifyRow(
  items: MosaicLayoutItem[],
  aspectRatios: number[],
  rowStart: number,
  rowEnd: number,
  containerWidth: number,
  gap: number,
  y: number,
): number {
  const rowHeight = Math.round(
    justifiedRowHeight(aspectRatios, rowStart, rowEnd, containerWidth, gap),
  )
  return layoutRowAtHeight(items, aspectRatios, rowStart, rowEnd, rowHeight, gap, y)
}

/**
 * Lay out a row at a specific height, computing card widths from their
 * aspect ratios. The last card absorbs rounding remainder. Returns the y
 * for the next row.
 */
function layoutRowAtHeight(
  items: MosaicLayoutItem[],
  aspectRatios: number[],
  rowStart: number,
  rowEnd: number,
  rowHeight: number,
  gap: number,
  y: number,
): number {
  let x = 0
  for (let i = rowStart; i < rowEnd; i++) {
    items[i].x = x
    items[i].y = y
    items[i].height = rowHeight

    if (i === rowEnd - 1) {
      // Last card absorbs rounding remainder so the row fills exactly
      items[i].width = Math.max(80, Math.round(rowHeight * aspectRatios[i]))
    } else {
      const w = Math.max(80, Math.round(rowHeight * aspectRatios[i]))
      items[i].width = w
      x += w + gap
    }
  }

  return y + rowHeight + gap
}
