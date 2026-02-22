import { useEffect } from 'react'

/**
 * Attaches a single container-level pointermove listener that updates
 * CSS custom properties (`--pointer-x`, `--pointer-y`) on game cards
 * for the pointer-tracking glow effect.
 *
 * Only active when the current vibe has pointer glow enabled (checked
 * via `data-vibe` attribute on `<html>`). Uses RAF-throttling to avoid
 * layout thrashing.
 *
 * Call this once in `GameLibrary`, NOT per-card.
 */
export function usePointerGlow(
  containerRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let rafId = 0
    let lastCard: HTMLElement | null = null

    const handlePointerMove = (e: PointerEvent) => {
      // Check vibe on each event (cheap DOM read, no allocation)
      if (document.documentElement.dataset.vibe !== 'unc') return

      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const target = (e.target as HTMLElement).closest(
          '[data-game-card]',
        ) as HTMLElement | null

        // Clear previous card if pointer moved away
        if (lastCard && lastCard !== target) {
          lastCard.style.removeProperty('--pointer-x')
          lastCard.style.removeProperty('--pointer-y')
          lastCard = null
        }

        if (!target) return

        const rect = target.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width
        const y = (e.clientY - rect.top) / rect.height
        target.style.setProperty('--pointer-x', x.toFixed(3))
        target.style.setProperty('--pointer-y', y.toFixed(3))
        lastCard = target
      })
    }

    const handlePointerLeave = () => {
      if (lastCard) {
        lastCard.style.removeProperty('--pointer-x')
        lastCard.style.removeProperty('--pointer-y')
        lastCard = null
      }
    }

    container.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })
    container.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerleave', handlePointerLeave)
      cancelAnimationFrame(rafId)
      if (lastCard) {
        lastCard.style.removeProperty('--pointer-x')
        lastCard.style.removeProperty('--pointer-y')
      }
    }
  }, [containerRef])
}
