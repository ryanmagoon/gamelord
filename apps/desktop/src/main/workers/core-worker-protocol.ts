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
  loadCore(corePath: string): boolean;
  loadGame(romPath: string): boolean;
  unloadGame(): void;
  run(): void;
  reset(): void;
  getSystemInfo(): {
    libraryName: string;
    libraryVersion: string;
    validExtensions: string;
    needFullpath: boolean;
    blockExtract: boolean;
  } | null;
  getAVInfo(): AVInfo | null;
  getVideoFrame(): { data: Uint8Array; width: number; height: number } | null;
  getAudioBuffer(): Int16Array | null;
  setInputState(port: number, id: number, value: number): void;
  serializeState(): Uint8Array | null;
  unserializeState(data: Uint8Array): boolean;
  getSerializeSize(): number;
  destroy(): void;
  isLoaded(): boolean;
  setSystemDirectory(dir: string): void;
  setSaveDirectory(dir: string): void;
  getMemoryData(memType?: number): Uint8Array | null;
  getMemorySize(memType?: number): number;
  setMemoryData(data: Uint8Array, memType?: number): void;
  getLogMessages(): Array<{ level: number; message: string }>;
  getCoreOptions(): Record<string, string>;
  setCoreOption(key: string, value: string): boolean;
  cheatReset(): void;
  cheatSet(index: number, enabled: boolean, code: string): void;
  setDiscPaths(paths: Array<string>): void;
  swapDisc(index: number): boolean;
  getCurrentDiscIndex(): number;
  getDiscCount(): number;
  getDiscLabel(index?: number): string | null;
}

export interface NativeAddon {
  LibretroCore: new () => NativeLibretroCore;
}

// ---------------------------------------------------------------------------
// AV info (geometry + timing)
// ---------------------------------------------------------------------------

export interface AVInfo {
  geometry: {
    baseWidth: number;
    baseHeight: number;
    maxWidth: number;
    maxHeight: number;
    aspectRatio: number;
  };
  timing: {
    fps: number;
    sampleRate: number;
  };
}

// ---------------------------------------------------------------------------
// Main → Worker commands
// ---------------------------------------------------------------------------

export type WorkerCommand =
  | {
      action: "init";
      corePath: string;
      romPath: string;
      systemDir: string;
      saveDir: string;
      sramDir: string;
      saveStatesDir: string;
      addonPath: string;
    }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "reset" }
  | { action: "input"; port: number; id: number; pressed: boolean }
  | { action: "saveState"; slot: number; requestId: string }
  | { action: "loadState"; slot: number; requestId: string }
  | { action: "saveSram"; requestId: string }
  | { action: "screenshot"; requestId: string; outputPath?: string }
  | { action: "setSpeed"; multiplier: number }
  | { action: "setFastForwardAudio"; enabled: boolean }
  | { action: "shutdown"; requestId: string }
  | {
      action: "setupSharedBuffers";
      controlSAB: SharedArrayBuffer;
      videoSAB: SharedArrayBuffer;
      audioSAB: SharedArrayBuffer;
      videoBufferSize: number;
    }
  | { action: "cheatReset"; requestId: string }
  | {
      action: "cheatSet";
      index: number;
      enabled: boolean;
      code: string;
      requestId: string;
    };

// ---------------------------------------------------------------------------
// Libretro log levels (from libretro.h RETRO_LOG_*)
// ---------------------------------------------------------------------------

export const RETRO_LOG_DEBUG = 0;
export const RETRO_LOG_INFO = 1;
export const RETRO_LOG_WARN = 2;
export const RETRO_LOG_ERROR = 3;

/**
 * Minimum log level to forward over IPC. Debug-level messages are dropped
 * because cores like mGBA emit thousands of DMA/IRQ trace messages per
 * second at that level, which saturates the IPC channel and throttles the
 * main process event loop.
 */
export const MIN_FORWARD_LOG_LEVEL = RETRO_LOG_INFO;

/**
 * Filter native log entries to only those worth forwarding over IPC.
 * Returns a new array (empty if nothing passes the filter).
 */
export function filterForwardableLogs(
  entries: ReadonlyArray<{ level: number; message: string }>,
): Array<{ level: number; message: string }> {
  return entries.filter((entry) => entry.level >= MIN_FORWARD_LOG_LEVEL);
}

/**
 * Extract a CD-ROM serial from a core log message.
 *
 * Different PSX cores log the serial in different formats:
 * - Beetle PSX / PCSX ReARMed: `CD-ROM ID: SLUS00551`
 * - SwanStation: `Inserted media from /path (SLUS-00551, Game Title)`
 *
 * Returns the raw serial string if found, or null.
 */
export function extractSerialFromLog(message: string): string | null {
  // Beetle PSX / PCSX ReARMed format
  const cdromMatch = message.match(/CD-ROM ID:\s*([A-Za-z]{4}-?\d{5})/);
  if (cdromMatch) {
    return cdromMatch[1];
  }

  // SwanStation format: "Inserted media from /path (SLUS-00551, Title)"
  const swanMatch = message.match(/Inserted media from .+\(([A-Za-z]{4}-\d{5}),/);
  if (swanMatch) {
    return swanMatch[1];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Worker → Main events
// ---------------------------------------------------------------------------

export type WorkerEvent =
  | { type: "ready"; avInfo: AVInfo }
  | { type: "videoFrame"; data: Buffer; width: number; height: number }
  | { type: "audioSamples"; samples: Buffer; sampleRate: number }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "log"; level: number; message: string }
  | { type: "speedChanged"; multiplier: number }
  | { type: "serialDetected"; serial: string }
  | {
      type: "response";
      requestId: string;
      success: boolean;
      error?: string;
      data?: unknown;
    };
