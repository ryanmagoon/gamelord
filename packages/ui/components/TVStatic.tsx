import React, { useEffect, useRef } from "react";
import { cn } from "../utils";
import { tvStaticManager } from "./TVStaticManager";

/** Possible artwork sync phases that drive the TV static visual state. */
export type ArtworkSyncPhase =
  | "hashing"
  | "querying"
  | "downloading"
  | "done"
  | "not-found"
  | "error"
  | null;

interface TVStaticProps {
  /** Whether the static animation is actively playing. */
  active: boolean;
  /** Width/height ratio of the container, used to set canvas proportions. @default 0.75 */
  aspectRatio?: number;
  className?: string;
  /** Current sync phase — controls tint color for error/not-found states. */
  phase?: ArtworkSyncPhase;
  /** Optional status text shown at the bottom of the static (e.g. "Searching..."). */
  statusText?: string;
}

/**
 * Animated TV static effect using a canvas for true per-frame noise.
 *
 * Renders random grayscale pixels at a low resolution (scaled up for chunky
 * CRT feel) with scanline overlay and phosphor glow. Far more convincing
 * than an SVG feTurbulence data URI, which only produces a single static
 * frame.
 *
 * The fade-out is controlled imperatively by the parent (via a wrapper div's
 * opacity/transition) so that no React re-renders occur during animation.
 */
export const TVStatic: React.FC<TVStaticProps> = ({
  active,
  aspectRatio = 0.75,
  className,
  phase,
  statusText,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // Low-res noise — renders at this size, CSS scales it up for chunky pixels
    const noiseHeight = Math.round(64 / aspectRatio);
    return tvStaticManager.register(canvas, noiseHeight);
  }, [active, aspectRatio]);

  if (!active) {
    return null;
  }

  const isError = phase === "error";
  const isNotFound = phase === "not-found";

  // In deterministic mode (Chromatic snapshots), render a flat solid fill
  // instead of a canvas + scanlines + gradients. Canvas scaling and gradient
  // rendering can produce subpixel aliasing differences between capture runs,
  // causing false-positive visual diffs. The structural overlays (tint, labels)
  // are preserved so layout regressions are still caught.
  if (tvStaticManager.isDeterministic()) {
    return (
      <div
        className={cn('absolute inset-0 overflow-hidden', className)}
        aria-label={statusText ?? 'Loading artwork'}
      >
        <div className={cn(
          'absolute inset-0',
          isError ? 'bg-neutral-800' : isNotFound ? 'bg-neutral-800' : 'bg-neutral-900',
        )} />
        {isError && (
          <div className="absolute inset-0 bg-red-500/15 pointer-events-none" />
        )}
        {isNotFound && (
          <div className="absolute inset-0 bg-amber-500/15 pointer-events-none" />
        )}
      </div>
    )
  }

  return (
    <div
      aria-label={statusText ?? "Loading artwork"}
      className={cn("absolute inset-0 overflow-hidden", className)}
    >
      {/* Dark background so static is visible in both light and dark mode */}
      <div className="absolute inset-0 bg-neutral-900" />

      {/* Canvas noise layer — low-res, scaled up with pixelated rendering */}
      <canvas
        className="absolute inset-0 w-full h-full"
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          opacity: 0.6,
        }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 0, 0, 0.3) 1px, rgba(0, 0, 0, 0.3) 2px)",
          backgroundSize: "100% 4px",
          opacity: 0.5,
        }}
      />

      {/* Phosphor glow — subtle center radial tinted by phase */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isError
            ? "radial-gradient(ellipse at center, rgba(255, 60, 60, 0.25) 0%, transparent 70%)"
            : isNotFound
              ? "radial-gradient(ellipse at center, rgba(255, 180, 50, 0.20) 0%, transparent 70%)"
              : "radial-gradient(ellipse at center, rgba(100, 200, 255, 0.15) 0%, transparent 70%)",
        }}
      />

      {/* Color tint overlay for error/not-found */}
      {isError && <div className="absolute inset-0 bg-red-500/15 pointer-events-none" />}
      {isNotFound && <div className="absolute inset-0 bg-amber-500/15 pointer-events-none" />}
    </div>
  );
};
