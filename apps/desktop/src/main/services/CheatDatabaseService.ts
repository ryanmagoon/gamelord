import { app } from "electron";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheatEntry } from "../../types/library";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// .cht parser (pure function, no side effects — easy to test)
// ---------------------------------------------------------------------------

/**
 * Parse a libretro .cht file into structured cheat entries.
 *
 * Format:
 * ```
 * cheats = 3
 * cheat0_desc = "Infinite Lives"
 * cheat0_code = "APEETPEY"
 * cheat0_enable = false
 * ```
 */
export function parseChtFile(content: string): Array<CheatEntry> {
  const lines = content.split(/\r?\n/);
  const kvMap = new Map<string, string>();

  for (const line of lines) {
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replaceAll(String.raw`\"`, '"');
    }

    kvMap.set(key, value);
  }

  const countStr = kvMap.get("cheats");
  if (!countStr) {
    return [];
  }

  const count = Number.parseInt(countStr, 10);
  if (!Number.isFinite(count) || count <= 0) {
    return [];
  }

  const cheats: Array<CheatEntry> = [];

  for (let i = 0; i < count; i++) {
    const code = kvMap.get(`cheat${i}_code`);
    if (!code) {
      continue;
    } // Skip cheats without a code — they're useless

    const description = kvMap.get(`cheat${i}_desc`) || `Cheat ${i}`;
    const enableStr = kvMap.get(`cheat${i}_enable`);
    const enabled = enableStr === "true" || enableStr === "1";

    cheats.push({ index: i, description, code, enabled });
  }

  return cheats;
}

/**
 * Strip all parenthetical groups (region tags, cheat device names, etc.)
 * and normalise whitespace to produce a base game title for fuzzy matching.
 *
 * "Resident Evil - Director's Cut (USA, Europe) (Game Buster)"
 *   → "resident evil - director's cut"
 */
