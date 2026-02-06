import React, { useEffect, useState } from 'react'

interface LCDPortableAnimationProps {
  /** Whether this is a power-on or power-off animation. */
  direction: 'on' | 'off'
  /** Called when the animation completes. */
  onComplete: () => void
  /** Total duration of the animation in ms. */
  duration?: number
}

// ---------------------------------------------------------------------------
// Power-on phases:
//   backlight → reveal → done
//
// Power-off phases:
//   white → black → done
// ---------------------------------------------------------------------------

type PowerOnPhase = 'backlight' | 'reveal' | 'done'
type PowerOffPhase = 'white' | 'black' | 'done'

/**
 * Modern LCD portable power on/off animation (PSP).
 *
 * Power-on: black screen → white backlight brightens → fades to reveal game.
 * Power-off: game fades to white → white fades to black. Clean and digital.
 */
export const LCDPortableAnimation: React.FC<LCDPortableAnimationProps> = ({
  direction,
  onComplete,
  duration = direction === 'on' ? 500 : 400,
}) => {
  if (direction === 'on') {
    return <PortablePowerOn onComplete={onComplete} duration={duration} />
  }
  return <PortablePowerOff onComplete={onComplete} duration={duration} />
}

// ---------------------------------------------------------------------------
// Power-on
// ---------------------------------------------------------------------------

const PortablePowerOn: React.FC<{ onComplete: () => void; duration: number }> = ({
  onComplete,
  duration,
}) => {
  const [phase, setPhase] = useState<PowerOnPhase>('backlight')

  useEffect(() => {
    const timings = {
      backlight: duration * 0.35,
      reveal: duration * 0.65,
    }

    const revealTimer = setTimeout(() => setPhase('reveal'), timings.backlight)
    const doneTimer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, duration)

    return () => {
      clearTimeout(revealTimer)
      clearTimeout(doneTimer)
    }
  }, [duration, onComplete])

  if (phase === 'done') return null

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* White backlight layer — starts black, transitions to white, then transparent */}
      <div
        className="absolute inset-0 transition-all"
        style={{
          backgroundColor: phase === 'backlight' ? '#111' : 'white',
          opacity: phase === 'reveal' ? 0 : 1,
          transitionDuration: phase === 'reveal' ? `${duration * 0.65}ms` : `${duration * 0.35}ms`,
          transitionTimingFunction: 'ease-out',
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Power-off
// ---------------------------------------------------------------------------

const PortablePowerOff: React.FC<{ onComplete: () => void; duration: number }> = ({
  onComplete,
  duration,
}) => {
  const [phase, setPhase] = useState<PowerOffPhase>('white')

  useEffect(() => {
    const timings = {
      white: duration * 0.45,
      black: duration * 0.55,
    }

    const blackTimer = setTimeout(() => setPhase('black'), timings.white)
    const doneTimer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, duration)

    return () => {
      clearTimeout(blackTimer)
      clearTimeout(doneTimer)
    }
  }, [duration, onComplete])

  if (phase === 'done') return null

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* White flash layer — fades in over the game */}
      <div
        className="absolute inset-0 transition-all"
        style={{
          backgroundColor: phase === 'white' ? 'white' : 'black',
          opacity: phase === 'white' ? 0.9 : 1,
          transitionDuration: phase === 'black' ? `${duration * 0.55}ms` : `${duration * 0.45}ms`,
          transitionTimingFunction: 'ease-in',
        }}
      />
    </div>
  )
}
