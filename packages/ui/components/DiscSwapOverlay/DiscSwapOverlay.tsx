import React, { useEffect, useRef, useState } from "react";

export type DiscStatus = "current" | "available" | "missing" | "swapping";

export interface DiscInfo {
  /** 0-indexed disc number. */
  index: number;
  /** Display label (e.g. "Disc 1"). */
  label: string;
  status: DiscStatus;
}

export interface DiscSwapOverlayProps {
  open: boolean;
  onClose: () => void;
  onSwap: (index: number) => void;
  discs: ReadonlyArray<DiscInfo>;
  /** Index of the disc currently being swapped to (shows loading state). */
  swappingIndex?: number;
}

/**
 * Delay (ms) to keep the DOM mounted after `open` goes false so exit
 * animations have time to play. Matches the longest close animation
 * (dialog-scan-out at 200ms) plus a small buffer.
 */
const UNMOUNT_DELAY = 220;

export const DiscSwapOverlay: React.FC<DiscSwapOverlayProps> = ({
  open,
  onClose,
  onSwap,
  discs,
  swappingIndex,
}) => {
  // Delayed unmount: keep the DOM alive while exit animations play.
  const [mounted, setMounted] = useState(open);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMounted(true);
    } else if (mounted) {
      timerRef.current = setTimeout(() => {
        setMounted(false);
        timerRef.current = null;
      }, UNMOUNT_DELAY);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  if (!open && !mounted) {
    return null;
  }

  const closing = !open && mounted;
  const isSwapping = swappingIndex !== undefined;

  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center ${closing ? "animate-overlay-fade-out pointer-events-none" : "animate-overlay-fade-in"}`}
      role="dialog"
      aria-label="Disc Swap"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        data-testid="disc-swap-overlay-backdrop"
        onClick={closing || isSwapping ? undefined : onClose}
      />

      {/* Panel */}
      <div
        className={`relative z-10 bg-black/90 border border-white/10 rounded-xl p-5 max-w-xs w-full mx-4 shadow-2xl ${closing ? "animate-dialog-scan-out" : "animate-dialog-scan-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <DiscIcon className="size-5 text-white/70" />
          <h2 className="text-sm font-semibold text-white/90 tracking-wide uppercase">Swap Disc</h2>
        </div>

        {/* Disc list */}
        <div className="flex flex-col gap-1.5">
          {discs.map((disc) => {
            const isCurrent = disc.status === "current";
            const isMissing = disc.status === "missing";
            const isThisSwapping = swappingIndex === disc.index;
            const canClick = !isCurrent && !isMissing && !isSwapping;

            return (
              <button
                key={disc.index}
                disabled={!canClick}
                onClick={() => canClick && onSwap(disc.index)}
                className={`
                  relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left
                  transition-all duration-150
                  ${isCurrent ? "bg-white/10 border border-white/20" : "border border-transparent"}
                  ${canClick ? "hover:bg-white/8 hover:border-white/15 cursor-pointer" : ""}
                  ${isMissing ? "opacity-40 cursor-not-allowed" : ""}
                  ${isThisSwapping ? "bg-white/5 border-white/15" : ""}
                `}
                data-testid={`disc-${disc.index}`}
              >
                {/* Disc number indicator */}
                <div
                  className={`
                    flex items-center justify-center size-8 rounded-full text-xs font-bold
                    transition-colors duration-150
                    ${isCurrent ? "bg-white/20 text-white" : "bg-white/5 text-white/50"}
                    ${isThisSwapping ? "bg-white/15 text-white/80" : ""}
                  `}
                >
                  {isThisSwapping ? <LoadingSpinner className="size-4" /> : disc.index + 1}
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-sm ${isCurrent ? "text-white font-medium" : "text-white/70"}`}
                  >
                    {disc.label}
                  </span>
                  {isCurrent && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40 font-medium">
                      Current
                    </span>
                  )}
                  {isMissing && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-red-400/60 font-medium">
                      Missing
                    </span>
                  )}
                  {isThisSwapping && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40 font-medium">
                      Swapping...
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <p className="mt-3 text-center text-[11px] text-white/25">
          Press <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/40 text-[10px]">Esc</kbd>{" "}
          or <kbd className="px-1 py-0.5 rounded bg-white/10 text-white/40 text-[10px]">F6</kbd> to
          close
        </p>
      </div>
    </div>
  );
};

/** Minimal disc/CD icon. */
function DiscIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Spinning loading indicator. */
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.4"
        strokeDashoffset="10"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
