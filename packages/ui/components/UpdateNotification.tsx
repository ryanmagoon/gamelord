import React, { useEffect, useState } from "react";
import { Download, RefreshCw, X, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../utils";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateNotificationProps {
  status: UpdateStatus;
  version?: string;
  progress?: UpdateProgress;
  error?: string;
  onRestart: () => void;
  onDismiss: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  status,
  version,
  progress,
  error,
  onRestart,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);
  const [errorAutoDismiss, setErrorAutoDismiss] = useState<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Animate entrance when status changes from idle to active
  useEffect(() => {
    if (status !== "idle") {
      // Delay to allow the DOM to render at opacity 0 before transitioning in
      const timer = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(timer);
    }
    setVisible(false);
    return undefined;
  }, [status]);

  // Auto-dismiss errors after 8 seconds
  useEffect(() => {
    if (status === "error") {
      const timer = setTimeout(() => onDismiss(), 8000);
      setErrorAutoDismiss(timer);
      return () => clearTimeout(timer);
    }
    if (errorAutoDismiss) {
      clearTimeout(errorAutoDismiss);
      setErrorAutoDismiss(null);
    }
    return undefined;
  }, [status]);

  if (status === "idle") {
    return null;
  }

  const isError = status === "error";
  const isDownloaded = status === "downloaded";
  const isDownloading = status === "downloading";
  const percent = progress?.percent ?? 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b transition-all duration-300 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
        isError && "bg-destructive/10",
        isDownloaded && "bg-emerald-500/10",
        !isError && !isDownloaded && "bg-blue-500/10",
      )}
    >
      {/* Icon */}
      {isDownloaded ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : isError ? (
        <Download className="h-4 w-4 text-destructive shrink-0" />
      ) : (
        <Download className="h-4 w-4 text-blue-500 animate-pulse shrink-0" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-sm">
          <span
            className={cn(
              isError && "text-destructive",
              isDownloaded && "text-emerald-400",
              !isError && !isDownloaded && "text-blue-300",
            )}
          >
            {status === "checking" && "Checking for updates..."}
            {status === "available" && `Update v${version} available — downloading...`}
            {isDownloading &&
              `Downloading v${version}... ${formatSpeed(progress?.bytesPerSecond ?? 0)}`}
            {isDownloaded && `Update v${version} ready — restart to install`}
            {isError && (error ?? "Update check failed")}
          </span>
          {isDownloading && (
            <span className="text-blue-400 ml-2 shrink-0">{Math.round(percent)}%</span>
          )}
        </div>

        {/* Progress bar */}
        {isDownloading && (
          <div className="mt-1.5 h-1 rounded-full bg-blue-900/50 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      {isDownloaded && (
        <Button variant="outline" size="sm" onClick={onRestart} className="shrink-0">
          <RefreshCw className="h-3 w-3 mr-1" />
          Restart Now
        </Button>
      )}

      {/* Dismiss (for downloaded and error states) */}
      {(isDownloaded || isError) && (
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
