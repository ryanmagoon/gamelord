import type { BrowserWindow } from 'electron'

/** Duration of the OS-level window fade/shrink animation in ms. */
export const WINDOW_CLOSE_ANIMATION_DURATION = 250

/** Number of discrete animation steps (~60fps at 250ms). */
export const WINDOW_CLOSE_ANIMATION_STEPS = 15

/**
 * Animate a BrowserWindow's opacity and bounds as it closes.
 * Fades opacity from 1 → 0 with a quadratic ease-out, and subtly shrinks
 * the window ~8% toward its center. Fullscreen windows only fade (no shrink).
 *
 * Returns a Promise that resolves when the animation finishes or the window
 * is destroyed mid-animation. The caller should call `window.close()` after.
 */
export function animateWindowClose(window: BrowserWindow): Promise<void> {
  return new Promise<void>((resolve) => {
    if (window.isDestroyed()) {
      resolve()
      return
    }

    const totalSteps = WINDOW_CLOSE_ANIMATION_STEPS
    const stepDuration = WINDOW_CLOSE_ANIMATION_DURATION / totalSteps
    let currentStep = 0

    const isFullScreen = window.isFullScreen()
    const initialBounds = window.getBounds()
    const centerX = initialBounds.x + initialBounds.width / 2
    const centerY = initialBounds.y + initialBounds.height / 2

    const interval = setInterval(() => {
      currentStep++

      if (window.isDestroyed()) {
        clearInterval(interval)
        resolve()
        return
      }

      // Progress from 0 → 1
      const progress = currentStep / totalSteps

      // Quadratic ease-out: starts fast, decelerates
      const easedProgress = 1 - Math.pow(1 - progress, 2)

      // Fade opacity from 1 to 0
      const opacity = Math.max(0, 1 - easedProgress)
      window.setOpacity(opacity)

      // Shrink bounds toward center (skip for fullscreen windows)
      if (!isFullScreen) {
        const scale = 1 - easedProgress * 0.08
        const newWidth = Math.round(initialBounds.width * scale)
        const newHeight = Math.round(initialBounds.height * scale)
        const newX = Math.round(centerX - newWidth / 2)
        const newY = Math.round(centerY - newHeight / 2)
        window.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })
      }

      if (currentStep >= totalSteps) {
        clearInterval(interval)
        resolve()
      }
    }, stepDuration)
  })
}
