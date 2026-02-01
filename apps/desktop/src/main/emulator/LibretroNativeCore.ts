import { EventEmitter } from 'events'
import { EmulatorCore, EmulatorLaunchOptions } from './EmulatorCore'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

/**
 * Native addon type declarations for the libretro_native module.
 */
interface NativeLibretroCore {
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
  getAVInfo(): {
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
  } | null
  getVideoFrame(): {
    data: Uint8Array
    width: number
    height: number
  } | null
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

interface NativeAddon {
  LibretroCore: new () => NativeLibretroCore
}

/**
 * Loads the native addon, trying both development and packaged paths.
 */
function loadNativeAddon(): NativeAddon {
  const possiblePaths = [
    // Development: node-gyp build output
    path.join(__dirname, '../../native/build/Release/gamelord_libretro.node'),
    // Packaged: alongside the app
    path.join(process.resourcesPath || '', 'native/gamelord_libretro.node'),
    // Fallback: relative to app root
    path.join(app.getAppPath(), 'native/build/Release/gamelord_libretro.node'),
  ]

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return require(p) as NativeAddon
      }
    } catch {
      // Try next path
    }
  }

  throw new Error(
    'Failed to load libretro native addon. Searched:\n' +
    possiblePaths.join('\n')
  )
}

/**
 * EmulatorCore implementation that loads libretro cores directly via a native
 * Node addon, rendering frames into a buffer that the renderer can display.
 *
 * This replaces the RetroArchCore approach of spawning an external process.
 */
export class LibretroNativeCore extends EmulatorCore {
  private native: NativeLibretroCore | null = null
  private addon: NativeAddon | null = null
  private emulationTimer: ReturnType<typeof setTimeout> | null = null
  private emulationRunning = false
  private paused = false
  private avInfo: ReturnType<NativeLibretroCore['getAVInfo']> = null
  private saveStatesDir: string
  private sramDir: string

  constructor(
    private readonly coresBasePath: string,
  ) {
    super('LibretroNative', coresBasePath)
    this.saveStatesDir = path.join(app.getPath('userData'), 'savestates')
    this.sramDir = path.join(app.getPath('userData'), 'saves')
    fs.mkdirSync(this.saveStatesDir, { recursive: true })
    fs.mkdirSync(this.sramDir, { recursive: true })
  }

  async launch(romPath: string, options: EmulatorLaunchOptions = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error('Emulator is already running')
    }

    const corePath = options.corePath
    if (!corePath) {
      throw new Error('Core path is required')
    }

    this.romPath = romPath

    // Load addon
    if (!this.addon) {
      this.addon = loadNativeAddon()
    }

    this.native = new this.addon.LibretroCore()

    // Set directories
    const systemDir = path.dirname(corePath)
    const saveDir = path.join(app.getPath('userData'), 'saves')
    fs.mkdirSync(saveDir, { recursive: true })

    this.native.setSystemDirectory(systemDir)
    this.native.setSaveDirectory(saveDir)

    // Load core
    if (!this.native.loadCore(corePath)) {
      this.cleanup()
      throw new Error('Failed to load core: ' + corePath)
    }

    // Load game
    if (!this.native.loadGame(romPath)) {
      this.cleanup()
      throw new Error('Failed to load game: ' + romPath)
    }

    // Load battery-backed SRAM from disk if it exists
    this.loadSram()

    this.avInfo = this.native.getAVInfo()
    this.isRunning = true
    this.paused = false

    // No emulation loop here — frames are driven by GameWindowManager
    // which calls runFrame() at display refresh rate
    this.emulationRunning = true

