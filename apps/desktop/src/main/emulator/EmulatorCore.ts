import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

/**
 * Abstract base class for all emulator implementations.
 * Provides a unified interface for both RetroArch cores and standalone emulators.
 */
export abstract class EmulatorCore extends EventEmitter {
  protected process: ChildProcess | null = null;
  protected isRunning = false;
  protected romPath: string | null = null;

  constructor(
    public readonly name: string,
    public readonly emulatorPath: string
  ) {
    super();
  }

  /**
   * Launch the emulator with the specified ROM
   */
  abstract launch(romPath: string, options?: EmulatorLaunchOptions): Promise<void>;

  /**
   * Save the current game state to a slot
   */
  abstract saveState(slot: number): Promise<void>;

  /**
   * Load a previously saved state from a slot
   */
  abstract loadState(slot: number): Promise<void>;

  /**
   * Take a screenshot of the current game
   */
  abstract screenshot(outputPath?: string): Promise<string>;

  /**
   * Pause the emulation
   */
  abstract pause(): Promise<void>;

  /**
   * Resume the emulation
   */
  abstract resume(): Promise<void>;

  /**
   * Reset the emulation
   */
  abstract reset(): Promise<void>;

  /**
   * Stop the emulator and clean up resources
   */
  async terminate(): Promise<void> {
    if (this.process) {
      return new Promise((resolve) => {
        if (!this.process) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL');
          this.cleanup();
          resolve();
        }, 5000);

        this.process.once('exit', () => {
          clearTimeout(timeout);
          this.cleanup();
          resolve();
        });

        this.process.kill('SIGTERM');
      });
    }
  }

  /**
   * Check if emulator is currently running
   */
  isActive(): boolean {
    return this.isRunning && this.process !== null;
  }

  /**
   * Get the process ID of the running emulator
   */
  getProcessId(): number | undefined {
    return this.process?.pid;
  }

  /**
   * Clean up resources after emulator exits
   */
  protected cleanup(): void {
    this.process = null;
    this.isRunning = false;
    this.emit('terminated');
  }
}

/**
 * Options for launching an emulator
 */
export interface EmulatorLaunchOptions {
  /** Path to the core/plugin to use (for multi-core emulators like RetroArch) */
  corePath?: string;

  /** Whether to launch in fullscreen mode */
  fullscreen?: boolean;

  /** Custom window size */
  windowSize?: {
    width: number;
    height: number;
  };

  /** Additional command-line arguments */
  extraArgs?: string[];

  /** Working directory for the emulator process */
  cwd?: string;
}

/**
 * Emulator capabilities and metadata
 */
export interface EmulatorInfo {
  /** Unique identifier for this emulator */
  id: string;

  /** Display name */
  name: string;

  /** Emulator type (retroarch, mesen, dolphin, etc.) */
  type: string;

  /** Path to the emulator executable */
  path: string;

  /** Systems this emulator supports */
  supportedSystems: string[];

  /** Features this emulator supports */
  features: EmulatorFeatures;
}

/**
 * Feature flags for emulator capabilities
 */
export interface EmulatorFeatures {
  saveStates: boolean;
  screenshots: boolean;
  pauseResume: boolean;
  reset: boolean;
  fastForward: boolean;
  rewind: boolean;
  shaders: boolean;
  cheats: boolean;
}
