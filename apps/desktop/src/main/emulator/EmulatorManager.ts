import { EventEmitter } from 'events';
import { EmulatorCore, EmulatorInfo } from './EmulatorCore';
import { RetroArchCore } from './RetroArchCore';
import { LibretroNativeCore } from './LibretroNativeCore';
import { EmulationWorkerClient } from './EmulationWorkerClient';
import { CoreDownloader, CoreInfo } from './CoreDownloader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Manages emulator instances and provides a unified interface for launching games.
 * Handles emulator discovery, selection, and lifecycle management.
 */
export class EmulatorManager extends EventEmitter {
  private currentEmulator: EmulatorCore | null = null;
  private workerClient: EmulationWorkerClient | null = null;
  private availableEmulators: Map<string, EmulatorInfo> = new Map();
  private coreDownloader: CoreDownloader;

  constructor() {
    super();
    this.coreDownloader = new CoreDownloader();
    this.coreDownloader.on('progress', (progress) => {
      this.emit('core:downloadProgress', progress);
    });
    this.discoverEmulators();
  }

  getCoreDownloader(): CoreDownloader {
    return this.coreDownloader;
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
        supportedSystems: ['nes', 'snes', 'genesis', 'gb', 'gbc', 'gba', 'n64', 'psx', 'saturn'],
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

    }

    // Check for libretro cores (native mode — no RetroArch process needed)
    // Always register native mode; cores will be downloaded on demand
    const coresPath = this.coreDownloader.getCoresDirectory();
    {
      this.availableEmulators.set('libretro-native', {
        id: 'libretro-native',
        name: 'LibretroNative',
        type: 'libretro-native',
        path: coresPath,
        supportedSystems: ['nes', 'snes', 'genesis', 'gb', 'gbc', 'gba', 'n64', 'psx', 'saturn', 'psp', 'nds', 'arcade'],
        features: {
          saveStates: true,
          screenshots: true,
          pauseResume: true,
          reset: true,
          fastForward: true,
          rewind: false,
          shaders: false,
          cheats: false
        }
      });

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
   * Returns info about all known cores for a system, including
   * display name, description, and installation status.
   */
  getCoresForSystem(systemId: string): CoreInfo[] {
    return this.coreDownloader.getCoresForSystem(systemId);
  }

  /**
   * Launch a game with the specified emulator and system.
   * When coreName is provided, that specific core is used instead of auto-selection.
   */
  async launchGame(romPath: string, systemId: string, emulatorId?: string, extraArgs?: string[], coreName?: string): Promise<void> {
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

    // Get core path for the system (RetroArch or native libretro)
    const options: any = {};
    if (emulatorInfo.type === 'retroarch' || emulatorInfo.type === 'libretro-native') {
      if (coreName) {
        // Use the specific core requested by the user
        options.corePath = this.coreDownloader.getCorePath(coreName);
        if (!options.corePath) {
          options.corePath = await this.coreDownloader.downloadCore(coreName, systemId);
        }
      } else {
        options.corePath = this.getCorePathForSystem(systemId);
        if (!options.corePath) {
          // Auto-download the preferred core
          options.corePath = await this.coreDownloader.downloadCoreForSystem(systemId);
        }
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
   * Get the core path for a specific system, checking the app-managed
   * cores directory first, then falling back to RetroArch's directory.
   */
  getCorePathForSystem(systemId: string): string | null {
    const coreMapping: Record<string, string[]> = {
      'nes': ['fceumm_libretro', 'nestopia_libretro', 'mesen_libretro'],
      'snes': ['snes9x_libretro', 'bsnes_libretro'],
      'genesis': ['genesis_plus_gx_libretro', 'picodrive_libretro'],
      'gb': ['gambatte_libretro', 'mgba_libretro'],
      'gbc': ['gambatte_libretro', 'mgba_libretro'],
      'gba': ['mgba_libretro', 'vba_next_libretro'],
      'n64': ['mupen64plus_next_libretro', 'parallel_n64_libretro'],
      'psx': ['pcsx_rearmed_libretro', 'beetle_psx_libretro'],
      'saturn': ['mednafen_saturn_libretro', 'yabause_libretro'],
      'psp': ['ppsspp_libretro'],
      'nds': ['desmume_libretro'],
      'arcade': ['mame_libretro'],
    };

    const coreNames = coreMapping[systemId];
    if (!coreNames) {
      return null;
    }

    const extension = process.platform === 'darwin' ? '.dylib' :
                      process.platform === 'win32' ? '.dll' : '.so';

    // Check app-managed cores directory first
    const appCoresDir = this.coreDownloader.getCoresDirectory();
    for (const coreName of coreNames) {
      const corePath = path.join(appCoresDir, coreName + extension);
      if (fs.existsSync(corePath)) {
        return corePath;
      }
    }

    // Fall back to RetroArch's directory
    const retroArchCoresDir = this.getRetroArchCoresPath();
    if (retroArchCoresDir) {
      for (const coreName of coreNames) {
        const corePath = path.join(retroArchCoresDir, coreName + extension);
        if (fs.existsSync(corePath)) {
          return corePath;
        }
      }
    }

    return null;
  }

  /**
   * Get the RetroArch cores directory path (used as fallback).
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
    // Prefer native libretro core loading (single-window, no external process).
    // Cores will be auto-downloaded if missing during the launch flow.
    const native = this.availableEmulators.get('libretro-native');
    if (native && native.supportedSystems.includes(systemId)) {
      return native;
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
   * Set the worker client for native mode emulation.
   * Called by IPCHandlers after spawning the utility process.
   */
  setWorkerClient(client: EmulationWorkerClient | null): void {
    // Remove listeners from the previous worker client
    this.workerClient?.removeAllListeners();

    this.workerClient = client;

    // Forward worker client events through the same event chain as EmulatorCore
    if (client) {
      client.on('paused', () => this.emit('emulator:paused'));
      client.on('resumed', () => this.emit('emulator:resumed'));
      client.on('reset', () => this.emit('emulator:reset'));
      client.on('error', (error) => this.emit('emulator:error', error));
      client.on('speedChanged', (data) => this.emit('emulator:speedChanged', data));
    }
  }

  /**
   * Get the current worker client (if in native mode).
   */
  getWorkerClient(): EmulationWorkerClient | null {
    return this.workerClient;
  }

  /**
   * Save state to a specific slot
   */
  async saveState(slot: number): Promise<void> {
    if (this.workerClient?.isRunning()) {
      await this.workerClient.saveState(slot);
      return;
    }
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }
    await this.currentEmulator.saveState(slot);
  }

  /**
   * Load state from a specific slot
   */
  async loadState(slot: number): Promise<void> {
    if (this.workerClient?.isRunning()) {
      await this.workerClient.loadState(slot);
      return;
    }
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }
    await this.currentEmulator.loadState(slot);
  }

  /**
   * Take a screenshot
   */
  async screenshot(outputPath?: string): Promise<string> {
    if (this.workerClient?.isRunning()) {
      return await this.workerClient.screenshot(outputPath);
    }
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }
    return await this.currentEmulator.screenshot(outputPath);
  }

  /**
   * Pause the current emulator
   */
  async pause(): Promise<void> {
    if (this.workerClient?.isRunning()) {
      this.workerClient.pause();
      return;
    }
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }
    await this.currentEmulator.pause();
  }

