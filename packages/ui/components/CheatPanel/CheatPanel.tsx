import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, Search } from "lucide-react";
import { Switch } from "../ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheatItem {
  index: number;
  description: string;
  code: string;
  enabled: boolean;
}

export interface CustomCheatItem {
  description: string;
  code: string;
  enabled: boolean;
}

export type CheatDatabaseStatus = "ready" | "downloading" | "not-downloaded" | "error";

export interface CheatPanelProps {
  open: boolean;
  onClose: () => void;
  cheats: ReadonlyArray<CheatItem>;
  onToggleCheat: (index: number, enabled: boolean) => void;
  customCheats: ReadonlyArray<CustomCheatItem>;
  onToggleCustomCheat: (index: number, enabled: boolean) => void;
  onAddCustomCheat: (description: string, code: string) => void;
  onRemoveCustomCheat: (index: number) => void;
  gameTitle: string;
  /** Status of the cheat database. Controls empty-state messaging. */
  databaseStatus?: CheatDatabaseStatus;
  /** Callback to trigger cheat database download. */
  onDownloadDatabase?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNMOUNT_DELAY = 220;

// ---------------------------------------------------------------------------
// CheatPanel
// ---------------------------------------------------------------------------

export const CheatPanel: React.FC<CheatPanelProps> = ({
  open,
  onClose,
  cheats,
  onToggleCheat,
  customCheats,
  onToggleCustomCheat,
  onAddCustomCheat,
  onRemoveCustomCheat,
  gameTitle,
  databaseStatus = "ready",
  onDownloadDatabase,
}) => {
  // -------------------------------------------------------------------------
  // Delayed unmount for exit animations
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Escape to close
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Search filter
  // -------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");

  // Reset search when panel opens
  useEffect(() => {
    if (open) {
      setSearchQuery("");
    }
  }, [open]);

  const filteredCheats = useMemo(() => {
    if (!searchQuery.trim()) {
      return cheats;
    }
    const query = searchQuery.toLowerCase();
    return cheats.filter(
      (cheat) =>
        cheat.description.toLowerCase().includes(query) || cheat.code.toLowerCase().includes(query),
    );
  }, [cheats, searchQuery]);

  // -------------------------------------------------------------------------
  // Custom cheat form
  // -------------------------------------------------------------------------
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newCode, setNewCode] = useState("");
  const descriptionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddForm) {
      descriptionInputRef.current?.focus();
    }
  }, [showAddForm]);

  const handleAddCheat = () => {
    const trimmedCode = newCode.trim();
    if (!trimmedCode) {
      return;
    }
    onAddCustomCheat(newDescription.trim() || "Custom Cheat", trimmedCode);
    setNewDescription("");
    setNewCode("");
    setShowAddForm(false);
  };

  const handleAddFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newCode.trim()) {
      e.preventDefault();
      handleAddCheat();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setShowAddForm(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!open && !mounted) {
    return null;
  }

  const closing = !open && mounted;
  const hasAnyCheats = cheats.length > 0 || customCheats.length > 0;

  return (
    <div
      className={`absolute inset-0 z-50 flex items-center justify-center ${closing ? "animate-overlay-fade-out pointer-events-none" : "animate-overlay-fade-in"}`}
      role="dialog"
      aria-label="Cheat Codes"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        data-testid="cheat-panel-backdrop"
        onClick={closing ? undefined : onClose}
      />

      {/* Panel */}
      <div
        className={`relative z-10 bg-black/90 border border-white/10 rounded-xl shadow-2xl max-w-lg w-full mx-4 flex flex-col max-h-[80vh] ${closing ? "animate-dialog-scan-out" : "animate-dialog-scan-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{gameTitle}</h2>
            <p className="text-xs text-white/40 mt-0.5">Cheat Codes</p>
          </div>
          <button
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar (only shown when there are database cheats to search) */}
        {cheats.length > 5 && (
          <div className="px-5 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cheats..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
          </div>
        )}

        {/* Cheat list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {/* Empty / download states */}
          {!hasAnyCheats && databaseStatus === "downloading" && (
            <div className="py-8 text-center">
              <div className="inline-block w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-3" />
              <p className="text-sm text-white/40">Downloading cheat database…</p>
              <p className="text-xs text-white/25 mt-1">This only happens once.</p>
            </div>
          )}
          {!hasAnyCheats && databaseStatus === "not-downloaded" && (
            <div className="py-8 text-center">
              <p className="text-sm text-white/40">Cheat database not downloaded yet.</p>
              {onDownloadDatabase && (
                <button
                  onClick={onDownloadDatabase}
                  className="mt-3 px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Download Cheat Database
                </button>
              )}
            </div>
          )}
          {!hasAnyCheats && databaseStatus === "error" && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-400/80">Failed to download cheat database.</p>
              {onDownloadDatabase && (
                <button
                  onClick={onDownloadDatabase}
                  className="mt-3 px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Retry Download
                </button>
              )}
              <p className="text-xs text-white/25 mt-2">You can still add custom cheats below.</p>
            </div>
          )}
          {!hasAnyCheats && databaseStatus === "ready" && (
            <div className="py-8 text-center">
              <p className="text-sm text-white/40">No cheats found for this game.</p>
              <p className="text-xs text-white/25 mt-1">Add a custom cheat below.</p>
            </div>
          )}

          {/* Database cheats */}
          {filteredCheats.map((cheat) => (
            <CheatRow
              key={`db-${cheat.index}`}
              description={cheat.description}
              code={cheat.code}
              enabled={cheat.enabled}
              onToggle={(enabled) => onToggleCheat(cheat.index, enabled)}
            />
          ))}

          {/* Search no results */}
          {cheats.length > 0 && filteredCheats.length === 0 && searchQuery.trim() && (
            <p className="py-4 text-center text-xs text-white/30">
              No cheats matching &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {/* Custom cheats section */}
          {customCheats.length > 0 && (
            <>
              {cheats.length > 0 && (
                <div className="border-t border-white/10 mt-3 pt-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-white/25 mb-2">
                    Custom Cheats
                  </p>
                </div>
              )}
              {customCheats.map((cheat, i) => (
                <CheatRow
                  key={`custom-${i}`}
                  description={cheat.description}
                  code={cheat.code}
                  enabled={cheat.enabled}
                  onToggle={(enabled) => onToggleCustomCheat(i, enabled)}
                  onRemove={() => onRemoveCustomCheat(i)}
                />
              ))}
            </>
          )}
        </div>

        {/* Add custom cheat */}
        <div className="border-t border-white/10 px-5 py-3">
          {showAddForm ? (
            <div className="space-y-2" onKeyDown={handleAddFormKeyDown}>
              <input
                ref={descriptionInputRef}
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Cheat code (e.g. APEETPEY)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddCheat}
                  disabled={!newCode.trim()}
                  className="flex-1 bg-white/10 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/10 text-white text-xs font-medium rounded-lg py-1.5 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 text-white/40 hover:text-white text-xs rounded-lg py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add custom cheat
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CheatRow
// ---------------------------------------------------------------------------

interface CheatRowProps {
  description: string;
  code: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove?: () => void;
}

const CheatRow: React.FC<CheatRowProps> = ({ description, code, enabled, onToggle, onRemove }) => {
  return (
    <div className="flex items-center gap-3 py-1.5 group">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/80 truncate">{description}</p>
        <p className="text-[10px] text-white/25 font-mono truncate">{code}</p>
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          className="p-1 rounded text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          aria-label={`Remove ${description}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${description}`}
        className="data-[state=checked]:bg-green-500/80 data-[state=unchecked]:bg-white/15"
      />
    </div>
  );
};
