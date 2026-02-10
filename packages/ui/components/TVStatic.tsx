import React, { useEffect, useRef } from 'react'
import { cn } from '../utils'

/** Possible artwork sync phases that drive the TV static visual state. */
export type ArtworkSyncPhase =
  | 'hashing'
  | 'querying'
  | 'downloading'
  | 'done'
  | 'not-found'
  | 'error'
  | null

interface TVStaticProps {
  /** Whether the static animation is actively playing. */
  active: boolean
  /** Optional status text shown at the bottom of the static (e.g. "Searching..."). */
  statusText?: string
  /** Current sync phase — controls tint color for error/not-found states. */
  phase?: ArtworkSyncPhase
  /** Width/height ratio of the container, used to set canvas proportions. @default 0.75 */
  aspectRatio?: number
  className?: string
}

/**
 * Animated TV static effect using a canvas for true per-frame noise.
 *
 * Renders random grayscale pixels at a low resolution (scaled up for chunky
 * CRT feel) with scanline overlay and phosphor glow. Far more convincing
 * than an SVG feTurbulence data URI, which only produces a single static
 * frame.
 */
export const TVStatic: React.FC<TVStaticProps> = ({
  active,
  statusText,
  phase,
  aspectRatio = 0.75,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Low-res noise — renders at this size, CSS scales it up for chunky pixels
    const noiseWidth = 64
    const noiseHeight = Math.round(noiseWidth / aspectRatio)
    canvas.width = noiseWidth
    canvas.height = noiseHeight

    const imageData = ctx.createImageData(noiseWidth, noiseHeight)
    const data = imageData.data

    let lastFrameTime = 0
    const targetFps = 15 // CRT static flicker rate

    const drawNoise = (timestamp: number) => {
      // Throttle to target FPS for authentic CRT feel
      if (timestamp - lastFrameTime < 1000 / targetFps) {
        animFrameRef.current = requestAnimationFrame(drawNoise)
        return
      }
      lastFrameTime = timestamp

      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255
        data[i] = value     // R
        data[i + 1] = value // G
        data[i + 2] = value // B
        data[i + 3] = 255   // A
      }
      ctx.putImageData(imageData, 0, 0)
      animFrameRef.current = requestAnimationFrame(drawNoise)
    }

    animFrameRef.current = requestAnimationFrame(drawNoise)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [active, aspectRatio])

  if (!active) return null

  const isError = phase === 'error'
  const isNotFound = phase === 'not-found'

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      aria-label={statusText ?? 'Loading artwork'}
    >
      {/* Dark background so static is visible in both light and dark mode */}
      <div className="absolute inset-0 bg-neutral-900" />

      {/* Canvas noise layer — low-res, scaled up with pixelated rendering */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          imageRendering: 'pixelated',
          opacity: 0.6,
        }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 0, 0, 0.3) 1px, rgba(0, 0, 0, 0.3) 2px)',
          backgroundSize: '100% 4px',
          opacity: 0.5,
        }}
      />

      {/* Phosphor glow — subtle center radial tinted by phase */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isError
            ? 'radial-gradient(ellipse at center, rgba(255, 60, 60, 0.25) 0%, transparent 70%)'
            : isNotFound
              ? 'radial-gradient(ellipse at center, rgba(255, 180, 50, 0.20) 0%, transparent 70%)'
              : 'radial-gradient(ellipse at center, rgba(100, 200, 255, 0.15) 0%, transparent 70%)',
        }}
      />

      {/* Color tint overlay for error/not-found */}
      {isError && (
        <div className="absolute inset-0 bg-red-500/15 pointer-events-none" />
      )}
      {isNotFound && (
        <div className="absolute inset-0 bg-amber-500/15 pointer-events-none" />
      )}

      {/* Status text — high contrast on the dark static background */}
      {statusText && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-mono text-white/80 tracking-wider uppercase select-none animate-tv-static-pulse drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {statusText}
          </span>
        </div>
      )}

      <style>{`
        @keyframes tv-static-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0.4; }
        }
        .animate-tv-static-pulse {
          animation: tv-static-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
