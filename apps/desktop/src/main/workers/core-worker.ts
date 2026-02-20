/**
 * Emulation worker — runs in an Electron utility process.
 *
 * Loads the native libretro addon, drives the emulation loop with a hybrid
 * sleep+spin timer for sub-millisecond frame pacing, and communicates with
 * the main process via `process.parentPort`.
 */

import * as path from 'path'
import * as fs from 'fs'
import { performance } from 'perf_hooks'
import type {
  NativeAddon,
  NativeLibretroCore,
  WorkerCommand,
  WorkerEvent,
  AVInfo,
} from './core-worker-protocol'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let native: NativeLibretroCore | null = null
let isRunning = false
let isPaused = false
let loopTimer: ReturnType<typeof setTimeout> | null = null

// Paths received from main process during init
let romPath = ''
let sramDir = ''
let saveStatesDir = ''
let screenshotDir = ''

// Timing
let targetFps = 60
let speedMultiplier = 1
let sampleRate = 44100

// Error tracking
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 5



// Spin threshold: busy-wait the last N ms of each frame for precise timing
const SPIN_THRESHOLD_MS = 2

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

function send(event: WorkerEvent): void {
  process.parentPort.postMessage(event)
}

function sendResponse(
  requestId: string,
  success: boolean,
  error?: string,
  data?: unknown,
): void {
  send({ type: 'response', requestId, success, error, data })
}

// ---------------------------------------------------------------------------
// File path helpers (mirror LibretroNativeCore path logic)
// ---------------------------------------------------------------------------

function getRomName(): string {
  return romPath ? path.basename(romPath, path.extname(romPath)) : 'unknown'
}

function getSramPath(): string {
  return path.join(sramDir, `${getRomName()}.srm`)
}

function getStatePath(slot: number): string {
  const romName = getRomName()
  if (slot === 99) {
    return path.join(saveStatesDir, romName, 'autosave.sav')
  }
  return path.join(saveStatesDir, romName, `state-${slot}.sav`)
}

// ---------------------------------------------------------------------------
// SRAM management
// ---------------------------------------------------------------------------

function saveSram(): void {
  if (!native || !romPath) return
  const sramData = native.getMemoryData()
  if (!sramData || sramData.length === 0) return
  // Skip if all zeros (no save data)
  if (sramData.every((b) => b === 0)) return

  const sramFilePath = getSramPath()
  fs.mkdirSync(path.dirname(sramFilePath), { recursive: true })
  fs.writeFileSync(
    sramFilePath,
    Buffer.from(sramData.buffer, sramData.byteOffset, sramData.byteLength),
  )
}

function loadSram(): void {
  if (!native || !romPath) return
  const sramFilePath = getSramPath()
  if (!fs.existsSync(sramFilePath)) return

  const data = fs.readFileSync(sramFilePath)
  const sramData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  native.setMemoryData(sramData)
}

// ---------------------------------------------------------------------------
// Save state management
// ---------------------------------------------------------------------------

function saveState(slot: number): void {
  if (!native) throw new Error('No core loaded')

  const stateData = native.serializeState()
  if (!stateData) throw new Error('Failed to serialize state')

  const statePath = getStatePath(slot)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, Buffer.from(stateData.buffer))
}

