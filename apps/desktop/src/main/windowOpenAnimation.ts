import type { BrowserWindow } from 'electron'

/** Duration of the OS-level window open/morph animation in ms. */
export const WINDOW_OPEN_ANIMATION_DURATION = 300

/** Number of discrete animation steps (~60fps at 300ms). */
export const WINDOW_OPEN_ANIMATION_STEPS = 18

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Animate a BrowserWindow from one set of bounds to another.
 * Used for the "hero transition" — the game window spawns at the clicked
 * card's position and morphs to its final emulator size.
 *
 * Fades opacity from 0 → 1 with a cubic ease-out, and interpolates bounds
 * from `startBounds` to `endBounds`.
 *
 * Returns a Promise that resolves when the animation finishes or the window
 * is destroyed mid-animation.
 */
export function animateWindowOpen(
  window: BrowserWindow,
  startBounds: Bounds,
  endBounds: Bounds,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (window.isDestroyed()) {
      resolve()
      return
    }

    const totalSteps = WINDOW_OPEN_ANIMATION_STEPS
    const stepDuration = WINDOW_OPEN_ANIMATION_DURATION / totalSteps
    let currentStep = 0

    // Start at the card's position with 0 opacity
    window.setBounds(startBounds)
    window.setOpacity(0)
    window.showInactive()

    const interval = setInterval(() => {
      currentStep++

      if (window.isDestroyed()) {
        clearInterval(interval)
        resolve()
        return
      }

      // Progress from 0 → 1
      const progress = currentStep / totalSteps

      // Cubic ease-out: starts fast, decelerates smoothly
      const easedProgress = 1 - Math.pow(1 - progress, 3)

      // Fade opacity from 0 to 1
      window.setOpacity(easedProgress)

      // Interpolate bounds from start to end
      const newX = Math.round(startBounds.x + (endBounds.x - startBounds.x) * easedProgress)
      const newY = Math.round(startBounds.y + (endBounds.y - startBounds.y) * easedProgress)
      const newWidth = Math.round(startBounds.width + (endBounds.width - startBounds.width) * easedProgress)
      const newHeight = Math.round(startBounds.height + (endBounds.height - startBounds.height) * easedProgress)
      window.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })

      if (currentStep >= totalSteps) {
        clearInterval(interval)
        // Ensure final state is exact
        window.setOpacity(1)
        window.setBounds(endBounds)
        window.focus()
        resolve()
      }
    }, stepDuration)
  })
}
