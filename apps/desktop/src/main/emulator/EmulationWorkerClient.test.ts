import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmulationWorkerClient } from './EmulationWorkerClient'
import type { WorkerEvent, AVInfo } from '../workers/core-worker-protocol'

// ---------------------------------------------------------------------------
// Mock Electron's utilityProcess.fork()
// ---------------------------------------------------------------------------

const mockPostMessage = vi.fn()
const mockKill = vi.fn()
const mockRemoveListener = vi.fn()

/** Listeners registered via mockProcess.on() */
let processListeners: Record<string, Array<(...args: unknown[]) => void>> = {}

const mockProcess = {
  postMessage: mockPostMessage,
  kill: mockKill,
  removeListener: mockRemoveListener,
  on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
    if (!processListeners[event]) processListeners[event] = []
    processListeners[event].push(listener)
  }),
}

vi.mock('electron', () => ({
  utilityProcess: {
    fork: vi.fn(() => mockProcess),
  },
}))

vi.mock('electron-log/main', () => ({
  default: {
    transports: { file: {}, console: {} },
    scope: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_AV_INFO: AVInfo = {
  geometry: {
    baseWidth: 256,
    baseHeight: 240,
    maxWidth: 256,
    maxHeight: 240,
    aspectRatio: 1.333,
  },
  timing: {
    fps: 60.0988,
    sampleRate: 44100,
  },
}

const TEST_INIT_OPTIONS = {
  corePath: '/cores/fceumm.dylib',
  romPath: '/roms/zelda.nes',
  systemDir: '/cores',
  saveDir: '/saves',
  sramDir: '/saves',
  saveStatesDir: '/savestates',
  addonPath: '/native/gamelord_libretro.node',
}

/** Simulate the worker sending a message to the main process. */
function emitWorkerMessage(event: WorkerEvent): void {
  const listeners = processListeners['message'] ?? []
  for (const listener of listeners) {
    listener(event)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmulationWorkerClient', () => {
  let client: EmulationWorkerClient

  beforeEach(() => {
    vi.useFakeTimers()
    processListeners = {}
    mockPostMessage.mockClear()
    mockKill.mockClear()
    mockRemoveListener.mockClear()
    mockProcess.on.mockClear()
    client = new EmulationWorkerClient()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('init', () => {
    it('sends init command and resolves with AV info on ready', async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)

      // Worker responds with ready
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })

      const avInfo = await initPromise

      expect(avInfo).toEqual(TEST_AV_INFO)
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'init', corePath: TEST_INIT_OPTIONS.corePath }),
      )
    })

    it('rejects on fatal error during init', async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)

      emitWorkerMessage({
        type: 'error',
        message: 'Failed to load core',
        fatal: true,
      })

      await expect(initPromise).rejects.toThrow('Failed to load core')
    })

    it('rejects on timeout if worker never becomes ready', async () => {
      let caughtError: unknown = null
      const initPromise = client.init(TEST_INIT_OPTIONS).catch((err: unknown) => {
        caughtError = err
      })

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(11_000)

      await initPromise
      expect(caughtError).toBeInstanceOf(Error)
      expect((caughtError as Error).message).toMatch('did not become ready')
    })
  })

  describe('fire-and-forget commands', () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })
      await initPromise
    })

    it('setInput sends input command', () => {
      client.setInput(0, 3, true)
      expect(mockPostMessage).toHaveBeenCalledWith({
        action: 'input',
        port: 0,
        id: 3,
        pressed: true,
      })
    })

    it('pause sends pause command', () => {
      client.pause()
      expect(mockPostMessage).toHaveBeenCalledWith({ action: 'pause' })
    })

    it('resume sends resume command', () => {
      client.resume()
      expect(mockPostMessage).toHaveBeenCalledWith({ action: 'resume' })
    })

    it('reset sends reset command', () => {
      client.reset()
      expect(mockPostMessage).toHaveBeenCalledWith({ action: 'reset' })
    })
  })

  describe('request/response commands', () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })
      await initPromise
    })

    it('saveState resolves on success response', async () => {
      const savePromise = client.saveState(1)

      // Extract the requestId from the postMessage call
      const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      expect(lastCall.action).toBe('saveState')
      expect(lastCall.slot).toBe(1)

      emitWorkerMessage({
        type: 'response',
        requestId: lastCall.requestId,
        success: true,
      })

      await expect(savePromise).resolves.toBeUndefined()
    })

    it('loadState rejects on error response', async () => {
      const loadPromise = client.loadState(3)

      const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      emitWorkerMessage({
        type: 'response',
        requestId: lastCall.requestId,
        success: false,
        error: 'No save state in slot 3',
      })

      await expect(loadPromise).rejects.toThrow('No save state in slot 3')
    })

    it('saveSram resolves on success', async () => {
      const sramPromise = client.saveSram()

      const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      emitWorkerMessage({
        type: 'response',
        requestId: lastCall.requestId,
        success: true,
      })

      await expect(sramPromise).resolves.toBeUndefined()
    })

    it('screenshot returns the file path', async () => {
      const screenshotPromise = client.screenshot('/tmp/shot.raw')

      const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      expect(lastCall.action).toBe('screenshot')
      expect(lastCall.outputPath).toBe('/tmp/shot.raw')

      emitWorkerMessage({
        type: 'response',
        requestId: lastCall.requestId,
        success: true,
        data: { path: '/tmp/shot.raw' },
      })

      await expect(screenshotPromise).resolves.toBe('/tmp/shot.raw')
    })

    it('request times out after 10 seconds', async () => {
      let caughtError: unknown = null
      const savePromise = client.saveState(0).catch((err: unknown) => {
        caughtError = err
      })

      // Don't send a response — let it timeout
      await vi.advanceTimersByTimeAsync(11_000)

      await savePromise
      expect(caughtError).toBeInstanceOf(Error)
      expect((caughtError as Error).message).toMatch('timed out')
    })
  })

  describe('event forwarding', () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })
      await initPromise
    })

    it('emits videoFrame events from worker', () => {
      const handler = vi.fn()
      client.on('videoFrame', handler)

      const frameData = Buffer.alloc(256 * 240 * 4)
      emitWorkerMessage({
        type: 'videoFrame',
        data: frameData,
        width: 256,
        height: 240,
      })

      expect(handler).toHaveBeenCalledWith({
        data: frameData,
        width: 256,
        height: 240,
      })
    })

    it('emits audioSamples events from worker', () => {
      const handler = vi.fn()
      client.on('audioSamples', handler)

      const samples = Buffer.alloc(1470)
      emitWorkerMessage({
        type: 'audioSamples',
        samples,
        sampleRate: 44100,
      })

      expect(handler).toHaveBeenCalledWith({
        samples,
        sampleRate: 44100,
      })
    })

    it('emits error events from worker', () => {
      const handler = vi.fn()
      client.on('error', handler)

      emitWorkerMessage({
        type: 'error',
        message: 'Emulation crashed',
        fatal: true,
      })

      expect(handler).toHaveBeenCalledWith({
        message: 'Emulation crashed',
        fatal: true,
      })
    })
  })

  describe('shutdown', () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })
      await initPromise
    })

    it('sends shutdown command and resolves on response', async () => {
      const shutdownPromise = client.shutdown()

      const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      expect(lastCall.action).toBe('shutdown')

      emitWorkerMessage({
        type: 'response',
        requestId: lastCall.requestId,
        success: true,
      })

      await shutdownPromise
      expect(client.isRunning()).toBe(false)
    })

    it('force-kills if shutdown times out', async () => {
      const shutdownPromise = client.shutdown()

      // Don't respond — let it timeout and force kill
      await vi.advanceTimersByTimeAsync(6_000)

      await shutdownPromise
      expect(mockKill).toHaveBeenCalled()
      expect(client.isRunning()).toBe(false)
    })

    it('rejects pending requests on cleanup', async () => {
      const savePromise = client.saveState(1)

      // Shutdown before save completes
      const shutdownPromise = client.shutdown()

      const shutdownCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      emitWorkerMessage({
        type: 'response',
        requestId: shutdownCall.requestId,
        success: true,
      })

      await shutdownPromise

      // The pending saveState should be rejected
      await expect(savePromise).rejects.toThrow('terminated')
    })
  })

  describe('unexpected exit', () => {
    beforeEach(async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })
      await initPromise
    })

    it('emits error when worker exits while still running', () => {
      const handler = vi.fn()
      client.on('error', handler)

      // Simulate worker process exiting (e.g. Electron tearing down on quit)
      const exitListeners = processListeners['exit'] ?? []
      for (const listener of exitListeners) {
        listener(0)
      }

      expect(handler).toHaveBeenCalledWith({
        message: 'Emulation worker exited unexpectedly (code 0)',
        fatal: true,
      })
      expect(client.isRunning()).toBe(false)
    })

    it('does not emit error when worker exits after shutdown', async () => {
      const handler = vi.fn()
      client.on('error', handler)

      // Graceful shutdown first
      const shutdownPromise = client.shutdown()
      const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      emitWorkerMessage({
        type: 'response',
        requestId: lastCall.requestId,
        success: true,
      })
      await shutdownPromise

      // Now simulate process exit
      const exitListeners = processListeners['exit'] ?? []
      for (const listener of exitListeners) {
        listener(0)
      }

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('isRunning', () => {
    it('returns false before init', () => {
      expect(client.isRunning()).toBe(false)
    })

    it('returns true after init', async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })
      await initPromise

      expect(client.isRunning()).toBe(true)
    })

    it('returns false after shutdown', async () => {
      const initPromise = client.init(TEST_INIT_OPTIONS)
      emitWorkerMessage({ type: 'ready', avInfo: TEST_AV_INFO })
      await initPromise

      const shutdownPromise = client.shutdown()
      const lastCall = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0]
      emitWorkerMessage({
        type: 'response',
        requestId: lastCall.requestId,
        success: true,
      })
      await shutdownPromise

      expect(client.isRunning()).toBe(false)
    })
  })
})
