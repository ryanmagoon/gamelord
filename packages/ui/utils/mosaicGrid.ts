/** Fixed height for every card row, in pixels. */
export const ROW_HEIGHT = 280

/** Gap between grid items in pixels. Zero gap gives a dense, edge-to-edge tile look. */
export const MOSAIC_GAP = 0

/**
 * Computes the pixel width of a card given a fixed row height and aspect ratio.
 * Width = height * aspectRatio. Ensures a minimum width so very tall art
 * doesn't collapse into a sliver.
 */
export function computeCardWidth(aspectRatio: number): number {
  return Math.max(80, Math.round(ROW_HEIGHT * aspectRatio))
}
