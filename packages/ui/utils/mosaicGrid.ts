/** Base row height unit in pixels. Cards span multiples of this. */
export const MOSAIC_ROW_UNIT = 48

/** Gap between grid items in pixels. Must match the CSS `gap-1` value (0.25rem = 4px). */
export const MOSAIC_GAP = 4

/**
 * Computes the number of grid rows a card should span given its aspect ratio,
 * column span, and the measured width of a single grid column.
 *
 * The formula accounts for gaps between rows:
 *   total height = rowSpan * rowUnit + (rowSpan - 1) * gap
 */
export function computeRowSpan(
  aspectRatio: number,
  colSpan: number,
  columnWidth: number,
): number {
  const cardWidth = colSpan * columnWidth + (colSpan - 1) * MOSAIC_GAP
  const cardHeight = cardWidth / aspectRatio
  const rawSpan = (cardHeight + MOSAIC_GAP) / (MOSAIC_ROW_UNIT + MOSAIC_GAP)
  return Math.max(2, Math.round(rawSpan))
}

/**
 * Returns the column span and row span for a game card based on its cover art
 * aspect ratio and the measured column width.
 *
 * - Portrait artwork (AR <= 1): col-span-2
 * - Landscape artwork (AR > 1): col-span-3
 */
export function getMosaicSpans(
  aspectRatio: number,
  columnWidth: number,
): { colSpan: number; rowSpan: number } {
  const colSpan = aspectRatio > 1 ? 3 : 2
  const rowSpan = computeRowSpan(aspectRatio, colSpan, columnWidth)
  return { colSpan, rowSpan }
}
