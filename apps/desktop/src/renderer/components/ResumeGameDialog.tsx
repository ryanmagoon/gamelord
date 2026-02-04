import React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@gamelord/ui'
import { Play, RotateCcw } from 'lucide-react'

export interface ResumeGameDialogProps {
  open: boolean
  gameTitle: string
  onResume: () => void
  onStartFresh: () => void
}

export const ResumeGameDialog: React.FC<ResumeGameDialogProps> = ({
  open,
  gameTitle,
  onResume,
  onStartFresh,
}) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Resume Game?</AlertDialogTitle>
          <AlertDialogDescription>
            An autosave was found for <span className="font-semibold text-foreground">{gameTitle}</span>.
            Would you like to continue where you left off?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onStartFresh} className="sm:flex-1">
            <RotateCcw className="h-4 w-4 mr-2" />
            Start Fresh
          </AlertDialogCancel>
          <AlertDialogAction onClick={onResume} className="sm:flex-1">
            <Play className="h-4 w-4 mr-2" />
            Resume
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
