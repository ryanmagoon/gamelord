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
  destroy(): void
  getAudioBuffer(): Int16Array | null
  getAVInfo(): AVInfo | null
  getCoreOptions(): Record<string, string>
  getLogMessages(): Array<{ level: number; message: string }>
  getMemoryData(memType?: number): Uint8Array | null
  getMemorySize(memType?: number): number
  getSerializeSize(): number
  getSystemInfo(): {
    libraryName: string
    libraryVersion: string
    validExtensions: string
    needFullpath: boolean
    blockExtract: boolean
  } | null
  getVideoFrame(): { data: Uint8Array; width: number; height: number } | null
  isLoaded(): boolean
  loadCore(corePath: string): boolean
  loadGame(romPath: string): boolean
  reset(): void
  run(): void
  serializeState(): Uint8Array | null
  setCoreOption(key: string, value: string): boolean
  setInputState(port: number, id: number, value: number): void
  setMemoryData(data: Uint8Array, memType?: number): void
  setSaveDirectory(dir: string): void
  setSystemDirectory(dir: string): void
  unloadGame(): void
  unserializeState(data: Uint8Array): boolean
}

export interface NativeAddon {
  LibretroCore: new () => NativeLibretroCore
}

// ---------------------------------------------------------------------------
// AV info (geometry + timing)
// ---------------------------------------------------------------------------

export interface AVInfo {
  geometry: {
    aspectRatio: number
    baseHeight: number
    baseWidth: number
    maxHeight: number
    maxWidth: number
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
      addonPath: string
      corePath: string
      romPath: string
      saveDir: string
      saveStatesDir: string
      sramDir: string
      systemDir: string
    }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'reset' }
  | { action: 'input'; id: number; port: number; pressed: boolean }
  | { action: 'saveState'; requestId: string; slot: number; }
  | { action: 'loadState'; requestId: string; slot: number; }
  | { action: 'saveSram'; requestId: string }
  | { action: 'screenshot'; outputPath?: string; requestId: string; }
  | { action: 'setSpeed'; multiplier: number }
  | { action: 'setFastForwardAudio'; enabled: boolean }
  | { action: 'shutdown'; requestId: string }
  | {
      action: 'setupSharedBuffers'
      audioSAB: SharedArrayBuffer
      controlSAB: SharedArrayBuffer
      videoBufferSize: number
      videoSAB: SharedArrayBuffer
    }

// ---------------------------------------------------------------------------
// Worker → Main events
// ---------------------------------------------------------------------------

export type WorkerEvent =
  | { avInfo: AVInfo; type: 'ready'; }
  | { data: Buffer; height: number; type: 'videoFrame'; width: number; }
  | { sampleRate: number; samples: Buffer; type: 'audioSamples'; }
  | { fatal: boolean; message: string; type: 'error'; }
  | { level: number; message: string; type: 'log'; }
  | { multiplier: number; type: 'speedChanged'; }
  | {
      data?: unknown
      error?: string
      requestId: string
      success: boolean
      type: 'response'
    }
