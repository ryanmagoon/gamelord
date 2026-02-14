import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { app } from 'electron';
import { Game, GameSystem, LibraryConfig, DEFAULT_SYSTEMS } from '../../types/library';
import crypto from 'crypto';
import { libraryLog } from '../logger';
import { findRomInZip, extractFileFromZip } from '../utils/zipExtraction';

export class LibraryService {
  private config: LibraryConfig;
  private games: Map<string, Game> = new Map();
  private configPath: string;
  private libraryPath: string;
  private romsCacheDir: string;

  constructor() {
    const userData = app.getPath('userData');
    this.configPath = path.join(userData, 'library-config.json');
    this.libraryPath = path.join(userData, 'library.json');
    this.romsCacheDir = path.join(userData, 'roms-cache');
    this.config = {
      systems: [],
      scanRecursive: true,
      autoScan: false,
    };
    this.loadConfig();
    this.loadLibrary();
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
    } catch (error) {
      // If no config exists, create default
      this.config = {
        systems: DEFAULT_SYSTEMS,
        romsBasePath: path.join(app.getPath('home'), 'ROMs'),
        scanRecursive: true,
        autoScan: false,
      };
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  private async loadLibrary(): Promise<void> {
    try {
      const data = await fs.readFile(this.libraryPath, 'utf-8');
      const games: Game[] = JSON.parse(data);
      this.games = new Map(games.map(game => [game.id, game]));
      await this.migrateGameIds();
    } catch (error) {
      // No library file yet
      this.games = new Map();
    }
  }

  private async migrateGameIds(): Promise<void> {
    let migrated = false;
    const entriesToMigrate: Array<{ oldId: string; game: Game }> = [];

    for (const [id, game] of this.games.entries()) {
      // Old MD5 hashes are 32 hex chars; new SHA-256 hashes are 64
      if (id.length === 32 && /^[0-9a-f]+$/.test(id)) {
        entriesToMigrate.push({ oldId: id, game });
      }
    }

    for (const { oldId, game } of entriesToMigrate) {
      const newId = await this.generateGameId(game.romPath);
      if (newId !== oldId) {
        this.games.delete(oldId);
        game.id = newId;
        this.games.set(newId, game);
        migrated = true;
      }
    }

    if (migrated) {
      await this.saveLibrary();
    }
  }

  private async saveLibrary(): Promise<void> {
    const games = Array.from(this.games.values());
    await fs.writeFile(this.libraryPath, JSON.stringify(games, null, 2));
  }

  public async addSystem(system: GameSystem): Promise<void> {
    const existing = this.config.systems.find(s => s.id === system.id);
    if (!existing) {
      this.config.systems.push(system);
      await this.saveConfig();
    }
  }

  public async removeSystem(systemId: string): Promise<void> {
    this.config.systems = this.config.systems.filter(s => s.id !== systemId);
    // Also remove all games from this system (and clean up cached ROMs)
    for (const [id, game] of this.games.entries()) {
      if (game.systemId === systemId) {
        if (game.romPath.startsWith(this.romsCacheDir)) {
          try {
            await fs.unlink(game.romPath);
          } catch {
            // File may already be gone
          }
        }
        this.games.delete(id);
      }
    }
    await this.saveConfig();
    await this.saveLibrary();
  }

  public async updateSystemPath(systemId: string, romsPath: string): Promise<void> {
    const system = this.config.systems.find(s => s.id === systemId);
    if (system) {
      system.romsPath = romsPath;
      await this.saveConfig();
    }
  }

  public getSystems(): GameSystem[] {
    return this.config.systems;
  }

  public getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  public getGames(systemId?: string): Game[] {
    const games = Array.from(this.games.values());
    if (systemId) {
      return games.filter(game => game.systemId === systemId);
    }
    return games;
  }

  public async scanDirectory(directoryPath: string, systemId?: string): Promise<Game[]> {
    const foundGames: Game[] = [];
    
    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name);
        
        if (entry.isDirectory() && this.config.scanRecursive) {
          // If no specific system, check if directory name matches a system
          if (!systemId) {
            const matchingSystem = this.config.systems.find(
              s => s.shortName.toLowerCase() === entry.name.toLowerCase() ||
                   s.name.toLowerCase() === entry.name.toLowerCase() ||
                   s.id === entry.name.toLowerCase()
            );
            if (matchingSystem) {
              const subGames = await this.scanDirectory(fullPath, matchingSystem.id);
              foundGames.push(...subGames);
            } else {
              // Continue scanning recursively
              const subGames = await this.scanDirectory(fullPath, systemId);
              foundGames.push(...subGames);
            }
          } else {
            const subGames = await this.scanDirectory(fullPath, systemId);
            foundGames.push(...subGames);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();

          if (ext === '.zip' && systemId !== 'arcade') {
            // Non-arcade zip: attempt to extract a ROM from the archive
            try {
              const game = await this.handleZipFile(fullPath, systemId);
              if (game) {
                foundGames.push(game);
                this.games.set(game.id, game);
              }
            } catch (error) {
              libraryLog.warn(`Skipping zip file ${fullPath}:`, error);
            }
          } else {
            // Find matching system by extension
            const systems = systemId
              ? this.config.systems.filter(s => s.id === systemId)
              : this.config.systems;

            for (const system of systems) {
              if (system.extensions.includes(ext)) {
                const gameId = await this.generateGameId(fullPath);
                const existing = this.games.get(gameId);
                const game: Game = existing
                  ? { ...existing, title: this.cleanGameTitle(path.basename(entry.name, ext)), system: system.name, systemId: system.id, romPath: fullPath }
                  : { id: gameId, title: this.cleanGameTitle(path.basename(entry.name, ext)), system: system.name, systemId: system.id, romPath: fullPath };

                foundGames.push(game);
                this.games.set(gameId, game);
                break;
              }
            }
          }
        }
      }
    } catch (error) {
      libraryLog.error(`Error scanning directory ${directoryPath}:`, error);
    }
    
