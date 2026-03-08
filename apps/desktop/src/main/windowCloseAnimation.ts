import type { BrowserWindow } from "electron";

/** Duration of the OS-level window fade/shrink animation in ms. */
export const WINDOW_CLOSE_ANIMATION_DURATION = 250;

/** Number of discrete animation steps (~60fps at 250ms). */
export const WINDOW_CLOSE_ANIMATION_STEPS = 15;

interface CloseAnimationOptions {
  /** Whether to shrink the window toward its center during the fade. Default: true. */
  shrink?: boolean;
}

/**
 * Animate a BrowserWindow's opacity and bounds as it closes.
 * Fades opacity from 1 → 0 with a quadratic ease-out, and optionally shrinks
 * the window ~8% toward its center. Fullscreen windows never shrink.
 *
 * Pass `{ shrink: false }` for content-heavy windows (e.g. the library) where
 * `setBounds()` would trigger expensive relayouts on every animation step.
 *
 * Returns a Promise that resolves when the animation finishes or the window
 * is destroyed mid-animation. The caller should call `window.close()` after.
 */
export function animateWindowClose(
  window: BrowserWindow,
  options?: CloseAnimationOptions,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (window.isDestroyed()) {
      resolve();
      return;
    }

    const totalSteps = WINDOW_CLOSE_ANIMATION_STEPS;
    const stepDuration = WINDOW_CLOSE_ANIMATION_DURATION / totalSteps;
    let currentStep = 0;

    const shouldShrink = (options?.shrink ?? true) && !window.isFullScreen();

    let initialBounds: Electron.Rectangle | undefined;
    let centerX = 0;
    let centerY = 0;
    if (shouldShrink) {
      initialBounds = window.getBounds();
      centerX = initialBounds.x + initialBounds.width / 2;
      centerY = initialBounds.y + initialBounds.height / 2;
    }

    const interval = setInterval(() => {
      currentStep++;

      if (window.isDestroyed()) {
        clearInterval(interval);
        resolve();
        return;
      }

      // Progress from 0 → 1
      const progress = currentStep / totalSteps;

      // Quadratic ease-out: starts fast, decelerates
      const easedProgress = 1 - Math.pow(1 - progress, 2);

      // Fade opacity from 1 to 0
      const opacity = Math.max(0, 1 - easedProgress);
      window.setOpacity(opacity);

      // Shrink bounds toward center (skip for fullscreen or when opted out)
      if (shouldShrink && initialBounds) {
        const scale = 1 - easedProgress * 0.08;
        const newWidth = Math.round(initialBounds.width * scale);
        const newHeight = Math.round(initialBounds.height * scale);
        const newX = Math.round(centerX - newWidth / 2);
        const newY = Math.round(centerY - newHeight / 2);
        window.setBounds({ height: newHeight, width: newWidth, x: newX, y: newY });
      }

      if (currentStep >= totalSteps) {
        clearInterval(interval);
        resolve();
      }
    }, stepDuration);
  });
}
