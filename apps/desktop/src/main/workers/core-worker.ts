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
let frameTimeMs = 1000 / targetFps
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
    frameTimeMs = 1000 / targetFps
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
  let lastFrameTime = performance.now()

  const scheduleNext = () => {
    if (!isRunning) return

    const now = performance.now()
    const elapsed = now - lastFrameTime
    const remaining = frameTimeMs - elapsed

    if (remaining <= 0) {
      // We're already past the deadline — run immediately
      tick()
    } else if (remaining <= SPIN_THRESHOLD_MS) {
      // Close enough to deadline — spin-wait for precision
      spinUntil(lastFrameTime + frameTimeMs)
      tick()
    } else {
      // Sleep for most of the remaining time, then spin the rest
      const sleepMs = Math.max(0, remaining - SPIN_THRESHOLD_MS)
      loopTimer = setTimeout(() => {
        spinUntil(lastFrameTime + frameTimeMs)
        tick()
      }, sleepMs)
    }
  }

  const tick = () => {
    if (!isRunning) return

    const now = performance.now()
    lastFrameTime = now

    if (!isPaused && native) {
      try {
        native.run()
        consecutiveErrors = 0
      } catch (error) {
        consecutiveErrors++
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          `Emulation frame error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${message}`,
        )

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
          data: Buffer.from(
            frame.data.buffer,
            frame.data.byteOffset,
            frame.data.byteLength,
          ),
          width: frame.width,
          height: frame.height,
        })
      }

      // Send audio samples
      const audio = native.getAudioBuffer()
      if (audio && audio.length > 0) {
        send({
          type: 'audioSamples',
          samples: Buffer.from(
            audio.buffer,
            audio.byteOffset,
            audio.byteLength,
          ),
          sampleRate,
        })
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
