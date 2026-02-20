import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { Game, GameSystem, LibraryConfig, DEFAULT_SYSTEMS } from '../../types/library';
import crypto from 'crypto';
import zlib from 'zlib';
import { libraryLog } from '../logger';
import { findRomInZip, extractFileFromZip } from '../utils/zipExtraction';

export interface RomHashes {
  crc32: string;
  sha1: string;
  md5: string;
}

/** Progress event emitted for each game discovered during a scan. */
export interface ScanProgressEvent {
  /** The game that was just discovered or re-verified. */
  game: Game;
  /** Whether this game is newly added (true) or already existed in the library (false). */
  isNew: boolean;
  /** Number of files processed so far. */
  processed: number;
  /** Total number of ROM files found (known once directory walk completes). */
  total: number;
  /** Number of files skipped via mtime cache (no re-hash needed). */
  skipped: number;
}

/** Candidate ROM file discovered during the directory walk phase. */
interface RomCandidate {
  fullPath: string;
  /** File modification time in ms since epoch. */
  mtimeMs: number;
  /** File extension (lowercase, with leading dot). */
  ext: string;
  /** Resolved system for this file, or undefined if needs zip inspection. */
  system?: GameSystem;
  /** System ID filter passed into the scan (propagated for context). */
  systemIdFilter?: string;
  /** Whether this file is a zip that needs extraction (non-arcade). */
  isZip: boolean;
  /** True if a game with this romPath already exists in the library. */
  isKnown: boolean;
  /** If known, the existing game's stored mtime. */
  existingMtime?: number;
}

/** Number of ROM files to hash concurrently. */
const HASH_CONCURRENCY = 4;

export class LibraryService extends EventEmitter {
  private config: LibraryConfig;
  private games: Map<string, Game> = new Map();
  /** Reverse index: romPath → gameId for O(1) lookups during scan. */
  private romPathIndex: Map<string, string> = new Map();
  /** Reverse index: sourceArchivePath → gameId for O(1) zip dedup lookups. */
  private archivePathIndex: Map<string, string> = new Map();
  private configPath: string;
  private libraryPath: string;
  private romsCacheDir: string;

