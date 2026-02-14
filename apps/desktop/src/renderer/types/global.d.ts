import type { GameSystem, Game, LibraryConfig } from '../../types/library'

export interface CoreInfo {
  name: string
  displayName: string
  description: string
  installed: boolean
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
    ) => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<{ success: boolean; error?: string }>
    getAvailable: () => Promise<any>
    isRunning: () => Promise<boolean>
    getCoresForSystem: (systemId: string) => Promise<CoreInfo[]>
    downloadCore: (
      coreName: string,
      systemId: string,
    ) => Promise<{ success: boolean; corePath?: string; error?: string }>
  }
  emulation: {
    pause: () => Promise<{ success: boolean }>
    resume: () => Promise<{ success: boolean }>
    reset: () => Promise<{ success: boolean; error?: string }>
    screenshot: (
      outputPath?: string,
    ) => Promise<{ success: boolean; path?: string; error?: string }>
  }
  saveState: {
    save: (slot: number) => Promise<{ success: boolean }>
    load: (slot: number) => Promise<{ success: boolean }>
  }
  // Library management (matches preload API)
  library: {
    getSystems: () => Promise<GameSystem[]>
    addSystem: (system: GameSystem) => Promise<any>
    removeSystem: (systemId: string) => Promise<any>
    updateSystemPath: (systemId: string, romsPath: string) => Promise<any>

    getGames: (systemId?: string) => Promise<Game[]>
    addGame: (romPath: string, systemId: string) => Promise<Game | null>
    removeGame: (gameId: string) => Promise<any>
    updateGame: (gameId: string, updates: Partial<Game>) => Promise<any>

    scanDirectory: (directoryPath: string, systemId?: string) => Promise<Game[]>
    scanSystemFolders: () => Promise<any>

    getConfig: () => Promise<LibraryConfig>
    setRomsBasePath: (basePath: string) => Promise<any>
  }

  // Artwork & metadata
  artwork: {
    syncGame: (gameId: string) => Promise<{ success: boolean; error?: string }>
    syncAll: () => Promise<{ success: boolean; error?: string }>
    syncGames: (gameIds: string[]) => Promise<{ success: boolean; error?: string }>
    cancelSync: () => Promise<{ success: boolean }>
    getSyncStatus: () => Promise<{ inProgress: boolean }>
    getCredentials: () => Promise<{ hasCredentials: boolean }>
    setCredentials: (userId: string, userPassword: string) => Promise<{ success: boolean; error?: string; errorCode?: string }>
    clearCredentials: () => Promise<{ success: boolean; error?: string }>
  }

  // Dialog helpers (matches preload API)
  dialog: {
    selectDirectory: () => Promise<string | null>
    selectRomFile: (systemId: string) => Promise<string | null>
    respondResumeGame: (requestId: string, shouldResume: boolean) => void
  }

  // Game window controls
  gameWindow: {
    minimize: () => void
    maximize: () => void
    close: () => void
    toggleFullscreen: () => void
    setClickThrough: (value: boolean) => void
    setTrafficLightVisible: (visible: boolean) => void
    readyToClose: () => void
  }

  // Game input (native mode)
  gameInput: (port: number, id: number, pressed: boolean) => void

  on: (channel: string, callback: (...args: any[]) => void) => void
  removeAllListeners: (channel: string) => void
}

export interface VideoFrame {
  data: ArrayBuffer
  width: number
  height: number
  timestamp: number
}

export interface AudioSamples {
  samples: Float32Array
  sampleRate: number
  timestamp: number
}

declare global {
  interface Window {
    gamelord: GamelordAPI
  }
}
