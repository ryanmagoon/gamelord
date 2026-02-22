export interface VibeDefinition {
  /** Machine-readable ID. Used as the value of `data-vibe` on `<html>`. */
  id: string
  /** Human-readable display name. */
  label: string
  /** Emoji shown in the vibe selector. */
  icon: string
  /** Which color schemes this vibe supports. Dark-only vibes force dark mode when activated. */
  colorSchemes: ('light' | 'dark')[]
  /** Whether this vibe adds a pointer-tracking glow layer to cards. */
  hasPointerGlow: boolean
  /** Whether this vibe adds scanline/CRT overlays to cards. */
  hasScanlines: boolean
}

export type VibeId = 'default' | 'unc'
