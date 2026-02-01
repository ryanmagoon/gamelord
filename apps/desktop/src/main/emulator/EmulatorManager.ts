import { EventEmitter } from 'events';
import { EmulatorCore, EmulatorInfo } from './EmulatorCore';
import { RetroArchCore } from './RetroArchCore';
import { LibretroNativeCore } from './LibretroNativeCore';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Manages emulator instances and provides a unified interface for launching games.
 * Handles emulator discovery, selection, and lifecycle management.
 */
export class EmulatorManager extends EventEmitter {
  private currentEmulator: EmulatorCore | null = null;
  private availableEmulators: Map<string, EmulatorInfo> = new Map();

  constructor() {
    super();
    this.discoverEmulators();
  }

  /**
   * Discover available emulators on the system
   */
  private discoverEmulators(): void {
    // Check for RetroArch
    const retroarchPaths = this.findRetroArchInstallation();
    if (retroarchPaths.length > 0) {
      this.availableEmulators.set('retroarch', {
        id: 'retroarch',
        name: 'RetroArch',
        type: 'retroarch',
        path: retroarchPaths[0],
        supportedSystems: ['nes', 'snes', 'genesis', 'gb', 'gbc', 'gba', 'n64', 'psx'],
        features: {
          saveStates: true,
          screenshots: true,
          pauseResume: true,
          reset: true,
          fastForward: true,
          rewind: true,
          shaders: true,
          cheats: true
        }
      });

      console.log('Found RetroArch at:', retroarchPaths[0]);
    }

    // Check for libretro cores (native mode — no RetroArch process needed)
    const coresPath = this.getRetroArchCoresPath();
    if (coresPath) {
      this.availableEmulators.set('libretro-native', {
        id: 'libretro-native',
        name: 'LibretroNative',
        type: 'libretro-native',
        path: coresPath,
        supportedSystems: ['nes', 'snes', 'genesis', 'gb', 'gbc', 'gba', 'n64', 'psx'],
        features: {
          saveStates: true,
          screenshots: true,
          pauseResume: true,
          reset: true,
          fastForward: false,
          rewind: false,
          shaders: false,
          cheats: false
        }
      });

      console.log('Found libretro cores at:', coresPath);
    }
  }

  /**
   * Find RetroArch installation on the system
   */
  private findRetroArchInstallation(): string[] {
    const possiblePaths: string[] = [];

    if (process.platform === 'darwin') {
      possiblePaths.push(
        '/Applications/RetroArch.app/Contents/MacOS/RetroArch',
        path.join(os.homedir(), 'Applications/RetroArch.app/Contents/MacOS/RetroArch')
      );
    } else if (process.platform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\RetroArch\\retroarch.exe',
        'C:\\Program Files (x86)\\RetroArch\\retroarch.exe',
        path.join(os.homedir(), 'AppData\\Roaming\\RetroArch\\retroarch.exe')
      );
    } else if (process.platform === 'linux') {
      possiblePaths.push(
        '/usr/bin/retroarch',
        '/usr/local/bin/retroarch',
        path.join(os.homedir(), '.local/bin/retroarch')
      );
    }

