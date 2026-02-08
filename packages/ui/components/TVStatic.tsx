import React from 'react'
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
  className?: string
}

/**
 * Animated TV static effect matching the CRT aesthetic.
 *
 * Uses an SVG feTurbulence noise filter with CSS keyframe jitter,
 * a scanline overlay, and a subtle phosphor glow. Designed to fill
 * the GameCard artwork placeholder during artwork sync.
 */
export const TVStatic: React.FC<TVStaticProps> = ({
  active,
  statusText,
  phase,
  className,
}) => {
  if (!active) return null

  const isError = phase === 'error'
  const isNotFound = phase === 'not-found'

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      aria-label={statusText ?? 'Loading artwork'}
    >
      {/* Noise layer — SVG feTurbulence encoded as data URI, jittered via CSS */}
      <div
        className="absolute inset-0 animate-tv-static-jitter"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '256px 256px',
          opacity: 0.35,
        }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 0, 0, 0.4) 1px, rgba(0, 0, 0, 0.4) 2px)',
          backgroundSize: '100% 4px',
        }}
      />

      {/* Phosphor glow — subtle blue-white center radial */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isError
            ? 'radial-gradient(ellipse at center, rgba(255, 80, 80, 0.12) 0%, transparent 70%)'
            : isNotFound
              ? 'radial-gradient(ellipse at center, rgba(255, 180, 50, 0.10) 0%, transparent 70%)'
              : 'radial-gradient(ellipse at center, rgba(100, 200, 255, 0.10) 0%, transparent 70%)',
        }}
      />

      {/* Color tint overlay for error/not-found */}
      {isError && (
        <div className="absolute inset-0 bg-red-500/8 pointer-events-none" />
      )}
      {isNotFound && (
        <div className="absolute inset-0 bg-amber-500/8 pointer-events-none" />
      )}

      {/* Status text */}
      {statusText && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-mono text-white/60 tracking-wider uppercase select-none animate-tv-static-pulse">
            {statusText}
          </span>
        </div>
      )}

      <style>{`
        @keyframes tv-static-jitter {
          0%, 100% { transform: translate(0, 0) scale(1.1); }
          10% { transform: translate(-2%, -1%) scale(1.1); }
          20% { transform: translate(1%, 2%) scale(1.1); }
          30% { transform: translate(-1%, 1%) scale(1.1); }
          40% { transform: translate(2%, -2%) scale(1.1); }
          50% { transform: translate(-2%, 2%) scale(1.1); }
          60% { transform: translate(1%, -1%) scale(1.1); }
          70% { transform: translate(-1%, -2%) scale(1.1); }
          80% { transform: translate(2%, 1%) scale(1.1); }
          90% { transform: translate(-2%, -1%) scale(1.1); }
        }
        .animate-tv-static-jitter {
          animation: tv-static-jitter 0.15s steps(5) infinite;
        }
        @keyframes tv-static-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.3; }
        }
        .animate-tv-static-pulse {
          animation: tv-static-pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
