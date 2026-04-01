import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as fsSync from "node:fs";
import path from "node:path";
import https from "node:https";
import { app } from "electron";

/**
 * Persistent HTTPS agent with keep-alive for artwork image downloads.
 * Reuses TCP+TLS connections across sequential downloads, saving ~200-400ms per request.
 */
const downloadAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 4,
  keepAliveMsecs: 30_000,
});
import { artworkLog } from "../logger";
import { LibraryService } from "./LibraryService";
import { ScreenScraperClient, ScreenScraperError } from "./ScreenScraperClient";
import {
  ArtworkConfig,
  ArtworkErrorCode,
  ArtworkProgress,
  ArtworkSyncStatus,
  ScreenScraperCredentials,
  ScreenScraperGameInfo,
} from "../../types/artwork";
import { readImageDimensions } from "../utils/readImageDimensions";
import { Game, getRegionalSystemName } from "../../types/library";

/**
 * Maximum width for downloaded artwork images (in pixels).
 * ScreenScraper supports `maxwidth` as a URL parameter to serve pre-resized images,
 * reducing download size by 2-3x without visible quality loss on game cards.
 * 640px is generous for card thumbnails while staying well under full-resolution originals.
 */
const ARTWORK_MAX_WIDTH = 640;

/** Minimum delay between API requests in milliseconds. */
const RATE_LIMIT_DELAY_MS = 1100;

/** Backoff delay after a rate limit (429) response. */
const RATE_LIMIT_BACKOFF_MS = 10_000;