    this.emit('launched', { romPath, corePath })
  }

  /**
   * Run one frame of emulation. Called by GameWindowManager at display rate.
   */
  runFrame(): void {
    if (!this.paused && this.native && this.emulationRunning) {
      this.native.run()
    }
  }

  /**
   * Get the latest video frame from the core. Returns null if no frame ready.
   */
  getVideoFrame(): { data: Uint8Array; width: number; height: number } | null {
    return this.native?.getVideoFrame() ?? null
  }

  /**
   * Get accumulated audio samples. Returns null if none available.
   */
  getAudioBuffer(): Int16Array | null {
    return this.native?.getAudioBuffer() ?? null
  }

  /**
   * Get AV info (geometry + timing) from the loaded game.
   */
  getAVInfo() {
    return this.avInfo
  }

  /**
   * Set input for a specific port/button.
   */
  setInput(port: number, id: number, pressed: boolean): void {
    this.native?.setInputState(port, id, pressed ? 1 : 0)
  }

  async saveState(slot: number): Promise<void> {
    if (!this.native || !this.isRunning) {
      throw new Error('No game running')
    }

    const stateData = this.native.serializeState()
    if (!stateData) {
      throw new Error('Failed to serialize state')
    }

    const statePath = this.getStatePath(slot)
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, Buffer.from(stateData.buffer))

    this.emit('stateSaved', { slot })
  }

  async loadState(slot: number): Promise<void> {
    if (!this.native || !this.isRunning) {
      throw new Error('No game running')
    }

    const statePath = this.getStatePath(slot)
    if (!fs.existsSync(statePath)) {
      throw new Error(`No save state in slot ${slot}`)
    }

    const data = fs.readFileSync(statePath)
    const stateData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

    if (!this.native.unserializeState(stateData)) {
      throw new Error('Failed to restore state')
    }

    this.emit('stateLoaded', { slot })
  }

  async screenshot(outputPath?: string): Promise<string> {
    if (!this.native || !this.isRunning) {
      throw new Error('No game running')
    }

    const frame = this.native.getVideoFrame()
    if (!frame) {
      throw new Error('No frame available')
    }

    // We'll emit the raw frame data and let the renderer handle saving
    // For now, save as raw RGBA
    const screenshotDir = path.join(app.getPath('userData'), 'screenshots')
    fs.mkdirSync(screenshotDir, { recursive: true })
    const filePath = outputPath || path.join(screenshotDir, `screenshot-${Date.now()}.raw`)
    fs.writeFileSync(filePath, Buffer.from(frame.data.buffer))

    this.emit('screenshotTaken', { path: filePath })
    return filePath
  }

  async pause(): Promise<void> {
    if (!this.paused) {
      this.paused = true
      this.emit('paused')
    }
  }

  async resume(): Promise<void> {
    if (this.paused) {
      this.paused = false
      this.emit('resumed')
    }
  }

  async reset(): Promise<void> {
    this.native?.reset()
    this.emit('reset')
  }

  async terminate(): Promise<void> {
    this.stopEmulationLoop()
    if (this.native) {
      this.saveSram()
      this.native.destroy()
      this.native = null
    }
    this.cleanup()
  }

  protected cleanup(): void {
    this.stopEmulationLoop()
    if (this.native) {
      try { this.saveSram() } catch { /* ignore */ }
      try { this.native.destroy() } catch { /* ignore */ }
      this.native = null
    }
    this.paused = false
    this.avInfo = null
    this.process = null
    this.isRunning = false
    this.emit('terminated')
  }

  isActive(): boolean {
    return this.isRunning && this.native !== null
  }

  private stopEmulationLoop(): void {
    this.emulationRunning = false
    if (this.emulationTimer) {
      clearTimeout(this.emulationTimer)
      this.emulationTimer = null
    }
  }

  /**
   * Check whether an autosave file exists for the currently loaded ROM.
   */
  hasAutoSave(): boolean {
    return fs.existsSync(this.getAutoSavePath())
  }

  /**
   * Check whether an autosave exists for a specific ROM path (without needing a loaded game).
   */
  hasAutoSaveForRom(romPath: string): boolean {
    const romName = path.basename(romPath, path.extname(romPath))
    return fs.existsSync(path.join(this.saveStatesDir, romName, 'autosave.sav'))
  }

  /** Delete the autosave file for the currently loaded ROM. */
  deleteAutoSave(): void {
    const autoSavePath = this.getAutoSavePath()
    if (fs.existsSync(autoSavePath)) {
      fs.unlinkSync(autoSavePath)
    }
  }

  /** Delete the autosave file for a specific ROM path. */
  deleteAutoSaveForRom(romPath: string): void {
    const romName = path.basename(romPath, path.extname(romPath))
    const autoSavePath = path.join(this.saveStatesDir, romName, 'autosave.sav')
    if (fs.existsSync(autoSavePath)) {
      fs.unlinkSync(autoSavePath)
    }
  }

  private getAutoSavePath(): string {
    const romName = this.romPath ? path.basename(this.romPath, path.extname(this.romPath)) : 'unknown'
    return path.join(this.saveStatesDir, romName, 'autosave.sav')
  }

  /** Flush the core's battery-backed SRAM to disk. */
  saveSram(): void {
    if (!this.native || !this.romPath) return
    const sramData = this.native.getMemoryData()
    if (!sramData || sramData.length === 0) return

    // Check if SRAM is all zeros (no save data)
    if (sramData.every((b) => b === 0)) return

    const sramPath = this.getSramPath()
    fs.mkdirSync(path.dirname(sramPath), { recursive: true })
    fs.writeFileSync(sramPath, Buffer.from(sramData.buffer, sramData.byteOffset, sramData.byteLength))
  }

  /** Restore battery-backed SRAM from disk into the core. */
  private loadSram(): void {
    if (!this.native || !this.romPath) return
    const sramPath = this.getSramPath()
    if (!fs.existsSync(sramPath)) return

    const data = fs.readFileSync(sramPath)
    const sramData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    this.native.setMemoryData(sramData)
  }

  private getSramPath(): string {
    const romName = this.romPath ? path.basename(this.romPath, path.extname(this.romPath)) : 'unknown'
    return path.join(this.sramDir, `${romName}.srm`)
  }

  private getStatePath(slot: number): string {
    const romName = this.romPath ? path.basename(this.romPath, path.extname(this.romPath)) : 'unknown'
    if (slot === 99) {
      return path.join(this.saveStatesDir, romName, 'autosave.sav')
    }
    return path.join(this.saveStatesDir, romName, `state-${slot}.sav`)
  }
}
