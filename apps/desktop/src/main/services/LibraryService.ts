import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { EventEmitter } from "node:events";
import { Game, GameSystem, LibraryConfig, DEFAULT_SYSTEMS } from "../../types/library";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { libraryLog } from "../logger";
import { findRomInZip, extractFileFromZip } from "../utils/zipExtraction";

export interface RomHashes {
  crc32: string;
  md5: string;
  sha1: string;
}

/** Progress event emitted for each game discovered during a scan. */
export interface ScanProgressEvent {
  /** The game that was just discovered or re-verified. */
  game: Game;
  /** Whether this game is newly added (true) or already existed in the library (false). */
  isNew: boolean;
  /** Number of files processed so far. */
  processed: number;
  /** Number of files skipped via mtime cache (no re-hash needed). */
  skipped: number;
  /** Total number of ROM files found (known once directory walk completes). */
  total: number;
}

/** Candidate ROM file discovered during the directory walk phase. */
interface RomCandidate {
  /** If known, the existing game's stored mtime. */
  existingMtime?: number;
  /** File extension (lowercase, with leading dot). */
  ext: string;
  fullPath: string;
  /** True if a game with this romPath already exists in the library. */
  isKnown: boolean;
  /** Whether this file is a zip that needs extraction (non-arcade). */
  isZip: boolean;
  /** File modification time in ms since epoch. */
  mtimeMs: number;
  /** Resolved system for this file, or undefined if needs zip inspection. */
  system?: GameSystem;
  /** System ID filter passed into the scan (propagated for context). */
  systemIdFilter?: string;
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
    const userData = app.getPath("userData");
    this.configPath = path.join(userData, "library-config.json");
    this.libraryPath = path.join(userData, "library.json");
    this.romsCacheDir = path.join(userData, "roms-cache");
    this.config = {
      autoScan: false,
      scanRecursive: true,
      systems: [],
    };
    this.loadConfig();
    this.loadLibrary();
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, "utf8");
      this.config = JSON.parse(data);
      await this.backfillNewSystems();
      await this.repairMissingRomsPaths();
    } catch {
      // If no config exists, create default
      this.config = {
        autoScan: false,
        romsBasePath: path.join(app.getPath("home"), "ROMs"),
        scanRecursive: true,
        systems: DEFAULT_SYSTEMS,
      };
      await this.saveConfig();
      await this.scaffoldSystemFolders();
    }
  }

  /**
   * Append any systems from DEFAULT_SYSTEMS that are missing from the
   * saved config. This covers the case where a new system (e.g. Saturn)
   * is added to the codebase but the user already has a persisted config
   * from a previous version.
   */
  private async backfillNewSystems(): Promise<void> {
    const existingIds = new Set(this.config.systems.map((s) => s.id));
    const newSystems = DEFAULT_SYSTEMS.filter((s) => !existingIds.has(s.id));
    if (newSystems.length === 0) {
      return;
    }

    this.config.systems.push(...newSystems);

    // Scaffold folders and set romsPath for the newly added systems
    const basePath = this.config.romsBasePath;
    if (basePath) {
      for (const system of newSystems) {
        const systemDir = path.join(basePath, system.shortName);
        try {
          await fs.mkdir(systemDir, { recursive: true });
        } catch (error) {
          libraryLog.warn(`Failed to create system folder ${systemDir}:`, error);
        }
        // Point the system at its folder so scanSystemFolders picks it up
        const added = this.config.systems.find((s) => s.id === system.id);
        if (added) {
          added.romsPath = systemDir;
        }
      }
    }

    await this.saveConfig();

    const names = newSystems.map((s) => s.shortName).join(", ");
    libraryLog.info(`Backfilled ${newSystems.length} new system(s): ${names}`);
  }

  /**
   * Set romsPath for any system that has a matching subfolder under
   * romsBasePath but no romsPath configured. Fixes systems that were
   * backfilled before we started auto-setting romsPath.
   */
  private async repairMissingRomsPaths(): Promise<void> {
    const basePath = this.config.romsBasePath;
    if (!basePath) {
      return;
    }

    let repaired = 0;
    for (const system of this.config.systems) {
      if (system.romsPath) {
        continue;
      }
      const candidate = path.join(basePath, system.shortName);
      try {
        await fs.access(candidate);
        system.romsPath = candidate;
        repaired++;
      } catch {
        // Folder doesn't exist — leave romsPath unset
      }
    }

    if (repaired > 0) {
      await this.saveConfig();
      libraryLog.info(`Repaired romsPath for ${repaired} system(s)`);
    }
  }

  /**
   * Create the romsBasePath and a subfolder for each configured system
   * so users have a ready-made directory structure on first launch.
   */
  private async scaffoldSystemFolders(): Promise<void> {
    const basePath = this.config.romsBasePath;
    if (!basePath) {
      return;
    }

    for (const system of this.config.systems) {
      const systemDir = path.join(basePath, system.shortName);
      try {
        await fs.mkdir(systemDir, { recursive: true });
      } catch (error) {
        libraryLog.warn(`Failed to create system folder ${systemDir}:`, error);
      }
      system.romsPath = systemDir;
    }
    await this.saveConfig();
    libraryLog.info(`Scaffolded ROM folders in ${basePath}`);
  }

  /**
   * Atomically write JSON data to a file with a `.bak` backup.
   * Writes to a `.tmp` file first, renames the existing file to `.bak`,
   * then renames `.tmp` to the final path. This ensures the file is
   * never in a partially-written state.
   */
  private async atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp`;
    const bakPath = `${filePath}.bak`;
    const content = JSON.stringify(data, null, 2);

    await fs.writeFile(tmpPath, content, "utf8");

    try {
      await fs.rename(filePath, bakPath);
    } catch {
      // First write ever — no existing file to back up
    }

    await fs.rename(tmpPath, filePath);
  }

  private async saveConfig(): Promise<void> {
    await this.atomicWriteJSON(this.configPath, this.config);
  }

  private async loadLibrary(): Promise<void> {
    let data: string | undefined;

    try {
      data = await fs.readFile(this.libraryPath, "utf8");
      JSON.parse(data); // Validate JSON before using
    } catch {
      // Primary file missing or corrupt — try backup
      try {
        data = await fs.readFile(`${this.libraryPath}.bak`, "utf8");
        JSON.parse(data);
        libraryLog.warn("Primary library.json was corrupt/missing; loaded from backup");
      } catch {
        // No backup either — start fresh
        this.games = new Map();
        return;
      }
    }

    const games: Array<Game> = JSON.parse(data);
    this.games = new Map(games.map((game) => [game.id, game]));
    this.rebuildRomPathIndex();
    await this.migrateGameIds();
    await this.backfillRomHashes();
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
    const entriesToMigrate: Array<{ game: Game; oldId: string }> = [];

    for (const [id, game] of this.games.entries()) {
      // Old MD5 hashes are 32 hex chars; new SHA-256 hashes are 64
      if (id.length === 32 && /^[0-9a-f]+$/.test(id)) {
        entriesToMigrate.push({ game, oldId: id });
      }
    }

    for (const { game, oldId } of entriesToMigrate) {
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
        libraryLog.warn(
          `Cannot read ROM for migration: ${game.romPath} — skipping (drive may be unmounted)`,
          error,
        );
        // Do NOT delete — the ROM may be temporarily inaccessible.
        // The game keeps its old ID until the ROM is readable again.
      }
    }

    if (migrated) {
      this.rebuildRomPathIndex();
      await this.saveLibrary();
    }
  }

  /**
   * Fills in missing romHashes for games loaded from an older library.json.
   * Games whose ROM files are temporarily unreadable are skipped rather than
   * removed — the drive may be unmounted or the file temporarily locked.
   */
  private async backfillRomHashes(): Promise<void> {
    let changed = false;

    for (const [, game] of this.games.entries()) {
      const hashes = game.romHashes;
      if (hashes?.crc32 && hashes?.sha1 && hashes?.md5) {
        continue;
      }

      try {
        const { hashes: computed } = await this.computeRomHashes(game.romPath);
        game.romHashes = computed;
        changed = true;
      } catch (error) {
        libraryLog.warn(
          `Cannot read ROM for "${game.title}" at ${game.romPath} — skipping hash backfill (drive may be unmounted)`,
          error,
        );
        // Do NOT delete — the ROM may be temporarily inaccessible.
        // The game keeps its incomplete hashes until the ROM is readable again.
      }
    }

    if (changed) {
      this.rebuildRomPathIndex();
      await this.saveLibrary();
    }
  }

  private async saveLibrary(): Promise<void> {
    const games = Array.from(this.games.values());
    await this.atomicWriteJSON(this.libraryPath, games);
  }

  /**
   * Check if an artwork file already exists on disk for a game ID.
   * Returns the `artwork://` URL if found, undefined otherwise.
   * This handles re-association when a game was previously removed
   * and later re-scanned — the artwork file survives on disk even
   * though the game entry was deleted.
   */
  private async findExistingArtwork(gameId: string): Promise<string | undefined> {
    const artworkDir = path.join(app.getPath("userData"), "artwork");
    const extensions = [".png", ".jpg", ".jpeg", ".webp"];

    for (const ext of extensions) {
      const filePath = path.join(artworkDir, `${gameId}${ext}`);
      try {
        await fs.access(filePath);
        return `artwork://${gameId}${ext}`;
      } catch {
        // File doesn't exist with this extension
      }
    }
    return undefined;
  }

  public async addSystem(system: GameSystem): Promise<void> {
    const existing = this.config.systems.find((s) => s.id === system.id);
    if (!existing) {
      this.config.systems.push(system);
      await this.saveConfig();
    }
  }

  public async removeSystem(systemId: string): Promise<void> {
    this.config.systems = this.config.systems.filter((s) => s.id !== systemId);
    await this.saveConfig();
    // Games for this system are intentionally kept in the library.
    // Their coverArt, metadata, favorites, playTime, and save states
    // are preserved. If the user re-adds the system or rescans, the
    // games reappear with all enriched data intact. Games can still
    // be removed individually via removeGame().
  }

  public async updateSystemPath(systemId: string, romsPath: string): Promise<void> {
    const system = this.config.systems.find((s) => s.id === systemId);
    if (system) {
      system.romsPath = romsPath;
      await this.saveConfig();
    }
  }

  public getSystems(): Array<GameSystem> {
    return this.config.systems;
  }

  public getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  public getGames(systemId?: string): Array<Game> {
    const games = Array.from(this.games.values());
    if (systemId) {
      return games.filter((game) => game.systemId === systemId);
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
    candidates: Array<RomCandidate>,
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      libraryLog.error(`Error reading directory ${directoryPath}:`, error);
      return;
    }

    // Stat all files in parallel for mtime
    const fileEntries: Array<{ entry: import("fs").Dirent; fullPath: string }> = [];
    const dirEntries: Array<{
      entry: import("fs").Dirent;
      fullPath: string;
      resolvedSystemId: string | undefined;
    }> = [];

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory() && this.config.scanRecursive) {
        let resolvedSystemId = systemId;
        if (!systemId) {
          const matchingSystem = this.config.systems.find(
            (s) =>
              s.shortName.toLowerCase() === entry.name.toLowerCase() ||
              s.name.toLowerCase() === entry.name.toLowerCase() ||
              s.id === entry.name.toLowerCase(),
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
      if (!result) {
        continue;
      }
      const { entry, fullPath, mtimeMs } = result;
      const ext = path.extname(entry.name).toLowerCase();

      if (ext === ".zip" && systemId !== "arcade") {
        // Non-arcade zip — needs extraction
        const existingGameId = this.findGameByArchivePath(fullPath);
        const existingGame = existingGameId ? this.games.get(existingGameId) : undefined;

        candidates.push({
          existingMtime: existingGame?.romMtime,
          ext,
          fullPath,
          isKnown: !!existingGame,
          isZip: true,
          mtimeMs,
          systemIdFilter: systemId,
        });
      } else {
        // Regular ROM file — match extension
        const systems = systemId
          ? this.config.systems.filter((s) => s.id === systemId)
          : this.config.systems;

        const matchedSystem = systems.find((s) => s.extensions.includes(ext));
        if (!matchedSystem) {
          if (systemId) {
            libraryLog.debug(`Skipped ${entry.name}: ext=${ext} not in ${systemId} extensions`);
          }
        } else {
          const existingGameId = this.romPathIndex.get(fullPath);
          const existingGame = existingGameId ? this.games.get(existingGameId) : undefined;

          candidates.push({
            existingMtime: existingGame?.romMtime,
            ext,
            fullPath,
            isKnown: !!existingGame,
            isZip: false,
            mtimeMs,
            system: matchedSystem,
            systemIdFilter: systemId,
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
    const { ext, fullPath, mtimeMs, system } = candidate;
    if (!system) {
      return null;
    }

    // Check mtime cache: if path+mtime match an existing game, skip hashing
    const existingGameId = this.romPathIndex.get(fullPath);
    if (existingGameId) {
      const existingGame = this.games.get(existingGameId);
      if (existingGame && existingGame.romMtime === mtimeMs) {
        // File unchanged — update title/system in case config changed, but skip hash.
        // Preserve regional system name if ScreenScraper metadata has already been applied.
        const title = this.cleanGameTitle(path.basename(path.basename(fullPath), ext));
        existingGame.title = title;
        if (!existingGame.metadata) {
          existingGame.system = system.name;
        }
        existingGame.systemId = system.id;
        return { game: existingGame, isNew: false };
      }
    }

    // File is new or modified — compute hashes
    try {
      libraryLog.debug(`Hashing ${path.basename(fullPath)} (${system.id})...`);
      const { gameId, hashes } = await this.computeRomHashes(fullPath);
      const existing = this.games.get(gameId);
      const title = this.cleanGameTitle(path.basename(path.basename(fullPath), ext));
      const isNew = !existing;
      // Preserve regional system name if ScreenScraper metadata has already been applied
      const game: Game = existing
        ? {
            ...existing,
            romHashes: existing.romHashes ?? hashes,
            romMtime: mtimeMs,
            romPath: fullPath,
            system: existing.metadata ? existing.system : system.name,
            systemId: system.id,
            title,
          }
        : {
            id: gameId,
            romHashes: hashes,
            romMtime: mtimeMs,
            romPath: fullPath,
            system: system.name,
            systemId: system.id,
            title,
          };

      // Re-associate orphaned artwork from a previous library entry
      if (isNew && !game.coverArt) {
        const existingArtwork = await this.findExistingArtwork(gameId);
        if (existingArtwork) {
          game.coverArt = existingArtwork;
          libraryLog.info(`Re-associated existing artwork for ${title}`);
        }
      }

      this.games.set(gameId, game);
      this.romPathIndex.set(fullPath, gameId);
      libraryLog.debug(`${isNew ? "Added" : "Updated"} ${title} (${system.id})`);
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

        // Re-associate orphaned artwork from a previous library entry
        if (!game.coverArt) {
          const existingArtwork = await this.findExistingArtwork(game.id);
          if (existingArtwork) {
            game.coverArt = existingArtwork;
            libraryLog.info(`Re-associated existing artwork for ${game.title}`);
          }
        }

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
    candidates: Array<RomCandidate>,
    progressState: { processed: number; skipped: number; total: number },
  ): Promise<Array<Game>> {
    const foundGames: Array<Game> = [];

    // Process with bounded concurrency
    let i = 0;
    while (i < candidates.length) {
      const batch = candidates.slice(i, i + HASH_CONCURRENCY);
      const results = await Promise.all(batch.map((candidate) => this.processCandidate(candidate)));

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
            skipped: progressState.skipped,
            total: progressState.total,
          };
          this.emit("scanProgress", progressEvent);
        }
      }

      i += HASH_CONCURRENCY;
    }

    return foundGames;
  }

  public async scanDirectory(directoryPath: string, systemId?: string): Promise<Array<Game>> {
    // Phase 1: Fast directory walk — collect all candidate files with stat info
    const candidates: Array<RomCandidate> = [];
    await this.collectCandidates(directoryPath, systemId, candidates);

    if (candidates.length === 0) {
      return [];
    }

    // Phase 2: Partition into new (unknown) and known files.
    // Process new files first so they appear in the UI immediately.
    const newCandidates = candidates.filter((c) => !c.isKnown);
    const knownCandidates = candidates.filter((c) => c.isKnown);
    const ordered = [...newCandidates, ...knownCandidates];

    // Log per-system breakdown for diagnostics
    const systemCounts = new Map<string, number>();
    for (const c of candidates) {
      const sid = c.system?.id ?? c.systemIdFilter ?? "unknown";
      systemCounts.set(sid, (systemCounts.get(sid) ?? 0) + 1);
    }
    const breakdown = Array.from(systemCounts.entries())
      .map(([id, count]) => `${id}:${count}`)
      .join(", ");

    libraryLog.info(
      `Scan: ${candidates.length} ROM files found (${newCandidates.length} new, ${knownCandidates.length} known) [${breakdown}]`,
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

  public async scanSystemFolders(): Promise<Array<Game>> {
    const allGames: Array<Game> = [];

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
    const system = this.config.systems.find((s) => s.id === systemId);
    if (!system) {
      return null;
    }

    const ext = path.extname(romPath).toLowerCase();

    // Handle zip files for non-arcade systems
    if (ext === ".zip" && systemId !== "arcade") {
      const game = await this.handleZipFile(romPath, systemId);
      if (game) {
        // Re-associate orphaned artwork from a previous library entry
        if (!game.coverArt) {
          const existingArtwork = await this.findExistingArtwork(game.id);
          if (existingArtwork) {
            game.coverArt = existingArtwork;
            libraryLog.info(`Re-associated existing artwork for ${game.title}`);
          }
        }

        this.games.set(game.id, game);
        this.romPathIndex.set(game.romPath, game.id);
        if (game.sourceArchivePath) {
          this.archivePathIndex.set(game.sourceArchivePath, game.id);
        }
        await this.saveLibrary();
      }
      return game;
    }

    if (!system.extensions.includes(ext)) {
      return null;
    }

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
      romHashes: hashes,
      romMtime: mtimeMs,
      romPath: romPath,
      system: system.name,
      systemId: system.id,
      title: this.cleanGameTitle(path.basename(romPath, ext)),
    };

    // Re-associate orphaned artwork from a previous library entry
    const existingArtwork = await this.findExistingArtwork(gameId);
    if (existingArtwork) {
      game.coverArt = existingArtwork;
      libraryLog.info(`Re-associated existing artwork for ${game.title}`);
    }

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
  private getNonArcadeExtensions(): Array<string> {
    return this.config.systems.filter((s) => s.id !== "arcade").flatMap((s) => s.extensions);
  }

  /** Returns the first matching system for a given ROM extension. */
  private findSystemForExtension(ext: string, systemId?: string): GameSystem | undefined {
    const systems = systemId
      ? this.config.systems.filter((s) => s.id === systemId)
      : this.config.systems;
    return systems.find((s) => s.extensions.includes(ext));
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
      ? (this.config.systems.find((s) => s.id === systemId)?.extensions ?? [])
      : this.getNonArcadeExtensions();

    const match = await findRomInZip(zipPath, nativeExtensions);
    if (!match) {
      libraryLog.debug(`No matching ROM found in zip: ${zipPath}`);
      return null;
    }

    const system = this.findSystemForExtension(match.extension, systemId);
    if (!system) {
      return null;
    }

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
    const hashPrefix = gameId.slice(0, 8);
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
    if (this.games.has(gameId)) {
      return null;
    }

    const romExt = path.extname(romBasename).toLowerCase();
    const title = this.cleanGameTitle(path.basename(romBasename, romExt));

    return {
      id: gameId,
      romHashes: hashes,
      romPath: finalPath,
      sourceArchivePath: zipPath,
      system: system.name,
      systemId: system.id,
      title,
    };
  }

  /**
   * Computes CRC32, SHA-1, and MD5 hashes for a ROM file in a single pass.
   * Also returns the SHA-256 game ID. Throws if the file is unreadable.
   */
  async computeRomHashes(romPath: string): Promise<{ gameId: string; hashes: RomHashes }> {
    const sha256 = crypto.createHash("sha256");
    const sha1 = crypto.createHash("sha1");
    const md5 = crypto.createHash("md5");
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
      gameId: sha256.digest("hex"),
      hashes: {
        crc32: crc.toString(16).padStart(8, "0"),
        md5: md5.digest("hex"),
        sha1: sha1.digest("hex"),
      },
    };
  }

  private cleanGameTitle(filename: string): string {
    // Remove common ROM naming conventions
    return filename
      .replaceAll(/\([^)]*\)/g, "") // Remove content in parentheses
      .replaceAll(/\[[^\]]*\]/g, "") // Remove content in brackets
      .replaceAll(/\{[^}]*\}/g, "") // Remove content in braces
      .replaceAll("_", " ") // Replace underscores with spaces
      .replaceAll(/\s+/g, " ") // Multiple spaces to single space
      .trim();
  }
}
