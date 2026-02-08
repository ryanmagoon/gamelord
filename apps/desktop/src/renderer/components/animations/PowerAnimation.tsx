import React from 'react'
import type { DisplayType } from '../../../types/displayType'
import { CRTAnimation } from './CRTAnimation'
import { LCDHandheldAnimation } from './LCDHandheldAnimation'
import { LCDPortableAnimation } from './LCDPortableAnimation'

interface PowerAnimationProps {
  /** The display technology of the original hardware. */
  displayType: DisplayType
  /** Whether this is a power-on or power-off animation. */
  direction: 'on' | 'off'
  /** Called when the animation completes. */
  onComplete: () => void
  /** Total duration override in ms. Each animation type has its own default. */
  duration?: number
}

/**
 * Factory component that selects the appropriate power animation based on
 * the original system's display technology.
 */
export const PowerAnimation: React.FC<PowerAnimationProps> = ({
  displayType,
  direction,
  onComplete,
  duration,
}) => {
  switch (displayType) {
    case 'crt':
      return <CRTAnimation direction={direction} onComplete={onComplete} duration={duration} />
    case 'lcd-handheld':
      return <LCDHandheldAnimation direction={direction} onComplete={onComplete} duration={duration} />
    case 'lcd-portable':
      return <LCDPortableAnimation direction={direction} onComplete={onComplete} duration={duration} />
  }
}
