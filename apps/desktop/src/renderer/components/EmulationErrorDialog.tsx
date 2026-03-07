import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@gamelord/ui";
import { AlertTriangle } from "lucide-react";

export interface EmulationErrorDialogProps {
  message: string;
  onClose: () => void;
  open: boolean;
}

/**
 * Modal dialog shown when the emulation worker encounters a fatal error
 * (e.g. core crash, BIOS not found, ROM load failure). Gives the user
 * a clear message and a single action to return to the library.
 */
export const EmulationErrorDialog: React.FC<EmulationErrorDialogProps> = ({
  message,
  onClose,
  open,
}) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>Emulation Error</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            The game encountered a fatal error and had to stop.
          </AlertDialogDescription>
          {message && (
            <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {message}
            </pre>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Close</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
