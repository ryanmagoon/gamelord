/** ScreenScraper system IDs mapped from GameLord system IDs. */
export const SYSTEM_ID_MAP: Record<string, number> = {
  arcade: 75,
  gb: 9,
  gbc: 10,
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
  | "auth-failed"
  | "config-error"
  | "rate-limited"
  | "timeout"
  | "network-error"
  | "hash-failed"
  | "not-found";

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
  phase: "hashing" | "querying" | "downloading" | "done" | "not-found" | "error";
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
  /**
   * ScreenScraper's game-level ID (`jeu.id`). Shared across all discs of the
   * same title — use as the basis for `discGroup` when grouping multi-disc games.
   * Only present for hash-based lookups (jeuInfos endpoint).
   */
  gameId?: string;
  genre?: string;
  /**
   * 1-indexed disc number from `jeu.rom.discnum`. Present only when ScreenScraper
   * identifies the ROM as a specific disc of a multi-disc game.
   */
  discNumber?: number;
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
  /**
   * Region codes from the matched ROM entry (e.g., ['jp'], ['us', 'eu']).
   * More accurate than `region` (which comes from the title preference order)
   * because it reflects the actual release regions of the specific ROM dump.
   * Only present for hash-based lookups where ScreenScraper matches a known ROM.
   */
  romRegions?: Array<string>;
  /**
   * Disc serial from the matched ROM entry (e.g. "SLUS-00551").
   * Present for disc-based systems (PSX, Saturn, etc.) when ScreenScraper
   * has the serial for the matched ROM dump.
   */
  romSerial?: string;
  releaseDate?: string;
  synopsis?: string;
  title: string;
}

export interface ArtworkConfig {
  /** User dismissed the credential setup prompt ("don't ask again"). */
  credentialPromptDismissed?: boolean;
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