function loadState(slot: number): void {
  if (!native) throw new Error('No core loaded')

  const statePath = getStatePath(slot)
  if (!fs.existsSync(statePath)) {
    throw new Error(`No save state in slot ${slot}`)
  }

  const data = fs.readFileSync(statePath)
  const stateData = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

  if (!native.unserializeState(stateData)) {
    throw new Error('Failed to restore state')
  }
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

function takeScreenshot(outputPath?: string): string {
  if (!native) throw new Error('No core loaded')

  const frame = native.getVideoFrame()
  if (!frame) throw new Error('No frame available')

  const dir = screenshotDir
  fs.mkdirSync(dir, { recursive: true })
  const filePath = outputPath || path.join(dir, `screenshot-${Date.now()}.raw`)
  fs.writeFileSync(filePath, Buffer.from(frame.data.buffer))
  return filePath
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function initialize(command: Extract<WorkerCommand, { action: 'init' }>): void {
  const { addonPath, corePath, systemDir, saveDir } = command

  // Store paths for later use
  romPath = command.romPath
  sramDir = command.sramDir
  saveStatesDir = command.saveStatesDir
  // Derive screenshot dir from saveStatesDir parent (userData)
  screenshotDir = path.join(path.dirname(saveStatesDir), 'screenshots')

  // Load the native addon
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- native .node addons must be loaded via require() at runtime; see https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules
  const addon = require(addonPath) as NativeAddon
  native = new addon.LibretroCore()

  // Set directories
  native.setSystemDirectory(systemDir)
  native.setSaveDirectory(saveDir)

  // Load core
  if (!native.loadCore(corePath)) {
    throw new Error(`Failed to load core: ${corePath}`)
  }

  // Load game
  if (!native.loadGame(romPath)) {
    throw new Error(`Failed to load game: ${romPath}`)
  }

  // Load SRAM from disk
  loadSram()

  // Cache AV info for timing
  const avInfo = native.getAVInfo()
  if (avInfo) {
    targetFps = avInfo.timing.fps || 60
    sampleRate = avInfo.timing.sampleRate || 44100
  }

  isRunning = true
  isPaused = false
  consecutiveErrors = 0

  send({ type: 'ready', avInfo: avInfo as AVInfo })

  startEmulationLoop()
}

// ---------------------------------------------------------------------------
// Emulation loop — hybrid sleep+spin for sub-ms frame pacing
// ---------------------------------------------------------------------------

function startEmulationLoop(): void {
  // nextFrameTime tracks when the next frame *should* fire, independent of
  // when it actually fires. This prevents jitter from accumulating as drift:
  // if a frame runs 1ms late, nextFrameTime still advances by exactly
  // frameTimeMs, so the average frame rate stays locked to the target FPS.
  // This is critical because the AudioContext consumes samples at a hardware-
  // locked rate — if we produce samples even slightly too slowly, the audio
  // buffer underruns periodically causing audible gaps.
  const basePeriod = 1000 / targetFps
  let nextFrameTime = performance.now() + basePeriod

  const scheduleNext = () => {
    if (!isRunning) return

    if (speedMultiplier > 1) {
      // Fast-forward mode: run multiple core frames per tick on a relaxed
      // timer (~16ms / 60fps). This keeps the event loop responsive so
      // incoming setSpeed commands aren't starved. Without this, speeds
      // like 8x produce ~2ms frame periods that cause the loop to spin
      // synchronously (native.run() takes longer than the deadline),
      // blocking the message handler indefinitely.
      loopTimer = setTimeout(() => {
        batchTick()
      }, 0)
      return
    }

    // Normal (1x) mode: precise hybrid sleep+spin timing
    const now = performance.now()
    const remaining = nextFrameTime - now

    if (remaining <= 0) {
      // We're already past the deadline — run immediately
      singleTick()
    } else if (remaining <= SPIN_THRESHOLD_MS) {
      // Close enough to deadline — spin-wait for precision
      spinUntil(nextFrameTime)
      singleTick()
    } else {
      // Sleep for most of the remaining time, then spin the rest
      const sleepMs = Math.max(0, remaining - SPIN_THRESHOLD_MS)
      loopTimer = setTimeout(() => {
        spinUntil(nextFrameTime)
        singleTick()
      }, sleepMs)
    }
  }

  /**
   * Fast-forward tick: runs `speedMultiplier` core frames in a batch,
   * then sends only the last video frame. Scheduled via setTimeout(0)
   * to yield the event loop between batches.
   */
  const batchTick = () => {
    if (!isRunning || isPaused || !native) {
      scheduleNext()
      return
    }

    const framesToRun = Math.round(speedMultiplier)

    for (let i = 0; i < framesToRun; i++) {
      try {
        native.run()
        consecutiveErrors = 0
      } catch (error) {
        consecutiveErrors++
        const message = error instanceof Error ? error.message : String(error)
        send({
          type: 'log',
          level: 3,
          message: `Emulation frame error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${message}`,
        })

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          send({
            type: 'error',
            message: `Emulation crashed: ${message}`,
            fatal: true,
          })
          stopEmulationLoop()
          return
        }
      }
    }

    // Send only the last frame from the batch
    const frame = native.getVideoFrame()
    if (frame) {
      send({
        type: 'videoFrame',
        data: Buffer.from(frame.data.buffer.slice(
          frame.data.byteOffset,
          frame.data.byteOffset + frame.data.byteLength,
        )),
        width: frame.width,
        height: frame.height,
      })
    }

    // Audio is skipped during fast-forward (speedMultiplier > 1)

    // Drain buffered log messages from the native addon
    const logs = native.getLogMessages()
    for (const entry of logs) {
      send({ type: 'log', level: entry.level, message: entry.message })
    }

    scheduleNext()
  }

  /**
   * Normal (1x) tick: runs a single core frame with precise timing.
   */
  const singleTick = () => {
    if (!isRunning) return

    // Advance the ideal next-frame time by exactly one frame period.
    // If we fell behind (e.g. GC pause), clamp to `now` to avoid a
    // burst of catch-up frames that would flood the IPC channel.
    const now = performance.now()
    nextFrameTime += basePeriod
    if (nextFrameTime < now - basePeriod) {
      // More than one full frame behind — reset to avoid catch-up burst
      nextFrameTime = now + basePeriod
    }

    if (!isPaused && native) {
      try {
        native.run()
        consecutiveErrors = 0
      } catch (error) {
        consecutiveErrors++
        const message = error instanceof Error ? error.message : String(error)
        send({
          type: 'log',
          level: 3,
          message: `Emulation frame error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${message}`,
        })

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          send({
            type: 'error',
            message: `Emulation crashed: ${message}`,
            fatal: true,
          })
          stopEmulationLoop()
          return
        }
      }

      // Send video frame
      const frame = native.getVideoFrame()
      if (frame) {
        send({
          type: 'videoFrame',
          data: Buffer.from(frame.data.buffer.slice(
            frame.data.byteOffset,
            frame.data.byteOffset + frame.data.byteLength,
          )),
          width: frame.width,
          height: frame.height,
        })
      }

      // Send audio samples (only at 1x speed)
      const audio = native.getAudioBuffer()
      if (audio && audio.length > 0) {
        send({
          type: 'audioSamples',
          samples: Buffer.from(audio.buffer.slice(
            audio.byteOffset,
            audio.byteOffset + audio.byteLength,
          )),
          sampleRate,
        })
      }

      // Drain buffered log messages from the native addon
      const logs = native.getLogMessages()
      for (const entry of logs) {
        send({ type: 'log', level: entry.level, message: entry.message })
      }
    }

    scheduleNext()
  }

  scheduleNext()
}

