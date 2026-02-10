import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import * as path from 'path'

// --- Module mocks (must be hoisted before any imports that use them) ---

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((type: string) => {
      if (type === 'userData') return '/tmp/test-userdata'
      return '/tmp/test'
    }),
    getAppPath: vi.fn(() => '/tmp/test-app'),
  },
}))

vi.mock('../logger', () => ({
  emulatorLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  libretroLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('../utils/pathValidation', () => ({
  validateRomPath: vi.fn((p: string) => p),
  validateCorePath: vi.fn((p: string) => p),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

import * as fs from 'fs'
import { LibretroNativeCore } from './LibretroNativeCore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Access private fields on a LibretroNativeCore for test injection. */
function internals(c: LibretroNativeCore) {
  return c as unknown as Record<string, unknown>
}

/** Creates a mock that mimics the native LibretroCore instance. */
function createMockNative() {
  return {
    loadCore: vi.fn(() => true),
    loadGame: vi.fn(() => true),
    unloadGame: vi.fn(),
    run: vi.fn(),
    reset: vi.fn(),
    getSystemInfo: vi.fn(() => null),
    getAVInfo: vi.fn(() => ({
      geometry: { baseWidth: 256, baseHeight: 240, maxWidth: 256, maxHeight: 240, aspectRatio: 1.333 },
      timing: { fps: 60, sampleRate: 44100 },
    })),
    getVideoFrame: vi.fn((): { data: Uint8Array; width: number; height: number } | null => ({ data: new Uint8Array(256 * 240 * 4), width: 256, height: 240 })),
    getAudioBuffer: vi.fn(() => new Int16Array(2048)),
    setInputState: vi.fn(),
    serializeState: vi.fn((): Uint8Array | null => new Uint8Array([1, 2, 3, 4])),
    unserializeState: vi.fn(() => true),
    getSerializeSize: vi.fn(() => 4),
    destroy: vi.fn(),
    isLoaded: vi.fn(() => true),
    setSystemDirectory: vi.fn(),
    setSaveDirectory: vi.fn(),
    getMemoryData: vi.fn((): Uint8Array | null => new Uint8Array([0, 1, 2, 3])),
    getMemorySize: vi.fn(() => 4),
    setMemoryData: vi.fn(),
    getLogMessages: vi.fn((): Array<{ level: number; message: string }> => []),
  }
}

/**
 * Creates a mock NativeAddon whose LibretroCore constructor returns the mock native.
 * Uses a real function (not arrow) so it can be called with `new`.
 */
function createMockAddon(mockNative?: ReturnType<typeof createMockNative>) {
  const native = mockNative ?? createMockNative()
  // Use a regular function so `new` works
  function MockLibretroCore() {
    return native
  }
  return { addon: { LibretroCore: MockLibretroCore as unknown as new () => ReturnType<typeof createMockNative> }, mockNative: native }
}

/**
 * Inject a mock native addon into a LibretroNativeCore instance so we can
 * test methods that depend on `this.native` and `this.addon` without
 * actually calling `loadNativeAddon()`.
 */
function injectMockNative(core: LibretroNativeCore) {
  const mockNative = createMockNative()
  const mockAddon = { LibretroCore: vi.fn(() => mockNative) }

  // Access private fields to inject the mock
  internals(core).native = mockNative
  internals(core).addon = mockAddon
  internals(core).isRunning = true
  internals(core).emulationRunning = true
  internals(core).romPath = '/roms/TestGame.nes'

  return { mockNative, mockAddon }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LibretroNativeCore', () => {
  let core: LibretroNativeCore

  beforeEach(() => {
    vi.clearAllMocks()
    core = new LibretroNativeCore('/cores')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('creates save state and SRAM directories', () => {
      const mkdirSync = fs.mkdirSync as Mock
      expect(mkdirSync).toHaveBeenCalledWith(
        path.join('/tmp/test-userdata', 'savestates'),
        { recursive: true },
      )
      expect(mkdirSync).toHaveBeenCalledWith(
        path.join('/tmp/test-userdata', 'saves'),
        { recursive: true },
      )
    })

    it('inherits name and emulatorPath from EmulatorCore', () => {
      expect(core.name).toBe('LibretroNative')
      expect(core.emulatorPath).toBe('/cores')
    })
  })

  // -----------------------------------------------------------------------
  // launch()
  // -----------------------------------------------------------------------

  describe('launch', () => {
    it('throws if emulator is already running', async () => {
      internals(core).isRunning = true
      await expect(core.launch('/roms/game.nes', { corePath: '/cores/core.dylib' }))
        .rejects.toThrow('Emulator is already running')
    })

    it('throws if corePath is not provided', async () => {
      await expect(core.launch('/roms/game.nes'))
        .rejects.toThrow('Core path is required')
    })

    it('throws if corePath is explicitly undefined', async () => {
      await expect(core.launch('/roms/game.nes', {}))
        .rejects.toThrow('Core path is required')
    })

    it('loads addon, core, game, SRAM and emits launched on success', async () => {
      const { addon, mockNative } = createMockAddon()

      // Make loadNativeAddon succeed by injecting the addon before launch
      internals(core).addon = addon

      // existsSync returning false means no SRAM to load
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const launchedSpy = vi.fn()
      core.on('launched', launchedSpy)

      await core.launch('/roms/TestGame.nes', { corePath: '/cores/snes9x.dylib' })

      // Core and game loaded
      expect(mockNative.loadCore).toHaveBeenCalledWith('/cores/snes9x.dylib')
      expect(mockNative.loadGame).toHaveBeenCalledWith('/roms/TestGame.nes')

      // Directories set
      expect(mockNative.setSystemDirectory).toHaveBeenCalledWith(path.dirname('/cores/snes9x.dylib'))
      expect(mockNative.setSaveDirectory).toHaveBeenCalledWith(
        path.join('/tmp/test-userdata', 'saves'),
      )

      // AV info fetched
      expect(mockNative.getAVInfo).toHaveBeenCalled()

      // Event emitted
      expect(launchedSpy).toHaveBeenCalledWith({
        romPath: '/roms/TestGame.nes',
        corePath: '/cores/snes9x.dylib',
      })

      expect(core.isActive()).toBe(true)
    })

    it('loads existing SRAM on launch when file exists', async () => {
      const { addon, mockNative } = createMockAddon()
      internals(core).addon = addon

      const sramBuffer = Buffer.from([10, 20, 30, 40])
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.srm')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockReturnValue(sramBuffer)

      await core.launch('/roms/TestGame.nes', { corePath: '/cores/core.dylib' })

      expect(mockNative.setMemoryData).toHaveBeenCalledWith(
        expect.any(Uint8Array),
      )
    })

    it('cleans up on core load failure', async () => {
      const mockNative = createMockNative()
      mockNative.loadCore.mockReturnValue(false)
      const { addon } = createMockAddon(mockNative)
      internals(core).addon = addon
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const terminatedSpy = vi.fn()
      core.on('terminated', terminatedSpy)

      await expect(core.launch('/roms/game.nes', { corePath: '/cores/bad.dylib' }))
        .rejects.toThrow('Failed to load core')

      // cleanup should have been called
      expect(terminatedSpy).toHaveBeenCalled()
      expect(core.isActive()).toBe(false)
    })

    it('cleans up on game load failure', async () => {
      const mockNative = createMockNative()
      mockNative.loadGame.mockReturnValue(false)
      const { addon } = createMockAddon(mockNative)
      internals(core).addon = addon
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const terminatedSpy = vi.fn()
      core.on('terminated', terminatedSpy)

      await expect(core.launch('/roms/bad.nes', { corePath: '/cores/core.dylib' }))
        .rejects.toThrow('Failed to load game')

      expect(terminatedSpy).toHaveBeenCalled()
      expect(core.isActive()).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // runFrame()
  // -----------------------------------------------------------------------

  describe('runFrame', () => {
    it('calls native.run() when running and not paused', () => {
      const { mockNative } = injectMockNative(core)

      core.runFrame()

      expect(mockNative.run).toHaveBeenCalledOnce()
    })

    it('drains native log messages after running a frame', () => {
      const { mockNative } = injectMockNative(core)
      mockNative.getLogMessages.mockReturnValue([
        { level: 0, message: 'debug msg\n' },
        { level: 1, message: 'info msg\n' },
        { level: 2, message: 'warn msg\n' },
        { level: 3, message: 'error msg\n' },
        { level: 99, message: 'unknown level\n' },
      ])

      core.runFrame()

      expect(mockNative.getLogMessages).toHaveBeenCalled()
    })

    it('skips when paused', () => {
      const { mockNative } = injectMockNative(core)
      internals(core).paused = true

      core.runFrame()

      expect(mockNative.run).not.toHaveBeenCalled()
    })

    it('skips when not running', () => {
      const { mockNative } = injectMockNative(core)
      internals(core).emulationRunning = false

      core.runFrame()

      expect(mockNative.run).not.toHaveBeenCalled()
    })

    it('skips when native is null', () => {
      // No mock injected, native is null by default
      expect(() => core.runFrame()).not.toThrow()
    })
  })

  // -----------------------------------------------------------------------
  // getVideoFrame()
  // -----------------------------------------------------------------------

  describe('getVideoFrame', () => {
    it('delegates to native and returns frame data', () => {
      const { mockNative } = injectMockNative(core)
      const frame = { data: new Uint8Array(4), width: 2, height: 2 }
      mockNative.getVideoFrame.mockReturnValue(frame)

      expect(core.getVideoFrame()).toBe(frame)
    })

    it('returns null when native is not initialized', () => {
      expect(core.getVideoFrame()).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // getAudioBuffer()
  // -----------------------------------------------------------------------

  describe('getAudioBuffer', () => {
    it('delegates to native and returns audio data', () => {
      const { mockNative } = injectMockNative(core)
      const audio = new Int16Array([100, 200])
      mockNative.getAudioBuffer.mockReturnValue(audio)

      expect(core.getAudioBuffer()).toBe(audio)
    })

    it('returns null when native is not initialized', () => {
      expect(core.getAudioBuffer()).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // getAVInfo()
  // -----------------------------------------------------------------------

  describe('getAVInfo', () => {
    it('returns null before launch', () => {
      expect(core.getAVInfo()).toBeNull()
    })

    it('returns av info after it has been set', () => {
      const avInfo = {
        geometry: { baseWidth: 256, baseHeight: 240, maxWidth: 256, maxHeight: 240, aspectRatio: 1.333 },
        timing: { fps: 60, sampleRate: 44100 },
      }
      internals(core).avInfo = avInfo

      expect(core.getAVInfo()).toEqual(avInfo)
    })
  })

  // -----------------------------------------------------------------------
  // setInput()
  // -----------------------------------------------------------------------

  describe('setInput', () => {
    it('maps pressed=true to value=1', () => {
      const { mockNative } = injectMockNative(core)

      core.setInput(0, 8, true)

      expect(mockNative.setInputState).toHaveBeenCalledWith(0, 8, 1)
    })

    it('maps pressed=false to value=0', () => {
      const { mockNative } = injectMockNative(core)

      core.setInput(1, 3, false)

      expect(mockNative.setInputState).toHaveBeenCalledWith(1, 3, 0)
    })

    it('does not throw when native is null', () => {
      expect(() => core.setInput(0, 0, true)).not.toThrow()
    })
  })

  // -----------------------------------------------------------------------
  // saveState()
  // -----------------------------------------------------------------------

  describe('saveState', () => {
    it('serializes and writes state to the correct path', async () => {
      const { mockNative } = injectMockNative(core)
      const stateData = new Uint8Array([10, 20, 30])
      mockNative.serializeState.mockReturnValue(stateData)

      await core.saveState(1)

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'TestGame', 'state-1.sav')
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true })
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expectedPath,
        expect.any(Buffer),
      )
    })

    it('uses autosave.sav for slot 99', async () => {
      injectMockNative(core)

      await core.saveState(99)

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'TestGame', 'autosave.sav')
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, expect.any(Buffer))
    })

    it('throws when no game is running', async () => {
      await expect(core.saveState(0)).rejects.toThrow('No game running')
    })

    it('throws when serialization fails', async () => {
      const { mockNative } = injectMockNative(core)
      mockNative.serializeState.mockReturnValue(null)

      await expect(core.saveState(0)).rejects.toThrow('Failed to serialize state')
    })

    it('emits stateSaved event', async () => {
      injectMockNative(core)
      const spy = vi.fn()
      core.on('stateSaved', spy)

      await core.saveState(2)

      expect(spy).toHaveBeenCalledWith({ slot: 2 })
    })
  })

  // -----------------------------------------------------------------------
  // loadState()
  // -----------------------------------------------------------------------

  describe('loadState', () => {
    it('reads and unserializes from the correct path', async () => {
      const { mockNative } = injectMockNative(core)
      const stateBuffer = Buffer.from([10, 20, 30, 40])
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(stateBuffer)

      await core.loadState(1)

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'TestGame', 'state-1.sav')
      expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath)
      expect(mockNative.unserializeState).toHaveBeenCalledWith(expect.any(Uint8Array))
    })

    it('throws when no game is running', async () => {
      await expect(core.loadState(0)).rejects.toThrow('No game running')
    })

    it('throws when state file does not exist', async () => {
      injectMockNative(core)
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(core.loadState(5)).rejects.toThrow('No save state in slot 5')
    })

    it('throws when unserialize fails', async () => {
      const { mockNative } = injectMockNative(core)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from([1, 2, 3]))
      mockNative.unserializeState.mockReturnValue(false)

      await expect(core.loadState(0)).rejects.toThrow('Failed to restore state')
    })

    it('emits stateLoaded event', async () => {
      injectMockNative(core)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from([1, 2]))
      const spy = vi.fn()
      core.on('stateLoaded', spy)

      await core.loadState(3)

      expect(spy).toHaveBeenCalledWith({ slot: 3 })
    })
  })

  // -----------------------------------------------------------------------
  // screenshot()
  // -----------------------------------------------------------------------

  describe('screenshot', () => {
    it('writes frame data to a default path when no outputPath given', async () => {
      const { mockNative } = injectMockNative(core)
      const frame = { data: new Uint8Array([255, 0, 128, 64]), width: 1, height: 1 }
      mockNative.getVideoFrame.mockReturnValue(frame)

      const result = await core.screenshot()

      expect(result).toContain('screenshots')
      expect(result).toContain('screenshot-')
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/tmp/test-userdata', 'screenshots'),
        { recursive: true },
      )
      expect(fs.writeFileSync).toHaveBeenCalledWith(result, expect.any(Buffer))
    })

    it('writes to the specified outputPath', async () => {
      const { mockNative } = injectMockNative(core)
      mockNative.getVideoFrame.mockReturnValue({ data: new Uint8Array(4), width: 1, height: 1 })

      const result = await core.screenshot('/custom/screenshot.raw')

      expect(result).toBe('/custom/screenshot.raw')
      expect(fs.writeFileSync).toHaveBeenCalledWith('/custom/screenshot.raw', expect.any(Buffer))
    })

    it('throws when no game is running', async () => {
      await expect(core.screenshot()).rejects.toThrow('No game running')
    })

    it('throws when no frame is available', async () => {
      const { mockNative } = injectMockNative(core)
      mockNative.getVideoFrame.mockReturnValue(null)

      await expect(core.screenshot()).rejects.toThrow('No frame available')
    })

    it('emits screenshotTaken event', async () => {
      injectMockNative(core)
      const spy = vi.fn()
      core.on('screenshotTaken', spy)

      const result = await core.screenshot()

      expect(spy).toHaveBeenCalledWith({ path: result })
    })
  })

  // -----------------------------------------------------------------------
  // pause() / resume()
  // -----------------------------------------------------------------------

  describe('pause', () => {
    it('sets paused state and emits event', async () => {
      injectMockNative(core)
      const spy = vi.fn()
      core.on('paused', spy)

      await core.pause()

      expect(spy).toHaveBeenCalledOnce()
    })

    it('does not emit again if already paused', async () => {
      injectMockNative(core)
      const spy = vi.fn()
      core.on('paused', spy)

      await core.pause()
      await core.pause()

      expect(spy).toHaveBeenCalledOnce()
    })
  })

  describe('resume', () => {
    it('clears paused state and emits event', async () => {
      injectMockNative(core)
      const spy = vi.fn()
      core.on('resumed', spy)

      await core.pause()
      await core.resume()

      expect(spy).toHaveBeenCalledOnce()
    })

    it('does not emit if not paused', async () => {
      injectMockNative(core)
      const spy = vi.fn()
      core.on('resumed', spy)

      await core.resume()

      expect(spy).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------------

  describe('reset', () => {
    it('calls native.reset() and emits event', async () => {
      const { mockNative } = injectMockNative(core)
      const spy = vi.fn()
      core.on('reset', spy)

      await core.reset()

      expect(mockNative.reset).toHaveBeenCalledOnce()
      expect(spy).toHaveBeenCalledOnce()
    })

    it('does not throw when native is null', async () => {
      const spy = vi.fn()
      core.on('reset', spy)

      await expect(core.reset()).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // terminate()
  // -----------------------------------------------------------------------

  describe('terminate', () => {
    it('saves SRAM, destroys native, and emits terminated', async () => {
      const { mockNative } = injectMockNative(core)
      const spy = vi.fn()
      core.on('terminated', spy)

      await core.terminate()

      expect(mockNative.getMemoryData).toHaveBeenCalled()
      expect(mockNative.destroy).toHaveBeenCalledOnce()
      expect(spy).toHaveBeenCalled()
      expect(core.isActive()).toBe(false)
    })

    it('handles terminate when native is null', async () => {
      const spy = vi.fn()
      core.on('terminated', spy)

      await expect(core.terminate()).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // saveSram()
  // -----------------------------------------------------------------------

  describe('saveSram', () => {
    it('writes non-zero SRAM to the correct path', () => {
      const { mockNative } = injectMockNative(core)
      const sramData = new Uint8Array([0, 1, 2, 3])
      mockNative.getMemoryData.mockReturnValue(sramData)

      core.saveSram()

      const expectedPath = path.join('/tmp/test-userdata', 'saves', 'TestGame.srm')
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true })
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, expect.any(Buffer))
    })

    it('skips writing when SRAM is all zeros', () => {
      const { mockNative } = injectMockNative(core)
      mockNative.getMemoryData.mockReturnValue(new Uint8Array([0, 0, 0, 0]))

      core.saveSram()

      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('skips writing when SRAM is null', () => {
      const { mockNative } = injectMockNative(core)
      mockNative.getMemoryData.mockReturnValue(null)

      core.saveSram()

      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('skips writing when SRAM is empty', () => {
      const { mockNative } = injectMockNative(core)
      mockNative.getMemoryData.mockReturnValue(new Uint8Array([]))

      core.saveSram()

      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('does nothing when native is null', () => {
      core.saveSram()
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('does nothing when romPath is null', () => {
      injectMockNative(core)
      internals(core).romPath = null

      core.saveSram()

      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // hasAutoSave()
  // -----------------------------------------------------------------------

  describe('hasAutoSave', () => {
    it('checks the correct autosave file path', () => {
      injectMockNative(core)
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = core.hasAutoSave()

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'TestGame', 'autosave.sav')
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
      expect(result).toBe(true)
    })

    it('returns false when autosave does not exist', () => {
      injectMockNative(core)
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(core.hasAutoSave()).toBe(false)
    })

    it('uses "unknown" when romPath is not set', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      core.hasAutoSave()

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'unknown', 'autosave.sav')
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
    })
  })

  // -----------------------------------------------------------------------
  // hasAutoSaveForRom()
  // -----------------------------------------------------------------------

  describe('hasAutoSaveForRom', () => {
    it('checks the correct path for a given ROM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = core.hasAutoSaveForRom('/roms/Zelda.sfc')

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'Zelda', 'autosave.sav')
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath)
      expect(result).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // deleteAutoSave()
  // -----------------------------------------------------------------------

  describe('deleteAutoSave', () => {
    it('removes the autosave file when it exists', () => {
      injectMockNative(core)
      vi.mocked(fs.existsSync).mockReturnValue(true)

      core.deleteAutoSave()

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'TestGame', 'autosave.sav')
      expect(fs.unlinkSync).toHaveBeenCalledWith(expectedPath)
    })

    it('does nothing when autosave does not exist', () => {
      injectMockNative(core)
      vi.mocked(fs.existsSync).mockReturnValue(false)

      core.deleteAutoSave()

      expect(fs.unlinkSync).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // deleteAutoSaveForRom()
  // -----------------------------------------------------------------------

  describe('deleteAutoSaveForRom', () => {
    it('removes the autosave file for a specific ROM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      core.deleteAutoSaveForRom('/roms/Metroid.sfc')

      const expectedPath = path.join('/tmp/test-userdata', 'savestates', 'Metroid', 'autosave.sav')
      expect(fs.unlinkSync).toHaveBeenCalledWith(expectedPath)
    })

    it('does nothing when the autosave does not exist for the ROM', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      core.deleteAutoSaveForRom('/roms/Metroid.sfc')

      expect(fs.unlinkSync).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // getStatePath (tested indirectly via saveState/loadState paths)
  // -----------------------------------------------------------------------

  describe('getStatePath (via saveState)', () => {
    it('slot 99 maps to autosave.sav', async () => {
      injectMockNative(core)

      await core.saveState(99)

      const writtenPath = (fs.writeFileSync as Mock).mock.calls[0][0] as string
      expect(writtenPath).toContain('autosave.sav')
      expect(writtenPath).not.toContain('state-99')
    })

    it('slot 0 maps to state-0.sav', async () => {
      injectMockNative(core)

      await core.saveState(0)

      const writtenPath = (fs.writeFileSync as Mock).mock.calls[0][0] as string
      expect(writtenPath).toContain('state-0.sav')
    })

    it('slot 5 maps to state-5.sav', async () => {
      injectMockNative(core)

      await core.saveState(5)

      const writtenPath = (fs.writeFileSync as Mock).mock.calls[0][0] as string
      expect(writtenPath).toContain('state-5.sav')
    })
  })

  // -----------------------------------------------------------------------
  // isActive()
  // -----------------------------------------------------------------------

  describe('isActive', () => {
    it('returns true when running and native is set', () => {
      injectMockNative(core)
      expect(core.isActive()).toBe(true)
    })

    it('returns false when not running', () => {
      expect(core.isActive()).toBe(false)
    })

    it('returns false after terminate', async () => {
      injectMockNative(core)
      await core.terminate()
      expect(core.isActive()).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // cleanup()
  // -----------------------------------------------------------------------

  describe('cleanup', () => {
    it('resets all internal state and emits terminated', () => {
      injectMockNative(core)
      const spy = vi.fn()
      core.on('terminated', spy)

      // Call cleanup directly (bound to core)
      const cleanup = (internals(core).cleanup as () => void).bind(core)
      cleanup()

      expect(core.isActive()).toBe(false)
      expect(spy).toHaveBeenCalledOnce()
    })

    it('attempts SRAM save and native destroy even if they throw', () => {
      const { mockNative } = injectMockNative(core)
      mockNative.getMemoryData.mockImplementation(() => { throw new Error('memory error') })
      mockNative.destroy.mockImplementation(() => { throw new Error('destroy error') })

      // cleanup should swallow these errors
      const cleanup = (internals(core).cleanup as () => void).bind(core)
      expect(() => { cleanup() }).not.toThrow()

      expect(core.isActive()).toBe(false)
    })
  })
})
