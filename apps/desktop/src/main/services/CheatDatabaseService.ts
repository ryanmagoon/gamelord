import { app } from "electron";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheatEntry, CheatSource } from "../../types/library";

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

// ---------------------------------------------------------------------------
// DuckStation chtdb parser (pure function, no side effects — easy to test)
// ---------------------------------------------------------------------------

/**
 * Parse a DuckStation chtdb .cht file into structured cheat entries.
 *
 * Format:
 * ```
 * ; comment
 * [Cheat Name]
 * Type = Gameshark
 * Activation = EndFrame
 * 800C51AC 008C
 * D00CF844 0010
 * 800C51AC 00C8
 * ```
 *
 * Each `[Section]` defines one cheat. Hex code lines within a section
 * are joined with `+` to match libretro's `retro_cheat_set` format.
 */
export function parseDuckStationChtFile(content: string): Array<CheatEntry> {
  const lines = content.split(/\r?\n/);
  const cheats: Array<CheatEntry> = [];

  let currentName: string | null = null;
  let currentCodes: Array<string> = [];

  const flush = () => {
    if (currentName !== null && currentCodes.length > 0) {
      cheats.push({
        index: cheats.length,
        description: currentName,
        code: currentCodes.join("+"),
        enabled: false,
      });
    }
    currentName = null;
    currentCodes = [];
  };

  // Matches hex code lines like "800C51AC 008C" or "A7038CCA 10402400"
  const hexCodePattern = /^[0-9A-Fa-f]{8}\s+[0-9A-Fa-f]+$/;
  // Matches metadata lines like "Type = Gameshark" or "Activation = EndFrame"
  const metadataPattern = /^(Type|Activation)\s*=/i;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith(";")) {
      continue;
    }

    // Section header: [Cheat Name]
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      flush();
      currentName = trimmed.slice(1, -1);
      continue;
    }

    // Skip metadata lines
    if (metadataPattern.test(trimmed)) {
      continue;
    }

    // Hex code line
    if (currentName !== null && hexCodePattern.test(trimmed)) {
      currentCodes.push(trimmed);
    }
  }

  // Flush last section
  flush();

  return cheats;
}

// ---------------------------------------------------------------------------
// MiSTer .gg binary parser (pure function, no side effects — easy to test)
// ---------------------------------------------------------------------------

/**
 * A single raw code entry from a MiSTer .gg binary cheat file.
 * Each entry is 16 bytes: four little-endian uint32 values.
 */
export interface GgRawCode {
  /** 0 = no compare (unconditional write), 1 = compare before write */
  compareFlag: number;
  /** Memory address to patch */
  address: number;
  /** Value to compare against (only used when compareFlag is 1) */
  compareValue: number;
  /** Value to write at the address */
  replaceValue: number;
}

/**
 * Parse a MiSTer .gg binary cheat file into structured code entries.
 *
 * Format: each code is exactly 16 bytes (all uint32 little-endian):
 * ```
 * [0-3]   compareFlag   — 0x00000000 = no compare, 0x00000001 = compare
 * [4-7]   address       — memory address
 * [8-11]  compareValue  — value to compare against
 * [12-15] replaceValue  — value to write
 * ```
 *
 * Trailing bytes that don't form a complete 16-byte entry are ignored.
 */
export function parseGgBinary(buffer: Buffer): Array<GgRawCode> {
  const ENTRY_SIZE = 16;
  const entryCount = Math.floor(buffer.length / ENTRY_SIZE);
  const codes: Array<GgRawCode> = [];

  for (let i = 0; i < entryCount; i++) {
    const offset = i * ENTRY_SIZE;
    codes.push({
      compareFlag: buffer.readUInt32LE(offset),
      address: buffer.readUInt32LE(offset + 4),
      compareValue: buffer.readUInt32LE(offset + 8),
      replaceValue: buffer.readUInt32LE(offset + 12),
    });
  }

  return codes;
}

