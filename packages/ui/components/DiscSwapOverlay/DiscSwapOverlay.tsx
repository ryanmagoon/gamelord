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
  /** Called when the user clicks "Browse..." on a missing disc. */
  onBrowse?: (index: number) => void;
  discs: ReadonlyArray<DiscInfo>;
  /** Index of the disc currently being swapped to (shows loading state). */
  swappingIndex?: number;
  /** Index of a disc currently being browsed for (shows loading state). */
  browsingIndex?: number;
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
  onBrowse,
  discs,
  swappingIndex,
  browsingIndex,
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
  const isBusy = swappingIndex !== undefined || browsingIndex !== undefined;

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
        onClick={closing || isBusy ? undefined : onClose}
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
            const isThisBrowsing = browsingIndex === disc.index;
            const canSwap = !isCurrent && !isMissing && !isBusy;
            const canBrowse = isMissing && !isBusy && onBrowse !== undefined;

            return (
              <button
                key={disc.index}
                disabled={!canSwap && !canBrowse}
                onClick={() => {
                  if (canSwap) {
                    onSwap(disc.index);
                  } else if (canBrowse) {
                    onBrowse(disc.index);
                  }
                }}
                className={`
                  relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left
                  transition-all duration-150
                  ${isCurrent ? "bg-white/10 border border-white/20" : "border border-transparent"}
                  ${canSwap || canBrowse ? "hover:bg-white/8 hover:border-white/15 cursor-pointer" : ""}
                  ${isMissing && !canBrowse ? "opacity-40 cursor-not-allowed" : ""}
                  ${isThisSwapping || isThisBrowsing ? "bg-white/5 border-white/15" : ""}
                `}
                data-testid={`disc-${disc.index}`}
              >
                {/* Disc number indicator */}
                <div
                  className={`
                    flex items-center justify-center size-8 rounded-full text-xs font-bold
                    transition-colors duration-150
                    ${isCurrent ? "bg-white/20 text-white" : "bg-white/5 text-white/50"}
                    ${isThisSwapping || isThisBrowsing ? "bg-white/15 text-white/80" : ""}
                  `}
                >
                  {isThisSwapping || isThisBrowsing ? (
                    <LoadingSpinner className="size-4" />
                  ) : (
                    disc.index + 1
                  )}
                </div>

                {/* Label + status */}
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
                  {isMissing && !isThisBrowsing && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-red-400/60 font-medium">
                      {canBrowse ? "Browse\u2026" : "Missing"}
                    </span>
                  )}
                  {isThisSwapping && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40 font-medium">
                      Swapping...
                    </span>
                  )}
                  {isThisBrowsing && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40 font-medium">
                      Locating...
                    </span>
                  )}
                </div>

                {/* Browse icon for missing discs */}
                {isMissing && canBrowse && !isThisBrowsing && (
                  <FolderIcon className="size-4 text-white/30" />
                )}
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

/** Minimal folder icon for the browse action. */
function FolderIcon({ className }: { className?: string }) {
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
