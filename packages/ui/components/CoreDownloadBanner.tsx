import React from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../utils'

export type CoreDownloadPhase = 'downloading' | 'extracting' | 'done' | 'error'

export interface CoreDownloadBannerProps {
  coreName: string
  phase: CoreDownloadPhase
  percent: number
  onRetry: () => void
  onDismiss: () => void
}

export const CoreDownloadBanner: React.FC<CoreDownloadBannerProps> = ({
  coreName,
  phase,
  percent,
  onRetry,
  onDismiss,
}) => {
  if (phase === 'done') return null

  const isError = phase === 'error'

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 border-b',
      isError ? 'bg-destructive/10' : 'bg-blue-500/10',
    )}>
      <Download className={cn(
        'h-4 w-4',
        isError ? 'text-destructive' : 'text-blue-500 animate-pulse',
      )} />
      <div className="flex-1">
        <div className="flex items-center justify-between text-sm">
          <span className={isError ? 'text-destructive' : 'text-blue-300'}>
            {isError
              ? `Failed to download ${coreName}`
              : phase === 'extracting'
                ? `Extracting ${coreName}...`
                : `Downloading ${coreName}...`}
          </span>
          {!isError && (
            <span className="text-blue-400">{percent}%</span>
          )}
        </div>
        {!isError && (
          <div className="mt-1 h-1 rounded-full bg-blue-900/50 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
      {isError && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}