/**
 * Convert a MiSTer .gg raw code to PSX GameShark format.
 *
 * GameShark format: `PPAAAAAA VVVV`
 * - PP: prefix (30 = 8-bit write, 80 = 16-bit write, D0 = 16-bit conditional)
 * - AAAAAA: 24-bit address (PSX RAM base 0x80000000 is masked off)
 * - VVVV: 4-hex value
 *
 * When the compare flag is set, produces a two-line conditional code:
 * `D0AAAAAA CCCC+80AAAAAA VVVV`
 */
export function ggToGameShark(code: GgRawCode): string {
  // Mask off PSX RAM base address (0x80000000) to get the 24-bit offset
  const addr = code.address & 0x00_ff_ff_ff;
  const addrHex = addr.toString(16).toUpperCase().padStart(6, "0");
  const replaceHex = (code.replaceValue & 0xff_ff).toString(16).toUpperCase().padStart(4, "0");

  if (code.compareFlag !== 0) {
    // Conditional: compare + write
    const compareHex = (code.compareValue & 0xff_ff).toString(16).toUpperCase().padStart(4, "0");
    return `D0${addrHex} ${compareHex}+80${addrHex} ${replaceHex}`;
  }

  // Unconditional 16-bit write. The .gg binary format doesn't encode whether
  // the original code was an 8-bit or 16-bit write, so we always emit 80
  // (16-bit). This is safe because a 16-bit write of 0x00XX is equivalent to
  // writing XX to the target byte + 0x00 to the adjacent byte, which is the
  // correct behaviour for the vast majority of PSX GameShark codes.
  return `80${addrHex} ${replaceHex}`;
}

// ---------------------------------------------------------------------------
// Code compatibility filtering
// ---------------------------------------------------------------------------

/**
 * Standard GameShark code format: `XXXXXXXX XXXX` (8 + 4 hex nybbles = 12 total).
 * Beetle PSX's `retro_cheat_set` only supports this format. DuckStation's extended
 * codes use 8-digit values (`XXXXXXXX XXXXXXXX`) which cause glitchy behaviour
 * when passed to Beetle.
 */
const STANDARD_GAMESHARK_LINE = /^[0-9A-Fa-f]{8}\s+[0-9A-Fa-f]{4}$/;

/**
 * Check whether a cheat's code lines are all in standard GameShark format
 * compatible with Beetle PSX's `retro_cheat_set` implementation.
 *
 * Codes with extended DuckStation prefixes (A7 32-bit patch, F4 advanced
 * conditional, 90 32-bit write, etc.) use 8-digit values that Beetle
 * can't parse, causing memory corruption and glitchy behaviour.
 */
export function isBeetleCompatible(code: string): boolean {
  const lines = code.split("+");
  return lines.every((line) => STANDARD_GAMESHARK_LINE.test(line.trim()));
}

// ---------------------------------------------------------------------------
// Serial formatting
// ---------------------------------------------------------------------------

/**
 * Format a raw CD-ROM serial (e.g. `SLUS00551` from core logs) into
 * the DuckStation chtdb filename format (`SLUS-00551`).
 *
 * If the serial already contains a hyphen in the right place, it's returned
 * uppercased. Non-matching strings are returned as-is.
 */
