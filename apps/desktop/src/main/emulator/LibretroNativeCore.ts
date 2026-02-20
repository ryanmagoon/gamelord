import { EmulatorCore, EmulatorLaunchOptions } from './EmulatorCore'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'
import { validateCorePath, validateRomPath } from '../utils/pathValidation'

/**
 * EmulatorCore implementation for native libretro mode.
 *
 * In the current architecture the actual emulation loop runs in a dedicated
 * utility process (see `core-worker.ts`). This class is responsible for:
 *
 * 1. Path validation — ensuring ROM and core paths are safe before handing
 *    them to the worker process.
 * 2. Config storage — exposing validated paths so `EmulationWorkerClient`
 *    can initialize the worker.
 * 3. Autosave management — filesystem checks for resume-game prompts that
 *    happen before the worker is spawned.
 *
 * It does NOT load the native addon or drive the emulation loop — those
 * responsibilities belong to the worker process.
 */
export class LibretroNativeCore extends EmulatorCore {
  private _corePath: string | null = null
  private _systemDir: string | null = null
  private readonly _saveStatesDir: string
  private readonly _sramDir: string
  private readonly _saveDir: string
  private readonly _biosDir: string

  constructor(
    private readonly coresBasePath: string,
  ) {
    super('LibretroNative', coresBasePath)
    this._saveStatesDir = path.join(app.getPath('userData'), 'savestates')
    this._sramDir = path.join(app.getPath('userData'), 'saves')
    this._saveDir = path.join(app.getPath('userData'), 'saves')
    this._biosDir = path.join(app.getPath('userData'), 'BIOS')
    fs.mkdirSync(this._saveStatesDir, { recursive: true })
    fs.mkdirSync(this._sramDir, { recursive: true })
    fs.mkdirSync(this._biosDir, { recursive: true })
  }

  /**
   * Directories that are allowed to contain libretro cores.
   * Cores loaded via dlopen must come from one of these locations.
   */
  private getAllowedCoreDirs(): string[] {
    const dirs = [
      // App-managed cores directory
      path.join(app.getPath('userData'), 'cores'),
    ]

    // RetroArch cores directories (platform-specific)
    if (process.platform === 'darwin') {
      dirs.push(path.join(os.homedir(), 'Library/Application Support/RetroArch/cores'))
    } else if (process.platform === 'win32') {
      dirs.push(path.join(os.homedir(), 'AppData/Roaming/RetroArch/cores'))
    } else {
      dirs.push(path.join(os.homedir(), '.config/retroarch/cores'))
    }

    return dirs.filter((dir) => fs.existsSync(dir))
  }

  /**
   * Validate ROM/core paths and store them for the worker process.
   * No native addon is loaded here — that happens inside the worker.
   */
  async launch(romPath: string, options: EmulatorLaunchOptions = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error('Emulator is already running')
    }

    const corePath = options.corePath
    if (!corePath) {
      throw new Error('Core path is required')
    }

    // Validate paths before passing to the worker
    const validatedRomPath = validateRomPath(romPath)
    const validatedCorePath = validateCorePath(corePath, this.getAllowedCoreDirs())

    this.romPath = validatedRomPath
    this._corePath = validatedCorePath
    this._systemDir = this._biosDir

    this.isRunning = true

    this.emit('launched', { romPath: validatedRomPath, corePath: validatedCorePath })
  }

  // -------------------------------------------------------------------------
  // Path getters — used by EmulationWorkerClient to initialize the worker
  // -------------------------------------------------------------------------

  getCorePath(): string {
    if (!this._corePath) throw new Error('Core not launched — no core path available')
    return this._corePath
  }

  getRomPath(): string {
    if (!this.romPath) throw new Error('Core not launched — no ROM path available')
    return this.romPath
  }

  getSystemDir(): string {
    if (!this._systemDir) throw new Error('Core not launched — no system dir available')
    return this._systemDir
  }

  getSaveDir(): string {
    return this._saveDir
  }

  getSramDir(): string {
    return this._sramDir
  }

  getSaveStatesDir(): string {
    return this._saveStatesDir
  }

  // -------------------------------------------------------------------------
  // Autosave management — filesystem checks before the worker starts
  // -------------------------------------------------------------------------

  hasAutoSave(): boolean {
    return fs.existsSync(this.getAutoSavePath())
  }

  hasAutoSaveForRom(romPath: string): boolean {
    const romName = path.basename(romPath, path.extname(romPath))
    return fs.existsSync(path.join(this._saveStatesDir, romName, 'autosave.sav'))
  }

  deleteAutoSave(): void {
    const autoSavePath = this.getAutoSavePath()
    if (fs.existsSync(autoSavePath)) {
      fs.unlinkSync(autoSavePath)
    }
  }

  deleteAutoSaveForRom(romPath: string): void {
    const romName = path.basename(romPath, path.extname(romPath))
    const autoSavePath = path.join(this._saveStatesDir, romName, 'autosave.sav')
    if (fs.existsSync(autoSavePath)) {
      fs.unlinkSync(autoSavePath)
    }
  }

  private getAutoSavePath(): string {
    const romName = this.romPath ? path.basename(this.romPath, path.extname(this.romPath)) : 'unknown'
    return path.join(this._saveStatesDir, romName, 'autosave.sav')
  }

  // -------------------------------------------------------------------------
  // EmulatorCore abstract method stubs — emulation is driven by the worker
  // -------------------------------------------------------------------------

  async saveState(_slot: number): Promise<void> {
    throw new Error('Save state is handled by the emulation worker')
  }

  async loadState(_slot: number): Promise<void> {
    throw new Error('Load state is handled by the emulation worker')
  }

  async screenshot(_outputPath?: string): Promise<string> {
    throw new Error('Screenshot is handled by the emulation worker')
  }

  async pause(): Promise<void> {
    this.emit('paused')
  }

  async resume(): Promise<void> {
    this.emit('resumed')
  }

  async reset(): Promise<void> {
    this.emit('reset')
  }

  async terminate(): Promise<void> {
    this.cleanup()
  }

  protected cleanup(): void {
    this._corePath = null
    this._systemDir = null
    this.process = null
    this.isRunning = false
    this.emit('terminated')
  }

  isActive(): boolean {
    return this.isRunning
  }
}
