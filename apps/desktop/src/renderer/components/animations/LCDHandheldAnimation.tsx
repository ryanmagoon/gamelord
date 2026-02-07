import React, { useEffect, useState } from 'react'

interface LCDHandheldAnimationProps {
  /** Whether this is a power-on or power-off animation. */
  direction: 'on' | 'off'
  /** Called when the animation completes. */
  onComplete: () => void
  /** Total duration of the animation in ms. */
  duration?: number
}

// ---------------------------------------------------------------------------
// Power-on phases:
//   grid → backlight → fade-in → done
//
// Power-off phases:
//   fade-out → afterimage → off → done
// ---------------------------------------------------------------------------

type PowerOnPhase = 'grid' | 'backlight' | 'fade-in' | 'done'
type PowerOffPhase = 'fade-out' | 'afterimage' | 'off' | 'done'

/** Game Boy-era green tint color. */
const LCD_GREEN = 'rgb(144, 160, 144)'
const LCD_GREEN_DARK = 'rgb(56, 72, 56)'

/**
 * LCD handheld power on/off animation (Game Boy, GBA, NDS).
 *
 * Power-on simulates an LCD backlight warming up: a dark greenish screen
 * with a visible pixel grid brightens, then the game content fades in.
 *
 * Power-off reverses: game content fades leaving a green afterimage,
 * the pixel grid stays visible as the backlight dims to black.
 */
export const LCDHandheldAnimation: React.FC<LCDHandheldAnimationProps> = ({
  direction,
  onComplete,
  duration = direction === 'on' ? 700 : 450,
}) => {
  if (direction === 'on') {
    return <LCDPowerOn onComplete={onComplete} duration={duration} />
  }
  return <LCDPowerOff onComplete={onComplete} duration={duration} />
}

// ---------------------------------------------------------------------------
// Shared pixel grid overlay
// ---------------------------------------------------------------------------

const PixelGrid: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    className="absolute inset-0"
    style={{
      opacity,
      backgroundImage:
        'repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 3px),' +
        'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 3px)',
      backgroundSize: '3px 3px',
    }}
  />
)

// ---------------------------------------------------------------------------
// Power-on
// ---------------------------------------------------------------------------

const LCDPowerOn: React.FC<{ onComplete: () => void; duration: number }> = ({
  onComplete,
  duration,
}) => {
  const [phase, setPhase] = useState<PowerOnPhase>('grid')

  useEffect(() => {
    const timings = {
      grid: duration * 0.20,
      backlight: duration * 0.35,
      fadeIn: duration * 0.45,
    }

    const backlightTimer = setTimeout(() => setPhase('backlight'), timings.grid)
    const fadeInTimer = setTimeout(() => setPhase('fade-in'), timings.grid + timings.backlight)
    const doneTimer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, duration)

    return () => {
      clearTimeout(backlightTimer)
      clearTimeout(fadeInTimer)
      clearTimeout(doneTimer)
    }
  }, [duration, onComplete])

  if (phase === 'done') return null

  const isBacklit = phase === 'backlight' || phase === 'fade-in'

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* LCD base — transitions from dark green to lighter green */}
      <div
        className="absolute inset-0 transition-all"
        style={{
          backgroundColor: isBacklit ? LCD_GREEN : LCD_GREEN_DARK,
          transitionDuration: `${duration * 0.35}ms`,
          transitionTimingFunction: 'ease-out',
        }}
      />

      {/* Pixel grid overlay */}
      <PixelGrid opacity={phase === 'grid' ? 0.6 : 0.3} />

      {/* Content fade — black overlay that fades out */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          backgroundColor: 'black',
          opacity: phase === 'fade-in' ? 0 : phase === 'backlight' ? 0.4 : 0.85,
          transitionDuration: `${duration * 0.45}ms`,
          transitionTimingFunction: 'ease-out',
        }}
      />

      <style>{`/* LCD handheld animation — no keyframes needed, pure transitions */`}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Power-off
// ---------------------------------------------------------------------------

const LCDPowerOff: React.FC<{ onComplete: () => void; duration: number }> = ({
  onComplete,
  duration,
}) => {
  const [phase, setPhase] = useState<PowerOffPhase>('fade-out')

  useEffect(() => {
    const timings = {
      fadeOut: duration * 0.30,
      afterimage: duration * 0.35,
      off: duration * 0.35,
    }

    const afterimageTimer = setTimeout(() => setPhase('afterimage'), timings.fadeOut)
    const offTimer = setTimeout(() => setPhase('off'), timings.fadeOut + timings.afterimage)
    const doneTimer = setTimeout(() => {
      setPhase('done')
      onComplete()
    }, duration)

    return () => {
      clearTimeout(afterimageTimer)
      clearTimeout(offTimer)
      clearTimeout(doneTimer)
    }
  }, [duration, onComplete])

  return (
    <div className="absolute inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* Green LCD afterimage layer */}
      <div
        className="absolute inset-0 transition-all"
        style={{
          backgroundColor: phase === 'off' || phase === 'done' ? 'black' : LCD_GREEN,
          opacity: phase === 'fade-out' ? 0.5 : 1,
          transitionDuration: `${duration * 0.35}ms`,
          transitionTimingFunction: 'ease-in',
        }}
      />

      {/* Pixel grid — stays visible during afterimage, fades with backlight */}
      <PixelGrid opacity={phase === 'off' || phase === 'done' ? 0 : 0.4} />

      {/* Dark overlay — stays opaque through 'done' so the game canvas
          never flashes through while the OS window fade plays */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          backgroundColor: 'black',
          opacity: phase === 'fade-out' ? 0.3 : phase === 'afterimage' ? 0.6 : 1,
          transitionDuration: `${duration * 0.35}ms`,
          transitionTimingFunction: 'ease-in',
        }}
      />
    </div>
  )
}
