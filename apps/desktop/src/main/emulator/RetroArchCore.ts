import { spawn } from 'child_process'
import { createSocket, Socket } from 'dgram'
import { EmulatorCore, EmulatorLaunchOptions } from './EmulatorCore'

/**
 * RetroArch emulator implementation using UDP network commands for control.
 *
 * RetroArch must be configured with network commands enabled:
 * - network_cmd_enable = "true"
 * - network_cmd_port = "55355" (default)
 *
 * Configuration file is typically at:
 * - macOS: ~/Library/Application Support/RetroArch/config/retroarch.cfg
 * - Linux: ~/.config/retroarch/retroarch.cfg
 * - Windows: %APPDATA%\RetroArch\retroarch.cfg
 */
export class RetroArchCore extends EmulatorCore {
  private udpClient: Socket | null = null
  private networkHost = 'localhost'
  private networkPort = 55355
  private corePath: string | null = null
  private paused = false
  private currentStateSlot = 0

  constructor(
    emulatorPath: string,
    private readonly defaultCorePath?: string,
  ) {
    super('RetroArch', emulatorPath)
  }

  /**
   * Launch RetroArch with the specified ROM and core
   */
  async launch(
    romPath: string,
    options: EmulatorLaunchOptions = {},
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error('Emulator is already running')
    }

    this.romPath = romPath
    this.corePath = options.corePath || this.defaultCorePath || null
    this.paused = false

    if (!this.corePath) {
      throw new Error('Core path is required for RetroArch')
    }

    // Build command-line arguments
    const args: string[] = [
      '-L',
      this.corePath, // Load core
      romPath, // Load ROM
    ]

    // Add optional arguments
    if (options.fullscreen) {
      args.push('--fullscreen')
    }

    if (options.windowSize) {
      args.push(
        '--size',
        `${options.windowSize.width}x${options.windowSize.height}`,
      )
    }

    // Add any extra arguments
    if (options.extraArgs) {
      args.push(...options.extraArgs)
    }