    if (foundGames.length > 0) {
      await this.saveLibrary();
    }
    
    return foundGames;
  }

  public async scanSystemFolders(): Promise<Game[]> {
    const allGames: Game[] = [];
    
    for (const system of this.config.systems) {
      if (system.romsPath) {
        try {
          const games = await this.scanDirectory(system.romsPath, system.id);
          allGames.push(...games);
        } catch (error) {
          libraryLog.error(`Error scanning ${system.name} folder:`, error);
        }
      }
    }
    
    return allGames;
  }

  public async addGame(romPath: string, systemId: string): Promise<Game | null> {
    const system = this.config.systems.find(s => s.id === systemId);
    if (!system) return null;

    const ext = path.extname(romPath).toLowerCase();

    // Handle zip files for non-arcade systems
    if (ext === '.zip' && systemId !== 'arcade') {
      const game = await this.handleZipFile(romPath, systemId);
      if (game) {
        this.games.set(game.id, game);
        await this.saveLibrary();
      }
      return game;
    }

    if (!system.extensions.includes(ext)) return null;

    const gameId = await this.generateGameId(romPath);
    const game: Game = {
      id: gameId,
      title: this.cleanGameTitle(path.basename(romPath, ext)),
      system: system.name,
      systemId: system.id,
      romPath: romPath,
    };

    this.games.set(gameId, game);
    await this.saveLibrary();
    return game;
  }

  public async removeGame(gameId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (game?.romPath.startsWith(this.romsCacheDir)) {
      try {
        await fs.unlink(game.romPath);
        libraryLog.info(`Deleted cached ROM: ${game.romPath}`);
      } catch (error) {
        libraryLog.warn(`Failed to delete cached ROM ${game.romPath}:`, error);
      }
    }
    this.games.delete(gameId);
    await this.saveLibrary();
  }

  public async updateGame(gameId: string, updates: Partial<Game>): Promise<void> {
    const game = this.games.get(gameId);
    if (game) {
      Object.assign(game, updates);
      await this.saveLibrary();
    }
  }

  public getConfig(): LibraryConfig {
    return this.config;
  }

  public async setRomsBasePath(basePath: string): Promise<void> {
    this.config.romsBasePath = basePath;
    await this.saveConfig();
  }

  /** Returns the union of all ROM extensions across non-arcade systems. */
  private getNonArcadeExtensions(): string[] {
    return this.config.systems
      .filter(s => s.id !== 'arcade')
      .flatMap(s => s.extensions);
  }

  /** Returns the first matching system for a given ROM extension. */
  private findSystemForExtension(ext: string, systemId?: string): GameSystem | undefined {
    const systems = systemId
      ? this.config.systems.filter(s => s.id === systemId)
      : this.config.systems;
    return systems.find(s => s.extensions.includes(ext));
  }

  private async ensureRomsCacheDir(): Promise<string> {
    await fs.mkdir(this.romsCacheDir, { recursive: true });
    return this.romsCacheDir;
  }

  /**
   * Extracts a ROM from a zip archive and returns a Game object.
   * Returns null if no matching ROM is found inside the zip.
   */
  private async handleZipFile(zipPath: string, systemId?: string): Promise<Game | null> {
    const nativeExtensions = systemId
      ? (this.config.systems.find(s => s.id === systemId)?.extensions ?? [])
      : this.getNonArcadeExtensions();

    const match = await findRomInZip(zipPath, nativeExtensions);
    if (!match) {
      libraryLog.debug(`No matching ROM found in zip: ${zipPath}`);
      return null;
    }

    const system = this.findSystemForExtension(match.extension, systemId);
    if (!system) return null;

    // Check if already imported from this zip
    const existingGame = Array.from(this.games.values()).find(
      g => g.sourceArchivePath === zipPath,
    );
    if (existingGame) {
      try {
        await fs.access(existingGame.romPath);
        return null; // Already in library with valid cache
      } catch {
        // Cache file missing, re-extract below
      }
    }

    const cacheDir = await this.ensureRomsCacheDir();
    const romBasename = path.basename(match.entryName);
    const extractedPath = await extractFileFromZip(zipPath, match.entryName, cacheDir);

    const gameId = await this.generateGameId(extractedPath);

    // Rename with hash prefix to avoid collisions between different zips
    const hashPrefix = gameId.substring(0, 8);
    const finalFilename = `${hashPrefix}_${romBasename}`;
    const finalPath = path.join(cacheDir, finalFilename);

    if (extractedPath !== finalPath) {
      try {
        await fs.access(finalPath);
        // Already exists from a previous scan, remove the fresh extraction
        await fs.unlink(extractedPath);
      } catch {
        await fs.rename(extractedPath, finalPath);
      }
    }

    // Skip if this exact ROM content is already in the library
    if (this.games.has(gameId)) return null;

    const romExt = path.extname(romBasename).toLowerCase();
    const title = this.cleanGameTitle(path.basename(romBasename, romExt));

    return {
      id: gameId,
      title,
      system: system.name,
      systemId: system.id,
      romPath: finalPath,
      sourceArchivePath: zipPath,
    };
  }

  private async generateGameId(romPath: string): Promise<string> {
    try {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(romPath);
      for await (const chunk of stream) {
        hash.update(chunk);
      }
      return hash.digest('hex');
    } catch (error) {
      // Fall back to path-based hash if file can't be read (e.g. permissions, missing)
      libraryLog.warn(`Could not hash file content for ${romPath}, falling back to path hash:`, error);
      return crypto.createHash('sha256').update(romPath).digest('hex');
    }
  }

  private cleanGameTitle(filename: string): string {
    // Remove common ROM naming conventions
    return filename
      .replace(/\([^)]*\)/g, '') // Remove content in parentheses
      .replace(/\[[^\]]*\]/g, '') // Remove content in brackets
      .replace(/\{[^}]*\}/g, '') // Remove content in braces
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .trim();
  }
}