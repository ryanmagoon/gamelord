/**
 * Shared message protocol between the emulation utility process and the main process.
 *
 * The worker runs the emulation loop (native addon + libretro core) in a
 * dedicated Electron utility process. Communication is via `postMessage`.
 */

// ---------------------------------------------------------------------------
// Native addon types (duplicated here to avoid importing from Electron-
// dependent modules — the worker cannot use `electron`'s `app` module)
// ---------------------------------------------------------------------------

export interface NativeLibretroCore {
  loadCore(corePath: string): boolean
  loadGame(romPath: string): boolean
  unloadGame(): void
  run(): void
  reset(): void
  getSystemInfo(): {
    libraryName: string
    libraryVersion: string
    validExtensions: string
    needFullpath: boolean
    blockExtract: boolean
  } | null
  getAVInfo(): AVInfo | null
  getVideoFrame(): { data: Uint8Array; width: number; height: number } | null
  getAudioBuffer(): Int16Array | null
  setInputState(port: number, id: number, value: number): void
  serializeState(): Uint8Array | null
  unserializeState(data: Uint8Array): boolean
  getSerializeSize(): number
  destroy(): void
  isLoaded(): boolean
  setSystemDirectory(dir: string): void
  setSaveDirectory(dir: string): void
  getMemoryData(memType?: number): Uint8Array | null
  getMemorySize(memType?: number): number
  setMemoryData(data: Uint8Array, memType?: number): void
}

export interface NativeAddon {
  LibretroCore: new () => NativeLibretroCore
}

// ---------------------------------------------------------------------------
// AV info (geometry + timing)
// ---------------------------------------------------------------------------

export interface AVInfo {
  geometry: {
    baseWidth: number
    baseHeight: number
    maxWidth: number
    maxHeight: number
    aspectRatio: number
  }
  timing: {
    fps: number
    sampleRate: number
  }
}

// ---------------------------------------------------------------------------
// Main → Worker commands
// ---------------------------------------------------------------------------

export type WorkerCommand =
  | {
      action: 'init'
      corePath: string
      romPath: string
      systemDir: string
      saveDir: string
      sramDir: string
      saveStatesDir: string
      addonPath: string
    }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'reset' }
  | { action: 'input'; port: number; id: number; pressed: boolean }
  | { action: 'saveState'; slot: number; requestId: string }
  | { action: 'loadState'; slot: number; requestId: string }
  | { action: 'saveSram'; requestId: string }
  | { action: 'screenshot'; requestId: string; outputPath?: string }
  | { action: 'shutdown'; requestId: string }

// ---------------------------------------------------------------------------
// Worker → Main events
// ---------------------------------------------------------------------------

export type WorkerEvent =
  | { type: 'ready'; avInfo: AVInfo }
  | { type: 'videoFrame'; data: Buffer; width: number; height: number }
  | { type: 'audioSamples'; samples: Buffer; sampleRate: number }
  | { type: 'error'; message: string; fatal: boolean }
  | {
      type: 'response'
      requestId: string
      success: boolean
      error?: string
      data?: unknown
    }