    // Spawn RetroArch process
    this.process = spawn(this.emulatorPath, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    // Setup process event handlers
    this.process.stdout?.on('data', (data) => {
      console.log(`[RetroArch] ${data.toString()}`)
      this.emit('log', data.toString())
    })

    this.process.stderr?.on('data', (data) => {
      console.error(`[RetroArch Error] ${data.toString()}`)
      this.emit('error', new Error(data.toString()))
    })

    this.process.on('exit', (code, signal) => {
      console.log(`RetroArch exited with code ${code}, signal ${signal}`)
      this.emit('exited', { code, signal })
      this.cleanup()
    })

    this.process.on('error', (err) => {
      console.error('Failed to start RetroArch:', err)
      this.emit('error', err)
      this.cleanup()
    })

    const proc = this.process
    if (!proc) {
      throw new Error('Failed to spawn RetroArch process')
    }

    // Wait a bit for RetroArch to start before initializing UDP.
    // IMPORTANT: RetroArch can exit immediately (bad path, missing deps, etc).
    // We must not emit "launched" or set isRunning=true if the process died during startup.
    const startupDelayMs = 2000

    await new Promise<void>((resolve, reject) => {
      let settled = false

      const cleanupStartupWatchers = () => {
        clearTimeout(timer)
        proc.off('exit', onEarlyExit)
        proc.off('error', onEarlyError)
      }

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        cleanupStartupWatchers()
        fn()
      }

      const onEarlyExit = (
        code: number | null,
        signal: NodeJS.Signals | null,
      ) => {
        settle(() => {
          reject(
            new Error(
              `RetroArch exited during startup (code ${code ?? 'null'}, signal ${signal ?? 'none'})`,
            ),
          )
        })
      }

      const onEarlyError = (err: Error) => {
        settle(() => reject(err))
      }

      proc.once('exit', onEarlyExit)
      proc.once('error', onEarlyError)

      const timer = setTimeout(() => {
        settle(() => {
          // If cleanup ran (exit/error), this.process will be null and/or proc.exitCode will be set.
          if (this.process !== proc || proc.exitCode !== null || proc.killed) {
            reject(
              new Error('RetroArch process is not running after startup delay'),
            )
            return
          }

          // Initialize UDP client for network commands
          this.initializeUDPClient()

          this.isRunning = true
          this.emit('launched', { romPath, corePath: this.corePath })
          resolve()
        })
      }, startupDelayMs)
    })
  }

  /**
   * Initialize the UDP client for sending network commands to RetroArch
   */
  private initializeUDPClient(): void {
    this.udpClient = createSocket('udp4')

    this.udpClient.on('error', (err) => {
      console.error('UDP client error:', err)
      this.emit('error', err)
    })
  }

  /**
   * Send a network command to RetroArch via UDP
   */
  private async sendCommand(command: string): Promise<void> {
    const client = this.udpClient
    if (!client) {
      throw new Error('UDP client not initialized')
    }

    return new Promise((resolve, reject) => {
      const message = Buffer.from(command)

      client.send(message, this.networkPort, this.networkHost, (err) => {
        if (err) {
          console.error(`Failed to send command "${command}":`, err)
          reject(err)
        } else {
          console.log(`Sent command to RetroArch: ${command}`)
          resolve()
        }
      })
    })
  }

  /**
   * Save the current game state to a slot (0-9)
   */
  async saveState(slot: number): Promise<void> {
    if (slot < 0 || slot > 9) {
      throw new Error('Save state slot must be between 0 and 9')
    }

    await this.selectStateSlot(slot)

    // Wait a bit for the slot to change
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Save the state
    await this.sendCommand('SAVE_STATE')

    this.emit('stateSaved', { slot })
  }

  /**
   * Load a previously saved state from a slot (0-9)
   */
  async loadState(slot: number): Promise<void> {
    if (slot < 0 || slot > 9) {
      throw new Error('Save state slot must be between 0 and 9')
    }

    await this.selectStateSlot(slot)

    // Wait a bit for the slot to change
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Load the state
    await this.sendCommand('LOAD_STATE')

    this.emit('stateLoaded', { slot })
  }

  /**
   * Take a screenshot of the current game
   * Note: RetroArch saves screenshots to its configured screenshot directory
   */
  async screenshot(outputPath?: string): Promise<string> {
    await this.sendCommand('SCREENSHOT')

    // RetroArch saves screenshots to its own directory, so we return that path
    // The actual path depends on RetroArch's configuration
    const screenshotPath =
      outputPath || '~/Library/Application Support/RetroArch/screenshots'

    this.emit('screenshotTaken', { path: screenshotPath })

    return screenshotPath
  }

  /**
   * Pause the emulation
   */
  async pause(): Promise<void> {
    // RetroArch's network interface exposes a stateless toggle command. To provide
    // deterministic pause/resume behavior to the rest of the app, we track pause
    // state locally and only toggle when a transition is needed.
    if (!this.paused) {
      await this.sendCommand('PAUSE_TOGGLE')
      this.paused = true
    }

    this.emit('paused')
  }

  /**
   * Resume the emulation
   */
  async resume(): Promise<void> {
    // See note in pause(): PAUSE_TOGGLE is a state toggle, so only send it when
    // we believe we're currently paused.
    if (this.paused) {
      await this.sendCommand('PAUSE_TOGGLE')
      this.paused = false
    }

    this.emit('resumed')
  }

  /**
   * Reset the emulation
   */
  async reset(): Promise<void> {
    await this.sendCommand('RESET')
    this.emit('reset')
  }

  /**
   * Toggle fast forward mode
   */
  async fastForward(enable: boolean): Promise<void> {
    if (enable) {
      await this.sendCommand('FAST_FORWARD_HOLD')
    } else {
      // Note: RetroArch doesn't have a direct command to disable fast forward hold
      // It's typically done via key release
      this.emit('fastForwardToggled', { enabled: enable })
    }
  }

  /**
   * Quit RetroArch gracefully
   */
  async quit(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    try {
      await this.sendCommand('QUIT')
    } catch (err) {
      console.error('Failed to send quit command, forcing termination')
      await this.terminate()
    }
  }

  /**
   * Clean up resources when emulator exits
   */
  protected cleanup(): void {
    if (this.udpClient) {
      this.udpClient.close()
      this.udpClient = null
    }

    this.paused = false
    this.currentStateSlot = 0
    super.cleanup()
  }

  /**
   * RetroArch network commands do not support absolute slot selection (e.g. STATE_SLOT_5).
   * Slots can only be changed incrementally via STATE_SLOT_INCREASE / STATE_SLOT_DECREASE.
   *
   * We track our own notion of "current slot" so we can move to the requested slot by delta.
   */
  private async selectStateSlot(slot: number): Promise<void> {
    const desired = Math.max(0, Math.min(9, Math.trunc(slot)))
    const delta = desired - this.currentStateSlot

    if (delta === 0) return

    const command = delta > 0 ? 'STATE_SLOT_INCREASE' : 'STATE_SLOT_DECREASE'
    const steps = Math.abs(delta)

    for (let i = 0; i < steps; i++) {
      await this.sendCommand(command)
      // Small delay to avoid flooding RetroArch.
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    this.currentStateSlot = desired
  }

  /**
   * Configure network settings for UDP communication
   */
  setNetworkConfig(host: string, port: number): void {
    this.networkHost = host
    this.networkPort = port
  }
}
