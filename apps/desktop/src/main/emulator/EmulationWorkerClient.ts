import { utilityProcess, UtilityProcess } from 'electron'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as crypto from 'crypto'
import type { WorkerCommand, WorkerEvent, AVInfo } from '../workers/core-worker-protocol'

export interface EmulationWorkerInitOptions {
  corePath: string
  romPath: string
  systemDir: string
  saveDir: string
  sramDir: string
  saveStatesDir: string
  addonPath: string
}

interface PendingRequest {
  resolve: (data?: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const SHUTDOWN_TIMEOUT_MS = 5_000

/**
 * Main-process client for the emulation utility process.
 *
 * Spawns a dedicated Electron utility process that runs the emulation loop
 * with the native libretro addon. Provides an async API for all emulation
 * operations and emits events for video frames, audio samples, and errors.
 *
 * Events:
 * - `videoFrame` — `{ data: Buffer, width: number, height: number }`
 * - `audioSamples` — `{ samples: Buffer, sampleRate: number }`
 * - `error` — `{ message: string, fatal: boolean }`
 */
export class EmulationWorkerClient extends EventEmitter {
  private workerProcess: UtilityProcess | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private running = false

  /**
   * Spawn the utility process, load the core and ROM, and start the
   * emulation loop. Resolves with AV info once the worker is ready.
   */
  async init(options: EmulationWorkerInitOptions): Promise<AVInfo> {
    if (this.workerProcess) {
      await this.destroy()
    }

    const workerPath = path.join(__dirname, 'workers/core-worker.js')

    this.workerProcess = utilityProcess.fork(workerPath, [], {
      serviceName: 'LibretroCore',
    })

    this.workerProcess.on('exit', (code) => {
      if (this.running) {
        // Unexpected exit
        this.emit('error', {
          message: `Emulation worker exited unexpectedly (code ${code})`,
          fatal: true,
        })
      }
      this.cleanup()
    })

    // Wait for the 'ready' event from the worker
    const avInfo = await new Promise<AVInfo>((resolve, reject) => {
      const onMessage = (event: WorkerEvent) => {
        if (event.type === 'ready') {
          clearTimeout(initTimeout)
          this.workerProcess?.removeListener('message', onMessage)
          resolve(event.avInfo)
        } else if (event.type === 'error' && event.fatal) {
          clearTimeout(initTimeout)
          this.workerProcess?.removeListener('message', onMessage)
          reject(new Error(event.message))
        }
      }

      const proc = this.workerProcess
      if (!proc) {
        reject(new Error('Worker process failed to spawn'))
        return
      }

      proc.on('message', onMessage)

      // Timeout if worker doesn't become ready
      const initTimeout = setTimeout(() => {
        proc.removeListener('message', onMessage)
        reject(new Error('Emulation worker did not become ready within 10 seconds'))
      }, DEFAULT_REQUEST_TIMEOUT_MS)

      // Send init command
      const initCommand: WorkerCommand = { action: 'init', ...options }
      proc.postMessage(initCommand)
    })

    // Set up the permanent message handler
    this.workerProcess.on('message', (event: WorkerEvent) => {
      this.handleWorkerEvent(event)
    })

    this.running = true
    return avInfo
  }

  /**
   * Forward input to the emulation core. Fire-and-forget — no response
   * expected (input is too high-frequency for request/response).
   */
  setInput(port: number, id: number, pressed: boolean): void {
    this.postCommand({ action: 'input', port, id, pressed })
  }

  pause(): void {
    this.postCommand({ action: 'pause' })
  }

  resume(): void {
    this.postCommand({ action: 'resume' })
  }

  reset(): void {
    this.postCommand({ action: 'reset' })
  }

  async saveState(slot: number): Promise<void> {
    await this.sendRequest({ action: 'saveState', slot })
  }

  async loadState(slot: number): Promise<void> {
    await this.sendRequest({ action: 'loadState', slot })
  }

  async saveSram(): Promise<void> {
    await this.sendRequest({ action: 'saveSram' })
  }

  async screenshot(outputPath?: string): Promise<string> {
    const result = await this.sendRequest({ action: 'screenshot', outputPath })
    return (result as { path: string }).path
  }

  /**
   * Gracefully shut down the emulation worker. Saves SRAM, destroys the
   * native core, and waits for the process to exit.
   */
  async shutdown(): Promise<void> {
    if (!this.workerProcess || !this.running) return

    this.running = false

    try {
      await this.sendRequest({ action: 'shutdown' }, SHUTDOWN_TIMEOUT_MS)
    } catch {
      // Timeout or error — force kill
      this.workerProcess?.kill()
    }

    this.cleanup()
  }

  /**
   * Alias for `shutdown()` — matches the lifecycle naming used elsewhere.
   */
  async destroy(): Promise<void> {
    await this.shutdown()
  }

  /**
   * Whether the worker process is alive and running.
   */
  isRunning(): boolean {
    return this.running
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private postCommand(command: WorkerCommand): void {
    this.workerProcess?.postMessage(command)
  }

  /**
   * Send a command that expects a response, identified by `requestId`.
   * Returns a Promise that resolves/rejects when the worker responds.
   */
  private sendRequest(
    command: Record<string, unknown> & { action: string },
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    const requestId = crypto.randomUUID()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Worker request timed out: ${command.action}`))
      }, timeoutMs)

      this.pendingRequests.set(requestId, {
        resolve: (data?: unknown) => {
          clearTimeout(timeout)
          resolve(data)
        },
        reject: (error: Error) => {
          clearTimeout(timeout)
          reject(error)
        },
        timeout,
      })

      this.postCommand({ ...command, requestId } as WorkerCommand)
    })
  }

  private handleWorkerEvent(event: WorkerEvent): void {
    switch (event.type) {
      case 'videoFrame':
        this.emit('videoFrame', {
          data: event.data,
          width: event.width,
          height: event.height,
        })
        break

      case 'audioSamples':
        this.emit('audioSamples', {
          samples: event.samples,
          sampleRate: event.sampleRate,
        })
        break

      case 'error':
        this.emit('error', {
          message: event.message,
          fatal: event.fatal,
        })
        break

      case 'response': {
        const pending = this.pendingRequests.get(event.requestId)
        if (pending) {
          this.pendingRequests.delete(event.requestId)
          if (event.success) {
            pending.resolve(event.data)
          } else {
            pending.reject(new Error(event.error || 'Unknown worker error'))
          }
        }
        break
      }

      case 'ready':
        // Handled during init — ignore if received after startup
        break
    }
  }

  private cleanup(): void {
    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Worker process terminated'))
    }
    this.pendingRequests.clear()

    this.workerProcess = null
    this.running = false
  }
}
