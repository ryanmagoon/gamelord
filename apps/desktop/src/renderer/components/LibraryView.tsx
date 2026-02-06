import React, { useState, useEffect, useMemo } from 'react'
import { GameLibrary, Button, Badge, type GameCardMenuItem } from '@gamelord/ui'
import { Plus, FolderOpen, RefreshCw, Download } from 'lucide-react'
import type { Game, Game as UiGame } from '@gamelord/ui'
import type { Game as AppGame, GameSystem } from '../../types/library'
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

  useEffect(() => {
    loadLibrary()

    api.on('core:downloadProgress', (progress: CoreDownloadProgress) => {
      if (progress.phase === 'done' || progress.phase === 'error') {
        // Keep visible briefly so user sees completion
        setDownloadProgress(progress)
        setTimeout(() => setDownloadProgress(null), 2000)
      } else {
        setDownloadProgress(progress)
      }
    })

    return () => {
      api.removeAllListeners('core:downloadProgress')
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
      // In a properly secured Electron renderer (contextIsolation: true, nodeIntegration: false),
      // `process` is not available. If no base path is configured, prompt the user instead.
      if (!config.romsBasePath) {
        await handleSelectDirectory()
        return
      }
      const basePath = config.romsBasePath

      // Scan the base path
      const foundGames = await api.library.scanDirectory(basePath)

      if (foundGames.length > 0) {
        await loadLibrary()
      } else {
        // If no games found, prompt to select a directory
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
    // First add the system
    await api.library.addSystem(system)

    // Then prompt for ROM directory
    const directory = await api.dialog.selectDirectory()
    if (directory) {
      await api.library.updateSystemPath(system.id, directory)

      // Scan the directory for games
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

  const idToGame = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])

  /** Delegate to the parent's onPlayGame so App.tsx can handle core selection. */
  const handlePlayUiGame = (uiGame: UiGame) => {
    onPlayGame(uiGame)
  }

  const handleGameOptions = (game: AppGame) => {
    // TODO: Show game options menu (edit metadata, remove, etc.)
  }

  const handleUiGameOptions = (uiGame: UiGame) => {
    const fullGame = idToGame.get(uiGame.id)
    if (fullGame) {
      handleGameOptions(fullGame)
    }
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
            getMenuItems={getMenuItems}
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
    </div>
  )
}
