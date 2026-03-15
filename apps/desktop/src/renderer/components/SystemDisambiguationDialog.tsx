import React, { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@gamelord/ui";
import { HelpCircle, SkipForward } from "lucide-react";

interface AmbiguousFile {
  ext: string;
  fullPath: string;
  matchingSystems: Array<{ id: string; name: string; shortName: string }>;
  mtimeMs: number;
}

export interface SystemDisambiguationDialogProps {
  files: Array<AmbiguousFile>;
  onResolve: (resolved: Array<{ fullPath: string; systemId: string; mtimeMs: number }>) => void;
  open: boolean;
}

/**
 * Dialog shown during scan when files have extensions that match
 * multiple systems (e.g. .chd could be PlayStation or Saturn).
 * Lets the user assign a system or skip each file, with an
 * "apply to all with this extension" option.
 */
export const SystemDisambiguationDialog: React.FC<SystemDisambiguationDialogProps> = ({
  files,
  onResolve,
  open,
}) => {
  // Set of file paths that have been decided (assigned or skipped)
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [applyToAll, setApplyToAll] = useState(false);
  const [resolved, setResolved] = useState<
    Array<{ fullPath: string; systemId: string; mtimeMs: number }>
  >([]);

  const pendingFiles = useMemo(() => {
    return files.filter((f) => !decided.has(f.fullPath));
  }, [files, decided]);

  const currentFile = pendingFiles[0];
  const sameExtCount = currentFile
    ? pendingFiles.filter((f) => f.ext === currentFile.ext).length
    : 0;

  const finalize = (
    newResolved: Array<{ fullPath: string; systemId: string; mtimeMs: number }>,
  ) => {
    onResolve(newResolved);
    setDecided(new Set());
    setApplyToAll(false);
    setResolved([]);
  };

  const handleSelect = (systemId: string) => {
    const file = currentFile;
    if (!file) {
      return;
    }

    const newResolved = [...resolved, { fullPath: file.fullPath, systemId, mtimeMs: file.mtimeMs }];
    const newDecided = new Set(decided);
    newDecided.add(file.fullPath);

    if (applyToAll) {
      // Apply to all remaining files with the same extension
      for (const f of pendingFiles) {
        if (f.fullPath !== file.fullPath && f.ext === file.ext) {
          newResolved.push({ fullPath: f.fullPath, systemId, mtimeMs: f.mtimeMs });
          newDecided.add(f.fullPath);
        }
      }
      setApplyToAll(false);
    }

    setDecided(newDecided);

    // Check if all files are now decided
    const remaining = files.filter((f) => !newDecided.has(f.fullPath));
    if (remaining.length === 0) {
      finalize(newResolved);
    } else {
      setResolved(newResolved);
    }
  };

  const handleSkip = () => {
    const file = currentFile;
    if (!file) {
      return;
    }

    const newDecided = new Set(decided);
    newDecided.add(file.fullPath);

    if (applyToAll) {
      for (const f of pendingFiles) {
        if (f.ext === file.ext) {
          newDecided.add(f.fullPath);
        }
      }
      setApplyToAll(false);
    }

    setDecided(newDecided);

    const remaining = files.filter((f) => !newDecided.has(f.fullPath));
    if (remaining.length === 0) {
      finalize(resolved);
    }
  };

  const handleSkipAll = () => {
    finalize(resolved);
  };

  if (!currentFile) {
    return null;
  }

  const fileName = currentFile.fullPath.split(/[/\\]/).pop() ?? currentFile.fullPath;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Which system is this?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-semibold text-foreground">{fileName}</span> ({currentFile.ext})
            could belong to multiple systems. Pick the right one, or skip it.
            {pendingFiles.length > 1 && (
              <span className="block mt-1 text-xs">
                {pendingFiles.length - 1} more file{pendingFiles.length - 1 !== 1 ? "s" : ""} to
                review
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {currentFile.matchingSystems.map((system) => (
            <button
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
              key={system.id}
              onClick={() => handleSelect(system.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{system.name}</div>
                <div className="text-sm text-muted-foreground">{system.shortName}</div>
              </div>
            </button>
          ))}

          <button
            className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-muted text-muted-foreground"
            onClick={handleSkip}
          >
            <SkipForward className="h-4 w-4 shrink-0" />
            <span>Skip this file</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          {sameExtCount > 1 ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                checked={applyToAll}
                className="rounded border-input"
                onChange={(event) => setApplyToAll(event.target.checked)}
                type="checkbox"
              />
              Apply to all {currentFile.ext} files ({sameExtCount})
            </label>
          ) : (
            <div />
          )}
          <Button onClick={handleSkipAll} size="sm" variant="ghost">
            Skip All
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