/**
 * Busy-wait until the target time. Used for the final sub-millisecond
 * portion of frame timing where setTimeout lacks precision.
 */
function spinUntil(targetTime: number): void {
  while (performance.now() < targetTime) {
    // spin
  }
}

function stopEmulationLoop(): void {
  isRunning = false
  if (loopTimer !== null) {
    clearTimeout(loopTimer)
    loopTimer = null
  }
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

function handleMessage(command: WorkerCommand): void {
  switch (command.action) {
    case 'init':
      try {
        initialize(command)
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
          fatal: true,
        })
      }
      break

    case 'pause':
      isPaused = true
      break

    case 'resume':
      isPaused = false
      break

    case 'reset':
      native?.reset()
      break

    case 'input':
      native?.setInputState(command.port, command.id, command.pressed ? 1 : 0)
      break

    case 'setSpeed': {
      const newMultiplier = Math.max(0.25, Math.min(command.multiplier, 16))
      const wasRunning = isRunning
      // Stop the current loop and restart it so the loop picks up the
      // new speed mode (batch for fast-forward, precise for 1x).
      // stopEmulationLoop sets isRunning=false, so restore it after.
      if (wasRunning) {
        if (loopTimer !== null) {
          clearTimeout(loopTimer)
          loopTimer = null
        }
      }
      speedMultiplier = newMultiplier
      send({ type: 'speedChanged', multiplier: speedMultiplier })
      if (wasRunning) {
        startEmulationLoop()
      }
      break
    }

    case 'saveState':
      try {
        saveState(command.slot)
        sendResponse(command.requestId, true)
      } catch (error) {
        sendResponse(
          command.requestId,
          false,
          error instanceof Error ? error.message : String(error),
        )
      }
      break

    case 'loadState':
      try {
        loadState(command.slot)
        sendResponse(command.requestId, true)
      } catch (error) {
        sendResponse(
          command.requestId,
          false,
          error instanceof Error ? error.message : String(error),
        )
      }
      break

    case 'saveSram':
      try {
        saveSram()
        sendResponse(command.requestId, true)
      } catch (error) {
        sendResponse(
          command.requestId,
          false,
          error instanceof Error ? error.message : String(error),
        )
      }
      break

    case 'screenshot':
      try {
        const screenshotPath = takeScreenshot(command.outputPath)
        sendResponse(command.requestId, true, undefined, {
          path: screenshotPath,
        })
      } catch (error) {
        sendResponse(
          command.requestId,
          false,
          error instanceof Error ? error.message : String(error),
        )
      }
      break

    case 'shutdown':
      try {
        stopEmulationLoop()
        saveSram()
        if (native) {
          native.destroy()
          native = null
        }
        sendResponse(command.requestId, true)
      } catch (error) {
        sendResponse(
          command.requestId,
          false,
          error instanceof Error ? error.message : String(error),
        )
      }
      // Exit after sending response
      setTimeout(() => process.exit(0), 50)
      break
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

process.parentPort.on('message', (event: { data: WorkerCommand }) => {
  handleMessage(event.data)
})
