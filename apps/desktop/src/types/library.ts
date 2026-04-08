/** Where a cheat entry was sourced from. */
export type CheatSource = "libretro" | "chtdb" | "gamehacking";

/** A single cheat code parsed from a cheat database file. */
export interface CheatEntry {
  index: number;
  description: string;
  code: string;
  enabled: boolean;
  /** Which database this cheat came from. Defaults to "libretro" for backwards compat. */
  source?: CheatSource;
}

/** A user-defined cheat code not in the database. */
export interface CustomCheat {
  description: string;
  code: string;
  enabled: boolean;
}

/** Persisted cheat state for a single game. */
export interface GameCheatState {
  enabledIndices: Array<number>;
  customCheats: Array<CustomCheat>;
}

export interface GameSystem {
  corePath?: string;
  extensions: Array<string>;
  iconPath?: string;
  id: string;
  name: string;
  romsPath?: string;
  shortName: string;
}

export interface Game {
  /**
   * Timestamp (ms since epoch) when artwork sync determined no artwork is available
   * for this game. Set when ScreenScraper returns no match or no artwork URL.
   * Prevents redundant API calls on subsequent startup syncs.
   * Cleared when artwork is successfully downloaded (e.g. via force sync).
   */
  artworkNotFound?: number;
  coverArt?: string;
  /** Width / height ratio of the downloaded cover art (e.g. 0.714 for a 3:4.2 box). */
  coverArtAspectRatio?: number;
  favorite?: boolean;
  id: string;
  lastPlayed?: Date;
  metadata?: {
    developer?: string;
    publisher?: string;
    releaseDate?: string;
    genre?: string;
    description?: string;
    players?: number;
    rating?: number;
  };
  playTime?: number;
  romHashes: {
    crc32: string;
    sha1: string;
    md5: string;
  };
  /** File modification timestamp (ms since epoch) used for scan cache invalidation. */
  romMtime?: number;
  romPath: string;
  /**
   * Disc serial (e.g. "SLUS-00551") from ScreenScraper's `rom.romserial`.
   * Present for disc-based systems (PSX, Saturn) after artwork sync.
   * Used for chtdb cheat lookup when the core doesn't expose the serial at runtime.
   */
  serial?: string;
  /**
   * Region codes from the matched ROM entry in ScreenScraper (e.g. ["jp"], ["us", "eu"]).
   * Set during artwork sync from rom.regions.regions_shortname. Used to derive the
   * regional system display name (e.g. "Super Famicom" for JP SNES ROMs).
   */
  romRegions?: Array<string>;

  // ── Multi-disc grouping ──────────────────────────────────────────────

  /**
   * Shared identifier linking all discs of the same game. Derived from an .m3u
   * playlist filename or from ScreenScraper's `jeu.id` + systemId. Single-disc
   * games omit this field.
   */
  discGroup?: string;
  /** 1-indexed disc number within the group (e.g. 1, 2, 3). */
  discNumber?: number;
  /** Total number of discs in the group, when known from .m3u or metadata. */
  discTotal?: number;
  /** Absolute path to the .m3u playlist that defines this disc group, if any. */
  m3uPath?: string;
  /** Original archive path if this ROM was extracted from a .zip during scan. */
  sourceArchivePath?: string;
  system: string;
  systemId: string;
  title: string;
}

export interface LibraryConfig {
  autoScan?: boolean;
  romsBasePath?: string;
  scanRecursive?: boolean;
  systems: Array<GameSystem>;
}

export const DEFAULT_SYSTEMS: Array<GameSystem> = [
  {
    extensions: [".nes", ".fds", ".unf", ".unif"],
    id: "nes",
    name: "Nintendo Entertainment System",
    shortName: "NES",
  },
  {
    extensions: [".sfc", ".smc", ".swc", ".fig"],
    id: "snes",
    name: "Super Nintendo Entertainment System",
    shortName: "SNES",
  },
  {
    extensions: [".md", ".smd", ".gen", ".bin"],
    id: "genesis",
    name: "Sega Genesis",
    shortName: "Genesis",
  },
  {
    extensions: [".gb", ".sgb"],
    id: "gb",
    name: "Game Boy",
    shortName: "GB",
  },
  {
    extensions: [".gbc"],
    id: "gbc",
    name: "Game Boy Color",
    shortName: "GBC",
  },
  {
    extensions: [".gba", ".agb"],
    id: "gba",
    name: "Game Boy Advance",
    shortName: "GBA",
  },
  {
    extensions: [".n64", ".z64", ".v64"],
    id: "n64",
    name: "Nintendo 64",
    shortName: "N64",
  },
  {
    extensions: [".cue", ".bin", ".iso", ".chd", ".pbp", ".m3u"],
    id: "psx",
    name: "PlayStation",
    shortName: "PS1",
  },
  {
    extensions: [".iso", ".cso", ".pbp"],
    id: "psp",
    name: "PlayStation Portable",
    shortName: "PSP",
  },
  {
    extensions: [".nds", ".dsi", ".ids"],
    id: "nds",
    name: "Nintendo DS",
    shortName: "NDS",
  },
  {
    extensions: [".cue", ".chd", ".ccd", ".mdf", ".m3u"],
    id: "saturn",
    name: "Sega Saturn",
    shortName: "Saturn",
  },
  {
    extensions: [".zip", ".7z"],
    id: "arcade",
    name: "Arcade",
    shortName: "Arcade",
  },
];

/**
 * Regional display-name variants for systems with meaningful regional splits.
 * Maps systemId → ScreenScraper region code → display name.
 * Systems not listed here have no regional variants and keep their default name.
 */
export const REGIONAL_SYSTEM_NAMES: Record<string, Record<string, string>> = {
  genesis: {
    us: "Genesis",
    eu: "Mega Drive",
    wor: "Genesis",
    jp: "Mega Drive",
    ss: "Genesis",
  },
  nes: {
    us: "NES",
    eu: "NES",
    wor: "NES",
    jp: "Famicom",
    ss: "NES",
  },
  snes: {
    us: "SNES",
    eu: "SNES",
    wor: "SNES",
    jp: "Super Famicom",
    ss: "SNES",
  },
};

/** Look up the regional system display name for a given system and region. */
export function getRegionalSystemName(
  systemId: string,
  region: string | undefined,
): string | undefined {
  if (!region) {
    return undefined;
  }
  return REGIONAL_SYSTEM_NAMES[systemId]?.[region];
}
