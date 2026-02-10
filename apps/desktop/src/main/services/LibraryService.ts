import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { app } from 'electron';
import { Game, GameSystem, LibraryConfig, DEFAULT_SYSTEMS } from '../../types/library';
import crypto from 'crypto';
import { libraryLog } from '../logger';

export class LibraryService {
  private config: LibraryConfig;
  private games: Map<string, Game> = new Map();
  private configPath: string;
  private libraryPath: string;

  constructor() {
    const userData = app.getPath('userData');
    this.configPath = path.join(userData, 'library-config.json');
    this.libraryPath = path.join(userData, 'library.json');
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
    // Also remove all games from this system
    for (const [id, game] of this.games.entries()) {
      if (game.systemId === systemId) {
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
          
          // Find matching system by extension
          const systems = systemId 
            ? this.config.systems.filter(s => s.id === systemId)
            : this.config.systems;
          
          for (const system of systems) {
            if (system.extensions.includes(ext)) {
              const gameId = await this.generateGameId(fullPath);
              const game: Game = {
                id: gameId,
                title: this.cleanGameTitle(path.basename(entry.name, ext)),
                system: system.name,
                systemId: system.id,
                romPath: fullPath,
              };
              
              foundGames.push(game);
              this.games.set(gameId, game);
              break;
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