export function formatSerial(raw: string): string {
  const upper = raw.toUpperCase();
  // Already formatted: "SLUS-00551"
  if (/^[A-Z]{4}-\d{5}$/.test(upper)) {
    return upper;
  }
  // Raw from core log: "SLUS00551"
  const match = upper.match(/^([A-Z]{4})(\d{5})$/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return raw;
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
// gamehacking.org system mapping
// ---------------------------------------------------------------------------

/**
 * Maps GameLord system IDs to the system code used in gamehacking.org's
 * MiSTer cheat pack filenames (`mister_{code}_YYYYMMDD.zip`).
 *
 * PSX-only for now — expand to other systems as needed.
 */
const GAMEHACKING_SYSTEM_CODES: Record<string, string> = {
  psx: "psx",
};

const GAMEHACKING_BASE_URL = "https://gamehacking.org/mister";

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
  /** Timestamp of last chtdb download (undefined = never downloaded). */
  chtdbLastDownloaded?: number;
  /** Timestamp of last gamehacking.org download (undefined = never downloaded). */
  gamehackingLastDownloaded?: number;
}

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// CheatDatabaseService
// ---------------------------------------------------------------------------

/**
 * Downloads and manages cheat databases:
 * - **libretro-database** — filename-matched .cht files for all systems
 * - **DuckStation chtdb** — serial-matched .cht files for PSX (GameShark format)
 *
 * Both databases are downloaded as GitHub archives and extracted to
 * `<userData>/cheats/`. The chtdb database is stored separately under
 * `<userData>/cheats/chtdb/`. Results are merged with serial-matched
 * chtdb cheats taking priority for PSX games.
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

  /** Ensure all cheat databases exist. Downloads if missing or stale. Non-blocking. */
  async ensureDatabase(): Promise<void> {
    if (this.downloading) {
      return;
    }

    const libreFresh = this.isDatabaseFresh("libretro");
    const chtdbFresh = this.isDatabaseFresh("chtdb");
    const ghFresh = this.isDatabaseFresh("gamehacking");

    if (libreFresh && chtdbFresh && ghFresh) {
      return;
    }

    try {
      // Download all stale databases in parallel
      const downloads: Array<Promise<void>> = [];
      if (!libreFresh) {
        downloads.push(this.downloadLibretroDatabase());
      }
      if (!chtdbFresh) {
        downloads.push(this.downloadChtdb());
      }
      if (!ghFresh) {
        downloads.push(this.downloadGamehacking());
      }
      this.downloading = true;
      await Promise.all(downloads);
    } catch (error) {
      // Non-fatal — cheats are simply unavailable
      const message = error instanceof Error ? error.message : String(error);
      this.emitProgress("error", 0, message);
    } finally {
      this.downloading = false;
    }
  }

  /**
   * Get cheats for a specific game, merging all databases.
   *
   * Merge priority: chtdb > gamehacking > libretro.
   *
   * @param coreId - The libretro core identifier (e.g. "mednafen_psx_hw",
   *   "swanstation"). When set to "swanstation", chtdb cheats are included
   *   unfiltered. For all other cores, chtdb is skipped because its extended
   *   code types (A7, F4, 90, etc.) cause glitchy behaviour.
   */
  getCheatsForGame(
    systemId: string,
    romFilename: string,
    serial?: string,
    coreId?: string,
  ): Array<CheatEntry> {
    // Chtdb cheats are only safe with SwanStation's cheat engine (DuckStation
    // fork) — even "standard format" codes use DuckStation-specific activation
    // semantics that cause incorrect behaviour on Beetle PSX / PCSX ReARMed.
    const useChtdb = serial && coreId === "swanstation";
    const chtdbCheats = useChtdb ? this.getCheatsFromChtdb(serial) : [];

    // gamehacking.org cheats — matched by serial or title, standard GameShark format
    const ghCheats = this.getCheatsFromGamehacking(systemId, romFilename, serial);

    // Filename-matched libretro cheats (works with all cores)
    const libreCheats = this.getCheatsFromLibretro(systemId, romFilename);

    // Merge: chtdb first (serial-matched DuckStation format), then
    // gamehacking (serial/title-matched GameShark), then libretro.
    return this.mergeCheats(this.mergeCheats(chtdbCheats, ghCheats), libreCheats);
  }

  /** Look up cheats from the libretro-database by filename matching. */
  private getCheatsFromLibretro(systemId: string, romFilename: string): Array<CheatEntry> {
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
            for (const cheat of cheats) {
              allCheats.push({
                ...cheat,
                index: allCheats.length,
                source: "libretro" as CheatSource,
              });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    return allCheats;
  }

  /** Look up cheats from DuckStation chtdb by CD-ROM serial. */
  private getCheatsFromChtdb(serial: string): Array<CheatEntry> {
    const formatted = formatSerial(serial);
    const chtPath = path.join(this.cheatsDir, "chtdb", `${formatted}.cht`);

    if (!fs.existsSync(chtPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(chtPath, "utf8");
      const cheats = parseDuckStationChtFile(content);
      return cheats.map((cheat, i) => ({
        ...cheat,
        index: i,
        source: "chtdb" as CheatSource,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Look up cheats from gamehacking.org's MiSTer cheat packs.
   *
   * Matching strategy (in priority order):
   * 1. Serial match — directory name matches the formatted serial (e.g. "SLUS-00551")
   * 2. Title match — base title of directory name matches base title of ROM filename
   */
  private getCheatsFromGamehacking(
    systemId: string,
    romFilename: string,
    serial?: string,
  ): Array<CheatEntry> {
    const systemCode = GAMEHACKING_SYSTEM_CODES[systemId];
    if (!systemCode) {
      return [];
    }

    const systemDir = path.join(this.cheatsDir, "gamehacking", systemCode);
    if (!fs.existsSync(systemDir)) {
      return [];
    }

    let entries: Array<string>;
    try {
      entries = fs.readdirSync(systemDir);
    } catch {
      return [];
    }

    const romNameNoExt = path.basename(romFilename, path.extname(romFilename));
    const formattedSerial = serial ? formatSerial(serial) : undefined;
    const romBase = baseTitle(romNameNoExt);

    // Find the matching game directory
    let matchDir: string | undefined;

    for (const entry of entries) {
      const entryPath = path.join(systemDir, entry);
      try {
        if (!fs.statSync(entryPath).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // Serial match (highest priority)
      if (formattedSerial && entry.toUpperCase() === formattedSerial) {
        matchDir = entryPath;
        break;
      }

      // Title match
      if (baseTitle(entry) === romBase) {
        matchDir = entryPath;
        // Don't break — a serial match could still come
      }
    }

    if (!matchDir) {
      return [];
    }

    return this.readGgDirectory(matchDir);
  }

  /**
   * Read all .gg files from a directory and convert them to CheatEntry items.
   * Each .gg file becomes one CheatEntry with the filename stem as description
   * and all codes joined with `+`.
   */
  private readGgDirectory(dirPath: string): Array<CheatEntry> {
    let files: Array<string>;
    try {
      files = fs.readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith(".gg"));
    } catch {
      return [];
    }

    const cheats: Array<CheatEntry> = [];

    for (const file of files) {
      try {
        const buffer = fs.readFileSync(path.join(dirPath, file));
        const rawCodes = parseGgBinary(buffer);
        if (rawCodes.length === 0) {
          continue;
        }

        const gsLines = rawCodes.map(ggToGameShark);
        const description = path.basename(file, ".gg");

        cheats.push({
          index: cheats.length,
          description,
          code: gsLines.join("+"),
          enabled: false,
          source: "gamehacking" as CheatSource,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return cheats;
  }

  /**
   * Merge cheats from two sources, deduplicating by normalised code string.
   * Primary cheats take priority (they appear first and block secondary duplicates).
   */
  private mergeCheats(primary: Array<CheatEntry>, secondary: Array<CheatEntry>): Array<CheatEntry> {
    if (primary.length === 0) {
      return secondary;
    }
    if (secondary.length === 0) {
      return primary;
    }

    // Build a set of normalised codes from the primary source
    const seenCodes = new Set<string>();
    for (const cheat of primary) {
      seenCodes.add(this.normalizeCode(cheat.code));
    }

    const merged = [...primary];
    for (const cheat of secondary) {
      const norm = this.normalizeCode(cheat.code);
      if (!seenCodes.has(norm)) {
        seenCodes.add(norm);
        merged.push({ ...cheat, index: merged.length });
      }
    }

    return merged;
  }

  /** Normalise a cheat code for deduplication (lowercase, strip whitespace). */
  private normalizeCode(code: string): string {
    return code.toLowerCase().replaceAll(/\s+/g, "");
  }

  /** Whether at least one database has been downloaded (may be stale). */
  isDatabasePresent(): boolean {
    return fs.existsSync(this.metadataPath);
  }

  /** Whether the database is currently being downloaded. */
  isDownloading(): boolean {
    return this.downloading;
  }

  /** Whether a specific database source has been downloaded and is not stale. */
  private isDatabaseFresh(source: "libretro" | "chtdb" | "gamehacking"): boolean {
    if (!fs.existsSync(this.metadataPath)) {
      return false;
    }

    try {
      const raw = fs.readFileSync(this.metadataPath, "utf8");
      const metadata: CheatDatabaseMetadata = JSON.parse(raw);
      const timestampMap: Record<string, number | undefined> = {
        libretro: metadata.lastDownloaded,
        chtdb: metadata.chtdbLastDownloaded,
        gamehacking: metadata.gamehackingLastDownloaded,
      };
      const timestamp = timestampMap[source];
      if (!timestamp) {
        return false;
      }
      return Date.now() - timestamp < STALE_THRESHOLD_MS;
    } catch {
      return false;
    }
  }

  /** Read current metadata from disk, or return a fresh object. */
  private readMetadata(): CheatDatabaseMetadata {
    if (fs.existsSync(this.metadataPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.metadataPath, "utf8")) as CheatDatabaseMetadata;
      } catch {
        // Corrupt — start fresh
      }
    }
    return { lastDownloaded: 0 };
  }

  /** Persist metadata to disk. */
  private writeMetadata(metadata: CheatDatabaseMetadata): void {
    fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
  }

  /** Download the libretro-database archive and extract the cht/ directory. */
  private async downloadLibretroDatabase(): Promise<void> {
    fs.mkdirSync(this.cheatsDir, { recursive: true });

    const tarballUrl =
      "https://github.com/libretro/libretro-database/archive/refs/heads/master.tar.gz";

    this.emitProgress("downloading", 0);

    const tarballPath = path.join(this.cheatsDir, "libretro-database.tar.gz");

    try {
      await this.downloadFile(tarballUrl, tarballPath, (percent) => {
        this.emitProgress("downloading", percent);
      });

      this.emitProgress("extracting", 85);

      await this.extractTarball(tarballPath, this.cheatsDir, "*/cht/*");

      const metadata = this.readMetadata();
      metadata.lastDownloaded = Date.now();
      this.writeMetadata(metadata);

      this.emitProgress("done", 100);
    } finally {
      // Clean up tarball
      try {
        fs.unlinkSync(tarballPath);
      } catch {
        // Ignore
      }
    }
  }

  /** Download the DuckStation chtdb archive and extract cheats/. */
  private async downloadChtdb(): Promise<void> {
    fs.mkdirSync(this.cheatsDir, { recursive: true });

    const tarballUrl = "https://github.com/duckstation/chtdb/archive/refs/heads/master.tar.gz";

    const tarballPath = path.join(this.cheatsDir, "chtdb.tar.gz");
    const chtdbDir = path.join(this.cheatsDir, "chtdb");

    try {
      await this.downloadFile(tarballUrl, tarballPath, () => {
        // Progress is reported by the libretro download — chtdb is small (~2MB)
      });

      fs.mkdirSync(chtdbDir, { recursive: true });

      // Extract cheats/ directory, stripping the repo root + "cheats/" prefix
      // so files land directly in chtdb/ as "SLUS-00551.cht" etc.
      await execFileAsync("tar", [
        "xzf",
        tarballPath,
        "--strip-components=2",
        "--include=*/cheats/*",
        "-C",
        chtdbDir,
      ]);

      const metadata = this.readMetadata();
      metadata.chtdbLastDownloaded = Date.now();
      this.writeMetadata(metadata);
    } finally {
      try {
        fs.unlinkSync(tarballPath);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Download gamehacking.org MiSTer cheat packs for all configured systems.
   *
   * Flow:
   * 1. Fetch the file listing from the MiSTer endpoint
   * 2. Find the matching ZIP filename for each system (timestamped: mister_psx_YYYYMMDD.zip)
   * 3. Download and extract each ZIP
   * 4. Each outer ZIP contains per-game .zip files — extract those into per-game directories
   */
  private async downloadGamehacking(): Promise<void> {
    const ghDir = path.join(this.cheatsDir, "gamehacking");
    fs.mkdirSync(ghDir, { recursive: true });

    // Fetch the list of available ZIP files
    const listUrl = `${GAMEHACKING_BASE_URL}/?script=fetchcheats`;
    const listPath = path.join(ghDir, "index.html");

    try {
      await this.downloadFile(listUrl, listPath, () => {
        // Small request, no progress needed
      });

      const listing = fs.readFileSync(listPath, "utf8");

      for (const [systemId, systemCode] of Object.entries(GAMEHACKING_SYSTEM_CODES)) {
        // Find the matching ZIP filename (e.g. "mister_psx_20260321.zip")
        const pattern = new RegExp(`mister_${systemCode}_\\d{8}\\.zip`);
        const match = listing.match(pattern);
        if (!match) {
          continue;
        }

        const zipFilename = match[0];
        const zipUrl = `${GAMEHACKING_BASE_URL}/${zipFilename}?script=fetchcheats`;
        const zipPath = path.join(ghDir, zipFilename);
        const systemDir = path.join(ghDir, systemId);

        try {
          await this.downloadFile(zipUrl, zipPath, () => {
            // Progress is reported by the libretro download
          });

          // Clear previous data for this system and re-extract
          fs.rmSync(systemDir, { recursive: true, force: true });
          fs.mkdirSync(systemDir, { recursive: true });

          // Extract the outer ZIP
          await execFileAsync("unzip", ["-o", "-q", zipPath, "-d", systemDir]);

          // The outer ZIP contains per-game .zip files. Extract each into
          // a directory named after the game, then remove the per-game ZIP.
          await this.extractPerGameZips(systemDir);
        } finally {
          try {
            fs.unlinkSync(zipPath);
          } catch {
            // Ignore
          }
        }
      }

      const metadata = this.readMetadata();
      metadata.gamehackingLastDownloaded = Date.now();
      this.writeMetadata(metadata);
    } finally {
      try {
        fs.unlinkSync(listPath);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Extract per-game .zip files in a directory into subdirectories.
   *
   * Each `GameName.zip` is extracted into `GameName/` and the .zip is deleted.
   * This pre-extraction avoids runtime unzip calls in getCheatsFromGamehacking.
   */
  private async extractPerGameZips(systemDir: string): Promise<void> {
    const entries = fs.readdirSync(systemDir);
    const zipFiles = entries.filter((e) => e.toLowerCase().endsWith(".zip"));

    for (const zipFile of zipFiles) {
      const zipPath = path.join(systemDir, zipFile);
      const gameName = zipFile.slice(0, -4); // Strip .zip
      const gameDir = path.join(systemDir, gameName);

      try {
        fs.mkdirSync(gameDir, { recursive: true });
        await execFileAsync("unzip", ["-o", "-q", zipPath, "-d", gameDir]);
      } catch {
        // Skip games whose zip fails to extract
      }

      try {
        fs.unlinkSync(zipPath);
      } catch {
        // Ignore
      }
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
   * Extract a filtered subdirectory from a tarball.
   *
   * Uses the system `tar` command (available on macOS and Linux) to avoid
   * adding a Node tar dependency. The --include flag filters to only the
   * specified directory, and --strip-components removes the repo root prefix.
   */
  private async extractTarball(
    tarballPath: string,
    destDir: string,
    includePattern: string,
  ): Promise<void> {
    await execFileAsync("tar", [
      "xzf",
      tarballPath,
      "--strip-components=1",
      `--include=${includePattern}`,
      "-C",
      destDir,
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
