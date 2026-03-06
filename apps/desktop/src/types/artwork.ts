/** ScreenScraper system IDs mapped from GameLord system IDs. */
export const SYSTEM_ID_MAP: Record<string, number> = {
  arcade: 75,
  gb: 9,
  gba: 12,
  genesis: 1,
  n64: 14,
  nds: 15,
  nes: 3,
  psp: 61,
  psx: 57,
  saturn: 22,
  snes: 4,
};

export interface ScreenScraperCredentials {
  devId: string;
  devPassword: string;
  userId: string;
  userPassword: string;
}

export type ArtworkErrorCode =
  | 'auth-failed'
  | 'config-error'
  | 'rate-limited'
  | 'timeout'
  | 'network-error'
  | 'hash-failed'
  | 'not-found';

export interface ArtworkProgress {
  /** The artwork:// URL for the downloaded cover art. Present when phase is 'done'. */
  coverArt?: string;
  /** Width/height ratio of the downloaded artwork. Present when phase is 'done'. */
  coverArtAspectRatio?: number;
  current: number;
  error?: string;
  errorCode?: ArtworkErrorCode;
  gameId: string;
  gameTitle: string;
  phase: 'hashing' | 'querying' | 'downloading' | 'done' | 'not-found' | 'error';
  total: number;
}

export interface ArtworkSyncStatus {
  errors: number;
  found: number;
  inProgress: boolean;
  notFound: number;
  processed: number;
  total: number;
}

export interface ScreenScraperGameInfo {
  developer?: string;
  genre?: string;
  media: {
    boxArt2d?: string;
    boxArt3d?: string;
    screenshot?: string;
    fanart?: string;
  };
  players?: number;
  publisher?: string;
  rating?: number;
  /** ScreenScraper region code for the matched title (e.g., 'us', 'jp', 'eu'). */
  region?: string;
  releaseDate?: string;
  synopsis?: string;
  title: string;
}

export interface ArtworkConfig {
  preferences?: {
    autoSyncOnScan: boolean;
    preferredRegion: string;
    preferredMediaType: string;
  };
  screenscraper?: {
    userId: string;
    userPassword: string;
  };
}