  /**
   * Resume the current emulator
   */
  async resume(): Promise<void> {
    if (this.workerClient?.isRunning()) {
      this.workerClient.resume();
      return;
    }
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }
    await this.currentEmulator.resume();
  }

  /**
   * Set emulation speed multiplier (1 = normal, 2 = 2x, etc.)
   */
  setSpeed(multiplier: number): void {
    if (this.workerClient?.isRunning()) {
      this.workerClient.setSpeed(multiplier);
      return;
    }
  }

  /**
   * Reset the current emulator
   */
  async reset(): Promise<void> {
    if (this.workerClient?.isRunning()) {
      this.workerClient.reset();
      return;
    }
    if (!this.currentEmulator?.isActive()) {
      throw new Error('No emulator is currently running');
    }
    await this.currentEmulator.reset();
  }

  /**
   * Synchronously mark the worker as shutting down so that a process
   * exit during the async shutdown sequence doesn't emit an error.
   */
  prepareForQuit(): void {
    this.workerClient?.prepareForQuit();
  }

  /**
   * Stop the current emulator
   */
  async stopEmulator(): Promise<void> {
    if (this.workerClient?.isRunning()) {
      await this.workerClient.shutdown();
      this.workerClient = null;
    }
    if (this.currentEmulator?.isActive()) {
      await this.currentEmulator.terminate();
      this.currentEmulator = null;
    }
  }

  /**
   * Check if an emulator is currently running
   */
  isEmulatorRunning(): boolean {
    if (this.workerClient?.isRunning()) return true;
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
