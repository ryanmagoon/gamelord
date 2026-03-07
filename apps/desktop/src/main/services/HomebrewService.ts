import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { LibraryService } from "./LibraryService";
import { libraryLog } from "../logger";

/** Shape of each entry in the bundled homebrew manifest.json. */
interface HomebrewManifestEntry {
  filename: string;
  title: string;
  systemId: string;
  developer: string;
  description: string;
  genre: string;
  players: number;
  license: string;
  attribution: string | null;
  coverArt?: string;
  coverArtAspectRatio?: number;
}

/**
 * Manages bundled homebrew ROM import. On first launch (or when the library
 * is empty), copies permissively-licensed ROMs from app resources into the
 * user's ROM directory and registers them in the library with metadata.
 */
export class HomebrewService {
  private libraryService: LibraryService;
  /** Tracks whether homebrew has already been imported in this app installation. */
  private markerPath: string;
  /** Directory where artwork files are stored. */
  private artworkDirectory: string;

  constructor(libraryService: LibraryService) {
    this.libraryService = libraryService;
    const userData = app.getPath("userData");
    this.markerPath = path.join(userData, ".homebrew-imported");
    this.artworkDirectory = path.join(userData, "artwork");
  }

  /**
   * Returns the path to bundled homebrew resources. In development this
   * resolves relative to the source tree; in production it's inside the
   * packaged app's resources directory.
   */
  private getHomebrewResourcePath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "homebrew");
    }
    // Development: __dirname is apps/desktop/out/main/
    return path.join(__dirname, "../../resources/homebrew");
  }

  /**
   * Import bundled homebrew ROMs if they haven't been imported yet.
   * Called during app startup. Skips silently if already done or if
   * the homebrew resources aren't available.
   *
   * @returns `true` if ROMs were actually imported (renderer should reload).
   */
  async importIfNeeded(): Promise<boolean> {
    // Skip if already imported in a previous session
    if (await this.hasBeenImported()) {
      return false;
    }

    // Only auto-import when the library is empty — don't clutter an
    // existing library with homebrew titles on upgrade
    const existingGames = this.libraryService.getGames();
    if (existingGames.length > 0) {
      await this.markAsImported();
      return false;
    }

    return this.importHomebrewRoms();
  }

  /**
   * Copies bundled ROMs to the user's NES ROM folder and adds them to
   * the library with pre-populated metadata from the manifest.
   *
   * @returns `true` if at least one ROM was imported.
   */
  async importHomebrewRoms(): Promise<boolean> {
    const resourcePath = this.getHomebrewResourcePath();

    let manifest: Array<HomebrewManifestEntry>;
    try {
      const raw = await fs.readFile(path.join(resourcePath, "manifest.json"), "utf8");
      manifest = JSON.parse(raw);
    } catch (error) {
      libraryLog.warn("Homebrew manifest not found, skipping import:", error);
      return false;
    }

    // Ensure the NES ROM folder exists
    const config = this.libraryService.getConfig();
    const nesSystem = config.systems.find((s) => s.id === "nes");
    const nesRomsPath =
      nesSystem?.romsPath ??
      path.join(config.romsBasePath ?? path.join(app.getPath("home"), "ROMs"), "NES");

    try {
      await fs.mkdir(nesRomsPath, { recursive: true });
    } catch (error) {
      libraryLog.error("Failed to create NES ROM directory:", error);
      return false;
    }

    // Ensure artwork directory exists for cover art
    try {
      await fs.mkdir(this.artworkDirectory, { recursive: true });
    } catch (error) {
      libraryLog.warn("Failed to create artwork directory:", error);
    }

    let importedCount = 0;

    for (const entry of manifest) {
      try {
        const srcPath = path.join(resourcePath, entry.filename);
        const destPath = path.join(nesRomsPath, entry.filename);

        // Skip if already copied (e.g. partial previous import)
        try {
          await fs.access(destPath);
          libraryLog.debug(`Homebrew ROM already exists: ${entry.filename}`);
        } catch {
          await fs.copyFile(srcPath, destPath);
          libraryLog.info(`Copied homebrew ROM: ${entry.filename}`);
        }

        // Add to library via the normal pipeline (hashes, system detection, etc.)
        const game = await this.libraryService.addGame(destPath, entry.systemId);
        if (game) {
          // Copy bundled cover art to the artwork directory
          let coverArt: string | undefined;
          let coverArtAspectRatio: number | undefined;
          if (entry.coverArt) {
            try {
              const artSrc = path.join(resourcePath, entry.coverArt);
              const artDest = path.join(this.artworkDirectory, `${game.id}.png`);
              await fs.copyFile(artSrc, artDest);
              coverArt = `artwork://${game.id}.png`;
              coverArtAspectRatio = entry.coverArtAspectRatio;
              libraryLog.info(`Copied cover art for: ${entry.title}`);
            } catch (artError) {
              libraryLog.warn(`Failed to copy cover art for ${entry.title}:`, artError);
            }
          }

          // Enrich with manifest metadata and artwork
          await this.libraryService.updateGame(game.id, {
            ...(coverArt && { coverArt, coverArtAspectRatio }),
            metadata: {
              developer: entry.developer,
              description: entry.description,
              genre: entry.genre,
              players: entry.players,
            },
          });
          importedCount++;
          libraryLog.info(`Imported homebrew: ${entry.title} (${entry.license})`);
        }
      } catch (error) {
        libraryLog.warn(`Failed to import homebrew ROM ${entry.filename}:`, error);
      }
    }

    if (importedCount > 0) {
      libraryLog.info(`Imported ${importedCount} homebrew ROM(s)`);
    }

    await this.markAsImported();
    return importedCount > 0;
  }

  private async hasBeenImported(): Promise<boolean> {
    try {
      await fs.access(this.markerPath);
      return true;
    } catch {
      return false;
    }
  }

  private async markAsImported(): Promise<void> {
    try {
      await fs.writeFile(this.markerPath, new Date().toISOString());
    } catch (error) {
      libraryLog.warn("Failed to write homebrew import marker:", error);
    }
  }
}
