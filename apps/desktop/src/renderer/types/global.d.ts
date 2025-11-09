import type { GameSystem, Game, LibraryConfig } from '../../types/library'

export interface GamelordAPI {
  core: {
    load: (
      options: CoreOptions
    ) => Promise<{ success: boolean; error?: string }>
    unload: () => Promise<{ success: boolean; error?: string }>
  }
  emulation: {
    pause: () => Promise<{ success: boolean }>
    resume: () => Promise<{ success: boolean }>
  }
  saveState: {
    save: (slot: number) => Promise<{ success: boolean }>
    load: (slot: number) => Promise<{ success: boolean }>
  }
  input: {
    sendButton: (playerId: number, button: string, pressed: boolean) => void
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

  // Dialog helpers (matches preload API)
  dialog: {
    selectDirectory: () => Promise<string | null>
    selectRomFile: (systemId: string) => Promise<string | null>
  }
  on: (channel: string, callback: (...args: any[]) => void) => void
  removeAllListeners: (channel: string) => void
}

export interface CoreOptions {
  corePath: string
  romPath: string
  saveStatePath?: string
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