  constructor() {
    super();
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
      // Parse permissively — old library.json may have partial/missing romHashes
      const games: Game[] = JSON.parse(data);
      this.games = new Map(games.map(game => [game.id, game]));
      this.rebuildRomPathIndex();
      await this.migrateGameIds();
      await this.backfillRomHashes();
    } catch (error) {
      // No library file yet
      this.games = new Map();
    }
  }

  /** Rebuild reverse indexes from the current games map. */
  private rebuildRomPathIndex(): void {
    this.romPathIndex.clear();
    this.archivePathIndex.clear();
    for (const [id, game] of this.games.entries()) {
      this.romPathIndex.set(game.romPath, id);
      if (game.sourceArchivePath) {
        this.archivePathIndex.set(game.sourceArchivePath, id);
      }
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
      try {
        const { gameId, hashes } = await this.computeRomHashes(game.romPath);
        if (gameId !== oldId) {
          this.games.delete(oldId);
          game.id = gameId;
          game.romHashes = hashes;
          this.games.set(gameId, game);
          migrated = true;
        }
      } catch (error) {
        libraryLog.warn(`Cannot read ROM for migration: ${game.romPath}, removing game:`, error);
        this.games.delete(oldId);
        migrated = true;
      }
    }

    if (migrated) {
      this.rebuildRomPathIndex();
      await this.saveLibrary();
    }
  }

  /**
   * Fills in missing romHashes for games loaded from an older library.json.
   * Games whose ROM files are unreadable are removed from the library.
   */
  private async backfillRomHashes(): Promise<void> {
    let changed = false;
    const toRemove: string[] = [];

    for (const [id, game] of this.games.entries()) {
      const hashes = game.romHashes;
      if (hashes?.crc32 && hashes?.sha1 && hashes?.md5) continue;

      try {
        const { hashes: computed } = await this.computeRomHashes(game.romPath);
        game.romHashes = computed;
        changed = true;
      } catch (error) {
        libraryLog.warn(`Cannot read ROM for "${game.title}" at ${game.romPath}, removing from library:`, error);
        toRemove.push(id);
        changed = true;
      }
    }

    for (const id of toRemove) {
      this.games.delete(id);
    }

    if (changed) {
      this.rebuildRomPathIndex();
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
    this.rebuildRomPathIndex();
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

  // ---------------------------------------------------------------------------
  // Optimized scan pipeline
  // ---------------------------------------------------------------------------

  /**
   * Recursively walk a directory tree and collect all candidate ROM files.
   * This is a fast I/O-only pass — no hashing happens here.
   */
  private async collectCandidates(
    directoryPath: string,
    systemId: string | undefined,
    candidates: RomCandidate[],
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      libraryLog.error(`Error reading directory ${directoryPath}:`, error);
      return;
    }

    // Stat all files in parallel for mtime
    const fileEntries: Array<{ entry: import('fs').Dirent; fullPath: string }> = [];
    const dirEntries: Array<{ entry: import('fs').Dirent; fullPath: string; resolvedSystemId: string | undefined }> = [];

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory() && this.config.scanRecursive) {
        let resolvedSystemId = systemId;
        if (!systemId) {
          const matchingSystem = this.config.systems.find(
            s => s.shortName.toLowerCase() === entry.name.toLowerCase() ||
                 s.name.toLowerCase() === entry.name.toLowerCase() ||
                 s.id === entry.name.toLowerCase()
          );
          if (matchingSystem) {
            resolvedSystemId = matchingSystem.id;
          }
        }
        dirEntries.push({ entry, fullPath, resolvedSystemId });
      } else if (entry.isFile()) {
        fileEntries.push({ entry, fullPath });
      }
    }

    // Stat all files in parallel to get mtimes
    const statResults = await Promise.all(
      fileEntries.map(async ({ entry, fullPath }) => {
        try {
          const stat = await fs.stat(fullPath);
          return { entry, fullPath, mtimeMs: stat.mtimeMs };
        } catch {
          return null; // Skip unreadable files
        }
      }),
    );

    for (const result of statResults) {
      if (!result) continue;
      const { entry, fullPath, mtimeMs } = result;
      const ext = path.extname(entry.name).toLowerCase();

      if (ext === '.zip' && systemId !== 'arcade') {
        // Non-arcade zip — needs extraction
        const existingGameId = this.findGameByArchivePath(fullPath);
        const existingGame = existingGameId ? this.games.get(existingGameId) : undefined;

        candidates.push({
          fullPath,
          mtimeMs,
          ext,
          systemIdFilter: systemId,
          isZip: true,
          isKnown: !!existingGame,
          existingMtime: existingGame?.romMtime,
        });
      } else {
        // Regular ROM file — match extension
        const systems = systemId
          ? this.config.systems.filter(s => s.id === systemId)
          : this.config.systems;

        const matchedSystem = systems.find(s => s.extensions.includes(ext));
        if (matchedSystem) {
          const existingGameId = this.romPathIndex.get(fullPath);
          const existingGame = existingGameId ? this.games.get(existingGameId) : undefined;

          candidates.push({
            fullPath,
            mtimeMs,
            ext,
            system: matchedSystem,
            systemIdFilter: systemId,
            isZip: false,
            isKnown: !!existingGame,
            existingMtime: existingGame?.romMtime,
          });
        }
      }
    }

    // Recurse into subdirectories
    for (const { fullPath, resolvedSystemId } of dirEntries) {
      await this.collectCandidates(fullPath, resolvedSystemId, candidates);
    }
  }

  /** Find a game by its sourceArchivePath (for zip dedup). O(1) via index. */
  private findGameByArchivePath(archivePath: string): string | undefined {
    return this.archivePathIndex.get(archivePath);
  }

  /**
   * Process a single ROM candidate: hash, merge, and register the game.
   * Returns the Game and whether it was newly added.
   */
  private async processCandidate(
    candidate: RomCandidate,
  ): Promise<{ game: Game; isNew: boolean } | null> {
    if (candidate.isZip) {
      return this.processZipCandidate(candidate);
    }
    return this.processRomCandidate(candidate);
  }

  /** Process a regular (non-zip) ROM file candidate. */
  private async processRomCandidate(
    candidate: RomCandidate,
  ): Promise<{ game: Game; isNew: boolean } | null> {
    const { fullPath, mtimeMs, ext, system } = candidate;
    if (!system) return null;

    // Check mtime cache: if path+mtime match an existing game, skip hashing
    const existingGameId = this.romPathIndex.get(fullPath);
    if (existingGameId) {
      const existingGame = this.games.get(existingGameId);
      if (existingGame && existingGame.romMtime === mtimeMs) {
        // File unchanged — update title/system in case config changed, but skip hash
        const title = this.cleanGameTitle(path.basename(path.basename(fullPath), ext));
        existingGame.title = title;
        existingGame.system = system.name;
        existingGame.systemId = system.id;
        return { game: existingGame, isNew: false };
      }
    }

    // File is new or modified — compute hashes
    try {
      const { gameId, hashes } = await this.computeRomHashes(fullPath);
      const existing = this.games.get(gameId);
      const title = this.cleanGameTitle(path.basename(path.basename(fullPath), ext));
      const isNew = !existing;
      const game: Game = existing
        ? { ...existing, title, system: system.name, systemId: system.id, romPath: fullPath, romMtime: mtimeMs, romHashes: existing.romHashes ?? hashes }
        : { id: gameId, title, system: system.name, systemId: system.id, romPath: fullPath, romMtime: mtimeMs, romHashes: hashes };

      this.games.set(gameId, game);
      this.romPathIndex.set(fullPath, gameId);
      return { game, isNew };
    } catch (error) {
      libraryLog.warn(`Skipping unreadable ROM ${fullPath}:`, error);
      return null;
    }
  }

  /** Process a zip file candidate. */
  private async processZipCandidate(
    candidate: RomCandidate,
  ): Promise<{ game: Game; isNew: boolean } | null> {
    const { fullPath, mtimeMs, systemIdFilter } = candidate;

    // Check mtime cache: if this zip is already imported and unchanged, skip entirely
    const existingGameId = this.findGameByArchivePath(fullPath);
    if (existingGameId) {
      const existingGame = this.games.get(existingGameId);
      if (existingGame && existingGame.romMtime === mtimeMs) {
        return { game: existingGame, isNew: false };
      }
    }

    try {
      const game = await this.handleZipFile(fullPath, systemIdFilter);
      if (game) {
        game.romMtime = mtimeMs;
        this.games.set(game.id, game);
        this.romPathIndex.set(game.romPath, game.id);
        if (game.sourceArchivePath) {
          this.archivePathIndex.set(game.sourceArchivePath, game.id);
        }
        return { game, isNew: true };
      }
      return null;
    } catch (error) {
      libraryLog.warn(`Skipping zip file ${fullPath}:`, error);
      return null;
    }
  }

  /**
   * Process an array of candidates with bounded concurrency.
   * Emits 'scanProgress' for each game discovered.
   */
  private async processCandidatesBatch(
    candidates: RomCandidate[],
    progressState: { processed: number; skipped: number; total: number },
  ): Promise<Game[]> {
    const foundGames: Game[] = [];

    // Process with bounded concurrency
    let i = 0;
    while (i < candidates.length) {
      const batch = candidates.slice(i, i + HASH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(candidate => this.processCandidate(candidate)),
      );

      for (const result of results) {
        progressState.processed++;
        if (result) {
          foundGames.push(result.game);
          if (!result.isNew) {
            progressState.skipped++;
          }
          const progressEvent: ScanProgressEvent = {
            game: result.game,
            isNew: result.isNew,
            processed: progressState.processed,
            total: progressState.total,
            skipped: progressState.skipped,
          };
          this.emit('scanProgress', progressEvent);
        }
      }

      i += HASH_CONCURRENCY;
    }

    return foundGames;
  }

  public async scanDirectory(directoryPath: string, systemId?: string): Promise<Game[]> {
    // Phase 1: Fast directory walk — collect all candidate files with stat info
    const candidates: RomCandidate[] = [];
    await this.collectCandidates(directoryPath, systemId, candidates);

    if (candidates.length === 0) return [];

    // Phase 2: Partition into new (unknown) and known files.
    // Process new files first so they appear in the UI immediately.
    const newCandidates = candidates.filter(c => !c.isKnown);
    const knownCandidates = candidates.filter(c => c.isKnown);
    const ordered = [...newCandidates, ...knownCandidates];

    libraryLog.info(
      `Scan: ${candidates.length} ROM files found (${newCandidates.length} new, ${knownCandidates.length} known)`,
    );

    // Phase 3: Process candidates — new files first, with parallel hashing
    const progressState = { processed: 0, skipped: 0, total: ordered.length };
    const foundGames = await this.processCandidatesBatch(ordered, progressState);

    libraryLog.info(
      `Scan complete: ${foundGames.length} games (${progressState.skipped} skipped via cache)`,
    );

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
        this.romPathIndex.set(game.romPath, game.id);
        if (game.sourceArchivePath) {
          this.archivePathIndex.set(game.sourceArchivePath, game.id);
        }
        await this.saveLibrary();
      }
      return game;
    }

    if (!system.extensions.includes(ext)) return null;

    // Get mtime for cache tracking
    let mtimeMs: number | undefined;
    try {
      const stat = await fs.stat(romPath);
      mtimeMs = stat.mtimeMs;
    } catch {
      // Proceed without mtime
    }

    const { gameId, hashes } = await this.computeRomHashes(romPath);
    const game: Game = {
      id: gameId,
      title: this.cleanGameTitle(path.basename(romPath, ext)),
      system: system.name,
      systemId: system.id,
      romPath: romPath,
      romMtime: mtimeMs,
      romHashes: hashes,
    };

    this.games.set(gameId, game);
    this.romPathIndex.set(romPath, gameId);
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
    if (game) {
      this.romPathIndex.delete(game.romPath);
      if (game.sourceArchivePath) {
        this.archivePathIndex.delete(game.sourceArchivePath);
      }
    }
    this.games.delete(gameId);
    await this.saveLibrary();
  }

  public async updateGame(gameId: string, updates: Partial<Game>): Promise<void> {
    const game = this.games.get(gameId);
    if (game) {
      const oldRomPath = game.romPath;
      Object.assign(game, updates);
      // Update romPath index if romPath changed
      if (updates.romPath && updates.romPath !== oldRomPath) {
        this.romPathIndex.delete(oldRomPath);
        this.romPathIndex.set(updates.romPath, gameId);
      }
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

    // Check if already imported from this zip (O(1) via index)
    const existingGameId = this.findGameByArchivePath(zipPath);
    const existingGame = existingGameId ? this.games.get(existingGameId) : undefined;
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

    const { gameId, hashes } = await this.computeRomHashes(extractedPath);

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
      romHashes: hashes,
    };
  }

  /**
   * Computes CRC32, SHA-1, and MD5 hashes for a ROM file in a single pass.
   * Also returns the SHA-256 game ID. Throws if the file is unreadable.
   */
  async computeRomHashes(romPath: string): Promise<{ gameId: string; hashes: RomHashes }> {
    const sha256 = crypto.createHash('sha256');
    const sha1 = crypto.createHash('sha1');
    const md5 = crypto.createHash('md5');
    let crc = 0;

    const stream = createReadStream(romPath);
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sha256.update(buffer);
      sha1.update(buffer);
      md5.update(buffer);
      crc = zlib.crc32(buffer, crc);
    }

    return {
      gameId: sha256.digest('hex'),
      hashes: {
        crc32: crc.toString(16).padStart(8, '0'),
        sha1: sha1.digest('hex'),
        md5: md5.digest('hex'),
      },
    };
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
