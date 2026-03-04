export interface GameSystem {
  id: string;
  name: string;
  shortName: string;
  extensions: string[];
  corePath?: string;
  iconPath?: string;
  romsPath?: string;
}

export interface Game {
  id: string;
  title: string;
  system: string;
  systemId: string;
  romPath: string;
  /** File modification timestamp (ms since epoch) used for scan cache invalidation. */
  romMtime?: number;
  /** Original archive path if this ROM was extracted from a .zip during scan. */
  sourceArchivePath?: string;
  coverArt?: string;
  /** Width / height ratio of the downloaded cover art (e.g. 0.714 for a 3:4.2 box). */
  coverArtAspectRatio?: number;
  romHashes: {
    crc32: string;
    sha1: string;
    md5: string;
  };
  lastPlayed?: Date;
  playTime?: number;
  favorite?: boolean;
  metadata?: {
    developer?: string;
    publisher?: string;
    releaseDate?: string;
    genre?: string;
    description?: string;
    players?: number;
    rating?: number;
  };
}

export interface LibraryConfig {
  systems: GameSystem[];
  romsBasePath?: string;
  scanRecursive?: boolean;
  autoScan?: boolean;
}

export const DEFAULT_SYSTEMS: GameSystem[] = [
  {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    shortName: 'NES',
    extensions: ['.nes', '.fds', '.unf', '.unif'],
  },
  {
    id: 'snes',
    name: 'Super Nintendo Entertainment System',
    shortName: 'SNES',
    extensions: ['.sfc', '.smc', '.swc', '.fig'],
  },
  {
    id: 'genesis',
    name: 'Sega Genesis',
    shortName: 'Genesis',
    extensions: ['.md', '.smd', '.gen', '.bin'],
  },
  {
    id: 'gb',
    name: 'Game Boy',
    shortName: 'GB',
    extensions: ['.gb', '.gbc', '.sgb'],
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    shortName: 'GBA',
    extensions: ['.gba', '.agb'],
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    shortName: 'N64',
    extensions: ['.n64', '.z64', '.v64'],
  },
  {
    id: 'psx',
    name: 'PlayStation',
    shortName: 'PS1',
    extensions: ['.cue', '.bin', '.iso', '.chd', '.pbp'],
  },
  {
    id: 'psp',
    name: 'PlayStation Portable',
    shortName: 'PSP',
    extensions: ['.iso', '.cso', '.pbp'],
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    shortName: 'NDS',
    extensions: ['.nds', '.dsi', '.ids'],
  },
  {
    id: 'saturn',
    name: 'Sega Saturn',
    shortName: 'Saturn',
    extensions: ['.cue', '.chd', '.ccd', '.mdf'],
  },
  {
    id: 'arcade',
    name: 'Arcade',
    shortName: 'Arcade',
    extensions: ['.zip', '.7z'],
  },
];

/**
 * Regional display-name variants for systems with meaningful regional splits.
 * Maps systemId → ScreenScraper region code → display name.
 * Systems not listed here have no regional variants and keep their default name.
 */
export const REGIONAL_SYSTEM_NAMES: Record<string, Record<string, string>> = {
  nes: {
    us: 'NES',
    eu: 'NES',
    wor: 'NES',
    jp: 'Famicom',
    ss: 'NES',
  },
  snes: {
    us: 'SNES',
    eu: 'SNES',
    wor: 'SNES',
    jp: 'Super Famicom',
    ss: 'SNES',
  },
  genesis: {
    us: 'Genesis',
    eu: 'Mega Drive',
    wor: 'Genesis',
    jp: 'Mega Drive',
    ss: 'Genesis',
  },
};

/** Look up the regional system display name for a given system and region. */
export function getRegionalSystemName(
  systemId: string,
  region: string | undefined,
): string | undefined {
  if (!region) return undefined;
  return REGIONAL_SYSTEM_NAMES[systemId]?.[region];
}