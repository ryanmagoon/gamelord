import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { app } from 'electron';
import { artworkLog } from '../logger';
import { LibraryService } from './LibraryService';
import { ScreenScraperClient, ScreenScraperError } from './ScreenScraperClient';
import {
  ArtworkConfig,
  ArtworkErrorCode,
  ArtworkProgress,
  ArtworkSyncStatus,
  ScreenScraperCredentials,
  ScreenScraperGameInfo,
} from '../../types/artwork';
import { readImageDimensions } from '../utils/readImageDimensions';

/** Minimum delay between API requests in milliseconds. */
const RATE_LIMIT_DELAY_MS = 1100;

/** Backoff delay after a rate limit (429) response. */
const RATE_LIMIT_BACKOFF_MS = 10000;

/** Timeout for image downloads in milliseconds (30 seconds). */
const DOWNLOAD_TIMEOUT_MS = 30000;

/**
 * Orchestrates the artwork and metadata pipeline:
 * hash ROMs → query ScreenScraper → download images → update library.
 *
 * Extends EventEmitter to report progress to the renderer via IPC forwarding.
 * Emits: 'progress' (ArtworkProgress), 'syncComplete' (ArtworkSyncStatus)
 */
export class ArtworkService extends EventEmitter {
  private libraryService: LibraryService;
  private artworkDirectory: string;
  private configPath: string;
  private config: ArtworkConfig = {};
  private cancelled = false;
  private syncing = false;
  private lastRequestTime = 0;

  constructor(libraryService: LibraryService) {
    super();
    this.libraryService = libraryService;
    const userData = app.getPath('userData');
    this.artworkDirectory = path.join(userData, 'artwork');
    this.configPath = path.join(userData, 'artwork-config.json');
    this.loadConfig();

    // Backfill aspect ratios for games that have cover art but no stored ratio
    void this.backfillAspectRatios();
  }

