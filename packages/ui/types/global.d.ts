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
  // These exist in the desktop preload, included here for compatibility when
  // UI package is built/typed within the monorepo. Keep them broad to avoid
  // cross-package type imports.
  library?: {
    getSystems: () => Promise<any[]>
    addSystem: (system: any) => Promise<any>
    removeSystem: (systemId: string) => Promise<any>
    updateSystemPath: (systemId: string, romsPath: string) => Promise<any>
    getGames: (systemId?: string) => Promise<any[]>
    addGame: (romPath: string, systemId: string) => Promise<any>
    removeGame: (gameId: string) => Promise<any>
    updateGame: (gameId: string, updates: any) => Promise<any>
    scanDirectory: (directoryPath: string, systemId?: string) => Promise<any[]>
    scanSystemFolders: () => Promise<any>
    getConfig: () => Promise<any>
    setRomsBasePath: (basePath: string) => Promise<any>
  }
  dialog?: {
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
