import React, { useEffect, useState } from 'react'

interface CRTPowerOnProps {
  /** Called when the animation completes */
  onComplete: () => void
  /** Duration of the animation in ms */
  duration?: number
}

/**
 * CRT TV power-on animation overlay.
 * Simulates an old CRT television turning on with:
 * 1. Initial bright horizontal line expanding from center
 * 2. Screen expanding vertically with scanlines and glow
 * 3. Brief static/noise effect
 * 4. Fade to transparent revealing the game
 */
export const CRTPowerOn: React.FC<CRTPowerOnProps> = ({
  onComplete,
  duration = 800,
}) => {
  const [phase, setPhase] = useState<'line' | 'expand' | 'static' | 'fade' | 'done'>('line')

  useEffect(() => {
    const timings = {
      line: duration * 0.15,      // Bright line appears
      expand: duration * 0.35,    // Screen expands
      static: duration * 0.25,    // Brief static
      fade: duration * 0.25,      // Fade out
    }

    const lineTimer = setTimeout(() => setPhase('expand'), timings.line)
    const expandTimer = setTimeout(() => setPhase('static'), timings.line + timings.expand)
    const staticTimer = setTimeout(() => setPhase('fade'), timings.line + timings.expand + timings.static)
    const fadeTimer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, duration)

    return () => {
      clearTimeout(lineTimer)
      clearTimeout(expandTimer)
      clearTimeout(staticTimer)
      clearTimeout(fadeTimer)
    }
  }, [duration, onComplete])

  if (phase === 'done') return null

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* Base black background */}
      <div
        className={`absolute inset-0 bg-black transition-opacity ${
          phase === 'fade' ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ transitionDuration: `${duration * 0.25}ms` }}
      />

      {/* CRT horizontal line (initial power-on) */}
      {phase === 'line' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="h-[2px] bg-white animate-crt-line"
            style={{
              boxShadow: '0 0 20px 5px rgba(255, 255, 255, 0.8), 0 0 40px 10px rgba(100, 200, 255, 0.5)',
              animation: `crt-line-expand ${duration * 0.15}ms ease-out forwards`,
            }}
          />
        </div>
      )}

      {/* Expanding screen effect */}
      {(phase === 'expand' || phase === 'static') && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative bg-black overflow-hidden"
            style={{
              animation: phase === 'expand'
                ? `crt-screen-expand ${duration * 0.35}ms ease-out forwards`
                : undefined,
              width: phase === 'static' ? '100%' : undefined,
              height: phase === 'static' ? '100%' : undefined,
            }}
          >
            {/* Phosphor glow effect */}
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(100, 200, 255, 0.15) 0%, transparent 70%)',
              }}
            />

            {/* Scanlines */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 0, 0, 0.3) 1px, rgba(0, 0, 0, 0.3) 2px)',
                backgroundSize: '100% 4px',
              }}
            />

            {/* Static noise (only during static phase) */}
            {phase === 'static' && (
              <div
                className="absolute inset-0 animate-crt-static"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                  opacity: 0.15,
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Inline keyframes */}
      <style>{`
        @keyframes crt-line-expand {
          0% {
            width: 0;
            opacity: 1;
          }
          100% {
            width: 80%;
            opacity: 1;
          }
        }

        @keyframes crt-screen-expand {
          0% {
            width: 80%;
            height: 2px;
            opacity: 1;
          }
          50% {
            width: 95%;
            height: 50%;
            opacity: 1;
          }
          100% {
            width: 100%;
            height: 100%;
            opacity: 1;
          }
        }

        @keyframes crt-static {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-1%, -1%); }
          20% { transform: translate(1%, 1%); }
          30% { transform: translate(-1%, 1%); }
          40% { transform: translate(1%, -1%); }
          50% { transform: translate(-1%, 0%); }
          60% { transform: translate(1%, 0%); }
          70% { transform: translate(0%, 1%); }
          80% { transform: translate(0%, -1%); }
          90% { transform: translate(1%, 1%); }
        }

        .animate-crt-static {
          animation: crt-static 0.1s steps(4) infinite;
        }
      `}</style>
    </div>
  )
}
