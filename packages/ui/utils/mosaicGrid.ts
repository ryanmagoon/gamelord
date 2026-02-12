/** Base row height unit in pixels. Cards span multiples of this. */
export const MOSAIC_ROW_UNIT = 48

/** Gap between grid items in pixels. Must match the CSS `gap-1` value (0.25rem = 4px). */
export const MOSAIC_GAP = 4

/**
 * Canonical aspect ratio buckets for common box art proportions.
 * Raw aspect ratios are snapped to the nearest bucket so that games with
 * nearly identical cover art dimensions get the exact same card size.
 */
export const ASPECT_RATIO_BUCKETS = [
  0.667, // 2:3  — tall portrait (SNES JP, some Genesis)
  0.700, // 7:10 — GBA, some NES
  0.750, // 3:4  — most common portrait (NES, SNES, PS1)
  0.800, // 4:5  — some GB, GBC
  1.000, // 1:1  — square covers
  1.250, // 5:4  — slightly landscape
  1.333, // 4:3  — standard landscape (Genesis, some GBA)
  1.500, // 3:2  — wide landscape
] as const

/**
 * Snaps a raw aspect ratio to the nearest canonical bucket.
 * This ensures that games with nearly identical cover art dimensions
 * (e.g. 0.7142857 vs 0.7134670) produce identical card sizes.
 */
export function snapAspectRatio(aspectRatio: number): number {
  let closest: number = ASPECT_RATIO_BUCKETS[0]
  let minDiff = Math.abs(aspectRatio - closest)
  for (let i = 1; i < ASPECT_RATIO_BUCKETS.length; i++) {
    const diff = Math.abs(aspectRatio - ASPECT_RATIO_BUCKETS[i])
    if (diff < minDiff) {
      minDiff = diff
      closest = ASPECT_RATIO_BUCKETS[i]
    }
  }
  return closest
}

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
 * The raw aspect ratio is snapped to the nearest canonical bucket first,
 * ensuring uniform card sizes for same-shaped box art.
 *
 * - Portrait artwork (AR <= 1): col-span-2
 * - Landscape artwork (AR > 1): col-span-3
 */
export function getMosaicSpans(
  aspectRatio: number,
  columnWidth: number,
): { colSpan: number; rowSpan: number } {
  const snapped = snapAspectRatio(aspectRatio)
  const colSpan = snapped > 1 ? 3 : 2
  const rowSpan = computeRowSpan(snapped, colSpan, columnWidth)
  return { colSpan, rowSpan }
}
