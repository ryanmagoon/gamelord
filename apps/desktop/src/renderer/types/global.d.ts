import type {
  GameSystem,
  Game,
  LibraryConfig,
  CheatEntry,
  GameCheatState,
} from "../../types/library";

export interface SaveStateMetadata {
  slot: number;
  createdAt: string;
  coreName: string;
  coreVersion: string;
  playTimeSeconds: number | null;
  romName: string;
  stateSize: number;
}

export interface CoreInfo {
  name: string;
  displayName: string;
  description: string;
  installed: boolean;
}

export interface GamelordAPI {
  // Emulator management (matches preload API)
  emulator: {
    launch: (
      romPath: string,
      systemId: string,
      emulatorId?: string,
      coreName?: string,
      cardBounds?: { x: number; y: number; width: number; height: number },
    ) => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean; error?: string }>;
    getAvailable: () => Promise<Array<unknown>>;
    isRunning: () => Promise<boolean>;
    getCoresForSystem: (systemId: string) => Promise<Array<CoreInfo>>;
    downloadCore: (
      coreName: string,
      systemId: string,
    ) => Promise<{ success: boolean; corePath?: string; error?: string }>;
  };
  emulation: {
    pause: () => Promise<{ success: boolean }>;
    resume: () => Promise<{ success: boolean }>;
    reset: () => Promise<{ success: boolean; error?: string }>;
    screenshot: (
      outputPath?: string,
    ) => Promise<{ success: boolean; path?: string; error?: string }>;
    setSpeed: (multiplier: number) => Promise<{ success: boolean; error?: string }>;
    setFastForwardAudio: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
    swapDisc: (index: number) => Promise<{ success: boolean; error?: string }>;
  };
  saveState: {
    save: (slot: number) => Promise<{ success: boolean; error?: string }>;
    load: (slot: number) => Promise<{ success: boolean; error?: string }>;
    list: () => Promise<{
      success: boolean;
      states: Array<SaveStateMetadata>;
      error?: string;
    }>;
  };
  cheats: {
    listForGame: (
      systemId: string,
      romFilename: string,
    ) => Promise<{ success: boolean; cheats: Array<CheatEntry>; error?: string }>;
    databaseStatus: () => Promise<{ present: boolean; downloading: boolean }>;
    downloadDatabase: () => Promise<{ success: boolean; error?: string }>;
    set: (
      index: number,
      enabled: boolean,
      code: string,
    ) => Promise<{ success: boolean; error?: string }>;
    reset: () => Promise<{ success: boolean; error?: string }>;
    getGameState: (
      gameId: string,
    ) => Promise<{ success: boolean; state: GameCheatState | null; error?: string }>;
    toggleCheat: (
      gameId: string,
      index: number,
      enabled: boolean,
    ) => Promise<{ success: boolean; error?: string }>;
    toggleCustomCheat: (
      gameId: string,
      customIndex: number,
      enabled: boolean,
    ) => Promise<{ success: boolean; error?: string }>;
    addCustomCheat: (
      gameId: string,
      description: string,
      code: string,
    ) => Promise<{ success: boolean; error?: string }>;
    removeCustomCheat: (
      gameId: string,
      customIndex: number,
    ) => Promise<{ success: boolean; error?: string }>;
  };
  // Library management (matches preload API)
  library: {
    getSystems: () => Promise<Array<GameSystem>>;
    addSystem: (system: GameSystem) => Promise<{ success: boolean }>;
    removeSystem: (systemId: string) => Promise<{ success: boolean }>;
    updateSystemPath: (systemId: string, romsPath: string) => Promise<{ success: boolean }>;

    getGames: (systemId?: string) => Promise<Array<Game>>;
    addGame: (romPath: string, systemId: string) => Promise<Game | null>;
    removeGame: (gameId: string) => Promise<{ success: boolean }>;
    updateGame: (gameId: string, updates: Partial<Game>) => Promise<{ success: boolean }>;

    scanDirectory: (directoryPath: string, systemId?: string) => Promise<Array<Game>>;
    scanSystemFolders: () => Promise<Array<Game>>;

    getConfig: () => Promise<LibraryConfig>;
    setRomsBasePath: (basePath: string) => Promise<{ success: boolean }>;
    isHomebrewDone: () => Promise<boolean>;
  };

  // Artwork & metadata
  artwork: {
    syncGame: (gameId: string) => Promise<{ success: boolean; error?: string }>;
    syncAll: () => Promise<{ success: boolean; error?: string }>;
    syncGames: (gameIds: Array<string>) => Promise<{ success: boolean; error?: string }>;
    cancelSync: () => Promise<{ success: boolean }>;
    pause: () => Promise<{ success: boolean }>;
    resume: () => Promise<{ success: boolean }>;
    getSyncStatus: () => Promise<{ inProgress: boolean; paused: boolean }>;
    getCredentials: () => Promise<{ hasCredentials: boolean }>;
    setCredentials: (
      userId: string,
      userPassword: string,
    ) => Promise<{ success: boolean; error?: string; errorCode?: string }>;
    clearCredentials: () => Promise<{ success: boolean; error?: string }>;
    isCredentialPromptDismissed: () => Promise<boolean>;
    dismissCredentialPrompt: () => Promise<{ success: boolean }>;
  };

  // Auto-updates
  updates: {
    checkNow: () => Promise<void>;
    quitAndInstall: () => Promise<void>;
  };

  // Dialog helpers (matches preload API)
  dialog: {
    selectDirectory: () => Promise<string | null>;
    selectRomFile: (systemId: string) => Promise<string | null>;
    respondResumeGame: (
      requestId: string,
      response: { action: "resume" | "start-fresh" | "cancel"; remember: boolean },
    ) => void;
    respondDisambiguate: (
      requestId: string,
      resolved: Array<{ fullPath: string; systemId: string; mtimeMs: number }>,
    ) => void;
  };

  // Game window controls
  gameWindow: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    toggleFullscreen: () => void;
    setClickThrough: (value: boolean) => void;
    setTrafficLightVisible: (visible: boolean) => void;
    readyToClose: () => void;
  };

  // Platform info for conditional UI (e.g. window controls on non-macOS)
  platform: "darwin" | "win32" | "linux";

  // Game input (native mode)
  gameInput: (port: number, id: number, pressed: boolean) => void;

  // SharedArrayBuffer delivery via MessagePort bridge
  framePort: {
    onMessage: (callback: (data: unknown) => void) => void;
  };

  // Signal to the main process that the renderer has loaded and is ready to show.
  contentReady: () => void;

  on: (channel: string, callback: (...args: Array<unknown>) => void) => void;
  removeAllListeners: (channel: string) => void;
}

export interface VideoFrame {
  data: ArrayBuffer | Uint8Array;
  width: number;
  height: number;
  timestamp?: number;
}

export interface AudioSamples {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
}

declare global {
  const __DEV_GIT_BRANCH__: string | null;
  const __DEV_WORKTREE_NAME__: string | null;
  const __DEV_WORKTREE_PATH__: string | null;

  interface Window {
    gamelord: GamelordAPI;
  }
}
