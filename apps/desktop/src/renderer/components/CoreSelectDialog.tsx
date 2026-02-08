import React, { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@gamelord/ui'
import { Download, Check, Cpu, Loader2 } from 'lucide-react'
import type { CoreInfo } from '../types/global'

export interface CoreSelectDialogProps {
  open: boolean
  systemName: string
  cores: CoreInfo[]
  onSelect: (coreName: string, remember: boolean) => void
  onCancel: () => void
}

/**
 * Dialog shown when a system has multiple available emulator cores,
 * letting the user pick which one to use. Optionally remembers the
 * choice for future launches.
 *
 * Accepts an empty `cores` array to display a loading state — this
 * lets the caller open the dialog overlay immediately while fetching
 * cores asynchronously, preventing a flash of the underlying UI.
 */
export const CoreSelectDialog: React.FC<CoreSelectDialogProps> = ({
  open,
  systemName,
  cores,
  onSelect,
  onCancel,
}) => {
  const [remember, setRemember] = useState(false)
  const isLoading = cores.length === 0

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Choose Emulator Core
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isLoading ? (
              'Loading available cores\u2026'
            ) : (
              <>
                Multiple cores are available for{' '}
                <span className="font-semibold text-foreground">{systemName}</span>.
                Pick the one you'd like to use.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-lg border p-3 animate-pulse"
                >
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-3 w-48 rounded bg-muted" />
                  </div>
                  <div className="h-4 w-4 rounded bg-muted" />
                </div>
              ))}
              <div className="flex items-center justify-center py-1">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          ) : (
            cores.map((core) => (
              <button
                key={core.name}
                onClick={() => onSelect(core.name, remember)}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{core.displayName}</div>
                  {core.description && (
                    <div className="text-sm text-muted-foreground">
                      {core.description}
                    </div>
                  )}
                </div>
                {core.installed ? (
                  <Check className="h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="rounded border-input"
              disabled={isLoading}
            />
            Remember my choice
          </label>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