  /**
   * Scans all games with cover art but no `coverArtAspectRatio` and computes
   * the ratio from the cached image file. Runs once on startup to fix legacy
   * games that were synced before aspect ratio tracking was added.
   */
  private async backfillAspectRatios(): Promise<void> {
    const games = this.libraryService.getGames();
    // Also re-check games clamped at the old boundaries (0.5 or 1.2) — they
    // may have been truncated by a tighter clamp range.
    const needsBackfill = games.filter(g =>
      g.coverArt && (
        g.coverArtAspectRatio === undefined ||
        g.coverArtAspectRatio === 0.5 ||
        g.coverArtAspectRatio === 1.2
      ),
    );

    if (needsBackfill.length === 0) return;

    artworkLog.info(`Backfilling aspect ratios for ${needsBackfill.length} game(s)`);

    for (const game of needsBackfill) {
      try {
        // Resolve artwork:// URL to filesystem path
        const filename = game.coverArt!.replace('artwork://', '');
        const filePath = path.join(this.artworkDirectory, filename);

        const dimensions = await readImageDimensions(filePath);
        if (dimensions) {
          const rawRatio = dimensions.width / dimensions.height;
          const coverArtAspectRatio = Math.max(0.4, Math.min(1.8, rawRatio));
          await this.libraryService.updateGame(game.id, { coverArtAspectRatio });
        }
      } catch (error) {
        artworkLog.error(`Failed to backfill aspect ratio for ${game.title}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  /** Returns the artwork directory path, creating it if needed. */
  getArtworkDirectory(): string {
    if (!fsSync.existsSync(this.artworkDirectory)) {
      fsSync.mkdirSync(this.artworkDirectory, { recursive: true });
    }
    return this.artworkDirectory;
  }

  /**
   * Validate credentials against ScreenScraper before storing them.
   * Makes a lightweight API call to check if the credentials are accepted.
   */
  async validateCredentials(
    userId: string,
    userPassword: string,
  ): Promise<{ valid: boolean; error?: string; errorCode?: ArtworkErrorCode }> {
    const credentials: ScreenScraperCredentials = {
      devId: process.env.SCREENSCRAPER_DEV_ID ?? '',
      devPassword: process.env.SCREENSCRAPER_DEV_PASSWORD ?? '',
      userId,
      userPassword,
    };

    const client = new ScreenScraperClient(credentials);

    try {
      await client.validateCredentials();
      return { valid: true };
    } catch (error) {
      if (error instanceof ScreenScraperError) {
        return { valid: false, error: error.message, errorCode: error.errorCode as ArtworkErrorCode };
      }
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error validating credentials.',
      };
    }
  }

  /**
   * Store ScreenScraper user credentials to disk.
   * Credentials are validated before saving — call validateCredentials() first
   * if you want to check them, or use this directly to persist already-validated creds.
   */
  async setCredentials(userId: string, userPassword: string): Promise<void> {
    this.config.screenscraper = { userId, userPassword };
    await this.saveConfig();
  }

  /** Check whether user credentials are configured. */
  hasCredentials(): boolean {
    return !!(this.config.screenscraper?.userId && this.config.screenscraper?.userPassword);
  }

  /** Remove stored credentials. */
  async clearCredentials(): Promise<void> {
    delete this.config.screenscraper;
    await this.saveConfig();
  }

  /**
   * Run the full artwork pipeline for a single game.
   * Returns true if artwork was found and downloaded.
   * Throws ScreenScraperError with errorCode 'auth-failed' if credentials are invalid.
   */
  async syncGame(gameId: string, force = false): Promise<boolean> {
    const game = this.libraryService.getGame(gameId);
    if (!game) return false;

    if (game.coverArt && !force) return true;

    const client = this.createClient();
    if (!client) return false;

    // Step 1: Compute ROM hash if not cached
    let md5 = game.romHashes?.md5;
    if (!md5) {
      try {
        md5 = await this.computeRomHash(game.romPath);
        await this.libraryService.updateGame(gameId, {
          romHashes: { ...game.romHashes, md5 },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ScreenScraperError(
          `Failed to read ROM file: ${message}`,
          0,
          'network-error',
        );
      }
    }

    // Step 2: Query ScreenScraper by hash
    let gameInfo: ScreenScraperGameInfo | null = null;
    try {
      await this.waitForRateLimit();
      gameInfo = await client.fetchByHash(md5, game.systemId);
    } catch (error) {
      if (error instanceof ScreenScraperError) {
        if (error.errorCode === 'auth-failed') {
          throw error; // Auth errors must propagate — never swallow
        }
        if (error.errorCode === 'rate-limited') {
          await this.sleep(RATE_LIMIT_BACKOFF_MS);
        }
        // Other errors (timeout, network): fall through to name search
      } else {
        throw error;
      }
    }

    // Step 3: Fallback to name search
    if (!gameInfo) {
      try {
        await this.waitForRateLimit();
        gameInfo = await client.fetchByName(game.title, game.systemId);
      } catch (error) {
        if (error instanceof ScreenScraperError && error.errorCode === 'auth-failed') {
          throw error; // Auth errors must propagate
        }
        // Other errors: game is genuinely not found via name search
      }
    }

    if (!gameInfo) return false;

    // Step 4: Download artwork
    const artworkUrl = gameInfo.media.boxArt2d ?? gameInfo.media.boxArt3d ?? gameInfo.media.screenshot;
    let coverArtPath: string | undefined;
    let coverArtAspectRatio: number | undefined;
    if (artworkUrl) {
      try {
        const extension = this.getImageExtension(artworkUrl);
        coverArtPath = await this.downloadArtwork(artworkUrl, `${gameId}${extension}`);

        // Extract image dimensions to compute aspect ratio for dynamic card sizing
        const dimensions = await readImageDimensions(coverArtPath);
        if (dimensions) {
          const rawRatio = dimensions.width / dimensions.height;
          // Clamp to [0.4, 1.8] to accommodate portrait and landscape box art
          coverArtAspectRatio = Math.max(0.4, Math.min(1.8, rawRatio));
        }
      } catch (error) {
        // Download failed — log but still save metadata
        artworkLog.error(`Artwork download failed for ${game.title}:`, error instanceof Error ? error.message : error);
      }
    }

    // Step 5: Update game record
    await this.libraryService.updateGame(gameId, {
      ...(coverArtPath ? { coverArt: `artwork://${gameId}${this.getImageExtension(artworkUrl!)}` } : {}),
      ...(coverArtAspectRatio !== undefined ? { coverArtAspectRatio } : {}),
      metadata: {
        developer: gameInfo.developer,
        publisher: gameInfo.publisher,
        releaseDate: gameInfo.releaseDate,
        genre: gameInfo.genre,
        description: gameInfo.synopsis,
        players: gameInfo.players,
        rating: gameInfo.rating,
      },
    });

    return !!coverArtPath;
  }

  /**
   * Sync artwork for all games that don't have cover art yet.
   * Processes games serially with rate limiting. Cancellable via cancelSync().
   */
  async syncAllGames(): Promise<ArtworkSyncStatus> {
    if (this.syncing) {
      return { inProgress: true, processed: 0, total: 0, found: 0, notFound: 0, errors: 0 };
    }

    this.syncing = true;
    this.cancelled = false;

    const allGames = this.libraryService.getGames();
    const gamesToSync = allGames.filter(game => !game.coverArt);

    return this.runSyncBatch(gamesToSync.map(game => game.id));
  }

  /**
   * Sync artwork for a specific list of game IDs.
   * Used for auto-sync after ROM import to avoid re-syncing the entire library.
   */
  async syncGames(gameIds: string[]): Promise<ArtworkSyncStatus> {
    if (this.syncing) {
      return { inProgress: true, processed: 0, total: 0, found: 0, notFound: 0, errors: 0 };
    }

    this.syncing = true;
    this.cancelled = false;

    // Filter to only games that exist and don't already have cover art
    const filteredIds = gameIds.filter(id => {
      const game = this.libraryService.getGame(id);
      return game && !game.coverArt;
    });

    return this.runSyncBatch(filteredIds);
  }

  /** Cancel an in-progress bulk sync. */
  cancelSync(): void {
    this.cancelled = true;
  }

  /** Get current sync status. */
  getSyncStatus(): { inProgress: boolean } {
    return { inProgress: this.syncing };
  }

  /**
   * Compute the MD5 hash of a ROM file's contents using a stream.
   * This is non-blocking and works with large files (PSP ISOs, etc.).
   */
  computeRomHash(romPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fsSync.createReadStream(romPath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Download an image from a URL to the local artwork directory.
   * Includes a 30-second timeout. Returns the full local path to the saved file.
   */
  downloadArtwork(imageUrl: string, filename: string): Promise<string> {
    const destPath = path.join(this.getArtworkDirectory(), filename);

    return new Promise((resolve, reject) => {
      const follow = (targetUrl: string, redirectCount: number) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects while downloading artwork'));
          return;
        }

        const request = https.get(targetUrl, (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            response.destroy();
            follow(response.headers.location, redirectCount + 1);
            return;
          }

          if (response.statusCode !== 200) {
            response.destroy();
            reject(new Error(`Artwork download failed with HTTP ${response.statusCode}`));
            return;
          }

          const file = fsSync.createWriteStream(destPath);
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(destPath);
          });
          file.on('error', (err) => {
            fsSync.unlink(destPath, (_err) => { /* best-effort cleanup */ });
            reject(err);
          });
        });

        request.on('error', (error) => {
          reject(new Error(`Network error downloading artwork: ${error.message}`));
        });

        request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
          request.destroy();
          reject(new Error('Artwork download timed out after 30 seconds'));
        });
      };

      follow(imageUrl, 0);
    });
  }

  /** Create a ScreenScraperClient with the stored credentials. */
  private createClient(): ScreenScraperClient | null {
    if (!this.config.screenscraper?.userId || !this.config.screenscraper?.userPassword) {
      return null;
    }

    const credentials: ScreenScraperCredentials = {
      devId: process.env.SCREENSCRAPER_DEV_ID ?? '',
      devPassword: process.env.SCREENSCRAPER_DEV_PASSWORD ?? '',
      userId: this.config.screenscraper.userId,
      userPassword: this.config.screenscraper.userPassword,
    };

    return new ScreenScraperClient(credentials);
  }

  /**
   * Internal batch sync implementation shared by syncAllGames() and syncGames().
   * Processes game IDs serially with rate limiting, progress emission, and cancellation.
   */
  private async runSyncBatch(gameIds: string[]): Promise<ArtworkSyncStatus> {
    const total = gameIds.length;
    let processed = 0;
    let found = 0;
    let notFound = 0;
    let errors = 0;

    for (const gameId of gameIds) {
      if (this.cancelled) break;

      const game = this.libraryService.getGame(gameId);
      if (!game) {
        processed++;
        continue;
      }

      this.emitProgress({
        gameId: game.id,
        gameTitle: game.title,
        phase: 'hashing',
        current: processed + 1,
        total,
      });

      try {
        this.emitProgress({
          gameId: game.id,
          gameTitle: game.title,
          phase: 'querying',
          current: processed + 1,
          total,
        });

        const success = await this.syncGame(game.id);

        if (success) {
          found++;
          // Re-fetch the game to get the coverArt URL that syncGame() just set
          const updatedGame = this.libraryService.getGame(game.id);
          this.emitProgress({
            gameId: game.id,
            gameTitle: game.title,
            phase: 'done',
            current: processed + 1,
            total,
            coverArt: updatedGame?.coverArt,
            coverArtAspectRatio: updatedGame?.coverArtAspectRatio,
          });
        } else {
          notFound++;
          this.emitProgress({
            gameId: game.id,
            gameTitle: game.title,
            phase: 'not-found',
            current: processed + 1,
            total,
          });
        }
      } catch (error) {
        errors++;

        const errorCode: ArtworkErrorCode | undefined =
          error instanceof ScreenScraperError
            ? (error.errorCode as ArtworkErrorCode)
            : undefined;

        this.emitProgress({
          gameId: game.id,
          gameTitle: game.title,
          phase: 'error',
          current: processed + 1,
          total,
          error: error instanceof Error ? error.message : String(error),
          errorCode,
        });

        // Auth failures should stop the entire batch — no point continuing
        if (errorCode === 'auth-failed') {
          break;
        }
      }

      processed++;
    }

    this.syncing = false;
    const status: ArtworkSyncStatus = { inProgress: false, processed, total, found, notFound, errors };
    this.emit('syncComplete', status);
    return status;
  }

  /** Enforce rate limiting by waiting if needed since the last API request. */
  private async waitForRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await this.sleep(RATE_LIMIT_DELAY_MS - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private emitProgress(progress: ArtworkProgress): void {
    this.emit('progress', progress);
  }

  /** Extract the file extension from an image URL. */
  private getImageExtension(url: string): string {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
    } catch {
      this.config = {};
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }
}
