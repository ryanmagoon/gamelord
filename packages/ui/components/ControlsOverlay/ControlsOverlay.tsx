import React, { useEffect, useRef, useState } from "react";
import { ControllerDiagram } from "./ControllerDiagram";
import { KeyBadge } from "./KeyBadge";

export interface ControlsOverlayProps {
  open: boolean;
  onClose: () => void;
  /** When provided, shows the controller layout for this system. */
  systemId?: string;
}

interface ShortcutMapping {
  key: string;
  label: string;
}

const SHORTCUTS: Array<ShortcutMapping> = [
  { key: "Space", label: "Pause" },
  { key: "Tab", label: "Fast-forward" },
  { key: "F5", label: "Save State" },
  { key: "F9", label: "Load State" },
];

/**
 * Delay (ms) to keep the DOM mounted after `open` goes false so exit
 * animations have time to play. Matches the longest close animation
 * (dialog-scan-out at 200ms) plus a small buffer.
 */
const UNMOUNT_DELAY = 220;

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({ open, onClose, systemId }) => {
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

  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center ${closing ? "animate-overlay-fade-out pointer-events-none" : "animate-overlay-fade-in"}`}
      role="dialog"
      aria-label="Keyboard Controls"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        data-testid="controls-overlay-backdrop"
        onClick={closing ? undefined : onClose}
      />

      {/* Panel */}
      <div
        className={`relative z-10 bg-black/90 border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl ${closing ? "animate-dialog-scan-out" : "animate-dialog-scan-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controller diagram */}
        <ControllerDiagram systemId={systemId} />

        {/* Shortcuts */}
        <div className="border-t border-white/10 mt-4 pt-3">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center gap-1.5">
                <KeyBadge>{shortcut.key}</KeyBadge>
                <span className="text-xs text-white/50">{shortcut.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-white/30">
          Press <KeyBadge>Esc</KeyBadge> or <KeyBadge>?</KeyBadge> to close
        </p>
      </div>
    </div>
  );
};
