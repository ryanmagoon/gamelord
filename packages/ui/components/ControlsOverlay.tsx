import React, { useEffect, useMemo } from "react";

export interface ControlsOverlayProps {
  open: boolean;
  onClose: () => void;
  /** When provided, only shows buttons that exist on this system's controller. */
  systemId?: string;
}

interface ControlMapping {
  /** Unique identifier for filtering by system. */
  id: "dpad" | "a" | "b" | "x" | "y" | "l" | "r" | "select" | "start";
  key: string;
  label: string;
}

const ALL_GAME_CONTROLS: Array<ControlMapping> = [
  { id: "dpad", key: "Arrow Keys", label: "D-Pad" },
  { id: "a", key: "Z", label: "A" },
  { id: "b", key: "X", label: "B" },
  { id: "x", key: "A", label: "X" },
  { id: "y", key: "S", label: "Y" },
  { id: "l", key: "Q", label: "L" },
  { id: "r", key: "W", label: "R" },
  { id: "select", key: "Shift", label: "Select" },
  { id: "start", key: "Enter", label: "Start" },
];

/**
 * Maps system IDs to the set of button IDs present on that system's controller.
 * Systems not listed here show all buttons (safest default for unknown systems).
 */
const SYSTEM_BUTTONS: Record<string, Set<ControlMapping["id"]>> = {
  nes: new Set(["dpad", "a", "b", "select", "start"]),
  gb: new Set(["dpad", "a", "b", "select", "start"]),
  gba: new Set(["dpad", "a", "b", "l", "r", "select", "start"]),
  genesis: new Set(["dpad", "a", "b", "x", "y", "start"]),
  arcade: new Set(["dpad", "a", "b", "x", "y", "l", "r", "select", "start"]),
};

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

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs font-mono font-medium text-white/90">
      {children}
    </kbd>
  );
}

function ControlRow({ mapping }: { mapping: { key: string; label: string } }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <KeyBadge>{mapping.key}</KeyBadge>
      <span className="text-sm text-white/70">{mapping.label}</span>
    </div>
  );
}

function Section({ title, mappings }: { title: string; mappings: Array<{ key: string; label: string }> }) {
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

export const ControlsOverlay: React.FC<ControlsOverlayProps> = ({ open, onClose, systemId }) => {
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

  const gameControls = useMemo(() => {
    if (!systemId) return ALL_GAME_CONTROLS;
    const allowedButtons = SYSTEM_BUTTONS[systemId];
    if (!allowedButtons) return ALL_GAME_CONTROLS;
    return ALL_GAME_CONTROLS.filter((c) => allowedButtons.has(c.id));
  }, [systemId]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center animate-overlay-fade-in"
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
        className="relative z-10 bg-black/90 border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-dialog-scan-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-5">
          <Section title="Game Controls" mappings={gameControls} />
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