/** Timeout for image downloads in milliseconds (30 seconds). */
const DOWNLOAD_TIMEOUT_MS = 30_000;

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
  private gameplayActive = false;
  private lastRequestTime = 0;
  private configLoaded: Promise<void>;

  constructor(libraryService: LibraryService) {
    super();
    this.libraryService = libraryService;
    const userData = app.getPath("userData");
    this.artworkDirectory = path.join(userData, "artwork");
    this.configPath = path.join(userData, "artwork-config.json");
    this.configLoaded = this.loadConfig();

    // Backfill aspect ratios for games that have cover art but no stored ratio
    void this.backfillAspectRatios();
    // Backfill ROM regions for games synced before region tracking was added
    void this.backfillRomRegions();
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
    const needsBackfill = games.filter(
      (g) =>
        g.coverArt &&
        (g.coverArtAspectRatio === undefined ||
          g.coverArtAspectRatio === 0.5 ||
          g.coverArtAspectRatio === 1.2),
    );

    if (needsBackfill.length === 0) {
      return;
    }

    artworkLog.info(`Backfilling aspect ratios for ${needsBackfill.length} game(s)`);

    for (const game of needsBackfill) {
      try {
        // Resolve artwork:// URL to filesystem path
        const filename = (game.coverArt ?? "").replace("artwork://", "");
        const filePath = path.join(this.artworkDirectory, filename);

        const dimensions = await readImageDimensions(filePath);
        if (dimensions) {
          const rawRatio = dimensions.width / dimensions.height;
          const coverArtAspectRatio = Math.max(0.4, Math.min(1.8, rawRatio));
          await this.libraryService.updateGame(game.id, { coverArtAspectRatio });
        }
      } catch (error) {
        artworkLog.error(
          `Failed to backfill aspect ratio for ${game.title}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  /**
   * One-time backfill for games synced before ROM-level region tracking.
   * Queries ScreenScraper by hash (no artwork download) to get romRegions,
   * then re-derives the regional system display name. Skips games that
   * already have romRegions or that lack metadata (never synced).
   * Requires credentials — silently skips if unconfigured.
   */
  private async backfillRomRegions(): Promise<void> {
    // Wait for config to load (fire-and-forget constructor)
    await this.configLoaded;

    if (!this.hasCredentials()) {
      return;
    }

    const games = this.libraryService.getGames();
    const needsBackfill = games.filter(
      (g) => g.metadata && (!g.romRegions || g.romRegions.length === 0),
    );

    if (needsBackfill.length === 0) {
      return;
    }

    artworkLog.info(`Backfilling ROM regions for ${needsBackfill.length} game(s)`);

    let client: ScreenScraperClient;
    try {
      client = this.createClient();
    } catch {
      return; // Dev credentials missing — skip silently
    }

    for (const game of needsBackfill) {
      // Don't conflict with a user-initiated sync
      if (this.syncing) {
        artworkLog.info("ROM region backfill paused — artwork sync in progress");
        return;
      }

      try {
        await this.waitForRateLimit();
        const gameInfo = await client.fetchByHash(game.romHashes.md5, game.systemId);

        if (gameInfo && (gameInfo.romRegions?.length || gameInfo.gameId)) {
          const effectiveRegion = gameInfo.romRegions?.[0];
          const regionalName = getRegionalSystemName(game.systemId, effectiveRegion ?? "");
          const updates: Partial<Game> = {
            ...(gameInfo.romRegions?.length ? { romRegions: gameInfo.romRegions } : {}),
            ...(regionalName ? { system: regionalName } : {}),
          };

          // Backfill disc grouping if not already set by .m3u
          if (!game.m3uPath && gameInfo.gameId && !game.discGroup) {
            updates.discGroup = `ss:${gameInfo.gameId}:${game.systemId}`;
            if (gameInfo.discNumber !== undefined) {
              updates.discNumber = gameInfo.discNumber;
            }
          }

          await this.libraryService.updateGame(game.id, updates);
        }
      } catch (error) {
        if (error instanceof ScreenScraperError) {
          if (error.errorCode === "auth-failed") {
            artworkLog.error("ROM region backfill stopped — invalid credentials");
            return;
          }
          if (error.errorCode === "rate-limited") {
            artworkLog.warn("ROM region backfill rate-limited — stopping for now");
            return;
          }
          // Timeout/network errors: skip this game, try next
          artworkLog.warn(`ROM region backfill failed for "${game.title}": ${error.message}`);
        }
      }
    }

    artworkLog.info("ROM region backfill complete");
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
      devId: process.env.SCREENSCRAPER_DEV_ID ?? "",
      devPassword: process.env.SCREENSCRAPER_DEV_PASSWORD ?? "",
      userId,
      userPassword,
    };

    const client = new ScreenScraperClient(credentials);

    try {
      await client.validateCredentials();
      return { valid: true };
    } catch (error) {
      if (error instanceof ScreenScraperError) {
        return {
          valid: false,
          error: error.message,
          errorCode: error.errorCode as ArtworkErrorCode,
        };
      }
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Unknown error validating credentials.",
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

  /** Whether the user has permanently dismissed the credential setup prompt. */
  isCredentialPromptDismissed(): boolean {
    return this.config.credentialPromptDismissed === true;
  }

  /** Persist the user's choice to never be prompted for credentials again. */
  async dismissCredentialPrompt(): Promise<void> {
    this.config.credentialPromptDismissed = true;
    await this.saveConfig();
  }

  /**
   * Run the full artwork pipeline for a single game.
   * Returns true if artwork was found and downloaded.
   * Throws ScreenScraperError with errorCode 'auth-failed' if credentials are invalid.
   */
  async syncGame(gameId: string, force = false): Promise<boolean> {
    const game = this.libraryService.getGame(gameId);
    if (!game) {
      return false;
    }

    if (game.coverArt && !force) {
      return true;
    }

    const client = this.createClient();

    // MD5 is pre-computed at scan time and stored in game.romHashes
    const md5 = game.romHashes.md5;

    // Step 1: Query ScreenScraper by hash
    let gameInfo: ScreenScraperGameInfo | null = null;
    try {
      await this.waitForRateLimit();
      gameInfo = await client.fetchByHash(md5, game.systemId);
    } catch (error) {
      if (error instanceof ScreenScraperError) {
        if (error.errorCode === "auth-failed") {
          throw error; // Auth errors must propagate — never swallow
        }
        if (error.errorCode === "rate-limited") {
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
        if (error instanceof ScreenScraperError && error.errorCode === "auth-failed") {
          throw error; // Auth errors must propagate
        }
        // Other errors: game is genuinely not found via name search
      }
    }

    if (!gameInfo) {
      // Mark this game so we don't re-query the API on the next startup sync
      const notFoundUpdate: Partial<Game> = { artworkNotFound: Date.now() };
      if (this.syncing) {
        this.libraryService.updateGameBatched(gameId, notFoundUpdate);
      } else {
        await this.libraryService.updateGame(gameId, notFoundUpdate);
      }
      return false;
    }

    // Step 4: Download artwork
    const artworkUrl =
      gameInfo.media.boxArt2d ?? gameInfo.media.boxArt3d ?? gameInfo.media.screenshot;
    let coverArtPath: string | undefined;
    let coverArtAspectRatio: number | undefined;
    if (artworkUrl) {
      try {
        const extension = this.getImageExtension(artworkUrl);
        const resizedUrl = this.withMaxWidth(artworkUrl);
        coverArtPath = await this.downloadArtwork(resizedUrl, `${gameId}${extension}`);

        // Extract image dimensions to compute aspect ratio for dynamic card sizing
        const dimensions = await readImageDimensions(coverArtPath);
        if (dimensions) {
          const rawRatio = dimensions.width / dimensions.height;
          // Clamp to [0.4, 1.8] to accommodate portrait and landscape box art
          coverArtAspectRatio = Math.max(0.4, Math.min(1.8, rawRatio));
        }
      } catch (error) {
        // Download failed — log but still save metadata
        artworkLog.error(
          `Artwork download failed for ${game.title}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Step 5: Update game record (including regional system name if applicable)
    // Uses batched update when called from a sync batch to avoid rewriting
    // library.json after every game. The batch loop calls flushSave() periodically.
    // Prefer ROM-level region (from the matched ROM dump) over title-level region
    // (which is biased by REGION_PRIORITY toward US even for JP-only games).
    const effectiveRegion = gameInfo.romRegions?.[0] ?? gameInfo.region;
    const regionalName = getRegionalSystemName(game.systemId, effectiveRegion);
    const hasArtwork = !!coverArtPath && !!artworkUrl;

    // Derive disc grouping from ScreenScraper metadata only when the game doesn't
    // already have .m3u-based grouping (.m3u takes precedence per spec).
    const discUpdates: Partial<Game> = {};
    if (!game.m3uPath && gameInfo.gameId) {
      // discGroup = ScreenScraper game ID + systemId to be unique across systems
      const ssDiscGroup = `ss:${gameInfo.gameId}:${game.systemId}`;
      if (!game.discGroup || game.discGroup === ssDiscGroup) {
        discUpdates.discGroup = ssDiscGroup;
      }
      if (gameInfo.discNumber !== undefined) {
        discUpdates.discNumber = gameInfo.discNumber;
      }
    }

    const updates: Partial<typeof game> = {
      ...(hasArtwork
        ? {
            coverArt: `artwork://${gameId}${this.getImageExtension(artworkUrl)}`,
            artworkNotFound: undefined, // Clear any previous not-found marker
          }
        : { artworkNotFound: Date.now() }),
      ...(coverArtAspectRatio !== undefined ? { coverArtAspectRatio } : {}),
      ...(regionalName ? { system: regionalName } : {}),
      ...(gameInfo.romRegions ? { romRegions: gameInfo.romRegions } : {}),
      ...discUpdates,
      metadata: {
        developer: gameInfo.developer,
        publisher: gameInfo.publisher,
        releaseDate: gameInfo.releaseDate,
        genre: gameInfo.genre,
        description: gameInfo.synopsis,
        players: gameInfo.players,
        rating: gameInfo.rating,
      },
    };

    if (this.syncing) {
      this.libraryService.updateGameBatched(gameId, updates);
    } else {
      await this.libraryService.updateGame(gameId, updates);
    }

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
    const gamesToSync = allGames.filter((game) => !game.coverArt && !game.artworkNotFound);

    return this.runSyncBatch(gamesToSync.map((game) => game.id));
  }

  /**
   * Sync artwork for a specific list of game IDs.
   * Used for auto-sync after ROM import to avoid re-syncing the entire library.
   */
  async syncGames(gameIds: Array<string>): Promise<ArtworkSyncStatus> {
    if (this.syncing) {
      return { inProgress: true, processed: 0, total: 0, found: 0, notFound: 0, errors: 0 };
    }

    this.syncing = true;
    this.cancelled = false;

    // Filter to only games that exist and don't already have cover art
    const filteredIds = gameIds.filter((id) => {
      const game = this.libraryService.getGame(id);
      return game && !game.coverArt;
    });

    return this.runSyncBatch(filteredIds);
  }

  /** Cancel an in-progress bulk sync. */
  cancelSync(): void {
    this.cancelled = true;
  }

  /**
   * Signal that a game is actively running (or has stopped).
   * During gameplay, the sync loop continues but defers disk flushes
   * to avoid any event loop pressure from JSON serialization + file I/O.
   * Deferred flushes run automatically when gameplay ends.
   */
  setGameplayActive(active: boolean): void {
    this.gameplayActive = active;
    if (!active && this.syncing) {
      // Gameplay ended — flush any deferred writes immediately
      void this.libraryService.flushSave();
    }
  }

  /** Returns whether gameplay is currently active. */
  isGameplayActive(): boolean {
    return this.gameplayActive;
  }

  /** Get current sync status. */
  getSyncStatus(): { inProgress: boolean } {
    return { inProgress: this.syncing };
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
          reject(new Error("Too many redirects while downloading artwork"));
          return;
        }

        const request = https.get(targetUrl, { agent: downloadAgent }, (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
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
          file.on("finish", () => {
            file.close();
            resolve(destPath);
          });
          file.on("error", (err) => {
            fsSync.unlink(destPath, (_err) => {
              /* best-effort cleanup */
            });
            reject(err);
          });
        });

        request.on("error", (error) => {
          reject(new Error(`Network error downloading artwork: ${error.message}`));
        });

        request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
          request.destroy();
          reject(new Error("Artwork download timed out after 30 seconds"));
        });
      };

      follow(imageUrl, 0);
    });
  }

  /**
   * Create a ScreenScraperClient with the stored credentials.
   * Throws ScreenScraperError with a structured errorCode when configuration
   * is incomplete so callers can surface a meaningful message instead of
   * silently treating every game as "not found".
   */
  private createClient(): ScreenScraperClient {
    if (!this.config.screenscraper?.userId || !this.config.screenscraper?.userPassword) {
      throw new ScreenScraperError(
        "ScreenScraper user credentials are not configured. Please set your account in the credentials dialog.",
        0,
        "auth-failed",
      );
    }

    const devId = process.env.SCREENSCRAPER_DEV_ID ?? "";
    const devPassword = process.env.SCREENSCRAPER_DEV_PASSWORD ?? "";

    if (!devId || !devPassword) {
      throw new ScreenScraperError(
        "ScreenScraper developer credentials are not configured in .env — artwork sync will not work.",
        0,
        "config-error",
      );
    }

    const credentials: ScreenScraperCredentials = {
      devId,
      devPassword,
      userId: this.config.screenscraper.userId,
      userPassword: this.config.screenscraper.userPassword,
    };

    return new ScreenScraperClient(credentials);
  }

  /**
   * Internal batch sync implementation shared by syncAllGames() and syncGames().
   * Processes game IDs serially with rate limiting, progress emission, and cancellation.
   */
  private async runSyncBatch(gameIds: Array<string>): Promise<ArtworkSyncStatus> {
    const total = gameIds.length;
    let processed = 0;
    let found = 0;
    let notFound = 0;
    let errors = 0;

    for (const gameId of gameIds) {
      if (this.cancelled) {
        break;
      }

      const game = this.libraryService.getGame(gameId);
      if (!game) {
        processed++;
        continue;
      }

      this.emitProgress({
        gameId: game.id,
        gameTitle: game.title,
        phase: "hashing",
        current: processed + 1,
        total,
      });

      try {
        this.emitProgress({
          gameId: game.id,
          gameTitle: game.title,
          phase: "querying",
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
            phase: "done",
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
            phase: "not-found",
            current: processed + 1,
            total,
          });
        }
      } catch (error) {
        errors++;

        const errorCode: ArtworkErrorCode | undefined =
          error instanceof ScreenScraperError ? (error.errorCode as ArtworkErrorCode) : undefined;

        this.emitProgress({
          gameId: game.id,
          gameTitle: game.title,
          phase: "error",
          current: processed + 1,
          total,
          error: error instanceof Error ? error.message : String(error),
          errorCode,
        });

        // Auth and config failures should stop the entire batch — no point continuing
        if (errorCode === "auth-failed" || errorCode === "config-error") {
          break;
        }
      }

      processed++;

      // Flush batched saves to disk every 10 games to bound data loss on crash.
      // During gameplay, defer flushing to avoid any event loop pressure —
      // the in-memory state is already updated and flushes when gameplay ends.
      if (processed % 10 === 0 && !this.gameplayActive) {
        await this.libraryService.flushSave();
      }
    }

    // Final flush for any remaining batched updates
    await this.libraryService.flushSave();

    this.syncing = false;
    this.gameplayActive = false;
    const status: ArtworkSyncStatus = {
      inProgress: false,
      processed,
      total,
      found,
      notFound,
      errors,
    };
    this.emit("syncComplete", status);
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emitProgress(progress: ArtworkProgress): void {
    this.emit("progress", progress);
  }

  /**
   * Append a `maxwidth` parameter to a ScreenScraper media URL so the server
   * returns a pre-resized image. This typically cuts download size by 2-3x.
   */
  private withMaxWidth(url: string): string {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}maxwidth=${ARTWORK_MAX_WIDTH}`;
  }

  /** Extract the file extension from an image URL. */
  private getImageExtension(url: string): string {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".png";
  }

  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, "utf8");
      this.config = JSON.parse(data);
    } catch {
      this.config = {};
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }
}
