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
    id: 'arcade',
    name: 'Arcade',
    shortName: 'Arcade',
    extensions: ['.zip', '.7z'],
  },
];