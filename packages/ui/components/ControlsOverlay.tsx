import React, { useEffect } from "react";

export interface ControlsOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ControlMapping {
  key: string;
  label: string;
}

const GAME_CONTROLS: Array<ControlMapping> = [
  { key: "Arrow Keys", label: "D-Pad" },
  { key: "Z", label: "A" },
  { key: "X", label: "B" },
  { key: "A", label: "X" },
  { key: "S", label: "Y" },
  { key: "Q", label: "L" },
  { key: "W", label: "R" },
  { key: "Shift", label: "Select" },
  { key: "Enter", label: "Start" },
];

const SHORTCUTS: Array<ControlMapping> = [
  { key: "Space", label: "Pause" },
  { key: "Tab", label: "Fast-forward" },
  { key: "F5", label: "Save State" },
  { key: "F9", label: "Load State" },
];

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs font-mono font-medium text-white/90">
      {children}
    </kbd>
  );
}

function ControlRow({ mapping }: { mapping: ControlMapping }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <KeyBadge>{mapping.key}</KeyBadge>
      <span className="text-sm text-white/70">{mapping.label}</span>
    </div>
  );
}

function Section({ title, mappings }: { title: string; mappings: Array<ControlMapping> }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">{title}</h3>
      <div className="space-y-0.5">
        {mappings.map((mapping) => (
          <ControlRow key={mapping.key} mapping={mapping} />
        ))}
      </div>
    </div>
  );
}

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;

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

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center animate-[fade-in_200ms_ease-out]"
      role="dialog"
      aria-label="Keyboard Controls"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        data-testid="controls-overlay-backdrop"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative z-10 bg-black/90 border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-[scale-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-5">
          <Section title="Game Controls" mappings={GAME_CONTROLS} />
          <div className="border-t border-white/10" />
          <Section title="Shortcuts" mappings={SHORTCUTS} />
        </div>

        <p className="mt-4 text-center text-xs text-white/30">
          Press <KeyBadge>Esc</KeyBadge> or <KeyBadge>?</KeyBadge> to close
        </p>
      </div>
    </div>
  );
};
