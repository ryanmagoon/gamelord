import React from 'react'
import { cn } from '../utils'

export interface ScrollLetterIndicatorProps {
  /** The letter to display. */
  letter: string | null
  /** Whether the indicator is visible. Controls fade in/out. */
  isVisible: boolean
}

/**
 * A Steam-style large letter overlay that appears while scrolling through
 * an alphabetically-sorted game library. Centered in the viewport, decorative
 * only (pointer-events-none, aria-hidden).
 */
export const ScrollLetterIndicator: React.FC<ScrollLetterIndicatorProps> = ({
  letter,
  isVisible,
}) => {
  if (letter === null) return null

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-50 flex items-center justify-center',
        'transition-opacity duration-300 ease-out',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
      aria-hidden="true"
      data-testid="scroll-letter-indicator"
    >
      <span
        className={cn(
          'select-none leading-none font-bold',
          'text-foreground/90',
          'transition-transform duration-300 ease-out',
          isVisible ? 'scale-100' : 'scale-90',
          'scroll-letter-indicator',
        )}
        style={{
          fontSize: '20rem',
          fontFamily: "'Geist Pixel Grid', monospace",
        }}
      >
        {letter}
      </span>
    </div>
  )
}
