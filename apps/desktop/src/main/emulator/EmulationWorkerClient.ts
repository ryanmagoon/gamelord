import { utilityProcess, UtilityProcess } from "electron";
import { EventEmitter } from "node:events";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type {
  WorkerCommand,
  WorkerEvent,
  AVInfo,
  SaveStateMetadata,
} from "../workers/core-worker-protocol";
import {
  RETRO_LOG_DEBUG,
  RETRO_LOG_INFO,
  RETRO_LOG_WARN,
  RETRO_LOG_ERROR,
} from "../workers/core-worker-protocol";
import {
  computeVideoBufferSize,
  CTRL_SAB_BYTE_LENGTH,
  CTRL_AUDIO_SAMPLE_RATE,
  AUDIO_RING_BYTE_LENGTH,
} from "../workers/shared-frame-protocol";
import { libretroLog } from "../logger";

export interface EmulationWorkerInitOptions {
  addonPath: string;
  corePath: string;
  romPath: string;
  saveDir: string;
  saveStatesDir: string;
  sramDir: string;
  systemDir: string;
  /** All disc paths for multi-disc games, ordered by disc number. */
  discPaths?: Array<string>;
  /** 0-indexed disc to start on (defaults to 0). */
  initialDiscIndex?: number;
  /** Force-enable save states for HW-render cores (for testing). */
  forceHWSaveStates?: boolean;
}

