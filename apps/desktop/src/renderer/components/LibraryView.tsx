import React, { useState, useEffect, useMemo } from 'react'
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
  AlertDialogAction,
} from '@gamelord/ui'
import { Plus, FolderOpen, RefreshCw, Download, ImageDown, X } from 'lucide-react'
import type { Game, Game as UiGame } from '@gamelord/ui'
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
}> = ({ onPlayGame }) => {
  const api = (window as unknown as { gamelord: GamelordAPI }).gamelord

  const [games, setGames] = useState<AppGame[]>([])
  const [systems, setSystems] = useState<GameSystem[]>([])
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<CoreDownloadProgress | null>(null)

  // Artwork sync state
  const [artworkProgress, setArtworkProgress] = useState<ArtworkProgress | null>(null)
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [credentialUserId, setCredentialUserId] = useState('')
  const [credentialPassword, setCredentialPassword] = useState('')
  const [credentialError, setCredentialError] = useState('')

  // Game options menu state
  const [optionsMenuGame, setOptionsMenuGame] = useState<AppGame | null>(null)

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
      setArtworkProgress(progress)
    })

    api.on('artwork:syncComplete', () => {
      setArtworkProgress(null)
      loadLibrary()
    })

    return () => {
      api.removeAllListeners('core:downloadProgress')
      api.removeAllListeners('artwork:progress')
      api.removeAllListeners('artwork:syncComplete')
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
        await api.library.scanDirectory(directory)
        await loadLibrary()
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
        await api.library.scanDirectory(directory, system.id)
        await loadLibrary()
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
      await api.library.scanSystemFolders()
      await loadLibrary()
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
      }
    }
  }

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
    setArtworkProgress(null)
  }

  const handleSaveCredentials = async () => {
    if (!credentialUserId || !credentialPassword) {
      setCredentialError('Both username and password are required.')
      return
    }

    const result = await api.artwork.setCredentials(credentialUserId, credentialPassword)
    if (result.success) {
      setShowCredentialsDialog(false)
      setCredentialUserId('')
      setCredentialPassword('')
      setCredentialError('')
      await api.artwork.syncAll()
    } else {
      setCredentialError(result.error ?? 'Failed to save credentials.')
    }
  }

  const handleSyncSingleGame = async (gameId: string) => {
    const { hasCredentials } = await api.artwork.getCredentials()
    if (!hasCredentials) {
      setShowCredentialsDialog(true)
      return
    }
    await api.artwork.syncGame(gameId)
    await loadLibrary()
  }

  const idToGame = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])

  const handlePlayUiGame = async (uiGame: UiGame) => {
    const fullGame = idToGame.get(uiGame.id)
    if (!fullGame) return

    const result = await api.emulator.launch(
      fullGame.romPath,
      fullGame.systemId,
    )

    if (!result.success) {
      console.error('Failed to launch game:', result.error)
      const message = result.error?.includes('No known core')
        ? `No emulator core available for this system. The core could not be downloaded automatically.`
        : result.error;
      alert(`Failed to launch ${fullGame.title}: ${message}`)
    }
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadArtwork} disabled={!!artworkProgress}>
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

      {/* Artwork sync progress */}
      {artworkProgress && (
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-purple-500/10">
          <ImageDown className="h-4 w-4 text-purple-500 animate-pulse" />
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-purple-300">
                {artworkProgress.phase === 'error'
                  ? `Error: ${artworkProgress.error}`
                  : artworkProgress.phase === 'not-found'
                    ? `No artwork found for ${artworkProgress.gameTitle}`
                    : artworkProgress.phase === 'done'
                      ? `Downloaded artwork for ${artworkProgress.gameTitle}`
                      : artworkProgress.phase === 'hashing'
                        ? `Hashing ${artworkProgress.gameTitle}...`
                        : artworkProgress.phase === 'querying'
                          ? `Looking up ${artworkProgress.gameTitle}...`
                          : `Downloading artwork for ${artworkProgress.gameTitle}...`}
              </span>
              <span className="text-purple-400">
                {artworkProgress.current}/{artworkProgress.total}
              </span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-purple-900/50 overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${(artworkProgress.current / artworkProgress.total) * 100}%` }}
              />
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-purple-400 hover:text-purple-200" onClick={handleCancelArtworkSync}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* System filter tabs */}
      {systems.length > 0 && (
        <div className="flex gap-2 p-4 border-b overflow-x-auto">
          <Button
            variant={selectedSystem === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedSystem(null)}
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
                onClick={() => setSelectedSystem(system.id)}
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
            <AlertDialogAction onClick={handleSaveCredentials}>
              Save & Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
