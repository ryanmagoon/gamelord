import React, { useEffect, useState } from 'react'

interface CRTAnimationProps {
  /** Whether this is a power-on or power-off animation. */
  direction: 'on' | 'off'
  /** Called when the animation completes. */
  onComplete: () => void
  /** Total duration of the animation in ms. */
  duration?: number
}

// ---------------------------------------------------------------------------
// Power-on phases (same as original CRTPowerOn):
//   line → expand → static → fade
//
// Power-off phases (reverse CRT tube shutdown):
//   shrink → line → dot → black
// ---------------------------------------------------------------------------

type PowerOnPhase = 'line' | 'expand' | 'static' | 'fade' | 'done'
type PowerOffPhase = 'shrink' | 'line' | 'dot' | 'black' | 'done'

/**
 * CRT television power on/off animation.
 *
 * Power-on simulates an old tube TV warming up: a bright horizontal line
 * expands from center, the screen fills with scanlines and phosphor glow,
 * brief static flickers, then fades to reveal the game.
 *
 * Power-off reverses the effect: the screen collapses to a bright horizontal
 * line, the line shrinks to a glowing dot, then fades to black.
 */
export const CRTAnimation: React.FC<CRTAnimationProps> = ({
  direction,
  onComplete,
  duration = direction === 'on' ? 800 : 500,
}) => {
  if (direction === 'on') {
    return <CRTPowerOn onComplete={onComplete} duration={duration} />
  }
  return <CRTPowerOff onComplete={onComplete} duration={duration} />
}

// ---------------------------------------------------------------------------
// Power-on (ported from CRTPowerOn.tsx)
// ---------------------------------------------------------------------------

const CRTPowerOn: React.FC<{ onComplete: () => void; duration: number }> = ({
  onComplete,
  duration,
}) => {
  const [phase, setPhase] = useState<PowerOnPhase>('line')

  useEffect(() => {
    const timings = {
      line: duration * 0.15,
      expand: duration * 0.35,
      static: duration * 0.25,
      fade: duration * 0.25,
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

      {/* Horizontal line (initial power-on) */}
      {phase === 'line' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="h-[2px] bg-white"
            style={{
              boxShadow: '0 0 20px 5px rgba(255, 255, 255, 0.8), 0 0 40px 10px rgba(100, 200, 255, 0.5)',
              animation: `crt-line-expand ${duration * 0.15}ms ease-out forwards`,
            }}
          />
        </div>
      )}

      {/* Expanding screen */}
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
            {/* Phosphor glow */}
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
            {/* Static noise */}
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

      <style>{`
        @keyframes crt-line-expand {
          0% { width: 0; opacity: 1; }
          100% { width: 80%; opacity: 1; }
        }
        @keyframes crt-screen-expand {
          0% { width: 80%; height: 2px; opacity: 1; }
          50% { width: 95%; height: 50%; opacity: 1; }
          100% { width: 100%; height: 100%; opacity: 1; }
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

// ---------------------------------------------------------------------------
// Power-off (new — reverse CRT tube collapse)
// ---------------------------------------------------------------------------

const CRTPowerOff: React.FC<{ onComplete: () => void; duration: number }> = ({
  onComplete,
  duration,
}) => {
  const [phase, setPhase] = useState<PowerOffPhase>('shrink')

  useEffect(() => {
    const timings = {
      shrink: duration * 0.35,
      line: duration * 0.25,
      dot: duration * 0.20,
      black: duration * 0.20,
    }

    const lineTimer = setTimeout(() => setPhase('line'), timings.shrink)
    const dotTimer = setTimeout(() => setPhase('dot'), timings.shrink + timings.line)
    const blackTimer = setTimeout(() => setPhase('black'), timings.shrink + timings.line + timings.dot)
    const doneTimer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, duration)

    return () => {
      clearTimeout(lineTimer)
      clearTimeout(dotTimer)
      clearTimeout(blackTimer)
      clearTimeout(doneTimer)
    }
  }, [duration, onComplete])

  if (phase === 'done') return null

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* Black background — fades in immediately to cover the game */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: phase === 'shrink' ? 0.85 : 1,
          transition: 'opacity 80ms ease-out',
        }}
      />

      {/* Screen shrinking to a horizontal line */}
      {phase === 'shrink' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="relative bg-black overflow-hidden"
            style={{
              animation: `crt-screen-shrink ${duration * 0.35}ms ease-in forwards`,
            }}
          >
            {/* Phosphor glow intensifies as screen collapses */}
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(100, 200, 255, 0.25) 0%, transparent 70%)',
              }}
            />
            {/* Scanlines */}
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 0, 0, 0.3) 1px, rgba(0, 0, 0, 0.3) 2px)',
                backgroundSize: '100% 4px',
              }}
            />
          </div>
        </div>
      )}

      {/* Horizontal line collapsing to center */}
      {phase === 'line' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="h-[2px] bg-white"
            style={{
              boxShadow: '0 0 15px 4px rgba(255, 255, 255, 0.7), 0 0 30px 8px rgba(100, 200, 255, 0.4)',
              animation: `crt-line-collapse ${duration * 0.25}ms ease-in forwards`,
            }}
          />
        </div>
      )}

      {/* Bright dot fading out */}
      {phase === 'dot' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full bg-white"
            style={{
              width: 6,
              height: 6,
              boxShadow: '0 0 20px 10px rgba(255, 255, 255, 0.6), 0 0 40px 20px rgba(100, 200, 255, 0.3)',
              animation: `crt-dot-fade ${duration * 0.20}ms ease-out forwards`,
            }}
          />
        </div>
      )}

      {/* Final black — held until onComplete fires */}

      <style>{`
        @keyframes crt-screen-shrink {
          0% { width: 100%; height: 100%; }
          60% { width: 100%; height: 8px; }
          100% { width: 100%; height: 2px; }
        }
        @keyframes crt-line-collapse {
          0% { width: 100%; opacity: 1; }
          100% { width: 6px; opacity: 1; }
        }
        @keyframes crt-dot-fade {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(0.8); }
          100% { opacity: 0; transform: scale(0); }
        }
      `}</style>
    </div>
  )
}