interface PendingRequest {
  reject: (error: Error) => void;
  resolve: (data?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5000;

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
export interface SharedBuffers {
  audio: SharedArrayBuffer;
  control: SharedArrayBuffer;
  video: SharedArrayBuffer;
}

export class EmulationWorkerClient extends EventEmitter {
  private workerProcess: UtilityProcess | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private running = false;
  private shuttingDown = false;
  private sharedBuffers: SharedBuffers | null = null;
  private detectedSerial: string | null = null;

  /**
   * Spawn the utility process, load the core and ROM, and start the
   * emulation loop. Resolves with AV info once the worker is ready.
   */
  async init(
    options: EmulationWorkerInitOptions,
  ): Promise<{ avInfo: AVInfo; saveStatesSupported: boolean }> {
    if (this.workerProcess) {
      await this.destroy();
    }

    const workerPath = path.join(__dirname, "workers/core-worker.js");

    this.workerProcess = utilityProcess.fork(workerPath, [], {
      serviceName: "LibretroCore",
    });

    this.workerProcess.on("exit", (code) => {
      if (this.running && !this.shuttingDown) {
        // Unexpected exit — only emit if we're not in the middle of
        // a graceful shutdown (the process can exit before the async
        // shutdown handshake completes, e.g. during app quit).
        this.emit("error", {
          fatal: true,
          message: `Emulation worker exited unexpectedly (code ${code})`,
        });
      }
      this.cleanup();
    });

    // Wait for the 'ready' event from the worker
    const initResult = await new Promise<{ avInfo: AVInfo; saveStatesSupported: boolean }>(
      (resolve, reject) => {
        const onMessage = (event: WorkerEvent) => {
          if (event.type === "ready") {
            clearTimeout(initTimeout);
            this.workerProcess?.removeListener("message", onMessage);
            resolve({ avInfo: event.avInfo, saveStatesSupported: event.saveStatesSupported });
          } else if (event.type === "error" && event.fatal) {
            clearTimeout(initTimeout);
            this.workerProcess?.removeListener("message", onMessage);
            reject(new Error(event.message));
          } else if (event.type === "serialDetected") {
            // CD-ROM serial arrives before "ready" — capture it early
            this.detectedSerial = event.serial;
            libretroLog.info(`CD-ROM serial detected: ${event.serial}`);
          }
        };

        const proc = this.workerProcess;
        if (!proc) {
          reject(new Error("Worker process failed to spawn"));
          return;
        }

        proc.on("message", onMessage);

        // Timeout if worker doesn't become ready
        const initTimeout = setTimeout(() => {
          proc.removeListener("message", onMessage);
          reject(new Error("Emulation worker did not become ready within 10 seconds"));
        }, DEFAULT_REQUEST_TIMEOUT_MS);

        // Send init command
        const initCommand: WorkerCommand = { action: "init", ...options };
        proc.postMessage(initCommand);
      },
    );

    const { avInfo, saveStatesSupported } = initResult;

    // Set up the permanent message handler
    this.workerProcess.on("message", (event: WorkerEvent) => {
      this.handleWorkerEvent(event);
    });

    // Allocate SharedArrayBuffers for zero-copy frame/audio transfer.
    // Falls back to copy-based IPC if SAB is unavailable.
    this.setupSharedBuffers(avInfo);

    this.running = true;
    return { avInfo, saveStatesSupported };
  }

  /**
   * Forward input to the emulation core. Fire-and-forget — no response
   * expected (input is too high-frequency for request/response).
   */
  setInput(port: number, id: number, pressed: boolean): void {
    this.postCommand({ action: "input", id, port, pressed });
  }

  setInputAnalog(port: number, index: number, id: number, value: number): void {
    this.postCommand({ action: "inputAnalog", port, index, id, value });
  }

  pause(): void {
    this.postCommand({ action: "pause" });
    this.emit("paused");
  }

  resume(): void {
    this.postCommand({ action: "resume" });
    this.emit("resumed");
  }

  reset(): void {
    this.postCommand({ action: "reset" });
    this.emit("reset");
  }

  setSpeed(multiplier: number): void {
    this.postCommand({ action: "setSpeed", multiplier });
  }

  setFastForwardAudio(enabled: boolean): void {
    this.postCommand({ action: "setFastForwardAudio", enabled });
  }

  async saveState(slot: number): Promise<void> {
    await this.sendRequest({ action: "saveState", slot });
  }

  async loadState(slot: number): Promise<void> {
    await this.sendRequest({ action: "loadState", slot });
  }

  async saveSram(): Promise<void> {
    await this.sendRequest({ action: "saveSram" });
  }

  async screenshot(outputPath?: string): Promise<string> {
    const result = await this.sendRequest<{ path: string }>({ action: "screenshot", outputPath });
    return result.path;
  }

  async listSaveStates(): Promise<Array<SaveStateMetadata>> {
    const result = await this.sendRequest<{ states: Array<SaveStateMetadata> }>({
      action: "listSaveStates",
    });
    return result.states;
  }

  async cheatReset(): Promise<void> {
    await this.sendRequest({ action: "cheatReset" });
  }

  async cheatSet(index: number, enabled: boolean, code: string): Promise<void> {
    await this.sendRequest({ action: "cheatSet", index, enabled, code });
  }

  async swapDisc(index: number): Promise<void> {
    await this.sendRequest({ action: "swapDisc", index });
  }

  async getDiscInfo(): Promise<{
    total: number;
    currentIndex: number;
    labels: Array<string | null>;
  }> {
    return this.sendRequest<{
      total: number;
      currentIndex: number;
      labels: Array<string | null>;
    }>({ action: "getDiscInfo" });
  }

  async replaceDiscImage(index: number, path: string): Promise<void> {
    await this.sendRequest({ action: "replaceDiscImage", index, path });
  }

  async addDiscImage(path: string): Promise<{ index: number }> {
    return this.sendRequest<{ index: number }>({
      action: "addDiscImage",
      path,
    });
  }

  /**
   * Mark the worker as shutting down so that a process exit during the
   * async shutdown sequence doesn't emit an unexpected-exit error.
   * Call this synchronously at the start of app quit, before awaiting
   * the full shutdown handshake.
   */
  prepareForQuit(): void {
    this.shuttingDown = true;
  }

  /**
   * Gracefully shut down the emulation worker. Saves SRAM, destroys the
   * native core, and waits for the process to exit.
   */
  async shutdown(): Promise<void> {
    if (!this.workerProcess || !this.running) {
      return;
    }

    this.shuttingDown = true;
    this.running = false;

    try {
      await this.sendRequest({ action: "shutdown" }, SHUTDOWN_TIMEOUT_MS);
    } catch {
      // Timeout or error — force kill
      this.workerProcess?.kill();
    }

    this.cleanup();
  }

  /**
   * Alias for `shutdown()` — matches the lifecycle naming used elsewhere.
   */
  async destroy(): Promise<void> {
    await this.shutdown();
  }

  /**
   * Whether the worker process is alive and running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Returns the SharedArrayBuffers for zero-copy frame/audio transfer,
   * or null if SAB mode is not active (allocation failed or unavailable).
   */
  getSharedBuffers(): SharedBuffers | null {
    return this.sharedBuffers;
  }

  /**
   * Returns the CD-ROM serial detected from core log messages (PSX only),
   * or null if no serial was detected (cartridge-based systems, or core
   * didn't log one).
   */
  getDetectedSerial(): string | null {
    return this.detectedSerial;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private setupSharedBuffers(avInfo: AVInfo): void {
    try {
      if (typeof SharedArrayBuffer === "undefined") {
        return;
      }

      const videoBufferSize = computeVideoBufferSize(
        avInfo.geometry.maxWidth,
        avInfo.geometry.maxHeight,
        avInfo.geometry.baseWidth,
        avInfo.geometry.baseHeight,
      );

      const controlSAB = new SharedArrayBuffer(CTRL_SAB_BYTE_LENGTH);
      const videoSAB = new SharedArrayBuffer(videoBufferSize * 2); // double buffer
      const audioSAB = new SharedArrayBuffer(AUDIO_RING_BYTE_LENGTH);

      // Initialize audio sample rate in control buffer
      const ctrl = new Int32Array(controlSAB);
      Atomics.store(ctrl, CTRL_AUDIO_SAMPLE_RATE, avInfo.timing.sampleRate || 44_100);

      this.sharedBuffers = { audio: audioSAB, control: controlSAB, video: videoSAB };

      // Send SABs to the worker
      this.postCommand({
        action: "setupSharedBuffers",
        audioSAB,
        controlSAB,
        videoBufferSize,
        videoSAB,
      });

      libretroLog.info(
        `SharedArrayBuffer enabled: video=${videoBufferSize * 2} bytes (double-buffered), ` +
          `audio=${AUDIO_RING_BYTE_LENGTH} bytes (ring buffer)`,
      );
    } catch (error) {
      libretroLog.warn("SharedArrayBuffer unavailable, using copy-based IPC:", error);
      this.sharedBuffers = null;
    }
  }

  private postCommand(command: WorkerCommand): void {
    this.workerProcess?.postMessage(command);
  }

  /**
   * Send a command that expects a response, identified by `requestId`.
   * Returns a Promise that resolves/rejects when the worker responds.
   */
  private sendRequest<T = void>(
    command: Record<string, unknown> & { action: string },
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Worker request timed out: ${command.action}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        resolve: (data?: unknown) => {
          clearTimeout(timeout);
          resolve(data as T);
        },
        timeout,
      });

      this.postCommand({ ...command, requestId } as WorkerCommand);
    });
  }

  private handleWorkerEvent(event: WorkerEvent): void {
    switch (event.type) {
      case "videoFrame":
        this.emit("videoFrame", {
          data: event.data,
          height: event.height,
          width: event.width,
        });
        break;

      case "audioSamples":
        this.emit("audioSamples", {
          sampleRate: event.sampleRate,
          samples: event.samples,
        });
        break;

      case "error":
        this.emit("error", {
          fatal: event.fatal,
          message: event.message,
        });
        break;

      case "speedChanged":
        this.emit("speedChanged", { multiplier: event.multiplier });
        break;

      case "response": {
        const pending = this.pendingRequests.get(event.requestId);
        if (pending) {
          this.pendingRequests.delete(event.requestId);
          if (event.success) {
            pending.resolve(event.data);
          } else {
            pending.reject(new Error(event.error || "Unknown worker error"));
          }
        }
        break;
      }

      case "log":
        // Route native addon log messages through electron-log.
        switch (event.level) {
          case RETRO_LOG_DEBUG:
            libretroLog.debug(event.message);
            break;
          case RETRO_LOG_INFO:
            libretroLog.info(event.message);
            break;
          case RETRO_LOG_WARN:
            libretroLog.warn(event.message);
            break;
          case RETRO_LOG_ERROR:
            libretroLog.error(event.message);
            break;
          default:
            libretroLog.info(event.message);
            break;
        }
        break;

      case "serialDetected":
        this.detectedSerial = event.serial;
        libretroLog.info(`CD-ROM serial detected: ${event.serial}`);
        break;

      case "discChanged":
        this.emit("discChanged", { index: event.index, total: event.total });
        break;

      case "ready":
        // Handled during init — ignore if received after startup
        break;
    }
  }

  private cleanup(): void {
    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Worker process terminated"));
    }
    this.pendingRequests.clear();

    this.workerProcess = null;
    this.running = false;
    this.shuttingDown = false;
    this.sharedBuffers = null;
    this.detectedSerial = null;
  }
}
