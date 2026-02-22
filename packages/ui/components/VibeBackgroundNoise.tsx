import React, { useRef, useEffect } from 'react'

/** Size of the noise texture (rendered small, scaled up with pixelated rendering). */
const NOISE_SIZE = 64

/**
 * Full-viewport static noise canvas for CRT-style vibes. Renders a tiny
 * noise texture at `NOISE_SIZE x NOISE_SIZE`, CSS-scaled with
 * `image-rendering: pixelated` for that chunky CRT grain look.
 *
 * Updates once per frame via RAF. Only visible when the `vibe-background-noise`
 * class is displayed (controlled by unc.css via `html[data-vibe="unc"]`).
 */
export const VibeBackgroundNoise: React.FC = React.memo(function VibeBackgroundNoise() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = NOISE_SIZE
    canvas.height = NOISE_SIZE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const imageData = ctx.createImageData(NOISE_SIZE, NOISE_SIZE)
    const data = imageData.data
    let rafId = 0

    const draw = () => {
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }
      ctx.putImageData(imageData, 0, 0)
      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="vibe-background-noise"
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  )
})
