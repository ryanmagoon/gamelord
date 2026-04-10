import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, HardDrive } from "lucide-react";
import { cn } from "../../utils";

export type SaveStateToastStatus =
  | "idle"
  | "save-success"
  | "load-success"
  | "error"
  | "empty-slot";

export interface SaveStateToastProps {
  status: SaveStateToastStatus;
  slot?: number;
  errorMessage?: string;
  dismissAfterMs?: number;
  onDismiss: () => void;
}

export const SaveStateToast: React.FC<SaveStateToastProps> = ({
  status,
  slot,
  errorMessage,
  dismissAfterMs = 2000,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (status === "idle") {
      setVisible(false);
      return;
    }
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    const enterTimer = setTimeout(() => setVisible(true), 16);
    dismissTimerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismissRef.current(), 300);
    }, dismissAfterMs);
    return () => {
      clearTimeout(enterTimer);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [status, dismissAfterMs]);

  if (status === "idle") return null;

  const slotLabel = slot !== undefined ? ` · Slot ${slot}` : "";
  const message = {
    "save-success": `State saved${slotLabel}`,
    "load-success": `State loaded${slotLabel}`,
    "empty-slot": `No save in slot ${slot ?? ""}`,
    error: errorMessage ? `Failed: ${errorMessage}` : "Save state failed",
  }[status];

  const isSuccess = status === "save-success" || status === "load-success";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "absolute bottom-10 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-2 px-4 py-2 rounded-lg",
        "text-sm font-medium select-none pointer-events-none",
        "shadow-lg backdrop-blur-sm",
        "transition-all duration-300 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        isSuccess && "bg-emerald-900/80 text-emerald-100 border border-emerald-500/30",
        !isSuccess && "bg-zinc-900/85 text-zinc-200 border border-zinc-600/40",
      )}
    >
      {isSuccess && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
      {status === "empty-slot" && <HardDrive className="h-4 w-4 text-zinc-400 shrink-0" />}
      {status === "error" && <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />}
      <span>{message}</span>
    </div>
  );
};
