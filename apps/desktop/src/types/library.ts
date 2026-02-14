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
  coverArt?: string;
  /** Width / height ratio of the downloaded cover art (e.g. 0.714 for a 3:4.2 box). */
  coverArtAspectRatio?: number;
  romHashes?: {
    md5?: string;
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
    extensions: ['.nes', '.fds', '.unf', '.unif', '.zip', '.7z'],
  },
  {
    id: 'snes',
    name: 'Super Nintendo Entertainment System',
    shortName: 'SNES',
    extensions: ['.sfc', '.smc', '.swc', '.fig', '.zip', '.7z'],
  },
  {
    id: 'genesis',
    name: 'Sega Genesis',
    shortName: 'Genesis',
    extensions: ['.md', '.smd', '.gen', '.bin', '.zip', '.7z'],
  },
  {
    id: 'gb',
    name: 'Game Boy',
    shortName: 'GB',
    extensions: ['.gb', '.gbc', '.sgb', '.zip', '.7z'],
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    shortName: 'GBA',
    extensions: ['.gba', '.agb', '.zip', '.7z'],
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    shortName: 'N64',
    extensions: ['.n64', '.z64', '.v64', '.zip', '.7z'],
  },
  {
    id: 'psx',
    name: 'PlayStation',
    shortName: 'PS1',
    extensions: ['.cue', '.bin', '.iso', '.chd', '.pbp', '.zip', '.7z'],
  },
  {
    id: 'psp',
    name: 'PlayStation Portable',
    shortName: 'PSP',
    extensions: ['.iso', '.cso', '.pbp', '.zip', '.7z'],
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    shortName: 'NDS',
    extensions: ['.nds', '.dsi', '.ids', '.zip', '.7z'],
  },
  {
    id: 'arcade',
    name: 'Arcade',
    shortName: 'Arcade',
    extensions: ['.zip', '.7z'],
  },
];