export function baseTitle(name: string): string {
  return name
    .replaceAll(/\([^)]*\)/g, "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Check if a .cht filename matches a ROM name.
 *
 * Matching strategy (in priority order):
 * 1. Exact match (extension-stripped, case-insensitive)
 * 2. Base-title match — strip all parenthetical groups from both names
 *    and compare the core title. This handles differing region tags and
 *    cheat-device suffixes between ROM filenames and the libretro database.
 */
export function matchChtFilename(romNameNoExt: string, chtFilename: string): boolean {
  if (!chtFilename.toLowerCase().endsWith(".cht")) {
    return false;
  }
  const chtNameNoExt = chtFilename.slice(0, -4);

  // Exact match
  if (chtNameNoExt.toLowerCase() === romNameNoExt.toLowerCase()) {
    return true;
  }

  // Base-title fuzzy match
  return baseTitle(romNameNoExt) === baseTitle(chtNameNoExt);
}

// ---------------------------------------------------------------------------
// System ID mapping: our systemId → libretro-database cht/ folder name(s)
// ---------------------------------------------------------------------------

/**
 * Maps GameLord system IDs to the corresponding folder names in
 * libretro-database/cht/. Some systems have multiple possible folder names
 * due to regional naming differences in the database.
 */
const SYSTEM_CHT_FOLDERS: Record<string, Array<string>> = {
  nes: ["Nintendo - Nintendo Entertainment System"],
  snes: ["Nintendo - Super Nintendo Entertainment System"],
  genesis: ["Sega - Mega Drive - Genesis"],
  gb: ["Nintendo - Game Boy"],
  gbc: ["Nintendo - Game Boy Color"],
  gba: ["Nintendo - Game Boy Advance"],
  n64: ["Nintendo - Nintendo 64"],
  psx: ["Sony - PlayStation"],
  psp: ["Sony - PlayStation Portable"],
  nds: ["Nintendo - Nintendo DS"],
  saturn: ["Sega - Saturn"],
  arcade: ["FBNeo - Arcade Games"],
};

// ---------------------------------------------------------------------------
// Download progress
// ---------------------------------------------------------------------------

export interface CheatDatabaseProgress {
  phase: "downloading" | "extracting" | "done" | "error";
  percent: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Metadata for tracking database freshness
// ---------------------------------------------------------------------------

interface CheatDatabaseMetadata {
  lastDownloaded: number; // ms since epoch
}

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// CheatDatabaseService
// ---------------------------------------------------------------------------

/**
 * Downloads and manages the libretro cheat database (.cht files).
 *
 * - Downloads the libretro-database repo archive on first game launch
 * - Extracts only the cht/ subtree to <userData>/cheats/
 * - Matches cheats to ROMs by filename
 * - Re-downloads if the database is >7 days old
 */
export class CheatDatabaseService extends EventEmitter {
  private cheatsDir: string;
  private metadataPath: string;
  private downloading = false;

  constructor() {
    super();
    this.cheatsDir = path.join(app.getPath("userData"), "cheats");
    this.metadataPath = path.join(this.cheatsDir, "metadata.json");
  }

  /** Ensure the cheat database exists. Downloads if missing or stale. Non-blocking. */
  async ensureDatabase(): Promise<void> {
    if (this.downloading) {
      return;
    }

    if (this.isDatabaseFresh()) {
      return;
    }

    try {
      await this.downloadDatabase();
    } catch (error) {
      // Non-fatal — cheats are simply unavailable
      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress("error", 0, message);
    }
  }

  /** Get cheats for a specific game by system ID and ROM filename. */
  getCheatsForGame(systemId: string, romFilename: string): Array<CheatEntry> {
    const romNameNoExt = path.basename(romFilename, path.extname(romFilename));
    const folders = SYSTEM_CHT_FOLDERS[systemId];

    if (!folders) {
      return [];
    }

    const allCheats: Array<CheatEntry> = [];

    for (const folder of folders) {
      const systemDir = path.join(this.cheatsDir, "cht", folder);
      if (!fs.existsSync(systemDir)) {
        continue;
      }

      let entries: Array<string>;
      try {
        entries = fs.readdirSync(systemDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (matchChtFilename(romNameNoExt, entry)) {
          const chtPath = path.join(systemDir, entry);
          try {
            const content = fs.readFileSync(chtPath, "utf8");
            const cheats = parseChtFile(content);
            // Re-index so indices are unique across all matched files
            for (const cheat of cheats) {
              allCheats.push({ ...cheat, index: allCheats.length });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    return allCheats;
  }

  /** Whether the database has been downloaded at all (may be stale). */
  isDatabasePresent(): boolean {
    return fs.existsSync(this.metadataPath);
  }

  /** Whether the database is currently being downloaded. */
  isDownloading(): boolean {
    return this.downloading;
  }

  /** Whether the database has been downloaded and is not stale. */
  private isDatabaseFresh(): boolean {
    if (!fs.existsSync(this.metadataPath)) {
      return false;
    }

    try {
      const raw = fs.readFileSync(this.metadataPath, "utf8");
      const metadata: CheatDatabaseMetadata = JSON.parse(raw);
      return Date.now() - metadata.lastDownloaded < STALE_THRESHOLD_MS;
    } catch {
      return false;
    }
  }

  /** Download the libretro-database archive and extract the cht/ directory. */
  private async downloadDatabase(): Promise<void> {
    this.downloading = true;

    try {
      fs.mkdirSync(this.cheatsDir, { recursive: true });

      const tarballUrl =
        "https://github.com/libretro/libretro-database/archive/refs/heads/master.tar.gz";

      this.emitProgress("downloading", 0);

      const tarballPath = path.join(this.cheatsDir, "libretro-database.tar.gz");

      await this.downloadFile(tarballUrl, tarballPath, (percent) => {
        this.emitProgress("downloading", percent);
      });

      this.emitProgress("extracting", 85);

      await this.extractChtFiles(tarballPath);

      // Clean up tarball
      try {
        fs.unlinkSync(tarballPath);
      } catch {
        // Ignore cleanup errors
      }

      // Write metadata
      const metadata: CheatDatabaseMetadata = { lastDownloaded: Date.now() };
      fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));

      this.emitProgress("done", 100);
    } catch (error) {
      // Clean up partial download
      const tarballPath = path.join(this.cheatsDir, "libretro-database.tar.gz");
      if (fs.existsSync(tarballPath)) {
        try {
          fs.unlinkSync(tarballPath);
        } catch {
          // Ignore
        }
      }
      throw error;
    } finally {
      this.downloading = false;
    }
  }

  /** Download a file with progress tracking (follows redirects). */
  private downloadFile(
    url: string,
    dest: string,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const follow = (targetUrl: string, redirectCount: number): void => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects downloading cheat database"));
          return;
        }

        https
          .get(targetUrl, (response) => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
              response.destroy();
              const location = response.headers.location;
              if (!location) {
                reject(new Error("Redirect without Location header"));
                return;
              }
              follow(location, redirectCount + 1);
              return;
            }

            if (response.statusCode !== 200) {
              response.destroy();
              reject(new Error(`HTTP ${response.statusCode} downloading cheat database`));
              return;
            }

            const totalBytes = Number.parseInt(response.headers["content-length"] || "0", 10);
            let downloadedBytes = 0;

            const file = fs.createWriteStream(dest);

            response.on("data", (chunk: Buffer) => {
              downloadedBytes += chunk.length;
              if (totalBytes > 0) {
                onProgress(Math.round((downloadedBytes / totalBytes) * 85));
              }
            });

            response.pipe(file);

            file.on("finish", () => {
              file.close();
              resolve();
            });

            file.on("error", (error) => {
              file.close();
              try {
                fs.unlinkSync(dest);
              } catch {
                // Ignore
              }
              reject(error);
            });
          })
          .on("error", reject);
      };

      follow(url, 0);
    });
  }

  /**
   * Extract only the cht/ subdirectory from the downloaded tarball.
   *
   * Uses the system `tar` command (available on macOS and Linux) to avoid
   * adding a Node tar dependency. The --include flag filters to only the
   * cht/ directory, and --strip-components removes the repo root prefix.
   */
  private async extractChtFiles(tarballPath: string): Promise<void> {
    await execFileAsync("tar", [
      "xzf",
      tarballPath,
      "--strip-components=1",
      "--include=*/cht/*",
      "-C",
      this.cheatsDir,
    ]);
  }

  private emitProgress(
    phase: CheatDatabaseProgress["phase"],
    percent: number,
    error?: string,
  ): void {
    const progress: CheatDatabaseProgress = { phase, percent, error };
    this.emit("progress", progress);
  }
}