    return possiblePaths.filter(p => fs.existsSync(p));
  }

  /**
   * Get list of available emulators
   */
  getAvailableEmulators(): EmulatorInfo[] {
    return Array.from(this.availableEmulators.values());
  }

  /**
   * Get a specific emulator by ID
   */
  getEmulator(emulatorId: string): EmulatorInfo | undefined {
    return this.availableEmulators.get(emulatorId);
  }

  /**
   * Launch a game with the specified emulator and system
   */
  async launchGame(romPath: string, systemId: string, emulatorId?: string, extraArgs?: string[]): Promise<void> {
    // Close current emulator if running
    if (this.currentEmulator?.isActive()) {
      await this.currentEmulator.terminate();
    }

    // Determine which emulator to use
    const emulatorInfo = emulatorId
      ? this.availableEmulators.get(emulatorId)
      : this.selectBestEmulator(systemId);

    if (!emulatorInfo) {
      throw new Error(`No emulator found for system: ${systemId}`);
    }

    // Create emulator instance
    this.currentEmulator = await this.createEmulatorInstance(emulatorInfo, systemId);

    // Setup event forwarding
    this.setupEventForwarding(this.currentEmulator);

    // Get core path for the system (if using RetroArch)
    const options: any = {};
    if (emulatorInfo.type === 'retroarch') {
      options.corePath = this.getCorePathForSystem(systemId);
      if (!options.corePath) {
        throw new Error(`No core found for system: ${systemId}`);
      }
    }

    if (extraArgs) {
      options.extraArgs = extraArgs;
    }

    // Launch the game
    await this.currentEmulator.launch(romPath, options);

    this.emit('gameLaunched', {
      romPath,
      systemId,
      emulatorId: emulatorInfo.id
    });
  }

  /**
   * Create an emulator instance based on emulator info
   */
  private async createEmulatorInstance(
    emulatorInfo: EmulatorInfo,
    systemId: string
  ): Promise<EmulatorCore> {
    switch (emulatorInfo.type) {
      case 'retroarch': {
        const corePath = this.getCorePathForSystem(systemId);
        return new RetroArchCore(emulatorInfo.path, corePath ?? undefined);
      }

      case 'libretro-native': {
        return new LibretroNativeCore(emulatorInfo.path);
      }

      default:
        throw new Error(`Unsupported emulator type: ${emulatorInfo.type}`);
    }
  }

  /**
   * Get the core path for a specific system (RetroArch)
   */
  private getCorePathForSystem(systemId: string): string | null {
    const coresBasePath = this.getRetroArchCoresPath();
    if (!coresBasePath) {
      return null;
    }

    // Map system IDs to core names
    const coreMapping: Record<string, string[]> = {
      'nes': ['mesen_libretro', 'fceumm_libretro', 'nestopia_libretro'],
      'snes': ['bsnes_libretro', 'snes9x_libretro'],
      'genesis': ['genesis_plus_gx_libretro', 'picodrive_libretro'],
      'gb': ['mgba_libretro', 'gambatte_libretro'],
      'gbc': ['mgba_libretro', 'gambatte_libretro'],
      'gba': ['mgba_libretro', 'vba_next_libretro'],
      'n64': ['mupen64plus_next_libretro', 'parallel_n64_libretro'],
      'psx': ['pcsx_rearmed_libretro', 'beetle_psx_libretro']
    };

    const coreNames = coreMapping[systemId];
    if (!coreNames) {
      return null;
    }

    // Try to find the first available core
    const extension = process.platform === 'darwin' ? '.dylib' :
                      process.platform === 'win32' ? '.dll' : '.so';

    for (const coreName of coreNames) {
      const corePath = path.join(coresBasePath, coreName + extension);
      if (fs.existsSync(corePath)) {
        return corePath;
      }
    }

    return null;
  }

  /**
   * Get the RetroArch cores directory path
   */
  private getRetroArchCoresPath(): string | null {
    let basePath: string;

    if (process.platform === 'darwin') {
      basePath = path.join(os.homedir(), 'Library/Application Support/RetroArch/cores');
    } else if (process.platform === 'win32') {
      basePath = path.join(os.homedir(), 'AppData/Roaming/RetroArch/cores');
    } else {
      basePath = path.join(os.homedir(), '.config/retroarch/cores');
    }

    return fs.existsSync(basePath) ? basePath : null;
  }

  /**
   * Select the best emulator for a given system
   */
  private selectBestEmulator(systemId: string): EmulatorInfo | undefined {
    // Prefer native libretro core loading (single-window, no external process)
    const native = this.availableEmulators.get('libretro-native');
    if (native && native.supportedSystems.includes(systemId)) {
      // Verify we actually have a core for this system
      const corePath = this.getCorePathForSystem(systemId);
      if (corePath) {
        return native;
      }
    }

    // Fall back to RetroArch process mode
    const retroarch = this.availableEmulators.get('retroarch');
    if (retroarch && retroarch.supportedSystems.includes(systemId)) {
      return retroarch;
    }

    // Try to find any other compatible emulator
    for (const emulator of this.availableEmulators.values()) {
      if (emulator.supportedSystems.includes(systemId)) {
        return emulator;
      }
    }

    return undefined;
  }

  /**
   * Setup event forwarding from emulator to manager
   */
  private setupEventForwarding(emulator: EmulatorCore): void {
    emulator.on('launched', (data) => this.emit('emulator:launched', data));
    emulator.on('exited', (data) => this.emit('emulator:exited', data));
    emulator.on('error', (error) => this.emit('emulator:error', error));
    emulator.on('stateSaved', (data) => this.emit('emulator:stateSaved', data));
    emulator.on('stateLoaded', (data) => this.emit('emulator:stateLoaded', data));
    emulator.on('screenshotTaken', (data) => this.emit('emulator:screenshotTaken', data));
    emulator.on('paused', () => this.emit('emulator:paused'));
    emulator.on('resumed', () => this.emit('emulator:resumed'));
    emulator.on('reset', () => this.emit('emulator:reset'));
    emulator.on('terminated', () => this.emit('emulator:terminated'));
  }

  /**
   * Save state to a specific slot
   */
  async saveState(slot: number): Promise<void> {
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }

    await this.currentEmulator.saveState(slot);
  }

  /**
   * Load state from a specific slot
   */
  async loadState(slot: number): Promise<void> {
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }

    await this.currentEmulator.loadState(slot);
  }

  /**
   * Take a screenshot
   */
  async screenshot(outputPath?: string): Promise<string> {
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }

    return await this.currentEmulator.screenshot(outputPath);
  }

  /**
   * Pause the current emulator
   */
  async pause(): Promise<void> {
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }

    await this.currentEmulator.pause();
  }

  /**
   * Resume the current emulator
   */
  async resume(): Promise<void> {
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }

    await this.currentEmulator.resume();
  }

  /**
   * Reset the current emulator
   */
  async reset(): Promise<void> {
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }

    await this.currentEmulator.reset();
  }

  /**
   * Stop the current emulator
   */
  async stopEmulator(): Promise<void> {
    if (this.currentEmulator?.isActive()) {
      await this.currentEmulator.terminate();
      this.currentEmulator = null;
    }
  }

  /**
   * Check if an emulator is currently running
   */
  isEmulatorRunning(): boolean {
    return this.currentEmulator?.isActive() ?? false;
  }

  /**
   * Get the currently running emulator's process ID
   */
  getCurrentEmulatorPid(): number | undefined {
    return this.currentEmulator?.getProcessId();
  }

  /**
   * Get the current emulator instance (for native core access).
   */
  getCurrentEmulator(): EmulatorCore | null {
    return this.currentEmulator;
  }

  /**
   * Check if the current emulator is using native libretro core loading.
   */
  isNativeMode(): boolean {
    return this.currentEmulator instanceof LibretroNativeCore;
  }
}
