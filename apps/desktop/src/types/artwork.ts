/** ScreenScraper system IDs mapped from GameLord system IDs. */
export const SYSTEM_ID_MAP: Record<string, number> = {
  nes: 3,
  snes: 4,
  genesis: 1,
  gb: 9,
  gba: 12,
  n64: 14,
  psx: 57,
  psp: 61,
  nds: 15,
  arcade: 75,
};

export interface ScreenScraperCredentials {
  devId: string;
  devPassword: string;
  userId: string;
  userPassword: string;
}

export type ArtworkErrorCode =
  | 'auth-failed'
  | 'rate-limited'
  | 'timeout'
  | 'network-error'
  | 'hash-failed'
  | 'not-found';

export interface ArtworkProgress {
  gameId: string;
  gameTitle: string;
  phase: 'hashing' | 'querying' | 'downloading' | 'done' | 'not-found' | 'error';
  current: number;
  total: number;
  error?: string;
  errorCode?: ArtworkErrorCode;
  /** The artwork:// URL for the downloaded cover art. Present when phase is 'done'. */
  coverArt?: string;
}

export interface ArtworkSyncStatus {
  inProgress: boolean;
  processed: number;
  total: number;
  found: number;
  notFound: number;
  errors: number;
}

export interface ScreenScraperGameInfo {
  title: string;
  synopsis?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  players?: number;
  rating?: number;
  releaseDate?: string;
  media: {
    boxArt2d?: string;
    boxArt3d?: string;
    screenshot?: string;
    fanart?: string;
  };
}

export interface ArtworkConfig {
  screenscraper?: {
    userId: string;
    userPassword: string;
  };
  preferences?: {
    autoSyncOnScan: boolean;
    preferredRegion: string;
    preferredMediaType: string;
  };
}
