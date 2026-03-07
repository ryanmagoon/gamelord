import React from "react";
import { cn } from "../utils";

export interface ScrollLetterIndicatorProps {
  /** Whether the indicator is visible. Controls fade in/out. */
  isVisible: boolean;
  /** The letter to display. */
  letter: string | null;
}

/**
 * A Steam-style large letter overlay that appears while scrolling through
 * an alphabetically-sorted game library. Centered in the viewport, decorative
 * only (pointer-events-none, aria-hidden).
 */
export const ScrollLetterIndicator: React.FC<ScrollLetterIndicatorProps> = ({
  isVisible,
  letter,
}) => {
  if (letter === null) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex items-center justify-center",
        "transition-opacity duration-300 ease-out",
        isVisible ? "opacity-100" : "opacity-0",
      )}
      data-testid="scroll-letter-indicator"
    >
      <span
        className={cn(
          "select-none leading-none font-bold",
          "text-foreground/90",
          "transition-transform duration-300 ease-out",
          isVisible ? "scale-100" : "scale-90",
          "scroll-letter-indicator",
        )}
        style={{
          fontFamily: "'Geist Pixel Grid', monospace",
          fontSize: "20rem",
        }}
      >
        {letter}
      </span>
    </div>
  );
};
