import React, { useState, useEffect } from 'react';
import { GameLibrary, Button, Badge } from '@gamelord/ui';
import { Plus, FolderOpen, RefreshCw, Settings } from 'lucide-react';
import { Game, GameSystem } from '../../types/library';
import { EmptyLibrary } from './EmptyLibrary';

export const LibraryView: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const [loadedSystems, loadedGames] = await Promise.all([
        window.gamelord.library.getSystems(),
        window.gamelord.library.getGames()
      ]);
      setSystems(loadedSystems);
      setGames(loadedGames);
    } catch (error) {
      console.error('Failed to load library:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickScan = async () => {
    setIsScanning(true);
    try {
      const config = await window.gamelord.library.getConfig();
      const basePath = config.romsBasePath || `${process.env.HOME}/ROMs`;
      
      // Scan the base path
      const foundGames = await window.gamelord.library.scanDirectory(basePath);
      
      if (foundGames.length > 0) {
        await loadLibrary();
      } else {
        // If no games found, prompt to select a directory
        handleSelectDirectory();
      }
    } catch (error) {
      console.error('Quick scan failed:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectDirectory = async () => {
    const directory = await window.gamelord.dialog.selectDirectory();
    if (directory) {
      setIsScanning(true);
      try {
        await window.gamelord.library.scanDirectory(directory);
        await loadLibrary();
      } catch (error) {
        console.error('Directory scan failed:', error);
      } finally {
        setIsScanning(false);
      }
    }
  };

  const handleAddSystem = async (system: GameSystem) => {
    // First add the system
    await window.gamelord.library.addSystem(system);
    
    // Then prompt for ROM directory
    const directory = await window.gamelord.dialog.selectDirectory();
    if (directory) {
      await window.gamelord.library.updateSystemPath(system.id, directory);
      
      // Scan the directory for games
      setIsScanning(true);
      try {
        await window.gamelord.library.scanDirectory(directory, system.id);
        await loadLibrary();
      } catch (error) {
        console.error('Failed to scan system directory:', error);
      } finally {
        setIsScanning(false);
      }
    }
  };

  const handleScanSystemFolders = async () => {
    setIsScanning(true);
    try {
      await window.gamelord.library.scanSystemFolders();
      await loadLibrary();
    } catch (error) {
      console.error('System folder scan failed:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddRom = async (systemId: string) => {
    const romPath = await window.gamelord.dialog.selectRomFile(systemId);
    if (romPath) {
      const game = await window.gamelord.library.addGame(romPath, systemId);
      if (game) {
        setGames([...games, game]);
      }
    }
  };

  const handlePlayGame = async (game: Game) => {
    // Load the core and ROM
    const result = await window.gamelord.core.load({
      corePath: `/cores/${game.systemId}.so`, // This would need proper core path mapping
      romPath: game.romPath
    });
    
    if (result.success) {
      console.log('Game loaded:', game.title);
    } else {
      console.error('Failed to load game:', result.error);
    }
  };

  const handleGameOptions = (game: Game) => {
    // TODO: Show game options menu (edit metadata, remove, etc.)
    console.log('Game options:', game);
  };

  const filteredGames = selectedSystem
    ? games.filter(game => game.systemId === selectedSystem)
    : games;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (games.length === 0 && !isScanning) {
    return (
      <EmptyLibrary
        onAddSystem={handleAddSystem}
        onScanDirectory={handleSelectDirectory}
        onQuickScan={handleQuickScan}
        availableSystems={systems.length > 0 ? systems : []}
      />
    );
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
            const systemGames = games.filter(g => g.systemId === system.id);
            return (
              <Button
                key={system.id}
                variant={selectedSystem === system.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedSystem(system.id)}
              >
                {system.shortName} ({systemGames.length})
              </Button>
            );
          })}
        </div>
      )}

      {/* Game library */}
      <div className="flex-1 overflow-auto p-4">
        {filteredGames.length > 0 ? (
          <GameLibrary
            games={filteredGames.map(game => ({
              ...game,
              platform: game.system,
              genre: game.metadata?.genre
            }))}
            onPlayGame={handlePlayGame}
            onGameOptions={handleGameOptions}
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
  );
};