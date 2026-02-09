import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  GameLibrary,
  Button,
  Badge,
  Input,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  cn,
  type Game,
  type Game as UiGame,
  type GameCardMenuItem,
  type ArtworkSyncPhase,
} from '@gamelord/ui'
import { Plus, FolderOpen, RefreshCw, Download, ImageDown, X } from 'lucide-react'
import type { Game as AppGame, GameSystem } from '../../types/library'
import type { ArtworkProgress } from '../../types/artwork'
import type { GamelordAPI } from '../types/global'
import { EmptyLibrary } from './EmptyLibrary'

interface CoreDownloadProgress {
  coreName: string;
  systemId: string;
  phase: 'downloading' | 'extracting' | 'done' | 'error';
  percent: number;
  error?: string;
}

export const LibraryView: React.FC<{
  onPlayGame: (game: Game) => void
  getMenuItems?: (game: Game) => GameCardMenuItem[]
}> = ({ onPlayGame, getMenuItems }) => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord

  const [games, setGames] = useState<AppGame[]>([])
  const [systems, setSystems] = useState<GameSystem[]>([])
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<CoreDownloadProgress | null>(null)

  // Artwork sync state — per-card progress map replaces the old banner
  const [artworkSyncPhases, setArtworkSyncPhases] = useState<Map<string, ArtworkSyncPhase>>(new Map())
  const [syncCounter, setSyncCounter] = useState<{ current: number; total: number } | null>(null)
  const phaseCleanupTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  /** Track sync results for the notification summary. */
  const syncResults = useRef<{ found: number; notFound: number; errors: number; lastErrorCode?: string; lastError?: string }>({ found: 0, notFound: 0, errors: 0 })
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [credentialUserId, setCredentialUserId] = useState('')
  const [credentialPassword, setCredentialPassword] = useState('')
  const [credentialError, setCredentialError] = useState('')
  const [isValidatingCredentials, setIsValidatingCredentials] = useState(false)
  /** Notification banner shown after sync completes or errors. */
  const [syncNotification, setSyncNotification] = useState<{ message: string; variant: 'error' | 'warning' | 'success' } | null>(null)

  // Game options menu state
  const [optionsMenuGame, setOptionsMenuGame] = useState<AppGame | null>(null)

  /**
   * Set a sync phase for a game card and optionally schedule its cleanup.
   * Terminal phases ('done', 'error', 'not-found') auto-clear after a delay.
   */
  const setCardPhase = useCallback((gameId: string, phase: ArtworkSyncPhase) => {
    // Clear any pending cleanup timer for this card
    const existing = phaseCleanupTimers.current.get(gameId)
    if (existing) clearTimeout(existing)

    setArtworkSyncPhases(prev => {
      const next = new Map(prev)
      if (phase === null) {
        next.delete(gameId)
      } else {
        next.set(gameId, phase)
      }
      return next
    })

    // Schedule auto-cleanup for terminal states
    if (phase === 'done') {
      const timer = setTimeout(() => {
        setArtworkSyncPhases(prev => {
          const next = new Map(prev)
          next.delete(gameId)
          return next
        })
        phaseCleanupTimers.current.delete(gameId)
      }, 1500) // Hold 'done' for dissolve animation
      phaseCleanupTimers.current.set(gameId, timer)
    } else if (phase === 'error' || phase === 'not-found') {
      const timer = setTimeout(() => {
        setArtworkSyncPhases(prev => {
          const next = new Map(prev)
          next.delete(gameId)
          return next
        })
        phaseCleanupTimers.current.delete(gameId)
      }, 2500) // Hold error/not-found briefly
      phaseCleanupTimers.current.set(gameId, timer)
    }
  }, [])

  useEffect(() => {
    loadLibrary()

    api.on('core:downloadProgress', (progress: CoreDownloadProgress) => {
      if (progress.phase === 'done' || progress.phase === 'error') {
        setDownloadProgress(progress)
        setTimeout(() => setDownloadProgress(null), 2000)
      } else {
        setDownloadProgress(progress)
      }
    })

    api.on('artwork:progress', (progress: ArtworkProgress) => {
      // Update per-card sync phase
      setCardPhase(progress.gameId, progress.phase as ArtworkSyncPhase)

      // Update counter for header badge
      setSyncCounter({ current: progress.current, total: progress.total })

      // Track results for summary notification
      if (progress.phase === 'done') {
        syncResults.current.found++
        loadLibrary()
      } else if (progress.phase === 'not-found') {
        syncResults.current.notFound++
      } else if (progress.phase === 'error') {
        syncResults.current.errors++
        syncResults.current.lastErrorCode = progress.errorCode
        syncResults.current.lastError = progress.error
      }
    })

    api.on('artwork:syncComplete', () => {
      setSyncCounter(null)
      loadLibrary()

      // Show summary notification
      const { found, notFound, errors, lastErrorCode, lastError } = syncResults.current
      const total = found + notFound + errors
      if (total > 0) {
        if (lastErrorCode === 'auth-failed') {
          // Clear bad credentials so the dialog reopens on next attempt
          api.artwork.clearCredentials()
          setSyncNotification({
            message: 'Artwork sync stopped: invalid ScreenScraper credentials. Click "Download Artwork" to update your account.',
            variant: 'error',
          })
        } else if (lastErrorCode === 'timeout') {
          setSyncNotification({
            message: 'Artwork sync stopped: ScreenScraper is not responding. Try again later.',
            variant: 'error',
          })
        } else if (lastErrorCode === 'rate-limited') {
          setSyncNotification({
            message: 'Artwork sync stopped: ScreenScraper is rate limiting requests. Please wait a few minutes and try again.',
            variant: 'error',
          })
        } else if (errors > 0) {
          setSyncNotification({
            message: `Artwork sync finished with errors: ${found} found, ${errors} failed${lastError ? ` (${lastError})` : ''}, ${notFound} not in database.`,
            variant: 'warning',
          })
        } else if (notFound > 0 && found === 0) {
          setSyncNotification({
            message: `No artwork found. ${notFound} game${notFound === 1 ? '' : 's'} not recognized by ScreenScraper.`,
            variant: 'warning',
          })
        } else if (found > 0) {
          setSyncNotification({
            message: `Downloaded artwork for ${found} game${found === 1 ? '' : 's'}.${notFound > 0 ? ` ${notFound} not found.` : ''}`,
            variant: 'success',
          })
        }
      }
      // Reset for next sync
      syncResults.current = { found: 0, notFound: 0, errors: 0 }
    })

    api.on('artwork:syncError', (data: { error: string }) => {
      setSyncCounter(null)
      setArtworkSyncPhases(new Map())
      syncResults.current = { found: 0, notFound: 0, errors: 0 }

      // Show actionable error to the user
      if (data.error.includes('auth') || data.error.includes('credential') || data.error.includes('401') || data.error.includes('403')) {
        setSyncNotification({
          message: 'Artwork sync failed: invalid credentials. Please update your ScreenScraper account settings.',
          variant: 'error',
        })
      } else if (data.error.includes('timeout') || data.error.includes('ETIMEDOUT')) {
        setSyncNotification({
          message: 'Artwork sync failed: ScreenScraper is not responding. Try again later.',
          variant: 'error',
        })
      } else {
        setSyncNotification({
          message: `Artwork sync failed: ${data.error}`,
          variant: 'error',
        })
      }
    })

    return () => {
      api.removeAllListeners('core:downloadProgress')
      api.removeAllListeners('artwork:progress')
      api.removeAllListeners('artwork:syncComplete')
      api.removeAllListeners('artwork:syncError')
      // Clear all cleanup timers
      phaseCleanupTimers.current.forEach(timer => clearTimeout(timer))
      phaseCleanupTimers.current.clear()
    }
  }, [])

  const loadLibrary = async () => {
    setLoading(true)
    try {
      const [loadedSystems, loadedGames] = await Promise.all([
        api.library.getSystems(),
        api.library.getGames(),
      ])
      setSystems(loadedSystems)
      setGames(loadedGames)
    } catch (error) {
      console.error('Failed to load library:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Auto-sync artwork for newly imported games.
   * Only triggers if the user has configured ScreenScraper credentials.
   */
  const autoSyncNewGames = useCallback(async (newGames: AppGame[]) => {
    if (newGames.length === 0) return

    try {
      const { hasCredentials } = await api.artwork.getCredentials()
      if (!hasCredentials) return

      const gameIds = newGames.map(g => g.id)
      await api.artwork.syncGames(gameIds)
    } catch (error) {
      console.error('Auto-sync failed:', error)
    }
  }, [api])

  const handleQuickScan = async () => {
    setIsScanning(true)
    try {
      const config = await api.library.getConfig()
      if (!config.romsBasePath) {
        await handleSelectDirectory()
        return
      }
      const basePath = config.romsBasePath

      const foundGames = await api.library.scanDirectory(basePath)

      if (foundGames.length > 0) {
        await loadLibrary()
        autoSyncNewGames(foundGames)
      } else {
        await handleSelectDirectory()
      }
    } catch (error) {
      console.error('Quick scan failed:', error)
    } finally {
      setIsScanning(false)
    }
  }

  const handleSelectDirectory = async () => {
    const directory = await api.dialog.selectDirectory()
    if (directory) {
      setIsScanning(true)
      try {
        const foundGames = await api.library.scanDirectory(directory)
        await loadLibrary()
        autoSyncNewGames(foundGames)
      } catch (error) {
        console.error('Directory scan failed:', error)
      } finally {
        setIsScanning(false)
      }
    }
  }

  const handleAddSystem = async (system: GameSystem) => {
    await api.library.addSystem(system)

    const directory = await api.dialog.selectDirectory()
    if (directory) {
      await api.library.updateSystemPath(system.id, directory)

      setIsScanning(true)
      try {
        const foundGames = await api.library.scanDirectory(directory, system.id)
        await loadLibrary()
        autoSyncNewGames(foundGames)
      } catch (error) {
        console.error('Failed to scan system directory:', error)
      } finally {
        setIsScanning(false)
      }
    }
  }

  const handleScanSystemFolders = async () => {
    setIsScanning(true)
    try {
      const foundGames = await api.library.scanSystemFolders()
      await loadLibrary()
      autoSyncNewGames(foundGames)
    } catch (error) {
      console.error('System folder scan failed:', error)
    } finally {
      setIsScanning(false)
    }
  }

  const handleAddRom = async (systemId: string) => {
    const romPath = await api.dialog.selectRomFile(systemId)
    if (romPath) {
      const game = await api.library.addGame(romPath, systemId)
      if (game) {
        setGames([...games, game])
        autoSyncNewGames([game])
      }
    }
  }

  const isSyncing = syncCounter !== null

  const handleDownloadArtwork = async () => {
    const { hasCredentials } = await api.artwork.getCredentials()
    if (!hasCredentials) {
      setShowCredentialsDialog(true)
      return
    }
    await api.artwork.syncAll()
  }

  const handleCancelArtworkSync = async () => {
    await api.artwork.cancelSync()
    setSyncCounter(null)
    setArtworkSyncPhases(new Map())
  }

  const handleSaveCredentials = async () => {
    if (!credentialUserId || !credentialPassword) {
      setCredentialError('Both username and password are required.')
      return
    }

    setCredentialError('')
    setIsValidatingCredentials(true)
    try {
      const result = await api.artwork.setCredentials(credentialUserId, credentialPassword)
      if (result.success) {
        setShowCredentialsDialog(false)
        setCredentialUserId('')
        setCredentialPassword('')
        setCredentialError('')
        await api.artwork.syncAll()
      } else {
        // Show specific error messages based on error code
        if (result.errorCode === 'auth-failed') {
          setCredentialError('Invalid username or password. Please check your ScreenScraper credentials.')
        } else if (result.errorCode === 'timeout') {
          setCredentialError('Could not reach ScreenScraper. The server may be down — try again later.')
        } else if (result.errorCode === 'rate-limited') {
          setCredentialError('ScreenScraper is rate limiting requests. Please wait a moment and try again.')
        } else {
          setCredentialError(result.error ?? 'Failed to validate credentials.')
        }
      }
    } finally {
      setIsValidatingCredentials(false)
    }
  }

  const handleSyncSingleGame = async (gameId: string) => {
    const { hasCredentials } = await api.artwork.getCredentials()
    if (!hasCredentials) {
      setShowCredentialsDialog(true)
      return
    }
    const result = await api.artwork.syncGame(gameId)
    if (!result.success) {
      console.error(`Artwork sync failed for game ${gameId}:`, result.error)
    }
    await loadLibrary()
  }

  /** Switches the active system filter. The FLIP hook in GameLibrary handles animation. */
  const switchSystem = useCallback((nextSystem: string | null) => {
    setSelectedSystem(nextSystem)
  }, [])

  const idToGame = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])

  /** Delegate to the parent's onPlayGame so App.tsx can handle core selection. */
  const handlePlayUiGame = (uiGame: UiGame) => {
    onPlayGame(uiGame)
  }

  const handleGameOptions = (game: AppGame) => {
    setOptionsMenuGame(game)
  }

  const handleUiGameOptions = (uiGame: UiGame) => {
    const fullGame = idToGame.get(uiGame.id)
    if (fullGame) {
      handleGameOptions(fullGame)
    }
  }

  const handleRemoveGame = async (gameId: string) => {
    await api.library.removeGame(gameId)
    setOptionsMenuGame(null)
    await loadLibrary()
  }

  const filteredGames = selectedSystem
    ? games.filter((game) => game.systemId === selectedSystem)
    : games

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (games.length === 0 && !isScanning) {
    return (
      <EmptyLibrary
        onAddSystem={handleAddSystem}
        onScanDirectory={handleSelectDirectory}
        onQuickScan={handleQuickScan}
        availableSystems={systems.length > 0 ? systems : []}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Library</h1>
          {isScanning && (
            <Badge variant="secondary" className="animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Scanning...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Sync progress badge — replaces the old purple banner */}
          {isSyncing && (
            <Badge variant="secondary" className="gap-1.5 text-xs font-normal">
              <ImageDown className="h-3 w-3 animate-pulse" />
              Syncing {syncCounter.current}/{syncCounter.total}
              <button
                onClick={handleCancelArtworkSync}
                className="ml-1 hover:text-destructive transition-colors"
                aria-label="Cancel artwork sync"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadArtwork} disabled={isSyncing}>
            <ImageDown className="h-4 w-4 mr-2" />
            Download Artwork
          </Button>
          <Button variant="outline" size="sm" onClick={handleSelectDirectory}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Add Folder
          </Button>
          <Button variant="outline" size="sm" onClick={handleScanSystemFolders}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Rescan
          </Button>
        </div>
      </div>

      {/* Sync result notification */}
      {syncNotification && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 border-b text-sm',
          syncNotification.variant === 'error' && 'bg-destructive/10 text-destructive',
          syncNotification.variant === 'warning' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
          syncNotification.variant === 'success' && 'bg-green-500/10 text-green-700 dark:text-green-400',
        )}>
          <span className="flex-1">{syncNotification.message}</span>
          <button
            onClick={() => setSyncNotification(null)}
            className="hover:opacity-70 transition-opacity"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Core download progress */}
      {downloadProgress && downloadProgress.phase !== 'done' && (
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-blue-500/10">
          <Download className="h-4 w-4 text-blue-500 animate-pulse" />
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-300">
                {downloadProgress.phase === 'error'
                  ? `Failed to download ${downloadProgress.coreName}`
                  : downloadProgress.phase === 'extracting'
                    ? `Extracting ${downloadProgress.coreName}...`
                    : `Downloading ${downloadProgress.coreName}...`}
              </span>
              <span className="text-blue-400">{downloadProgress.percent}%</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-blue-900/50 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* System filter tabs */}
      {systems.length > 0 && (
        <div className="flex gap-2 p-4 border-b overflow-x-auto">
          <Button
            variant={selectedSystem === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => switchSystem(null)}
          >
            All ({games.length})
          </Button>
          {systems.map((system) => {
            const systemGames = games.filter((g) => g.systemId === system.id)
            return (
              <Button
                key={system.id}
                variant={selectedSystem === system.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => switchSystem(system.id)}
              >
                {system.shortName} ({systemGames.length})
              </Button>
            )
          })}
        </div>
      )}

      {/* Game library */}
      <div className="flex-1 overflow-auto p-4">
        {filteredGames.length > 0 ? (
          <GameLibrary
            games={filteredGames.map<UiGame>((game) => ({
              id: game.id,
              title: game.title,
              platform: game.system,
              systemId: game.systemId,
              genre: game.metadata?.genre,
              coverArt: game.coverArt,
              romPath: game.romPath,
              lastPlayed: game.lastPlayed,
              playTime: game.playTime,
            }))}
            onPlayGame={(g) => {
              void handlePlayUiGame(g)
            }}
            onGameOptions={handleUiGameOptions}
            getMenuItems={getMenuItems}
            artworkSyncPhases={artworkSyncPhases}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground mb-4">
              No games found for this system
            </p>
            {selectedSystem && (
              <Button
                variant="outline"
                onClick={() => handleAddRom(selectedSystem)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add ROM
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Game options dialog */}
      <AlertDialog open={!!optionsMenuGame} onOpenChange={(open) => { if (!open) setOptionsMenuGame(null) }}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{optionsMenuGame?.title}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                const gameId = optionsMenuGame?.id
                setOptionsMenuGame(null)
                if (gameId) handleSyncSingleGame(gameId)
              }}
            >
              <ImageDown className="h-4 w-4 mr-2" />
              Download Artwork
            </Button>
            <Button
              variant="ghost"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => {
                if (optionsMenuGame) handleRemoveGame(optionsMenuGame.id)
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Remove from Library
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ScreenScraper credentials dialog */}
      <AlertDialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ScreenScraper Account</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  GameLord uses ScreenScraper to download cover art and game metadata.
                  Enter your free account credentials to get started.
                </p>
                <p className="text-xs">
                  Don't have an account? Register at screenscraper.fr
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder="Username"
                    value={credentialUserId}
                    onChange={(e) => setCredentialUserId(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={credentialPassword}
                    onChange={(e) => setCredentialPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveCredentials()
                    }}
                  />
                  {credentialError && (
                    <p className="text-sm text-destructive">{credentialError}</p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setCredentialUserId('')
              setCredentialPassword('')
              setCredentialError('')
            }}>
              Cancel
            </AlertDialogCancel>
            {/* Use a regular Button instead of AlertDialogAction to prevent
                the dialog from auto-closing when validation fails. */}
            <Button onClick={handleSaveCredentials} disabled={isValidatingCredentials}>
              {isValidatingCredentials ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Save & Download'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
