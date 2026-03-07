import React from "react";
import type { DisplayType } from "../../../types/displayType";
import { CRTAnimation } from "./CRTAnimation";
import { LCDHandheldAnimation } from "./LCDHandheldAnimation";
import { LCDPortableAnimation } from "./LCDPortableAnimation";

interface PowerAnimationProps {
  /** Whether this is a power-on or power-off animation. */
  direction: "on" | "off";
  /** The display technology of the original hardware. */
  displayType: DisplayType;
  /** Total duration override in ms. Each animation type has its own default. */
  duration?: number;
  /** Called when the animation completes. */
  onComplete: () => void;
}

/**
 * Factory component that selects the appropriate power animation based on
 * the original system's display technology.
 */
export const PowerAnimation: React.FC<PowerAnimationProps> = ({
  direction,
  displayType,
  duration,
  onComplete,
}) => {
  switch (displayType) {
    case "crt":
      return <CRTAnimation direction={direction} duration={duration} onComplete={onComplete} />;
    case "lcd-handheld":
      return (
        <LCDHandheldAnimation direction={direction} duration={duration} onComplete={onComplete} />
      );
    case "lcd-portable":
      return (
        <LCDPortableAnimation direction={direction} duration={duration} onComplete={onComplete} />
      );
  }
};
