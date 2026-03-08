import React, { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";

export interface ResumeGameDialogProps {
  gameTitle: string;
  onCancel: () => void;
  onResume: (remember: boolean) => void;
  onStartFresh: (remember: boolean) => void;
  open: boolean;
}

export const ResumeGameDialog: React.FC<ResumeGameDialogProps> = ({
  gameTitle,
  onCancel,
  onResume,
  onStartFresh,
  open,
}) => {
  const [remember, setRemember] = useState(false);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Resume Game?</AlertDialogTitle>
          <AlertDialogDescription>
            An autosave was found for{" "}
            <span className="font-semibold text-foreground">{gameTitle}</span>. Would you like to
            continue where you left off?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button className="sm:flex-1" onClick={() => onStartFresh(remember)} variant="outline">
            <RotateCcw className="h-4 w-4 mr-2" />
            Start Fresh
          </Button>
          <AlertDialogAction className="sm:flex-1" onClick={() => onResume(remember)}>
            <Play className="h-4 w-4 mr-2" />
            Resume
          </AlertDialogAction>
        </AlertDialogFooter>
        <div className="flex items-center justify-between pt-2 border-t">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              checked={remember}
              className="rounded border-input"
              onChange={(event) => setRemember(event.target.checked)}
              type="checkbox"
            />
            Remember my choice
          </label>
          <Button onClick={onCancel} size="sm" variant="ghost">
            Cancel
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
