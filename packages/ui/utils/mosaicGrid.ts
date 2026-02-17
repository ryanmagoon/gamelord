/** Fixed height for every card row, in pixels. */
export const ROW_HEIGHT = 280

/** Gap between grid items in pixels. Must match the CSS `gap-1` value (0.25rem = 4px). */
export const MOSAIC_GAP = 4

/**
 * Computes the pixel width of a card given a fixed row height and aspect ratio.
 * Width = height * aspectRatio. Ensures a minimum width so very tall art
 * doesn't collapse into a sliver.
 */
export function computeCardWidth(aspectRatio: number): number {
  return Math.max(80, Math.round(ROW_HEIGHT * aspectRatio))
}
